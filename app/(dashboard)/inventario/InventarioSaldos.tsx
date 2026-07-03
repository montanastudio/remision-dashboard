'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { fmt, fmtN } from '@/lib/format'

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const s = String(v ?? '').trim()
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

type Row = Record<string, string>
type EnrichedRow = {
  [k: string]: string | number
  _marca: string
  _saldo: number
  _precio: number
  _valorTotal: number
  _saldoCedi: number
  _saldoZF: number
  _dias: number
  _ultimaSalida: string
  _rotEstado: string
}

// ── Extracción flexible de columnas ──────────────────────────────────────────
function pickCol(r: Row, ...candidates: string[]): string {
  for (const c of candidates) { if (r[c] !== undefined && r[c] !== '') return r[c] }
  return ''
}

function extractSaldo(r: Row): number {
  return parseNum(pickCol(r, 'Stock Total', 'Saldo Sistema', 'Saldo', 'Existencias', 'Cantidad', 'Saldo (und)', 'Und. Stock'))
}
function extractSaldoCedi(r: Row): number {
  const exact = pickCol(r, 'Stock BODEGA CEDI', 'Stock Bodega CEDI', 'Saldo CEDI', 'CEDI')
  if (exact !== '') return parseNum(exact)
  // búsqueda insensible a mayúsculas si el nombre exacto no coincide
  const key = Object.keys(r).find(k => k.toLowerCase().includes('cedi'))
  return key ? parseNum(r[key]) : 0
}
function extractSaldoZF(r: Row): number {
  const exact = pickCol(r, 'Stock BODEGA ZONA FRANCA', 'Stock Bodega ZONA FRANCA', 'Saldo ZF', 'Zona Franca', 'ZF')
  if (exact !== '') return parseNum(exact)
  const key = Object.keys(r).find(k => {
    const l = k.toLowerCase()
    return l.includes('zona') || l.includes('franca') || l === 'zf'
  })
  return key ? parseNum(r[key]) : 0
}
function extractPrecio(r: Row): number {
  return parseNum(pickCol(r, 'Precio Venta ($)', 'Valor Venta ($)', 'Precio Venta', 'Precio', 'Vr. Unitario ($)', 'P. Venta'))
}
function extractValorTotal(r: Row): number {
  const s = extractSaldo(r)
  const p = extractPrecio(r)
  if (s > 0 && p > 0) return s * p
  return parseNum(pickCol(r, 'Valor a Precio Venta ($)', 'Vr. Existencia ($)', 'Valor Existencia ($)', 'Vr. Total ($)', 'Total ($)'))
}

// ── Helpers de columnas renombradas ─────────────────────────────────────────
function pickModelo(r: Record<string, string | number>): string {
  return String(r['Modelo'] ?? r['Grupo'] ?? '').trim()
}
function pickDesc(r: Record<string, string | number>): string {
  return String(r['Descripción'] ?? r['Producto'] ?? '').trim()
}

// ── Detección de curva ────────────────────────────────────────────────────────
const CURVAS_CONOCIDAS = ['M', 'L', 'Y', 'C'] as const
const CURVA_COLOR: Record<string, string> = { M: '#3b82f6', L: '#22c55e', Y: '#f59e0b', C: '#a855f7' }

function detectarCurva(r: Row | Record<string, string | number>): string {
  const col = String(r['Curva'] ?? '').trim().toUpperCase()
  if ((CURVAS_CONOCIDAS as readonly string[]).includes(col)) return col
  const desc = pickDesc(r as Row).toUpperCase()
  const dm = desc.match(/\bCURV[AO]?\.?\s*([MLYC])\b/)
  if (dm) return dm[1]
  const ref = String(r['Referencia'] ?? '').trim().toUpperCase()
  const seg = ref.match(/(?:^|[-_])([MLYC])(?:[-_]|$)/)
  if (seg) return seg[1]
  const dig = ref.match(/\d([MLYC])(?:-|$)/)
  if (dig) return dig[1]
  const end = ref.match(/[-_ ]([MLYC])$/)
  if (end) return end[1]
  const last = ref.slice(-1)
  if ((CURVAS_CONOCIDAS as readonly string[]).includes(last)) return last
  return ''
}

