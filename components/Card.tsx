'use client'

import { ReactNode } from 'react'

interface CardProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Card({ title, subtitle, action, children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-card border bg-[var(--card)] border-[var(--border)] p-[16px_20px] shadow-card ${className}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[13.5px] font-bold text-[var(--text)]">{title}</span>
        {subtitle && (
          <span className="text-[11px] text-[var(--text-muted)] flex-1">{subtitle}</span>
        )}
        {action && <div className="ml-auto flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}
