import { getSheetData, rowsToObjects, normalizeVentasColumns, getSpreadsheetModifiedTime } from '@/lib/sheets'
import { parseFecha } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas')))

    // Fecha de INFORMACIÓN: última transacción registrada en las ventas.
    let maxTs = 0
    let mDia = 0, mMes = 0, mYear = 0
    rows.forEach(r => {
      const f = parseFecha(r['FECHA'])
      if (!f) return
      const ts = f.year * 10000 + (f.mes + 1) * 100 + f.dia
      if (ts > maxTs) { maxTs = ts; mDia = f.dia; mMes = f.mes; mYear = f.year }
    })

    if (maxTs === 0) {
      return Response.json({ ok: false, error: 'Sin datos' })
    }

    const fecha = new Date(mYear, mMes, mDia)
    const label = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    const iso = `${mYear}-${String(mMes + 1).padStart(2, '0')}-${String(mDia).padStart(2, '0')}`

    // Fecha de ACTUALIZACIÓN: cuándo se cargó el sheet por última vez (Drive).
    // Es distinta de la fecha de información — se muestran ambas.
    let actualizadoLabel: string | null = null
    const mod = await getSpreadsheetModifiedTime()
    if (mod) {
      actualizadoLabel = new Date(mod).toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    }

    return Response.json({
      ok: true,
      fecha: label,               // compat: label de la fecha de información
      fechaInfoISO: iso,          // YYYY-MM-DD para topar el filtro
      actualizadoLabel,           // "19 jul 2026, 8:32 a. m." o null
      raw: `${mDia}/${mMes + 1}/${mYear}`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