// ── Detección de marca ────────────────────────────────────────────────────────
const MARCAS = [
  { name: 'Athletic Air',  color: '#1a3a8f' },
  { name: 'Vitek',         color: '#22c55e' },
  { name: 'Pegasus',       color: '#f59e0b' },
  { name: 'Marie Sophie',  color: '#a855f7' },
  { name: 'Otros',         color: '#94a3b8' },
]
const MARCA_COLOR = Object.fromEntries(MARCAS.map(m => [m.name, m.color]))

function detectarMarca(r: Row): string {
  // 1. Columna Marca explícita en el sheet
  const marcaCol = (r['Marca'] ?? '').trim().toUpperCase()
  if (marcaCol) {
    if (marcaCol.includes('ATHLETIC')) return 'Athletic Air'
    if (marcaCol.includes('VITEK'))    return 'Vitek'
    if (marcaCol.includes('PEGASUS'))  return 'Pegasus'
    if (marcaCol.includes('MARIE') || marcaCol.includes('MARY')) return 'Marie Sophie'
  }
  // 2. Fallback por descripción y referencia
  const desc = (pickDesc(r)).toUpperCase()
  const ref  = (r['Referencia'] ?? '').toUpperCase()
  const agr  = (r['Agrupación'] ?? '').toUpperCase()
  if (desc.includes('ATHLETIC') || agr.includes('ATHLETIC') || ref.startsWith('ATH')) return 'Athletic Air'
  if (desc.includes('VITEK')    || agr.includes('VITEK')    || ref.startsWith('VTK') || ref.startsWith('VIT')) return 'Vitek'
  if (desc.includes('PEGASUS')  || agr.includes('PEGASUS')  || ref.startsWith('PGS') || ref.startsWith('PEG')) return 'Pegasus'
  if (desc.includes('MARIE')    || desc.includes('MARY SOFI') || ref.startsWith('MF-')) return 'Marie Sophie'
  return 'Otros'
}

// ── Tooltip del gráfico ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { skus: number; qty: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border bg-[var(--card)] border-[var(--border)] shadow-lg px-3 py-2 text-[12px]">
      <div className="font-semibold text-[var(--text)] mb-1">{label}</div>
      <div className="text-[var(--text-sub)]">Valor: {fmt(d.value)}</div>
      <div className="text-[var(--text-muted)]">{fmtN(d.payload.qty)} und · {d.payload.skus} SKUs</div>
    </div>
  )
}

type SortKey = 'Marca' | 'Referencia' | 'Modelo' | 'Descripción' | 'Saldo Sistema' | 'Valor Venta ($)' | 'Valor Total' | 'Rotación'
type SortDir = 'asc' | 'desc'

interface Props { saldos: Row[]; sinRotar: Row[] }

