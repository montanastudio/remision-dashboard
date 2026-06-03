import { getSheetData, rowsToObjects, normalizeVentasColumns } from '@/lib/sheets'
import { parseFecha } from '@/lib/sheets'

export async function GET() {
  try {
    const rows = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas_Excel')))

    let maxTs = 0
    let maxFechaStr = ''

    rows.forEach(r => {
      const raw = r['FECHA'] ?? ''
      const f   = parseFecha(raw)
      if (!f) return
      // Construir timestamp comparable
      const ts = f.year * 10000 + (f.mes + 1) * 100 + parseInt(raw.split('/')[0] ?? '0')
      if (ts > maxTs) { maxTs = ts; maxFechaStr = raw }
    })

    if (!maxFechaStr) {
      return Response.json({ ok: false, error: 'Sin datos' })
    }

    // Formatear la fecha para display: DD/MM/YY → "9 de mayo de 2026"
    const parts = maxFechaStr.split('/')
    const dia   = parseInt(parts[0])
    const mes   = parseInt(parts[1]) - 1
    const año   = parseInt(parts[2]) + (parts[2].length === 2 ? 2000 : 0)
    const fecha = new Date(año, mes, dia)
    const label = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

    return Response.json({ ok: true, fecha: label, raw: maxFechaStr })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
