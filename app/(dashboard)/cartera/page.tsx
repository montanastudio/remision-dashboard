import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects } from '@/lib/sheets'
import { normalizeCarteraRows } from '@/lib/cartera-normalize'
import CarteraInteractivo from './CarteraInteractivo'

export const dynamic = 'force-dynamic'

export default async function CarteraPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'cartera', perms)) redirect('/resumen')

  type Row = Record<string, string>
  let cartera: Row[] = []
  let recibos: Row[] = []
  try { cartera = rowsToObjects(await getSheetData('RAW_Cartera')) } catch { /* hoja no existe */ }
  try { recibos = rowsToObjects(await getSheetData('RAW_Recibos')) } catch { /* hoja no existe */ }

  const carteraNorm: Row[] = normalizeCarteraRows(cartera)

  // Lista de vendedores únicos para el filtro
  const vendedores = Array.from(new Set(
    carteraNorm.map(r => (r['Vendedor'] ?? '').trim()).filter(Boolean)
  )).sort()

  return (
    <div className="fade-in-up">
      <CarteraInteractivo cartera={carteraNorm} vendedores={vendedores} recibos={recibos} />
    </div>
  )
}
