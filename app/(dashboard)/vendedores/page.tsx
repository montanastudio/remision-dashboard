import { getSheetData, rowsToObjects, parseNum, parseFecha } from '@/lib/sheets'
import { filtrarVentas } from '@/lib/filtro-ventas'
import { fmt } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import Card from '@/components/Card'
import MetasGauges from './MetasGauges'
import VendedoresInteractivo from './VendedoresInteractivo'

export const dynamic = 'force-dynamic'

// Definición de vendedores con sus colores
const VENDEDORES_OBJETIVO = [
  { label: 'Ventas Directas',       match: ['directa', 'directo', 'ventas directas'],  color: '#1a3a8f' },
  { label: 'Clientes Consignación', match: ['consign'],                                color: '#60a5fa' },
  { label: 'Samuel Gómez',          match: ['samuel', 'gómez', 'gomez'],               color: '#f59e0b' },
  { label: 'Margarita Marchena',    match: ['margarita', 'marchena'],                  color: '#3b82f6' },
  { label: 'Gustavo Giraldo',       match: ['gustavo', 'giraldo'],                     color: '#22c55e' },
  { label: 'Martha López',          match: ['martha', 'marta', 'lópez', 'lopez'],      color: '#a855f7' },
]

function matchVendor(nombre: string, terms: string[]): boolean {
  const n = nombre.toLowerCase()
  return terms.some(t => n.includes(t))
}

