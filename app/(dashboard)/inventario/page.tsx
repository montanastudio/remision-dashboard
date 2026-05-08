import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { fmt } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import Card from '@/components/Card'
import BarRows from '@/components/BarRows'
import InventarioSinRotar from './InventarioSinRotar'

export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'inventario', perms)) redirect('/resumen')

  type Row = Record<string, string>
  let inventario: Row[] = []
  let sinRotar: Row[] = []

  try {
    const [inv, sr] = await Promise.all([
      getSheetData('LS_Inventario'),
      getSheetData('LS_Sin_Rotar'),
    ])
    inventario = rowsToObjects(inv)
    sinRotar = rowsToObjects(sr)
  } catch {
    // empty
  }

  const totalValor = inventario.reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)

  const valCritico  = sinRotar.filter(r => r['Estado'] === 'CRITICO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valAlto     = sinRotar.filter(r => r['Estado'] === 'ALTO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valMedio    = sinRotar.filter(r => r['Estado'] === 'MEDIO').reduce((s, r) => s + parseNum(r['Vr. Existencia ($)']), 0)
  const valSinRotar = valCritico + valAlto + valMedio
  const valRotacion = totalValor - valCritico - valAlto - valMedio

  const segments = [
    { name: 'CRÍTICO',      value: valCritico,  color: '#ef4444' },
    { name: 'ALTO',         value: valAlto,     color: '#f59e0b' },
    { name: 'MEDIO',        value: valMedio,    color: '#3b82f6' },
    { name: 'En rotación',  value: Math.max(valRotacion, 0), color: '#22c55e' },
  ].filter(s => s.value > 0)

  const sinRotarSorted = [...sinRotar].sort(
    (a, b) => parseNum(b['Días Sin Rotar']) - parseNum(a['Días Sin Rotar'])
  )

  const lineaMap: Record<string, number> = {}
  inventario.forEach((r) => {
    const linea = r['Línea'] || 'Sin línea'
    lineaMap[linea] = (lineaMap[linea] ?? 0) + parseNum(r['Vr. Existencia ($)'])
  })
  const lineas = Object.entries(lineaMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxLinea = lineas[0]?.[1] ?? 1
  const barLineas = lineas.map(([linea, val]) => ({
    label: linea,
    value: fmt(val),
    pct: (val / maxLinea) * 100,
    color: 'var(--brand-blue)',
  }))

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Control de inventario
      </div>

      {/* Ficha única: valor total */}
      <div className="mb-4">
        <MetricCard
          label="Valor Total de Inventario Sin Rotar"
          value={fmt(valSinRotar)}
          sub={`${sinRotar.length} SKUs sin rotar`}
        />
      </div>

      {/* Donut + tabla interactiva de sin rotar */}
      <Card title="Productos Sin Rotar" subtitle="selecciona un segmento para ver el detalle" className="mb-4">
        <InventarioSinRotar segments={segments} sinRotar={sinRotarSorted} />
      </Card>

      {/* Inventario por línea */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Inventario por Línea" subtitle="valor en existencia">
          <BarRows items={barLineas} />
        </Card>
      </div>
    </div>
  )
}
