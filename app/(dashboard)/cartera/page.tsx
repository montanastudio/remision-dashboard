import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects } from '@/lib/sheets'
import CarteraInteractivo from './CarteraInteractivo'

export const dynamic = 'force-dynamic'

const LEGACY_TO_NAME: Record<string, string> = {
  'No Vencida': 'No vencida',       'No vencida': 'No vencida',
  '1-30 días':  '1-30 días',
  '31-45 días': 'Próximo a vencer', 'Próxima a Vencer': 'Próximo a vencer', 'Próximo a vencer': 'Próximo a vencer', '31-60 días': 'Próximo a vencer',
  '46-60 días': 'Vencida',          'Vencida': 'Vencida',
  '61-75 días': 'Mora',             'Mora': 'Mora', '61-90 días': 'Mora',
  '76-90 días': 'Prejurídico',      'Prejudicial': 'Prejurídico', 'Prejurídico': 'Prejurídico',
  '91+ días':   'Jurídico',         '+90 días': 'Jurídico', 'Jurídica': 'Jurídico', 'Jurídico': 'Jurídico',
}

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

  // Normalizar bucket (legacy → nombres canónicos) y remapear columnas de
  // RAW_Cartera a los nombres que espera CarteraInteractivo (heredados de la
  // hoja anterior): 'Días'→'Días Vencido', 'Fecha Vence'→'Fecha Vencimiento',
  // 'Saldo ($)'→'Total Adeudado ($)', 'Estado'→'En Mora' (SI/NO).
  const carteraNorm: Row[] = cartera.map(r => ({
    ...r,
    Bucket:               LEGACY_TO_NAME[r['Bucket'] ?? ''] ?? r['Bucket'] ?? '',
    'Días Vencido':       r['Días'] ?? r['Días Vencido'] ?? '',
    'Fecha Vencimiento':  r['Fecha Vence'] ?? r['Fecha Vencimiento'] ?? '',
    'Total Adeudado ($)': r['Saldo ($)'] ?? r['Total Adeudado ($)'] ?? '',
    'En Mora':            (r['Estado'] ?? '').toUpperCase().includes('MORA') ? 'SI' : (r['En Mora'] ?? 'NO'),
  }))

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
