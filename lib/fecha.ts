/**
 * Utilidades de fecha puras (sin dependencias de Node.js/googleapis).
 * Seguras para importar en componentes cliente y servidor.
 */

export type FechaParseada = { dia: number; mes: number; year: number }

/**
 * Parsea una fecha en formato DD/MM/YY o DD/MM/YYYY.
 * Retorna { dia, mes (0-indexed), year } o null si el formato es inválido.
 */
export function parseFecha(val: string | undefined): FechaParseada | null {
  if (!val) return null
  const parts = val.trim().split('/')
  if (parts.length !== 3) return null
  const dd = parseInt(parts[0], 10)
  const mm = parseInt(parts[1], 10)
  const yy = parseInt(parts[2], 10)
  if (isNaN(dd) || isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12) return null
  const year = yy < 100 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy
  return { dia: dd, mes: mm - 1, year }
}

const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/** Retorna el nombre corto del mes a partir de índice 0-based. */
export function mesLabel(mesIdx: number): string {
  return MESES_LABEL[mesIdx] ?? ''
}
