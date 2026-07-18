'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/Card'
import MetricCard from '@/components/MetricCard'
import BarRows from '@/components/BarRows'
import FacturaPopup, { FacturaInfo, AbonoInfo } from '@/components/FacturaPopup'
import { exportToExcel } from '@/lib/exportExcel'
import { parseFecha } from '@/lib/fecha'
import { RANGO_DIAS_CONFIG, parseN } from '@/lib/recaudos'

type Row = Record<string, string>
type EnrichedRecibo = Row & { _bucket: string; _monto: number; _dias: number }

function fmt(n: number)  { return '$' + Math.round(n).toLocaleString('es-CO') }
function fmtM(n: number) {
  if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + n.toLocaleString('es-CO')
}
function fmtN(n: number) { return n.toLocaleString('es-CO') }

const CLIENT_COLORS = [
  '#1a3a8f', '#2563eb', '#3b82f6', '#60a5fa', '#818cf8',
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b',
]

const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

interface TooltipEntry { name: string; label?: string; value: number }
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: TooltipEntry }[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const display = p.payload?.label ?? p.name
  return (
    <div className="rounded-[8px] border px-3 py-2 text-[11px] shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}>
      <div className="font-semibold mb-0.5">{display}</div>
      <div>{fmtM(p.value)}</div>
    </div>
  )
}

interface Props {
  recibos: Row[]        // ya filtrados por período (con Vendedor adjunto)
  recibosTodos: Row[]   // sin filtrar — para reconstruir el historial completo de una factura
  cartera: Row[]         // RAW_Cartera crudo, para cruzar info de la factura en el popup
  vendedores: string[]
  periodoLabel: string
}

