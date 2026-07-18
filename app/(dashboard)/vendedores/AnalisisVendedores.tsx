'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Card from '@/components/Card'
import { fmt, fmtN } from '@/lib/format'
import { parseFecha } from '@/lib/fecha'

type Row = Record<string, string>

// parseNum local — no importar de lib/sheets (carga googleapis, rompe el bundle cliente)
function parseN(v: string | undefined): number {
  if (!v) return 0
  let s = String(v).trim()
  const periodCount = (s.match(/\./g) ?? []).length
  if (periodCount > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

function toDate(fechaStr: string | undefined): Date | null {
  const f = parseFecha(fechaStr)
  return f ? new Date(f.year, f.mes, f.dia) : null
}
function fmtFecha(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function fmtM(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Canales de venta que no son vendedores de carne y hueso — ranking aparte
const CANALES = ['VENTAS DIRECTAS', 'CLIENTES EN CONSIGNACION', 'EMPLEADOS', 'REDES']
function esCanal(nombre: string): boolean {
  const n = nombre.toUpperCase()
  return CANALES.some(c => n.includes(c) || c.includes(n))
}

// ── Meta dinámica ────────────────────────────────────────────────────────────
// Meta del mes = MAX(mismo mes año anterior × (1+crecimiento), promedio últimos
// 3 meses reales). Si cumplió el mes anterior, la meta sube a lo logrado +escalón.
// Si incumple 2 meses seguidos, se recalibra hacia su realidad reciente.
const CRECIMIENTO_OBJETIVO = 0.10
const ESCALON_CUMPLIMIENTO = 0.05

function computeMetasDinamicas(
  ventasMes: (year: number, mesIdx: number) => number,
  año: number,
  mesActualIdx: number,
): { metas: number[]; cumplio: (boolean | null)[] } {
  const metas: number[] = []
  const cumplio: (boolean | null)[] = []
  let missStreak = 0
  for (let m = 0; m < 12; m++) {
    const prev3: number[] = []
    for (let k = 1; k <= 3; k++) {
      const idx = m - k
      prev3.push(idx >= 0 ? ventasMes(año, idx) : ventasMes(año - 1, 12 + idx))
    }
    const prom3 = prev3.reduce((s, v) => s + v, 0) / 3
    let meta = Math.max(ventasMes(año - 1, m) * (1 + CRECIMIENTO_OBJETIVO), prom3)
    if (m > 0 && cumplio[m - 1] === true) {
      meta = Math.max(meta, ventasMes(año, m - 1) * (1 + ESCALON_CUMPLIMIENTO))
    }
    if (missStreak >= 2) meta = (meta + prom3) / 2
    metas.push(Math.round(meta))
    if (m < mesActualIdx) {
      const ok = meta > 0 ? ventasMes(año, m) >= meta : null
      cumplio.push(ok)
      if (ok === false) missStreak++
      else missStreak = 0
    } else {
      cumplio.push(null)
    }
  }
  return { metas, cumplio }
}

// ── Score 0-100 ──────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface VendedorStats {
  nombre: string
  canal: boolean
  totalHist: number
  und: number
  ytd: number
  ytdPrev: number
  mesActual: number
  nFacturas: number
  facturasAño: number
  ticket: number
  margenPct: number
  ultimaVenta: Date | null
  diasEntreVentas: number | null
  factPorMes6m: number
  clientes12m: number
  clientesActivos: number
  topFrecuencia: { nombre: string; nFact: number } | null
  topValor: { nombre: string; valor: number } | null
  topRentable: { nombre: string; margen: number; valor: number } | null
  topClientes: { nombre: string; nFact: number; valor: number; margen: number }[]
  carteraTotal: number
  carteraVencida: number
  diasPago: number | null
  metas: number[]
  cumplio: (boolean | null)[]
  ventasMesArr: number[]
  score: number
  fMeta: number
  fCartera: number
  fCrec: number
  fRent: number
  fAct: number
}

interface Props {
  ventas:  Row[]   // normalizadas (FECHA, VRTOTAL, CANTIDAD, COSTO, NVENDEDOR, IDCLIENTE, NCLIENTE, FACTURA)
  cartera: Row[]   // RAW_Cartera crudo (Vendedor, Saldo ($), Días)
  recibos: Row[]   // RAW_Recibos crudo (Factura, NIT, Días, Total Pagado ($))
}

export default function AnalisisVendedores({ ventas, cartera, recibos }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoPos, setInfoPos] = useState<{ top: number; right: number } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const infoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setInfoOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function toggleInfo(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (infoOpen) { setInfoOpen(false); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setInfoPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right - 120) })
    setInfoOpen(true)
  }

  const hoy = useMemo(() => new Date(), [])
  const año = hoy.getFullYear()
  const mesIdx = hoy.getMonth()

  const stats: VendedorStats[] = useMemo(() => {
    // factura → vendedor (para atribuir pagos de RAW_Recibos)
    const factVend = new Map<string, string>()
    ventas.forEach(r => {
      const f = (r['FACTURA'] ?? '').trim()
      const v = (r['NVENDEDOR'] ?? '').trim()
      if (f && v && !factVend.has(f)) factVend.set(f, v)
    })

    // pagos por vendedor
    const pagosAgg: Record<string, { diasPond: number; monto: number }> = {}
    recibos.forEach(r => {
      const vend = factVend.get((r['Factura'] ?? '').trim())
      if (!vend) return
      const monto = parseN(r['Total Pagado ($)'])
      if (!pagosAgg[vend]) pagosAgg[vend] = { diasPond: 0, monto: 0 }
      pagosAgg[vend].diasPond += parseN(r['Días']) * monto
      pagosAgg[vend].monto += monto
    })

    // cartera por vendedor
    const cartAgg: Record<string, { total: number; vencida: number }> = {}
    cartera.forEach(r => {
      const vend = (r['Vendedor'] ?? '').trim()
      const saldo = parseN(r['Saldo ($)'])
      if (!vend || saldo <= 0) return
      if (!cartAgg[vend]) cartAgg[vend] = { total: 0, vencida: 0 }
      cartAgg[vend].total += saldo
      if (parseN(r['Días']) > 0) cartAgg[vend].vencida += saldo
    })

    // ventas por vendedor
    type Agg = {
      neto: number; costo: number; und: number
      ventasMes: Record<string, number>
      facturas: Set<string>; facturasAño: Set<string>; facturas6m: Set<string>
      fechas: Set<string>
      clientes: Record<string, { nombre: string; nFact: Set<string>; valor: number; costo: number; ultima: Date | null }>
    }
    const agg: Record<string, Agg> = {}
    const hace6m = new Date(año, mesIdx - 6, 1)
    const hace4m = new Date(año, mesIdx - 4, hoy.getDate())
    const hace12m = new Date(año - 1, mesIdx, hoy.getDate())

    ventas.forEach(r => {
      const vend = (r['NVENDEDOR'] ?? '').trim()
      if (!vend) return
      if (!agg[vend]) agg[vend] = { neto: 0, costo: 0, und: 0, ventasMes: {}, facturas: new Set(), facturasAño: new Set(), facturas6m: new Set(), fechas: new Set(), clientes: {} }
      const a = agg[vend]
      const valor = parseN(r['VRTOTAL'])
      const cant  = parseN(r['CANTIDAD'])
      const f = parseFecha(r['FECHA'])
      a.neto  += valor
      a.costo += parseN(r['COSTO'])
      if (f) {
        const key = `${f.year}-${f.mes}`
        a.ventasMes[key] = (a.ventasMes[key] ?? 0) + valor
      }
      if (cant > 0) {
        a.und += cant
        const fact = (r['FACTURA'] ?? '').trim()
        const d = toDate(r['FECHA'])
        if (fact) {
          a.facturas.add(fact)
          if (f?.year === año) a.facturasAño.add(fact)
          if (d && d >= hace6m) a.facturas6m.add(fact)
        }
        if (r['FECHA']) a.fechas.add(r['FECHA'])
        const nit = (r['IDCLIENTE'] ?? '').trim()
        if (nit) {
          if (!a.clientes[nit]) a.clientes[nit] = { nombre: (r['NCLIENTE'] ?? '').trim() || nit, nFact: new Set(), valor: 0, costo: 0, ultima: null }
          const c = a.clientes[nit]
          if (fact) c.nFact.add(fact)
          c.valor += valor
          c.costo += parseN(r['COSTO'])
          if (d && (!c.ultima || d > c.ultima)) c.ultima = d
        }
      }
    })

    const margenEmpresa = (() => {
      let v = 0, c = 0
      Object.values(agg).forEach(a => { v += a.neto; c += a.costo })
      return v > 0 ? (v - c) / v : 0
    })()

    const list: VendedorStats[] = Object.entries(agg).map(([nombre, a]) => {
      const vm = (y: number, m: number) => a.ventasMes[`${y}-${m}`] ?? 0
      const ytd = Array.from({ length: mesIdx + 1 }, (_, m) => vm(año, m)).reduce((s, v) => s + v, 0)
      const ytdPrev = Array.from({ length: mesIdx + 1 }, (_, m) => vm(año - 1, m)).reduce((s, v) => s + v, 0)
      const mesActual = vm(año, mesIdx)
      const totalHist = a.neto
      const ticket = a.facturas.size > 0 ? totalHist / a.facturas.size : 0
      const margenPct = a.neto > 0 ? ((a.neto - a.costo) / a.neto) * 100 : 0

      const fechas = Array.from(a.fechas).map(toDate).filter((d): d is Date => d !== null).sort((x, y) => x.getTime() - y.getTime())
      const ultimaVenta = fechas[fechas.length - 1] ?? null
      const diasEntreVentas = fechas.length > 1
        ? Math.round((fechas[fechas.length - 1].getTime() - fechas[0].getTime()) / 86400000 / (fechas.length - 1))
        : null

      const clientesArr = Object.values(a.clientes).map(c => ({
        nombre: c.nombre,
        nFact: c.nFact.size,
        valor: c.valor,
        margen: c.valor > 0 ? ((c.valor - c.costo) / c.valor) * 100 : 0,
        ultima: c.ultima,
      }))
      const clientes12mArr = clientesArr.filter(c => c.ultima && c.ultima >= hace12m)
      const clientesActivos = clientes12mArr.filter(c => c.ultima && c.ultima >= hace4m).length
      const topFrecuencia = clientesArr.slice().sort((x, y) => y.nFact - x.nFact)[0] ?? null
      const topValor = clientesArr.slice().sort((x, y) => y.valor - x.valor)[0] ?? null
      const conMinFact = clientesArr.filter(c => c.nFact >= 3)
      const topRentable = (conMinFact.length > 0 ? conMinFact : clientesArr).slice().sort((x, y) => y.margen - x.margen)[0] ?? null
      const topClientes = clientesArr.slice().sort((x, y) => y.valor - x.valor).slice(0, 8)

      const { metas, cumplio } = computeMetasDinamicas(vm, año, mesIdx)
      const cart = cartAgg[nombre] ?? { total: 0, vencida: 0 }
      const pago = pagosAgg[nombre]
      const diasPago = pago && pago.monto > 0 ? pago.diasPond / pago.monto : null

      // ── Score ──
      const metaMes = metas[mesIdx]
      const fMeta = metaMes > 0 ? clamp(mesActual / metaMes, 0, 1) * 30 : 15
      const alDia = cart.total > 0 ? (1 - cart.vencida / cart.total) * 15 : 15
      const fPago = diasPago == null ? 7 : diasPago <= 0 ? 10 : clamp(1 - diasPago / 90, 0, 1) * 10
      const fCartera = alDia + fPago
      const fCrec = ytdPrev > 0 ? clamp((ytd / ytdPrev - 0.5) / (1 + CRECIMIENTO_OBJETIVO - 0.5), 0, 1) * 20 : 10
      const fRent = margenEmpresa > 0 ? clamp((margenPct / 100) / margenEmpresa, 0, 1.5) / 1.5 * 15 : 7.5
      const factPorMes6m = a.facturas6m.size / 6
      const promFactMes = a.facturas.size > 0 && fechas.length > 1
        ? a.facturas.size / Math.max(1, (fechas[fechas.length - 1].getTime() - fechas[0].getTime()) / (30 * 86400000))
        : 0
      const actRitmo = promFactMes > 0 ? clamp(factPorMes6m / promFactMes, 0, 1) * 6 : 3
      const actClientes = clientes12mArr.length > 0 ? (clientesActivos / clientes12mArr.length) * 4 : 2
      const fAct = actRitmo + actClientes
      const score = Math.round(fMeta + fCartera + fCrec + fRent + fAct)

      const ventasMesArr = Array.from({ length: 12 }, (_, m) => vm(año, m))

      return {
        nombre, canal: esCanal(nombre),
        totalHist, und: a.und, ytd, ytdPrev, mesActual,
        nFacturas: a.facturas.size, facturasAño: a.facturasAño.size, ticket, margenPct,
        ultimaVenta, diasEntreVentas, factPorMes6m,
        clientes12m: clientes12mArr.length, clientesActivos,
        topFrecuencia, topValor, topRentable, topClientes,
        carteraTotal: cart.total, carteraVencida: cart.vencida, diasPago,
        metas, cumplio, ventasMesArr,
        score, fMeta, fCartera, fCrec, fRent, fAct,
      }
    })

    return list.sort((x, y) => y.score - x.score)
  }, [ventas, cartera, recibos, año, mesIdx, hoy])

  const personas = stats.filter(s => !s.canal && s.ytd > 0)
  const canales  = stats.filter(s => s.canal)
  const perfil = stats.find(s => s.nombre === selected) ?? null

  async function guardarMetas() {
    if (saveState === 'saving') return
    setSaveState('saving')
    try {
      const header = ['Vendedor', ...MESES, `Total ${año}`]
      const rows = personas.map(p => [
        p.nombre,
        ...p.metas.map(m => String(m)),
        String(p.metas.reduce((s, v) => s + v, 0)),
      ])
      const res = await fetch('/api/metas-dinamicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [header, ...rows] }),
      })
      setSaveState(res.ok ? 'ok' : 'err')
    } catch {
      setSaveState('err')
    }
    setTimeout(() => setSaveState('idle'), 3000)
  }

  const cumplimientoMes = (s: VendedorStats) => s.metas[mesIdx] > 0 ? (s.mesActual / s.metas[mesIdx]) * 100 : 0
  const pctVencida = (s: VendedorStats) => s.carteraTotal > 0 ? (s.carteraVencida / s.carteraTotal) * 100 : 0

  const MEDAL = ['#eab308', '#94a3b8', '#b45309']

  function RankingTable({ items }: { items: VendedorStats[] }) {
    return (
      <div className="table-scroll">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-[var(--card)] z-10">
            <tr>
              {[
                { l: '#', a: 'center' }, { l: 'Vendedor', a: 'left' }, { l: 'Score', a: 'left' },
                { l: 'Ventas Año', a: 'right' }, { l: 'Meta Mes', a: 'right' },
                { l: 'Cart. Vencida', a: 'right' }, { l: 'Margen', a: 'right' },
              ].map(h => (
                <th key={h.l} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap text-${h.a}`}>
                  {h.l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s, i) => {
              const cm = cumplimientoMes(s)
              const pv = pctVencida(s)
              return (
                <tr key={s.nombre}
                  onClick={() => setSelected(p => p === s.nombre ? null : s.nombre)}
                  className={`border-b border-[var(--border)] last:border-0 transition-colors cursor-pointer ${
                    selected === s.nombre ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]' : 'hover:bg-[var(--nav-hover)]'
                  }`}>
                  <td className="px-[10px] py-[9px] text-center">
                    {i < 3 && !s.canal
                      ? <span className="inline-block w-5 h-5 rounded-full text-[10px] font-bold text-white leading-5" style={{ background: MEDAL[i] }}>{i + 1}</span>
                      : <span className="text-[11px] text-[var(--text-muted)] num">{i + 1}</span>}
                  </td>
                  <td className="px-[10px] py-[9px] font-medium text-[var(--text)] max-w-[170px] truncate">{s.nombre}</td>
                  <td className="px-[10px] py-[9px] min-w-[110px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold num text-[var(--text)] w-[26px]">{s.score}</span>
                      <div className="flex-1 h-[5px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${s.score}%`,
                          background: s.score >= 70 ? '#22c55e' : s.score >= 50 ? '#f59e0b' : '#ef4444',
                        }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text)]">{fmtM(s.ytd)}</td>
                  <td className={`px-[10px] py-[9px] text-right num text-[11px] font-semibold ${cm >= 100 ? 'text-[#22c55e]' : cm >= 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                    {cm.toFixed(0)}%
                  </td>
                  <td className={`px-[10px] py-[9px] text-right num text-[11px] ${pv <= 15 ? 'text-[var(--text-sub)]' : pv <= 40 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                    {s.carteraTotal > 0 ? `${pv.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{s.margenPct.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {/* Podio Top 3 personas */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {personas.slice(0, 3).map((s, i) => (
          <button key={s.nombre}
            onClick={() => setSelected(p => p === s.nombre ? null : s.nombre)}
            className={`text-left rounded-card border p-[14px_16px] shadow-card transition-all hover:shadow-card-hover ${
              selected === s.nombre ? 'ring-2 ring-[var(--brand-blue)]' : ''
            }`}
            style={{ borderColor: MEDAL[i], background: 'var(--card)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center" style={{ background: MEDAL[i] }}>{i + 1}</span>
              <span className="text-[12px] font-bold text-[var(--text)] truncate">{s.nombre}</span>
            </div>
            <div className="text-[22px] font-bold num" style={{ color: MEDAL[i] }}>{s.score}<span className="text-[11px] font-normal text-[var(--text-muted)]">/100</span></div>
            <div className="text-[10px] text-[var(--text-muted)] num mt-0.5">{fmtM(s.ytd)} este año · meta mes {cumplimientoMes(s).toFixed(0)}%</div>
          </button>
        ))}
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card
          title="Ranking de Vendedores"
          subtitle="personas — clic para ver el perfil"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={guardarMetas}
                disabled={saveState === 'saving'}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Guardando…' : saveState === 'ok' ? '✓ Metas guardadas' : saveState === 'err' ? '✗ Error' : '↻ Guardar metas recalculadas'}
              </button>
              <button
                onClick={toggleInfo}
                className="w-[16px] h-[16px] rounded-full border border-[var(--border)] text-[9px] font-bold text-[var(--text-muted)] hover:border-[var(--text-sub)] hover:text-[var(--text)] transition-colors flex items-center justify-center leading-none"
                aria-label="Cómo se calcula el score"
              >
                ?
              </button>
            </div>
          }
        >
          <RankingTable items={personas} />
        </Card>

        <Card title="Ranking de Canales" subtitle="ventas directas, consignación, redes…">
          <RankingTable items={canales} />
        </Card>
      </div>

      {/* Perfil del vendedor seleccionado */}
      {perfil && (
        <>
          {/* Encabezado + score desglosado */}
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_18px] mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-bold text-[var(--text)] truncate">{perfil.nombre}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {perfil.canal ? 'Canal de venta' : 'Vendedor'} · {fmtN(perfil.nFacturas)} facturas históricas · {fmtN(perfil.clientes12m)} clientes últimos 12m
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Score</div>
                <div className="text-[26px] font-bold num" style={{ color: perfil.score >= 70 ? '#22c55e' : perfil.score >= 50 ? '#f59e0b' : '#ef4444' }}>
                  {perfil.score}<span className="text-[13px] font-normal text-[var(--text-muted)]">/100</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Meta del mes',  pts: perfil.fMeta,    max: 30 },
                { label: 'Cartera',       pts: perfil.fCartera, max: 25 },
                { label: 'Crecimiento',   pts: perfil.fCrec,    max: 20 },
                { label: 'Rentabilidad',  pts: perfil.fRent,    max: 15 },
                { label: 'Actividad',     pts: perfil.fAct,     max: 10 },
              ].map(f => {
                const pct = (f.pts / f.max) * 100
                return (
                  <div key={f.label} className="px-2.5 py-2 rounded-[8px] bg-[var(--bar-bg)]">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-semibold text-[var(--text-sub)]">{f.label}</span>
                      <span className="text-[11px] font-bold num text-[var(--text)]">{f.pts.toFixed(0)}<span className="text-[9px] text-[var(--text-muted)]">/{f.max}</span></span>
                    </div>
                    <div className="h-[4px] bg-[var(--bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${pct}%`,
                        background: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Ventas año actual</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(perfil.ytd)}</div>
              {perfil.ytdPrev > 0 && (
                <div className={`text-[10px] font-semibold num ${perfil.ytd >= perfil.ytdPrev ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {perfil.ytd >= perfil.ytdPrev ? '↑' : '↓'} {Math.abs((perfil.ytd / perfil.ytdPrev - 1) * 100).toFixed(0)}% vs mismo período {año - 1}
                </div>
              )}
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Mes actual vs meta</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(perfil.mesActual)}</div>
              <div className="text-[10px] text-[var(--text-muted)] num">
                meta: {fmt(perfil.metas[mesIdx])} · <span className={cumplimientoMes(perfil) >= 100 ? 'text-[#22c55e] font-semibold' : ''}>{cumplimientoMes(perfil).toFixed(0)}%</span>
              </div>
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Ticket promedio</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(perfil.ticket)}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{fmtN(perfil.facturasAño)} facturas este año</div>
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Ritmo de cierre</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">
                {perfil.factPorMes6m.toFixed(1)} <span className="text-[10px] font-normal text-[var(--text-muted)]">fact/mes</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] num">
                última venta: {perfil.ultimaVenta ? fmtFecha(perfil.ultimaVenta) : '—'}
              </div>
            </div>
          </div>

          {/* Clientes + Cartera */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card title="Sus Clientes" subtitle={`${fmtN(perfil.clientesActivos)} activos de ${fmtN(perfil.clientes12m)} en 12 meses`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {[
                  { t: 'Más frecuente', v: perfil.topFrecuencia?.nombre, d: perfil.topFrecuencia ? `${fmtN(perfil.topFrecuencia.nFact)} facturas` : '—' },
                  { t: 'Mayor volumen', v: perfil.topValor?.nombre, d: perfil.topValor ? fmt(perfil.topValor.valor) : '—' },
                  { t: 'Más rentable',  v: perfil.topRentable?.nombre, d: perfil.topRentable ? `${perfil.topRentable.margen.toFixed(1)}% margen` : '—' },
                ].map(x => (
                  <div key={x.t} className="px-2.5 py-2 rounded-[8px] bg-[var(--bar-bg)]">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{x.t}</div>
                    <div className="text-[11px] font-semibold text-[var(--text)] truncate" title={x.v ?? ''}>{x.v ?? '—'}</div>
                    <div className="text-[10px] text-[var(--text-muted)] num">{x.d}</div>
                  </div>
                ))}
              </div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {[{ l: 'Cliente', a: 'left' }, { l: 'Fact.', a: 'right' }, { l: 'Valor', a: 'right' }, { l: 'Margen', a: 'right' }].map(h => (
                      <th key={h.l} className={`px-[8px] py-[7px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-${h.a}`}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfil.topClientes.map((c, i) => (
                    <tr key={`${c.nombre}-${i}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-[8px] py-[7px] text-[var(--text-sub)] max-w-[180px] truncate">{c.nombre}</td>
                      <td className="px-[8px] py-[7px] text-right num text-[11px] text-[var(--text-sub)]">{fmtN(c.nFact)}</td>
                      <td className="px-[8px] py-[7px] text-right num text-[11px] text-[var(--text)]">{fmtM(c.valor)}</td>
                      <td className={`px-[8px] py-[7px] text-right num text-[11px] ${c.margen >= 25 ? 'text-[#22c55e]' : c.margen >= 10 ? 'text-[var(--text-sub)]' : 'text-[#ef4444]'}`}>
                        {c.margen.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Calidad de Cartera" subtitle="las facturas que este vendedor genera">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Cartera viva</div>
                  <div className="text-[16px] font-bold num text-[var(--text)]">{fmt(perfil.carteraTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Vencida</div>
                  <div className="text-[16px] font-bold num text-[#ef4444]">{fmt(perfil.carteraVencida)}</div>
                  <div className="text-[10px] text-[var(--text-muted)] num">{pctVencida(perfil).toFixed(0)}% del total</div>
                </div>
              </div>
              {perfil.carteraTotal > 0 && (
                <div className="h-[6px] rounded-full overflow-hidden flex bg-[var(--bar-bg)] mb-3">
                  <div className="h-full" style={{ width: `${100 - pctVencida(perfil)}%`, background: '#22c55e' }} />
                  <div className="h-full" style={{ width: `${pctVencida(perfil)}%`, background: '#ef4444' }} />
                </div>
              )}
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Sus clientes pagan en promedio</div>
                <div className={`text-[16px] font-bold num ${
                  perfil.diasPago == null ? 'text-[var(--text)]'
                  : perfil.diasPago <= 0 ? 'text-[#22c55e]'
                  : perfil.diasPago <= 30 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                }`}>
                  {perfil.diasPago == null ? '—' : perfil.diasPago <= 0 ? 'A tiempo' : `${Math.round(perfil.diasPago)} días tarde`}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">vs vencimiento, ponderado por monto pagado</div>
              </div>
            </Card>
          </div>

          {/* Metas dinámicas del año */}
          <Card title={`Metas Dinámicas ${año}`} subtitle="se reajustan con el desempeño real: al cumplir, la meta sube; tras 2 meses incumplidos, se recalibra" className="mb-4">
            <div className="table-scroll">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {[{ l: 'Mes', a: 'left' }, { l: 'Meta', a: 'right' }, { l: 'Real', a: 'right' }, { l: 'Cumplimiento', a: 'left' }].map(h => (
                      <th key={h.l} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] text-${h.a}`}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((mes, m) => {
                    const meta = perfil.metas[m]
                    const real = perfil.ventasMesArr[m]
                    const pct = meta > 0 ? (real / meta) * 100 : 0
                    const esPasado = m < mesIdx
                    const esActual = m === mesIdx
                    return (
                      <tr key={mes} className={`border-b border-[var(--border)] last:border-0 ${esActual ? 'bg-[var(--bar-bg)]' : ''}`}>
                        <td className="px-[10px] py-[8px] font-medium text-[var(--text)]">
                          {mes}{esActual && <span className="ml-1.5 text-[9px] text-[var(--brand-blue)] font-semibold uppercase">en curso</span>}
                        </td>
                        <td className="px-[10px] py-[8px] text-right num text-[11px] text-[var(--text-sub)]">{fmt(meta)}</td>
                        <td className="px-[10px] py-[8px] text-right num text-[11px] text-[var(--text)]">{esPasado || esActual ? fmt(real) : '—'}</td>
                        <td className="px-[10px] py-[8px] min-w-[140px]">
                          {esPasado || esActual ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-[5px] bg-[var(--bar-bg)] rounded-full overflow-hidden max-w-[120px]">
                                <div className="h-full rounded-full" style={{
                                  width: `${clamp(pct, 0, 100)}%`,
                                  background: pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444',
                                }} />
                              </div>
                              <span className={`text-[10px] font-semibold num ${pct >= 100 ? 'text-[#22c55e]' : 'text-[var(--text-muted)]'}`}>
                                {pct.toFixed(0)}%{esPasado && pct >= 100 && ' ✓'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">proyección</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Popup: cómo se calcula el score */}
      {infoOpen && infoPos && typeof document !== 'undefined' && createPortal(
        <div ref={infoRef}
          style={{ position: 'fixed', top: infoPos.top, right: infoPos.right, zIndex: 9999 }}
          className="w-[320px] max-w-[calc(100vw-24px)] bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-lg p-4">
          <div className="text-[12px] font-semibold text-[var(--text)] mb-1">¿Cómo se calcula el score?</div>
          <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
            Suma de 5 factores sobre 100 puntos. El mejor vendedor no es solo el que más factura: es el que cumple, crece, deja margen y cobra.
          </p>
          <div className="space-y-2">
            {[
              { t: 'Meta del mes (30 pts)', d: 'Ventas del mes actual vs su meta dinámica, proporcional hasta el 100%.' },
              { t: 'Calidad de cartera (25 pts)', d: '15 pts por el % de su cartera al día + 10 pts según los días que tardan sus clientes en pagar (a tiempo = 10, se pierde todo a los 90 días).' },
              { t: 'Crecimiento (20 pts)', d: 'Ventas del año vs mismo período del año pasado. Crecer 10% o más da el puntaje completo; caer a la mitad da 0.' },
              { t: 'Rentabilidad (15 pts)', d: 'Su margen bruto comparado con el margen promedio de la empresa. Igualar el promedio da 10 pts; superarlo en 50% da los 15.' },
              { t: 'Actividad (10 pts)', d: 'Ritmo de facturación de los últimos 6 meses vs su ritmo histórico + % de sus clientes que siguen activos.' },
            ].map(f => (
              <div key={f.t}>
                <div className="text-[11px] font-semibold text-[var(--text)]">{f.t}</div>
                <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
