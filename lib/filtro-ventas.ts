import { parseFecha } from './fecha'

export type FiltroTipo = 'actual' | 'ultimodia' | 'mes' | 'año' | 'rango' | 'todo'

export type FiltroParams = {
  filtro?: string  // FiltroTipo
  m?: string       // mes 1-12
  y?: string       // año
  desde?: string   // YYYY-MM-DD
  hasta?: string   // YYYY-MM-DD
}

const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/** Parsea 'YYYY-MM-DD' (el formato que usa fechaInfoISO). */
function parseFechaISO(v: string): { dia: number; mes: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  return { year: +m[1], mes: +m[2] - 1, dia: +m[3] }
}

/**
 * Día más reciente con al menos un registro. Se resuelve sobre el propio
 * conjunto, así que en Recaudos apunta al último día con pagos y en Ventas
 * al último día con facturación — que no tienen por qué coincidir.
 */
export function ultimoDiaConMovimiento(
  rows: Record<string, string>[]
): { dia: number; mes: number; year: number } | null {
  let maxTs = 0
  let out: { dia: number; mes: number; year: number } | null = null
  for (const r of rows) {
    const f = parseFecha(r['FECHA'])
    if (!f) continue
    const ts = f.year * 10000 + (f.mes + 1) * 100 + f.dia
    if (ts > maxTs) { maxTs = ts; out = f }
  }
  return out
}

/**
 * Filtra filas de LS_VENTAS según los parámetros de período.
 * "actual" → mes más reciente presente en los datos.
 */
export function filtrarVentas(
  rows: Record<string, string>[],
  params: FiltroParams
): Record<string, string>[] {
  const { filtro = 'actual', m, y, desde, hasta } = params

  if (filtro === 'todo') return rows

  // Último día CON MOVIMIENTO del propio conjunto, no el día calendario
  // anterior: los sheets llegan con rezago y en días salteados, así que
  // "ayer" saldría vacío casi siempre.
  if (filtro === 'ultimodia') {
    const ultimo = ultimoDiaConMovimiento(rows)
    if (!ultimo) return rows
    return rows.filter(r => {
      const f = parseFecha(r['FECHA'])
      return f ? f.year === ultimo.year && f.mes === ultimo.mes && f.dia === ultimo.dia : false
    })
  }

  if (filtro === 'año' && y) {
    const year = parseInt(y, 10)
    return rows.filter(r => {
      const f = parseFecha(r['FECHA'])
      return f ? f.year === year : false
    })
  }

  if (filtro === 'mes' && m && y) {
    const mes  = parseInt(m, 10) - 1  // 0-indexed
    const year = parseInt(y, 10)
    return rows.filter(r => {
      const f = parseFecha(r['FECHA'])
      return f ? f.mes === mes && f.year === year : false
    })
  }

  if (filtro === 'rango' && desde && hasta) {
    const desdeTs = new Date(desde + 'T00:00:00').getTime()
    const hastaTs = new Date(hasta + 'T23:59:59').getTime()
    return rows.filter(r => {
      const f = parseFecha(r['FECHA'])
      if (!f) return false
      const ts = new Date(f.year, f.mes, f.dia).getTime()
      return ts >= desdeTs && ts <= hastaTs
    })
  }

  // "actual" → mes más reciente en los datos
  let maxYear = 0, maxMes = -1
  rows.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (!f) return
    if (f.year > maxYear || (f.year === maxYear && f.mes > maxMes)) {
      maxYear = f.year
      maxMes  = f.mes
    }
  })
  if (maxYear === 0) return rows  // sin fechas válidas

  return rows.filter(r => {
    const f = parseFecha(r['FECHA'])
    return f ? f.year === maxYear && f.mes === maxMes : false
  })
}

/**
 * Texto de descripción del filtro activo (para mostrar en la UI).
 * `fechaRef` (DD/MM/YYYY o YYYY-MM-DD) permite que "último día" muestre la
 * fecha concreta que quedó seleccionada; sin ella cae a un texto genérico.
 */
export function filtroLabel(params: FiltroParams, fechaRef?: string): string {
  const { filtro = 'actual', m, y, desde, hasta } = params
  if (filtro === 'todo')          return 'Todo el historial'
  if (filtro === 'ultimodia') {
    const f = fechaRef ? parseFecha(fechaRef) ?? parseFechaISO(fechaRef) : null
    if (!f) return 'Último día con movimiento'
    return `Último día · ${f.dia} ${MESES_LABEL[f.mes].toLowerCase()} ${f.year}`
  }
  if (filtro === 'año'   && y)    return `Año ${y}`
  if (filtro === 'mes'   && m && y) return `${MESES_LABEL[parseInt(m, 10) - 1] ?? '?'} ${y}`
  if (filtro === 'rango' && desde && hasta) {
    const fmt = (s: string) =>
      new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
    return `${fmt(desde)} – ${fmt(hasta)}`
  }
  return 'Período actual'
}

/** Serializa los params del filtro a un URLSearchParams string (sin "filtro=actual"). */
export function filtroToQS(params: FiltroParams): string {
  const p = new URLSearchParams()
  const { filtro = 'actual', m, y, desde, hasta } = params
  if (filtro === 'actual') return ''
  p.set('filtro', filtro)
  if (filtro === 'ultimodia') return p.toString()
  if (filtro === 'mes')   { if (m) p.set('m', m);  if (y) p.set('y', y) }
  if (filtro === 'año')   { if (y) p.set('y', y) }
  if (filtro === 'rango') { if (desde) p.set('desde', desde); if (hasta) p.set('hasta', hasta) }
  return p.toString()
}
