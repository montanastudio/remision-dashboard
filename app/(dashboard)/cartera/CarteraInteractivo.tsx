'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/Card'
import MiniDonut from './MiniDonut'
import FacturaPopup, { FacturaInfo, AbonoInfo } from '@/components/FacturaPopup'
import { exportToExcel } from '@/lib/exportExcel'
import { parseFecha } from '@/lib/fecha'

const CLIENT_COLORS = [
  '#1a3a8f', '#2563eb', '#3b82f6', '#60a5fa', '#818cf8',
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b',
]

const BUCKET_CONFIG = [
  { name: 'No vencida',       label: 'No vencida', color: '#22c55e' },
  { name: '1-30 días',        label: '1-30d',      color: '#86efac' },
  { name: 'Próximo a vencer', label: '31-45d',     color: '#f59e0b' },
  { name: 'Vencida',          label: '46-60d',     color: '#f97316' },
  { name: 'Mora',             label: '61-75d',     color: '#ea580c' },
  { name: 'Prejurídico',      label: '76-90d',     color: '#ef4444' },
  { name: 'Jurídico',         label: '91+d',       color: '#b91c1c' },
]

const BUCKET_ORDER: Record<string, number> = {
  'Jurídico': 6, 'Prejurídico': 5, 'Mora': 4, 'Vencida': 3, 'Próximo a vencer': 2, '1-30 días': 1, 'No vencida': 0,
  '+90 días': 6, '61-90 días': 4, '31-60 días': 3,
}
const BUCKET_COLOR: Record<string, string> = {
  'Jurídico':         '#b91c1c',
  'Prejurídico':      '#ef4444',
  'Mora':             '#ea580c',
  'Vencida':          '#f97316',
  'Próximo a vencer': '#f59e0b',
  '1-30 días':        '#86efac',
  'No vencida':       '#22c55e',
  '+90 días':         '#b91c1c',
  '61-90 días':       '#ea580c',
  '31-60 días':       '#f97316',
}
const BUCKET_ORDER_ARR = [
  'Jurídico', '+90 días', 'Prejurídico', 'Mora', '61-90 días',
  'Vencida', '31-60 días', 'Próximo a vencer', '1-30 días', 'No vencida',
]

