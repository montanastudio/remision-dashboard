import { google } from 'googleapis'
export { parseFecha } from './fecha'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!

// Simple in-memory cache to avoid hitting Sheets API rate limits.
// TTL: 60 s — stale data per-minute is acceptable for a management dashboard.
const CACHE_TTL = 60_000
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

export type SheetName =
  // Hojas actuales (RAW_ / RES_)
  | 'RAW_Ventas_Excel'
  | 'RAW_Cartera'
  | 'RAW_Inventario'
  | 'RAW_Sin_Rotar'
  | 'RAW_Saldos_Fisicos'
  | 'RES_Cartera_Buckets'
  | 'RES_Cartera_Mora'
  | 'RES_Inventario_Linea'
  // Hojas de resúmenes procesados
  | 'RAW_Ventas'
  | 'RAW_Ventas_2025'
  | 'RAW_Ventas_Excel_Neto'
  | 'RES_Ventas_Mensual'
  | 'RES_Ventas_Mensual_2025'
  | 'RES_Ventas_Anual'
  | 'RES_Excel_Por_Linea'
  | 'RES_Excel_Por_Vendedor'
  // Hojas de configuración (sin cambio)
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
 * El Excel exporta fechas en MM/DD/YYYY (formato US) pero parseFecha espera DD/MM/YYYY.
 * Convierte "05/15/2026" → "15/05/2026".
 */
function convertirFecha(val: string): string {
  const parts = val.trim().split('/')
  if (parts.length !== 3) return val
  const [p0, p1, p2] = parts
  const n0 = parseInt(p0, 10)
  const n1 = parseInt(p1, 10)
  // Si el segundo segmento (día en MM/DD) es > 12, es claramente MM/DD → invertir
  // Si ambos son ≤ 12 también invertimos porque el Excel siempre exporta MM/DD
  if (!isNaN(n0) && !isNaN(n1) && n0 >= 1 && n0 <= 12) {
    return `${p1}/${p0}/${p2}`
  }
  return val
}

/**
 * Normaliza las columnas de RAW_Ventas_Excel al formato interno que usa el código.
 * Permite que todas las páginas usen los mismos nombres de campo (FECHA, VRTOTAL, etc.)
 * independientemente de cómo se llamen las columnas en el Excel fuente.
 */
export function normalizeVentasColumns(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map(r => ({
    FECHA:      convertirFecha(r['Fecha'] ?? r['FECHA'] ?? ''),
    VRTOTAL:    r['Vr. Total ($)'] ?? r['VRTOTAL']      ?? '',
    CANTIDAD:   r['Cantidad']     ?? r['CANTIDAD']      ?? '',
    NVENDEDOR:  r['Vendedor']     ?? r['NVENDEDOR']     ?? '',
    REFERENCIA: r['Referencia']   ?? r['REFERENCIA']    ?? '',
    CODIGO:     r['Codigo']       ?? r['CODIGO']        ?? '',
    PRODUCTO:   r['Producto']     ?? r['PRODUCTO']      ?? '',
    NGRUPO:     r['Grupo/Marca']  ?? r['NGRUPO']        ?? '',
    LINEA:      r['Linea']        ?? r['LINEA']         ?? '',
    IDCLIENTE:  r['NIT']          ?? r['IDCLIENTE']     ?? '',
    NCLIENTE:   r['Cliente']      ?? r['NCLIENTE']      ?? '',
    CIUDAD:     r['Ciudad']       ?? r['CIUDAD']        ?? '',
    COSTO:      r['Costo ($)']    ?? r['COSTO']         ?? '',
    FACTURA:    r['Factura']      ?? r['FACTURA']       ?? '',
  }))
}

/**
 * Parse a date in DD/MM/YY or DD/MM/YYYY format.
 * Returns { mes: 0-11, year: YYYY } or null if invalid.
 */
