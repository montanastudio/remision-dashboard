import { NextResponse } from 'next/server'
import { getSheetData, rowsToObjects } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await getSheetData('RAW_Inventario')
    const headers = rows[0] ?? []
    const objects = rowsToObjects(rows)
    const sample  = objects.slice(0, 3)

    // Qué columnas contienen keywords de bodega
    const bodegaKeys = headers.filter(h => {
      const l = h.toLowerCase()
      return l.includes('cedi') || l.includes('zona') || l.includes('franca') || l.includes('bodega') || l.includes('stock')
    })

    // Valores de bodega en las primeras 5 filas
    const bodegaSample = objects.slice(0, 5).map(r => {
      const out: Record<string, string> = {}
      bodegaKeys.forEach(k => { out[k] = r[k] ?? '' })
      return out
    })

    // Cabeceras completas con índice
    const headersIndexed = headers.map((h, i) => `[${i}] ${h}`)

    return NextResponse.json({
      totalFilas:      rows.length - 1,
      headersIndexed,
      bodegaKeys,
      bodegaSample,
      primeraFila:     sample[0] ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
