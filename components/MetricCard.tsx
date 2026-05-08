'use client'

import { ReactNode } from 'react'

type Variant = 'default' | 'good' | 'warn' | 'alert'

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  sub2?: { text: string; color?: string }
  variant?: Variant
  icon?: ReactNode
  iconBg?: string
  delta?: { value: string; positive: boolean }
}

const borderMap: Record<Variant, string> = {
  default: '',
  good: 'border-l-4 border-l-[#22c55e]',
  warn: 'border-l-4 border-l-[#f59e0b]',
  alert: 'border-l-4 border-l-[#ef4444]',
}

export default function MetricCard({
  label,
  value,
  sub,
  sub2,
  variant = 'default',
  icon,
  delta,
}: MetricCardProps) {
  return (
    <div
      className={`
        rounded-card border p-[12px_14px] md:p-[16px_18px] bg-[var(--card)] border-[var(--border)]
        shadow-card hover:shadow-card-hover transition-shadow
        ${borderMap[variant]}
      `}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] md:text-[12px] font-medium text-[var(--text-sub)] leading-tight">
          {label}
        </span>
        {icon && (
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
      </div>
      <div
        className={`font-bold tracking-[-0.5px] leading-tight mb-1 ${
          String(value).length > 18
            ? 'text-[13px] md:text-[16px]'
            : String(value).length > 12
            ? 'text-[15px] md:text-[20px]'
            : 'text-[20px] md:text-[26px]'
        } ${
          variant === 'good'
            ? 'text-[#22c55e]'
            : variant === 'alert'
            ? 'text-[#ef4444]'
            : variant === 'warn'
            ? 'text-[#f59e0b]'
            : 'text-[var(--text)]'
        }`}
        style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}
      >
        {value}
      </div>
      {delta && (
        <div
          className={`text-[11px] font-semibold flex items-center gap-1 mb-1 ${
            delta.positive ? 'text-[#22c55e]' : 'text-[#ef4444]'
          }`}
        >
          <span>{delta.positive ? '▲' : '▼'}</span>
          {delta.value}
        </div>
      )}
      {sub && (
        <div className="text-[10px] md:text-[11px] text-[var(--text-muted)] leading-tight">{sub}</div>
      )}
      {sub2 && (
        <div
          className="text-[10px] md:text-[11px] font-semibold leading-tight mt-0.5"
          style={{ color: sub2.color ?? 'var(--text-muted)' }}
        >
          {sub2.text}
        </div>
      )}
    </div>
  )
}
