// Normalización de RAW_Cartera.
//
// La hoja cambió de nombres de columna en la reestructuración de 2026-07
// ('Saldo ($)' antes era 'Total Adeudado ($)', 'Días' era 'Días Vencido', etc.).
// Todo el código que consume cartera lee los nombres canónicos de la izquierda,
// así que la traducción vive aquí y no duplicada en cada página.

export type CarteraRow = Record<string, string>

// Del más severo al más sano — este orden manda en badges y agrupaciones.
//
// Desde 2026-08 el sheet clasifica por DÍAS DESDE LA FACTURA (no por días
// vencidos): 1-30 sin vencer, 31-45 próximo a vencer, 46-60 vencida,
// 61-75 mora, 76-90 prejurídico, 91+ jurídico. El bucket '1-30 días' del
// modelo anterior (que significaba 1-30 días YA vencida) desapareció.
export const BUCKETS_CANONICOS = [
  'Jurídico',
  'Prejurídico',
  'Mora',
  'Vencida',
  'Próximo a vencer',
  'No vencida',
] as const

export type BucketCanonico = (typeof BUCKETS_CANONICOS)[number]

export const BUCKET_ORDER: Record<string, number> = {
  'Jurídico': 6,
  'Prejurídico': 5,
  'Mora': 4,
  'Vencida': 3,
  'Próximo a vencer': 2,
  '1-30 días': 1,   // solo para datos viejos; el sheet ya no lo emite
  'No vencida': 0,
}

const BUCKET_CANONICO: Record<string, BucketCanonico> = {
  // Sin vencer
  'Sin Vencer': 'No vencida', 'SIN VENCER': 'No vencida', 'Sin vencer': 'No vencida',
  'No Vencida': 'No vencida', 'No vencida': 'No vencida',
  // Vencimiento temprano. '1-30 días' del modelo viejo (1-30 días YA
  // vencida) no se traduce: pasa tal cual y BUCKET_ORDER lo sigue ubicando,
  // para no reinterpretar datos históricos.
  '31-45 días': 'Próximo a vencer', '31-60 días': 'Próximo a vencer',
  'Próxima a Vencer': 'Próximo a vencer', 'Próximo a vencer': 'Próximo a vencer',
  // Vencida
  '46-60 días': 'Vencida', 'Vencida': 'Vencida',
  // Mora
  '61-75 días': 'Mora', '61-90 días': 'Mora', 'Mora': 'Mora',
  // Prejurídico
  '76-90 días': 'Prejurídico', 'Prejudicial': 'Prejurídico', 'Prejurídico': 'Prejurídico',
  // Jurídico
  '91+ días': 'Jurídico', '+90 días': 'Jurídico', 'Jurídica': 'Jurídico', 'Jurídico': 'Jurídico',
}

/**
 * Buckets que ya pasaron el plazo de pago. Con el modelo por días desde
 * factura, el plazo son 45 días: de ahí en adelante la factura está vencida.
 *
 * Se deriva del bucket y NO de la columna `Estado`, que es una clasificación
 * manual del ERP: hay 33 facturas donde ambas se contradicen (unas dicen
 * "SIN VENCER" estando en Jurídica y viceversa).
 */
export const BUCKETS_VENCIDOS: readonly string[] = ['Vencida', 'Mora', 'Prejurídico', 'Jurídico']

/** ¿La factura ya pasó su plazo de pago? */
export function esVencida(bucket: string | undefined): boolean {
  return BUCKETS_VENCIDOS.includes((bucket ?? '').trim())
}

export function normalizeBucket(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  return BUCKET_CANONICO[v] ?? v
}

export function normalizeCarteraRow(r: CarteraRow): CarteraRow {
  return {
    ...r,
    Bucket:               normalizeBucket(r['Bucket']),
    // El sheet partió 'Días' en dos columnas. La que manda el bucket es
    // 'Días Desde Factura'; 'Días Vencido (Sistema)' cuenta desde el
    // vencimiento y se conserva por si se necesita la mora real.
    'Días Desde Factura': r['Días Desde Factura'] ?? r['Días'] ?? '',
    'Días Vencido':       r['Días Vencido (Sistema)'] ?? r['Días Vencido'] ?? '',
    // Marca del script cuando la factura tiene datos sospechosos
    // (p. ej. fecha de vencimiento igual a la de emisión).
    Alerta:               r['Alerta'] ?? '',
    'Fecha Emisión':      r['Fecha Factura'] ?? r['Fecha Emisión'] ?? '',
    'Fecha Vencimiento':  r['Fecha Vence'] ?? r['Fecha Vencimiento'] ?? '',
    'Total Adeudado ($)': r['Saldo ($)'] ?? r['Total Adeudado ($)'] ?? '',
    'Vr. Factura ($)':    r['Total ($)'] ?? r['Vr. Factura ($)'] ?? '',
    // Derivado del bucket, no de la columna Estado del ERP. Se conserva para
    // exportaciones y consumidores externos; la UI usa esVencida() directo.
    'En Mora':            esVencida(normalizeBucket(r['Bucket'])) ? 'SI' : 'NO',
  }
}

export function normalizeCarteraRows(rows: CarteraRow[]): CarteraRow[] {
  return rows.map(normalizeCarteraRow)
}
