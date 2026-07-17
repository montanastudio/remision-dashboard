import { parseNum } from './sheets'
import { parseFecha } from './fecha'

export type SinRotarRow = Record<string, string>

// Cualquier código de Transacción que empiece con 'S' es una salida física de
// bodega (SA = venta, SC/SR/SD/... = otras salidas) — ver RAW_Movimientos.
function esSalida(transaccion: string): boolean {
  return transaccion.trim().toUpperCase().startsWith('S')
}

function parseModeloDeProducto(producto: string): string {
  const m = producto.toUpperCase().match(/REF\.?\s*[A-Z0-9][A-Z0-9-]*\s*(.*)$/)
  return (m ? m[1] : producto).trim()
}

/**
 * Reconstruye la clasificación de rotación (antes precalculada en la hoja
 * RAW_Sin_Rotar, que ya no existe) a partir del histórico de movimientos y el
 * stock actual. Umbrales: Medio 30-59d, Alto 60-89d, Crítico 90+d (o sin
 * ninguna salida registrada) desde la última salida física del producto.
 */
export function computeSinRotar(
  movimientos: Record<string, string>[],
  inventarioStock: Record<string, string>[],
): SinRotarRow[] {
  const ultimaSalidaPorCodigo = new Map<string, { fecha: Date; label: string }>()

  movimientos.forEach(m => {
    if (!esSalida(m['Transacción'] ?? '')) return
    const codigo = (m['Código'] ?? '').trim()
    if (!codigo) return
    const f = parseFecha(m['Fecha'])
    if (!f) return
    const fecha = new Date(f.year, f.mes, f.dia)
    const actual = ultimaSalidaPorCodigo.get(codigo)
    if (!actual || fecha > actual.fecha) {
      ultimaSalidaPorCodigo.set(codigo, { fecha, label: m['Fecha'] ?? '' })
    }
  })

  const hoy = new Date()
  const MS_DIA = 1000 * 60 * 60 * 24

  const rows: SinRotarRow[] = []
  inventarioStock.forEach(r => {
    const saldo = parseNum(r['Stock Total'])
    if (saldo <= 0) return

    const codigo = (r['Código'] ?? '').trim()
    const ultima = ultimaSalidaPorCodigo.get(codigo)
    const dias = ultima ? Math.floor((hoy.getTime() - ultima.fecha.getTime()) / MS_DIA) : Infinity

    let estado = ''
    if (dias >= 90) estado = 'CRITICO'
    else if (dias >= 60) estado = 'ALTO'
    else if (dias >= 30) estado = 'MEDIO'
    else return // en rotación normal — no es "sin rotar"

    rows.push({
      'Línea':              r['Línea'] ?? '',
      'Referencia':         r['Referencia'] ?? '',
      'Modelo':             parseModeloDeProducto(r['Producto'] ?? ''),
      'Saldo (und)':        String(saldo),
      'Vr. Existencia ($)': r['Valor a Precio Venta ($)'] ?? '0',
      'Última Salida':      ultima?.label ?? '',
      'Días Sin Rotar':     ultima ? String(dias) : '999+',
      'Estado':             estado,
    })
  })

  return rows
}
