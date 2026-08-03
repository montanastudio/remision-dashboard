import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getFeriaProductos } from '@/lib/feria'
import FeriaBuscador from './FeriaBuscador'

export const dynamic = 'force-dynamic'

export default async function FeriaPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'feria', perms)) redirect('/resumen')

  const productos = await getFeriaProductos()

  return (
    <div className="fade-in-up">
      <FeriaBuscador productos={productos} />
    </div>
  )
}
