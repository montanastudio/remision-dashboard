'use client'

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import type { ProductoKardex, MovimientoKardex } from '@/lib/kardex'
import { fmt, fmtN } from '@/lib/format'

interface Props {
  productos: ProductoKardex[]
  periodoLabel: string
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

export default function InventarioKardex({ productos, periodoLabel }: Props) {
  const searchParams = useSearchParams()
  const [q, setQ] = useState('')
  const [bodegaSel, setBodegaSel] = useState('')
  const [soloMov, setSoloMov] = useState(false)
  const [popup, setPopup] = useState<{ p: ProductoKardex; dir: 'entradas' | 'salidas' } | null>(null)
  const [movs, setMovs] = useState<MovimientoKardex[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorPopup, setErrorPopup] = useState('')

  const bodegas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.bodega).filter(Boolean))).sort(),
    [productos]
  )

  const indexados = useMemo(
    () => productos.map((p) => ({ p, buscable: normalizar(`${p.referencia} ${p.producto} ${p.codigo}`) })),
    [productos]
  )

  const filtrados = useMemo(() => {
    const term = normalizar(q.trim())
    return indexados
      .filter(({ p, buscable }) => {
        if (term && !buscable.includes(term)) return false
        if (bodegaSel && p.bodega !== bodegaSel) return false
        if (soloMov && p.entradasPeriodo === 0 && p.salidasPeriodo === 0) return false
        return true
      })
      .map(({ p }) => p)
  }, [indexados, q, bodegaSel, soloMov])

  const tot = useMemo(() => ({
    stock:    filtrados.reduce((s, p) => s + p.saldoActual, 0),
    valor:    filtrados.reduce((s, p) => s + p.valorActual, 0),
    entradas: filtrados.reduce((s, p) => s + p.entradasPeriodo, 0),
    salidas:  filtrados.reduce((s, p) => s + p.salidasPeriodo, 0),
  }), [filtrados])

  async function abrirDetalle(p: ProductoKardex, dir: 'entradas' | 'salidas') {
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
    return movs.filter((m) => popup.dir === 'entradas' ? m.entradas > 0 : m.salidas > 0)
  }, [movs, popup])

  const th = 'px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)]'
  const td = 'px-[10px] py-[8px] text-[var(--text-sub)]'

  return (
    <div>
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
      </div>

      {/* Resumen */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2 px-2.5 py-2 rounded-[6px] bg-[var(--bar-bg)]">
        <span className="text-[11px] text-[var(--text-muted)]">{periodoLabel}</span>
        <span className="text-[11px] text-[var(--text-sub)]"><span className="font-semibold text-[var(--text)] num">{fmtN(filtrados.length)}</span> productos</span>
        <span className="text-[11px] text-[var(--text-sub)]">stock <span className="font-semibold text-[var(--text)] num">{fmtN(tot.stock)}</span> und</span>
        <span className="text-[11px] text-[var(--text-sub)]"><span className="font-semibold text-[#22c55e] num">{fmt(tot.valor)}</span></span>
        <span className="text-[11px] text-[var(--text-sub)]">entradas <span className="font-semibold text-[var(--brand-blue)] num">{fmtN(tot.entradas)}</span></span>
        <span className="text-[11px] text-[var(--text-sub)]">salidas <span className="font-semibold text-orange-500 num">{fmtN(tot.salidas)}</span></span>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">Clic en entradas o salidas para ver el detalle</span>
      </div>

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
                <th className={`${th} text-left`}>Bodega</th>
                <th className={`${th} text-right`}>Entradas</th>
                <th className={`${th} text-right`}>Salidas</th>
                <th className={`${th} text-right`}>Stock</th>
                <th className={`${th} text-right`}>Valor</th>
                <th className={`${th} text-right`}>Último mov.</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, MAX_FILAS).map((p) => (
                <tr key={`${p.codigo}|${p.bodega}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className={`${td} num text-[11px] text-[var(--text)]`}>{p.referencia || p.codigo}</td>
                  <td className={td}><span className="block max-w-[280px] truncate">{p.producto}</span></td>
                  <td className={`${td} num text-[11px]`}>{p.bodega}</td>
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
                  <td className={`${td} text-right num text-[11px] ${p.saldoActual < 0 ? 'text-red-500 font-semibold' : 'text-[var(--text)]'}`}>{fmtN(p.saldoActual)}</td>
                  <td className={`${td} text-right num text-[11px]`}><span className={p.valorActual < 0 ? 'text-red-500' : 'text-[#22c55e]'}>{fmt(p.valorActual)}</span></td>
                  <td className={`${td} text-right num text-[11px]`}>{p.ultimoMovimiento || '—'}</td>
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
                  {popup.dir === 'entradas' ? 'Entradas' : 'Salidas'} — {popup.p.referencia || popup.p.codigo}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{popup.p.producto}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Bodega {popup.p.bodega} · {periodoLabel}</div>
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
                                : 'bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400'
                            }`}>
                              {TIPO_LABEL[m.tipo] ?? m.tipo ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-sub)]"><span className="block max-w-[180px] truncate" title={m.transaccion}>{m.transaccion}</span></td>
                          <td className="px-3 py-2 num text-[var(--text)]">{m.documento || '—'}</td>
                          <td className={`px-3 py-2 text-right num font-semibold ${popup.dir === 'entradas' ? 'text-[var(--brand-blue)]' : 'text-orange-500'}`}>{fmtN(cant)}</td>
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
                <span><span className={`font-semibold num ${popup.dir === 'entradas' ? 'text-[var(--brand-blue)]' : 'text-orange-500'}`}>
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
