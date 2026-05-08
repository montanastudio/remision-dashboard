'use client'

type BadgeVariant = 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'brand'

const styles: Record<BadgeVariant, string> = {
  red: 'bg-[rgba(239,68,68,0.12)] text-[#ef4444]',
  green: 'bg-[rgba(34,197,94,0.12)] text-[#22c55e]',
  amber: 'bg-[rgba(245,158,11,0.12)] text-[#f59e0b]',
  blue: 'bg-[rgba(96,165,250,0.12)] text-[#60a5fa]',
  gray: 'bg-[var(--bar-bg)] text-[var(--text-sub)]',
  brand: 'bg-[rgba(26,58,143,0.15)] text-[#1a3a8f]',
}

export default function Badge({
  variant = 'gray',
  children,
}: {
  variant?: BadgeVariant
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[variant]}`}
    >
      {children}
    </span>
  )
}
