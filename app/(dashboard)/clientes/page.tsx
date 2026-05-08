import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { filtrarVentas, filtroLabel } from '@/lib/filtro-ventas'
import { fmt } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import ClientesInteractivo from './ClientesInteractivo'

export const dynamic = 'force-dynamic'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }
  const periodoLabel = filtroLabel(filtroParams)

  type Row = Record<string, string>
  let rawVentas: Row[] = []

  try {
    const raw = await getSheetData('LS_VENTAS')
    rawVentas = rowsToObjects(raw)
  } catch {
    // empty
  }

  const ventas = filtrarVentas(rawVentas, filtroParams)

  // Agregar por cliente
  const cliMap: Record<string, { nombre: string; unidades: number; valor: number; ciudad: string }> = {}
  ventas.forEach(r => {
    const id = r['IDCLIENTE']?.trim() || r['NCLIENTE']?.trim()
    if (!id) return
    if (!cliMap[id]) {
      cliMap[id] = {
        nombre:   r['NCLIENTE']?.trim() || id,
        unidades: 0,
        valor:    0,
        ciudad:   r['CIUDAD']?.trim() || '',
      }
    }
    cliMap[id].unidades += parseNum(r['CANTIDAD'])
    cliMap[id].valor    += parseNum(r['VRTOTAL'])
  })

  const clientes = Object.entries(cliMap)
    .map(([nit, d]) => ({ nit, ...d }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 20)

  const totalVal   = clientes.reduce((s, c) => s + c.valor, 0)
  const topCliente = clientes[0]
  const ticket     = clientes.length ? totalVal / clientes.length : 0

  const top20 = clientes.map((c, i) => ({
    _rank:    String(i + 1),
    nit:      c.nit,
    nombre:   c.nombre,
    ciudad:   c.ciudad,
    unidades: c.unidades,
    valor:    c.valor,
  }))

  // Construir vendidosCliente con la forma que espera ClientesInteractivo
  // Mapear nuevos nombres de columna a los que usa el componente
  const vendidosCliente: Row[] = ventas.map(r => ({
    'NIT':           r['IDCLIENTE']  ?? '',
    'Cliente':       r['NCLIENTE']   ?? '',
    'Factura':       r['FACTURA']    ?? '',
    'Fecha':         r['FECHA']      ?? '',
    'Referencia':    r['REFERENCIA'] ?? '',
    'Marca':         r['NGRUPO']     ?? '',
    'Modelo':        r['PRODUCTO']   ?? '',
    'Cantidad':      r['CANTIDAD']   ?? '',
    'Vr. Bruto ($)': r['VRTOTAL']    ?? '',
  }))

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Base de clientes
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Clientes Activos" value={`${clientes.length}+`} sub="Con compras en el período" />
        <MetricCard
          label="Mayor Cliente"
          value={topCliente ? topCliente.nombre.split(' ').slice(0, 3).join(' ') : '—'}
          sub={topCliente ? fmt(topCliente.valor) : ''}
          variant="good"
        />
        <MetricCard label="Total Facturado" value={fmt(totalVal)} sub={periodoLabel} />
        <MetricCard label="Ticket Promedio" value={fmt(ticket)} sub="Por cliente (top 20)" />
      </div>

      <ClientesInteractivo
        top20={top20}
        vendidosCliente={vendidosCliente}
        totalVal={totalVal}
        topValor={topCliente?.valor ?? 1}
      />
    </div>
  )
}
