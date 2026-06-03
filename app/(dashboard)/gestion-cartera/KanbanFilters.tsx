'use client'

export interface Filters {
  search:    string
  bucket:    string
  montoMin:  string
  montoMax:  string
  vendedor:  string
}

export const FILTERS_EMPTY: Filters = {
  search: '', bucket: '', montoMin: '', montoMax: '', vendedor: '',
}

const BUCKETS = [
  { value: 'No vencida',       label: 'No vencida' },
  { value: '1-30 días',        label: '1-30d' },
  { value: 'Próximo a vencer', label: '31-45d' },
  { value: 'Vencida',          label: '46-60d' },
  { value: 'Mora',             label: '61-75d' },
  { value: 'Prejurídico',      label: '76-90d' },
  { value: 'Jurídico',         label: '91+d' },
]

function parseMonto(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(/,/g, '').replace(/[^0-9]/g, '')) || 0
}

interface Props {
  filters:          Filters
  onChange:         (f: Filters) => void
  vendedores:       string[]
  totalClientes:    number
  filteredCount:    number
}

export default function KanbanFilters({ filters, onChange, vendedores, totalClientes, filteredCount }: Props) {

  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value })

  const activeCount = [
    filters.search, filters.bucket, filters.montoMin, filters.montoMax, filters.vendedor,
  ].filter(Boolean).length

  const inputCls = `text-[12px] px-2.5 py-[7px] rounded-[7px] border bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 transition-all`
  const selectCls = `text-[12px] px-2.5 py-[7px] rounded-[7px] border bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-1 transition-all cursor-pointer`
  const ringStyle = { borderColor: 'var(--border)', '--tw-ring-color': 'var(--brand-blue)' } as React.CSSProperties

  return (
    <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card px-4 py-3 mb-4">
      <div className="flex flex-wrap gap-2 items-center">

        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] pointer-events-none"
            style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Buscar cliente o NIT…"
            className={`${inputCls} w-full pl-8 pr-7`}
            style={ringStyle}
          />
          {filters.search && (
            <button onClick={() => set('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] leading-none transition-colors"
              style={{ color: 'var(--text-muted)' }}>✕</button>
          )}
        </div>

        {/* Días de mora */}
        <select
          value={filters.bucket}
          onChange={e => set('bucket', e.target.value)}
          className={selectCls}
          style={ringStyle}
        >
          <option value="">Todos los rangos</option>
          {BUCKETS.map(b => (
            <option key={b.value} value={b.value}>{b.label} — {b.value}</option>
          ))}
        </select>

        {/* Monto */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={filters.montoMin}
            onChange={e => set('montoMin', e.target.value)}
            placeholder="Min"
            className={`${inputCls} w-[88px]`}
            style={ringStyle}
          />
          <span className="text-[11px] text-[var(--text-muted)]">–</span>
          <input
            type="text"
            inputMode="numeric"
            value={filters.montoMax}
            onChange={e => set('montoMax', e.target.value)}
            placeholder="Max"
            className={`${inputCls} w-[88px]`}
            style={ringStyle}
          />
        </div>

        {/* Vendedor */}
        {vendedores.length > 0 && (
          <select
            value={filters.vendedor}
            onChange={e => set('vendedor', e.target.value)}
            className={`${selectCls} max-w-[180px]`}
            style={ringStyle}
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        {/* Resultados + limpiar */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <span className="text-[11px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-sub)]">{filteredCount}</span>
            {filteredCount !== totalClientes && (
              <> de {totalClientes}</>
            )} clientes
          </span>
          {activeCount > 0 && (
            <button
              onClick={() => onChange(FILTERS_EMPTY)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--bar-bg)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
            >
              <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                style={{ background: 'var(--brand-blue)' }}>{activeCount}</span>
              Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function applyFilters(clientes: import('./KanbanBoard').Cliente[], filters: Filters): import('./KanbanBoard').Cliente[] {
  const { search, bucket, montoMin, montoMax, vendedor } = filters
  const q    = search.trim().toLowerCase()
  const min  = montoMin ? parseMonto(montoMin) : null
  const max  = montoMax ? parseMonto(montoMax) : null

  return clientes.filter(c => {
    if (q && !c.nombre.toLowerCase().includes(q) && !c.nit.includes(q)) return false
    if (bucket && c.bucket !== bucket) return false
    if (min !== null && c.saldo < min) return false
    if (max !== null && c.saldo > max) return false
    if (vendedor && !c.vendedores.includes(vendedor)) return false
    return true
  })
}
