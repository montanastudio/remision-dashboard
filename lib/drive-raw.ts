/**
 * Descubrimiento y lectura de los archivos crudos del ERP en la carpeta de Drive.
 *
 * La carpeta recibe un juego nuevo de archivos cada día, con la fecha del corte
 * en el nombre (VTA0903, CAR0903, …, formato MMDD). El dashboard nunca conoce
 * IDs de archivo: resuelve cada categoría por prefijo y se queda con el corte
 * más reciente. Subir los archivos del día es todo lo que hace falta — no hay
 * que tocar variables de entorno ni redesplegar.
 */
import { google } from 'googleapis'
import { parseDbf } from './dbf'
import * as XLSX from 'xlsx'

export type RawCategoria =
  | 'ventas' | 'cartera' | 'recaudo' | 'movimiento' | 'kardex' | 'inventario'

/** Prefijo del nombre de archivo por categoría. */
const PREFIJO: Record<RawCategoria, string> = {
  ventas:     'VTA',
  cartera:    'CAR',
  recaudo:    'REC',
  movimiento: 'MOV',
  kardex:     'KARD',
  inventario: 'INV',
}

// Los prefijos se prueban de más largo a más corto para que uno que sea
// prefijo de otro no se robe los archivos del otro.
const CATEGORIAS = (Object.keys(PREFIJO) as RawCategoria[])
  .sort((a, b) => PREFIJO[b].length - PREFIJO[a].length)

export interface ArchivoRaw {
  categoria: RawCategoria
  id: string
  nombre: string
  /** Fecha del corte, leída del sufijo MMDD del nombre. */
  corte: Date
  modifiedTime: string
  /**
   * El ERP exporta .DBF y también .XLSX; a veces suben la conversión a Google
   * Sheets. Los tres se leen igual de bien, no hay que convertir nada.
   */
  formato: Formato
}

export class DriveRawError extends Error {}

function folderId(): string {
  const id = process.env.GOOGLE_DRIVE_RAW_FOLDER_ID
  if (!id) {
    throw new DriveRawError(
      'GOOGLE_DRIVE_RAW_FOLDER_ID no está configurada. En Vercel: Settings → ' +
      'Environment Variables → agrega el ID de la carpeta de Drive con los archivos raw.'
    )
  }
  return id
}

const MIME_SHEET = 'application/vnd.google-apps.spreadsheet'

export type Formato = 'sheet' | 'dbf' | 'excel'

/**
 * Preferencia cuando varios archivos comparten el mismo corte (gana el mayor).
 *
 * Los archivos originales del ERP van antes que la conversión a Google Sheets,
 * porque esa conversión es lo que rompe la Ñ ("MARIÑO" → "MARIÐO") y reescribe
 * las fechas en MM/DD. Si alguien sube las dos versiones del mismo día, se usa
 * la buena; el Sheets sigue sirviendo como respaldo si es lo único que hay.
 */
const PRIORIDAD: Record<Formato, number> = { dbf: 2, excel: 2, sheet: 1 }

/**
 * Deduce el formato. Se mira la extensión antes que el mimeType porque Drive
 * reporta los .DBF como application/octet-stream, sin distinguirlos de nada más.
 */
function formatoDe(nombre: string, mimeType: string): Formato {
  if (mimeType === MIME_SHEET) return 'sheet'
  if (/\.dbf$/i.test(nombre)) return 'dbf'
  return 'excel'   // .xlsx, .xls, .csv — todo lo lee SheetJS
}

