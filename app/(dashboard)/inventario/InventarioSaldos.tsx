'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
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
  return String(r['Modelo'] || r['Grupo'] || '').trim()
}
function pickDesc(r: Record<string, string | number>): string {
  return String(r['Descripción'] || r['Producto'] || '').trim()
}

// ── Parser de Producto: "CALZ.VITEK REF.VTK-6240M-01 YAMAL" → ref + modelo ──
function parseProducto(p: string): { ref: string; modelo: string } {
  const m = p.toUpperCase().match(/REF\.?\s*([A-Z0-9][A-Z0-9-]*)\s*(.*)$/)
  if (!m) return { ref: '', modelo: '' }
  return { ref: m[1], modelo: m[2].trim() }
}

// ── Detección de curva (B = Baby) ─────────────────────────────────────────────
const CURVAS_CONOCIDAS = ['M', 'L', 'Y', 'C', 'B'] as const
const CURVA_COLOR: Record<string, string> = { M: '#3b82f6', L: '#22c55e', Y: '#f59e0b', C: '#a855f7', B: '#ec4899' }
const CURVA_LABEL: Record<string, string> = { M: 'M', L: 'L', Y: 'Y', C: 'C', B: 'Baby' }

function detectarCurva(r: Row | Record<string, string | number>): string {
  const col = String(r['Curva'] ?? '').trim().toUpperCase()
  if ((CURVAS_CONOCIDAS as readonly string[]).includes(col)) return col
  const desc = pickDesc(r as Row).toUpperCase()
  const dm = desc.match(/\bCURV[AO]?\.?\s*([MLYCB])\b/)
  if (dm) return dm[1]
  const ref = String(r['Referencia'] ?? '').trim().toUpperCase()
  const seg = ref.match(/(?:^|[-_])([MLYCB])(?:[-_]|$)/)
  if (seg) return seg[1]
  const dig = ref.match(/\d([MLYCB])(?:-|$)/)
  if (dig) return dig[1]
  const end = ref.match(/[-_ ]([MLYCB])$/)
  if (end) return end[1]
  const last = ref.slice(-1)
  if ((CURVAS_CONOCIDAS as readonly string[]).includes(last)) return last
  return ''
}

// ── Normalización para búsqueda: minúsculas, sin espacios ni guiones ─────────
// "6264 C-05", "6264c05" y "6264C-05" encuentran lo mismo
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s-]/g, '')
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
  const marcaCol = (r['Marca'] ?? '').trim().toUpperCase()
  if (marcaCol) {
    if (marcaCol.includes('ATHLETIC')) return 'Athletic Air'
    if (marcaCol.includes('VITEK'))    return 'Vitek'
    if (marcaCol.includes('PEGASUS'))  return 'Pegasus'
    if (marcaCol.includes('MARIE') || marcaCol.includes('MARY')) return 'Marie Sophie'
  }
  const desc = (pickDesc(r)).toUpperCase()
  const ref  = (r['Referencia'] ?? '').toUpperCase()
  const agr  = (r['Agrupación'] ?? '').toUpperCase()
  if (desc.includes('ATHLETIC') || agr.includes('ATHLETIC') || ref.startsWith('ATH')) return 'Athletic Air'
  if (desc.includes('VITEK')    || agr.includes('VITEK')    || ref.startsWith('VTK') || ref.startsWith('VIT')) return 'Vitek'
  if (desc.includes('PEGASUS')  || agr.includes('PEGASUS')  || ref.startsWith('PGS') || ref.startsWith('PEG')) return 'Pegasus'
  if (desc.includes('MARIE')    || desc.includes('MARY SOFI') || ref.startsWith('MF-')) return 'Marie Sophie'
  return 'Otros'
}

const BODEGA = {
  cedi: { label: 'CEDI',        color: '#3b82f6' },
  zf:   { label: 'Zona Franca', color: '#f59e0b' },
}

type SortKey = 'Marca' | 'Referencia' | 'Modelo' | 'Descripción' | 'Saldo Sistema' | 'Valor Venta ($)' | 'Valor Total' | 'Rotación'
type SortDir = 'asc' | 'desc'
type ModelSort = 'stock' | 'az'

interface Props { saldos: Row[]; sinRotar: Row[] }

