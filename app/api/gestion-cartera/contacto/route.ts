import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getCarteraSheet, appendCarteraRow, updateCarteraRow, todayISO } from '@/lib/sheets-cartera'

// GC_ClienteMeta columns (0-based):
// 0=NIT, 1=ListaID, 2=ContactadoFecha, 3=GestionadoPor, 4=UltimaActualizacion
// 5=Telefono, 6=Email, 7=Persona [extended]

async function authCheck() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string; name?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) return null
  return session.user as { name?: string; role?: string }
}

export async function GET(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const nit = req.nextUrl.searchParams.get('nit')
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  const rows = await getCarteraSheet('GC_ClienteMeta')
  const found = rows.find((r) => r[0] === nit)

  return NextResponse.json({
    nit,
    telefono:  found?.[5] ?? '',
    email:     found?.[6] ?? '',
    persona:   found?.[7] ?? '',
  })
}

export async function PUT(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nit, telefono, email, persona } = await req.json()
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  const rows = await getCarteraSheet('GC_ClienteMeta')

  if (rows.length === 0) {
    // Empty sheet — write header then data
    await appendCarteraRow('GC_ClienteMeta', ['NIT', 'ListaID', 'ContactadoFecha', 'GestionadoPor', 'UltimaActualizacion', 'Telefono', 'Email', 'Persona'])
    await appendCarteraRow('GC_ClienteMeta', [nit, '', '', '', todayISO(), telefono ?? '', email ?? '', persona ?? ''])
    return NextResponse.json({ ok: true })
  }

  const dataRows = rows.slice(1) // skip header
  const matchIdx = dataRows.findIndex((r) => r[0] === nit)

  const today = todayISO()

  if (matchIdx === -1) {
    // New NIT — append row preserving existing structure
    await appendCarteraRow('GC_ClienteMeta', [nit, '', '', '', today, telefono ?? '', email ?? '', persona ?? ''])
  } else {
    const existing = dataRows[matchIdx]
    const values = [
      nit,
      existing[1] ?? '',   // ListaID
      existing[2] ?? '',   // ContactadoFecha
      existing[3] ?? '',   // GestionadoPor
      today,               // UltimaActualizacion
      telefono ?? existing[5] ?? '',
      email    ?? existing[6] ?? '',
      persona  ?? existing[7] ?? '',
    ]
    await updateCarteraRow('GC_ClienteMeta', matchIdx + 2, values)
  }

  return NextResponse.json({ ok: true })
}