function auth(scope: 'drive' | 'sheets') {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [scope === 'drive'
      ? 'https://www.googleapis.com/auth/drive.readonly'
      : 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

/* ─────────────────────── resolución de archivos ─────────────────────── */

/**
 * Normaliza el nombre para tolerar variaciones de quien sube los archivos:
 * minúsculas, espacios, guiones bajos y el "Copia de" que agrega Drive.
 */
function normalizarNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(/^COPIA DE\s+/, '')
    .replace(/^COPY OF\s+/, '')
    .replace(/[\s_-]/g, '')
    .trim()
}

/**
 * Extrae la fecha del corte del sufijo MMDD.
 *
 * El nombre no lleva año. Se asume el año en curso, salvo que eso deje la fecha
 * más de 45 días en el futuro — ahí es un archivo de diciembre leído en enero.
 */
export function parseCorte(nombre: string, prefijo: string, hoy = new Date()): Date | null {
  const resto = normalizarNombre(nombre).slice(prefijo.length)
  const m = resto.match(/^(\d{2})(\d{2})/)
  if (!m) return null
  const mes = +m[1], dia = +m[2]
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

  let fecha = new Date(hoy.getFullYear(), mes - 1, dia)
  if (fecha.getTime() - hoy.getTime() > 45 * 86_400_000) {
    fecha = new Date(hoy.getFullYear() - 1, mes - 1, dia)
  }
  return fecha
}

const RESOLVE_TTL = 5 * 60_000
let _resolucion: { data: Map<RawCategoria, ArchivoRaw>, ts: number } | null = null

/** Lista la carpeta y elige el archivo más reciente de cada categoría. */
export async function resolverArchivos(force = false): Promise<Map<RawCategoria, ArchivoRaw>> {
  const now = Date.now()
  if (!force && _resolucion && now - _resolucion.ts < RESOLVE_TTL) return _resolucion.data

  const drive = google.drive({ version: 'v3', auth: auth('drive') })
  const archivos: { id: string, name: string, modifiedTime: string, mimeType: string }[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      // Sin filtro de tipo: el ERP sube .DBF (que Drive reporta como
      // application/octet-stream) y a veces convivo con su conversión a Sheets.
      q: `'${folderId()}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, modifiedTime, mimeType)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    })
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) {
        archivos.push({
          id: f.id, name: f.name,
          modifiedTime: f.modifiedTime ?? '',
          mimeType: f.mimeType ?? '',
        })
      }
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  const hoy = new Date()
  const mejor = new Map<RawCategoria, ArchivoRaw>()

  for (const f of archivos) {
    const norm = normalizarNombre(f.name)
    const categoria = CATEGORIAS.find(c => norm.startsWith(PREFIJO[c]))
    if (!categoria) continue
    const corte = parseCorte(f.name, PREFIJO[categoria], hoy)
    if (!corte) continue

    const cand: ArchivoRaw = {
      categoria, id: f.id, nombre: f.name, corte,
      modifiedTime: f.modifiedTime,
      formato: formatoDe(f.name, f.mimeType),
    }
    if (!mejor.has(categoria) || esMejor(cand, mejor.get(categoria)!)) {
      mejor.set(categoria, cand)
    }
  }

  _resolucion = { data: mejor, ts: now }
  return mejor
}

/**
 * Manda la fecha del nombre —así, abrir y editar un archivo viejo no hace que el
 * dashboard retroceda a ese corte—, luego el formato y por último modifiedTime.
 */
export function esMejor(cand: ArchivoRaw, actual: ArchivoRaw): boolean {
  if (cand.corte.getTime() !== actual.corte.getTime()) return cand.corte > actual.corte
  const pc = PRIORIDAD[cand.formato], pa = PRIORIDAD[actual.formato]
  if (pc !== pa) return pc > pa
  return cand.modifiedTime > actual.modifiedTime
}

export async function archivoDe(categoria: RawCategoria): Promise<ArchivoRaw> {
  const mapa = await resolverArchivos()
  const archivo = mapa.get(categoria)
  if (!archivo) {
    throw new DriveRawError(
      `No hay ningún archivo "${PREFIJO[categoria]}*" en la carpeta de Drive. ` +
      `Verifica que el archivo de ${categoria} del día se haya subido y que la ` +
      `carpeta esté compartida con ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}.`
    )
  }
  return archivo
}

/* ──────────────────────────── lectura ──────────────────────────── */

// Los archivos de un corte no cambian, así que el nombre de su pestaña se puede
// cachear por ID mientras viva el proceso.
const _pestanas = new Map<string, string>()

async function pestanaDe(fileId: string): Promise<string> {
  const cached = _pestanas.get(fileId)
  if (cached) return cached
  const sheets = google.sheets({ version: 'v4', auth: auth('sheets') })
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: fileId,
    fields: 'sheets.properties.title',
  })
  const titulo = meta.data.sheets?.[0]?.properties?.title
  if (!titulo) throw new DriveRawError(`El archivo ${fileId} no tiene ninguna pestaña.`)
  // Entre comillas: sin ellas, un nombre como "VTA0903" se interpreta como la
  // referencia A1 de la celda VTA903 y la API responde "exceeds grid limits".
  const rango = `'${titulo.replace(/'/g, "''")}'`
  _pestanas.set(fileId, rango)
  return rango
}

