import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, getAllowedSections } from '@/lib/permissions'
import LayoutShell from '@/components/LayoutShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = (session.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  const allowedSections = getAllowedSections(role, perms)

  return <LayoutShell allowedSections={allowedSections}>{children}</LayoutShell>
}
