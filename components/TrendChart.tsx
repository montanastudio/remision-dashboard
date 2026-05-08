'use client'

import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface TrendPoint {
  mes: string
  actual: number | null
  anterior: number | null
  proyectado?: number | null
  actualUnd?: number | null
  anteriorUnd?: number | null
  proyectadoUnd?: number | null
}

interface TrendChartProps {
  data: TrendPoint[]
  añoActual: number
  añoAnterior: number
  metaPct?: number
  minimo?: number
}

function fmtM(n: number): string {
  if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + n.toLocaleString('es-CO')
}

function fmtU(n: number): string {
  if (n >= 1e6) return Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return n.toLocaleString('es-CO')
}

interface TipPayload { dataKey: string; name: string; value: number | null; color: string }
const CustomTooltip = ({
  active, payload, label, isUnits,
}: {
  active?: boolean; payload?: TipPayload[]; label?: string; isUnits?: boolean
}) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-[8px] border px-3 py-2 text-[11px] shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-sub)' }}>{p.name}:</span>
          <span className="font-medium">
            {p.value != null ? (isUnits ? fmtU(p.value) + ' und' : fmtM(p.value)) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function TrendChart({ data, añoActual, añoAnterior, metaPct, minimo }: TrendChartProps) {
  const [showProyectado, setShowProyectado] = useState(false)
  const [showMinimo, setShowMinimo] = useState(false)
  const [mode, setMode] = useState<'valor' | 'unidades'>('valor')

  const isUnits = mode === 'unidades'

  // Claves de datos según modo
  const keyActual    = isUnits ? 'actualUnd'    : 'actual'
  const keyAnterior  = isUnits ? 'anteriorUnd'  : 'anterior'
  const keyProyect   = isUnits ? 'proyectadoUnd': 'proyectado'

  const hasProyectado = metaPct != null && data.some(d =>
    isUnits ? d.proyectadoUnd != null : d.proyectado != null
  )

  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">
        Sin datos de tendencia
      </div>
    )
  }

  const pctLabel = metaPct != null ? `+${(metaPct * 100).toFixed(0)}%` : ''

  return (
    <div>
      {/* Controles: toggle modo + toggle meta */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        {/* Toggle $ / Und */}
        <div className="flex items-center rounded-full border border-[var(--border)] overflow-hidden text-[10px] font-semibold">
          <button
            onClick={() => setMode('valor')}
            className="px-3 py-1 transition-colors"
            style={{
              background: !isUnits ? 'var(--brand-blue)' : 'transparent',
              color: !isUnits ? '#fff' : 'var(--text-muted)',
            }}
          >
            $ Valor
          </button>
          <button
            onClick={() => setMode('unidades')}
            className="px-3 py-1 transition-colors"
            style={{
              background: isUnits ? 'var(--brand-blue)' : 'transparent',
              color: isUnits ? '#fff' : 'var(--text-muted)',
            }}
          >
            Unidades
          </button>
        </div>

        {/* Toggles lado derecho */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle meta proyectada */}
          {hasProyectado && (
            <button
              onClick={() => setShowProyectado(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors"
              style={{
                borderColor: showProyectado ? '#22c55e' : 'var(--border)',
                color: showProyectado ? '#22c55e' : 'var(--text-muted)',
                background: showProyectado ? 'rgba(34,197,94,0.08)' : 'transparent',
              }}
            >
              <span
                className="w-3 border-t-2 flex-shrink-0"
                style={{ borderColor: '#22c55e', borderStyle: 'dashed' }}
              />
              Meta {pctLabel}
            </button>
          )}

          {/* Toggle gastos fijos mínimos */}
          {!isUnits && minimo != null && (
            <button
              onClick={() => setShowMinimo(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors"
              style={{
                borderColor: showMinimo ? '#ef4444' : 'var(--border)',
                color: showMinimo ? '#ef4444' : 'var(--text-muted)',
                background: showMinimo ? 'rgba(239,68,68,0.08)' : 'transparent',
              }}
            >
              <span
                className="w-3 border-t-2 flex-shrink-0"
                style={{ borderColor: '#ef4444', borderStyle: 'dashed' }}
              />
              Gastos fijos {fmtM(minimo)}
            </button>
          )}
        </div>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1a3a8f" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1a3a8f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAnterior" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradProyectado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={isUnits ? fmtU : fmtM}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={75}
            />
            <Tooltip content={<CustomTooltip isUnits={isUnits} />} />
            <Legend
              iconType="circle"
              iconSize={7}
              formatter={(value) => (
                <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey={keyAnterior}
              name={String(añoAnterior)}
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 3"
              fill="url(#gradAnterior)"
              connectNulls
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey={keyActual}
              name={String(añoActual)}
              stroke="#1a3a8f"
              strokeWidth={2}
              fill="url(#gradActual)"
              connectNulls
              dot={false}
              activeDot={{ r: 4 }}
            />
            {hasProyectado && showProyectado && (
              <Area
                type="monotone"
                dataKey={keyProyect}
                name={`Meta ${añoActual}`}
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#gradProyectado)"
                connectNulls
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            {!isUnits && minimo != null && showMinimo && (
              <ReferenceLine
                y={minimo}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="6 3"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
