import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import {
  getCarteraSheet, appendCarteraRow, setCarteraSheet,
  rowsToObjects, genId, todayISO,
} from '@/lib/sheets-cartera'

async function authCheck() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string; name?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) return null
  return session.user as { name?: string; role?: string }
}

export async function GET() {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await getCarteraSheet('GC_Listas')
  const listas = rowsToObjects(rows)
  return NextResponse.json({ listas })
}

export async function POST(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nombre, color } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const rows = await getCarteraSheet('GC_Listas')
  const orden = String(rows.length) // rows includes header

  const id = genId()
  const colorFinal = color || '#3b82f6'

  await appendCarteraRow('GC_Listas', [
    id,
    nombre.trim(),
    colorFinal,
    orden,
    user.name ?? '',
    todayISO(),
  ])

  // Devolver la lista creada para que el cliente la use directamente
  return NextResponse.json({
    ok: true,
    lista: { ID: id, Nombre: nombre.trim(), Color: colorFinal, Orden: orden },
  })
}

export async function DELETE(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  // Remove the lista from GC_Listas
  const rows = await getCarteraSheet('GC_Listas')
  if (rows.length > 1) {
    const header = rows[0]
    const data = rows.slice(1).filter((r) => r[0] !== id)
    await setCarteraSheet('GC_Listas', [header, ...data])
  }

  // Clear ListaID for clients that were in this lista
  const metaRows = await getCarteraSheet('GC_ClienteMeta')
  if (metaRows.length > 1) {
    const header = metaRows[0]
    const listaIdx = header.indexOf('ListaID')
    const data = metaRows.slice(1).map((r) => {
      if (r[listaIdx] === id) { const copy = [...r]; copy[listaIdx] = ''; return copy }
      return r
    })
    await setCarteraSheet('GC_ClienteMeta', [header, ...data])
  }

  return NextResponse.json({ ok: true })
}
