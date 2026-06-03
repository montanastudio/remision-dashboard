import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import {
  getCarteraSheet, upsertCarteraRow,
  rowsToObjects as rowsToObjectsCartera, todayISO,
} from '@/lib/sheets-cartera'

// Normalizar nombres de bucket del sheet → nombres canónicos
const BUCKET_LEGACY_API: Record<string, string> = {
  'No Vencida': 'No vencida',       'No vencida': 'No vencida',
  '1-30 días':  '1-30 días',        '1-30d': '1-30 días',
  '31-45 días': 'Próximo a vencer', 'Próxima a Vencer': 'Próximo a vencer', 'Próximo a vencer': 'Próximo a vencer', '31-60 días': 'Próximo a vencer',
  '46-60 días': 'Vencida',          'Vencida': 'Vencida',
  '61-75 días': 'Mora',             'Mora': 'Mora', '61-90 días': 'Mora',
  '76-90 días': 'Prejurídico',      'Prejudicial': 'Prejurídico', 'Prejurídico': 'Prejurídico',
  '91+ días':   'Jurídico',         '+90 días': 'Jurídico', 'Jurídica': 'Jurídico', 'Jurídico': 'Jurídico',
}
function normalizeBucketAPI(raw: string): string {
  return BUCKET_LEGACY_API[raw] ?? raw
}

const BUCKET_ORDER: Record<string, number> = {
  'Jurídico': 6, 'Prejurídico': 5, 'Mora': 4, 'Vencida': 3, 'Próximo a vencer': 2, '1-30 días': 1, 'No vencida': 0,
}

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
  const carteraRows = rowsToObjects(await getSheetData('RAW_Cartera'))

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
    const bucket   = normalizeBucketAPI(row['Bucket'] ?? '')
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
  const allVendedores = [...new Set(
    baseClientes.flatMap(c => Array.from(c._vendedores))
  )].sort()

  // 2. Gestión meta
  const metaRows = rowsToObjectsCartera(await getCarteraSheet('GC_ClienteMeta'))
  const metaMap: Record<string, Record<string, string>> = {}
  for (const r of metaRows) { if (r['NIT']) metaMap[r['NIT']] = r }

  // 3. Pending reminders count per client
  const reminderRows = rowsToObjectsCartera(await getCarteraSheet('GC_Recordatorios'))
  const today = todayISO()
  const reminderCount: Record<string, number> = {}
  for (const r of reminderRows) {
    if (r['Completado'] === 'SI') continue
    if (r['FechaRecordar'] <= today && r['NIT']) {
      reminderCount[r['NIT']] = (reminderCount[r['NIT']] ?? 0) + 1
    }
  }

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
    recordatoriosPendientes: reminderCount[c.nit] ?? 0,
  }))

  return NextResponse.json({ clientes, vendedores: allVendedores })
}

export async function PATCH(req: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nit, listaId, contactado } = await req.json()
  if (!nit) return NextResponse.json({ error: 'NIT requerido' }, { status: 400 })

  // Read current meta to preserve fields not being updated
  const metaRows = rowsToObjectsCartera(await getCarteraSheet('GC_ClienteMeta'))
  const current = metaRows.find((r) => r['NIT'] === nit) ?? {}

  const today = todayISO()
  const values = [
    nit,
    listaId !== undefined ? listaId : (current['ListaID'] ?? ''),
    contactado ? today : (current['ContactadoFecha'] ?? ''),
    user.name ?? '',
    today,
  ]

  await upsertCarteraRow('GC_ClienteMeta', 'NIT', nit, values)
  return NextResponse.json({ ok: true })
}
