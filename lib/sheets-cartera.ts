import { google } from 'googleapis'
import { hoyBogota, horaBogota } from './hoy-bogota'

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID_CARTERA
  if (!id) {
    throw new Error(
      'GOOGLE_SHEETS_ID_CARTERA no está configurada en el servidor. ' +
      'En Vercel: Settings → Environment Variables → agrega GOOGLE_SHEETS_ID_CARTERA y vuelve a desplegar.'
    )
  }
  return id
}

// Traduce errores de la API de Google a mensajes accionables para el usuario
export function carteraErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('Unable to parse range')) {
    return 'Falta una hoja GC_* en el spreadsheet de cartera. Entra como Administrador y usa "Ejecutar setup de hojas" en Gestión Cartera.'
  }
  if (msg.includes('PERMISSION_DENIED') || msg.includes('does not have permission') || msg.includes('caller does not have permission')) {
    return 'La cuenta de servicio no tiene acceso al spreadsheet de cartera. Compártelo como Editor con el email de la cuenta de servicio.'
  }
  if (msg.includes('Requested entity was not found')) {
    return 'No se encontró el spreadsheet de cartera. Verifica el valor de GOOGLE_SHEETS_ID_CARTERA.'
  }
  return msg
}

export type CarteraSheetName = 'GC_Listas' | 'GC_ClienteMeta' | 'GC_Notas' | 'GC_Recordatorios'

export const SHEET_HEADERS: Record<CarteraSheetName, string[]> = {
  GC_Listas:        ['ID', 'Nombre', 'Color', 'Orden', 'CreadoPor', 'FechaCreacion'],
  GC_ClienteMeta:   ['NIT', 'ListaID', 'ContactadoFecha', 'GestionadoPor', 'UltimaActualizacion'],
  GC_Notas:         ['ID', 'NIT', 'Fecha', 'Hora', 'Usuario', 'Texto', 'Tipo', 'Monto'],
  GC_Recordatorios: ['ID', 'NIT', 'FechaRecordar', 'Descripcion', 'CreadoPor', 'FechaCreacion', 'Completado', 'FechaCompletado'],
}

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

export async function getCarteraSheet(sheetName: CarteraSheetName): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: sheetName,
  })
  return (response.data.values ?? []) as string[][]
}

export async function appendCarteraRow(sheetName: CarteraSheetName, values: string[]): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

// rowIndex is 1-based (row 1 = header, row 2 = first data row)
export async function updateCarteraRow(
  sheetName: CarteraSheetName,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
  const endCol = String.fromCharCode(64 + Math.max(values.length, 1))
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${sheetName}!A${rowIndex}:${endCol}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

// Full rewrite — used for deletes / reorders
export async function setCarteraSheet(sheetName: CarteraSheetName, values: string[][]): Promise<void> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: sheetName,
  })
  if (values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
  }
}

// Creates a sheet tab if it doesn't exist. Returns true if created, false if already existed.
export async function createSheetTabIfMissing(sheetName: CarteraSheetName): Promise<boolean> {
  const auth = getAuth(true)
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: 'sheets.properties.title',
  })
  const existing = (meta.data.sheets ?? []).map((s) => s.properties?.title)
  if (existing.includes(sheetName)) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  return true
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return []
  const [headers, ...data] = rows
  return data.map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
}

// Upsert a row identified by a key field (e.g. NIT). Returns rowIndex written.
export async function upsertCarteraRow(
  sheetName: CarteraSheetName,
  keyField: string,
  keyValue: string,
  values: string[]
): Promise<void> {
  const rows = await getCarteraSheet(sheetName)
  if (rows.length === 0) {
    // Sheet is empty — write header then data
    await appendCarteraRow(sheetName, SHEET_HEADERS[sheetName])
    await appendCarteraRow(sheetName, values)
    return
  }
  const headers = rows[0]
  const keyIdx = headers.indexOf(keyField)
  if (keyIdx === -1) {
    await appendCarteraRow(sheetName, values)
    return
  }
  const dataRows = rows.slice(1)
  const matchIdx = dataRows.findIndex((r) => r[keyIdx] === keyValue)
  if (matchIdx === -1) {
    await appendCarteraRow(sheetName, values)
  } else {
    // +2: +1 for 1-based, +1 to skip header row
    await updateCarteraRow(sheetName, matchIdx + 2, values)
  }
}

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Zona horaria de Colombia — ver lib/hoy-bogota.ts
export function todayISO(): string {
  return hoyBogota()
}

export function nowTime(): string {
  return horaBogota()
}
