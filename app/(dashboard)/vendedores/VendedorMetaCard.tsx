'use client'

import { fmt } from '@/lib/format'

interface VendedorMetaCardProps {
  nombre: string
  actual: number
  meta: number
  color?: string
}

function getColor(pct: number): string {
  if (pct >= 100) return '#22c55e'
  if (pct >= 70) return '#3b82f6'
  if (pct >= 40) return '#f59e0b'
  return '#ef4444'
}

export default function VendedorMetaCard({ nombre, actual, meta, color }: VendedorMetaCardProps) {
  const pct = meta > 0 ? Math.min((actual / meta) * 100, 120) : 0
  const arcColor = color ?? getColor(pct)

  // SVG semicircle gauge geometry
  const cx = 60
  const cy = 58
  const r = 44
  const circumference = 2 * Math.PI * r
  const halfCirc = Math.PI * r
  const progress = Math.min(pct / 100, 1) * halfCirc

  const displayPct = meta > 0 ? Math.round((actual / meta) * 100) : 0

  return (
    <div
      className="rounded-xl border p-3 flex flex-col items-center gap-1"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Gauge SVG */}
      <div className="relative w-full" style={{ maxWidth: 120 }}>
        <svg viewBox="0 0 120 68" className="w-full overflow-visible">
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={8}
            strokeDasharray={`${halfCirc} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(180, ${cx}, ${cy})`}
          />
          {/* Progress */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={8}
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(180, ${cx}, ${cy})`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
          {/* Center text */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontSize={18}
            fontWeight="700"
            fill={arcColor}
          >
            {displayPct}%
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fontSize={9}
            fill="var(--text-muted)"
          >
            {fmt(actual)}
          </text>
        </svg>
      </div>

      {/* Nombre */}
      <div className="text-center">
        <div className="text-[11px] font-semibold text-[var(--text)] leading-tight line-clamp-2">
          {nombre}
        </div>
        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
          Meta: {fmt(meta)}
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="w-full h-1 rounded-full overflow-hidden mt-1" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, background: arcColor }}
        />
      </div>
    </div>
  )
}
