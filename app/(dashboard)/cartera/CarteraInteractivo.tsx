'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/Card'
import { exportToExcel } from '@/lib/exportExcel'

const CLIENT_COLORS = [
  '#1a3a8f', '#2563eb', '#3b82f6', '#60a5fa', '#818cf8',
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b',
]

const BUCKET_ORDER: Record<string, number> = {
  '+90 días': 4, '61-90 días': 3, '31-60 días': 2, '1-30 días': 1, 'No vencida': 0,
}
const BUCKET_COLOR: Record<string, string> = {
  '+90 días': '#ef4444', '61-90 días': '#ea580c', '31-60 días': '#f97316',
  '1-30 días': '#f59e0b', 'No vencida': '#22c55e',
}
const BUCKET_ORDER_ARR = ['+90 días', '61-90 días', '31-60 días', '1-30 días', 'No vencida']

const BUCKET_BADGE: Record<string, { bg: string; text: string }> = {
  '+90 días':   { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-600 dark:text-red-400' },
  '61-90 días': { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400' },
  '31-60 días': { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-500 dark:text-orange-400' },
  '1-30 días':  { bg: 'bg-yellow-100 dark:bg-yellow-950/60', text: 'text-yellow-600 dark:text-yellow-500' },
  'No vencida': { bg: 'bg-green-100 dark:bg-green-950/60',   text: 'text-green-600 dark:text-green-400' },
}

function fmtM(n: number) {
  if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + n.toLocaleString('es-CO')
}
function fmt(n: number)  { return '$' + Math.round(n).toLocaleString('es-CO') }
function fmtN(n: number) { return n.toLocaleString('es-CO') }
function parseN(v: string | undefined) {
  if (!v) return 0
  const periodCount = (v.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? v.replace(/\./g, '') : v
  return parseFloat(clean.replace(/[^0-9.-]/g, '')) || 0
}

interface BucketBar { label: string; value: string; raw: number; pct: number; color: string }
interface Props {
  donutData:    { name: string; value: number; color: string }[]
  cartera:      Record<string, string>[]
  totalCartera: number
  bucketBars:   BucketBar[]
}

interface TooltipEntry { name: string; value: number; color: string }
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; color: string; payload: TooltipEntry }[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-[8px] border px-3 py-2 text-[11px] shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}>
      <div className="font-semibold mb-0.5">{p.name}</div>
      <div>{fmtM(p.value)}</div>
    </div>
  )
}

export default function CarteraInteractivo({ donutData, cartera, totalCartera, bucketBars }: Props) {
  const [selectedBucket,     setSelectedBucket]     = useState<string | null>(null)
  const [selectedClientNIT,  setSelectedClientNIT]  = useState<string | null>(null)
  const [selectedDetalleName,setSelectedDetalleName] = useState<string | null>(null)
  const [showAllClients,     setShowAllClients]     = useState(false)
  const [clientSearch,       setClientSearch]       = useState('')

  const detalleRef = useRef<HTMLDivElement>(null)

  const toggleBucket = (name: string) =>
    setSelectedBucket((p) => (p === name ? null : name))

  // Seleccionar cliente: expande detalle y hace scroll hacia él
  const selectClient = (nit: string) => {
    setSelectedClientNIT((p) => {
      const next = p === nit ? null : nit
      if (next) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      return next
    })
  }

  // Reset selecciones cuando cambia el bucket
  useEffect(() => { setSelectedClientNIT(null); setSelectedDetalleName(null); setClientSearch('') }, [selectedBucket])
  // Reset nombre al cambiar NIT
  useEffect(() => { setSelectedDetalleName(null) }, [selectedClientNIT])

  // ── Clientes donut + tabla ─────────────────────────────────────────
  const { clientesDonut, clientesList, totalClientes } = useMemo(() => {
    const source = selectedBucket ? cartera.filter((r) => r['Bucket'] === selectedBucket) : cartera

    const map: Record<string, { nit: string; nombre: string; value: number }> = {}
    source.forEach((r) => {
      const nit    = r['NIT'] || r['Cliente'] || 'Sin NIT'
      const nombre = r['Cliente'] || nit
      const val    = parseN(r['Total Adeudado ($)'])
      if (!map[nit]) map[nit] = { nit, nombre, value: 0 }
      map[nit].value += val
    })

    const sorted = Object.values(map)
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value)

    const total = sorted.reduce((s, c) => s + c.value, 0)

    const TOP = 9
    const donut = sorted.length <= TOP
      ? sorted.map((c, i) => ({ name: c.nombre, value: c.value, color: CLIENT_COLORS[i % CLIENT_COLORS.length] }))
      : [
          ...sorted.slice(0, TOP).map((c, i) => ({ name: c.nombre, value: c.value, color: CLIENT_COLORS[i] })),
          { name: 'Otros', value: sorted.slice(TOP).reduce((s, c) => s + c.value, 0), color: '#94a3b8' },
        ]

    const list = sorted.map((c, i) => ({
      nit:   c.nit,
      name:  c.nombre,
      value: c.value,
      color: CLIENT_COLORS[i % CLIENT_COLORS.length] ?? '#94a3b8',
    }))

    return { clientesDonut: donut, clientesList: list, totalClientes: total }
  }, [cartera, selectedBucket])

  const LIST_MAX = 8
  const searchTerm = clientSearch.trim().toLowerCase()
  const searchedClients = searchTerm
    ? clientesList.filter(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.nit.toLowerCase().includes(searchTerm)
      )
    : clientesList
  const visibleClients = (showAllClients || searchTerm) ? searchedClients : searchedClients.slice(0, LIST_MAX)
  const hiddenCount = searchTerm ? 0 : searchedClients.length - LIST_MAX

  // ── Detalle por NIT (resumen para tabla colapsada) ─────────────────
  const detalleNIT = useMemo(() => {
    const source = selectedBucket ? cartera.filter((r) => r['Bucket'] === selectedBucket) : cartera
    const map: Record<string, { nit: string; nombres: Set<string>; total: number; facturas: number; maxDias: number }> = {}
    source.forEach((r) => {
      const nit    = r['NIT'] || 'Sin NIT'
      const nombre = (r['Cliente'] || '').trim()
      const val    = parseN(r['Total Adeudado ($)'])
      const dias   = parseN(r['Días Vencido'])
      if (!map[nit]) map[nit] = { nit, nombres: new Set(), total: 0, facturas: 0, maxDias: 0 }
      if (nombre) map[nit].nombres.add(nombre)
      map[nit].total    += val
      map[nit].facturas += 1
      map[nit].maxDias   = Math.max(map[nit].maxDias, dias)
    })
    return Object.values(map)
      .map((d) => ({ ...d, nombres: Array.from(d.nombres) }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [cartera, selectedBucket])

  // ── Mini distribución de cartera del cliente seleccionado ───────────
  const clienteDistribucion = useMemo(() => {
    if (!selectedClientNIT) return []
    const source = cartera.filter((r) => (r['NIT'] || '') === selectedClientNIT &&
      (selectedBucket ? r['Bucket'] === selectedBucket : true))
    const map: Record<string, number> = {}
    source.forEach((r) => {
      const bucket = r['Bucket'] || 'Sin rango'
      map[bucket] = (map[bucket] || 0) + parseN(r['Total Adeudado ($)'])
    })
    return BUCKET_ORDER_ARR
      .filter((b) => map[b])
      .map((b) => ({ name: b, value: map[b], color: BUCKET_COLOR[b] ?? '#94a3b8' }))
  }, [cartera, selectedClientNIT, selectedBucket])

  // ── Detalle agrupado por nombre (para el NIT seleccionado) ──────────

  const detalleClienteGrupos = useMemo(() => {
    if (!selectedClientNIT) return []
    const source = cartera.filter((r) =>
      (r['NIT'] || '') === selectedClientNIT &&
      (selectedBucket ? r['Bucket'] === selectedBucket : true)
    )
    const map: Record<string, { nombre: string; total: number; diasSum: number; diasCount: number; worstBucket: string }> = {}
    source.forEach((r) => {
      const nombre = (r['Cliente'] || '').trim() || 'Sin nombre'
      const val    = parseN(r['Total Adeudado ($)'])
      const dias   = parseN(r['Días Vencido'])
      const bucket = r['Bucket'] || ''
      if (!map[nombre]) map[nombre] = { nombre, total: 0, diasSum: 0, diasCount: 0, worstBucket: bucket }
      map[nombre].total     += val
      if (dias > 0) { map[nombre].diasSum += dias; map[nombre].diasCount++ }
      if ((BUCKET_ORDER[bucket] ?? -1) > (BUCKET_ORDER[map[nombre].worstBucket] ?? -1))
        map[nombre].worstBucket = bucket
    })
    return Object.values(map)
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [cartera, selectedClientNIT, selectedBucket])

  // Nombre "principal" del NIT (mayor total)
  const selectedClientName = detalleClienteGrupos[0]?.nombre ?? selectedClientNIT ?? ''

  // ── Facturas Vencidas: responde a nombre seleccionado > NIT > bucket ─
  const filteredVencidas = useMemo(() => {
    return cartera
      .filter((r) => {
        if (selectedDetalleName) return r['Cliente']?.trim() === selectedDetalleName
        if (selectedClientNIT)   return (r['NIT'] || '') === selectedClientNIT && (selectedBucket ? r['Bucket'] === selectedBucket : true)
        return r['En Mora'] === 'SI' && (selectedBucket ? r['Bucket'] === selectedBucket : true)
      })
      .sort((a, b) => parseN(b['Días Vencido']) - parseN(a['Días Vencido']))
  }, [cartera, selectedDetalleName, selectedClientNIT, selectedBucket])

  // ── Exportar Detalle de Cliente ────────────────────────────────────
  const exportDetalle = useCallback(() => {
    if (!selectedClientNIT || detalleClienteGrupos.length === 0) return
    const rows = detalleClienteGrupos.map((g) => ({
      'NIT':          selectedClientNIT,
      'Nombre':       g.nombre,
      'Total ($)':    g.total,
      'Prom. Días':   g.diasCount > 0 ? Math.round(g.diasSum / g.diasCount) : 0,
      'Peor Rango':   g.worstBucket,
    }))
    const nombre = (selectedClientName || selectedClientNIT).replace(/[/\\?%*:|"<>]/g, '-')
    exportToExcel(rows, `Detalle_${nombre}`, 'Detalle')
  }, [detalleClienteGrupos, selectedClientNIT, selectedClientName])

  // ── Exportar Facturas Vencidas ─────────────────────────────────────
  const exportVencidas = useCallback(() => {
    if (filteredVencidas.length === 0) return
    const rows = filteredVencidas.map((r) => ({
      'NIT':               r['NIT'] ?? '',
      'Cliente':           r['Cliente'] ?? '',
      'Factura':           r['Factura'] ?? '',
      'Fecha Vencimiento': r['Fecha Vencimiento'] ?? '',
      'Rango':             r['Bucket'] ?? '',
      'Días Vencido':      r['Días Vencido'] ?? '',
      'Total Adeudado ($)': r['Total Adeudado ($)'] ?? '',
    }))
    const base = selectedDetalleName
      ? selectedDetalleName
      : selectedClientNIT
        ? (selectedClientName || selectedClientNIT)
        : (selectedBucket ?? 'Todas')
    exportToExcel(rows, `Facturas_${base.replace(/[/\\?%*:|"<>]/g, '-')}`, 'Facturas')
  }, [filteredVencidas, selectedDetalleName, selectedClientNIT, selectedClientName, selectedBucket])

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Fila donuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Distribución de Cartera */}
        <Card title="Distribución de Cartera" subtitle={`Total: ${fmt(totalCartera)}`}>
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-center">
            <div className="w-full md:w-[160px] flex-shrink-0">
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={46} outerRadius={68}
                      dataKey="value" paddingAngle={2} animationBegin={0} animationDuration={600}
                      onClick={(e) => e?.name && toggleBucket(e.name)} style={{ cursor: 'pointer' }}>
                      {donutData.map((e, i) => (
                        <Cell key={i} fill={e.color}
                          opacity={selectedBucket && selectedBucket !== e.name ? 0.25 : 1}
                          stroke={selectedBucket === e.name ? '#fff' : 'none'} strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex-1 w-full space-y-1.5">
              {bucketBars.map((b, i) => (
                <button key={i} onClick={() => toggleBucket(b.label)}
                  className={`w-full flex items-center gap-2 rounded-[6px] px-2 py-[5px] transition-all text-left ${
                    selectedBucket === b.label ? 'bg-[var(--bar-bg)] ring-1 ring-[var(--border)]' : 'hover:bg-[var(--bar-bg)]'
                  }`}>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color }} />
                  <span className={`text-[12px] w-[80px] flex-shrink-0 ${selectedBucket === b.label ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-sub)]'}`}>{b.label}</span>
                  <div className="flex-1 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-opacity"
                      style={{ width: `${b.pct}%`, background: b.color, opacity: selectedBucket && selectedBucket !== b.label ? 0.25 : 1 }} />
                  </div>
                  <span className="text-[11px] num text-[var(--text)] w-[86px] text-right flex-shrink-0">{b.value}</span>
                  <span className="text-[10px] num text-[var(--text-muted)] w-[28px] text-right flex-shrink-0">
                    {totalCartera > 0 ? ((b.raw / totalCartera) * 100).toFixed(0) : 0}%
                  </span>
                </button>
              ))}
              {selectedBucket && (
                <button onClick={() => setSelectedBucket(null)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] mt-1 flex items-center gap-1 px-2">
                  <span>✕</span> Limpiar filtro
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Clientes con Cartera */}
        <Card title="Clientes con Cartera"
          subtitle={selectedBucket ? `Rango: ${selectedBucket}` : 'Todos los rangos'}>
          {clientesList.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={clientesDonut} cx="50%" cy="50%" innerRadius={46} outerRadius={68}
                      dataKey="value" paddingAngle={2} animationBegin={0} animationDuration={500}>
                      {clientesDonut.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Buscador de clientes */}
              <div className="relative mb-2">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente o NIT…"
                  className="w-full pl-8 pr-7 py-[6px] text-[12px] rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 transition-all"
                  style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--brand-blue)' } as React.CSSProperties}
                />
                {clientSearch && (
                  <button
                    onClick={() => setClientSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] leading-none transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >✕</button>
                )}
              </div>

              {/* Tabla de clientes */}
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-center w-[36px]">Ref.</th>
                    <th className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-left">Cliente</th>
                    <th className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-right">Adeudado</th>
                    <th className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-right w-[40px]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClients.map((c, i) => (
                    <tr key={i}
                      onClick={() => selectClient(c.nit)}
                      className={`border-b border-[var(--border)] last:border-0 transition-colors cursor-pointer ${
                        selectedClientNIT === c.nit
                          ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                          : 'hover:bg-[var(--nav-hover)]'
                      }`}>
                      <td className="px-[10px] py-[9px] text-center">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c.color }} />
                      </td>
                      <td className="px-[10px] py-[9px] max-w-[180px]">
                        <div className="truncate text-[var(--text-sub)]">
                          {selectedClientNIT === c.nit && <span className="mr-1 text-[var(--text-muted)]">▸</span>}
                          {c.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] tabular-nums">{c.nit}</div>
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text)] font-medium">{fmtM(c.value)}</td>
                      <td className="px-[10px] py-[9px] text-right num text-[10px] text-[var(--text-muted)]">
                        {totalClientes > 0 ? ((c.value / totalClientes) * 100).toFixed(0) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {hiddenCount > 0 && !showAllClients && (
                <button onClick={() => setShowAllClients(true)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1 transition-colors pt-0.5">
                  <span>▼</span> +{hiddenCount} más
                </button>
              )}
              {showAllClients && (
                <div className="sticky bottom-4 flex justify-center mt-3 pointer-events-none">
                  <button onClick={() => setShowAllClients(false)}
                    className="pointer-events-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-medium shadow-lg transition-all bg-[var(--card)] border border-[var(--border)] text-[var(--text-sub)] hover:text-[var(--text)] hover:shadow-xl">
                    <span className="inline-block rotate-180">▼</span> Ocultar
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Detalle de Cliente (expandible) ── */}
      <div ref={detalleRef} className="mb-4">
        <div
          className={`rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card overflow-hidden transition-all`}
        >
          {/* Cabecera siempre visible */}
          <div
            className="flex items-center justify-between px-[18px] py-[14px] cursor-pointer select-none hover:bg-[var(--bar-bg)] transition-colors"
            onClick={() => !selectedClientNIT && setSelectedClientNIT(null)}
          >
            <div>
              <span className="text-[13px] font-semibold text-[var(--text)]">Detalle de Cliente</span>
              <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                {selectedClientNIT
                  ? `${selectedClientName} · ${detalleClienteGrupos.length} nombre${detalleClienteGrupos.length !== 1 ? 's' : ''}`
                  : `${selectedBucket ? `Rango: ${selectedBucket} — ` : 'Todos los rangos — '}${detalleNIT.length} NITs`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedClientNIT && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); exportDetalle() }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors"
                  >
                    ↓ Excel
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedClientNIT(null) }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bar-bg)] transition-colors"
                  >
                    ✕ Cerrar
                  </button>
                </div>
              )}
              <span className={`text-[var(--text-muted)] text-[12px] transition-transform ${selectedClientNIT ? 'rotate-180' : ''}`}>▼</span>
            </div>
          </div>

          {/* Contenido expandido */}
          {selectedClientNIT && (
            <div className="border-t border-[var(--border)] px-[18px] pb-[16px] pt-[12px]">

              {/* Mini distribución de cartera del cliente */}
              {clienteDistribucion.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 p-3 rounded-[8px] bg-[var(--bar-bg)]">
                  {/* Donut */}
                  <div className="w-[100px] h-[100px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={clienteDistribucion} cx="50%" cy="50%"
                          innerRadius={28} outerRadius={44}
                          dataKey="value" paddingAngle={2}
                          animationBegin={0} animationDuration={500}>
                          {clienteDistribucion.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Leyenda con valores */}
                  <div className="flex-1 w-full space-y-1.5">
                    {clienteDistribucion.map((b, i) => {
                      const total = clienteDistribucion.reduce((s, x) => s + x.value, 0)
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                          <span className="text-[11px] text-[var(--text-sub)] w-[80px] flex-shrink-0">{b.name}</span>
                          <div className="flex-1 h-[3px] bg-[var(--bg)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{ width: `${(b.value / total) * 100}%`, background: b.color }} />
                          </div>
                          <span className="text-[11px] num text-[var(--text)] w-[80px] text-right flex-shrink-0">{fmtM(b.value)}</span>
                          <span className="text-[10px] num text-[var(--text-muted)] w-[28px] text-right flex-shrink-0">
                            {total > 0 ? ((b.value / total) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tabla agrupada por nombre */}
              {detalleClienteGrupos.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">Sin datos para este rango</div>
              ) : (
                <div className="table-scroll" style={{ maxHeight: 360 }}>
                  <table className="w-full border-collapse text-[12px]">
                    <thead className="sticky top-0 bg-[var(--card)] z-10">
                      <tr>
                        {[
                          { l: 'Nombre',      a: 'left'   },
                          { l: 'Total',       a: 'right'  },
                          { l: 'Prom. días',  a: 'right'  },
                          { l: 'Estado',      a: 'center' },
                        ].map((h) => (
                          <th key={h.l} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-${h.a}`}>
                            {h.l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalleClienteGrupos.map((g, i) => {
                        const avgDias = g.diasCount > 0 ? Math.round(g.diasSum / g.diasCount) : 0
                        const color   = BUCKET_COLOR[g.worstBucket] ?? '#94a3b8'
                        const isSelected = selectedDetalleName === g.nombre
                        return (
                          <tr key={i}
                            onClick={() => setSelectedDetalleName((p) => p === g.nombre ? null : g.nombre)}
                            className={`border-b border-[var(--border)] last:border-0 transition-colors cursor-pointer ${
                              isSelected ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]' : 'hover:bg-[var(--nav-hover)]'
                            }`}>
                            <td className="px-[10px] py-[9px] text-[var(--text-sub)]">
                              {isSelected && <span className="mr-1 text-[var(--text-muted)]">▸</span>}
                              <span className={isSelected ? 'font-semibold text-[var(--text)]' : ''}>{g.nombre}</span>
                            </td>
                            <td className="px-[10px] py-[9px] text-right num text-[11px] font-medium text-[var(--text)]">{fmt(g.total)}</td>
                            <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                              {avgDias > 0 ? fmtN(avgDias) : '—'}
                            </td>
                            <td className="px-[10px] py-[9px] text-center">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} title={g.worstBucket} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Prompt cuando está colapsado */}
          {!selectedClientNIT && (
            <div className="border-t border-[var(--border)] px-[18px] py-[10px] text-[11px] text-[var(--text-muted)] flex items-center gap-2">
              <span>👆</span>
              <span>Selecciona un cliente en la tabla de arriba para ver su desglose completo</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Facturas Vencidas ── */}
      <Card
        title="Facturas Vencidas"
        subtitle={selectedDetalleName
          ? `${selectedDetalleName} — ${filteredVencidas.length} facturas`
          : selectedClientNIT
            ? `${selectedClientName} — ${filteredVencidas.length} facturas`
            : selectedBucket
              ? `Rango: ${selectedBucket} — ${filteredVencidas.length} facturas`
              : `Todas — ${filteredVencidas.length} facturas`}
        action={
          filteredVencidas.length > 0 && (
            <button
              onClick={exportVencidas}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors"
            >
              ↓ Excel
            </button>
          )
        }
      >
        {filteredVencidas.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">No hay facturas vencidas para este rango</div>
        ) : (
          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {[
                    { l: 'NIT',     a: 'left'  },
                    { l: 'Cliente', a: 'left'  },
                    { l: 'Factura', a: 'left'  },
                    { l: 'Rango',   a: 'left'  },
                    { l: 'Días',    a: 'right' },
                    { l: 'Adeudado',a: 'right' },
                  ].map((h) => (
                    <th key={h.l} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-${h.a}`}>
                      {h.l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredVencidas.map((r, i) => {
                  const bucket = r['Bucket'] ?? ''
                  const bs     = BUCKET_BADGE[bucket] ?? { bg: 'bg-[var(--bar-bg)]', text: 'text-[var(--text-sub)]' }
                  return (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r['NIT']}</td>
                      <td className="px-[10px] py-[9px]">
                        <span className="font-medium text-[var(--text)] block max-w-[160px] truncate">{r['Cliente']}</span>
                      </td>
                      <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r['Factura']}</td>
                      <td className="px-[10px] py-[9px]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${bs.bg} ${bs.text}`}>
                          {bucket}
                        </span>
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                        {fmtN(parseN(r['Días Vencido']))}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]">
                        <span className="text-[#ef4444]">{fmt(parseN(r['Total Adeudado ($)']))}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
