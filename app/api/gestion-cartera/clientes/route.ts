import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import {
  getCarteraSheet, upsertCarteraRow,
  rowsToObjects as rowsToObjectsCartera, todayISO, carteraErrorMessage,
} from '@/lib/sheets-cartera'
import { normalizeCarteraRows, BUCKET_ORDER } from '@/lib/cartera-normalize'
import { notasResumen } from '@/lib/notas-resumen'

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

  // 1. Base: cartera data (updated daily)
  const carteraRows = normalizeCarteraRows(rowsToObjects(await getSheetData('RAW_Cartera')))

  const clientMap: Record<string, {
    nit: string; nombre: string; saldo: number
    bucket: string; diasVencido: number
    _vendedores: Set<string>
  }> = {}

  for (const row of carteraRows) {
    const nit = row['NIT']?.trim()
    if (!nit) continue
    const saldo    = parseNum(row['Total Adeudado ($)'])
    const dias     = parseNum(row['Días Vencido'])
    const bucket   = row['Bucket'] ?? ''
    const vendedor = (row['Vendedor'] ?? '').trim()
    if (!clientMap[nit]) {
      clientMap[nit] = { nit, nombre: row['Cliente'] ?? '', saldo: 0, bucket: '', diasVencido: 0, _vendedores: new Set() }
    }
    clientMap[nit].saldo += saldo
    if ((BUCKET_ORDER[bucket] ?? -1) > (BUCKET_ORDER[clientMap[nit].bucket] ?? -1)) {
      clientMap[nit].bucket = bucket
    }
    clientMap[nit].diasVencido = Math.max(clientMap[nit].diasVencido, dias)
    if (vendedor) clientMap[nit]._vendedores.add(vendedor)
  }

  const baseClientes = Object.values(clientMap)
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)

  // Lista global de vendedores únicos para el filtro
  const allVendedores = Array.from(new Set(
    baseClientes.flatMap(c => Array.from(c._vendedores))
  )).sort()

  // 2. Gestión meta
  let metaRows: Record<string, string>[] = []
  let reminderRows: Record<string, string>[] = []
  let notasRows: Record<string, string>[] = []
  try {
    metaRows = rowsToObjectsCartera(await getCarteraSheet('GC_ClienteMeta'))
    // 3. Pending reminders count per client
    reminderRows = rowsToObjectsCartera(await getCarteraSheet('GC_Recordatorios'))
    notasRows = rowsToObjectsCartera(await getCarteraSheet('GC_Notas'))
  } catch (e) {
    return NextResponse.json({ error: carteraErrorMessage(e) }, { status: 500 })
  }
  const metaMap: Record<string, Record<string, string>> = {}
  for (const r of metaRows) { if (r['NIT']) metaMap[r['NIT']] = r }
  const today = todayISO()
  const reminderCount: Record<string, number> = {}
  for (const r of reminderRows) {
    if (r['Completado'] === 'SI') continue
    if (r['FechaRecordar'] <= today && r['NIT']) {
      reminderCount[r['NIT']] = (reminderCount[r['NIT']] ?? 0) + 1
    }
  }

  const notasPorNit = notasResumen(notasRows)

  // 4. Merge
  const clientes = baseClientes.map((c) => ({
    nit:           c.nit,
    nombre:        c.nombre,
    saldo:         c.saldo,
    bucket:        c.bucket,
    diasVencido:   c.diasVencido,
    vendedores:    Array.from(c._vendedores),
    listaId:               metaMap[c.nit]?.['ListaID'] ?? '',
    contactadoHoy:         metaMap[c.nit]?.['ContactadoFecha'] === today,
    contactadoFecha:       metaMap[c.nit]?.['ContactadoFecha'] ?? '',
    contactadoPor:         metaMap[c.nit]?.['GestionadoPor'] ?? '',
    recordatoriosPendientes: reminderCount[c.nit] ?? 0,
    ultimaNota:            notasPorNit[c.nit]?.ultima ?? null,
    notasCount:            notasPorNit[c.nit]?.total ?? 0,
  }))

  return NextResponse.json({ clientes, vendedores: allVendedores })
}

export async function PATCH(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nit, listaId, contactado } = await req.json()
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  try {
    // Read current meta to preserve fields not being updated
    const metaRows = rowsToObjectsCartera(await getCarteraSheet('GC_ClienteMeta'))
    const current = metaRows.find((r) => r['NIT'] === nit) ?? {}

    const today = todayISO()

    // Tres estados distintos: marcar (hoy), desmarcar (limpiar) y no tocar
    // (mover de lista) — antes `false` conservaba la fecha y desmarcar no
    // surtía efecto.
    const contactadoFecha =
      contactado === true  ? today :
      contactado === false ? '' :
      (current['ContactadoFecha'] ?? '')

    // Solo se registra autor si esta llamada cambió algo del cliente
    const values = [
      nit,
      listaId !== undefined ? listaId : (current['ListaID'] ?? ''),
      contactadoFecha,
      user.name ?? '',
      today,
    ]

    await upsertCarteraRow('GC_ClienteMeta', 'NIT', nit, values)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: carteraErrorMessage(e) }, { status: 500 })
  }
}
