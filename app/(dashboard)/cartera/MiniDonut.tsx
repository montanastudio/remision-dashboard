'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  data: { name: string; value: number; color: string }[]
}

function fmtM(n: number) {
  if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CO') + ' M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' K'
  return '$' + n.toLocaleString('es-CO')
}

interface TipEntry { name: string; value: number }
const Tip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: TipEntry }[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-[8px] border px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }}>
      <div className="font-semibold">{p.name}</div>
      <div>{fmtM(p.value)}</div>
    </div>
  )
}

export default function MiniDonut({ data }: Props) {
  return (
    <div className="w-[110px] h-[110px] flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={48}
            dataKey="value" paddingAngle={2} animationBegin={0} animationDuration={600}>
            {data.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
