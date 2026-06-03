import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  createSheetTabIfMissing, setCarteraSheet,
  SHEET_HEADERS, type CarteraSheetName,
} from '@/lib/sheets-cartera'

const SHEETS: CarteraSheetName[] = ['GC_Listas', 'GC_ClienteMeta', 'GC_Notas', 'GC_Recordatorios']

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = (session.user as { role?: string })?.role
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Solo el Administrador puede ejecutar el setup' }, { status: 403 })
  }

  const results: Record<string, string> = {}

  for (const name of SHEETS) {
    try {
      const created = await createSheetTabIfMissing(name)
      if (created) {
        // Write headers to freshly created tab
        await setCarteraSheet(name, [SHEET_HEADERS[name]])
        results[name] = 'creada ✓'
      } else {
        results[name] = 'ya existía'
      }
    } catch (e) {
      results[name] = `error: ${String(e)}`
    }
  }

  return NextResponse.json({ ok: true, results })
}
