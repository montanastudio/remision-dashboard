import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'

function n(v: string | undefined) { return parseNum(v ?? '') }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const nit = req.nextUrl.searchParams.get('nit')
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  const rows = rowsToObjects(await getSheetData('RAW_Cartera'))
  const rawFilas = rows.filter((r) => r['NIT']?.trim() === nit)

  if (rawFilas.length === 0) return NextResponse.json({ nit, totalFacturas: 0, totalAdeudado: 0, aging: {}, lugares: [], facturas: [] })

  // Aggregate totals
  let totalAdeudado = 0
  const aging = { noVencida: 0, dias1_30: 0, dias31_60: 0, dias61_90: 0, diasMas90: 0 }

  // Group by Cliente name (sucursal/lugar)
  const lugarMap: Record<string, { totalAdeudado: number; facturas: number }> = {}

  const facturas = rawFilas.map((r) => {
    const total = n(r['Total Adeudado ($)'])
    const noV   = n(r['No Vencida ($)'])
    const d1    = n(r['Vencida 1-30 ($)'])
    const d31   = n(r['Vencida 31-60 ($)'])
    const d61   = n(r['Vencida 61-90 ($)'])
    const d90   = n(r['Vencida +90 ($)'])
    const lugar = r['Cliente']?.trim() ?? ''

    totalAdeudado    += total
    aging.noVencida  += noV
    aging.dias1_30   += d1
    aging.dias31_60  += d31
    aging.dias61_90  += d61
    aging.diasMas90  += d90

    if (!lugarMap[lugar]) lugarMap[lugar] = { totalAdeudado: 0, facturas: 0 }
    lugarMap[lugar].totalAdeudado += total
    lugarMap[lugar].facturas      += 1

    return {
      numero:          r['Factura']?.trim() ?? '',
      tipo:            r['Tipo']?.trim() ?? '',
      lugar,
      fechaEmision:    r['Fecha Emisión']?.trim() ?? '',
      fechaVencimiento: r['Fecha Vencimiento']?.trim() ?? '',
      valor:           n(r['Vr. Factura ($)']),
      total,
      noVencida:       noV,
      dias1_30:        d1,
      dias31_60:       d31,
      dias61_90:       d61,
      diasMas90:       d90,
      diasVencido:     n(r['Días Vencido']),
      bucket:          r['Bucket']?.trim() ?? '',
      enMora:          r['En Mora']?.trim() === 'SI',
    }
  })

  // Sort facturas: highest owed first
  facturas.sort((a, b) => b.total - a.total)

  const lugares = Object.entries(lugarMap)
    .map(([nombre, data]) => ({ nombre, ...data }))
    .sort((a, b) => b.totalAdeudado - a.totalAdeudado)

  return NextResponse.json({ nit, totalFacturas: rawFilas.length, totalAdeudado, aging, lugares, facturas })
}
