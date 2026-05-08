'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { fmt, fmtN } from '@/lib/format'
import { ZONAS_CONFIG, DPTO_TO_ZONA, totalMunicipios } from '@/lib/zonas-config'
import { MUNICIPIOS_POR_DPTO } from '@/lib/colombia-municipios'
import CiudadesModal, { type CiudadCubierta, type CiudadFaltante } from './CiudadesModal'

const ZonaMap = dynamic(() => import('./ZonaMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center py-16 text-[12px] text-[var(--text-muted)]">
      Cargando mapa...
    </div>
  ),
})

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const s = String(v ?? '').trim()
  // Formato colombiano: múltiples puntos = separadores de miles ("4.464.000" → 4464000)
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

type Row = Record<string, string>

interface Props {
  detalle: Row[]
  detalleHeaders: string[]
  totalValor: number
  ciudadesTotal: number
}

const NUM_PATTERN = /valor|venta|bruto|cantidad|unidad|und|precio/i

export default function ZonaInteractivo({ detalle, detalleHeaders, totalValor, ciudadesTotal }: Props) {
  const [selectedZonaId, setSelectedZonaId]     = useState<string | null>(null)
  const [tableExpanded, setTableExpanded]       = useState(false)
  const [modal, setModal]                       = useState<{ zonaId: string; tipo: 'cubiertas' | 'faltantes' } | null>(null)
  const [coberturaOpen, setCoberturaOpen]       = useState<Set<string>>(new Set())

  const toggleCobertura = (zonaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCoberturaOpen(prev => {
      const next = new Set(prev)
      next.has(zonaId) ? next.delete(zonaId) : next.add(zonaId)
      return next
    })
  }

  const deptKey  = detalleHeaders.find(k => /c[oó]d.*dep|cód.*dep/i.test(k)) ?? 'Cód. Depto'
  const valorKey = detalleHeaders.find(k => /valor|bruto/i.test(k))           ?? 'Valor Bruto ($)'
  const undKey   = detalleHeaders.find(k => /cantidad|und/i.test(k))          ?? 'Cantidad'

  // Mapa rápido: NVENDEDOR en mayúsculas → zonaId del asesor
  const vendedorZonaMap = useMemo(() => {
    const m: Record<string, string> = {}
    ZONAS_CONFIG.forEach(z => z.nvendedores.forEach(nv => { m[nv.toUpperCase()] = z.id }))
    return m
  }, [])

  // Categorías especiales (en mayúsculas para comparar)
  const DIRECTAS     = 'VENTAS DIRECTAS'
  const CONSIGNACION = 'CLIENTES EN CONSIGNACION'
  const CRISTIAN     = 'CRISTIAN MONTANA'

  // ── Estadísticas por zona ────────────────────────────────────────────
  const zonaStats = useMemo(() => {
    const stats: Record<string, {
      valor: number; cantidad: number
      asesor: number; directas: number; consignacion: number; cristian: number; otros: number
      ciudades: Set<string>; dptosCubiertos: Set<string>
    }> = {}
    ZONAS_CONFIG.forEach(z => {
      stats[z.id] = {
        valor: 0, cantidad: 0,
        asesor: 0, directas: 0, consignacion: 0, cristian: 0, otros: 0,
        ciudades: new Set(), dptosCubiertos: new Set(),
      }
    })
    detalle.forEach(r => {
      const cod  = String(r[deptKey] ?? '').trim().padStart(2, '0')
      const zona = DPTO_TO_ZONA[cod]
      if (!zona) return
      const valor   = parseNum(r[valorKey])
      const und     = parseNum(r[undKey])
      const vend    = String(r['Vendedor'] ?? '').trim().toUpperCase()
      const s       = stats[zona.id]

      s.valor    += valor
      s.cantidad += und

      // Desglose por origen de venta
      if (vend === DIRECTAS)          s.directas     += valor
      else if (vend === CONSIGNACION) s.consignacion += valor
      else if (vend === CRISTIAN)     s.cristian     += valor
      else if (vendedorZonaMap[vend] === zona.id) s.asesor += valor
      else                            s.otros        += valor

      const ciudad = String(r['Ciudad'] ?? '').trim()
      if (ciudad) s.ciudades.add(ciudad)
      if (cod)    s.dptosCubiertos.add(cod)
    })
    return stats
  }, [detalle, deptKey, valorKey, undKey, vendedorZonaMap])

  // Zonas ordenadas de mayor a menor venta
  const zonasOrdenadas = useMemo(() =>
    [...ZONAS_CONFIG].sort((a, b) => (zonaStats[b.id]?.valor ?? 0) - (zonaStats[a.id]?.valor ?? 0)),
    [zonaStats]
  )

  // ── Detalle filtrado ─────────────────────────────────────────────────
  const filteredDetalle = useMemo(() => {
    if (!selectedZonaId) return detalle
    return detalle.filter(r => {
      const cod = String(r[deptKey] ?? '').trim().padStart(2, '0')
      return DPTO_TO_ZONA[cod]?.id === selectedZonaId
    })
  }, [selectedZonaId, detalle, deptKey])

  const selectedZona = ZONAS_CONFIG.find(z => z.id === selectedZonaId)

  // ── Datos para el modal ──────────────────────────────────────────────
  const modalData = useMemo(() => {
    if (!modal) return null
    const z = ZONAS_CONFIG.find(z => z.id === modal.zonaId)
    if (!z) return null

    if (modal.tipo === 'cubiertas') {
      // Agrupar ventas por ciudad en esta zona
      const byCity: Record<string, { valor: number; unidades: number }> = {}
      detalle.forEach(r => {
        const cod = String(r[deptKey] ?? '').trim().padStart(2, '0')
        if (DPTO_TO_ZONA[cod]?.id !== z.id) return
        const ciudad = String(r['Ciudad'] ?? '').trim()
        if (!ciudad) return
        if (!byCity[ciudad]) byCity[ciudad] = { valor: 0, unidades: 0 }
        byCity[ciudad].valor    += parseNum(r[valorKey])
        byCity[ciudad].unidades += parseNum(r[undKey])
      })
      const cubiertas: CiudadCubierta[] = Object.entries(byCity)
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.valor - a.valor)
      return { z, cubiertas, faltantes: [] as CiudadFaltante[] }
    } else {
      // Ciudades con ventas (minúsculas para comparar)
      const conVentas = new Set<string>()
      detalle.forEach(r => {
        const cod = String(r[deptKey] ?? '').trim().padStart(2, '0')
        if (DPTO_TO_ZONA[cod]?.id !== z.id) return
        const ciudad = String(r['Ciudad'] ?? '').trim().toLowerCase()
        if (ciudad) conVentas.add(ciudad)
      })
      // Municipios de los departamentos de la zona que no tienen ventas
      const faltantes: CiudadFaltante[] = []
      z.deptos.forEach(d => {
        const munList = MUNICIPIOS_POR_DPTO[d.cod.padStart(2, '0')] ?? []
        munList.forEach(m => {
          if (!conVentas.has(m.nombre.toLowerCase())) {
            faltantes.push({ nombre: m.nombre, poblacion: m.poblacion, departamento: d.nombre })
          }
        })
      })
      faltantes.sort((a, b) => b.poblacion - a.poblacion)
      return { z, cubiertas: [] as CiudadCubierta[], faltantes }
    }
  }, [modal, detalle, deptKey, valorKey, undKey])

  const mapSubtitle = selectedZona
    ? `${selectedZona.zona} · ${selectedZona.vendedor}`
    : 'click en una zona para filtrar'

  const MapNode = (fillHeight: boolean) => (
    <ZonaMap
      detalle={detalle}
      deptKey={deptKey}
      valorKey={valorKey}
      undKey={undKey}
      selectedZonaId={selectedZonaId}
      onSelectZona={setSelectedZonaId}
      fillHeight={fillHeight}
      ciudadesTotal={ciudadesTotal}
    />
  )

  return (
    <>
      {/* ── Botón cerrar tabla (fixed, visible mientras scrolleas con tabla abierta) ── */}
      {tableExpanded && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <button
            onClick={() => setTableExpanded(false)}
            className="pointer-events-auto flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border)] bg-[var(--card)] shadow-xl text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-all"
          >
            ↑ Cerrar listado
          </button>
        </div>
      )}

      <div className="w-full lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,55%)] lg:gap-4 lg:items-start overflow-hidden">

        {/* ── Columna izquierda ── */}
        <div className="min-w-0 space-y-4">

          {/* Tarjetas ordenadas mayor → menor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {zonasOrdenadas.map((z, rank) => {
              const s            = zonaStats[z.id]
              const pct          = totalValor > 0 ? (s.valor / totalValor) * 100 : 0
              const totalMun     = totalMunicipios(z)
              const cubiertas    = s.ciudades.size
              const faltantes    = Math.max(0, totalMun - cubiertas)
              const coberturaPct = totalMun > 0 ? (cubiertas / totalMun) * 100 : 0
              const crecimiento  = cubiertas > 0 ? (faltantes / cubiertas) * 100 : 0

              // Tier basado en cobertura actual
              const tier = coberturaPct < 20
                ? { label: 'Tier 1', sub: 'Alta oportunidad', color: '#ef4444' }
                : coberturaPct < 50
                  ? { label: 'Tier 2', sub: 'Estratégica',      color: '#f59e0b' }
                  : { label: 'Tier 3', sub: 'Buena cobertura',  color: '#22c55e' }

              const isActive = selectedZonaId === z.id

              return (
                <div
                  key={z.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedZonaId(isActive ? null : z.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedZonaId(isActive ? null : z.id) }}
                  className={`text-left rounded-card border p-4 transition-all shadow-card hover:shadow-card-hover cursor-pointer ${
                    isActive ? 'ring-2' : 'bg-[var(--card)] border-[var(--border)]'
                  }`}
                  style={isActive
                    ? { borderColor: z.color, background: z.colorLight + '18', '--tw-ring-color': z.color } as React.CSSProperties
                    : {}}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                      style={{ background: z.color }}
                    >
                      {rank + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-[var(--text)] leading-tight">{z.zona}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{z.vendedor}</div>
                    </div>
                    {/* Tier badge */}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: tier.color + '20', color: tier.color }}
                      title={tier.sub}
                    >
                      {tier.label}
                    </span>
                  </div>

                  {/* Métricas fila 1 */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-0.5">Total territorio</div>
                      <div className="text-[13px] font-bold text-[#22c55e] leading-tight">{fmt(s.valor)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-0.5">Participación</div>
                      <div className="text-[13px] font-bold leading-tight" style={{ color: z.color }}>{pct.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* ── Desglose por origen ── */}
                  {s.valor > 0 && (() => {
                    const filas: { label: string; valor: number; color: string }[] = [
                      { label: z.vendedor,       valor: s.asesor,       color: z.color     },
                      { label: 'Ventas directas', valor: s.directas,    color: '#64748b'   },
                      { label: 'Consignación',    valor: s.consignacion, color: '#f59e0b'  },
                      { label: 'C. Montana',      valor: s.cristian,     color: '#8b5cf6'  },
                      { label: 'Otros',           valor: s.otros,        color: '#94a3b8'  },
                    ].filter(f => f.valor > 0)

                    const maxFila = Math.max(...filas.map(f => f.valor), 1)

                    return (
                      <div className="rounded-lg p-2.5 mb-2" style={{ background: 'var(--bg)' }}>
                        <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-2">
                          Origen de ventas
                        </div>
                        <div className="space-y-[6px]">
                          {filas.map(f => (
                            <div key={f.label}>
                              <div className="flex items-center justify-between mb-[3px]">
                                <span className="text-[10px] text-[var(--text-sub)] leading-none">{f.label}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold num text-[var(--text)]">{fmt(f.valor)}</span>
                                  <span className="text-[9px] text-[var(--text-muted)] w-[30px] text-right">
                                    {((f.valor / s.valor) * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                              <div className="h-[3px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${(f.valor / maxFila) * 100}%`, background: f.color }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Cobertura geográfica — colapsable */}
                  {(() => {
                    const isOpen = coberturaOpen.has(z.id)
                    return (
                      <div className="rounded-lg mb-2 overflow-hidden" style={{ background: z.color + '0d' }}>
                        {/* Header siempre visible */}
                        <button
                          onClick={e => toggleCobertura(z.id, e)}
                          className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-black/5 transition-colors"
                        >
                          <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                            Cobertura geográfica
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold" style={{ color: z.color }}>
                              {coberturaPct.toFixed(1)}%
                            </span>
                            <span
                              className="text-[10px] transition-transform duration-200"
                              style={{ color: z.color, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              ▸
                            </span>
                          </div>
                        </button>

                        {/* Contenido expandible */}
                        {isOpen && (
                          <div className="px-2.5 pb-2.5">
                            <div className="h-1.5 bg-[var(--bar-bg)] rounded-full overflow-hidden mb-2">
                              <div className="h-full rounded-full transition-all" style={{ width: `${coberturaPct}%`, background: z.color }} />
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center">
                              <button
                                onClick={e => { e.stopPropagation(); setModal({ zonaId: z.id, tipo: 'cubiertas' }) }}
                                className="rounded-md py-0.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                                title="Ver listado de ciudades cubiertas"
                              >
                                <div className="text-[11px] font-bold text-[var(--text)] underline decoration-dotted">{cubiertas}</div>
                                <div className="text-[8px] text-[var(--text-muted)]">cubiertas</div>
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setModal({ zonaId: z.id, tipo: 'faltantes' }) }}
                                className="rounded-md py-0.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                                title="Ver listado de ciudades faltantes"
                              >
                                <div className="text-[11px] font-bold text-[#ef4444] underline decoration-dotted">{faltantes}</div>
                                <div className="text-[8px] text-[var(--text-muted)]">faltantes</div>
                              </button>
                              <div>
                                <div className="text-[11px] font-bold text-[var(--text-sub)]">{totalMun}</div>
                                <div className="text-[8px] text-[var(--text-muted)]">objetivo</div>
                              </div>
                            </div>
                            {/* Índice de crecimiento — solo visible expandido */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                              <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Potencial crecimiento</span>
                              <span className="text-[11px] font-bold text-[#f59e0b]">
                                {crecimiento > 999 ? '+999' : crecimiento.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          {/* Mapa en móvil */}
          <div className="lg:hidden">
            <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_20px]">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[13.5px] font-bold text-[var(--text)]">Mapa de Zonas</span>
                <span className="text-[11px] text-[var(--text-muted)]">{mapSubtitle}</span>
              </div>
              {MapNode(false)}
            </div>
          </div>

          {/* Tabla de transacciones */}
          {detalleHeaders.length > 0 && (
            <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_20px]">

              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold text-[var(--text)]">Transacciones</span>
                <span className="text-[11px] text-[var(--text-muted)] flex-1">
                  {selectedZona
                    ? `${selectedZona.zona} · ${filteredDetalle.length} registros`
                    : `Todas las zonas · ${detalle.length} registros`}
                </span>
                {!tableExpanded && (
                  <button
                    onClick={() => setTableExpanded(true)}
                    className="flex-shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Ver más ↓
                  </button>
                )}
              </div>

              {/* Tabla expandida */}
              {tableExpanded && (
                <div className="mt-4">
                  {/* Filtro activo */}
                  {selectedZona && (
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: selectedZona.color + '20', color: selectedZona.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedZona.color }} />
                        {selectedZona.zona}
                      </span>
                      <button
                        onClick={() => setSelectedZonaId(null)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        Ver todas ✕
                      </button>
                    </div>
                  )}

                  {/* Tabla */}
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr>
                          {detalleHeaders.map(h => (
                            <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap ${NUM_PATTERN.test(h) ? 'text-right' : 'text-left'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetalle.map((r, i) => {
                          const cod  = String(r[deptKey] ?? '').trim().padStart(2, '0')
                          const zona = DPTO_TO_ZONA[cod]
                          return (
                            <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                              {detalleHeaders.map(h => {
                                const raw     = r[h] ?? ''
                                const isValor = /valor|bruto/i.test(h)
                                const isNum   = NUM_PATTERN.test(h)
                                const isZona  = /zona|region/i.test(h)
                                return (
                                  <td key={h} className={`px-[10px] py-[9px] ${isNum ? 'text-right num text-[11px]' : 'text-[var(--text-sub)]'}`}>
                                    {isValor
                                      ? <span className="text-[#22c55e]">{fmt(parseNum(raw))}</span>
                                      : isNum
                                        ? <span>{fmtN(parseNum(raw))}</span>
                                        : isZona && zona
                                          ? <span className="flex items-center gap-1">
                                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: zona.color }} />
                                              {raw}
                                            </span>
                                          : <span className="max-w-[150px] truncate block">{raw}</span>
                                    }
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Botón cerrar al final de la tabla */}
                  <button
                    onClick={() => setTableExpanded(false)}
                    className="mt-4 w-full text-[11px] font-semibold py-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    ↑ Cerrar listado
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Columna derecha: mapa sticky (solo desktop) ── */}
        <div
          className="hidden lg:flex flex-col lg:sticky lg:top-4 min-w-0"
          style={{ height: 'calc(100vh - 6rem)' }}
        >
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-shrink-0">
              <span className="text-[13.5px] font-bold text-[var(--text)]">Mapa de Zonas</span>
              <span className="text-[11px] text-[var(--text-muted)]">{mapSubtitle}</span>
            </div>
            <div className="flex-1 overflow-hidden px-4 pb-4">
              {MapNode(true)}
            </div>
          </div>
        </div>

      </div>

    {/* Modal ciudades */}
    {modal && modalData && (
      <CiudadesModal
        tipo={modal.tipo}
        zonaLabel={modalData.z.zona}
        zonaColor={modalData.z.color}
        ciudadesCubiertas={modalData.cubiertas}
        ciudadesFaltantes={modalData.faltantes}
        onClose={() => setModal(null)}
      />
    )}
    </>
  )
}
