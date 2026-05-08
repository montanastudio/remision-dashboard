'use client'

interface BarItem {
  label: string
  sublabel?: string | { marca: string; codigo: string }
  value: string
  subvalue?: string
  pct: number
  color?: string
}

interface BarRowsProps {
  items: BarItem[]
}

function Sublabel({ sublabel }: { sublabel: BarItem['sublabel'] }) {
  if (!sublabel) return null
  if (typeof sublabel === 'string') {
    return <span className="text-[10px] text-[var(--text-muted)]">{sublabel}</span>
  }
  return (
    <span className="text-[10px] text-[var(--text-muted)]">
      {sublabel.marca && <span className="text-[var(--text-muted)]">{sublabel.marca}</span>}
      {sublabel.marca && sublabel.codigo && ' '}
      {sublabel.codigo && <span>({sublabel.codigo})</span>}
    </span>
  )
}

export default function BarRows({ items }: BarRowsProps) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          {/* Mobile: nombre completo arriba */}
          <div className="flex items-center justify-between mb-1 md:hidden">
            <div>
              <div className="text-[12px] font-semibold text-[var(--text-sub)]">{item.label}</div>
              {item.sublabel && <Sublabel sublabel={item.sublabel} />}
            </div>
            <div className="ml-2 flex-shrink-0 text-right">
              {item.subvalue && (
                <div className="text-[10px] text-[var(--text-muted)] leading-tight">{item.subvalue}</div>
              )}
              <div className="text-[11px] num text-[var(--text)] leading-tight">{item.value}</div>
            </div>
          </div>

          {/* Desktop: nombre con tooltip + barra + valor */}
          <div className="hidden md:flex items-center gap-2">
            <div className="relative group w-[130px] flex-shrink-0">
              <span className="block text-[12px] font-semibold text-[var(--text-sub)] truncate cursor-default leading-tight">
                {item.label}
              </span>
              {item.sublabel && (
                <div className="block truncate leading-tight">
                  <Sublabel sublabel={item.sublabel} />
                </div>
              )}
              {/* Tooltip */}
              <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-20 pointer-events-none">
                <div className="bg-[var(--card)] border border-[var(--border)] px-2.5 py-1.5 rounded-[6px] shadow-lg whitespace-nowrap">
                  <div className="text-[11px] text-[var(--text)]">{item.label}</div>
                  {item.sublabel && (
                    <div className="mt-0.5">
                      <Sublabel sublabel={item.sublabel} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 h-[5px] rounded-full overflow-hidden bg-[var(--bar-bg)]">
              <div
                className="h-full rounded-full bar-animated"
                style={
                  {
                    '--bar-width': `${item.pct}%`,
                    width: `${item.pct}%`,
                    background: item.color ?? 'var(--brand-blue)',
                  } as React.CSSProperties
                }
              />
            </div>
            <div className="w-[80px] flex-shrink-0 text-right">
              {item.subvalue && (
                <div className="text-[10px] text-[var(--text-muted)] leading-tight">{item.subvalue}</div>
              )}
              <div className="text-[11px] num text-[var(--text)] leading-tight">{item.value}</div>
            </div>
          </div>

          {/* Mobile: solo la barra */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex-1 h-[5px] rounded-full overflow-hidden bg-[var(--bar-bg)]">
              <div
                className="h-full rounded-full bar-animated"
                style={
                  {
                    '--bar-width': `${item.pct}%`,
                    width: `${item.pct}%`,
                    background: item.color ?? 'var(--brand-blue)',
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
