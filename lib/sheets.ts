import { google } from 'googleapis'
export { parseFecha } from './fecha'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!

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
  | 'LS_VENTAS'
  | 'LS_Ventas'
  | 'LS_Cartera_Vendedor'
  | 'LS_Cartera_Vendedor_Resumen'
  | 'LS_Inventario'
  | 'LS_Sin_Rotar'
  | 'LS_Movimientos'
  | 'LS_Vendidos_Cliente'
  | 'LS_Vendidos_Vendedor'
  | 'LS_Vendedores_Resumen'
  | 'LS_VENTAS_ZONA'
  | 'LS_VENTAS_ZONA_RESUMEN'
  | 'LS_ZONAS'
  | 'LS_Usuarios'
  | 'LS_Permisos'
  | 'LS METAS Y PROYECCION'
  | 'LS_METAS_VENDEDORES'
  | 'LS_METAS_VENDEDOR'
  | 'LS_MINIMOS'

export async function getSheetData(sheetName: SheetName): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  })

  return (response.data.values ?? []) as string[][]
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

export async function setSheetData(sheetName: SheetName, values: string[][]): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
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
 * Parse a date in DD/MM/YY or DD/MM/YYYY format.
 * Returns { mes: 0-11, year: YYYY } or null if invalid.
 */
