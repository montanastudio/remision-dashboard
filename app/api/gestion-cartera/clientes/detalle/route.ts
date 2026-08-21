import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { normalizeCarteraRows, BUCKETS_CANONICOS } from '@/lib/cartera-normalize'

function n(v: string | undefined) { return parseNum(v ?? '') }

function agingVacio(): Record<string, number> {
  return Object.fromEntries(BUCKETS_CANONICOS.map((b) => [b, 0]))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const nit = req.nextUrl.searchParams.get('nit')
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  const rows = normalizeCarteraRows(rowsToObjects(await getSheetData('RAW_Cartera')))
  const rawFilas = rows.filter((r) => r['NIT']?.trim() === nit)

  if (rawFilas.length === 0) return NextResponse.json({ nit, totalFacturas: 0, totalAdeudado: 0, aging: agingVacio(), lugares: [], facturas: [] })

  // Aggregate totals. RAW_Cartera ya no trae columnas de aging por rango: cada
  // factura cae en un solo bucket, así que el aging se acumula desde ahí.
  let totalAdeudado = 0
  const aging = agingVacio()

  // Group by Cliente name (sucursal/lugar)
  const lugarMap: Record<string, { totalAdeudado: number; facturas: number }> = {}

  const facturas = rawFilas.map((r) => {
    const total  = n(r['Total Adeudado ($)'])
    const bucket = r['Bucket']?.trim() ?? ''
    const lugar  = r['Cliente']?.trim() ?? ''

    totalAdeudado += total
    if (bucket in aging) aging[bucket] += total

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
      diasVencido:     n(r['Días Vencido']),
      bucket,
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
