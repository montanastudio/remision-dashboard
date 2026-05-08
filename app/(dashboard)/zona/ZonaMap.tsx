'use client'

import { useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

import { fmt, fmtN } from '@/lib/format'
import { ZONAS_CONFIG, DPTO_TO_ZONA } from '@/lib/zonas-config'

const GEO_URL = '/colombia-depts.json'

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

interface ZonaStat {
  valor: number
  cantidad: number
  ciudades: Set<string>
}

interface Props {
  detalle: Row[]
  deptKey: string
  valorKey: string
  undKey: string
  selectedZonaId: string | null
  onSelectZona: (id: string | null) => void
  fillHeight?: boolean
  ciudadesTotal?: number
}

export default function ZonaMap({ detalle, deptKey, valorKey, undKey, selectedZonaId, onSelectZona, fillHeight = false, ciudadesTotal }: Props) {
  // tooltip ligero que sigue el mouse
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; zonaId: string } | null>(null)
  const [zoom, setZoom] = useState(1)

  // Stats por zona
  const zonaStats: Record<string, ZonaStat> = {}
  ZONAS_CONFIG.forEach(z => {
    zonaStats[z.id] = { valor: 0, cantidad: 0, ciudades: new Set() }
  })
  detalle.forEach(r => {
    const cod  = String(r[deptKey] ?? '').trim().padStart(2, '0')
    const zona = DPTO_TO_ZONA[cod]
    if (!zona) return
    zonaStats[zona.id].valor    += parseNum(r[valorKey])
    zonaStats[zona.id].cantidad += parseNum(r[undKey] ?? r['Cantidad'] ?? '')
    const ciudad = String(r['Ciudad'] ?? '').trim()
    if (ciudad) zonaStats[zona.id].ciudades.add(ciudad)
  })

  const getFill = (cod: string, isSelected: boolean) => {
    const zona = DPTO_TO_ZONA[cod]
    if (!zona) return 'var(--bar-bg)'
    if (isSelected) return zona.color
    if (selectedZonaId && selectedZonaId !== zona.id) return zona.colorLight + '60'
    return zona.colorLight
  }

  // Para el tooltip hover
  const hoveredZona   = hoverTooltip ? ZONAS_CONFIG.find(z => z.id === hoverTooltip.zonaId) ?? null : null

  // Para el panel fijo (click)
  const pinnedZona    = selectedZonaId ? ZONAS_CONFIG.find(z => z.id === selectedZonaId) ?? null : null
  const pinnedStats   = pinnedZona ? zonaStats[pinnedZona.id] : null

  return (
    <div className="relative w-full">

      {/* Mapa + panel fijo */}
      <div
        className="relative w-full"
        style={fillHeight ? { height: '100%' } : { aspectRatio: '0.72' }}
      >

        {/* Botones de zoom */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
          <button
            onClick={() => setZoom(z => Math.min(z + 0.5, 8))}
            className="w-7 h-7 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text)] text-[16px] font-bold leading-none flex items-center justify-center shadow hover:bg-[var(--bg-hover)] transition-colors"
          >+</button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.5, 1))}
            disabled={zoom <= 1}
            className="w-7 h-7 rounded-md border border-[var(--border)] bg-[var(--card)] text-[16px] font-bold leading-none flex items-center justify-center shadow transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)] text-[var(--text)]"
          >−</button>
        </div>

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-74, 4], scale: 2400 }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup
            center={[-74, 4]}
            zoom={zoom}
            minZoom={1}
            maxZoom={8}
            disablePanning
            onMoveEnd={({ zoom: z }: { zoom: number }) => setZoom(Math.max(1, z))}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const cod        = String(geo.properties.DPTO ?? '').padStart(2, '0')
                  const zona       = DPTO_TO_ZONA[cod]
                  const isSelected = !!zona && selectedZonaId === zona.id
                  const hasData    = !!zona

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getFill(cod, isSelected)}
                      stroke="white"
                      strokeWidth={isSelected ? 1 : 0.4}
                      style={{
                        default: { outline: 'none', cursor: hasData ? 'pointer' : 'default' },
                        hover:   { outline: 'none', fill: zona ? zona.color : 'var(--bar-bg)', opacity: 0.9 },
                        pressed: { outline: 'none' },
                      }}
                      onClick={() => {
                        if (!zona) return
                        onSelectZona(selectedZonaId === zona.id ? null : zona.id)
                      }}
                      onMouseEnter={(e) => {
                        if (zona) setHoverTooltip({ x: e.clientX, y: e.clientY, zonaId: zona.id })
                      }}
                      onMouseMove={(e) => {
                        setHoverTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                      }}
                      onMouseLeave={() => setHoverTooltip(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Badge ciudades atendidas (esquina superior derecha) */}
        {ciudadesTotal !== undefined && ciudadesTotal > 0 && (
          <div className="absolute top-3 right-3 z-20 rounded-xl border bg-[var(--card)]/90 border-[var(--border)] shadow-md px-3 py-2 backdrop-blur-sm text-center pointer-events-none">
            <div className="text-[20px] font-bold text-[var(--text)] leading-tight">{ciudadesTotal}</div>
            <div className="text-[9px] uppercase tracking-[0.07em] text-[var(--text-muted)] mt-0.5">ciudades<br/>atendidas</div>
          </div>
        )}

        {/* ── Panel fijo al hacer click (dentro del mapa, esquina superior derecha) ── */}
        {pinnedZona && pinnedStats && (
          <div
            className="absolute top-3 right-3 z-20 rounded-xl border shadow-xl px-4 py-3 min-w-[190px] backdrop-blur-sm"
            style={{
              background: pinnedZona.colorLight + 'ee',
              borderColor: pinnedZona.color + '60',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pinnedZona.color }} />
                  <span className="font-bold text-[13px]" style={{ color: pinnedZona.color }}>
                    {pinnedZona.zona}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] pl-4 mt-0.5">{pinnedZona.vendedor}</div>
              </div>
              <button
                onClick={() => onSelectZona(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-[14px] leading-none mt-0.5 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Divisor */}
            <div className="my-2 border-t" style={{ borderColor: pinnedZona.color + '30' }} />

            {/* Stats */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center gap-4">
                <span className="text-[11px] text-[var(--text-muted)]">Ventas</span>
                <span className="text-[12px] font-bold text-[#16a34a]">{fmt(pinnedStats.valor)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[11px] text-[var(--text-muted)]">Unidades</span>
                <span className="text-[12px] font-semibold text-[var(--text)]">{fmtN(pinnedStats.cantidad)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[11px] text-[var(--text-muted)]">Ciudades</span>
                <span className="text-[12px] font-semibold text-[var(--text)]">{pinnedStats.ciudades.size}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tooltip ligero que sigue el mouse (hover) ── */}
      {hoverTooltip && hoveredZona && !selectedZonaId && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border bg-[var(--card)] border-[var(--border)] shadow-md px-2.5 py-1.5 text-[11px]"
          style={{ left: hoverTooltip.x + 12, top: hoverTooltip.y - 8 }}
        >
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <span className="w-2 h-2 rounded-full" style={{ background: hoveredZona.color }} />
            {hoveredZona.zona}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Click para ver detalle</div>
        </div>
      )}
    </div>
  )
}
