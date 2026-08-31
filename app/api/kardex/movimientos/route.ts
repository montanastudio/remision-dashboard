import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects } from '@/lib/sheets'
import { movimientosDe, periodoDesdeParams } from '@/lib/kardex'

export const dynamic = 'force-dynamic'

/**
 * Movimientos de un producto × bodega dentro del período del filtro global.
 * Alimenta el pop-up de detalle del análisis de kardex: al hacer clic en las
 * entradas o salidas de un producto se listan los movimientos que las forman.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'inventario', perms)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams
  const codigo = (q.get('codigo') ?? '').trim()
  const bodega = (q.get('bodega') ?? '').trim()
  if (!codigo) return NextResponse.json({ error: 'Código requerido' }, { status: 400 })

  try {
    const rows = rowsToObjects(await getSheetData('RAW_Kardex'))
    const periodo = periodoDesdeParams(
      {
        filtro: q.get('filtro') ?? undefined,
        m: q.get('m') ?? undefined,
        y: q.get('y') ?? undefined,
        desde: q.get('desde') ?? undefined,
        hasta: q.get('hasta') ?? undefined,
      },
      rows
    )
    const movimientos = movimientosDe(rows, codigo, bodega, periodo)
    return NextResponse.json({ movimientos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
