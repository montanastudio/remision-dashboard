import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import {
  getCarteraSheet, appendCarteraRow,
  rowsToObjects, genId, todayISO, nowTime,
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
  const rows = await getCarteraSheet('GC_Notas')
  const notas = rowsToObjects(rows)
  const filtered = nit ? notas.filter((n) => n['NIT'] === nit) : notas
  // Newest first
  filtered.sort((a, b) => {
    const ka = `${a['Fecha']}${a['Hora']}`
    const kb = `${b['Fecha']}${b['Hora']}`
    return kb.localeCompare(ka)
  })
  return NextResponse.json({ notas: filtered })
}

export async function POST(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nit, texto, tipo, monto } = await req.json()
  if (!nit || !texto?.trim()) {
    return NextResponse.json({ error: 'NIT y texto requeridos' }, { status: 400 })
  }

  const tiposValidos = ['llamada', 'mensaje', 'visita', 'nota', 'abono']
  const tipoFinal = tiposValidos.includes(tipo) ? tipo : 'nota'
  const montoFinal = tipoFinal === 'abono' && monto ? String(Number(monto)) : ''

  await appendCarteraRow('GC_Notas', [
    genId(),
    nit,
    todayISO(),
    nowTime(),
    user.name ?? '',
    texto.trim(),
    tipoFinal,
    montoFinal,
  ])

  return NextResponse.json({ ok: true })
}
