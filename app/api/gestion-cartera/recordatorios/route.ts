import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import {
  getCarteraSheet, appendCarteraRow, updateCarteraRow,
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

export async function GET(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const nit = req.nextUrl.searchParams.get('nit')
  const rows = await getCarteraSheet('GC_Recordatorios')
  const recordatorios = rowsToObjects(rows)
  const filtered = nit ? recordatorios.filter((r) => r['NIT'] === nit) : recordatorios
  filtered.sort((a, b) => a['FechaRecordar'].localeCompare(b['FechaRecordar']))
  return NextResponse.json({ recordatorios: filtered })
}

export async function POST(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nit, fechaRecordar, descripcion } = await req.json()
  if (!nit || !fechaRecordar || !descripcion?.trim()) {
    return NextResponse.json({ error: 'NIT, fecha y descripción requeridos' }, { status: 400 })
  }

  await appendCarteraRow('GC_Recordatorios', [
    genId(),
    nit,
    fechaRecordar,
    descripcion.trim(),
    user.name ?? '',
    todayISO(),
    'NO',
    '',
  ])

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, completado } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const rows = await getCarteraSheet('GC_Recordatorios')
  if (rows.length < 2) return NextResponse.json({ error: 'Sin datos' }, { status: 404 })

  const header = rows[0]
  const idIdx = header.indexOf('ID')
  const dataRows = rows.slice(1)
  const matchIdx = dataRows.findIndex((r) => r[idIdx] === id)
  if (matchIdx === -1) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const row = [...dataRows[matchIdx]]
  const completadoIdx = header.indexOf('Completado')
  const fechaCompIdx  = header.indexOf('FechaCompletado')
  row[completadoIdx] = completado ? 'SI' : 'NO'
  row[fechaCompIdx]  = completado ? todayISO() : ''

  await updateCarteraRow('GC_Recordatorios', matchIdx + 2, row)
  return NextResponse.json({ ok: true })
}