export default function InventarioSaldos({ saldos, sinRotar }: Props) {
  const [marcaFilter,  setMarcaFilter]  = useState<string | null>(null)
  const [modeloFilter, setModeloFilter] = useState<string | null>(null)
  const [curvaFilter,  setCurvaFilter]  = useState<string | null>(null)
  const [stockMin,     setStockMin]     = useState(0)
  const [stockMax,     setStockMax]     = useState<number | null>(null)
  const [query,        setQuery]        = useState('')
  const [modelSort,    setModelSort]    = useState<ModelSort>('stock')
  const [selectedBase, setSelectedBase] = useState<string | null>(null)
  const [openBases,    setOpenBases]    = useState<Set<string>>(new Set())
  const [openCurvas,   setOpenCurvas]   = useState<Set<string>>(new Set())
  const [openRefs,     setOpenRefs]     = useState<Set<string>>(new Set())
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
    const parsed = parseProducto(pickDesc(r))
    const ref    = (r['Referencia'] ?? '').trim() || parsed.ref
    const modelo = pickModelo(r) || parsed.modelo
    const rot = rotMap.get(ref)
    return {
      ...r,
      Referencia: ref,
      Modelo:     modelo,
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

  const totalSKUs = enriched.length

  // ── Rango de pares (slider) ────────────────────────────────────────────────
  const maxSaldo = useMemo(
    () => enriched.reduce((m, r) => Math.max(m, r._saldo), 0),
    [enriched]
  )
  const effStockMax  = stockMax ?? maxSaldo
  const rangoActivo  = stockMin > 0 || (stockMax !== null && stockMax < maxSaldo)
  const inRango      = useCallback(
    (saldo: number) => saldo >= stockMin && saldo <= effStockMax,
    [stockMin, effStockMax]
  )

  // ── Totales por marca (para chips del sidebar) ─────────────────────────────
  const marcaData = useMemo(() => {
    const map: Record<string, { valor: number; qty: number; skus: number }> = {}
    enriched.forEach(r => {
      if (!map[r._marca]) map[r._marca] = { valor: 0, qty: 0, skus: 0 }
      map[r._marca].valor += r._valorTotal
      map[r._marca].qty   += r._saldo
      map[r._marca].skus  += 1
    })
    return MARCAS.filter(m => map[m.name]).map(m => ({ name: m.name, ...map[m.name] }))
  }, [enriched])

  // ── Niveles de stock (quintiles) ───────────────────────────────────────────
  const NIVELES = [
    { label: 'Muy bajo',  color: '#3b82f6' },
    { label: 'Bajo',      color: '#22c55e' },
    { label: 'Medio',     color: '#f59e0b' },
    { label: 'Alto',      color: '#f97316' },
    { label: 'Muy alto',  color: '#ef4444' },
  ]

  // ── Lista de modelos (navegación principal) ────────────────────────────────
  const modelos = useMemo(() => {
    const q = query.toLowerCase().trim()
    const base = (marcaFilter ? enriched.filter(r => r._marca === marcaFilter) : enriched)
      .filter(r => inRango(r._saldo))
    const map: Record<string, { valor: number; qty: number }> = {}
    base.forEach(r => {
      const m = pickModelo(r)
      if (!m) return
      if (!map[m]) map[m] = { valor: 0, qty: 0 }
      map[m].valor += r._valorTotal
      map[m].qty   += r._saldo
    })
    let list = Object.entries(map).map(([nombre, d]) => ({ nombre, ...d }))
    const terms = q.split(/\s+/).filter(Boolean).map(norm)
    if (terms.length) list = list.filter(m => terms.some(t => norm(m.nombre).includes(t)))

    const qtys = list.map(m => m.qty).sort((a, b) => a - b)
    const qq = (p: number) => qtys[Math.floor(p * (qtys.length - 1))] ?? 0
    const cuts = [qq(0.2), qq(0.4), qq(0.6), qq(0.8)]
    const withNivel = list.map(m => {
      let nivel = 0
      if      (m.qty > cuts[3]) nivel = 4
      else if (m.qty > cuts[2]) nivel = 3
      else if (m.qty > cuts[1]) nivel = 2
      else if (m.qty > cuts[0]) nivel = 1
      return { ...m, nivel }
    })
    return modelSort === 'az'
      ? withNivel.sort((a, b) => a.nombre.localeCompare(b.nombre))
      : withNivel.sort((a, b) => b.qty - a.qty)
  }, [enriched, marcaFilter, inRango, query, modelSort])

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
    enriched
      .filter(r => pickModelo(r) === modeloFilter)
      .filter(r => inRango(r._saldo))
      .forEach(r => {
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
  }, [enriched, modeloFilter, inRango])

  // ── Tabla filtrada y ordenada ──────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    let list = enriched.slice()
    if (marcaFilter)  list = list.filter(r => r._marca === marcaFilter)
    if (modeloFilter) list = list.filter(r => pickModelo(r) === modeloFilter)
    if (curvaFilter)  list = list.filter(r => detectarCurva(r) === curvaFilter)
    if (rangoActivo)  list = list.filter(r => inRango(r._saldo))
    if (q) {
      // Multi-término: cada palabra debe coincidir en algún campo (ref, modelo,
      // descripción, código o marca), normalizando espacios y guiones
      const terms = q.split(/\s+/).filter(Boolean).map(norm)
      list = list.filter(r => {
        const hay = [
          pickDesc(r), str(r, 'Referencia'), pickModelo(r),
          str(r, 'Código'), r._marca,
        ].map(v => norm(String(v)))
        return terms.every(t => hay.some(h => h.includes(t)))
      })
    }
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
  }, [enriched, marcaFilter, modeloFilter, curvaFilter, rangoActivo, inRango, query, sortKey, sortDir])

  // ── Fichas jerárquicas: referencia → curva → color (desde rows) ────────────
  // "6264C-01" → base "6264" + curva "C" + color "01"
  // "ATH-6011B-03" → base "ATH-6011" + curva "B" (la letra de curva debe ir
  // precedida de dígito para no comerse letras del nombre)
  //
  // El agrupado por referencia base (que junta varias curvas bajo un mismo
  // número) aplica a todas las marcas por igual. Lo que cambia por marca es
  // solo la presentación: Vitek nestea (hay que abrir la referencia para ver
  // las curvas); el resto de marcas muestra las curvas directo, sin ese
  // click extra, porque su única variación entre referencias es la curva.
  const refGroups = useMemo(() => {
    const map: Record<string, {
      base: string; marca: string; qty: number; valor: number; cedi: number; zf: number
      curvas: Record<string, { curva: string; qty: number; valor: number; cedi: number; zf: number
        items: Record<string, { ref: string; qty: number; cedi: number; zf: number }> }>
    }> = {}
    rows.forEach(r => {
      const ref = str(r, 'Referencia') || 'Sin referencia'
      const mColor = ref.match(/^(.*)-(\d+)$/)
      const stem   = mColor ? mColor[1] : ref
      const mCurva = stem.match(/^(.*\d)([MLYCB])$/)
      const base   = mCurva ? mCurva[1] : stem
      const curva  = mCurva ? mCurva[2] : (detectarCurva(r) || '—')
      if (!map[base]) map[base] = { base, marca: r._marca, qty: 0, valor: 0, cedi: 0, zf: 0, curvas: {} }
      const g = map[base]
      g.qty += r._saldo; g.valor += r._valorTotal; g.cedi += r._saldoCedi; g.zf += r._saldoZF
      if (!g.curvas[curva]) g.curvas[curva] = { curva, qty: 0, valor: 0, cedi: 0, zf: 0, items: {} }
      const cg = g.curvas[curva]
      cg.qty += r._saldo; cg.valor += r._valorTotal; cg.cedi += r._saldoCedi; cg.zf += r._saldoZF
      if (!cg.items[ref]) cg.items[ref] = { ref, qty: 0, cedi: 0, zf: 0 }
      cg.items[ref].qty  += r._saldo
      cg.items[ref].cedi += r._saldoCedi
      cg.items[ref].zf   += r._saldoZF
    })
    const curvaOrden = (c: string) => {
      const i = (CURVAS_CONOCIDAS as readonly string[]).indexOf(c)
      return i === -1 ? 99 : i
    }
    return Object.values(map)
      .map(g => ({
        ...g,
        curvas: Object.values(g.curvas)
          .map(cg => ({ ...cg, items: Object.values(cg.items).sort((a, b) => a.ref.localeCompare(b.ref)) }))
          .sort((a, b) => curvaOrden(a.curva) - curvaOrden(b.curva)),
      }))
      .sort((a, b) => a.base.localeCompare(b.base))
  }, [rows])

  // Chip activo (si los filtros lo dejaron por fuera, vuelve a "Todas")
  const activeBase = selectedBase && refGroups.some(g => g.base === selectedBase) ? selectedBase : null
  const fichasVisibles = activeBase ? refGroups.filter(g => g.base === activeBase) : refGroups

  // Visibilidad: con modelo seleccionado se muestran todas; con solo búsqueda
  // se muestran hasta 12 (más allá, pedir afinar la búsqueda)
  const FICHAS_MAX_QUERY = 12
  const showFichas   = refGroups.length > 0 && (modeloFilter !== null || query.trim() !== '')
  const fichasSobran = !modeloFilter && query.trim() !== '' && refGroups.length > FICHAS_MAX_QUERY

  // Auto-expansión: si la búsqueda reduce a 1 referencia se selecciona sola;
  // 1 curva se abre; 1 color se abre hasta las bodegas
  useEffect(() => {
    if (!query.trim()) return
    if (refGroups.length === 1) {
      const g = refGroups[0]
      setSelectedBase(g.base)
      if (g.curvas.length === 1) {
        const cg = g.curvas[0]
        setOpenCurvas(new Set([`${g.base}|${cg.curva}`]))
        if (cg.items.length === 1) setOpenRefs(new Set([cg.items[0].ref]))
      }
    }
  }, [refGroups, query])

  function toggleBase(base: string) {
    setOpenBases(prev => {
      const next = new Set(prev)
      if (next.has(base)) next.delete(base)
      else next.add(base)
      return next
    })
  }
  function toggleCurva(key: string) {
    setOpenCurvas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleRef(ref: string) {
    setOpenRefs(prev => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  // ── Totales reactivos al filtro (barra sticky) ─────────────────────────────
  const kpiTotals = useMemo(() => {
    const totalUnids = rows.reduce((s, r) => s + r._saldo, 0)
    const totalValor = rows.reduce((s, r) => s + r._valorTotal, 0)
    const cediUnids  = rows.reduce((s, r) => s + r._saldoCedi, 0)
    const zfUnids    = rows.reduce((s, r) => s + r._saldoZF, 0)
    const cediValor  = rows.reduce((s, r) => s + r._valorTotal * (r._saldo > 0 ? r._saldoCedi / r._saldo : 0), 0)
    const zfValor    = rows.reduce((s, r) => s + r._valorTotal * (r._saldo > 0 ? r._saldoZF   / r._saldo : 0), 0)
    return { totalSKUs: rows.length, totalUnids, totalValor, cediUnids, zfUnids, cediValor, zfValor }
  }, [rows])

  const cediPct = kpiTotals.totalUnids > 0 ? (kpiTotals.cediUnids / kpiTotals.totalUnids) * 100 : 0
  const zfPct   = kpiTotals.totalUnids > 0 ? (kpiTotals.zfUnids   / kpiTotals.totalUnids) * 100 : 0

  function resetAcordeones() {
    setSelectedBase(null)
    setOpenBases(new Set())
    setOpenCurvas(new Set())
    setOpenRefs(new Set())
  }
  function handleMarcaClick(name: string) {
    if (marcaFilter === name) { setMarcaFilter(null); setModeloFilter(null) }
    else { setMarcaFilter(name); setModeloFilter(null) }
    setCurvaFilter(null)
    resetAcordeones()
  }
  function handleModeloClick(nombre: string) {
    setModeloFilter(prev => prev === nombre ? null : nombre)
    setCurvaFilter(null)
    resetAcordeones()
  }
  function clearFilters() {
    setMarcaFilter(null); setModeloFilter(null); setCurvaFilter(null)
    setStockMin(0); setStockMax(null); setQuery('')
    resetAcordeones()
  }

  const hayFiltros = Boolean(marcaFilter || modeloFilter || curvaFilter || rangoActivo || query)

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

  const tituloTotales = modeloFilter
    ? `Total ${modeloFilter}${curvaFilter ? ` · curva ${CURVA_LABEL[curvaFilter] ?? curvaFilter}` : ''}`
    : marcaFilter ? `Total ${marcaFilter}` : 'Inventario total'

  return (
    <div>
      {/* ════════ Encabezado — justo debajo del botón de pestaña ════════ */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[13.5px] font-bold text-[var(--text)]">Saldos Físicos</span>
        <span className="text-[11px] text-[var(--text-muted)]">stock actual por referencia</span>
      </div>

      {/* ════════ Ficha 1 — Inventario total (independiente, ancho completo) ════════ */}
      <div className="sticky top-[62px] md:top-[74px] z-10 mb-5 rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-card px-4 py-3">
        <div className="flex items-center gap-4 md:gap-6 flex-wrap">
          <div>
            <div className="text-[10px] text-[var(--text-muted)] leading-tight">{tituloTotales}</div>
            <div className="text-[20px] font-bold num text-[var(--text)] leading-tight">
              {fmtN(kpiTotals.totalUnids)}
              <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">und · {fmtN(kpiTotals.totalSKUs)} SKUs</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] num">{fmt(kpiTotals.totalValor)}</div>
          </div>

          <div>
            <div className="text-[10px] font-semibold leading-tight" style={{ color: BODEGA.cedi.color }}>
              <span className="inline-block w-[7px] h-[7px] rounded-full mr-1" style={{ background: BODEGA.cedi.color }} />
              CEDI
            </div>
            <div className="text-[15px] font-bold num leading-tight" style={{ color: BODEGA.cedi.color }}>
              {fmtN(kpiTotals.cediUnids)}
              <span className="text-[10px] font-normal ml-1">· {Math.round(cediPct)}%</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] num">{fmt(kpiTotals.cediValor)}</div>
          </div>

          <div>
            <div className="text-[10px] font-semibold leading-tight" style={{ color: BODEGA.zf.color }}>
              <span className="inline-block w-[7px] h-[7px] rounded-full mr-1" style={{ background: BODEGA.zf.color }} />
              Zona Franca
            </div>
            <div className="text-[15px] font-bold num leading-tight" style={{ color: BODEGA.zf.color }}>
              {fmtN(kpiTotals.zfUnids)}
              <span className="text-[10px] font-normal ml-1">· {Math.round(zfPct)}%</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] num">{fmt(kpiTotals.zfValor)}</div>
          </div>

          <div className="flex-1 min-w-[110px]">
            <div className="h-[6px] rounded-full overflow-hidden flex bg-[var(--border)]">
              <div className="h-full transition-all duration-500" style={{ width: `${cediPct}%`, background: BODEGA.cedi.color }} />
              <div className="h-full transition-all duration-500" style={{ width: `${zfPct}%`,   background: BODEGA.zf.color }} />
            </div>
            {hayFiltros && (
              <button
                onClick={clearFilters}
                className="mt-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] underline underline-offset-2"
              >
                Quitar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="md:grid md:grid-cols-[252px_minmax(0,1fr)] md:gap-5 md:items-start">

      {/* ════════ Ficha 2 — Filtros (fija/sticky al hacer scroll) ════════ */}
      <aside className="mb-5 md:mb-0 md:sticky md:top-[172px] rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-card p-4 space-y-4">

        {/* Buscador */}
        <input
          type="text"
          placeholder="Buscar modelo, referencia…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
        />

        {/* Marcas */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Marcas</div>
          <div className="flex flex-wrap gap-1.5">
            {marcaData.map(m => {
              const isActive = marcaFilter === m.name
              const color = MARCA_COLOR[m.name] ?? '#94a3b8'
              return (
                <button
                  key={m.name}
                  onClick={() => handleMarcaClick(m.name)}
                  title={`${fmtN(m.qty)} und · ${fmt(m.valor)} · ${m.skus} SKUs`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[4px] text-[11px] font-medium transition-all leading-none"
                  style={isActive
                    ? { background: color, borderColor: color, color: '#fff' }
                    : { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-sub)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isActive ? '#fff' : color }} />
                  {m.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Rango de pares */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pares</span>
            {rangoActivo && (
              <button
                onClick={() => { setStockMin(0); setStockMax(null) }}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] underline underline-offset-2"
              >
                Restablecer
              </button>
            )}
          </div>
          <div className="relative h-5 mb-1.5">
            <div className="absolute top-1/2 -translate-y-1/2 h-[4px] w-full rounded-full bg-[var(--border)]" />
            {maxSaldo > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[var(--brand-blue)]"
                style={{
                  left:  `${(stockMin / maxSaldo) * 100}%`,
                  width: `${Math.max(((effStockMax - stockMin) / maxSaldo) * 100, 0)}%`,
                }}
              />
            )}
            <input
              type="range" min={0} max={maxSaldo} value={stockMin}
              onChange={e => setStockMin(Math.min(Number(e.target.value), effStockMax))}
              className="dual-range absolute inset-0 w-full h-full m-0"
            />
            <input
              type="range" min={0} max={maxSaldo} value={effStockMax}
              onChange={e => {
                const v = Number(e.target.value)
                setStockMax(v >= maxSaldo ? null : Math.max(v, stockMin))
              }}
              className="dual-range absolute inset-0 w-full h-full m-0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={0} max={effStockMax} value={stockMin}
              onChange={e => setStockMin(Math.max(0, Math.min(Number(e.target.value) || 0, effStockMax)))}
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2 py-[4px] text-[11px] num text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
            />
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">a</span>
            <input
              type="number" min={stockMin} value={effStockMax}
              onChange={e => {
                const v = Number(e.target.value) || 0
                setStockMax(v >= maxSaldo ? null : Math.max(v, stockMin))
              }}
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2 py-[4px] text-[11px] num text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
            />
          </div>
        </div>

        {/* Lista de modelos */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Modelos · {modelos.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setModelSort(s => s === 'stock' ? 'az' : 'stock')}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] px-1.5 py-0.5 rounded border border-[var(--border)] leading-none"
                title="Cambiar orden"
              >
                {modelSort === 'stock' ? '↓ stock' : 'A–Z'}
              </button>
              <div ref={legendRef} className="relative">
                <button
                  onClick={() => setLegendOpen(o => !o)}
                  className="w-[16px] h-[16px] rounded-full border border-[var(--border)] text-[9px] font-bold text-[var(--text-muted)] hover:border-[var(--text-sub)] hover:text-[var(--text)] transition-colors flex items-center justify-center leading-none"
                  title="Clasificación de colores"
                >
                  ?
                </button>
                {legendOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[210px] bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-lg p-3 z-30">
                    <div className="text-[11px] font-semibold text-[var(--text)] mb-2">Nivel de stock</div>
                    <div className="space-y-1.5">
                      {NIVELES.map((n, i) => (
                        <div key={n.label} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                          <span className="text-[11px] text-[var(--text-sub)] flex-1">{n.label}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">quintil {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-[190px] md:max-h-[46vh] overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-1">
            {modelos.map(m => {
              const isActive = modeloFilter === m.nombre
              const color = NIVELES[m.nivel]?.color ?? '#64748b'
              return (
                <button
                  key={m.nombre}
                  onClick={() => handleModeloClick(m.nombre)}
                  title={`${fmtN(m.qty)} und · ${fmt(m.valor)}`}
                  className={`w-full flex items-center gap-2 px-2 py-[5px] rounded-[7px] text-left transition-colors ${
                    isActive ? 'bg-[var(--brand-blue)]' : 'hover:bg-[var(--nav-hover)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isActive ? '#fff' : color }} />
                  <span className={`text-[12px] font-medium truncate flex-1 ${isActive ? 'text-white' : 'text-[var(--text)]'}`}>
                    {m.nombre}
                  </span>
                  <span className={`text-[11px] num flex-shrink-0 ${isActive ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                    {fmtN(m.qty)}
                  </span>
                </button>
              )
            })}
            {modelos.length === 0 && (
              <div className="py-4 text-center text-[11px] text-[var(--text-muted)]">Sin modelos</div>
            )}
          </div>
        </div>
      </aside>

      {/* ════════ Ficha 3 — Análisis (scroll propio e independiente) ════════ */}
      <div
        className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-card p-4 md:sticky md:top-[172px] md:max-h-[calc(100vh-192px)] overflow-y-auto"
      >

        {/* Chips de curva */}
        {modeloFilter && curvasDelModelo.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] flex-shrink-0">Curva</span>
            <button
              onClick={() => setCurvaFilter(null)}
              className={`text-[11px] font-medium px-3 py-[3px] rounded-full border transition-all leading-none ${
                !curvaFilter ? 'bg-[var(--text-sub)] border-[var(--text-sub)] text-[var(--card)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)]'
              }`}
            >
              Todas
            </button>
            {curvasDelModelo.map(c => {
              const isActive = curvaFilter === c
              const color = CURVA_COLOR[c] ?? '#94a3b8'
              return (
                <button key={c} onClick={() => setCurvaFilter(isActive ? null : c)}
                  className="text-[11px] font-semibold px-3 py-[3px] rounded-full border transition-all leading-none"
                  style={isActive ? { background: color, borderColor: color, color: '#fff' } : { background: color + '18', borderColor: color + '70', color }}>
                  {CURVA_LABEL[c] ?? c}
                </button>
              )
            })}
          </div>
        )}

        {/* Resumen por curva */}
        {modeloFilter && curvasDelModelo.length > 0 && (
          <div className="mb-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
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
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>Curva {CURVA_LABEL[c] ?? c}</span>
                    </div>
                    <div className="text-[18px] font-bold num text-[var(--text)] leading-tight">{fmtN(t.qty)}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.cedi.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.cedi.color }} />
                        {fmtN(t.cedi)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.zf.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.zf.color }} />
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
              <div className="p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Total</div>
                <div className="text-[18px] font-bold num text-[var(--text)] leading-tight">
                  {fmtN(totalsPorCurva['_total']?.qty ?? 0)}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.cedi.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.cedi.color }} />
                    {fmtN(totalsPorCurva['_total']?.cedi ?? 0)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.zf.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.zf.color }} />
                    {fmtN(totalsPorCurva['_total']?.zf ?? 0)}
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

        {/* Fichas por referencia+curva — acordeón de 3 niveles */}
        {showFichas && (
          <div className="mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              {modeloFilter ?? `Resultados de "${query.trim()}"`} — por referencia · {refGroups.length}
              {curvaFilter && <span className="font-normal normal-case"> · curva {CURVA_LABEL[curvaFilter] ?? curvaFilter}</span>}
            </div>

            {fichasSobran ? (
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
                {refGroups.length} referencias coinciden con la búsqueda — escribe más caracteres para afinar
              </div>
            ) : (
              <>
                {/* Chips de referencia — filtro fijo */}
                {refGroups.length > 1 && (
                  <div className="sticky top-0 z-[9] flex flex-wrap items-center gap-1.5 mb-2 py-2 bg-[var(--card)]">
                    <button
                      onClick={() => setSelectedBase(null)}
                      className={`text-[11px] font-medium px-3 py-[4px] rounded-full border transition-all leading-none ${
                        !activeBase
                          ? 'bg-[var(--text-sub)] border-[var(--text-sub)] text-[var(--card)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)]'
                      }`}
                    >
                      Todas
                    </button>
                    {refGroups.map(g => (
                      <button
                        key={g.base}
                        onClick={() => setSelectedBase(activeBase === g.base ? null : g.base)}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold num px-3 py-[4px] rounded-full border transition-all leading-none ${
                          activeBase === g.base
                            ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
                            : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--nav-hover)]'
                        }`}
                      >
                        {g.base}
                        <span className={activeBase === g.base ? 'text-white/75 font-normal' : 'text-[var(--text-muted)] font-normal'}>
                          {fmtN(g.qty)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Fichas: referencia → curva → color → bodega */}
                <div className="space-y-2">
                  {fichasVisibles.map(g => {
                    const esVitek = g.marca === 'Vitek'
                    const isSelected = activeBase === g.base
                    // Vitek nestea (hay que abrir la referencia); el resto de
                    // marcas muestra las curvas directo, siempre abiertas
                    const baseOpen = esVitek ? (isSelected || openBases.has(g.base)) : true
                    const baseInteractive = esVitek && !isSelected
                    return (
                      <div key={g.base} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
                        {/* Nivel 1 — referencia */}
                        {esVitek ? (
                          <button
                            onClick={() => { if (baseInteractive) toggleBase(g.base) }}
                            aria-expanded={baseOpen}
                            className={`w-full flex items-center gap-2 px-3 py-[10px] transition-colors ${baseInteractive ? 'hover:bg-[var(--nav-hover)]' : 'cursor-default'}`}
                          >
                            <span className="text-[13px] font-bold text-[var(--text)] num truncate">{g.base}</span>
                            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                              {g.curvas.length} {g.curvas.length === 1 ? 'curva' : 'curvas'}
                            </span>
                            <span className="ml-auto text-[15px] font-bold text-[var(--text)] num flex-shrink-0">
                              {fmtN(g.qty)} <span className="text-[10px] font-normal text-[var(--text-muted)]">und</span>
                            </span>
                            {baseInteractive && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${baseOpen ? 'rotate-180' : ''}`}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-2 px-3 py-[10px]">
                            <span className="text-[13px] font-bold text-[var(--text)] num truncate">{g.base}</span>
                            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                              {g.curvas.length} {g.curvas.length === 1 ? 'curva' : 'curvas'}
                            </span>
                            <span className="ml-auto text-[15px] font-bold text-[var(--text)] num flex-shrink-0">
                              {fmtN(g.qty)} <span className="text-[10px] font-normal text-[var(--text-muted)]">und</span>
                            </span>
                          </div>
                        )}

                        {/* Nivel 2 — curvas */}
                        {baseOpen && (
                          <div className="border-t border-[var(--border)] px-3 pb-2 fade-in-up">
                            {g.curvas.map(cg => {
                              const curvaKey = `${g.base}|${cg.curva}`
                              // Con una sola curva se abre directo al color; openCurvas
                              // guarda el toggle manual, así el usuario puede colapsarla igual
                              const curvaDefaultOpen = g.curvas.length === 1
                              const curvaOpen = curvaDefaultOpen ? !openCurvas.has(curvaKey) : openCurvas.has(curvaKey)
                              const cColor    = CURVA_COLOR[cg.curva] ?? '#94a3b8'
                              return (
                                <div key={curvaKey} className="border-b border-[var(--border)] last:border-0">
                                  <button
                                    onClick={() => toggleCurva(curvaKey)}
                                    aria-expanded={curvaOpen}
                                    className="w-full flex items-center gap-2 py-[8px] hover:bg-[var(--nav-hover)] transition-colors rounded-[4px] px-1 -mx-1"
                                  >
                                    <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full text-white flex-shrink-0"
                                      style={{ background: cColor }}>
                                      Curva {CURVA_LABEL[cg.curva] ?? cg.curva}
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)]">{cg.items.length} colores</span>
                                    <span className="ml-auto text-[13px] font-semibold num text-[var(--text)] flex-shrink-0">
                                      {fmtN(cg.qty)}
                                      <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">und</span>
                                    </span>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                      className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${curvaOpen ? 'rotate-180' : ''}`}>
                                      <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                  </button>

                                  {/* Nivel 3 — colores */}
                                  {curvaOpen && (
                                    <div className="pb-1.5 fade-in-up">
                                      {g.curvas.length > 0 && cg.items.map(it => {
                                        const refOpen = openRefs.has(it.ref)
                                        return (
                                          <div key={it.ref}>
                                            <button
                                              onClick={() => toggleRef(it.ref)}
                                              aria-expanded={refOpen}
                                              className="w-full flex items-center gap-2 py-[7px] pl-4 pr-1 hover:bg-[var(--nav-hover)] transition-colors rounded-[4px]"
                                            >
                                              <span className="text-[11px] num text-[var(--text-sub)] truncate">{it.ref}</span>
                                              <span className="ml-auto text-[12px] font-semibold num text-[var(--text)] flex-shrink-0">
                                                {fmtN(it.qty)}
                                                <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">und</span>
                                              </span>
                                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                                className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${refOpen ? 'rotate-180' : ''}`}>
                                                <polyline points="6 9 12 15 18 9" />
                                              </svg>
                                            </button>

                                            {/* Nivel 4 — listado de bodegas */}
                                            {refOpen && (
                                              <div className="pb-2 pt-0.5 pl-8 pr-1 space-y-1 fade-in-up">
                                                <div className="flex items-center gap-2 px-2.5 py-[6px] rounded-[8px] bg-[var(--bar-bg)]">
                                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BODEGA.cedi.color }} />
                                                  <span className="text-[11px] text-[var(--text-sub)]">Bodega CEDI</span>
                                                  <span className="ml-auto text-[12px] font-semibold num" style={{ color: BODEGA.cedi.color }}>
                                                    {fmtN(it.cedi)} und
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-2 px-2.5 py-[6px] rounded-[8px] bg-[var(--bar-bg)]">
                                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BODEGA.zf.color }} />
                                                  <span className="text-[11px] text-[var(--text-sub)]">Zona Franca</span>
                                                  <span className="ml-auto text-[12px] font-semibold num" style={{ color: BODEGA.zf.color }}>
                                                    {fmtN(it.zf)} und
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}

                            {/* Pie de la referencia: split bodegas + valor */}
                            <div className="flex items-center justify-between pt-2">
                              <div className="flex items-center gap-2.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.cedi.color }} title="Bodega CEDI">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.cedi.color }} />{fmtN(g.cedi)}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: BODEGA.zf.color }} title="Zona Franca">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: BODEGA.zf.color }} />{fmtN(g.zf)}
                                </span>
                              </div>
                              <span className="text-[10px] text-[var(--text-muted)] num">{fmt(g.valor)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Contador */}
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          {rows.length} de {totalSKUs} SKUs
          {marcaFilter  ? ` · ${marcaFilter}`              : ''}
          {modeloFilter ? ` · ${modeloFilter}`             : ''}
          {curvaFilter  ? ` · Curva ${CURVA_LABEL[curvaFilter] ?? curvaFilter}` : ''}
          {rangoActivo   ? ` · ${fmtN(stockMin)}–${fmtN(effStockMax)} pares` : ''}
          {query        ? ` · "${query}"`                  : ''}
        </div>

        {/* Tabla de detalle */}
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

                <th onClick={() => toggleSort('Saldo Sistema')}
                  className="px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap text-right">
                  Stock<SortIcon k="Saldo Sistema" />
                  <div className="flex items-center justify-end gap-2 mt-0.5 font-normal normal-case tracking-normal">
                    <span style={{ color: BODEGA.cedi.color }}>CEDI</span>
                    <span style={{ color: BODEGA.zf.color }}>ZF</span>
                  </div>
                </th>

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

                    <td className="px-[10px] py-[9px] text-right">
                      <div className="text-[11px] font-semibold text-[var(--text)] num">{fmtN(r._saldo)}</div>
                      {(r._saldoCedi > 0 || r._saldoZF > 0) && (
                        <div className="flex items-center justify-end gap-2 mt-0.5">
                          <span className="text-[9px] num" style={{ color: BODEGA.cedi.color }}>{fmtN(r._saldoCedi)}</span>
                          <span className="text-[9px] num" style={{ color: BODEGA.zf.color }}>{fmtN(r._saldoZF)}</span>
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
      </div>
    </div>
  )
}
