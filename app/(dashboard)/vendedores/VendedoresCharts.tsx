'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface VendedoresChartsProps {
  data: { name: string; value: number; color: string }[]
}

function fmt(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toLocaleString('es-CO')
}

export default function VendedoresCharts({ data }: VendedoresChartsProps) {
  if (!data.length) {
    return <div className="h-[260px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
  }

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={80}
            dataKey="value"
            paddingAngle={2}
            animationBegin={0}
            animationDuration={700}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => fmt(Number(value))}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--text)',
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            iconSize={8}
            iconType="square"
            formatter={(value) => (
              <span style={{ fontSize: 10, color: 'var(--text-sub)' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