export default function InventarioSaldos({ saldos, sinRotar }: Props) {
  const [marcaFilter,  setMarcaFilter]  = useState<string | null>(null)
  const [modeloFilter, setModeloFilter] = useState<string | null>(null)
  const [curvaFilter,  setCurvaFilter]  = useState<string | null>(null)
  const [query,        setQuery]        = useState('')
  const [sortKey,      setSortKey]      = useState<SortKey>('Valor Total')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')
  const [legendOpen,   setLegendOpen]   = useState(false)
  const [rotPopup,     setRotPopup]     = useState(false)
  const [rotPopupPos,  setRotPopupPos]  = useState<{ top: number; right: number } | null>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const rotRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setLegendOpen(false)
      if (rotRef.current    && !rotRef.current.contains(e.target as Node))    setRotPopup(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function openRotPopup(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (rotPopup) { setRotPopup(false); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setRotPopupPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right + 4 })
    setRotPopup(true)
  }

  // ── Rotación lookup ────────────────────────────────────────────────────────
  const rotMap = useMemo(() => {
    const m = new Map<string, { dias: number; ultimaSalida: string; estado: string }>()
    sinRotar.forEach(r => {
      const ref = (r['Referencia'] ?? '').trim()
      if (!ref) return
      m.set(ref, { dias: parseNum(r['Días Sin Rotar']), ultimaSalida: r['Última Salida'] ?? '', estado: r['Estado'] ?? '' })
    })
    return m
  }, [sinRotar])

  // ── Enriquecer filas ───────────────────────────────────────────────────────
  const enriched: EnrichedRow[] = useMemo(() => saldos.map(r => {
    const ref = (r['Referencia'] ?? '').trim()
    const rot = rotMap.get(ref)
    return {
      ...r,
      _marca:        detectarMarca(r),
      _saldo:        extractSaldo(r),
      _precio:       extractPrecio(r),
      _saldoCedi:    extractSaldoCedi(r),
      _saldoZF:      extractSaldoZF(r),
      _dias:         rot ? rot.dias : 0,
      _ultimaSalida: rot ? rot.ultimaSalida : '',
      _rotEstado:    rot ? rot.estado : 'Activo',
      _valorTotal:   extractValorTotal(r),
    }
  }), [saldos, rotMap])

  // ── Totales globales (para chart, no reactivos al filtro) ──────────────────
  const totalSKUs  = enriched.length

  // ── Chart por marca ────────────────────────────────────────────────────────
  const marcaData = useMemo(() => {
    const map: Record<string, { valor: number; qty: number; skus: number }> = {}
    enriched.forEach(r => {
      if (!map[r._marca]) map[r._marca] = { valor: 0, qty: 0, skus: 0 }
      map[r._marca].valor += r._valorTotal
      map[r._marca].qty   += r._saldo
      map[r._marca].skus  += 1
    })
    return MARCAS.filter(m => map[m.name]).map(m => ({ name: m.name, valor: map[m.name].valor, qty: map[m.name].qty, skus: map[m.name].skus }))
  }, [enriched])

  // ── Niveles de stock (quintiles) ───────────────────────────────────────────
  const NIVELES = [
    { label: 'Muy bajo',  color: '#3b82f6' },
    { label: 'Bajo',      color: '#22c55e' },
    { label: 'Medio',     color: '#f59e0b' },
    { label: 'Alto',      color: '#f97316' },
    { label: 'Muy alto',  color: '#ef4444' },
  ]

  // ── Modelos del filtro de marca activo ─────────────────────────────────────
  const modelos = useMemo(() => {
    const base = marcaFilter ? enriched.filter(r => r._marca === marcaFilter) : enriched
    const map: Record<string, { valor: number; qty: number }> = {}
    base.forEach(r => {
      const m = pickModelo(r)
      if (!m) return
      if (!map[m]) map[m] = { valor: 0, qty: 0 }
      map[m].valor += r._valorTotal
      map[m].qty   += r._saldo
    })
    const list = Object.entries(map).map(([nombre, d]) => ({ nombre, ...d })).sort((a, b) => b.valor - a.valor)
    const qtys = list.map(m => m.qty).sort((a, b) => a - b)
    const q = (p: number) => qtys[Math.floor(p * (qtys.length - 1))] ?? 0
    const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)]
    return list.map(m => {
      let nivel = 0
      if      (m.qty > cuts[3]) nivel = 4
      else if (m.qty > cuts[2]) nivel = 3
      else if (m.qty > cuts[1]) nivel = 2
      else if (m.qty > cuts[0]) nivel = 1
      return { ...m, nivel }
    }).sort((a, b) => b.nivel - a.nivel || b.valor - a.valor)
  }, [enriched, marcaFilter])

  const str = (r: EnrichedRow, k: string) => String(r[k] ?? '')

  // ── Curvas y totales del modelo seleccionado ───────────────────────────────
  const curvasDelModelo = useMemo<string[]>(() => {
    if (!modeloFilter) return []
    const set = new Set<string>()
    enriched.filter(r => pickModelo(r) === modeloFilter).forEach(r => { const c = detectarCurva(r); if (c) set.add(c) })
    return CURVAS_CONOCIDAS.filter(c => set.has(c))
  }, [enriched, modeloFilter])

  const totalsPorCurva = useMemo<Record<string, { qty: number; valor: number; cedi: number; zf: number }>>(() => {
    if (!modeloFilter) return {}
    const map: Record<string, { qty: number; valor: number; cedi: number; zf: number }> = {
      _total: { qty: 0, valor: 0, cedi: 0, zf: 0 },
    }
    enriched.filter(r => pickModelo(r) === modeloFilter).forEach(r => {
      const c = detectarCurva(r) || '_sin_curva'
      if (!map[c]) map[c] = { qty: 0, valor: 0, cedi: 0, zf: 0 }
      map[c].qty   += r._saldo
      map[c].valor += r._valorTotal
      map[c].cedi  += r._saldoCedi
      map[c].zf    += r._saldoZF
      map['_total'].qty   += r._saldo
      map['_total'].valor += r._valorTotal
      map['_total'].cedi  += r._saldoCedi
      map['_total'].zf    += r._saldoZF
    })
    return map
  }, [enriched, modeloFilter])

  // ── Tabla filtrada y ordenada ──────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    let list = enriched.slice()
    if (marcaFilter)  list = list.filter(r => r._marca === marcaFilter)
    if (modeloFilter) list = list.filter(r => pickModelo(r) === modeloFilter)
    if (curvaFilter)  list = list.filter(r => detectarCurva(r) === curvaFilter)
    if (q) list = list.filter(r =>
      pickDesc(r).toLowerCase().includes(q)    ||
      str(r, 'Referencia').toLowerCase().includes(q) ||
      pickModelo(r).toLowerCase().includes(q)  ||
      str(r, 'Código').toLowerCase().includes(q)
    )
    list.sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'Saldo Sistema':    va = a._saldo;      vb = b._saldo;      break
        case 'Valor Venta ($)':  va = a._precio;     vb = b._precio;     break
        case 'Valor Total':      va = a._valorTotal; vb = b._valorTotal; break
        case 'Marca':            va = a._marca;             vb = b._marca;             break
        case 'Referencia':       va = str(a,'Referencia');  vb = str(b,'Referencia');  break
        case 'Modelo':           va = pickModelo(a);        vb = pickModelo(b);        break
        case 'Descripción':      va = pickDesc(a);          vb = pickDesc(b);          break
        case 'Rotación':         va = a._dias;              vb = b._dias;              break
        default:                 va = 0; vb = 0
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va
    })
    return list
  }, [enriched, marcaFilter, modeloFilter, curvaFilter, query, sortKey, sortDir])

  // ── KPIs reactivos al filtro activo ───────────────────────────────────────
  const kpiTotals = useMemo(() => {
    const totalUnids = rows.reduce((s, r) => s + r._saldo, 0)
    const totalValor = rows.reduce((s, r) => s + r._valorTotal, 0)
    const cediUnids  = rows.reduce((s, r) => s + r._saldoCedi, 0)
    const zfUnids    = rows.reduce((s, r) => s + r._saldoZF, 0)
    const cediValor  = rows.reduce((s, r) => {
      const pct = r._saldo > 0 ? r._saldoCedi / r._saldo : 0
      return s + r._valorTotal * pct
    }, 0)
    const zfValor = rows.reduce((s, r) => {
      const pct = r._saldo > 0 ? r._saldoZF / r._saldo : 0
      return s + r._valorTotal * pct
    }, 0)
    return { totalSKUs: rows.length, totalUnids, totalValor, cediUnids, zfUnids, cediValor, zfValor }
  }, [rows])

  function handleMarcaClick(name: string) {
    if (marcaFilter === name) { setMarcaFilter(null); setModeloFilter(null) }
    else { setMarcaFilter(name); setModeloFilter(null) }
  }
  function handleModeloClick(nombre: string) {
    setModeloFilter(prev => prev === nombre ? null : nombre)
    setCurvaFilter(null)
  }

  const daysPerEstado = useMemo(() => {
    const map: Record<string, { min: number; max: number; count: number }> = {}
    sinRotar.forEach(r => {
      const estado = (r['Estado'] ?? '').trim()
      const dias   = parseNum(r['Días Sin Rotar'])
      if (!estado || !dias) return
      if (!map[estado]) map[estado] = { min: dias, max: dias, count: 0 }
      map[estado].min = Math.min(map[estado].min, dias)
      map[estado].max = Math.max(map[estado].max, dias)
      map[estado].count++
    })
    return map
  }, [sinRotar])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-30 ml-0.5">↕</span>
    return <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const activeLabel = marcaFilter
    ? modeloFilter ? `${marcaFilter} · ${modeloFilter}` : marcaFilter
    : modeloFilter ? modeloFilter : null

  // ── Etiqueta de contexto del filtro ───────────────────────────────────────
  const filterLabel = marcaFilter || modeloFilter || curvaFilter || query
    ? `Mostrando: ${[marcaFilter, modeloFilter, curvaFilter ? `Curva ${curvaFilter}` : null, query ? `"${query}"` : null].filter(Boolean).join(' · ')}`
    : 'Todo el inventario'

  return (
    <div>
      {/* ── KPI Cards reactivos ──────────────────────────────────────────── */}
      <div className="mb-5 space-y-2">
        {/* Fila 1: totales globales */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'SKUs en stock',        value: fmtN(kpiTotals.totalSKUs),  sub: `de ${fmtN(totalSKUs)} total` },
            { label: 'Unidades totales',      value: fmtN(kpiTotals.totalUnids), sub: 'unidades físicas' },
            { label: 'Valor inventario',      value: fmt(kpiTotals.totalValor),  sub: 'precio venta × saldo' },
          ].map(c => (
            <div key={c.label} className="rounded-[10px] bg-[var(--bg)] px-3 py-3">
              <div className="text-[10px] text-[var(--text-muted)] mb-1">{c.label}</div>
              <div className="text-[17px] font-bold text-[var(--text)] leading-tight">{c.value}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Fila 2: distribución por bodega */}
        <div className="grid grid-cols-2 gap-3">
          {/* CEDI */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3b82f6] mb-0.5">Bodega CEDI</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[18px] font-bold text-[var(--text)] num leading-tight">{fmtN(kpiTotals.cediUnids)}</span>
                <span className="text-[11px] text-[var(--text-muted)]">und</span>
                <span className="text-[11px] font-semibold text-[var(--text-sub)] num ml-auto">{fmt(kpiTotals.cediValor)}</span>
              </div>
              <div className="mt-1.5 h-[3px] rounded-full overflow-hidden bg-[var(--border)]">
                <div className="h-full rounded-full bg-[#3b82f6] transition-all duration-500"
                  style={{ width: kpiTotals.totalUnids > 0 ? `${(kpiTotals.cediUnids / kpiTotals.totalUnids) * 100}%` : '0%' }} />
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                {kpiTotals.totalUnids > 0 ? Math.round((kpiTotals.cediUnids / kpiTotals.totalUnids) * 100) : 0}% del total
              </div>
            </div>
          </div>

          {/* Zona Franca */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#f59e0b] mb-0.5">Zona Franca</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[18px] font-bold text-[var(--text)] num leading-tight">{fmtN(kpiTotals.zfUnids)}</span>
                <span className="text-[11px] text-[var(--text-muted)]">und</span>
                <span className="text-[11px] font-semibold text-[var(--text-sub)] num ml-auto">{fmt(kpiTotals.zfValor)}</span>
              </div>
              <div className="mt-1.5 h-[3px] rounded-full overflow-hidden bg-[var(--border)]">
                <div className="h-full rounded-full bg-[#f59e0b] transition-all duration-500"
                  style={{ width: kpiTotals.totalUnids > 0 ? `${(kpiTotals.zfUnids / kpiTotals.totalUnids) * 100}%` : '0%' }} />
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                {kpiTotals.totalUnids > 0 ? Math.round((kpiTotals.zfUnids / kpiTotals.totalUnids) * 100) : 0}% del total
              </div>
            </div>
          </div>
        </div>

        {/* Etiqueta de filtro activo */}
        {(marcaFilter || modeloFilter || curvaFilter || query) && (
          <div className="text-[10px] text-[var(--brand-blue)] font-medium px-0.5">{filterLabel}</div>
        )}
      </div>

      {/* ── Gráfico por marca ─────────────────────────────────────────────── */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
            Valor por marca
            {activeLabel && <span className="normal-case font-normal ml-1">· {activeLabel}</span>}
          </div>
          {(marcaFilter || modeloFilter) && (
            <button onClick={() => { setMarcaFilter(null); setModeloFilter(null) }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline underline-offset-2">
              Quitar filtros
            </button>
          )}
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={marcaData} barSize={44}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--nav-hover)' }} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(data: { name?: string }) => { if (data?.name) handleMarcaClick(data.name) }}>
                {marcaData.map(d => (
                  <Cell key={d.name} fill={MARCA_COLOR[d.name] ?? '#94a3b8'}
                    opacity={marcaFilter && marcaFilter !== d.name ? 0.22 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chips de modelos ──────────────────────────────────────────────── */}
      {modelos.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Modelos · {modelos.length}
              {marcaFilter && <span className="font-normal normal-case"> en {marcaFilter}</span>}
            </div>
            <div ref={legendRef} className="relative">
              <button onClick={() => setLegendOpen(o => !o)}
                className="w-[18px] h-[18px] rounded-full border border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] hover:border-[var(--text-sub)] hover:text-[var(--text)] transition-colors flex items-center justify-center leading-none"
                title="Clasificación de colores">
                ?
              </button>
              {legendOpen && (
                <div className="absolute right-0 top-full mt-2 w-[220px] bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-lg p-3 z-30">
                  <div className="text-[11px] font-semibold text-[var(--text)] mb-2">Nivel de stock por modelo</div>
                  <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">Calculado por quintiles sobre las unidades en stock de los modelos visibles.</p>
                  <div className="space-y-1.5">
                    {NIVELES.map((n, i) => (
                      <div key={n.label} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                        <span className="text-[11px] text-[var(--text-sub)] flex-1">{n.label}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">quintil {i + 1}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed border-t border-[var(--border)] pt-2">El color cambia al filtrar por marca o modelo.</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto">
            {modelos.map(m => {
              const isActive = modeloFilter === m.nombre
              const color = NIVELES[m.nivel]?.color ?? '#64748b'
              return (
                <button key={m.nombre} onClick={() => handleModeloClick(m.nombre)}
                  title={`${fmtN(m.qty)} und · ${fmt(m.valor)} · ${NIVELES[m.nivel]?.label}`}
                  className="rounded-full px-2.5 py-[3px] text-[11px] font-medium transition-all border leading-none"
                  style={isActive
                    ? { background: color, borderColor: color, color: '#fff' }
                    : { background: color + '18', borderColor: color + '70', color }}>
                  {m.nombre}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Chips de curva ────────────────────────────────────────────────── */}
      {modeloFilter && curvasDelModelo.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] flex-shrink-0">Curva</span>
          <button onClick={() => setCurvaFilter(null)}
            className={`text-[11px] font-medium px-3 py-[3px] rounded-full border transition-all leading-none ${
              !curvaFilter ? 'bg-[var(--text-sub)] border-[var(--text-sub)] text-[var(--card)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)]'
            }`}>
            Todas
          </button>
          {curvasDelModelo.map(c => {
            const isActive = curvaFilter === c
            const color = CURVA_COLOR[c] ?? '#94a3b8'
            return (
              <button key={c} onClick={() => setCurvaFilter(isActive ? null : c)}
                className="text-[11px] font-semibold px-3 py-[3px] rounded-full border transition-all leading-none"
                style={isActive ? { background: color, borderColor: color, color: '#fff' } : { background: color + '18', borderColor: color + '70', color }}>
                {c}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Buscador ──────────────────────────────────────────────────────── */}
      <div className="mb-3">
        <input type="text" placeholder="Buscar por código, referencia, modelo o descripción…"
          value={query} onChange={e => setQuery(e.target.value)}
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
        />
      </div>

      {/* ── Resumen del modelo seleccionado con bodega ────────────────────── */}
      {modeloFilter && curvasDelModelo.length > 0 && (
        <div className="mb-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {modeloFilter} — resumen de stock
          </div>
          <div className="grid divide-x divide-[var(--border)]"
            style={{ gridTemplateColumns: `repeat(${curvasDelModelo.length + 1}, 1fr)` }}>
            {curvasDelModelo.map(c => {
              const color = CURVA_COLOR[c] ?? '#94a3b8'
              const t = totalsPorCurva[c] ?? { qty: 0, valor: 0, cedi: 0, zf: 0 }
              const pct = totalsPorCurva['_total']?.qty ? Math.round((t.qty / totalsPorCurva['_total'].qty) * 100) : 0
              return (
                <button key={c} onClick={() => setCurvaFilter(curvaFilter === c ? null : c)}
                  className={`p-3 text-left transition-colors hover:bg-[var(--nav-hover)] ${curvaFilter === c ? 'bg-[var(--nav-hover)]' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>Curva {c}</span>
                  </div>
                  <div className="text-[18px] font-bold num text-[var(--text)] leading-tight">{fmtN(t.qty)}</div>
                  {/* Desglose por bodega */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3b82f6]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                      {fmtN(t.cedi)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#f59e0b]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      {fmtN(t.zf)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{fmt(t.valor)}</div>
                  <div className="mt-1.5 h-[3px] bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{pct}% del modelo</div>
                </button>
              )
            })}
            {/* Card TOTAL */}
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Total</div>
              <div className="text-[18px] font-bold num text-[var(--text)] leading-tight">
                {fmtN(totalsPorCurva['_total']?.qty ?? 0)}
              </div>
              {/* Bodega TOTAL */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3b82f6]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                  CEDI {fmtN(totalsPorCurva['_total']?.cedi ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#f59e0b]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                  ZF {fmtN(totalsPorCurva['_total']?.zf ?? 0)}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {fmt(totalsPorCurva['_total']?.valor ?? 0)}
              </div>
              <div className="mt-1.5 h-[3px] bg-[var(--brand-blue)] rounded-full opacity-30" />
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{curvasDelModelo.length} curvas</div>
            </div>
          </div>
        </div>
      )}

      <div className="text-[11px] text-[var(--text-muted)] mb-2">
        {rows.length} de {totalSKUs} SKUs
        {marcaFilter  ? ` · ${marcaFilter}`       : ''}
        {modeloFilter ? ` · ${modeloFilter}`      : ''}
        {curvaFilter  ? ` · Curva ${curvaFilter}` : ''}
        {query        ? ` · "${query}"`           : ''}
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      <div className="table-scroll" style={{ maxHeight: 420 }}>
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-[var(--card)] z-10">
            <tr>
              {([
                { key: 'Marca',       label: 'Marca' },
                { key: 'Referencia',  label: 'Referencia' },
                { key: 'Modelo',      label: 'Modelo' },
                { key: 'Descripción', label: 'Descripción' },
              ] as { key: SortKey; label: string }[]).map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap text-left">
                  {col.label}<SortIcon k={col.key} />
                </th>
              ))}

              {/* Stock con sub-header de bodegas */}
              <th onClick={() => toggleSort('Saldo Sistema')}
                className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap text-right">
                Stock<SortIcon k="Saldo Sistema" />
                <div className="flex items-center justify-end gap-2 mt-0.5 font-normal normal-case tracking-normal">
                  <span className="text-[#3b82f6]">CEDI</span>
                  <span className="text-[#f59e0b]">ZF</span>
                </div>
              </th>

              {/* Rotación */}
              <th className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => toggleSort('Rotación')} className="cursor-pointer select-none hover:text-[var(--text)]">
                    Rotación<SortIcon k="Rotación" />
                  </button>
                  <div ref={rotRef}>
                    <button onClick={openRotPopup}
                      className="w-[15px] h-[15px] rounded-full border border-[var(--border)] text-[9px] font-bold text-[var(--text-muted)] hover:border-[var(--text-sub)] hover:text-[var(--text)] transition-colors flex items-center justify-center leading-none flex-shrink-0">
                      ?
                    </button>
                  </div>
                </div>
              </th>

              {([
                { key: 'Valor Venta ($)', label: 'Valor Unit.' },
                { key: 'Valor Total',     label: 'Valor Total' },
              ] as { key: SortKey; label: string }[]).map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap text-right">
                  {col.label}<SortIcon k={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const marca = String(r._marca)
              const color = MARCA_COLOR[marca] ?? '#94a3b8'
              return (
                <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className="px-[10px] py-[9px]">
                    <button onClick={() => handleMarcaClick(marca)} className="flex items-center gap-1.5 group">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[11px] text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">{marca}</span>
                    </button>
                  </td>
                  <td className="px-[10px] py-[9px] text-[var(--text-sub)] num text-[11px]">{str(r, 'Referencia')}</td>
                  <td className="px-[10px] py-[9px]">
                    <button onClick={() => handleModeloClick(pickModelo(r))} className="font-medium text-[var(--text)] hover:underline text-left">
                      {pickModelo(r)}
                    </button>
                  </td>
                  <td className="px-[10px] py-[9px] text-[var(--text-sub)] max-w-[200px] truncate">{pickDesc(r)}</td>

                  {/* Stock con split bodega */}
                  <td className="px-[10px] py-[9px] text-right">
                    <div className="text-[11px] font-semibold text-[var(--text)] num">{fmtN(r._saldo)}</div>
                    {(r._saldoCedi > 0 || r._saldoZF > 0) && (
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        <span className="text-[9px] text-[#3b82f6] num">{fmtN(r._saldoCedi)}</span>
                        <span className="text-[9px] text-[#f59e0b] num">{fmtN(r._saldoZF)}</span>
                      </div>
                    )}
                  </td>

                  <td className="px-[10px] py-[9px] text-right">
                    {r._rotEstado === 'Activo' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#22c55e]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />Activo
                      </span>
                    ) : (
                      <span className={`inline-block text-[11px] font-semibold tabular-nums ${
                        r._rotEstado === 'CRITICO' ? 'text-[#ef4444]' :
                        r._rotEstado === 'ALTO'    ? 'text-[#f97316]' :
                        r._rotEstado === 'MEDIO'   ? 'text-[#f59e0b]' : 'text-[var(--text-sub)]'
                      }`}>
                        {fmtN(r._dias)} días
                      </span>
                    )}
                  </td>
                  <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{fmt(r._precio)}</td>
                  <td className="px-[10px] py-[9px] text-right num text-[11px]">
                    <span className="font-semibold text-[var(--text)]">{fmt(r._valorTotal)}</span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">Sin resultados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Popup rotación */}
      {rotPopup && rotPopupPos && (
        <div ref={rotRef}
          style={{ position: 'fixed', top: rotPopupPos.top, right: rotPopupPos.right, zIndex: 9999 }}
          className="w-[260px] bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-lg p-4">
          <div className="text-[12px] font-semibold text-[var(--text)] mb-1">Clasificación de rotación</div>
          <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
            Basada en los días transcurridos desde la última venta registrada del producto.
          </p>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e] mt-[3px] flex-shrink-0" />
              <div>
                <div className="text-[11px] font-semibold text-[#22c55e]">Activo</div>
                <div className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-0.5">Producto con ventas recientes.</div>
              </div>
            </div>
            {([
              { estado: 'MEDIO',   color: '#f59e0b', label: 'Medio'   },
              { estado: 'ALTO',    color: '#f97316', label: 'Alto'    },
              { estado: 'CRITICO', color: '#ef4444', label: 'Crítico' },
            ] as { estado: string; color: string; label: string }[]).map(({ estado, color, label }) => {
              const d = daysPerEstado[estado]
              return (
                <div key={estado} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full mt-[3px] flex-shrink-0" style={{ background: color }} />
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color }}>{label}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {d ? d.min === d.max ? `${d.min} días · ${d.count} SKUs` : `${d.min}–${d.max} días · ${d.count} SKUs` : 'Sin datos'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