const LECTURA_TTL = 30_000
const _lecturas = new Map<string, { data: string[][], ts: number }>()

/** Filas crudas (con encabezados del ERP) del corte vigente de una categoría. */
export async function leerRaw(categoria: RawCategoria): Promise<{ filas: string[][], archivo: ArchivoRaw }> {
  const archivo = await archivoDe(categoria)
  const hit = _lecturas.get(archivo.id)
  if (hit && Date.now() - hit.ts < LECTURA_TTL) return { filas: hit.data, archivo }

  const filas =
    archivo.formato === 'sheet' ? await leerSheet(archivo.id) :
    archivo.formato === 'dbf'   ? parseDbf(await descargar(archivo.id)) :
                                  leerExcel(await descargar(archivo.id))

  _lecturas.set(archivo.id, { data: filas, ts: Date.now() })
  return { filas, archivo }
}

async function leerSheet(fileId: string): Promise<string[][]> {
  const sheets = google.sheets({ version: 'v4', auth: auth('sheets') })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range: await pestanaDe(fileId),
  })
  return (res.data.values ?? []) as string[][]
}

async function descargar(fileId: string): Promise<Buffer> {
  const drive = google.drive({ version: 'v3', auth: auth('drive') })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

/**
 * Lee la primera hoja de un .xlsx/.xls/.csv y la devuelve como matriz de texto,
 * igual que las otras dos rutas.
 *
 * Las celdas con formato de fecha llegan como Date y se escriben en DD/MM/YYYY;
 * las que Excel dejó como texto pasan tal cual y las resuelve después
 * detectarOrdenFecha(). Los números se pasan a texto sin notación científica,
 * que es lo que esperan parseNum y los adaptadores.
 */
export function leerExcel(buf: Buffer): string[][] {
  const libro = XLSX.read(buf, { type: 'buffer', cellDates: true, cellText: false })
  const nombre = libro.SheetNames[0]
  if (!nombre) throw new DriveRawError('El archivo de Excel no tiene ninguna hoja.')

  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], {
    header: 1, raw: true, blankrows: false, defval: '',
  })

  return filas.map(fila => fila.map(celda => {
    if (celda === null || celda === undefined) return ''
    if (celda instanceof Date) {
      // Getters LOCALES a propósito: SheetJS arma la fecha de modo que sus
      // componentes locales sean los de la celda. Con getUTC* el resultado
      // dependería del huso del servidor y restaría un día en husos al este
      // de Greenwich.
      const p = (n: number) => String(n).padStart(2, '0')
      return `${p(celda.getDate())}/${p(celda.getMonth() + 1)}/${celda.getFullYear()}`
    }
    if (typeof celda === 'number') return String(celda)
    return String(celda).trim()
  }))
}

export function limpiarCacheRaw() {
  _resolucion = null
  _lecturas.clear()
  _pestanas.clear()
}

/**
 * Momento en que se subió el corte más reciente (ISO UTC), o null si la carpeta
 * no responde. Reemplaza al modifiedTime del spreadsheet único.
 */
export async function ultimaCargaRaw(): Promise<string | null> {
  try {
    const mapa = await resolverArchivos()
    const tiempos: string[] = []
    mapa.forEach(a => { if (a.modifiedTime) tiempos.push(a.modifiedTime) })
    if (!tiempos.length) return null
    return tiempos.sort()[tiempos.length - 1]
  } catch {
    return null
  }
}
