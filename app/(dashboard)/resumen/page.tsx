import { getSheetData, rowsToObjects, normalizeVentasColumns, parseNum, parseFecha } from '@/lib/sheets'
import { computeSinRotar } from '@/lib/rotacion'
import { filtrarVentas, filtroLabel } from '@/lib/filtro-ventas'
import { fmt, fmtN } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import Card from '@/components/Card'
import BarRows from '@/components/BarRows'
import AlertItem from '@/components/AlertItem'
import DonutChart from '@/components/DonutChart'
import TrendChart from '@/components/TrendChart'

export const dynamic = 'force-dynamic'

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  // Normalizar searchParams (siempre string)
  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }
  const periodoLabel = filtroLabel(filtroParams)
  type Row = Record<string, string>
  let ventas: Row[] = []
  let carteraRes: Row[] = []
  let inventarioStock: Row[] = []
  let movimientos: Row[] = []
  let metasRows: Row[] = []
  let ventasMensual: Row[] = []

  // ── Fetch principal: cada hoja por separado para que un fallo no afecte las demás ──
  try { ventas          = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas'))) } catch { /* no configurado */ }
  try { carteraRes      = rowsToObjects(await getSheetData('RAW_Cartera'))          } catch { /* hoja no existe */ }
  try { inventarioStock = rowsToObjects(await getSheetData('RAW_Inventario_Stock')) } catch { /* hoja no existe */ }
  try { movimientos     = rowsToObjects(await getSheetData('RAW_Movimientos'))      } catch { /* hoja no existe */ }
  try { metasRows       = rowsToObjects(await getSheetData('LS METAS Y PROYECCION')) } catch { /* hoja no existe */ }
  try { ventasMensual   = rowsToObjects(await getSheetData('RES_Ventas_Mensual')) } catch { /* hoja no existe */ }

  const sinRotar = computeSinRotar(movimientos, inventarioStock)

  // ── Mínimo de gastos fijos desde LS_MINIMOS ─────────────────────────
  let minimoMensual: number | undefined = undefined
  try {
    const minRaw = await getSheetData('LS_MINIMOS')
    if (minRaw.length >= 2) {
      const headers = minRaw[0]
      const values  = minRaw[1]
      const idx = headers.findIndex(h => /mensual/i.test(h))
      const raw = idx >= 0 ? values[idx] : values[0]
      const parsed = parseNum(raw)
      if (parsed > 0) minimoMensual = parsed
    }
  } catch { /* hoja no encontrada */ }

  // ── Detectar rango de años (para el gráfico de tendencias, usa todos los datos) ──
  let maxYear = 0
  ventas.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (f && f.year > maxYear) maxYear = f.year
  })
  const añoActual   = maxYear > 0 ? maxYear : new Date().getFullYear()
  const añoAnterior = añoActual - 1

  // ── Aplicar filtro a los datos operacionales ─────────────────────────
  // El gráfico de tendencia usa TODOS los datos (para ver comparación anual).
  // Los MetricCards, rankings y totales usan los datos FILTRADOS.
  const ventasFiltradas = filtrarVentas(ventas, filtroParams)

  // ── Tendencias (gráfico — datos SIN filtrar para mantener contexto anual) ──
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const trendMap: Record<string, { actual: number; anterior: number; actualUnd: number; anteriorUnd: number }> = {}
  MESES.forEach(m => { trendMap[m] = { actual: 0, anterior: 0, actualUnd: 0, anteriorUnd: 0 } })

  // ── Totales y rankings (datos FILTRADOS) ─────────────────────────────
  let totalVentas = 0
  let totalUnd    = 0
  let totalCosto  = 0

  // Rankings — todos los registros del sheet
  const vendMap: Record<string, { valor: number; und: number }> = {}
  const refMap:  Record<string, { value: number; quantity: number; nombre: string; marca: string }> = {}
  const cliMap:  Record<string, { nombre: string; value: number; quantity: number }> = {}

  // Tendencia — todos los datos (sin filtro)
  ventas.forEach(r => {
    const fecha = parseFecha(r['FECHA'])
    if (!fecha) return
    const { mes: mesIdx, year: añoVal } = fecha
    if (mesIdx < 0 || mesIdx > 11) return
    const valor    = parseNum(r['VRTOTAL'])
    const cantidad = parseNum(r['CANTIDAD'])
    const mes = MESES[mesIdx]
    if (añoVal === añoActual) {
      trendMap[mes].actual    += valor
      trendMap[mes].actualUnd += cantidad
    } else if (añoVal === añoAnterior) {
      trendMap[mes].anterior    += valor
      trendMap[mes].anteriorUnd += cantidad
    }
  })

  // ── Poblar anterior desde RES_Ventas_Mensual (datos 2025 no presentes en RAW_Ventas) ──
  const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  ventasMensual.forEach(r => {
    const mesLabel = (r['Mes'] ?? r['MES'] ?? '').toLowerCase().trim()
    // El año puede venir en su propia columna o embebido en el label del mes ("enero 2025")
    const añoEnMes = mesLabel.match(/\b(20\d{2})\b/)?.[1]
    const año = parseInt(r['Año'] ?? r['AÑO'] ?? añoEnMes ?? '0', 10)
    if (año !== añoAnterior) return
    const mesIdx = MESES_ES.findIndex(m => mesLabel.includes(m))
    if (mesIdx < 0 || mesIdx > 11) return
    const mes = MESES[mesIdx]
    // Solo sumar si el loop de ventas.forEach no llenó ya esos valores (para evitar doble conteo)
    if (trendMap[mes].anterior === 0) {
      trendMap[mes].anterior    += parseNum(r['Valor Bruto ($)'] ?? r['VALOR'] ?? r['Vr. Total ($)'] ?? r['Total'] ?? '')
      trendMap[mes].anteriorUnd += parseNum(r['Cantidad'] ?? r['CANTIDAD'] ?? '')
    }
  })

  // Rankings y totales — datos filtrados
  ventasFiltradas.forEach(r => {
    const valor    = parseNum(r['VRTOTAL'])
    const cantidad = parseNum(r['CANTIDAD'])
    const costo    = parseNum(r['COSTO'])

    totalVentas += valor
    totalUnd    += cantidad
    totalCosto  += costo

    // Vendedores
    const vend = r['NVENDEDOR']?.trim()
    if (vend) {
      if (!vendMap[vend]) vendMap[vend] = { valor: 0, und: 0 }
      vendMap[vend].valor += valor
      vendMap[vend].und   += cantidad
    }

    // Referencias
    const ref = r['REFERENCIA']?.trim() || r['CODIGO']?.trim()
    if (ref) {
      if (!refMap[ref]) refMap[ref] = { value: 0, quantity: 0, nombre: r['PRODUCTO']?.trim() || '', marca: r['NGRUPO']?.trim() || '' }
      refMap[ref].value    += valor
      refMap[ref].quantity += cantidad
    }

    // Clientes
    const cliId = r['IDCLIENTE']?.trim() || r['NCLIENTE']?.trim()
    if (cliId) {
      if (!cliMap[cliId]) cliMap[cliId] = { nombre: r['NCLIENTE']?.trim() || cliId, value: 0, quantity: 0 }
      cliMap[cliId].value    += valor
      cliMap[cliId].quantity += cantidad
    }
  })

  // ── Meta de crecimiento ──────────────────────────────────────────────
  let metaPct: number | undefined = undefined
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

  // ── trendData ────────────────────────────────────────────────────────
  const trendData = MESES.map(mes => {
    const ant    = trendMap[mes].anterior    > 0 ? trendMap[mes].anterior    : null
    const antUnd = trendMap[mes].anteriorUnd > 0 ? trendMap[mes].anteriorUnd : null
    const proy    = ant    != null && metaPct != null ? Math.round(ant    * (1 + metaPct)) : null
    const proyUnd = antUnd != null && metaPct != null ? Math.round(antUnd * (1 + metaPct)) : null
    return {
      mes,
      actual:        trendMap[mes].actual    > 0 ? trendMap[mes].actual    : null,
      anterior:      ant,
      actualUnd:     trendMap[mes].actualUnd > 0 ? trendMap[mes].actualUnd : null,
      anteriorUnd:   antUnd,
      proyectado:    proy,
      proyectadoUnd: proyUnd,
    }
  })

  // Resumen anual bajo el gráfico
  const totalActualSum        = trendData.reduce((s, d) => s + (d.actual    ?? 0), 0)
  const totalAnteriorAnual    = trendData.reduce((s, d) => s + (d.anterior  ?? 0), 0)
  const totalActualUndSum     = trendData.reduce((s, d) => s + (d.actualUnd ?? 0), 0)
  const totalAnteriorAnualUnd = trendData.reduce((s, d) => s + (d.anteriorUnd ?? 0), 0)

  const mesesActivos = trendData.filter(d => d.actual != null)
  const mesesLabel   = mesesActivos.length > 0
    ? `${mesesActivos[0].mes}–${mesesActivos[mesesActivos.length - 1].mes}`
    : ''
  const totalAnteriorPeriodo    = mesesActivos.reduce((s, d) => s + (d.anterior    ?? 0), 0)
  const totalAnteriorPeriodoUnd = mesesActivos.reduce((s, d) => s + (d.anteriorUnd ?? 0), 0)
  const pctVentasYTD = totalAnteriorPeriodo    > 0 ? (totalActualSum    - totalAnteriorPeriodo)    / totalAnteriorPeriodo    : null
  const pctUndYTD    = totalAnteriorPeriodoUnd > 0 ? (totalActualUndSum - totalAnteriorPeriodoUnd) / totalAnteriorPeriodoUnd : null

  // ── Vendedores ───────────────────────────────────────────────────────
  const vendedoresSort = Object.entries(vendMap)
    .map(([vend, d]) => ({ Vendedor: vend, valor: d.valor, und: d.und }))
    .sort((a, b) => b.valor - a.valor)
  const topVendedor = vendedoresSort[0]
  const topVendPct  = totalVentas > 0 && topVendedor ? topVendedor.valor / totalVentas : 0
  const maxVend     = topVendedor?.valor ?? 1
  const barVendedores = vendedoresSort.slice(0, 6).map(v => ({
    label:    v.Vendedor,
    subvalue: v.und > 0 ? `${fmtN(v.und)} und` : undefined,
    value:    fmt(v.valor),
    pct:      (v.valor / maxVend) * 100,
    color:    'var(--brand-blue)',
  }))

  // ── Top refs ─────────────────────────────────────────────────────────
  const topRefs = Object.entries(refMap).sort((a, b) => b[1].value - a[1].value).slice(0, 5)
  const maxRef  = topRefs[0]?.[1].value ?? 1
  const barRefs = topRefs.map(([ref, d]) => ({
    label:    d.nombre || ref,
    sublabel: d.nombre ? { marca: d.marca, codigo: ref } : undefined,
    subvalue: `${fmtN(d.quantity)} und`,
    value:    fmt(d.value),
    pct:      (d.value / maxRef) * 100,
    color:    '#16a34a',
  }))

  // ── Top clientes ─────────────────────────────────────────────────────
  const topClientes = Object.values(cliMap).sort((a, b) => b.value - a.value).slice(0, 5)
  const maxCli      = topClientes[0]?.value ?? 1
  const barClientes = topClientes.map(c => ({
    label:    c.nombre,
    subvalue: `${fmtN(c.quantity)} und`,
    value:    fmt(c.value),
    pct:      (c.value / maxCli) * 100,
    color:    '#60a5fa',
  }))

  // ── Margen bruto ─────────────────────────────────────────────────────
  const utilidadBruta  = totalVentas - totalCosto
  const margenPct      = totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0

  // ── Cartera ──────────────────────────────────────────────────────────
  // Normalizar bucket names (legacy → canónico) y agregar desde RAW_Cartera
  const CARTERA_LEGACY: Record<string, string> = {
    'No Vencida': 'No vencida',       'No vencida': 'No vencida',
    '1-30 días':  '1-30 días',        '1-30d': '1-30 días',
    '31-45 días': 'Próximo a vencer', 'Próxima a Vencer': 'Próximo a vencer', 'Próximo a vencer': 'Próximo a vencer', '31-60 días': 'Próximo a vencer',
    '46-60 días': 'Vencida',          'Vencida': 'Vencida',
    '61-75 días': 'Mora',             'Mora': 'Mora', '61-90 días': 'Mora',
    '76-90 días': 'Prejurídico',      'Prejudicial': 'Prejurídico', 'Prejurídico': 'Prejurídico',
    '91+ días':   'Jurídico',         '+90 días': 'Jurídico', 'Jurídica': 'Jurídico', 'Jurídico': 'Jurídico',
  }
  const CARTERA_COLORS: Record<string, string> = {
    'No vencida': '#22c55e', '1-30 días': '#86efac',
    'Próximo a vencer': '#f59e0b', 'Vencida': '#f97316',
    'Mora': '#ea580c', 'Prejurídico': '#ef4444', 'Jurídico': '#b91c1c',
  }
  const CARTERA_LABELS: Record<string, string> = {
    'No vencida': 'No vencida', '1-30 días': '1-30d',
    'Próximo a vencer': '31-45d', 'Vencida': '46-60d',
    'Mora': '61-75d', 'Prejurídico': '76-90d', 'Jurídico': '91+d',
  }
  const BUCKET_ORDER_RES = ['No vencida','1-30 días','Próximo a vencer','Vencida','Mora','Prejurídico','Jurídico']

  const bucketAggRes: Record<string, number> = {}
  carteraRes.forEach(r => {
    const name = CARTERA_LEGACY[r['Bucket'] ?? ''] ?? r['Bucket'] ?? ''
    if (!name) return
    bucketAggRes[name] = (bucketAggRes[name] ?? 0) + parseNum(r['Saldo ($)'])
  })

  const totalCartera   = Object.values(bucketAggRes).reduce((s, v) => s + v, 0)
  const cartera90Total = bucketAggRes['Jurídico'] ?? 0
  const facturasJuridico = carteraRes.filter(r => (CARTERA_LEGACY[r['Bucket'] ?? ''] ?? r['Bucket']) === 'Jurídico').length

  const donutData = BUCKET_ORDER_RES
    .filter(name => bucketAggRes[name] > 0)
    .map(name => ({
      name,
      label: CARTERA_LABELS[name] ?? name,
      value: bucketAggRes[name],
      color: CARTERA_COLORS[name],
    }))

  // ── Inventario sin rotar ─────────────────────────────────────────────
  const criticosSinRotar = sinRotar.filter(r => r['Estado'] === 'CRITICO')
  const valCritico = criticosSinRotar.reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Indicadores clave
      </div>

      {/* Móvil: ventas arriba grande, 4 fichas abajo en 2x2 */}
      {/* Desktop: todas en fila */}
      <div className="mb-4 space-y-3 md:space-y-0 md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-3">
        {/* Ficha grande en móvil */}
        <div className="md:contents">
          <MetricCard label="Total Ventas Período" value={fmt(totalVentas)} sub={`${fmtN(totalUnd)} unidades despachadas`} variant="good" />
        </div>
        {/* 5 fichas secundarias: 2x2+1 en móvil, inline en desktop */}
        <div className="grid grid-cols-2 gap-3 md:contents">
          <MetricCard label="Unidades Vendidas" value={fmtN(totalUnd)} sub="unidades en el período" variant="good" />
          <MetricCard
            label="Vendedor Top"
            value={topVendedor ? topVendedor.Vendedor : '—'}
            sub={topVendedor ? `${fmt(topVendedor.valor)} — ${(topVendPct * 100).toFixed(1)}% del total` : ''}
          />
          <MetricCard
            label="Margen Bruto"
            value={`${margenPct.toFixed(1)}%`}
            sub={`Utilidad: ${fmt(utilidadBruta)}`}
            variant={margenPct >= 30 ? 'good' : margenPct >= 15 ? 'warn' : 'alert'}
          />
          <MetricCard label="Cartera +90 días" value={fmt(cartera90Total)} sub={`${totalCartera > 0 ? ((cartera90Total / totalCartera) * 100).toFixed(1) : 0}% de cartera total`} variant="alert" />
          <MetricCard label="Inventario Sin Rotar" value={fmt(valCritico)} sub={`${criticosSinRotar.length} productos críticos`} variant="warn" />
        </div>
      </div>

      {/* Gráfico de tendencias */}
      <Card title="Tendencia de Ventas" subtitle={`${añoAnterior} vs ${añoActual} · métricas: ${periodoLabel}`} className="mb-4">
        <TrendChart data={trendData} añoActual={añoActual} añoAnterior={añoAnterior} metaPct={metaPct} minimo={minimoMensual} />

        {/* ── Resumen anual ── */}
        <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-2 gap-3">

          {/* Año anterior — completo */}
          <div className="rounded-[10px] bg-[var(--bg)] px-3 py-3 overflow-hidden">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 truncate">
              {añoAnterior} — año completo
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Ventas totales</div>
                <div className="text-[14px] font-bold text-[var(--text)] truncate">{fmt(totalAnteriorAnual)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Unidades</div>
                <div className="text-[13px] font-semibold text-[var(--text)]">{fmtN(totalAnteriorAnualUnd)} und</div>
              </div>
            </div>
          </div>

          {/* Año actual — acumulado */}
          <div className="rounded-[10px] bg-[var(--bg)] px-3 py-3 overflow-hidden">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 truncate">
              {añoActual}{mesesLabel ? ` — ${mesesLabel}` : ''}
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Ventas acumuladas</div>
                <div className="text-[14px] font-bold text-[var(--text)] truncate">{fmt(totalActualSum)}</div>
                {pctVentasYTD != null && (
                  <div className={`text-[10px] font-semibold mt-0.5 ${pctVentasYTD >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                    {pctVentasYTD >= 0 ? '↑' : '↓'} {Math.abs(pctVentasYTD * 100).toFixed(1)}% vs mismo período {añoAnterior}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Unidades</div>
                <div className="text-[13px] font-semibold text-[var(--text)]">{fmtN(totalActualUndSum)} und</div>
                {pctUndYTD != null && (
                  <div className={`text-[10px] font-semibold mt-0.5 ${pctUndYTD >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                    {pctUndYTD >= 0 ? '↑' : '↓'} {Math.abs(pctUndYTD * 100).toFixed(1)}% vs mismo período {añoAnterior}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card title="Alertas Gerenciales" subtitle="indicadores prioritarios">
          <AlertItem type="critical" title="Cartera crítica +90 días" description={`${fmt(cartera90Total)} en mora grave. ${facturasJuridico > 0 ? facturasJuridico : '—'} facturas en este estado.`} />
          <AlertItem type="warn" title="Inventario sin rotación" description={`${fmt(valCritico)} en ${criticosSinRotar.length} SKUs sin movimiento mayor a 90 días.`} />
          <AlertItem type="ok" title="Ventas del período" description={`${fmt(totalVentas)} acumulados con ${fmtN(totalUnd)} unidades despachadas.`} />
        </Card>
        <Card title="Composición de Cartera" subtitle={`Total: ${fmt(totalCartera)}`}>
          <DonutChart data={donutData} />
        </Card>
        <Card title="Ventas por Vendedor" subtitle="período actual">
          {barVendedores.length > 0 ? <BarRows items={barVendedores} /> : <p className="text-[12px] text-[var(--text-muted)]">Sin datos — configura Google Sheets</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Top 5 Referencias" subtitle="por valor bruto">
          {barRefs.length > 0 ? <BarRows items={barRefs} /> : <p className="text-[12px] text-[var(--text-muted)]">Sin datos</p>}
        </Card>
        <Card title="Top 5 Clientes" subtitle="período actual">
          {barClientes.length > 0 ? <BarRows items={barClientes} /> : <p className="text-[12px] text-[var(--text-muted)]">Sin datos</p>}
        </Card>
      </div>
    </div>
  )
}
