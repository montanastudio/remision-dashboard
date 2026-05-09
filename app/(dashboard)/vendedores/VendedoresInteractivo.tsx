'use client'

import { useState, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { fmt, fmtN, pct } from '@/lib/format'

function parseNum(v: unknown): number {
  const s = String(v ?? '').trim()
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

type RankRow = {
  Vendedor: string
  'Valor ($)': number
  Unidades: number
  Porcentaje: number
  Margen: number
  _rank: string
}

type DetalleRow = {
  Vendedor: string
  Factura: string
  Fecha: string
  Referencia: string
  Grupo: string
  Producto: string
  Cantidad: string
  'Vr. Total': string
  Costo: string
}

type DonutItem = {
  name: string
  fullName: string
  value: number
  color: string
}

interface Props {
  donutData: DonutItem[]
  rankingData: RankRow[]
  detalleRows: DetalleRow[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: DonutItem }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-[var(--card)] border-[var(--border)] shadow-lg px-3 py-2 text-[12px]">
      <div className="font-semibold text-[var(--text)]">{d.fullName}</div>
      <div className="text-[var(--text-sub)] mt-0.5">{fmt(d.value)}</div>
    </div>
  )
}

export default function VendedoresInteractivo({ donutData, rankingData, detalleRows }: Props) {
  const [mounted, setMounted]   = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const detalleRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const toggle = (fullName: string) => {
    const next = selected === fullName ? null : fullName
    setSelected(next)
    if (next) {
      setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    }
  }

  // Filtrado del detalle
  const filteredDetalle = selected
    ? detalleRows.filter(r => r.Vendedor === selected)
    : detalleRows

  return (
    <>
      {/* ── Ranking + Donut ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Ranking */}
        <Card title="Ranking de Vendedores" subtitle={selected ? `Filtrado: ${selected}` : 'Toca un nombre o segmento para filtrar'}>
          <div className="table-scroll" style={{ maxHeight: 300 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['#', 'Vendedor', 'Unid.', 'Valor', '% Total', 'Margen'].map(h => (
                    <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${
                      ['Unid.', 'Valor', '% Total', 'Margen'].includes(h) ? 'text-right' : 'text-left'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingData.map((r, i) => {
                  const isActive = selected === r.Vendedor
                  const rank = Number(r._rank)
                  const margen = r.Margen as number
                  const margenColor = margen >= 0.30 ? '#22c55e' : margen >= 0.15 ? '#f59e0b' : '#ef4444'
                  return (
                    <tr
                      key={i}
                      onClick={() => toggle(r.Vendedor)}
                      className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                        isActive ? 'bg-[var(--bg-hover)] ring-1 ring-inset ring-[var(--border)]' : 'hover:bg-[var(--nav-hover)]'
                      }`}
                    >
                      <td className="px-[10px] py-[9px]">
                        <Badge variant={rank === 1 ? 'amber' : rank === 2 ? 'blue' : 'gray'}>{String(rank)}</Badge>
                      </td>
                      <td className="px-[10px] py-[9px]">
                        <span className={`font-medium ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-sub)]'}`}>{r.Vendedor}</span>
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                        {fmtN(r.Unidades)}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]">
                        <span className="text-[#22c55e]">{fmt(r['Valor ($)'])}</span>
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                        {pct(r.Porcentaje)}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]">
                        <span style={{ color: margenColor }} className="font-semibold">{pct(margen)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Donut */}
        <Card title="Participación por Vendedor" subtitle="Toca un segmento para filtrar el detalle">
          <div className="h-[300px]">
            {!mounted ? (
              <div className="h-full flex items-center justify-center text-[12px] text-[var(--text-muted)]">Cargando…</div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="46%"
                  innerRadius={58}
                  outerRadius={88}
                  dataKey="value"
                  paddingAngle={2}
                  onClick={(d) => { const item = d as DonutItem; item?.fullName && toggle(item.fullName) }}
                  cursor="pointer"
                >
                  {donutData.map((entry) => (
                    <Cell
                      key={entry.fullName}
                      fill={entry.color}
                      opacity={selected && selected !== entry.fullName ? 0.25 : 1}
                      stroke={selected === entry.fullName ? '#fff' : 'transparent'}
                      strokeWidth={selected === entry.fullName ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>

          {/* Leyenda manual */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 px-1">
            {donutData.map(d => {
              const isActive = selected === d.fullName
              return (
                <button
                  key={d.fullName}
                  onClick={() => toggle(d.fullName)}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${
                    isActive ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: d.color, opacity: selected && selected !== d.fullName ? 0.3 : 1 }}
                  />
                  <span className={`text-[10px] ${isActive ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-sub)]'}`}>
                    {d.name}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ── Detalle ── */}
      <div ref={detalleRef}>
        <Card
          title="Detalle por Vendedor y Referencia"
          subtitle={selected ? `${selected} · ${filteredDetalle.length} registros` : `Todos los vendedores · ${filteredDetalle.length} registros`}
        >
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <span className="text-[13px] leading-none">×</span> Quitar filtro
            </button>
          )}
          <div className="table-scroll" style={{ maxHeight: 360 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['Factura', 'Fecha', 'Vendedor', 'Referencia', 'Grupo', 'Producto', 'Cantidad', 'Vr. Total', 'Margen'].map(h => (
                    <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${
                      ['Cantidad', 'Vr. Total', 'Margen'].includes(h) ? 'text-right' : 'text-left'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDetalle.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                    <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r.Factura}</td>
                    <td className="px-[10px] py-[9px] text-[11px] text-[var(--text-muted)] whitespace-nowrap">{r.Fecha}</td>
                    <td className="px-[10px] py-[9px]">
                      <span className="font-medium text-[var(--text)]">{r.Vendedor}</span>
                    </td>
                    <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{r.Referencia}</td>
                    <td className="px-[10px] py-[9px] text-[var(--text-sub)]">{r.Grupo}</td>
                    <td className="px-[10px] py-[9px]">
                      <span className="block max-w-[180px] truncate text-[var(--text-sub)]">{r.Producto}</span>
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                      {fmtN(parseNum(r.Cantidad))}
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      <span className="text-[#22c55e]">{fmt(parseNum(r['Vr. Total']))}</span>
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      {(() => {
                        const vr    = parseNum(r['Vr. Total'])
                        const costo = parseNum(r.Costo)
                        if (!vr) return <span className="text-[var(--text-muted)]">—</span>
                        const m = (vr - costo) / vr
                        const color = m >= 0.30 ? '#22c55e' : m >= 0.15 ? '#f59e0b' : '#ef4444'
                        return <span style={{ color }} className="font-semibold">{pct(m)}</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
