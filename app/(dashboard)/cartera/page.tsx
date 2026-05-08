import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { fmt } from '@/lib/format'
import MiniDonut from './MiniDonut'
import CarteraInteractivo from './CarteraInteractivo'

export const dynamic = 'force-dynamic'

const BUCKET_COLORS: Record<string, string> = {
  'No vencida': '#22c55e',
  '1-30 días': '#f59e0b',
  '31-60 días': '#f97316',
  '61-90 días': '#ea580c',
  '+90 días': '#ef4444',
}

export default async function CarteraPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'cartera', perms)) redirect('/resumen')

  type Row = Record<string, string>
  let carteraRes: Row[] = []
  let cartera: Row[] = []

  try { carteraRes = rowsToObjects(await getSheetData('LS_Cartera_Vendedor_Resumen')) } catch { /* hoja no existe */ }
  try { cartera    = rowsToObjects(await getSheetData('LS_Cartera_Vendedor'))         } catch { /* hoja no existe */ }

  const totalCartera   = carteraRes.reduce((s, b) => s + parseNum(b['Total Adeudado ($)']), 0)
  const clientesEnMora = new Set(cartera.filter((r) => r['En Mora'] === 'SI').map((r) => r['NIT'])).size
  const facturasEnMora = cartera.filter((r) => r['En Mora'] === 'SI').length

  // Excluir fila TOTAL para los gráficos
  const carteraResSinTotal = carteraRes.filter((b) => b['Bucket'] !== 'TOTAL' && b['Bucket'] !== 'Total')

  const maxB = Math.max(...carteraResSinTotal.map((b) => parseNum(b['Total Adeudado ($)'])), 1)
  const bucketBars = carteraResSinTotal.map((b) => ({
    label: b['Bucket'],
    value: fmt(parseNum(b['Total Adeudado ($)'])),
    raw: parseNum(b['Total Adeudado ($)']),
    pct: (parseNum(b['Total Adeudado ($)']) / maxB) * 100,
    color: BUCKET_COLORS[b['Bucket']] ?? '#94a3b8',
  }))

  const donutData = carteraResSinTotal.map((b) => ({
    name: b['Bucket'],
    value: parseNum(b['Total Adeudado ($)']),
    color: BUCKET_COLORS[b['Bucket']] ?? '#94a3b8',
  }))

  return (
    <div className="fade-in-up">
      {/* Tarjeta única: total + mini donut */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_18px] mb-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[var(--text-sub)] mb-1">Total Cartera</div>
          <div className="text-[28px] md:text-[32px] font-bold tracking-[-0.5px] text-[var(--text)] leading-tight break-words">
            {fmt(totalCartera)}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span><span className="font-semibold text-[var(--text-sub)]">{clientesEnMora.toLocaleString('es-CO')}</span> clientes en mora</span>
            <span className="text-[var(--border)]">·</span>
            <span><span className="font-semibold text-[var(--text-sub)]">{facturasEnMora.toLocaleString('es-CO')}</span> facturas vencidas</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {donutData.map((b) => (
              <span key={b.name} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                {b.name}
              </span>
            ))}
          </div>
        </div>
        <MiniDonut data={donutData} />
      </div>

      <CarteraInteractivo
        donutData={donutData}
        cartera={cartera}
        totalCartera={totalCartera}
        bucketBars={bucketBars}
      />
    </div>
  )
}
