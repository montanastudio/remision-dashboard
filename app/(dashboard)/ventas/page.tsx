import { getSheetData, rowsToObjects, normalizeVentasColumns, parseNum } from '@/lib/sheets'
import { filtrarVentas, filtroLabel } from '@/lib/filtro-ventas'
import { fmt, fmtN } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import Card from '@/components/Card'
import BarRows from '@/components/BarRows'
import DataTable from '@/components/DataTable'
import VentasCharts from './VentasCharts'

export const dynamic = 'force-dynamic'

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }
  const periodoLabel = filtroLabel(filtroParams)

  type Row = Record<string, string>
  let rawVentas: Row[] = []

  try {
    rawVentas = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas')))
  } catch {
    // empty
  }

  const ventas = filtrarVentas(rawVentas, filtroParams)

  const totalVr = ventas.reduce((s, r) => s + parseNum(r['VRTOTAL']), 0)
  const totalQ  = ventas.reduce((s, r) => s + parseNum(r['CANTIDAD']), 0)
  const refs    = Array.from(new Set(ventas.map(v => v['REFERENCIA']).filter(Boolean)))
  const avgPrice = totalQ > 0 ? totalVr / totalQ : 0

  // Grupos (antes Marcas) desde NGRUPO
  const grupoMap: Record<string, number> = {}
  ventas.forEach(r => {
    const grupo = r['NGRUPO']?.trim() || 'Sin grupo'
    grupoMap[grupo] = (grupoMap[grupo] ?? 0) + parseNum(r['VRTOTAL'])
  })
  const marcas: [string, number][] = Object.entries(grupoMap).sort((a, b) => b[1] - a[1])

  // Top referencias (unidades)
  const refMap: Record<string, { value: number; quantity: number; modelo: string }> = {}
  ventas.forEach(r => {
    const ref = r['REFERENCIA']?.trim()
    if (!ref) return
    const modelo = r['PRODUCTO']?.trim() || ''
    if (!refMap[ref]) refMap[ref] = { value: 0, quantity: 0, modelo }
    refMap[ref].value    += parseNum(r['VRTOTAL'])
    refMap[ref].quantity += parseNum(r['CANTIDAD'])
    if (!refMap[ref].modelo && modelo) refMap[ref].modelo = modelo
  })
  const topRefs = Object.entries(refMap)
    .sort((a, b) => b[1].quantity - a[1].quantity)
    .slice(0, 10)
  const maxRef   = topRefs[0]?.[1].quantity ?? 1
  const barRefs  = topRefs.map(([ref, d]) => ({
    label:    d.modelo || ref,
    sublabel: d.modelo ? ref : undefined,
    value:    `${fmtN(d.quantity)} und`,
    pct:      (d.quantity / maxRef) * 100,
    color:    'var(--brand-blue)',
  }))

  // Tabla de detalle: construir filas con los campos clave
  const tablaDetalle = ventas.map(r => ({
    'Referencia': r['REFERENCIA'] ?? '',
    'Producto':   r['PRODUCTO']   ?? '',
    'Grupo':      r['NGRUPO']     ?? '',
    'Cliente':    r['NCLIENTE']   ?? '',
    'Vendedor':   r['NVENDEDOR']  ?? '',
    'Fecha':      r['FECHA']      ?? '',
    'Cantidad':   r['CANTIDAD']   ?? '',
    'Vr. Total':  r['VRTOTAL']    ?? '',
  }))

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Métricas de ventas
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total Ventas" value={fmt(totalVr)} sub="Período completo" variant="good" />
        <MetricCard label="Unidades Totales" value={fmtN(totalQ)} sub="Referencias despachadas" />
        <MetricCard label="Referencias Únicas" value={String(refs.length)} sub="Distintas referencias vendidas" />
        <MetricCard label="Precio Promedio" value={fmt(avgPrice)} sub="Por unidad" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Ventas por Grupo">
          <VentasCharts marcas={marcas} />
        </Card>
        <Card title="Top 10 Referencias" subtitle="unidades">
          <div className="overflow-y-auto max-h-[220px]">
            <BarRows items={barRefs} />
          </div>
        </Card>
      </div>

      <Card title="Detalle de Ventas" subtitle={periodoLabel}>
        <DataTable
          data={tablaDetalle}
          columns={[
            { key: 'Referencia',  header: 'Referencia', mono: true },
            { key: 'Producto',    header: 'Producto', render: r => (
              <span className="block max-w-[200px] truncate text-[var(--text)]">{String(r['Producto'] ?? '')}</span>
            )},
            { key: 'Grupo',   header: 'Grupo' },
            { key: 'Cliente', header: 'Cliente', render: r => (
              <span className="block max-w-[160px] truncate">{String(r['Cliente'] ?? '')}</span>
            )},
            { key: 'Vendedor', header: 'Vendedor', render: r => (
              <span className="block max-w-[130px] truncate">{String(r['Vendedor'] ?? '')}</span>
            )},
            { key: 'Fecha',    header: 'Fecha',    mono: true },
            { key: 'Cantidad', header: 'Cant.', align: 'right', mono: true,
              render: r => fmtN(parseNum(String(r['Cantidad']))) },
            { key: 'Vr. Total', header: 'Vr. Total', align: 'right', mono: true,
              render: r => <span className="text-[#22c55e]">{fmt(parseNum(String(r['Vr. Total'])))}</span> },
          ]}
        />
      </Card>
    </div>
  )
}
