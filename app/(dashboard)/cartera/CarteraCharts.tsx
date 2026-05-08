'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface CarteraChartsProps {
  data: { name: string; value: number; color: string }[]
}

function fmt(n: number): string {
  if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + n.toLocaleString('es-CO')
}

export default function CarteraCharts({ data }: CarteraChartsProps) {
  if (!data.length) {
    return <div className="h-[160px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">Sin datos</div>
  }

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={70}
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
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
