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

interface FacturaCli { factura: string; fecha: Date | null; valor: number; costo: number; cant: number }
interface ClienteVentana {
  nit: string; nombre: string; nFact: number; valor: number; costo: number
  cant: number; margen: number; ultima: Date | null; facturas: FacturaCli[]
}

/**
 * "Activos" mide compras en los últimos 4 meses. Con ventanas de 3 meses ese
 * corte queda dentro del período y el dato sería siempre igual al total, así
 * que ahí se muestra solo el conteo.
 */
function subtituloClientes(
  d: { activos: number; total: number },
  ventana: VentanaCli
): string {
  const label = VENTANAS_CLI.find(v => v.id === ventana)?.label.toLowerCase() ?? ''
  if (ventana === '3m') return `${fmtN(d.total)} clientes · ${label}`
  return `${fmtN(d.activos)} activos de ${fmtN(d.total)} · ${label}`
}

/** Agrupa la fila del cliente con su fila expandida sin romper el <tbody>. */
function FragmentoCli({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function CaretCli({ abierto }: { abierto: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round"
      className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${abierto ? 'rotate-90' : ''}`}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

/** Ficha del cliente: resumen + sus facturas en la ventana elegida. */
function DetalleCliente({ cliente }: { cliente: ClienteVentana }) {
  const util = cliente.valor - cliente.costo
  const ticket = cliente.nFact > 0 ? cliente.valor / cliente.nFact : 0
  const resumen = [
    { l: 'NIT',            v: cliente.nit },
    { l: 'Facturas',       v: fmtN(cliente.nFact) },
    { l: 'Unidades',       v: fmtN(cliente.cant) },
    { l: 'Ticket promedio', v: fmt(ticket) },
    { l: 'Última compra',  v: cliente.ultima ? fmtFecha(cliente.ultima) : '—' },
    { l: 'Utilidad',       v: cliente.costo > 0 ? fmt(util) : '—' },
  ]
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2.5 border-b border-[var(--border)]">
        {resumen.map(x => (
          <div key={x.l}>
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{x.l}</div>
            <div className="text-[11px] font-semibold text-[var(--text)] num truncate">{x.v}</div>
          </div>
        ))}
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {['Factura', 'Fecha', 'Cant.', 'Valor', 'Margen'].map((h, i) => (
              <th key={h} className={`px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cliente.facturas.slice(0, 12).map(f => {
            const m = f.valor > 0 && f.costo > 0 ? ((f.valor - f.costo) / f.valor) * 100 : null
            return (
              <tr key={f.factura} className="border-b border-[var(--border)] last:border-0">
                <td className="px-2.5 py-1.5 num text-[var(--text)]">{f.factura}</td>
                <td className="px-2.5 py-1.5 num text-[var(--text-sub)]">{f.fecha ? fmtFecha(f.fecha) : '—'}</td>
                <td className="px-2.5 py-1.5 text-right num text-[var(--text-sub)]">{fmtN(f.cant)}</td>
                <td className="px-2.5 py-1.5 text-right num text-[var(--text)]">{fmtM(f.valor)}</td>
                <td className={`px-2.5 py-1.5 text-right num ${m === null ? 'text-[var(--text-muted)]' : m < 0 ? 'text-[#ef4444] font-semibold' : 'text-[var(--text-sub)]'}`}>
                  {m === null ? '—' : `${m.toFixed(1)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {cliente.facturas.length > 12 && (
        <div className="px-3 py-1.5 text-[9px] text-[var(--text-muted)] text-center border-t border-[var(--border)]">
          y {fmtN(cliente.facturas.length - 12)} facturas más en el período
        </div>
      )}
    </div>
  )
}

type VentanaCli = '3m' | '6m' | '12m' | 'todo'

const VENTANAS_CLI: { id: VentanaCli; label: string; meses: number | null }[] = [
  { id: '3m',   label: '3 meses',  meses: 3 },
  { id: '6m',   label: '6 meses',  meses: 6 },
  { id: '12m',  label: '12 meses', meses: 12 },
  { id: 'todo', label: 'Todo',     meses: null },
]

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
  const [ventanaCli, setVentanaCli] = useState<VentanaCli>('12m')
  const [cliAbierto, setCliAbierto] = useState<string | null>(null)
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

  // ── Clientes del vendedor, recalculados según la ventana elegida ──────
  // Se computa aparte de `stats` (que alimenta el ranking y siempre mira
  // todo el histórico) para que la tarjeta "Sus Clientes" pueda acotarse
  // en el tiempo sin alterar el score.
  const clientesVentana = useMemo(() => {
    if (!selected) return null

    const meses = VENTANAS_CLI.find(v => v.id === ventanaCli)?.meses ?? null
    const hoy = new Date()
    const desde = meses === null
      ? null
      : new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate())
    const hace4m = new Date(hoy.getFullYear(), hoy.getMonth() - 4, hoy.getDate())

    interface Fact { factura: string; fecha: Date | null; valor: number; costo: number; cant: number }
    interface Cli {
      nit: string; nombre: string; valor: number; costo: number; cant: number
      ultima: Date | null; facturas: Map<string, Fact>
    }
    const map: Record<string, Cli> = {}

    for (const r of ventas) {
      if ((r['NVENDEDOR'] ?? '').trim() !== selected) continue
      const cant = parseN(r['CANTIDAD'])
      if (cant <= 0) continue
      const nit = (r['IDCLIENTE'] ?? '').trim()
      if (!nit) continue
      const d = toDate(r['FECHA'])
      if (desde && (!d || d < desde)) continue

      const valor = parseN(r['VRTOTAL'])
      const costo = parseN(r['COSTO'])
      map[nit] ??= { nit, nombre: (r['NCLIENTE'] ?? '').trim() || nit, valor: 0, costo: 0, cant: 0, ultima: null, facturas: new Map() }
      const c = map[nit]
      c.valor += valor
      c.costo += costo
      c.cant  += cant
      if (d && (!c.ultima || d > c.ultima)) c.ultima = d

      const nf = (r['FACTURA'] ?? '').trim() || '(sin factura)'
      const f = c.facturas.get(nf) ?? { factura: nf, fecha: d, valor: 0, costo: 0, cant: 0 }
      f.valor += valor; f.costo += costo; f.cant += cant
      if (d && (!f.fecha || d > f.fecha)) f.fecha = d
      c.facturas.set(nf, f)
    }

    const arr = Object.values(map).map(c => ({
      nit: c.nit,
      nombre: c.nombre,
      nFact: c.facturas.size,
      valor: c.valor,
      costo: c.costo,
      cant: c.cant,
      margen: c.valor > 0 ? ((c.valor - c.costo) / c.valor) * 100 : 0,
      ultima: c.ultima,
      facturas: Array.from(c.facturas.values()).sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)),
    }))

    // "Más rentable" exige un mínimo de facturas para que una venta suelta
    // con margen alto no se lleve el puesto.
    const conMin = arr.filter(c => c.nFact >= 3)
    const base = conMin.length > 0 ? conMin : arr

    return {
      lista: arr.slice().sort((a, b) => b.valor - a.valor),
      total: arr.length,
      activos: arr.filter(c => c.ultima && c.ultima >= hace4m).length,
      valorTotal: arr.reduce((s, c) => s + c.valor, 0),
      topFrecuencia: arr.slice().sort((a, b) => b.nFact - a.nFact)[0] ?? null,
      topValor:      arr.slice().sort((a, b) => b.valor - a.valor)[0] ?? null,
      topRentable:   base.slice().sort((a, b) => b.margen - a.margen)[0] ?? null,
    }
  }, [ventas, selected, ventanaCli])

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
            <Card
              title="Sus Clientes"
              subtitle={clientesVentana ? subtituloClientes(clientesVentana, ventanaCli) : undefined}>

              {/* Ventana de tiempo */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-0.5">Período</span>
                <div className="flex rounded-[6px] border border-[var(--border)] overflow-hidden">
                  {VENTANAS_CLI.map(v => (
                    <button key={v.id}
                      onClick={() => { setVentanaCli(v.id); setCliAbierto(null) }}
                      className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        ventanaCli === v.id
                          ? 'bg-[var(--brand-blue)] text-white'
                          : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
                      }`}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {clientesVentana && (
                  <span className="ml-auto text-[10px] text-[var(--text-muted)] num">{fmtM(clientesVentana.valorTotal)}</span>
                )}
              </div>

              {!clientesVentana || clientesVentana.total === 0 ? (
                <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">
                  Sin clientes en este período
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    {[
                      { t: 'Más frecuente', c: clientesVentana.topFrecuencia, d: (c: { nFact: number }) => `${fmtN(c.nFact)} facturas` },
                      { t: 'Mayor volumen', c: clientesVentana.topValor,      d: (c: { valor: number }) => fmt(c.valor) },
                      { t: 'Más rentable',  c: clientesVentana.topRentable,   d: (c: { margen: number }) => `${c.margen.toFixed(1)}% margen` },
                    ].map(x => (
                      <button key={x.t}
                        onClick={() => x.c && setCliAbierto(prev => prev === x.c!.nit ? null : x.c!.nit)}
                        disabled={!x.c}
                        className={`px-2.5 py-2 rounded-[8px] text-left transition-colors ${
                          x.c && cliAbierto === x.c.nit
                            ? 'bg-[var(--brand-blue)]/10 ring-1 ring-[var(--brand-blue)]'
                            : 'bg-[var(--bar-bg)] hover:bg-[var(--nav-hover)]'
                        } disabled:cursor-default`}>
                        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{x.t}</div>
                        <div className="text-[11px] font-semibold text-[var(--text)] truncate" title={x.c?.nombre ?? ''}>{x.c?.nombre ?? '—'}</div>
                        <div className="text-[10px] text-[var(--text-muted)] num">{x.c ? x.d(x.c as never) : '—'}</div>
                      </button>
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
                      {clientesVentana.lista.slice(0, 8).map(c => {
                        const abierto = cliAbierto === c.nit
                        return (
                          <FragmentoCli key={c.nit}>
                            <tr
                              onClick={() => setCliAbierto(prev => prev === c.nit ? null : c.nit)}
                              className={`border-b border-[var(--border)] cursor-pointer transition-colors ${abierto ? 'bg-[var(--bar-bg)]' : 'hover:bg-[var(--nav-hover)]'}`}>
                              <td className="px-[8px] py-[7px] text-[var(--text-sub)] max-w-[180px] truncate">
                                <span className="inline-flex items-center gap-1.5">
                                  <CaretCli abierto={abierto} />
                                  {c.nombre}
                                </span>
                              </td>
                              <td className="px-[8px] py-[7px] text-right num text-[11px] text-[var(--text-sub)]">{fmtN(c.nFact)}</td>
                              <td className="px-[8px] py-[7px] text-right num text-[11px] text-[var(--text)]">{fmtM(c.valor)}</td>
                              <td className={`px-[8px] py-[7px] text-right num text-[11px] ${c.margen >= 25 ? 'text-[#22c55e]' : c.margen >= 10 ? 'text-[var(--text-sub)]' : 'text-[#ef4444]'}`}>
                                {c.margen.toFixed(1)}%
                              </td>
                            </tr>
                            {abierto && (
                              <tr className="border-b border-[var(--border)]">
                                <td colSpan={4} className="px-[8px] py-2 bg-[var(--bar-bg)]">
                                  <DetalleCliente cliente={c} />
                                </td>
                              </tr>
                            )}
                          </FragmentoCli>
                        )
                      })}
                    </tbody>
                  </table>

                  {clientesVentana.total > 8 && (
                    <div className="mt-2 text-[10px] text-[var(--text-muted)] text-center">
                      Mostrando los 8 de mayor valor de {fmtN(clientesVentana.total)} clientes
                    </div>
                  )}
                </>
              )}
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
