'use client'

import Link from 'next/link'

const TABS = [
  { key: 'resumen',  label: 'Resumen',              href: '/clientes' },
  { key: 'analisis', label: 'Análisis de Cliente',  href: '/clientes?tab=analisis' },
]

export default function TabsClientes({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex gap-1 mb-4 p-1 rounded-[10px] bg-[var(--bg)] border border-[var(--border)] w-fit">
      {TABS.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-4 py-1.5 rounded-[7px] text-[12px] font-medium transition-colors whitespace-nowrap ${
            activeTab === t.key
              ? 'bg-[var(--card)] text-[var(--text)] shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
