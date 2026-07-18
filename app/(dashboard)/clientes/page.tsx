import { getSheetData, rowsToObjects, normalizeVentasColumns, parseNum, parseFecha } from '@/lib/sheets'
import { filtrarVentas, filtroLabel } from '@/lib/filtro-ventas'
import { fmt } from '@/lib/format'
import MetricCard from '@/components/MetricCard'
import ClientesInteractivo from './ClientesInteractivo'
import AnalisisCliente from './AnalisisCliente'
import TabsClientes from './TabsClientes'

export const dynamic = 'force-dynamic'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }
  const periodoLabel = filtroLabel(filtroParams)
  const tab = sp('tab') ?? 'resumen'

  type Row = Record<string, string>
  let rawVentas: Row[] = []
  let recibos: Row[] = []
  let cartera: Row[] = []

  try {
    rawVentas = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas')))
  } catch {
    // empty
  }
  try { recibos = rowsToObjects(await getSheetData('RAW_Recibos')) } catch { /* hoja no existe */ }
  try { cartera = rowsToObjects(await getSheetData('RAW_Cartera')) } catch { /* hoja no existe */ }

  // ── Tab: Análisis de Cliente (perfil completo por cliente) ────────────
  if (tab === 'analisis') {
    return (
      <div className="fade-in-up">
        <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
          Base de clientes
        </div>
        <TabsClientes activeTab={tab} />
        <AnalisisCliente ventas={rawVentas} recibos={recibos} cartera={cartera} />
      </div>
    )
  }

  const ventas = filtrarVentas(rawVentas, filtroParams)

  // ── Fecha de referencia para actividad ────────────────────────────────
  const hoy        = new Date()
  const hace4Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 4, hoy.getDate())

  // ── Última compra por cliente (historial completo) ─────────────────────
  const ultimaCompraMap: Record<string, { fecha: Date; vendedor: string; nombre: string }> = {}
  rawVentas.forEach(r => {
    const id = r['IDCLIENTE']?.trim()
    if (!id) return
    const f = parseFecha(r['FECHA'])
    if (!f) return
    const fecha = new Date(f.year, f.mes, f.dia)
    const actual = ultimaCompraMap[id]
    if (!actual || fecha > actual.fecha) {
      ultimaCompraMap[id] = {
        fecha,
        vendedor: r['NVENDEDOR']?.trim() || '',
        nombre:   r['NCLIENTE']?.trim()  || id,
      }
    }
  })

  const totalClientesHistorico = Object.keys(ultimaCompraMap).length

  // ── Año en cuestión: se deriva del filtro activo ───────────────────────
  const añoEnCuestion: number = (() => {
    const f = filtroParams.filtro ?? 'actual'
    if ((f === 'año' || f === 'mes') && filtroParams.y)
      return parseInt(filtroParams.y, 10)
    if (f === 'rango' && filtroParams.desde)
      return new Date(filtroParams.desde + 'T00:00:00').getFullYear()
    return rawVentas.reduce((max, r) => {
      const fp = parseFecha(r['FECHA'])
      return fp && fp.year > max ? fp.year : max
    }, 0) || new Date().getFullYear()
  })()

  // ── Clientes por vendedor (año en cuestión, con detalle activo/inactivo) ─
  const ventasAño = rawVentas.filter(r => {
    const fp = parseFecha(r['FECHA'])
    return fp ? fp.year === añoEnCuestion : false
  })

  // Nombre más reciente por cliente en el año
  const nombreRecienteMap: Record<string, string> = {}
  ventasAño.forEach(r => {
    const id = r['IDCLIENTE']?.trim()
    if (id) nombreRecienteMap[id] = r['NCLIENTE']?.trim() || id
  })

  const vendedorClientesDetalleMap: Record<string, Map<string, boolean>> = {}
  ventasAño.forEach(r => {
    const vendedor = r['NVENDEDOR']?.trim() || 'Sin asignar'
    const cliente  = r['IDCLIENTE']?.trim()
    if (!cliente) return
    if (!vendedorClientesDetalleMap[vendedor]) vendedorClientesDetalleMap[vendedor] = new Map()
    if (!vendedorClientesDetalleMap[vendedor].has(cliente)) {
      const ultima = ultimaCompraMap[cliente]
      const activo = ultima ? ultima.fecha >= hace4Meses : false
      vendedorClientesDetalleMap[vendedor].set(cliente, activo)
    }
  })

  const fmtFecha = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  const clientesPorVendedor = Object.entries(vendedorClientesDetalleMap)
    .map(([vendedor, clientesMap]) => {
      const clientes = Array.from(clientesMap.entries()).map(([nit, activo]) => {
        const ultima = ultimaCompraMap[nit]
        return {
          nit,
          nombre:         nombreRecienteMap[nit] || ultima?.nombre || nit,
          activo,
          ultimaCompra:   ultima ? fmtFecha(ultima.fecha) : '—',
          diasSinComprar: ultima
            ? Math.floor((hoy.getTime() - ultima.fecha.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
        }
      }).sort((a, b) => {
        if (a.activo !== b.activo) return a.activo ? -1 : 1
        return a.nombre.localeCompare(b.nombre)
      })
      return {
        vendedor,
        total:     clientes.length,
        activos:   clientes.filter(c => c.activo).length,
        inactivos: clientes.filter(c => !c.activo).length,
        clientes,
      }
    })
    .sort((a, b) => b.total - a.total)

  // ── Clientes inactivos globales (para la card de alerta) ───────────────
  const clientesInactivos = Object.entries(ultimaCompraMap)
    .filter(([, d]) => d.fecha < hace4Meses)
    .map(([nit, d]) => ({
      nit,
      nombre:         d.nombre,
      vendedor:       d.vendedor,
      ultimaCompra:   fmtFecha(d.fecha),
      diasSinComprar: Math.floor((hoy.getTime() - d.fecha.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => b.diasSinComprar - a.diasSinComprar)

  // ── Agregar por cliente (todos los del período) ───────────────────────
  const cliMap: Record<string, {
    nombre: string; unidades: number; valor: number; ciudad: string
    vendVentas: Record<string, number>
  }> = {}
  ventas.forEach(r => {
    const id   = r['IDCLIENTE']?.trim() || r['NCLIENTE']?.trim()
    if (!id) return
    const vend = r['NVENDEDOR']?.trim() || ''
    const val  = parseNum(r['VRTOTAL'])
    if (!cliMap[id]) {
      cliMap[id] = {
        nombre:     r['NCLIENTE']?.trim() || id,
        unidades:   0,
        valor:      0,
        ciudad:     r['CIUDAD']?.trim() || '',
        vendVentas: {},
      }
    }
    cliMap[id].unidades += parseNum(r['CANTIDAD'])
    cliMap[id].valor    += val
    if (vend) cliMap[id].vendVentas[vend] = (cliMap[id].vendVentas[vend] || 0) + val
  })

  const clientes = Object.entries(cliMap)
    .map(([nit, d]) => ({
      nit,
      nombre:   d.nombre,
      unidades: d.unidades,
      valor:    d.valor,
      ciudad:   d.ciudad,
      // vendedor con mayor facturación al cliente en el período
      vendedor: Object.entries(d.vendVentas).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    }))
    .sort((a, b) => b.valor - a.valor)

  const totalVal   = clientes.reduce((s, c) => s + c.valor, 0)
  const topCliente = clientes[0]

  const todosClientes = clientes.map((c, i) => ({
    _rank:    String(i + 1),
    nit:      c.nit,
    nombre:   c.nombre,
    ciudad:   c.ciudad,
    unidades: c.unidades,
    valor:    c.valor,
    vendedor: c.vendedor,
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

      <TabsClientes activeTab={tab} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Base Total" value={`${totalClientesHistorico}`} sub="Clientes únicos históricos" />
        <MetricCard
          label="Mayor Cliente"
          value={topCliente ? topCliente.nombre.split(' ').slice(0, 3).join(' ') : '—'}
          sub={topCliente ? fmt(topCliente.valor) : ''}
          variant="good"
        />
        <MetricCard label="Total Facturado" value={fmt(totalVal)} sub={periodoLabel} />
        <MetricCard
          label="Sin actividad"
          value={`${clientesInactivos.length}`}
          sub="+4 meses sin comprar"
          variant={clientesInactivos.length > 0 ? 'alert' : 'good'}
        />
      </div>

      <ClientesInteractivo
        todosClientes={todosClientes}
        vendidosCliente={vendidosCliente}
        totalVal={totalVal}
        topValor={topCliente?.valor ?? 1}
        clientesPorVendedor={clientesPorVendedor}
        clientesInactivos={clientesInactivos}
        añoEnCuestion={añoEnCuestion}
      />
    </div>
  )
}