export default async function VendedoresPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }

  type Row = Record<string, string>
  let rawVentas: Row[] = []
  let metasRows: Row[] = []

  const mesActualN = new Date().getMonth() + 1 // 1-12

  try {
    const raw = await getSheetData('LS_VENTAS')
    rawVentas = rowsToObjects(raw)
  } catch { /* empty */ }

  const ventas = filtrarVentas(rawVentas, filtroParams)

  try {
    const mt = await getSheetData('LS METAS Y PROYECCION')
    metasRows = rowsToObjects(mt)
  } catch { /* hoja aún no existe */ }

  let metasVendedor: Row[] = []
  try {
    metasVendedor = rowsToObjects(await getSheetData('LS_METAS_VENDEDOR'))
  } catch { /* hoja no existe aún */ }

  // ── Detectar año más reciente en los datos ───────────────────────────
  let maxYear = 0
  ventas.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (f && f.year > maxYear) maxYear = f.year
  })
  const añoActual  = maxYear > 0 ? maxYear : new Date().getFullYear()
  const añoAnterior = añoActual - 1

  // ── Agregación por vendedor (todos los registros = período actual) ────
  const vendMap:   Record<string, { valor: number; und: number; costo: number }> = {}
  // Año anterior: para calcular meta de crecimiento
  let totalAnterior = 0

  // Filas de detalle para la tabla (todos los registros)
  const detalleRows: { Vendedor: string; Factura: string; Fecha: string; Referencia: string; Grupo: string; Producto: string; Cantidad: string; 'Vr. Total': string; Costo: string }[] = []

  ventas.forEach(r => {
    const valor    = parseNum(r['VRTOTAL'])
    const cantidad = parseNum(r['CANTIDAD'])
    const costo    = parseNum(r['COSTO'])
    const vend     = r['NVENDEDOR']?.trim()
    if (!vend) return

    if (!vendMap[vend]) vendMap[vend] = { valor: 0, und: 0, costo: 0 }
    vendMap[vend].valor += valor
    vendMap[vend].und   += cantidad
    vendMap[vend].costo += costo

    detalleRows.push({
      Vendedor:    vend,
      Factura:     r['FACTURA']    ?? '',
      Fecha:       r['FECHA']      ?? '',
      Referencia:  r['REFERENCIA'] ?? '',
      Grupo:       r['NGRUPO']     ?? '',
      Producto:    r['PRODUCTO']   ?? '',
      Cantidad:    String(cantidad),
      'Vr. Total': String(valor),
      Costo:       String(costo),
    })
  })

  // Total año anterior usando TODOS los datos (base para calcular la meta)
  rawVentas.forEach(r => {
    const fecha = parseFecha(r['FECHA'])
    if (fecha && fecha.year === añoAnterior) {
      totalAnterior += parseNum(r['VRTOTAL'])
    }
  })

  // Construir array de vendedores para la tabla de ranking
  const totalActual = Object.values(vendMap).reduce((s, v) => s + v.valor, 0)
  const vds = Object.entries(vendMap)
    .map(([vend, d]) => ({
      Vendedor: vend,
      'Valor ($)': d.valor,
      Unidades: d.und,
      Porcentaje: totalActual > 0 ? d.valor / totalActual : 0,
      Margen: d.valor > 0 ? (d.valor - d.costo) / d.valor : 0,
    }))
    .sort((a, b) => b['Valor ($)'] - a['Valor ($)'])

  const promedio = vds.length ? totalActual / vds.length : 0

  // ── Meta de crecimiento ──────────────────────────────────────────────
  let metaPct = 0.10
  if (metasRows.length > 0) {
    const clavesMeta = ['Crecimiento (%)', 'Meta (%)', 'Crecimiento', 'Meta Crecimiento', 'Growth', 'Porcentaje']
    outer: for (const r of metasRows) {
      for (const k of clavesMeta) {
        if (r[k] !== undefined) {
          const v = parseNum(r[k])
          if (v > 0) { metaPct = v > 1 ? v / 100 : v; break outer }
        }
      }
      for (const k of Object.keys(r)) {
        const v = parseNum(r[k])
        if (v > 0) { metaPct = v > 1 ? v / 100 : v; break outer }
      }
    }
  }

  // Meta anual y YTD
  const total2026   = totalAnterior > 0 ? totalAnterior * (1 + metaPct) : 0
  const metaMensual = total2026 / 12
  const metaYTD     = metaMensual * mesActualN

  const MESES_COLS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  // ── Ventas reales del año actual por vendedor × mes (ignora filtro global) ──
  const actualPorMesMap: Record<string, number[]> = {}
  VENDEDORES_OBJETIVO.forEach(vo => { actualPorMesMap[vo.label] = Array(12).fill(0) })

  rawVentas.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (!f || f.year !== añoActual) return
    const vend = r['NVENDEDOR']?.trim() ?? ''
    if (!vend) return
    const vo = VENDEDORES_OBJETIVO.find(v => matchVendor(vend, v.match))
    if (!vo) return
    actualPorMesMap[vo.label][f.mes] += parseNum(r['VRTOTAL'])
  })

  // ── Metas mensuales por vendedor desde LS_METAS_VENDEDOR ─────────────
  const gaugesData = VENDEDORES_OBJETIVO.map(vo => {
    const metaRow = metasVendedor.find(r => matchVendor(String(r['Vendedor'] ?? ''), vo.match))
    let metaPorMes: number[]

    if (metaRow) {
      metaPorMes = MESES_COLS.map(m => parseNum(metaRow[m] ?? '0'))
    } else {
      // Fallback proporcional si no existe la hoja
      const vendedoresMatch = vds.filter(v => matchVendor(v.Vendedor, vo.match))
      const actualVend = vendedoresMatch.reduce((s, v) => s + v['Valor ($)'], 0)
      const proporcion = totalActual > 0 ? actualVend / totalActual : 1 / VENDEDORES_OBJETIVO.length
      const metaMensualVend = metaYTD > 0 ? (metaYTD / mesActualN) * proporcion : 0
      metaPorMes = Array(12).fill(Math.round(metaMensualVend))
    }

    const metaAnual = metaPorMes.reduce((s, v) => s + v, 0)

    return {
      label:        vo.label,
      color:        vo.color,
      actualPorMes: actualPorMesMap[vo.label],
      metaPorMes,
      metaAnual,
    }
  })

  const rankingData = vds.map((v, i) => ({ ...v, _rank: String(i + 1) }))

  const donutData = vds.slice(0, 7).map((v, i) => ({
    name:     v.Vendedor.split(' ').slice(0, 2).join(' '),
    fullName: v.Vendedor,
    value:    v['Valor ($)'],
    color:    ['#1a3a8f', '#22c55e', '#60a5fa', '#f59e0b', '#ef4444', '#a78bfa', '#f97316'][i % 7],
  }))

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Equipo comercial
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-4">
        <MetricCard label="Vendedores Activos" value={String(vds.length)} sub="Con ventas en el período" />
        <MetricCard label="Promedio por Vendedor" value={fmt(promedio)} sub="Valor bruto promedio" />
      </div>

      {/* ── Metas del mes ── */}
      <Card
        title="Avance vs Meta"
        subtitle={`Metas ${añoActual} · selecciona un mes o YTD`}
        className="mb-4"
      >
        <MetasGauges
          gauges={gaugesData}
          añoActual={añoActual}
          mesActualN={mesActualN}
        />
      </Card>

      <VendedoresInteractivo
        donutData={donutData}
        rankingData={rankingData}
        detalleRows={detalleRows}
      />
    </div>
  )
}
