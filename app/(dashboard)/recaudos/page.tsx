import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects } from '@/lib/sheets'
import { filtrarVentas, filtroLabel } from '@/lib/filtro-ventas'
import { normalizeRecibos, buildNitVendedorMap } from '@/lib/recaudos'
import RecaudosInteractivo from './RecaudosInteractivo'

export const dynamic = 'force-dynamic'

export default async function RecaudosPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'recaudos', perms)) redirect('/resumen')

  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }

  type Row = Record<string, string>
  let recibosRaw: Row[] = []
  let cartera: Row[] = []
  try { recibosRaw = rowsToObjects(await getSheetData('RAW_Recibos')) } catch { /* hoja no existe */ }
  try { cartera    = rowsToObjects(await getSheetData('RAW_Cartera')) } catch { /* hoja no existe */ }

  const nitVendedorMap = buildNitVendedorMap(cartera)
  const recibosConVendedor = normalizeRecibos(recibosRaw).map(r => ({
    ...r,
    Vendedor: nitVendedorMap[(r['NIT'] ?? '').trim()] ?? '',
  }))

  const recibosFiltrados = filtrarVentas(recibosConVendedor, filtroParams)
  const periodoLabel = filtroLabel(filtroParams, recibosFiltrados[0]?.['FECHA'])

  const vendedores = Array.from(new Set(
    recibosConVendedor.map(r => r['Vendedor']).filter(Boolean)
  )).sort()

  return (
    <div className="fade-in-up">
      <RecaudosInteractivo
        recibos={recibosFiltrados}
        recibosTodos={recibosConVendedor}
        cartera={cartera}
        vendedores={vendedores}
        periodoLabel={periodoLabel}
      />
    </div>
  )
}