const BUCKET_BADGE: Record<string, { bg: string; text: string }> = {
  'Jurídico':         { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-800 dark:text-red-300' },
  'Prejurídico':      { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-600 dark:text-red-400' },
  'Mora':             { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400' },
  'Vencida':          { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-500 dark:text-orange-400' },
  'Próximo a vencer': { bg: 'bg-yellow-100 dark:bg-yellow-950/60', text: 'text-yellow-600 dark:text-yellow-500' },
  '1-30 días':        { bg: 'bg-green-100 dark:bg-green-950/60',   text: 'text-green-700 dark:text-green-400' },
  'No vencida':       { bg: 'bg-green-100 dark:bg-green-950/60',   text: 'text-green-600 dark:text-green-400' },
  '+90 días':         { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-800 dark:text-red-300' },
  '61-90 días':       { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400' },
  '31-60 días':       { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-500 dark:text-orange-400' },
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

interface Props {
  cartera:    Record<string, string>[]
  vendedores: string[]
  recibos:    Record<string, string>[]
}

const BUCKET_LABEL: Record<string, string> = {
  'No vencida': 'No vencida', '1-30 días': '1-30d',
  'Próximo a vencer': '31-45d', 'Vencida': '46-60d',
  'Mora': '61-75d', 'Prejurídico': '76-90d', 'Jurídico': '91+d',
  '+90 días': '91+d', '61-90 días': '61-90d', '31-60 días': '31-60d',
}

interface TooltipEntry { name: string; label?: string; value: number; color: string }
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; color: string; payload: TooltipEntry }[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const display = p.payload?.label ?? BUCKET_LABEL[p.name] ?? p.name
  return (
    <div className="rounded-[8px] border px-3 py-2 text-[11px] shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}>
      <div className="font-semibold mb-0.5">{display}</div>
      <div>{fmtM(p.value)}</div>
    </div>
  )
}

export default function CarteraInteractivo({ cartera, vendedores, recibos }: Props) {
  const [selectedVendedor,    setSelectedVendedor]    = useState('')
  const [selectedBucket,      setSelectedBucket]      = useState<string | null>(null)
  const [selectedClientNIT,   setSelectedClientNIT]   = useState<string | null>(null)
  const [clientPage,          setClientPage]          = useState(0)
  const [clientSearch,        setClientSearch]        = useState('')
  const [popupFactura, setPopupFactura] = useState<FacturaInfo | null>(null)
  const [popupAbonos,  setPopupAbonos]  = useState<AbonoInfo[]>([])
  const [recaudoRango, setRecaudoRango] = useState<'mes' | 'año' | 'todo'>('mes')

  const detalleRef = useRef<HTMLDivElement>(null)

  const toggleBucket = (name: string) =>
    setSelectedBucket((p) => (p === name ? null : name))

  const selectClient = (nit: string) => {
    setSelectedClientNIT((p) => {
      const next = p === nit ? null : nit
      if (next) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      return next
    })
  }

  useEffect(() => { setSelectedClientNIT(null); setClientSearch(''); setClientPage(0) }, [selectedBucket])
  useEffect(() => { setRecaudoRango('mes') }, [selectedClientNIT])
  useEffect(() => { setClientPage(0) }, [clientSearch])
  // Reset all drill-downs when vendor changes
  useEffect(() => {
    setSelectedBucket(null)
    setSelectedClientNIT(null)
    setClientSearch('')
    setClientPage(0)
  }, [selectedVendedor])

  // ── Cartera filtrada por vendedor ──────────────────────────────────
  const activeCartera = useMemo(() =>
    selectedVendedor
      ? cartera.filter(r => (r['Vendedor'] ?? '').trim() === selectedVendedor)
      : cartera,
    [cartera, selectedVendedor]
  )

  // ── Métricas del encabezado (reaccionan al filtro de vendedor) ─────
  const { totalCartera, bucketBars, donutData, clientesEnMora, facturasEnMora } = useMemo(() => {
    const enMora = (r: Record<string, string>) => r['En Mora']?.toLowerCase().startsWith('s')
    const cEnMora = new Set(activeCartera.filter(enMora).map(r => r['NIT'])).size
    const fEnMora = activeCartera.filter(enMora).length

    const bucketAgg: Record<string, number> = {}
    activeCartera.forEach(r => {
      const name = r['Bucket']
      if (!name) return
      bucketAgg[name] = (bucketAgg[name] ?? 0) + parseN(r['Total Adeudado ($)'])
    })
    const total = Object.values(bucketAgg).reduce((s, v) => s + v, 0)
    const maxB  = Math.max(...Object.values(bucketAgg), 1)

    const bars = BUCKET_CONFIG
      .filter(b => bucketAgg[b.name])
      .map(b => ({
        name:  b.name,
        label: b.label,
        value: fmt(bucketAgg[b.name]),
        raw:   bucketAgg[b.name],
        pct:   (bucketAgg[b.name] / maxB) * 100,
        color: b.color,
      }))

    const donut = bars.map(b => ({ name: b.name, label: b.label, value: b.raw, color: b.color }))

    return { totalCartera: total, bucketBars: bars, donutData: donut, clientesEnMora: cEnMora, facturasEnMora: fEnMora }
  }, [activeCartera])

  // ── Clientes donut + tabla ─────────────────────────────────────────
  const { clientesDonut, clientesList, totalClientes } = useMemo(() => {
    const source = selectedBucket ? activeCartera.filter((r) => r['Bucket'] === selectedBucket) : activeCartera

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
  }, [activeCartera, selectedBucket])

  const LIST_MAX = 8
  const searchTerm = clientSearch.trim().toLowerCase()
  const searchedClients = searchTerm
    ? clientesList.filter(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.nit.toLowerCase().includes(searchTerm)
      )
    : clientesList
  const totalClientPages = Math.max(1, Math.ceil(searchedClients.length / LIST_MAX))
  const clientPageClamped = Math.min(clientPage, totalClientPages - 1)
  const visibleClients = searchedClients.slice(clientPageClamped * LIST_MAX, (clientPageClamped + 1) * LIST_MAX)

  // ── Detalle por NIT ────────────────────────────────────────────────
  const detalleNIT = useMemo(() => {
    const source = selectedBucket ? activeCartera.filter((r) => r['Bucket'] === selectedBucket) : activeCartera
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
  }, [activeCartera, selectedBucket])

  // ── Mini distribución del cliente seleccionado ─────────────────────
  const clienteDistribucion = useMemo(() => {
    if (!selectedClientNIT) return []
    const source = activeCartera.filter((r) => (r['NIT'] || '') === selectedClientNIT &&
      (selectedBucket ? r['Bucket'] === selectedBucket : true))
    const map: Record<string, number> = {}
    source.forEach((r) => {
      const bucket = r['Bucket'] || 'Sin rango'
      map[bucket] = (map[bucket] || 0) + parseN(r['Total Adeudado ($)'])
    })
    return BUCKET_ORDER_ARR
      .filter((b) => map[b])
      .map((b) => ({ name: b, label: BUCKET_LABEL[b] ?? b, value: map[b], color: BUCKET_COLOR[b] ?? '#94a3b8' }))
  }, [activeCartera, selectedClientNIT, selectedBucket])

  // ── Detalle agrupado por nombre ────────────────────────────────────
  const detalleClienteGrupos = useMemo(() => {
    if (!selectedClientNIT) return []
    const source = activeCartera.filter((r) =>
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
  }, [activeCartera, selectedClientNIT, selectedBucket])

  const selectedClientName = detalleClienteGrupos[0]?.nombre ?? selectedClientNIT ?? ''

  // ── Deuda actual del cliente (cartera pendiente ahora mismo) ────────
  const clienteDeuda = useMemo(() => {
    if (!selectedClientNIT) return null
    const facturas = activeCartera.filter((r) =>
      (r['NIT'] || '') === selectedClientNIT && (selectedBucket ? r['Bucket'] === selectedBucket : true)
    )
    const total = facturas.reduce((s, r) => s + parseN(r['Total Adeudado ($)']), 0)
    const diasVencidos = facturas.map((r) => parseN(r['Días Vencido'])).filter((d) => d > 0)
    const avgDias = diasVencidos.length > 0 ? Math.round(diasVencidos.reduce((a, b) => a + b, 0) / diasVencidos.length) : 0
    return { total, nFacturas: facturas.length, avgDias }
  }, [activeCartera, selectedClientNIT, selectedBucket])

  // ── Recaudo del cliente seleccionado, según el rango elegido ────────
  const clienteRecaudo = useMemo(() => {
    if (!selectedClientNIT) return null
    const hoy = new Date()
    const pagosCliente = recibos.filter((r) => (r['NIT'] || '') === selectedClientNIT)
    const pagos = recaudoRango === 'todo'
      ? pagosCliente
      : pagosCliente.filter((r) => {
          const f = parseFecha(r['Fecha Pago'])
          if (!f) return false
          if (recaudoRango === 'año') return f.year === hoy.getFullYear()
          return f.year === hoy.getFullYear() && f.mes === hoy.getMonth()
        })
    if (pagos.length === 0) return { total: 0, nAbonos: 0, ultimoPago: null as string | null }
    const total = pagos.reduce((s, r) => s + parseN(r['Total Pagado ($)']), 0)
    const ultimoPago = pagos
      .map((r) => r['Fecha Pago'] || '')
      .filter(Boolean)
      .sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number)
        const [db, mb, yb] = b.split('/').map(Number)
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime()
      })
      .pop() ?? null
    return { total, nAbonos: pagos.length, ultimoPago }
  }, [recibos, selectedClientNIT, recaudoRango])

  // ── Popup de detalle de factura (desde Facturas Vencidas) ───────────
  const openFacturaPopup = useCallback((r: Record<string, string>) => {
    const facturaNum = r['Factura'] ?? ''
    const nit = r['NIT'] ?? ''
    const abonos = recibos
      .filter((x) => (x['Factura'] ?? '') === facturaNum && (x['NIT'] ?? '') === nit)
      .map((x) => ({ recibo: x['Recibo'] ?? '', fechaPago: x['Fecha Pago'] ?? '', monto: parseN(x['Total Pagado ($)']) }))
    setPopupFactura({
      numero: facturaNum,
      nit,
      cliente: r['Cliente'] ?? '',
      vendedor: r['Vendedor'],
      fechaFactura: r['Fecha Factura'],
      fechaVence: r['Fecha Vencimiento'],
      dias: parseN(r['Días Vencido']),
      bucket: r['Bucket'],
      total: r['Total ($)'] !== undefined ? parseN(r['Total ($)']) : undefined,
      abonado: r['Abonado ($)'] !== undefined ? parseN(r['Abonado ($)']) : undefined,
      saldo: parseN(r['Total Adeudado ($)']),
    })
    setPopupAbonos(abonos)
  }, [recibos])

  // ── Facturas Vencidas ──────────────────────────────────────────────
  const filteredVencidas = useMemo(() => {
    return activeCartera
      .filter((r) => {
        if (selectedClientNIT) return (r['NIT'] || '') === selectedClientNIT && (selectedBucket ? r['Bucket'] === selectedBucket : true)
        return r['En Mora'] === 'SI' && (selectedBucket ? r['Bucket'] === selectedBucket : true)
      })
      .sort((a, b) => parseN(b['Días Vencido']) - parseN(a['Días Vencido']))
  }, [activeCartera, selectedClientNIT, selectedBucket])

  // ── Exportar ───────────────────────────────────────────────────────
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
    const base = selectedClientNIT
      ? (selectedClientName || selectedClientNIT)
      : (selectedBucket ?? 'Todas')
    exportToExcel(rows, `Facturas_${base.replace(/[/\\?%*:|"<>]/g, '-')}`, 'Facturas')
  }, [filteredVencidas, selectedClientNIT, selectedClientName, selectedBucket])

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Filtro de vendedor */}
      {vendedores.length > 0 && (
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card px-4 py-2.5 mb-4 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--text-muted)] flex-shrink-0">Vendedor</span>
          <select
            value={selectedVendedor}
            onChange={e => setSelectedVendedor(e.target.value)}
            className="text-[12px] px-2.5 py-[6px] rounded-[7px] border bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-1 transition-all cursor-pointer flex-1 max-w-[260px]"
            style={{ borderColor: 'var(--border)', ['--tw-ring-color' as string]: 'var(--brand-blue)' }}
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {selectedVendedor && (
            <>
              <span className="text-[11px] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-sub)]">{activeCartera.length}</span> registros
              </span>
              <button
                onClick={() => setSelectedVendedor('')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors ml-auto"
              >
                ✕ Limpiar
              </button>
            </>
          )}
        </div>
      )}

      {/* Tarjeta encabezado: total + mini donut + distribución por rango */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_18px] mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-[var(--text-sub)] mb-1">
              Total Cartera{selectedVendedor && <span className="ml-1.5 text-[var(--brand-blue)]">· {selectedVendedor}</span>}
            </div>
            <div className="text-[28px] md:text-[32px] font-bold tracking-[-0.5px] text-[var(--text)] leading-tight break-words">
              {fmt(totalCartera)}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
              <span><span className="font-semibold text-[var(--text-sub)]">{clientesEnMora.toLocaleString('es-CO')}</span> clientes en mora</span>
              <span className="text-[var(--border)]">·</span>
              <span><span className="font-semibold text-[var(--text-sub)]">{facturasEnMora.toLocaleString('es-CO')}</span> facturas vencidas</span>
            </div>
          </div>
          <MiniDonut data={donutData} />
        </div>

        {/* Distribución por rango — clic para filtrar */}
        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-1.5">
          {bucketBars.map((b, i) => (
            <button key={i} onClick={() => toggleBucket(b.name)} title={b.name}
              className={`w-full flex items-center gap-2 rounded-[6px] px-2 py-[5px] transition-all text-left group ${
                selectedBucket === b.name ? 'bg-[var(--bar-bg)] ring-1 ring-[var(--border)]' : 'hover:bg-[var(--bar-bg)]'
              }`}>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color }} />
              <span className={`text-[12px] w-[52px] flex-shrink-0 font-semibold num ${selectedBucket === b.name ? 'text-[var(--text)]' : 'text-[var(--text-sub)]'}`}>
                {b.label}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
                style={{ maxWidth: 110, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {b.name}
              </span>
              <div className="flex-1 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-opacity"
                  style={{ width: `${b.pct}%`, background: b.color, opacity: selectedBucket && selectedBucket !== b.name ? 0.25 : 1 }} />
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

      {/* Clientes con Cartera */}
      <div className="mb-4">
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
                  style={{ borderColor: 'var(--border)', ['--tw-ring-color' as string]: 'var(--brand-blue)' }}
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

              {totalClientPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setClientPage(p => Math.max(0, p - 1))}
                    disabled={clientPageClamped === 0}
                    className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bar-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ‹ Anterior
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Página {clientPageClamped + 1} de {totalClientPages}
                  </span>
                  <button
                    onClick={() => setClientPage(p => Math.min(totalClientPages - 1, p + 1))}
                    disabled={clientPageClamped >= totalClientPages - 1}
                    className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bar-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente ›
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Detalle de Cliente (expandible) ── */}
      <div ref={detalleRef} className="mb-4">
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card overflow-hidden transition-all">
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

              {/* Deuda actual del cliente */}
              {clienteDeuda && (
                <div className="mb-4 p-3 rounded-[8px] bg-[var(--bar-bg)]">
                  <div className="mb-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Debe Actualmente{selectedBucket ? ` · ${selectedBucket}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Saldo</div>
                      <div className="text-[14px] font-bold text-[#ef4444] num">{fmt(clienteDeuda.total)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Facturas</div>
                      <div className="text-[14px] font-bold text-[var(--text)] num">{fmtN(clienteDeuda.nFacturas)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Días Prom. Vencido</div>
                      <div className="text-[14px] font-bold text-[var(--text)] num">{clienteDeuda.avgDias > 0 ? fmtN(clienteDeuda.avgDias) : '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Gráfico y división de la deuda por rango de días */}
              {clienteDistribucion.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 p-3 rounded-[8px] bg-[var(--bar-bg)]">
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
                  <div className="flex-1 w-full space-y-1.5">
                    {clienteDistribucion.map((b, i) => {
                      const total = clienteDistribucion.reduce((s, x) => s + x.value, 0)
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                          <span className="text-[11px] text-[var(--text-sub)] w-[52px] flex-shrink-0" title={b.name}>{b.label ?? b.name}</span>
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

              {/* Recaudo del cliente, con filtro de rango de tiempo */}
              {clienteRecaudo && (
                <div className="p-3 rounded-[8px] bg-[var(--bar-bg)]">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Recaudo del cliente
                    </span>
                    <div className="flex gap-1">
                      {([
                        { key: 'mes',  label: 'Mes actual' },
                        { key: 'año',  label: 'Año actual' },
                        { key: 'todo', label: 'Histórico'  },
                      ] as { key: 'mes' | 'año' | 'todo'; label: string }[]).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setRecaudoRango(opt.key)}
                          className={`text-[10px] font-medium px-2 py-[3px] rounded-full border transition-all leading-none ${
                            recaudoRango === opt.key
                              ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
                              : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--card)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Recaudado</div>
                      <div className="text-[14px] font-bold text-[#22c55e] num">{fmt(clienteRecaudo.total)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Abonos</div>
                      <div className="text-[14px] font-bold text-[var(--text)] num">{fmtN(clienteRecaudo.nAbonos)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Último Pago</div>
                      <div className="text-[14px] font-bold text-[var(--text)] num">{clienteRecaudo.ultimoPago ?? '—'}</div>
                    </div>
                  </div>
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
        subtitle={selectedClientNIT
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
                    <tr key={i}
                      onClick={() => openFacturaPopup(r)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors cursor-pointer"
                      title="Ver análisis de la factura">
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

      <FacturaPopup factura={popupFactura} abonos={popupAbonos} onClose={() => setPopupFactura(null)} />
    </>
  )
}
