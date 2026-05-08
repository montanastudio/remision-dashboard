'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface DonutItem {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutItem[]
}

function fmt(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toLocaleString('es-CO')
}

export default function DonutChart({ data }: DonutChartProps) {
  if (!data || data.length === 0) {
    return <div className="h-[150px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
  }

  return (
    <div className="h-[150px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="40%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
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
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconSize={8}
            iconType="square"
            formatter={(value) => (
              <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
