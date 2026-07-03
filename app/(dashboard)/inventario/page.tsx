import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { fmt } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import Card from '@/components/Card'
import BarRows from '@/components/BarRows'
import InventarioSinRotar from './InventarioSinRotar'
import InventarioSaldos from './InventarioSaldos'
import TabsInventario from './TabsInventario'

export const dynamic = 'force-dynamic'

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'inventario', perms)) redirect('/resumen')

  const tab = (Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab) ?? 'sin-rotar'

  type Row = Record<string, string>
  let inventario: Row[] = []
  let sinRotar: Row[] = []
  let conStock: Row[] = []

  try { inventario = rowsToObjects(await getSheetData('RAW_Inventario')) } catch (e) { console.error('[Inventario] RAW_Inventario:', e) }
  try { sinRotar   = rowsToObjects(await getSheetData('RAW_Sin_Rotar'))  } catch (e) { console.error('[Inventario] RAW_Sin_Rotar:', e)   }
  try { conStock   = rowsToObjects(await getSheetData('RAW_Inventario_Con_Stock')) } catch (e) { console.error('[Inventario] RAW_Inventario_Con_Stock:', e) }

  // Saldos físicos: usa la hoja nueva con bodegas si existe, si no cae a RAW_Inventario
  const saldosData = conStock.length > 0 ? conStock : inventario

  // ── Sin Rotar ────────────────────────────────────────────────────────
  const totalValor   = inventario.reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valCritico   = sinRotar.filter(r => r['Estado'] === 'CRITICO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valAlto      = sinRotar.filter(r => r['Estado'] === 'ALTO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valMedio     = sinRotar.filter(r => r['Estado'] === 'MEDIO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valSinRotar  = valCritico + valAlto + valMedio
  const valRotacion  = totalValor - valCritico - valAlto - valMedio

  const segments = [
    { name: 'CRÍTICO',     value: valCritico,              color: '#ef4444' },
    { name: 'ALTO',        value: valAlto,                 color: '#f59e0b' },
    { name: 'MEDIO',       value: valMedio,                color: '#3b82f6' },
    { name: 'En rotación', value: Math.max(valRotacion, 0), color: '#22c55e' },
  ].filter(s => s.value > 0)

  const sinRotarSorted = [...sinRotar].sort(
    (a, b) => parseNum(b['Días Sin Rotar']) - parseNum(a['Días Sin Rotar'])
  )

  const lineaMap: Record<string, number> = {}
  inventario.forEach((r) => {
    const linea = r['Línea'] || 'Sin línea'
    lineaMap[linea] = (lineaMap[linea] ?? 0) + parseNum(r['Vr. Existencia ($)'])
  })
  const lineas = Object.entries(lineaMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxLinea = lineas[0]?.[1] ?? 1
  const barLineas = lineas.map(([linea, val]) => ({
    label: linea,
    value: fmt(val),
    pct: (val / maxLinea) * 100,
    color: 'var(--brand-blue)',
  }))

  // ── Saldos — hoja nueva usa 'Valor a Precio Venta ($)', la vieja 'Vr. Existencia ($)' ──
  const totalSaldosValor = conStock.length > 0
    ? conStock.reduce((s, r) => s + parseNum(r['Valor a Precio Venta ($)']), 0)
    : totalValor

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Control de inventario
      </div>

      {/* Tabs */}
      <TabsInventario activeTab={tab} />

      {/* Sin datos — aviso visible */}
      {inventario.length === 0 && sinRotar.length === 0 && (
        <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card px-5 py-6 mb-4 text-center">
          <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Sin datos de inventario</div>
          <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">
            No se encontraron hojas{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--bar-bg)] border border-[var(--border)] text-[11px]">RAW_Inventario</code> ni{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--bar-bg)] border border-[var(--border)] text-[11px]">RAW_Sin_Rotar</code>{' '}
            en el Google Sheet.
          </div>
        </div>
      )}

      {/* ── TAB: Sin Rotar ── */}
      {tab !== 'saldos' && (
        <>
          <div className="mb-4">
            <MetricCard
              label="Valor Total de Inventario Sin Rotar"
              value={fmt(valSinRotar)}
              sub={`${sinRotar.length} SKUs sin rotar`}
            />
          </div>

          <Card title="Productos Sin Rotar" subtitle="selecciona un segmento para ver el detalle" className="mb-4">
            <InventarioSinRotar segments={segments} sinRotar={sinRotarSorted} />
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Inventario por Línea" subtitle="valor en existencia">
              <BarRows items={barLineas} />
            </Card>
          </div>
        </>
      )}

      {/* ── TAB: Saldos Físicos ── */}
      {tab === 'saldos' && (
        <>
          <div className="mb-4">
            <MetricCard
              label="Valor Total Saldos Físicos"
              value={fmt(totalSaldosValor)}
              sub={`${saldosData.length} SKUs en stock`}
            />
          </div>

          <Card title="Saldos Físicos" subtitle="stock actual por referencia">
            <InventarioSaldos saldos={saldosData} sinRotar={sinRotar} />
          </Card>
        </>
      )}
    </div>
  )
}
