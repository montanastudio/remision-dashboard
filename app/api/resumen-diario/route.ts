import { NextRequest, NextResponse } from 'next/server'
import { getSheetData, rowsToObjects, normalizeVentasColumns } from '@/lib/sheets'
import { normalizeRecibos } from '@/lib/recaudos'
import { sendTelegram } from '@/lib/telegram'
import { resumenDiaTexto, resumenMesTexto } from '@/lib/resumen-diario'

export const dynamic = 'force-dynamic'

type Row = Record<string, string>

/**
 * Reporte diario a Telegram: 2 mensajes — resumen del día anterior y del mes
 * hasta la fecha. Lo dispara un cron cada mañana (después de que el sheet se
 * actualiza). Protegido con ?token=CRON_SECRET. Usa ?dry=1 para ver el texto
 * sin enviar.
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

  // "Hoy" en hora de Colombia (UTC-5, sin horario de verano) para no cruzar de
  // día si el cron corre cerca de medianoche en un servidor UTC.
  const co = new Date(Date.now() - 5 * 60 * 60 * 1000)
  const ayer = new Date(co.getUTCFullYear(), co.getUTCMonth(), co.getUTCDate() - 1)

  const text1 = resumenDiaTexto(ventas, recibos, ayer)
  const text2 = resumenMesTexto(ventas, recibos, cartera, ayer.getFullYear(), ayer.getMonth(), ayer.getDate())

  if (dry) return NextResponse.json({ text1, text2 })

  const r1 = await sendTelegram(text1)
  const r2 = await sendTelegram(text2)
  const ok = r1.ok && r2.ok
  return NextResponse.json({ ok, errors: [r1.error, r2.error].filter(Boolean) }, { status: ok ? 200 : 500 })
}
