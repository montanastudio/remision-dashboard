import { google } from 'googleapis'
export { parseFecha } from './fecha'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!

// Simple in-memory cache to avoid hitting Sheets API rate limits.
// TTL: 30 s — stale data per-30s is acceptable for a management dashboard.
const CACHE_TTL = 30_000
const _cache = new Map<string, { data: string[][], ts: number }>()

function getAuth(write = false) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: write
      ? ['https://www.googleapis.com/auth/spreadsheets']
      : ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

/**
 * Fecha/hora en que el Google Sheet fue modificado por última vez (Drive
 * modifiedTime, en ISO UTC). Es la "última actualización de datos" — distinta
 * de la fecha hasta la que hay información (que sale de las transacciones).
 * Devuelve null si la Drive API no está habilitada o falla (degradación limpia).
 */
export async function getSpreadsheetModifiedTime(): Promise<string | null> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
    })
    const drive = google.drive({ version: 'v3', auth })
    const res = await drive.files.get({
      fileId: SPREADSHEET_ID,
      fields: 'modifiedTime',
      supportsAllDrives: true,
    })
    return res.data.modifiedTime ?? null
  } catch {
    return null
  }
}

export type SheetName =
  // Ventas
  | 'RAW_Ventas'
  | 'RAW_Ventas_Neto'
  | 'RAW_Ventas_2025'
  | 'RAW_Ventas_2026'
  | 'RES_Ventas_Mensual'
  | 'RES_Ventas_Mensual_2025'
  | 'RES_Ventas_Mensual_2026'
  | 'RES_Ventas_Anual'
  | 'RES_Vendedores'
  | 'RES_Top_Clientes'
  // Cartera
  | 'RAW_Cartera'
  | 'RAW_Recibos'
  | 'RES_Cartera_Buckets'
  | 'RES_Cartera_Mora'
  | 'RES_Cartera_Vendedor'
  | 'RES_Cartera_Por_Vendedor'
  // Inventario
  | 'RAW_Inventario'
  | 'RAW_Inventario_Stock'
  | 'RAW_Movimientos'
  | 'RAW_Kardex'
  | 'RES_Inventario_Linea'
  | 'RES_Inventario_Bodegas'
  // Hojas de configuración
  | 'LS_Usuarios'
  | 'LS_Permisos'
  | 'LS METAS Y PROYECCION'
  | 'LS_METAS_VENDEDORES'
  | 'LS_METAS_VENDEDOR'
  | 'LS_MINIMOS'
  | 'LS_ZONAS'

export async function getSheetData(sheetName: SheetName): Promise<string[][]> {
  const now = Date.now()
  const hit = _cache.get(sheetName)
  if (hit && now - hit.ts < CACHE_TTL) return hit.data

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  })

  const data = (response.data.values ?? []) as string[][]
  _cache.set(sheetName, { data, ts: now })
  return data
}

/** Limpia el caché completo o una hoja específica. Útil para forzar re-fetch. */
export function clearCache(sheetName?: SheetName) {
  if (sheetName) { _cache.delete(sheetName) } else { _cache.clear() }
}

export async function appendSheetRow(sheetName: SheetName, values: string[]): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

export async function updateSheetRow(
  sheetName: SheetName,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

export async function createTabIfMissing(sheetName: SheetName): Promise<boolean> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  })
  const existing = (meta.data.sheets ?? []).map((s) => s.properties?.title)
  if (existing.includes(sheetName)) return false
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  return true
}

export async function setSheetData(sheetName: SheetName, values: string[][]): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
  await createTabIfMissing(sheetName)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return []
  const [headers, ...data] = rows
  return data.map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? ''
    })
    return obj
  })
}

export function parseNum(val: string | undefined): number {
  if (!val) return 0
  let s = String(val).trim()
  // Colombian format: multiple periods = thousands separators ("4.464.000" → 4464000)
  const periodCount = (s.match(/\./g) ?? []).length
  if (periodCount > 1) s = s.replace(/\./g, '')
  // Remove anything that's not digit, period or minus
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

/**
 * Normaliza las columnas de RAW_Ventas (y variantes RAW_Ventas_Neto/2025/2026) al
 * formato interno que usa el código. Permite que todas las páginas usen los mismos
 * nombres de campo (FECHA, VRTOTAL, etc.) independientemente de cómo se llamen las
 * columnas en la hoja fuente.
 *
 * VRTOTAL usa 'Vr. con IVA ($)': para ventas anteriores al 31/10/2025 es distinto de
 * 'Vr. Neto ($)' (que incluye un 19% adicional); desde esa fecha ambas columnas son
 * idénticas porque ya no se desglosa IVA por línea.
 *
 * Las fechas de estas hojas ya vienen en DD/MM/YYYY (a diferencia de la extinta
 * RAW_Ventas_Excel, que exportaba MM/DD/YYYY) — no requieren conversión.
 */
export function normalizeVentasColumns(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map(r => ({
    FECHA:      r['Fecha']          ?? r['FECHA']      ?? '',
    VRTOTAL:    r['Vr. con IVA ($)'] ?? r['Vr. Total ($)'] ?? r['VRTOTAL'] ?? '',
    CANTIDAD:   r['Cantidad']       ?? r['CANTIDAD']   ?? '',
    NVENDEDOR:  r['Vendedor']       ?? r['NVENDEDOR']  ?? '',
    REFERENCIA: r['Referencia']     ?? r['REFERENCIA'] ?? '',
    CODIGO:     r['Código']         ?? r['Codigo']      ?? r['CODIGO'] ?? '',
    PRODUCTO:   r['Producto']       ?? r['PRODUCTO']   ?? '',
    NGRUPO:     r['Grupo/Marca']    ?? r['NGRUPO']      ?? '',
    LINEA:      r['Línea']          ?? r['Linea']       ?? r['LINEA'] ?? '',
    IDCLIENTE:  r['NIT']            ?? r['IDCLIENTE']   ?? '',
    NCLIENTE:   r['Cliente']        ?? r['NCLIENTE']    ?? '',
    CIUDAD:     r['Ciudad']         ?? r['CIUDAD']      ?? '',
    COSTO:      r['Costo ($)']      ?? r['COSTO']       ?? '',
    FACTURA:    r['Factura']        ?? r['FACTURA']     ?? '',
    DEVOLUCION: r['Devolución']     ?? r['DEVOLUCION']  ?? '',
  }))
}

/**
 * Parse a date in DD/MM/YY or DD/MM/YYYY format.
 * Returns { mes: 0-11, year: YYYY } or null if invalid.
 */
