// Análisis de inventario sobre RAW_Kardex (movimiento a movimiento).
//
// La hoja trae una fila por movimiento: entradas, salidas, saldo corrido y
// valorización, por producto × bodega. Auditada 2026-08-25: el saldo corrido
// cuadra en las 55.367 filas.
//
// Nota sobre encabezados: la primera columna se llama "Bodega" pero es el
// consecutivo de fila del export; la bodega real es "Ubicación".
//
// Módulo puro (sin googleapis) — usable en server components y API routes.

import { parseFecha } from './fecha'

export type KardexRow = Record<string, string>

export interface MovimientoKardex {
  fecha: string
  tipo: string        // ED, SA, DV, TS…
  transaccion: string // descripción/cliente
  documento: string
  entradas: number
  salidas: number
  unitario: number
  saldo: number
}

export interface ProductoKardex {
  codigo: string
  referencia: string
  producto: string
  bodega: string      // columna "Ubicación"
  saldoActual: number
  valorActual: number
  unitario: number
  entradasPeriodo: number
  salidasPeriodo: number
  movsEntrada: number
  movsSalida: number
  ultimoMovimiento: string // DD/MM/YYYY del último movimiento real (no saldo inicial)
}

function num(v: string | undefined): number {
  if (!v) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

/** Clave ordenable YYYYMMDD; 0 si la fecha no parsea. */
export function fechaKey(v: string | undefined): number {
  const f = parseFecha(v)
  return f ? f.year * 10000 + (f.mes + 1) * 100 + f.dia : 0
}

export interface PeriodoKardex {
  desdeKey: number // inclusive, 0 = sin límite
  hastaKey: number // inclusive, Infinity = sin límite
}

/**
 * Agrega el kardex por producto × bodega.
 *
 * El saldo actual sale del ÚLTIMO movimiento del grupo (historia completa,
 * ignora el período); entradas/salidas se acumulan solo dentro del período.
 * Las filas se asumen en orden cronológico por grupo — la auditoría confirmó
 * que la hoja viene así.
 */
export function agregarKardex(rows: KardexRow[], periodo: PeriodoKardex): ProductoKardex[] {
  const map = new Map<string, ProductoKardex>()

  for (const r of rows) {
    const codigo = (r['Código'] ?? '').trim()
    const bodega = (r['Ubicación'] ?? '').trim()
    if (!codigo) continue

    const key = `${codigo}|${bodega}`
    let p = map.get(key)
    if (!p) {
      p = {
        codigo,
        bodega,
        referencia: (r['Referencia'] ?? '').trim(),
        producto: (r['Producto'] ?? '').trim(),
        saldoActual: 0, valorActual: 0, unitario: 0,
        entradasPeriodo: 0, salidasPeriodo: 0, movsEntrada: 0, movsSalida: 0,
        ultimoMovimiento: '',
      }
      map.set(key, p)
    }
    // Algunas filas (13 productos) vienen sin referencia; usar la primera no vacía
    if (!p.referencia && r['Referencia']) p.referencia = r['Referencia'].trim()

    // El saldo corrido: la última fila del grupo manda
    p.saldoActual = num(r['Saldo'])
    p.valorActual = num(r['Vr. Existencia ($)'])
    p.unitario    = num(r['Vr. Unitario ($)'])

    const esInicial = (r['Transacción'] ?? '').trim() === 'SALDO INICIAL'
    if (!esInicial && r['Fecha']) p.ultimoMovimiento = r['Fecha']

    if (esInicial) continue
    const k = fechaKey(r['Fecha'])
    if (k < periodo.desdeKey || k > periodo.hastaKey) continue

    const e = num(r['Entradas']), s = num(r['Salidas'])
    if (e > 0) { p.entradasPeriodo += e; p.movsEntrada++ }
    if (s > 0) { p.salidasPeriodo += s; p.movsSalida++ }
  }

  return Array.from(map.values())
    .filter((p) => p.saldoActual !== 0 || p.entradasPeriodo > 0 || p.salidasPeriodo > 0)
    .sort((a, b) => b.valorActual - a.valorActual)
}

/** Movimientos de un producto × bodega dentro del período (para el detalle). */
export function movimientosDe(
  rows: KardexRow[],
  codigo: string,
  bodega: string,
  periodo: PeriodoKardex
): MovimientoKardex[] {
  const out: MovimientoKardex[] = []
  for (const r of rows) {
    if ((r['Código'] ?? '').trim() !== codigo) continue
    if ((r['Ubicación'] ?? '').trim() !== bodega) continue
    if ((r['Transacción'] ?? '').trim() === 'SALDO INICIAL') continue
    const k = fechaKey(r['Fecha'])
    if (k < periodo.desdeKey || k > periodo.hastaKey) continue
    out.push({
      fecha: r['Fecha'] ?? '',
      tipo: (r['Tipo'] ?? '').trim(),
      transaccion: (r['Transacción'] ?? '').trim(),
      documento: (r['Documento'] ?? '').trim(),
      entradas: num(r['Entradas']),
      salidas: num(r['Salidas']),
      unitario: num(r['Vr. Unitario ($)']),
      saldo: num(r['Saldo']),
    })
  }
  // Más reciente primero
  return out.sort((a, b) => fechaKey(b.fecha) - fechaKey(a.fecha))
}

import type { FiltroParams } from './filtro-ventas'

/**
 * Traduce el filtro global de período (barra superior) a cotas de fecha para
 * el kardex. 'actual' = mes más reciente CON movimiento; 'ultimodia' = último
 * día con movimiento. Los saldos iniciales no cuentan como movimiento.
 */
export function periodoDesdeParams(params: FiltroParams, rows: KardexRow[]): PeriodoKardex {
  const { filtro = 'actual', m, y, desde, hasta } = params

  if (filtro === 'todo') return { desdeKey: 0, hastaKey: Infinity }
  if (filtro === 'año' && y) {
    const yy = parseInt(y, 10)
    return { desdeKey: yy * 10000 + 101, hastaKey: yy * 10000 + 1231 }
  }
  if (filtro === 'mes' && m && y) {
    const yy = parseInt(y, 10), mm = parseInt(m, 10)
    return { desdeKey: yy * 10000 + mm * 100 + 1, hastaKey: yy * 10000 + mm * 100 + 31 }
  }
  if (filtro === 'rango' && desde && hasta) {
    return { desdeKey: parseInt(desde.replace(/-/g, ''), 10), hastaKey: parseInt(hasta.replace(/-/g, ''), 10) }
  }

  let max = 0
  for (const r of rows) {
    if ((r['Transacción'] ?? '').trim() === 'SALDO INICIAL') continue
    const k = fechaKey(r['Fecha'])
    if (k > max) max = k
  }
  if (max === 0) return { desdeKey: 0, hastaKey: Infinity }
  if (filtro === 'ultimodia') return { desdeKey: max, hastaKey: max }
  // 'actual' → todo el mes de esa última fecha
  const base = Math.floor(max / 100) * 100
  return { desdeKey: base + 1, hastaKey: base + 99 }
}
