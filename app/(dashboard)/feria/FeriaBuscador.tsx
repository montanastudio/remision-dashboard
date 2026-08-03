'use client'

import { useMemo, useState } from 'react'
import type { FeriaProducto } from '@/lib/feria'

function fmtMoney(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-CO')
}

// Normaliza para búsqueda: minúsculas y sin acentos
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Orden de los niveles para el filtro (mayor descuento primero)
const TIERS = [
  { pct: 0.5, label: '50%', color: '#0ea5e9' },
  { pct: 0.4, label: '40%', color: '#f97316' },
  { pct: 0.3, label: '30%', color: '#22c55e' },
  { pct: 0.2, label: '20%', color: '#d946ef' },
  { pct: 0,   label: 'Sin descuento', color: '#94a3b8' },
]

export default function FeriaBuscador({ productos }: { productos: FeriaProducto[] }) {
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<number | null>(null) // null = todos

  const conteoPorTier = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of productos) m.set(p.descuentoPct, (m.get(p.descuentoPct) ?? 0) + 1)
    return m
  }, [productos])

  const filtrados = useMemo(() => {
    const q = norm(query.trim())
    const tokens = q.split(/\s+/).filter(Boolean)
    return productos.filter(p => {
      if (tier !== null && p.descuentoPct !== tier) return false
      if (tokens.length === 0) return true
      const hay = norm(p.referencia + ' ' + p.producto)
      return tokens.every(t => hay.includes(t))
    })
  }, [productos, query, tier])

  const sinDatos = productos.length === 0

  return (
    <div className="space-y-4">
      {/* ── Encabezado + buscador ── */}
      <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-[15px] md:text-[17px] font-bold text-[var(--text)]">Precios de feria</h2>
            <p className="text-[11px] md:text-[12px] text-[var(--text-muted)] mt-0.5">
              Busca una referencia o modelo para ver su Lista BT y el descuento que le corresponde.
            </p>
          </div>
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {filtrados.length} de {productos.length} productos
          </span>
        </div>

        {/* Input de búsqueda */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por referencia o nombre… (ej. 6240M, YAMAL, vitek)"
            className="w-full pl-10 pr-9 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)]"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Limpiar búsqueda"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Filtros por nivel de descuento */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => setTier(null)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              tier === null
                ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
                : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--nav-hover)]'
            }`}
          >
            Todos ({productos.length})
          </button>
          {TIERS.map(t => {
            const c = conteoPorTier.get(t.pct) ?? 0
            if (c === 0) return null
            const active = tier === t.pct
            return (
              <button
                key={t.label}
                onClick={() => setTier(active ? null : t.pct)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5"
                style={
                  active
                    ? { background: t.color, borderColor: t.color, color: '#fff' }
                    : { borderColor: 'var(--border)', color: 'var(--text-sub)' }
                }
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: active ? '#fff' : t.color }} />
                {t.label} ({c})
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Resultados ── */}
      {sinDatos ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-8 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">
            No se pudo cargar la información de la feria. Verifica que el sheet esté compartido con el service account.
          </p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-8 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">Sin resultados para «{query}».</p>
        </div>
      ) : (
        <>
          {/* Tabla — desktop */}
          <div className="hidden md:block rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    <th className="text-left font-semibold px-4 py-3">Referencia</th>
                    <th className="text-left font-semibold px-4 py-3">Producto</th>
                    <th className="text-center font-semibold px-4 py-3">Descuento</th>
                    <th className="text-right font-semibold px-4 py-3">Lista BT</th>
                    <th className="text-right font-semibold px-4 py-3">Precio final</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p, i) => (
                    <tr key={`${p.referencia}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)]">
                      <td className="px-4 py-2.5 font-semibold text-[var(--text)] whitespace-nowrap">{p.referencia}</td>
                      <td className="px-4 py-2.5 text-[var(--text-sub)]">{p.producto}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                          style={{ background: p.descuentoColor }}
                        >
                          {p.descuentoLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-muted)] tabular-nums">
                        {p.descuentoPct > 0 ? <span className="line-through">{fmtMoney(p.listaBT)}</span> : fmtMoney(p.listaBT)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-[var(--text)] tabular-nums">{fmtMoney(p.precioFinal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-2">
            {filtrados.map((p, i) => (
              <div key={`${p.referencia}-${i}`} className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[var(--text)]">{p.referencia}</div>
                    <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">{p.producto}</div>
                  </div>
                  <span
                    className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                    style={{ background: p.descuentoColor }}
                  >
                    {p.descuentoLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 mt-1">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Lista BT:{' '}
                    <span className={p.descuentoPct > 0 ? 'line-through' : ''}>{fmtMoney(p.listaBT)}</span>
                  </div>
                  <div className="text-[15px] font-bold text-[var(--text)] tabular-nums">{fmtMoney(p.precioFinal)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
