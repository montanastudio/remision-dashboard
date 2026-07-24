import { NextRequest, NextResponse } from 'next/server'
import { getSheetData, rowsToObjects, normalizeVentasColumns } from '@/lib/sheets'
import { normalizeRecibos } from '@/lib/recaudos'
import { sendTelegram } from '@/lib/telegram'
import { resumenMesCompletoTexto } from '@/lib/resumen-diario'

export const dynamic = 'force-dynamic'

type Row = Record<string, string>

/**
 * Reporte de cierre de mes a Telegram. Por defecto resume el mes que acaba de
 * terminar (mes anterior a hoy) — se programa el día 1 de cada mes, cuando ya
 * están todos los datos. Acepta ?year=2026&month=7 para regenerar un mes puntual.
 * Protegido con ?token=CRON_SECRET. Usa ?dry=1 para ver el texto sin enviar.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const token = req.nextUrl.searchParams.get('token')
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1'

  let ventas: Row[] = []
  let recibos: Row[] = []
  let cartera: Row[] = []
  try { ventas  = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas'))) } catch { /* vacío */ }
  try { recibos = normalizeRecibos(rowsToObjects(await getSheetData('RAW_Recibos'))) } catch { /* vacío */ }
  try { cartera = rowsToObjects(await getSheetData('RAW_Cartera')) } catch { /* vacío */ }

  // Mes anterior en hora de Colombia
  const co = new Date(Date.now() - 5 * 60 * 60 * 1000)
  let año = co.getUTCFullYear()
  let mes = co.getUTCMonth() - 1
  if (mes < 0) { mes = 11; año -= 1 }

  const qy = req.nextUrl.searchParams.get('year')
  const qm = req.nextUrl.searchParams.get('month')
  if (qy && qm) { año = parseInt(qy, 10); mes = parseInt(qm, 10) - 1 }

  const text = resumenMesCompletoTexto(ventas, recibos, cartera, año, mes)

  if (dry) return NextResponse.json({ text })

  const r = await sendTelegram(text)
  return NextResponse.json({ ok: r.ok, error: r.error }, { status: r.ok ? 200 : 500 })
}
