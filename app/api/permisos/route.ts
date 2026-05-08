import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, getRoles, invalidateCache, DEFAULT_PERMISSIONS, SECTIONS, LOCKED_ROLES } from '@/lib/permissions'
import { setSheetData } from '@/lib/sheets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const perms = await getPermissions()
  const roles = getRoles(perms)
  return NextResponse.json({ perms, roles })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = (session.user as { role?: string })?.role
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Solo el Administrador puede editar permisos' }, { status: 403 })
  }

  const { perms } = await req.json()

  const roles = getRoles(perms)
  const headers = ['Rol', ...SECTIONS]
  const rows: string[][] = [headers]

  for (const rol of roles) {
    const rp = perms[rol] ?? DEFAULT_PERMISSIONS[rol] ?? {}
    const isLocked = LOCKED_ROLES.includes(rol)
    rows.push([
      rol,
      ...SECTIONS.map((s) => (isLocked ? 'SI' : rp[s] ? 'SI' : 'NO')),
    ])
  }

  await setSheetData('LS_Permisos', rows)
  invalidateCache()

  return NextResponse.json({ ok: true })
}
