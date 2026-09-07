import { NextResponse } from 'next/server'
import { resolverArchivos } from '@/lib/drive-raw'
import { getSheetData } from '@/lib/sheets'

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
    // Carpeta de Drive con los archivos crudos del día. Sin esta variable, las
    // hojas RAW_* vuelven a salir del spreadsheet — y ahí RAW_Cartera está
    // vacía, así que cartera aparece en cero sin ningún error visible.
    GOOGLE_DRIVE_RAW_FOLDER_ID: {
      present: !!process.env.GOOGLE_DRIVE_RAW_FOLDER_ID,
      length:  (process.env.GOOGLE_DRIVE_RAW_FOLDER_ID ?? '').length,
    },
    GOOGLE_SHEETS_ID_CONFIG: {
      present: !!process.env.GOOGLE_SHEETS_ID_CONFIG,
      length:  (process.env.GOOGLE_SHEETS_ID_CONFIG ?? '').length,
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

  // ── De dónde están saliendo realmente los datos ──────────────────────
  let fuenteDatos: Record<string, unknown> = { usandoCarpeta: false }
  if (process.env.GOOGLE_DRIVE_RAW_FOLDER_ID) {
    try {
      const mapa = await resolverArchivos(true)
      const archivos: Record<string, string> = {}
      mapa.forEach(a => {
        archivos[a.categoria] = `${a.nombre} · ${a.formato} · corte ${a.corte.toISOString().slice(0, 10)}`
      })
      fuenteDatos = { usandoCarpeta: true, archivos, encontrados: Object.keys(archivos).length }
    } catch (e) {
      fuenteDatos = { usandoCarpeta: true, error: String(e).slice(0, 300) }
    }
  }

  // Conteos reales, que es lo que delata una hoja vacía
  const conteos: Record<string, string> = {}
  for (const hoja of ['RAW_Cartera', 'RAW_Ventas', 'RAW_Recibos'] as const) {
    try {
      const filas = await getSheetData(hoja)
      conteos[hoja] = `${Math.max(filas.length - 1, 0)} filas`
    } catch (e) {
      conteos[hoja] = 'ERROR: ' + String(e).slice(0, 200)
    }
  }

  return NextResponse.json({ diagnosis, sheetsTest, fuenteDatos, conteos })
}