export default function RecaudosInteractivo({ recibos, recibosTodos, cartera, vendedores, periodoLabel }: Props) {
  const [selectedVendedor, setSelectedVendedor] = useState('')
  const [selectedRango,    setSelectedRango]    = useState<string | null>(null)
  const [selectedClientNIT, setSelectedClientNIT] = useState<string | null>(null)
  const [popupFactura, setPopupFactura] = useState<FacturaInfo | null>(null)
  const [popupAbonos,  setPopupAbonos]  = useState<AbonoInfo[]>([])

  // ── Bucket de cada recibo (la columna de rango con valor > 0) ──────────
  const enriched: EnrichedRecibo[] = useMemo(() => recibos.map(r => {
    const bucket = RANGO_DIAS_CONFIG.find(b => parseN(r[b.key]) > 0)
    return { ...r, _bucket: bucket?.key ?? '', _monto: parseN(r['MONTO']), _dias: parseN(r['Días']) } as EnrichedRecibo
  }), [recibos])

  const activeRecibos = useMemo(() =>
    selectedVendedor ? enriched.filter(r => r['Vendedor'] === selectedVendedor) : enriched,
    [enriched, selectedVendedor]
  )

  // ── KPIs ─────────────────────────────────────────────────────────────
  const { totalRecaudado, nRecibos, promedioRecibo, promedioDias } = useMemo(() => {
    const total = activeRecibos.reduce((s, r) => s + r._monto, 0)
    const n = activeRecibos.length
    const diasPonderados = activeRecibos.reduce((s, r) => s + r._dias * r._monto, 0)
    return {
      totalRecaudado: total,
      nRecibos: n,
      promedioRecibo: n > 0 ? total / n : 0,
      promedioDias: total > 0 ? diasPonderados / total : 0,
    }
  }, [activeRecibos])

  // ── Distribución por rango de días ──────────────────────────────────
  const rangoBars = useMemo(() => {
    const agg: Record<string, number> = {}
    activeRecibos.forEach(r => { if (r._bucket) agg[r._bucket] = (agg[r._bucket] ?? 0) + r._monto })
    const max = Math.max(...Object.values(agg), 1)
    return RANGO_DIAS_CONFIG
      .filter(b => agg[b.key])
      .map(b => ({ key: b.key, label: b.label, color: b.color, raw: agg[b.key], pct: (agg[b.key] / max) * 100 }))
  }, [activeRecibos])
  const rangoDonut = rangoBars.map(b => ({ name: b.key, label: b.label, value: b.raw, color: b.color }))

  const rowsPorRango = selectedRango ? activeRecibos.filter(r => r._bucket === selectedRango) : activeRecibos

  // ── Top clientes que más han pagado ─────────────────────────────────
  const { clientesDonut, clientesList } = useMemo(() => {
    const map: Record<string, { nit: string; nombre: string; value: number }> = {}
    rowsPorRango.forEach(r => {
      const nit = r['NIT'] || 'Sin NIT'
      if (!map[nit]) map[nit] = { nit, nombre: r['Cliente'] || nit, value: 0 }
      map[nit].value += r._monto
    })
    const sorted = Object.values(map).filter(c => c.value > 0).sort((a, b) => b.value - a.value)
    const TOP = 9
    const donut = sorted.length <= TOP
      ? sorted.map((c, i) => ({ name: c.nombre, value: c.value, color: CLIENT_COLORS[i % CLIENT_COLORS.length] }))
      : [
          ...sorted.slice(0, TOP).map((c, i) => ({ name: c.nombre, value: c.value, color: CLIENT_COLORS[i] })),
          { name: 'Otros', value: sorted.slice(TOP).reduce((s, c) => s + c.value, 0), color: '#94a3b8' },
        ]
    return { clientesDonut: donut, clientesList: sorted.slice(0, 8) }
  }, [rowsPorRango])

  // ── Recaudo por mes ──────────────────────────────────────────────────
  const recaudoMensual = useMemo(() => {
    const map: Record<string, number> = {}
    activeRecibos.forEach(r => {
      const f = parseFecha(r['FECHA'])
      if (!f) return
      const key = `${f.year}-${String(f.mes + 1).padStart(2, '0')}`
      map[key] = (map[key] ?? 0) + r._monto
    })
    const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
    const max = Math.max(...entries.map(([, v]) => v), 1)
    return entries.map(([key, valor]) => {
      const [y, m] = key.split('-')
      return {
        label: `${MESES_LABEL[parseInt(m, 10) - 1]} ${y}`,
        value: fmt(valor),
        pct: (valor / max) * 100,
        color: 'var(--brand-blue)',
      }
    })
  }, [activeRecibos])

  // ── Tabla de recibos (respeta vendedor + rango + cliente) ───────────
  const tablaRecibos = useMemo(() => {
    let list = rowsPorRango
    if (selectedClientNIT) list = list.filter(r => r['NIT'] === selectedClientNIT)
    return list.slice().sort((a, b) => (b['FECHA'] ?? '').localeCompare(a['FECHA']))
  }, [rowsPorRango, selectedClientNIT])

  function exportTabla() {
    if (tablaRecibos.length === 0) return
    const rows = tablaRecibos.map(r => ({
      'NIT': r['NIT'] ?? '', 'Cliente': r['Cliente'] ?? '', 'Recibo': r['Recibo'] ?? '',
      'Factura': r['Factura'] ?? '', 'Fecha Pago': r['Fecha Pago'] ?? '',
      'Vendedor': r['Vendedor'] ?? '', 'Monto ($)': r._monto,
    }))
    exportToExcel(rows, `Recaudos_${periodoLabel.replace(/[/\\?%*:|"<>]/g, '-')}`, 'Recaudos')
  }

  // ── Abrir popup de factura desde un recibo ──────────────────────────
  function openFacturaDesdeRecibo(r: EnrichedRecibo) {
    const facturaNum = r['Factura'] ?? ''
    const nit = r['NIT'] ?? ''
    const carteraRow = cartera.find(c => (c['Factura'] ?? '') === facturaNum && (c['NIT'] ?? '') === nit)

    const abonosFactura = recibosTodos
      .filter(x => (x['Factura'] ?? '') === facturaNum && (x['NIT'] ?? '') === nit)
      .map(x => ({ recibo: x['Recibo'] ?? '', fechaPago: x['Fecha Pago'] ?? '', monto: parseN(x['Total Pagado ($)']) }))

    setPopupFactura({
      numero: facturaNum,
      nit,
      cliente: r['Cliente'] ?? carteraRow?.['Cliente'] ?? '',
      vendedor: r['Vendedor'] ?? carteraRow?.['Vendedor'],
      fechaFactura: carteraRow?.['Fecha Factura'],
      fechaVence: carteraRow?.['Fecha Vence'] ?? r['Fecha Vence'],
      dias: carteraRow ? parseN(carteraRow['Días']) : undefined,
      bucket: carteraRow?.['Estado'],
      total: carteraRow ? parseN(carteraRow['Total ($)']) : undefined,
      abonado: carteraRow ? parseN(carteraRow['Abonado ($)']) : undefined,
      saldo: carteraRow ? parseN(carteraRow['Saldo ($)']) : undefined,
    })
    setPopupAbonos(abonosFactura)
  }

  return (
    <>
      {/* Filtro de vendedor */}
      {vendedores.length > 0 && (
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card px-4 py-2.5 mb-4 flex items-center gap-3">
          <span className="text-[11px] font-medium text-[var(--text-muted)] flex-shrink-0">Vendedor</span>
          <select
            value={selectedVendedor}
            onChange={e => { setSelectedVendedor(e.target.value); setSelectedRango(null); setSelectedClientNIT(null) }}
            className="text-[12px] px-2.5 py-[6px] rounded-[7px] border bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-1 transition-all cursor-pointer flex-1 max-w-[260px]"
            style={{ borderColor: 'var(--border)', ['--tw-ring-color' as string]: 'var(--brand-blue)' }}
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {selectedVendedor && (
            <button
              onClick={() => setSelectedVendedor('')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors ml-auto"
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Recaudo del Período" value={fmt(totalRecaudado)} sub={periodoLabel} variant="good" />
        <MetricCard label="Recibos" value={fmtN(nRecibos)} sub="pagos registrados" />
        <MetricCard label="Promedio por Recibo" value={fmt(promedioRecibo)} sub="valor promedio" />
        <MetricCard
          label="Promedio Días de Pago"
          value={`${promedioDias.toFixed(0)} días`}
          sub="ponderado por monto"
          variant={promedioDias <= 15 ? 'good' : promedioDias <= 45 ? 'warn' : 'alert'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Distribución por rango de días */}
        <Card title="Recaudo por Rango de Días" subtitle="¿en qué plazo están pagando?">
          {rangoDonut.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
          ) : (
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-center">
              <div className="w-full md:w-[160px] flex-shrink-0">
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={rangoDonut} cx="50%" cy="50%" innerRadius={46} outerRadius={68}
                        dataKey="value" paddingAngle={2} animationBegin={0} animationDuration={600}
                        onClick={(e) => { const name = e?.name; if (name) setSelectedRango(p => p === name ? null : name) }}
                        style={{ cursor: 'pointer' }}>
                        {rangoDonut.map((e, i) => (
                          <Cell key={i} fill={e.color}
                            opacity={selectedRango && selectedRango !== e.name ? 0.25 : 1}
                            stroke={selectedRango === e.name ? '#fff' : 'none'} strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex-1 w-full space-y-1.5">
                {rangoBars.map((b, i) => (
                  <button key={i} onClick={() => setSelectedRango(p => p === b.key ? null : b.key)}
                    className={`w-full flex items-center gap-2 rounded-[6px] px-2 py-[5px] transition-all text-left ${
                      selectedRango === b.key ? 'bg-[var(--bar-bg)] ring-1 ring-[var(--border)]' : 'hover:bg-[var(--bar-bg)]'
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-[12px] w-[60px] flex-shrink-0 font-semibold num text-[var(--text-sub)]">{b.label}</span>
                    <div className="flex-1 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.color }} />
                    </div>
                    <span className="text-[11px] num text-[var(--text)] w-[86px] text-right flex-shrink-0">{fmt(b.raw)}</span>
                  </button>
                ))}
                {selectedRango && (
                  <button onClick={() => setSelectedRango(null)}
                    className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] mt-1 flex items-center gap-1 px-2">
                    ✕ Limpiar filtro
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Top clientes */}
        <Card title="Clientes que Más Han Pagado" subtitle={selectedRango ? `Rango: ${RANGO_DIAS_CONFIG.find(b => b.key === selectedRango)?.label}` : 'Todos los rangos'}>
          {clientesList.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={clientesDonut} cx="50%" cy="50%" innerRadius={40} outerRadius={60}
                      dataKey="value" paddingAngle={2} animationBegin={0} animationDuration={500}>
                      {clientesDonut.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {clientesList.map((c, i) => (
                  <button key={i}
                    onClick={() => setSelectedClientNIT(p => p === c.nit ? null : c.nit)}
                    className={`w-full flex items-center gap-2 rounded-[6px] px-2 py-[6px] transition-all text-left ${
                      selectedClientNIT === c.nit ? 'bg-[var(--bar-bg)] ring-1 ring-[var(--border)]' : 'hover:bg-[var(--bar-bg)]'
                    }`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CLIENT_COLORS[i % CLIENT_COLORS.length] }} />
                    <span className="text-[11px] text-[var(--text-sub)] truncate flex-1">{c.nombre}</span>
                    <span className="text-[11px] num text-[var(--text)] font-medium flex-shrink-0">{fmtM(c.value)}</span>
                  </button>
                ))}
              </div>
              {selectedClientNIT && (
                <button onClick={() => setSelectedClientNIT(null)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1 px-2">
                  ✕ Limpiar cliente
                </button>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Recaudo mensual */}
      {recaudoMensual.length > 0 && (
        <Card title="Recaudo por Mes" subtitle={periodoLabel} className="mb-4">
          <BarRows items={recaudoMensual} />
        </Card>
      )}

      {/* Tabla de recibos */}
      <Card
        title="Recibos"
        subtitle={`${tablaRecibos.length} pagos — clic en una fila para ver el detalle de la factura`}
        action={
          tablaRecibos.length > 0 && (
            <button
              onClick={exportTabla}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors"
            >
              ↓ Excel
            </button>
          )
        }
      >
        {tablaRecibos.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">No hay recibos para este filtro</div>
        ) : (
          <div className="table-scroll" style={{ maxHeight: 380 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {[
                    { l: 'Cliente',    a: 'left'  },
                    { l: 'Factura',    a: 'left'  },
                    { l: 'Fecha Pago', a: 'left'  },
                    { l: 'Vendedor',   a: 'left'  },
                    { l: 'Monto',      a: 'right' },
                  ].map(h => (
                    <th key={h.l} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-${h.a}`}>
                      {h.l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablaRecibos.map((r, i) => (
                  <tr key={i}
                    onClick={() => openFacturaDesdeRecibo(r)}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors cursor-pointer">
                    <td className="px-[10px] py-[9px]">
                      <span className="font-medium text-[var(--text)] block max-w-[180px] truncate">{r['Cliente']}</span>
                      <span className="text-[10px] text-[var(--text-muted)] num">{r['NIT']}</span>
                    </td>
                    <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r['Factura']}</td>
                    <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r['Fecha Pago']}</td>
                    <td className="px-[10px] py-[9px] text-[11px] text-[var(--text-sub)] truncate max-w-[140px]">{r['Vendedor'] || '—'}</td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      <span className="text-[#22c55e] font-semibold">{fmt(r._monto)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FacturaPopup factura={popupFactura} abonos={popupAbonos} onClose={() => setPopupFactura(null)} />
    </>
  )
}
