import { NextResponse } from 'next/server'
import { getSheetData } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const raw = await getSheetData('LS_VENTAS')
    const headers = raw[0] ?? []
    const sample  = raw.slice(1, 4) // 3 filas de muestra

    return NextResponse.json({
      totalRows: raw.length - 1,
      headers,
      sample,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
