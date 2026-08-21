// Normalización de RAW_Cartera.
//
// La hoja cambió de nombres de columna en la reestructuración de 2026-07
// ('Saldo ($)' antes era 'Total Adeudado ($)', 'Días' era 'Días Vencido', etc.).
// Todo el código que consume cartera lee los nombres canónicos de la izquierda,
// así que la traducción vive aquí y no duplicada en cada página.

export type CarteraRow = Record<string, string>

// Del más severo al más sano — este orden manda en badges y agrupaciones.
export const BUCKETS_CANONICOS = [
  'Jurídico',
  'Prejurídico',
  'Mora',
  'Vencida',
  'Próximo a vencer',
  '1-30 días',
  'No vencida',
] as const

export type BucketCanonico = (typeof BUCKETS_CANONICOS)[number]

export const BUCKET_ORDER: Record<string, number> = {
  'Jurídico': 6,
  'Prejurídico': 5,
  'Mora': 4,
  'Vencida': 3,
  'Próximo a vencer': 2,
  '1-30 días': 1,
  'No vencida': 0,
}

const BUCKET_CANONICO: Record<string, BucketCanonico> = {
  // Sin vencer
  'Sin Vencer': 'No vencida', 'SIN VENCER': 'No vencida', 'Sin vencer': 'No vencida',
  'No Vencida': 'No vencida', 'No vencida': 'No vencida',
  // Vencimiento temprano
  '1-30 días': '1-30 días',
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

export function normalizeBucket(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  return BUCKET_CANONICO[v] ?? v
}

export function normalizeCarteraRow(r: CarteraRow): CarteraRow {
  return {
    ...r,
    Bucket:               normalizeBucket(r['Bucket']),
    'Días Vencido':       r['Días'] ?? r['Días Vencido'] ?? '',
    'Fecha Emisión':      r['Fecha Factura'] ?? r['Fecha Emisión'] ?? '',
    'Fecha Vencimiento':  r['Fecha Vence'] ?? r['Fecha Vencimiento'] ?? '',
    'Total Adeudado ($)': r['Saldo ($)'] ?? r['Total Adeudado ($)'] ?? '',
    'Vr. Factura ($)':    r['Total ($)'] ?? r['Vr. Factura ($)'] ?? '',
    'En Mora':            (r['Estado'] ?? '').toUpperCase().includes('MORA') ? 'SI' : (r['En Mora'] ?? 'NO'),
  }
}

export function normalizeCarteraRows(rows: CarteraRow[]): CarteraRow[] {
  return rows.map(normalizeCarteraRow)
}
