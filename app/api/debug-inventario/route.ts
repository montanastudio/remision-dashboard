import { NextResponse } from 'next/server'
import { getSheetData } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

async function probe(name: Parameters<typeof getSheetData>[0]) {
  try {
    const rows = await getSheetData(name)
    return {
      ok: true,
      totalRows: rows.length - 1,
      headers: rows[0] ?? [],
      sample: rows.slice(1, 3),
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function GET() {
  const [inv, sr, res] = await Promise.all([
    probe('RAW_Inventario'),
    probe('RAW_Sin_Rotar'),
    probe('RES_Inventario_Linea'),
  ])
  return NextResponse.json({ RAW_Inventario: inv, RAW_Sin_Rotar: sr, RES_Inventario_Linea: res })
}
