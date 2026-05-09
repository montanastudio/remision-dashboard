import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de variables de entorno — NO expone valores sensibles.
 * Solo verifica que estén presentes y con el formato correcto.
 */
export async function GET() {
  const key = process.env.GOOGLE_PRIVATE_KEY ?? ''
  const keyProcessed = key.replace(/\\n/g, '\n')

  const diagnosis = {
    GOOGLE_SHEETS_ID: {
      present: !!process.env.GOOGLE_SHEETS_ID,
      length:  (process.env.GOOGLE_SHEETS_ID ?? '').length,
    },
    GOOGLE_SERVICE_ACCOUNT_EMAIL: {
      present: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // solo muestra el dominio, no el email completo
      domain:  (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '').split('@')[1] ?? '—',
    },
    GOOGLE_PRIVATE_KEY: {
      present:         !!key,
      rawLength:       key.length,
      startsCorrect:   key.startsWith('-----BEGIN') || key.startsWith('"-----BEGIN'),
      hasQuotePrefix:  key.startsWith('"'),
      hasLiteralNL:    key.includes('\\n'),
      hasRealNL:       key.includes('\n'),
      processedLength: keyProcessed.length,
      firstChars:      key.slice(0, 30).replace(/\n/g, '<NL>').replace(/\r/g, '<CR>'),
    },
    NEXTAUTH_SECRET: {
      present: !!process.env.NEXTAUTH_SECRET,
      length:  (process.env.NEXTAUTH_SECRET ?? '').length,
    },
    NEXTAUTH_URL: {
      present: !!process.env.NEXTAUTH_URL,
      value:   process.env.NEXTAUTH_URL ?? '—',
    },
  }

  // Intentar conexión real a Google Sheets
  let sheetsTest: { ok: boolean; error?: string; rows?: number } = { ok: false }
  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: keyProcessed,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
      range: 'LS_Usuarios',
    })
    sheetsTest = { ok: true, rows: (res.data.values ?? []).length }
  } catch (e) {
    sheetsTest = { ok: false, error: String(e).slice(0, 300) }
  }

  return NextResponse.json({ diagnosis, sheetsTest })
}
