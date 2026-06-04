import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Lee directo de Sheets, SIN caché en memoria
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets   = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
      range: 'RAW_Ventas_Excel',
    })
    const rows = (response.data.values ?? []) as string[][]
    const headers  = rows[0] ?? []
    const dataRows = rows.slice(1)
    const total    = dataRows.length

    // Últimas 5 filas reales del sheet
    const ultimas = dataRows.slice(-5).map(r => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
      return obj
    })

    // Columna de fecha (busca variantes)
    const colFecha = headers.find(h =>
      h.toLowerCase().includes('fecha') || h === 'FECHA'
    ) ?? '(no encontrada)'

    return NextResponse.json({
      totalFilas:   total,
      columnaFecha: colFecha,
      ultimasFilas: ultimas,
      primeraFila:  (() => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = dataRows[0]?.[i] ?? '' })
        return obj
      })(),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
