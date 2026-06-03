import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, getAllowedSections } from '@/lib/permissions'
import { SECTION_ROUTES } from '@/lib/permissions-config'

export default async function RootPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  const allowed = getAllowedSections(role, perms)
  const first = allowed[0]
  redirect(first ? SECTION_ROUTES[first] : '/login')
}
