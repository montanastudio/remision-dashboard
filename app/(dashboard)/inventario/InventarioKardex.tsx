'use client'

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { consolidarPorProducto, TIPOS_VENTA, type ProductoKardex, type MovimientoKardex } from '@/lib/kardex'
import { fmt, fmtN } from '@/lib/format'
import { hoyBogota, diaBogota } from '@/lib/hoy-bogota'

interface Props {
  productos: ProductoKardex[]
  periodoLabel: string
  diasVentana: number
}

type OrdenCol = 'valor' | 'ventas' | 'cobertura' | 'stock'

const RANGOS = [
  { id: '7d',  label: '7 días',  dias: 7 },
  { id: '30d', label: '30 días', dias: 30 },
  { id: '90d', label: '90 días', dias: 90 },
] as const

/** Cobertura en días: cuánto dura el stock al ritmo de venta de la ventana. */
function cobertura(p: ProductoKardex, dias: number): number | null {
  if (p.saldoActual <= 0) return null
  if (p.ventasPeriodo <= 0) return Infinity
  return p.saldoActual / (p.ventasPeriodo / dias)
}

const MAX_FILAS = 400

/** Sin tildes ni mayúsculas, para que "atletic" encuentre "ATHLETIC". */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const TIPO_LABEL: Record<string, string> = {
  ED: 'Entrada', SA: 'Salida venta', DV: 'Devolución', SD: 'Salida dev.',
  TS: 'Traslado salida', TE: 'Traslado entrada', AS: 'Ajuste salida', AE: 'Ajuste entrada',
  SM: 'Salida muestras', EM: 'Entrada muestras', SC: 'Salida consignación', EC: 'Entrada consignación',
  EN: 'Entrada', SX: 'Salida', EX: 'Entrada', SR: 'Salida', ER: 'Entrada',
  SO: 'Salida', EO: 'Entrada', SK: 'Salida', ST: 'Salida', SF: 'Salida', TD: 'Traslado',
}

