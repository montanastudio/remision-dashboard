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

/**
 * Tipos de movimiento que cuentan como VENTA para rotación. Verificado contra
 * los datos: SA lleva los documentos de factura (MG/CJ/VM/PM) y concentra
 * 449.701 unidades; traslados (TS), muestras (SM) y ajustes quedan fuera
 * porque mueven mercancía sin venderla. Las devoluciones (DV) son entradas.
 */
export const TIPOS_VENTA: readonly string[] = ['SA']

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
  /** Unidades vendidas (solo tipos SA) dentro del período */
  ventasPeriodo: number
  movsVenta: number
  /** Ventas de la ventana inmediatamente anterior, para comparar tendencia */
  ventasPrev: number
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
export function agregarKardex(
  rows: KardexRow[],
  periodo: PeriodoKardex,
  periodoPrev: PeriodoKardex | null = null
): ProductoKardex[] {
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
        ventasPeriodo: 0, movsVenta: 0, ventasPrev: 0,
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
    const tipo = (r['Tipo'] ?? '').trim()
    const s = num(r['Salidas'])

    if (periodoPrev && k >= periodoPrev.desdeKey && k <= periodoPrev.hastaKey) {
      if (s > 0 && TIPOS_VENTA.includes(tipo)) p.ventasPrev += s
    }
    if (k < periodo.desdeKey || k > periodo.hastaKey) continue

    const e = num(r['Entradas'])
    if (e > 0) { p.entradasPeriodo += e; p.movsEntrada++ }
    if (s > 0) {
      p.salidasPeriodo += s; p.movsSalida++
      if (TIPOS_VENTA.includes(tipo)) { p.ventasPeriodo += s; p.movsVenta++ }
    }
  }

  return Array.from(map.values())
    .filter((p) => p.saldoActual !== 0 || p.entradasPeriodo > 0 || p.salidasPeriodo > 0 || p.ventasPrev > 0)
    .sort((a, b) => b.valorActual - a.valorActual)
}

/**
 * Consolida las filas producto×bodega en una por producto (bodega = '').
 * Las cantidades cuadran globalmente contra RAW_Inventario, así que sumar
 * bodegas es seguro; el unitario queda ponderado por el valor.
 */
export function consolidarPorProducto(productos: ProductoKardex[]): ProductoKardex[] {
  const map = new Map<string, ProductoKardex>()
  for (const p of productos) {
    const e = map.get(p.codigo)
    if (!e) { map.set(p.codigo, { ...p, bodega: '' }); continue }
    e.saldoActual += p.saldoActual
    e.valorActual += p.valorActual
    e.entradasPeriodo += p.entradasPeriodo
    e.salidasPeriodo += p.salidasPeriodo
    e.movsEntrada += p.movsEntrada
    e.movsSalida += p.movsSalida
    e.ventasPeriodo += p.ventasPeriodo
    e.movsVenta += p.movsVenta
    e.ventasPrev += p.ventasPrev
    if (!e.referencia && p.referencia) e.referencia = p.referencia
    if (fechaKey(p.ultimoMovimiento) > fechaKey(e.ultimoMovimiento)) e.ultimoMovimiento = p.ultimoMovimiento
    e.unitario = e.saldoActual !== 0 ? e.valorActual / e.saldoActual : p.unitario
  }
  return Array.from(map.values()).sort((a, b) => b.valorActual - a.valorActual)
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
    if (bodega && (r['Ubicación'] ?? '').trim() !== bodega) continue
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

/** 'YYYY-MM-DD' → clave numérica; NaN-safe. */
export function isoAKey(iso: string): number {
  const n = parseInt(iso.replace(/-/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function keyADate(k: number): Date {
  const s = String(k)
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)))
}

function dateAKey(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

export interface VentanaKardex {
  periodo: PeriodoKardex
  prev: PeriodoKardex | null
  /** Días calendario de la ventana (para ritmo y cobertura) */
  dias: number
  /** Etiqueta legible: "01/08/2026 — 28/08/2026 · 28 días" */
  label: string
}

/**
 * Resuelve la ventana de análisis. Si vienen kdesde/khasta (los filtros
 * rápidos de la pestaña) mandan; si no, se usa el filtro global. La ventana
 * anterior tiene la misma longitud y termina el día antes de `desde` — es la
 * base del "vs período anterior". Las cotas abiertas (todo el historial) se
 * cierran contra el rango real de los datos para poder calcular días.
 */
export function resolverVentana(
  kdesde: string | undefined,
  khasta: string | undefined,
  global: FiltroParams,
  rows: KardexRow[]
): VentanaKardex {
  let periodo: PeriodoKardex
  if (kdesde && khasta && isoAKey(kdesde) > 0 && isoAKey(khasta) > 0) {
    periodo = { desdeKey: isoAKey(kdesde), hastaKey: isoAKey(khasta) }
  } else {
    periodo = periodoDesdeParams(global, rows)
  }

  // Cerrar cotas abiertas contra los datos reales
  let minK = Infinity, maxK = 0
  for (const r of rows) {
    if ((r['Transacción'] ?? '').trim() === 'SALDO INICIAL') continue
    const k = fechaKey(r['Fecha'])
    if (k === 0) continue
    if (k < minK) minK = k
    if (k > maxK) maxK = k
  }
  const desdeK = Math.max(periodo.desdeKey, minK === Infinity ? 0 : minK)
  const hastaK = Math.min(periodo.hastaKey === Infinity ? maxK : periodo.hastaKey, maxK || periodo.hastaKey)
  // hastaKey tipo 20260899 (mes completo) → recortar al último día real
  const hastaSano = hastaK % 100 > 31 ? maxK : hastaK

  const d1 = keyADate(desdeK), d2 = keyADate(hastaSano)
  const dias = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)

  const prevHasta = new Date(d1.getTime() - 86400000)
  const prevDesde = new Date(prevHasta.getTime() - (dias - 1) * 86400000)
  const prev: PeriodoKardex | null = dateAKey(prevDesde) >= (minK === Infinity ? 0 : minK) - 10000
    ? { desdeKey: dateAKey(prevDesde), hastaKey: dateAKey(prevHasta) }
    : null

  const f = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
  return {
    periodo: { desdeKey: desdeK, hastaKey: hastaSano },
    prev,
    dias,
    label: `${f(d1)} — ${f(d2)} · ${dias} ${dias === 1 ? 'día' : 'días'}`,
  }
}
