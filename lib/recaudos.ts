export type Row = Record<string, string>

// No importar parseNum de './sheets': ese módulo carga googleapis (solo
// server) y este archivo también se usa desde componentes cliente
// (RecaudosInteractivo) — importar de ahí rompe el bundle del navegador.
export function parseN(v: string | undefined): number {
  if (!v) return 0
  let s = String(v).trim()
  const periodCount = (s.match(/\./g) ?? []).length
  if (periodCount > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

/**
 * Normaliza RAW_Recibos agregando FECHA (desde 'Fecha Pago') y MONTO (desde
 * 'Total Pagado ($)') para poder reutilizar filtrarVentas() — que siempre
 * lee FECHA — sobre este sheet igual que con RAW_Ventas.
 */
export function normalizeRecibos(rows: Row[]): Row[] {
  return rows.map(r => ({
    ...r,
    FECHA: r['Fecha Pago'] ?? '',
    MONTO: r['Total Pagado ($)'] ?? '',
  }))
}

/**
 * NIT → Vendedor a partir de RAW_Cartera (que sí trae vendedor por factura).
 * RAW_Recibos no tiene columna de vendedor propia. Toma el vendedor más
 * frecuente por NIT por si un cliente tuvo más de uno históricamente.
 */
export function buildNitVendedorMap(cartera: Row[]): Record<string, string> {
  const counts: Record<string, Record<string, number>> = {}
  cartera.forEach(r => {
    const nit = (r['NIT'] ?? '').trim()
    const vend = (r['Vendedor'] ?? '').trim()
    if (!nit || !vend) return
    if (!counts[nit]) counts[nit] = {}
    counts[nit][vend] = (counts[nit][vend] ?? 0) + 1
  })
  const map: Record<string, string> = {}
  Object.entries(counts).forEach(([nit, vendCounts]) => {
    map[nit] = Object.entries(vendCounts).sort((a, b) => b[1] - a[1])[0][0]
  })
  return map
}

export const RANGO_DIAS_CONFIG = [
  { key: 'Sin Vencer ($)',   label: 'Sin Vencer', color: '#22c55e' },
  { key: '1-30 días ($)',    label: '1-30d',       color: '#86efac' },
  { key: '31-60 días ($)',   label: '31-60d',      color: '#f59e0b' },
  { key: '61-90 días ($)',   label: '61-90d',      color: '#f97316' },
  { key: '+90 días ($)',     label: '+90d',        color: '#ef4444' },
] as const