export default function InventarioKardex({ productos, periodoLabel, diasVentana }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [bodegaSel, setBodegaSel] = useState('')
  const [soloMov, setSoloMov] = useState(false)
  const [consolidado, setConsolidado] = useState(true)
  const [orden, setOrden] = useState<OrdenCol>('valor')
  const [cDesde, setCDesde] = useState(searchParams.get('kdesde') ?? '')
  const [cHasta, setCHasta] = useState(searchParams.get('khasta') ?? '')
  const [popup, setPopup] = useState<{ p: ProductoKardex; dir: 'entradas' | 'salidas' | 'ventas' } | null>(null)
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const [verRotacion, setVerRotacion] = useState(false)
  const [movs, setMovs] = useState<MovimientoKardex[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorPopup, setErrorPopup] = useState('')

  const bodegas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.bodega).filter(Boolean))).sort(),
    [productos]
  )

  // Con bodega elegida siempre se ve por bodega; en "todas" manda el toggle
  const base = useMemo(() => {
    const porBodega = bodegaSel ? productos.filter((p) => p.bodega === bodegaSel) : productos
    return !bodegaSel && consolidado ? consolidarPorProducto(porBodega) : porBodega
  }, [productos, bodegaSel, consolidado])

  const indexados = useMemo(
    () => base.map((p) => ({ p, buscable: normalizar(`${p.referencia} ${p.producto} ${p.codigo}`) })),
    [base]
  )

  const filtrados = useMemo(() => {
    const term = normalizar(q.trim())
    const lista = indexados
      .filter(({ p, buscable }) => {
        if (term && !buscable.includes(term)) return false
        if (soloMov && p.entradasPeriodo === 0 && p.salidasPeriodo === 0) return false
        return true
      })
      .map(({ p }) => p)
    const cob = (p: ProductoKardex) => cobertura(p, diasVentana)
    return lista.sort((a, b) => {
      if (orden === 'ventas') return b.ventasPeriodo - a.ventasPeriodo
      if (orden === 'stock') return b.saldoActual - a.saldoActual
      if (orden === 'cobertura') {
        // Primero lo que se agota: cobertura corta arriba; sin ventas al final
        const ca = cob(a) ?? Infinity, cb = cob(b) ?? Infinity
        return ca - cb
      }
      return b.valorActual - a.valorActual
    })
  }, [indexados, q, soloMov, orden, diasVentana])

  const tot = useMemo(() => ({
    stock:    filtrados.reduce((s, p) => s + p.saldoActual, 0),
    valor:    filtrados.reduce((s, p) => s + p.valorActual, 0),
    entradas: filtrados.reduce((s, p) => s + p.entradasPeriodo, 0),
    salidas:  filtrados.reduce((s, p) => s + p.salidasPeriodo, 0),
    ventas:   filtrados.reduce((s, p) => s + p.ventasPeriodo, 0),
    ventasPrev: filtrados.reduce((s, p) => s + p.ventasPrev, 0),
    saldoIni: filtrados.reduce((s, p) => s + p.saldoInicial, 0),
    valorIni: filtrados.reduce((s, p) => s + p.valorInicial, 0),
    saldoFin: filtrados.reduce((s, p) => s + p.saldoFinal, 0),
    valorFin: filtrados.reduce((s, p) => s + p.valorFinal, 0),
  }), [filtrados])

  function aplicarRango(desde: string, hasta: string) {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set('tab', 'kardex')
    if (desde && hasta) { qs.set('kdesde', desde); qs.set('khasta', hasta) }
    else { qs.delete('kdesde'); qs.delete('khasta') }
    router.push(`${pathname}?${qs.toString()}`)
  }

  const rangoActivo = useMemo(() => {
    const d = searchParams.get('kdesde'), h = searchParams.get('khasta')
    if (!d || !h) return 'global'
    for (const r of RANGOS) {
      if (d === diaBogota(-(r.dias - 1)) && h === hoyBogota()) return r.id
    }
    if (d === `${hoyBogota().slice(0, 4)}-01-01` && h === hoyBogota()) return 'año'
    return 'custom'
  }, [searchParams])

  const esConsolidado = !bodegaSel && consolidado

  async function abrirDetalle(p: ProductoKardex, dir: 'entradas' | 'salidas' | 'ventas') {
    setPopup({ p, dir })
    setMovs(null)
    setErrorPopup('')
    setCargando(true)
    try {
      const qs = new URLSearchParams()
      qs.set('codigo', p.codigo)
      qs.set('bodega', p.bodega)
      for (const k of ['filtro', 'm', 'y', 'desde', 'hasta']) {
        const v = searchParams.get(k)
        if (v) qs.set(k, v)
      }
      const res = await fetch(`/api/kardex/movimientos?${qs.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setErrorPopup(data.error ?? `Error ${res.status} al cargar el detalle`)
      else setMovs(data.movimientos ?? [])
    } catch {
      setErrorPopup('No se pudo conectar con el servidor')
    } finally {
      setCargando(false)
    }
  }

  const movsFiltrados = useMemo(() => {
    if (!movs || !popup) return []
    if (popup.dir === 'entradas') return movs.filter((m) => m.entradas > 0)
    if (popup.dir === 'ventas') return movs.filter((m) => m.salidas > 0 && TIPOS_VENTA.includes(m.tipo))
    return movs.filter((m) => m.salidas > 0)
  }, [movs, popup])

  const th = 'px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)]'
  const td = 'px-[10px] py-[8px] text-[var(--text-sub)]'

  return (
    <div>
      {/* Ventana de tiempo */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-0.5">Ventana</span>
        <div className="flex rounded-[6px] border border-[var(--border)] overflow-hidden">
          {RANGOS.map((r) => (
            <button key={r.id}
              onClick={() => aplicarRango(diaBogota(-(r.dias - 1)), hoyBogota())}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                rangoActivo === r.id ? 'bg-[var(--brand-blue)] text-white' : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
              }`}>
              {r.label}
            </button>
          ))}
          <button
            onClick={() => aplicarRango(`${hoyBogota().slice(0, 4)}-01-01`, hoyBogota())}
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              rangoActivo === 'año' ? 'bg-[var(--brand-blue)] text-white' : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
            }`}>
            Este año
          </button>
          <button
            onClick={() => aplicarRango('', '')}
            title="Vuelve al período del filtro global de la barra superior"
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              rangoActivo === 'global' ? 'bg-[var(--brand-blue)] text-white' : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
            }`}>
            Filtro global
          </button>
        </div>
        <div className="flex items-center gap-1 ml-1">
          <input type="date" value={cDesde} onChange={(e) => setCDesde(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] focus:outline-none"
            style={{ borderColor: 'var(--border)' }} />
          <span className="text-[10px] text-[var(--text-muted)]">—</span>
          <input type="date" value={cHasta} onChange={(e) => setCHasta(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] focus:outline-none"
            style={{ borderColor: 'var(--border)' }} />
          <button onClick={() => cDesde && cHasta && aplicarRango(cDesde, cHasta)}
            disabled={!cDesde || !cHasta}
            className="px-2.5 py-1.5 rounded-[6px] text-[11px] font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bar-bg)] disabled:opacity-40 transition-colors">
            Aplicar
          </button>
        </div>

        {/* Vista */}
        <div className="flex rounded-[6px] border border-[var(--border)] overflow-hidden ml-auto">
          {([['cons', 'Consolidado'], ['bod', 'Por bodega']] as const).map(([id, label]) => (
            <button key={id}
              onClick={() => setConsolidado(id === 'cons')}
              disabled={!!bodegaSel}
              title={bodegaSel ? 'Con una bodega elegida la vista siempre es por bodega' : undefined}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                (id === 'cons') === consolidado && !bodegaSel
                  ? 'bg-[var(--brand-blue)] text-white'
                  : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por referencia, producto o código…"
            className="w-full text-[12px] pl-8 pr-8 py-2 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
            style={{ borderColor: 'var(--border)' }} />
          {q && (
            <button onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] text-[13px] leading-none">✕</button>
          )}
        </div>

        <select value={bodegaSel} onChange={(e) => setBodegaSel(e.target.value)}
          className="text-[12px] px-2.5 py-2 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] focus:outline-none"
          style={{ borderColor: 'var(--border)' }}>
          <option value="">Todas las bodegas</option>
          {bodegas.map((b) => <option key={b} value={b}>Bodega {b}</option>)}
        </select>

        <button onClick={() => setSoloMov((v) => !v)}
          className={`px-3 py-2 rounded-[6px] text-[11px] font-medium border transition-colors ${
            soloMov
              ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
              : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
          }`}>
          {soloMov ? '✓ Con movimiento' : 'Con movimiento'}
        </button>

        <button onClick={() => { const v = !verRotacion; setVerRotacion(v); if (!v && (orden === 'cobertura' || orden === 'ventas')) setOrden('valor') }}
          title="Muestra las columnas de tendencia (vs anterior) y cobertura de stock"
          className={`px-3 py-2 rounded-[6px] text-[11px] font-medium border transition-colors ${
            verRotacion
              ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
              : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
          }`}>
          {verRotacion ? '✓ Rotación' : 'Rotación'}
        </button>
      </div>

      {/* Fichas del período: solo cuando hay una ventana de fechas activa */}
      {rangoActivo !== 'global' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Saldo inicial del período</div>
          <div className="text-[17px] font-bold num text-[var(--text)] leading-tight">{fmtN(tot.saldoIni)} <span className="text-[11px] font-normal text-[var(--text-muted)]">und</span></div>
          <div className="text-[10px] num text-[var(--text-muted)]">{fmt(tot.valorIni)}</div>
        </div>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">+ Entradas del período</div>
          <div className="text-[17px] font-bold num text-[var(--brand-blue)] leading-tight">{fmtN(tot.entradas)} <span className="text-[11px] font-normal text-[var(--text-muted)]">und</span></div>
          <div className="text-[10px] text-[var(--text-muted)]">{fmtN(filtrados.reduce((s, p) => s + p.movsEntrada, 0))} movimientos</div>
        </div>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">− Salidas del período</div>
          <div className="text-[17px] font-bold num text-orange-500 leading-tight">{fmtN(tot.salidas)} <span className="text-[11px] font-normal text-[var(--text-muted)]">und</span></div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {fmtN(filtrados.reduce((s, p) => s + p.movsSalida, 0))} movimientos · ventas <span className="num font-semibold text-[#16a34a]">{fmtN(tot.ventas)}</span>
          </div>
        </div>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">= Saldo final del período</div>
          <div className="text-[17px] font-bold num text-[var(--text)] leading-tight">{fmtN(tot.saldoFin)} <span className="text-[11px] font-normal text-[var(--text-muted)]">und</span></div>
          <div className="text-[10px] num text-[var(--text-muted)]">
            {fmt(tot.valorFin)}
            {tot.saldoIni + tot.entradas - tot.salidas === tot.saldoFin
              ? <span className="ml-1.5 text-[#22c55e]" title="Inicial + entradas − salidas = final">✓ cuadra</span>
              : <span className="ml-1.5 text-amber-500" title={`Inicial + entradas − salidas = ${fmtN(tot.saldoIni + tot.entradas - tot.salidas)}`}>Δ {fmtN(tot.saldoFin - (tot.saldoIni + tot.entradas - tot.salidas))}</span>}
          </div>
        </div>
      </div>
      )}

      {/* Resumen plegable — cerrado por defecto */}
      <button
        onClick={() => setResumenAbierto((v) => !v)}
        className="w-full text-left mb-2 px-2.5 py-2 rounded-[6px] bg-[var(--bar-bg)] hover:bg-[var(--nav-hover)] transition-colors">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${resumenAbierto ? 'rotate-90' : ''}`}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            {periodoLabel}
          </span>
          <span className="text-[11px] text-[var(--text-sub)]"><span className="font-semibold text-[var(--text)] num">{fmtN(filtrados.length)}</span> productos</span>
          {!resumenAbierto && (
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ver totales</span>
          )}
          {resumenAbierto && (
            <>
              <span className="text-[11px] text-[var(--text-sub)]">stock <span className="font-semibold text-[var(--text)] num">{fmtN(tot.stock)}</span> und</span>
              <span className="text-[11px] text-[var(--text-sub)]"><span className="font-semibold text-[#22c55e] num">{fmt(tot.valor)}</span></span>
              <span className="text-[11px] text-[var(--text-sub)]">entradas <span className="font-semibold text-[var(--brand-blue)] num">{fmtN(tot.entradas)}</span></span>
              <span className="text-[11px] text-[var(--text-sub)]">salidas <span className="font-semibold text-orange-500 num">{fmtN(tot.salidas)}</span></span>
              <span className="text-[11px] text-[var(--text-sub)]">ventas <span className="font-semibold text-[#22c55e] num">{fmtN(tot.ventas)}</span>
                {tot.ventasPrev > 0 && (
                  <span className={`ml-1 num font-semibold ${tot.ventas >= tot.ventasPrev ? 'text-[#22c55e]' : 'text-red-500'}`}>
                    {tot.ventas >= tot.ventasPrev ? '▲' : '▼'}{Math.abs(Math.round(((tot.ventas - tot.ventasPrev) / tot.ventasPrev) * 100))}%
                  </span>
                )}
              </span>
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">Clic en las cifras de la tabla para ver el detalle</span>
            </>
          )}
        </div>
      </button>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">Sin resultados para este filtro</div>
      ) : (
        <div className="table-scroll" style={{ maxHeight: 480 }}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-[var(--card)] z-10">
              <tr>
                <th className={`${th} text-left`}>Referencia</th>
                <th className={`${th} text-left`}>Producto</th>
                {!esConsolidado && <th className={`${th} text-left`}>Bodega</th>}
                <th className={`${th} text-right`}>Entradas</th>
                <th className={`${th} text-right`}>Salidas</th>
                {verRotacion && (
                  <>
                    <th className={`${th} text-right`} title="Ventas de la ventana vs la ventana anterior de igual longitud">vs ant.</th>
                    <th className={`${th} text-right cursor-pointer select-none hover:text-[var(--text)]`} onClick={() => setOrden('cobertura')}
                      title="Días que dura el stock al ritmo de venta de la ventana — clic para ordenar">
                      Cobertura{orden === 'cobertura' ? ' ↑' : ''}
                    </th>
                  </>
                )}
                <th className={`${th} text-right cursor-pointer select-none hover:text-[var(--text)]`} onClick={() => setOrden('stock')}>
                  Stock{orden === 'stock' ? ' ↓' : ''}
                </th>
                <th className={`${th} text-right cursor-pointer select-none hover:text-[var(--text)]`} onClick={() => setOrden('valor')}>
                  Valor{orden === 'valor' ? ' ↓' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, MAX_FILAS).map((p) => (
                <tr key={`${p.codigo}|${p.bodega}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className={`${td} num text-[11px] text-[var(--text)]`}>{p.referencia || p.codigo}</td>
                  <td className={td}><span className="block max-w-[240px] truncate">{p.producto}</span></td>
                  {!esConsolidado && <td className={`${td} num text-[11px]`}>{p.bodega}</td>}
                  <td className={`${td} text-right`}>
                    {p.entradasPeriodo > 0 ? (
                      <button onClick={() => abrirDetalle(p, 'entradas')}
                        title={`${p.movsEntrada} ${p.movsEntrada === 1 ? 'movimiento' : 'movimientos'} — clic para ver`}
                        className="num text-[11px] font-semibold text-[var(--brand-blue)] underline decoration-dotted underline-offset-2 hover:opacity-70">
                        {fmtN(p.entradasPeriodo)}
                      </button>
                    ) : <span className="num text-[11px] text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    {p.salidasPeriodo > 0 ? (
                      <button onClick={() => abrirDetalle(p, 'salidas')}
                        title={`${p.movsSalida} ${p.movsSalida === 1 ? 'movimiento' : 'movimientos'} — clic para ver`}
                        className="num text-[11px] font-semibold text-orange-500 underline decoration-dotted underline-offset-2 hover:opacity-70">
                        {fmtN(p.salidasPeriodo)}
                      </button>
                    ) : <span className="num text-[11px] text-[var(--text-muted)]">—</span>}
                  </td>
                  {verRotacion && (
                  <>
                  <td className={`${td} text-right num text-[11px]`}>
                    {p.ventasPrev > 0 ? (
                      <span className={p.ventasPeriodo >= p.ventasPrev ? 'text-[#22c55e]' : 'text-red-500'}
                        title={`Ventana anterior: ${fmtN(p.ventasPrev)} und`}>
                        {p.ventasPeriodo >= p.ventasPrev ? '▲' : '▼'}{Math.abs(Math.round(((p.ventasPeriodo - p.ventasPrev) / p.ventasPrev) * 100))}%
                      </span>
                    ) : p.ventasPeriodo > 0 ? (
                      <span className="text-[var(--brand-blue)]" title="Sin ventas en la ventana anterior">nuevo</span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className={`${td} text-right num text-[11px]`}>
                    {(() => {
                      const c = cobertura(p, diasVentana)
                      if (c === null) return <span className="text-[var(--text-muted)]">—</span>
                      if (c === Infinity) return <span className="text-[var(--text-muted)]">sin venta</span>
                      const dias = Math.round(c)
                      return (
                        <span className={dias < 15 ? 'text-red-500 font-semibold' : dias > 180 ? 'text-amber-500' : 'text-[var(--text-sub)]'}
                          title={`Ritmo: ${(p.ventasPeriodo / diasVentana).toFixed(1)} und/día`}>
                          {fmtN(dias)} d
                        </span>
                      )
                    })()}
                  </td>
                  </>
                  )}
                  <td className={`${td} text-right num text-[11px] ${p.saldoActual < 0 ? 'text-red-500 font-semibold' : 'text-[var(--text)]'}`}>{fmtN(p.saldoActual)}</td>
                  <td className={`${td} text-right num text-[11px]`}><span className={p.valorActual < 0 ? 'text-red-500' : 'text-[#22c55e]'}>{fmt(p.valorActual)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtrados.length > MAX_FILAS && (
        <div className="mt-2 text-[10px] text-[var(--text-muted)] text-center">
          Mostrando los {MAX_FILAS} de mayor valor — los totales de arriba sí incluyen los {fmtN(filtrados.length)}. Afina la búsqueda para ver el resto.
        </div>
      )}

      {/* Pop-up de detalle */}
      {popup && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={() => setPopup(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col rounded-card border shadow-2xl overflow-hidden"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between px-4 pt-3.5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 pr-3">
                <div className="text-[13px] font-semibold text-[var(--text)]">
                  {popup.dir === 'entradas' ? 'Entradas' : popup.dir === 'ventas' ? 'Ventas' : 'Salidas'} — {popup.p.referencia || popup.p.codigo}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{popup.p.producto}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{popup.p.bodega ? `Bodega ${popup.p.bodega}` : 'Todas las bodegas'} · {periodoLabel}</div>
              </div>
              <button onClick={() => setPopup(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-[16px] leading-none flex-shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cargando ? (
                <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">Cargando movimientos…</div>
              ) : errorPopup ? (
                <div className="py-10 px-4 text-center text-[11px] text-red-500">{errorPopup}</div>
              ) : movsFiltrados.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">Sin movimientos en el período</div>
              ) : (
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0 bg-[var(--card)]">
                    <tr>
                      {['Fecha', 'Tipo', 'Detalle', 'Documento', 'Cant.', 'Vr. Unitario', 'Saldo'].map((h, i) => (
                        <th key={h} className={`px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movsFiltrados.map((m, i) => {
                      const cant = popup.dir === 'entradas' ? m.entradas : m.salidas
                      return (
                        <tr key={`${m.documento}-${i}`} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-3 py-2 num text-[var(--text-sub)]">{m.fecha}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              popup.dir === 'entradas'
                                ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                                : popup.dir === 'ventas'
                                  ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400'
                                  : 'bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400'
                            }`}>
                              {TIPO_LABEL[m.tipo] ?? m.tipo ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-sub)]"><span className="block max-w-[180px] truncate" title={m.transaccion}>{m.transaccion}</span></td>
                          <td className="px-3 py-2 num text-[var(--text)]">{m.documento || '—'}</td>
                          <td className={`px-3 py-2 text-right num font-semibold ${popup.dir === 'entradas' ? 'text-[var(--brand-blue)]' : popup.dir === 'ventas' ? 'text-[#16a34a]' : 'text-orange-500'}`}>{fmtN(cant)}</td>
                          <td className="px-3 py-2 text-right num text-[var(--text-sub)]">{fmt(m.unitario)}</td>
                          <td className={`px-3 py-2 text-right num ${m.saldo < 0 ? 'text-red-500 font-semibold' : 'text-[var(--text-sub)]'}`}>{fmtN(m.saldo)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!cargando && !errorPopup && movsFiltrados.length > 0 && (
              <div className="px-4 py-2.5 border-t text-[11px] text-[var(--text-sub)] flex gap-4" style={{ borderColor: 'var(--border)' }}>
                <span><span className="font-semibold text-[var(--text)] num">{fmtN(movsFiltrados.length)}</span> {movsFiltrados.length === 1 ? 'movimiento' : 'movimientos'}</span>
                <span><span className={`font-semibold num ${popup.dir === 'entradas' ? 'text-[var(--brand-blue)]' : popup.dir === 'ventas' ? 'text-[#16a34a]' : 'text-orange-500'}`}>
                  {fmtN(movsFiltrados.reduce((s, m) => s + (popup.dir === 'entradas' ? m.entradas : m.salidas), 0))}
                </span> unidades</span>
                <span className="ml-auto num text-[#22c55e] font-semibold">
                  {fmt(movsFiltrados.reduce((s, m) => s + (popup.dir === 'entradas' ? m.entradas : m.salidas) * m.unitario, 0))}
                </span>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
