'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface InventarioChartsProps {
  data: { name: string; entradas: number; salidas: number }[]
}

export default function InventarioCharts({ data }: InventarioChartsProps) {
  if (!data.length) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">
        Sin datos
      </div>
    )
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--text)',
            }}
          />
          <Legend
            iconSize={8}
            formatter={(value) => (
              <span style={{ fontSize: 10, color: 'var(--text-sub)' }}>{value}</span>
            )}
          />
          <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Bar dataKey="salidas" name="Salidas" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
