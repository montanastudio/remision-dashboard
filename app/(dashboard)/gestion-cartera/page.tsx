import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { getCarteraSheet, rowsToObjects as gcRows, todayISO } from '@/lib/sheets-cartera'
import { normalizeCarteraRows, BUCKET_ORDER } from '@/lib/cartera-normalize'
import GestionCarteraClient from './GestionCarteraClient'

export const dynamic = 'force-dynamic'

export default async function GestionCarteraPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const userName = (session?.user as { name?: string })?.name ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'gestion_cartera', perms)) redirect('/cartera')

  const isSupervision = role === 'Administrador' || role === 'Gerencia'

  // ── Base: cartera actualizada diario ──────────────────────────────
  let carteraRows: Record<string, string>[] = []
  try { carteraRows = normalizeCarteraRows(rowsToObjects(await getSheetData('RAW_Cartera'))) } catch { /* sheet vacío */ }

  const clientMap: Record<string, {
    nit: string; nombre: string; saldo: number; bucket: string; diasVencido: number
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

  const allVendedores = Array.from(new Set(baseClientes.flatMap(c => Array.from(c._vendedores)))).sort()

  // ── Gestión meta ─────────────────────────────────────────────────
  let metaRows: Record<string, string>[] = []
  let listasRows: Record<string, string>[] = []
  let recordatoriosRows: Record<string, string>[] = []

  try { metaRows        = gcRows(await getCarteraSheet('GC_ClienteMeta'))   } catch { /* */ }
  try { listasRows      = gcRows(await getCarteraSheet('GC_Listas'))        } catch { /* */ }
  try { recordatoriosRows = gcRows(await getCarteraSheet('GC_Recordatorios')) } catch { /* */ }

  const metaMap: Record<string, Record<string, string>> = {}
  for (const r of metaRows) { if (r['NIT']) metaMap[r['NIT']] = r }

  const today = todayISO()
  const reminderCount: Record<string, number> = {}
  for (const r of recordatoriosRows) {
    if (r['Completado'] === 'SI') continue
    if (r['FechaRecordar'] <= today && r['NIT']) {
      reminderCount[r['NIT']] = (reminderCount[r['NIT']] ?? 0) + 1
    }
  }

  const clientes = baseClientes.map((c) => ({
    nit:         c.nit,
    nombre:      c.nombre,
    saldo:       c.saldo,
    bucket:      c.bucket,
    diasVencido: c.diasVencido,
    vendedores:  Array.from(c._vendedores),
    listaId:                metaMap[c.nit]?.['ListaID'] ?? '',
    contactadoHoy:          metaMap[c.nit]?.['ContactadoFecha'] === today,
    recordatoriosPendientes: reminderCount[c.nit] ?? 0,
  }))

  const listas = listasRows
    .filter((l) => l['ID'])
    .sort((a, b) => Number(a['Orden']) - Number(b['Orden']))
    .map((l) => ({ ID: l['ID'], Nombre: l['Nombre'], Color: l['Color'], Orden: l['Orden'] }))

  return (
    <GestionCarteraClient
      initialClientes={clientes}
      initialListas={listas}
      initialVendedores={allVendedores}
      isSupervision={isSupervision}
      userName={userName}
      role={role}
    />
  )
}
