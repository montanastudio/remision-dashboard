'use client'

import { useState, useMemo } from 'react'
import { fmt, fmtN } from '@/lib/format'

/** Fila mínima que necesita el detalle — se arma en el server. */
export interface FilaVenta {
  factura: string
  fecha: string
  nit: string
  cliente: string
  vendedor: string
  referencia: string
  producto: string
  grupo: string
  cantidad: number
  valor: number
}

type Agrupacion = 'detalle' | 'factura' | 'producto'

const AGRUPACIONES: { key: Agrupacion; label: string }[] = [
  { key: 'detalle',  label: 'Sin agrupar' },
  { key: 'factura',  label: 'Por factura' },
  { key: 'producto', label: 'Por producto' },
]

/** Quita tildes y pasa a minúsculas para que "jose" encuentre "JOSÉ". */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const MAX_FILAS = 300

interface Props {
  filas: FilaVenta[]
  periodoLabel: string
}

export default function VentasDetalle({ filas, periodoLabel }: Props) {
  const [q, setQ] = useState('')
  const [vendedoresSel, setVendedoresSel] = useState<string[]>([])
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('detalle')

  // Vendedores presentes en el período, con su venta total para ordenarlos
  const vendedores = useMemo(() => {
    const map: Record<string, number> = {}
    for (const f of filas) {
      const v = f.vendedor.trim()
      if (v) map[v] = (map[v] ?? 0) + f.valor
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([v]) => v)
  }, [filas])

  // Índice de búsqueda precalculado: evita normalizar en cada tecleo
  const indexadas = useMemo(
    () => filas.map((f) => ({
      f,
      buscable: normalizar(`${f.cliente} ${f.nit} ${f.referencia} ${f.producto} ${f.factura}`),
    })),
    [filas]
  )

  const filtradas = useMemo(() => {
    const term = normalizar(q.trim())
    const sel = new Set(vendedoresSel)
    return indexadas
      .filter(({ f, buscable }) => {
        if (term && !buscable.includes(term)) return false
        if (sel.size > 0 && !sel.has(f.vendedor.trim())) return false
        return true
      })
      .map(({ f }) => f)
      // Mayor valor primero: el recorte a MAX_FILAS conserva lo relevante.
      .sort((a, b) => b.valor - a.valor)
  }, [indexadas, q, vendedoresSel])

  const totalValor = filtradas.reduce((s, f) => s + f.valor, 0)
  const totalCant  = filtradas.reduce((s, f) => s + f.cantidad, 0)

  // Agrupaciones
  const porFactura = useMemo(() => {
    if (agrupacion !== 'factura') return []
    const map: Record<string, {
      factura: string; fecha: string; cliente: string; nit: string
      vendedor: string; items: number; cantidad: number; valor: number
    }> = {}
    for (const f of filtradas) {
      const k = f.factura || '(sin factura)'
      if (!map[k]) {
        map[k] = { factura: k, fecha: f.fecha, cliente: f.cliente, nit: f.nit, vendedor: f.vendedor, items: 0, cantidad: 0, valor: 0 }
      }
      map[k].items    += 1
      map[k].cantidad += f.cantidad
      map[k].valor    += f.valor
    }
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [filtradas, agrupacion])

  const porProducto = useMemo(() => {
    if (agrupacion !== 'producto') return []
    const map: Record<string, {
      referencia: string; producto: string; grupo: string
      facturas: Set<string>; clientes: Set<string>; cantidad: number; valor: number
    }> = {}
    for (const f of filtradas) {
      const k = f.referencia || f.producto || '(sin referencia)'
      if (!map[k]) {
        map[k] = { referencia: k, producto: f.producto, grupo: f.grupo, facturas: new Set(), clientes: new Set(), cantidad: 0, valor: 0 }
      }
      if (!map[k].producto && f.producto) map[k].producto = f.producto
      if (f.factura) map[k].facturas.add(f.factura)
      if (f.nit) map[k].clientes.add(f.nit)
      map[k].cantidad += f.cantidad
      map[k].valor    += f.valor
    }
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [filtradas, agrupacion])

  const totalGrupos = agrupacion === 'factura' ? porFactura.length
    : agrupacion === 'producto' ? porProducto.length
    : filtradas.length

  const hayFiltros = q.trim() !== '' || vendedoresSel.length > 0

  function toggleVendedor(v: string) {
    setVendedoresSel((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])
  }

  const thBase = 'px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)]'
  const tdBase = 'px-[10px] py-[9px] text-[var(--text-sub)]'

  return (
    <div>
      {/* Controles */}
      <div className="space-y-2.5 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[220px]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, NIT, referencia, producto o factura…"
              className="w-full text-[12px] pl-8 pr-8 py-2 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
              style={{ borderColor: 'var(--border)' }}
            />
            {q && (
              <button onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] text-[13px] leading-none">
                ✕
              </button>
            )}
          </div>

          {/* Agrupación */}
          <div className="flex rounded-[6px] border border-[var(--border)] overflow-hidden flex-shrink-0">
            {AGRUPACIONES.map((a) => (
              <button key={a.key} onClick={() => setAgrupacion(a.key)}
                className={`px-3 py-2 text-[11px] font-medium transition-colors ${
                  agrupacion === a.key
                    ? 'bg-[var(--brand-blue)] text-white'
                    : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
                }`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vendedores */}
        {vendedores.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-0.5">Vendedor</span>
            {vendedores.map((v) => {
              const on = vendedoresSel.includes(v)
              return (
                <button key={v} onClick={() => toggleVendedor(v)}
                  className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                    on
                      ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)]'
                  }`}>
                  {v}
                </button>
              )
            })}
            {vendedoresSel.length > 0 && (
              <button onClick={() => setVendedoresSel([])}
                className="px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] underline">
                limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Resumen de lo que se está viendo */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2 px-2.5 py-2 rounded-[6px] bg-[var(--bar-bg)]">
        <span className="text-[11px] text-[var(--text-muted)]">
          {hayFiltros ? 'Resultado del filtro' : periodoLabel}
        </span>
        <span className="text-[11px] text-[var(--text-sub)]">
          <span className="font-semibold text-[var(--text)] num">{fmtN(totalGrupos)}</span>{' '}
          {agrupacion === 'factura' ? (totalGrupos === 1 ? 'factura' : 'facturas')
            : agrupacion === 'producto' ? (totalGrupos === 1 ? 'referencia' : 'referencias')
            : (totalGrupos === 1 ? 'registro' : 'registros')}
        </span>
        <span className="text-[11px] text-[var(--text-sub)]">
          <span className="font-semibold text-[var(--text)] num">{fmtN(totalCant)}</span> und
        </span>
        <span className="text-[11px] text-[var(--text-sub)]">
          <span className="font-semibold text-[#22c55e] num">{fmt(totalValor)}</span>
        </span>
      </div>

      {/* Tabla */}
      {filtradas.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
          Sin resultados para este filtro
        </div>
      ) : (
        <div className="table-scroll" style={{ maxHeight: 420 }}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-[var(--card)] z-10">
              <tr>
                {agrupacion === 'factura' ? (
                  <>
                    <th className={`${thBase} text-left`}>Factura</th>
                    <th className={`${thBase} text-left`}>Fecha</th>
                    <th className={`${thBase} text-left`}>Cliente</th>
                    <th className={`${thBase} text-left`}>Vendedor</th>
                    <th className={`${thBase} text-right`}>Ítems</th>
                    <th className={`${thBase} text-right`}>Cant.</th>
                    <th className={`${thBase} text-right`}>Vr. Total</th>
                  </>
                ) : agrupacion === 'producto' ? (
                  <>
                    <th className={`${thBase} text-left`}>Referencia</th>
                    <th className={`${thBase} text-left`}>Producto</th>
                    <th className={`${thBase} text-left`}>Grupo</th>
                    <th className={`${thBase} text-right`}>Facturas</th>
                    <th className={`${thBase} text-right`}>Clientes</th>
                    <th className={`${thBase} text-right`}>Cant.</th>
                    <th className={`${thBase} text-right`}>Vr. Total</th>
                  </>
                ) : (
                  <>
                    <th className={`${thBase} text-left`}>Factura</th>
                    <th className={`${thBase} text-left`}>Referencia</th>
                    <th className={`${thBase} text-left`}>Producto</th>
                    <th className={`${thBase} text-left`}>Cliente</th>
                    <th className={`${thBase} text-left`}>Vendedor</th>
                    <th className={`${thBase} text-left`}>Fecha</th>
                    <th className={`${thBase} text-right`}>Cant.</th>
                    <th className={`${thBase} text-right`}>Vr. Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {agrupacion === 'factura' && porFactura.slice(0, MAX_FILAS).map((f) => (
                <tr key={f.factura} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className={`${tdBase} num text-[11px] text-[var(--text)]`}>{f.factura}</td>
                  <td className={`${tdBase} num text-[11px]`}>{f.fecha}</td>
                  <td className={tdBase}><span className="block max-w-[200px] truncate">{f.cliente}</span></td>
                  <td className={tdBase}><span className="block max-w-[130px] truncate">{f.vendedor}</span></td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(f.items)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(f.cantidad)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}><span className="text-[#22c55e]">{fmt(f.valor)}</span></td>
                </tr>
              ))}

              {agrupacion === 'producto' && porProducto.slice(0, MAX_FILAS).map((p) => (
                <tr key={p.referencia} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className={`${tdBase} num text-[11px] text-[var(--text)]`}>{p.referencia}</td>
                  <td className={tdBase}><span className="block max-w-[220px] truncate">{p.producto}</span></td>
                  <td className={tdBase}>{p.grupo}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(p.facturas.size)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(p.clientes.size)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(p.cantidad)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}><span className="text-[#22c55e]">{fmt(p.valor)}</span></td>
                </tr>
              ))}

              {agrupacion === 'detalle' && filtradas.slice(0, MAX_FILAS).map((f, i) => (
                <tr key={`${f.factura}-${f.referencia}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                  <td className={`${tdBase} num text-[11px]`}>{f.factura}</td>
                  <td className={`${tdBase} num text-[11px] text-[var(--text)]`}>{f.referencia}</td>
                  <td className={tdBase}><span className="block max-w-[200px] truncate">{f.producto}</span></td>
                  <td className={tdBase}><span className="block max-w-[160px] truncate">{f.cliente}</span></td>
                  <td className={tdBase}><span className="block max-w-[130px] truncate">{f.vendedor}</span></td>
                  <td className={`${tdBase} num text-[11px]`}>{f.fecha}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}>{fmtN(f.cantidad)}</td>
                  <td className={`${tdBase} text-right num text-[11px]`}><span className="text-[#22c55e]">{fmt(f.valor)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalGrupos > MAX_FILAS && (
        <div className="mt-2 text-[10px] text-[var(--text-muted)] text-center">
          Mostrando las {MAX_FILAS} de mayor valor — los totales de arriba sí incluyen las {fmtN(totalGrupos)}. Afina la búsqueda para ver el resto.
        </div>
      )}
    </div>
  )
}
