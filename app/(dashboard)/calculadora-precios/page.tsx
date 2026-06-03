import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import CalculadoraPrecios from './CalculadoraPrecios'

export const dynamic = 'force-dynamic'

export default async function CalculadoraPreciosPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'calculadora_precios', perms)) redirect('/resumen')

  return (
    <div className="fade-in-up">
      <CalculadoraPrecios />
    </div>
  )
}
