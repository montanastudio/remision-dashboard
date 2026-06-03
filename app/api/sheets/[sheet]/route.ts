import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSheetData, rowsToObjects, SheetName } from '@/lib/sheets'

const VALID_SHEETS: SheetName[] = [
  'RAW_Ventas_Excel',
  'RAW_Cartera',
  'RAW_Inventario',
  'RAW_Sin_Rotar',
  'RES_Cartera_Buckets',
  'RES_Cartera_Mora',
  'RES_Inventario_Linea',
]

export async function GET(
  _req: NextRequest,
  { params }: { params: { sheet: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sheet = params.sheet as SheetName
  if (!VALID_SHEETS.includes(sheet)) {
    return NextResponse.json({ error: 'Invalid sheet' }, { status: 400 })
  }

  try {
    const rows = await getSheetData(sheet)
    const data = rowsToObjects(rows)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('Sheets error:', err)
    return NextResponse.json({ error: 'Failed to fetch sheet' }, { status: 500 })
  }
}
