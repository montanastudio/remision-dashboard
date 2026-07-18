'use client'

import { useState, useMemo } from 'react'
import Card from '@/components/Card'
import BarRows from '@/components/BarRows'
import { fmt, fmtN } from '@/lib/format'
import { parseFecha } from '@/lib/fecha'

type Row = Record<string, string>

// parseNum local — no importar de lib/sheets (carga googleapis, rompe el bundle cliente)
function parseN(v: string | undefined): number {
  if (!v) return 0
  let s = String(v).trim()
  const periodCount = (s.match(/\./g) ?? []).length
  if (periodCount > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

// "CALZ.PEGASUS REF.PGS-6037Y-01 HARVARD" → "HARVARD"
function pickModelo(producto: string): string {
  const m = producto.toUpperCase().match(/REF\.?\s*[A-Z0-9][A-Z0-9-]*\s*(.*)$/)
  const modelo = (m ? m[1] : '').trim()
  return modelo || producto.trim() || 'Sin modelo'
}

function toDate(fechaStr: string | undefined): Date | null {
  const f = parseFecha(fechaStr)
  return f ? new Date(f.year, f.mes, f.dia) : null
}

function fmtFecha(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Compras de menos de REPO_UMBRAL pares de un solo modelo en una factura = reposición */
const REPO_UMBRAL = 12

// ── Escala de riesgo (0-9 pts, 3 factores de 0-3) ────────────────────────────
// 1. Días promedio de pago (ponderado por monto, vs fecha de vencimiento)
// 2. Deuda vencida actual como % de las compras de los últimos 12 meses
// 3. Antigüedad máxima de la mora actual (días vencidos de la peor factura)
const RISK_LEVELS = [
  { min: 0, max: 2, label: 'Riesgo Bajo',    color: '#22c55e' },
  { min: 3, max: 5, label: 'Riesgo Medio',   color: '#f59e0b' },
  { min: 6, max: 7, label: 'Riesgo Alto',    color: '#f97316' },
  { min: 8, max: 9, label: 'Riesgo Crítico', color: '#ef4444' },
]

function ptsPago(dias: number): number {
  if (dias <= 0) return 0
  if (dias <= 30) return 1
  if (dias <= 60) return 2
  return 3
}
function ptsDeudaRatio(ratio: number | null): number {
  if (ratio === null || ratio === 0) return 0
  if (ratio < 0.10) return 1
  if (ratio < 0.25) return 2
  return 3
}
function ptsMora(maxDias: number): number {
  if (maxDias <= 0) return 0
  if (maxDias <= 45) return 1
  if (maxDias <= 90) return 2
  return 3
}

interface Props {
  ventas:  Row[]   // normalizadas (FECHA, VRTOTAL, CANTIDAD, COSTO, IDCLIENTE, NCLIENTE, PRODUCTO, REFERENCIA, NGRUPO, FACTURA, DEVOLUCION)
  recibos: Row[]   // RAW_Recibos crudo
  cartera: Row[]   // RAW_Cartera crudo
}

export default function AnalisisCliente({ ventas, recibos, cartera }: Props) {
  const [query, setQuery] = useState('')
  const [selectedNIT, setSelectedNIT] = useState<string | null>(null)

  // ── Lista de clientes para el selector ────────────────────────────────
  const clientes = useMemo(() => {
    const map: Record<string, { nit: string; nombre: string; total: number }> = {}
    ventas.forEach(r => {
      const nit = (r['IDCLIENTE'] ?? '').trim()
      if (!nit) return
      if (!map[nit]) map[nit] = { nit, nombre: (r['NCLIENTE'] ?? '').trim() || nit, total: 0 }
      map[nit].total += parseN(r['VRTOTAL'])
      const nombre = (r['NCLIENTE'] ?? '').trim()
      if (nombre) map[nit].nombre = nombre
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [ventas])

  const q = query.trim().toLowerCase()
  const matches = q
    ? clientes.filter(c => c.nombre.toLowerCase().includes(q) || c.nit.toLowerCase().includes(q)).slice(0, 10)
    : clientes.slice(0, 10)

  const cliente = clientes.find(c => c.nit === selectedNIT) ?? null

  // ── Análisis completo del cliente seleccionado ────────────────────────
  const analisis = useMemo(() => {
    if (!selectedNIT) return null
    const hoy = new Date()
    const rows = ventas.filter(r => (r['IDCLIENTE'] ?? '').trim() === selectedNIT)
    if (rows.length === 0) return null

    const pos = rows.filter(r => parseN(r['CANTIDAD']) > 0)
    const dev = rows.filter(r => parseN(r['CANTIDAD']) < 0 || r['DEVOLUCION'] === 'SI')

    // Cuánto compra
    const totalHist   = pos.reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
    const undHist     = pos.reduce((s, r) => s + parseN(r['CANTIDAD']), 0)
    const añoActual   = hoy.getFullYear()
    const compraAño   = pos.filter(r => parseFecha(r['FECHA'])?.year === añoActual).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
    const compraAñoAnt = pos.filter(r => parseFecha(r['FECHA'])?.year === añoActual - 1).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
    const compraMes   = pos.filter(r => {
      const f = parseFecha(r['FECHA'])
      return f && f.year === añoActual && f.mes === hoy.getMonth()
    }).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)

    const facturas = new Set(pos.map(r => r['FACTURA']).filter(Boolean))
    const ticket = facturas.size > 0 ? totalHist / facturas.size : 0

    // Frecuencia de compra
    const fechas = Array.from(new Set(pos.map(r => r['FECHA']).filter(Boolean)))
      .map(toDate).filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())
    const primeraCompra = fechas[0] ?? null
    const ultimaCompra  = fechas[fechas.length - 1] ?? null
    const diasEntreCompras = fechas.length > 1 && primeraCompra && ultimaCompra
      ? Math.round((ultimaCompra.getTime() - primeraCompra.getTime()) / (1000 * 60 * 60 * 24) / (fechas.length - 1))
      : null
    const diasDesdeUltima = ultimaCompra
      ? Math.floor((hoy.getTime() - ultimaCompra.getTime()) / (1000 * 60 * 60 * 24))
      : null
    const facturasAño = new Set(pos.filter(r => parseFecha(r['FECHA'])?.year === añoActual).map(r => r['FACTURA'])).size

    // Qué compra más
    const modeloMap: Record<string, { und: number; valor: number; marca: string }> = {}
    pos.forEach(r => {
      const modelo = pickModelo(r['PRODUCTO'] ?? '')
      if (!modeloMap[modelo]) modeloMap[modelo] = { und: 0, valor: 0, marca: (r['NGRUPO'] ?? '').trim() }
      modeloMap[modelo].und   += parseN(r['CANTIDAD'])
      modeloMap[modelo].valor += parseN(r['VRTOTAL'])
    })
    const topModelos = Object.entries(modeloMap).sort((a, b) => b[1].und - a[1].und).slice(0, 8)

    // Marcas
    const marcaMap: Record<string, number> = {}
    pos.forEach(r => {
      const marca = (r['NGRUPO'] ?? '').trim() || 'Sin marca'
      marcaMap[marca] = (marcaMap[marca] ?? 0) + parseN(r['VRTOTAL'])
    })
    const topMarcas = Object.entries(marcaMap).sort((a, b) => b[1] - a[1])

    // Reposiciones: factura+modelo con menos de 12 pares
    const grupoMap: Record<string, { modelo: string; qty: number }> = {}
    pos.forEach(r => {
      const key = `${r['FACTURA']}|${pickModelo(r['PRODUCTO'] ?? '')}`
      if (!grupoMap[key]) grupoMap[key] = { modelo: pickModelo(r['PRODUCTO'] ?? ''), qty: 0 }
      grupoMap[key].qty += parseN(r['CANTIDAD'])
    })
    const grupos = Object.values(grupoMap)
    const gruposRepo = grupos.filter(g => g.qty > 0 && g.qty < REPO_UMBRAL)
    const pctRepos = grupos.length > 0 ? (gruposRepo.length / grupos.length) * 100 : 0
    const repoModeloCount: Record<string, number> = {}
    gruposRepo.forEach(g => { repoModeloCount[g.modelo] = (repoModeloCount[g.modelo] ?? 0) + 1 })
    const topRepos = Object.entries(repoModeloCount).sort((a, b) => b[1] - a[1]).slice(0, 6)

    // Devoluciones
    const undDevueltas = Math.abs(dev.reduce((s, r) => s + parseN(r['CANTIDAD']), 0))
    const tasaDevolucion = undHist > 0 ? (undDevueltas / undHist) * 100 : 0

    // Margen (neto: incluye devoluciones, que restan tanto venta como costo)
    const ventaNeta = rows.reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
    const costoNeto = rows.reduce((s, r) => s + parseN(r['COSTO']), 0)
    const margenPct = ventaNeta > 0 ? ((ventaNeta - costoNeto) / ventaNeta) * 100 : 0

    // Pagos (RAW_Recibos)
    const pagos = recibos.filter(r => (r['NIT'] ?? '').trim() === selectedNIT)
    const totalPagado = pagos.reduce((s, r) => s + parseN(r['Total Pagado ($)']), 0)
    const diasPagoPonderado = totalPagado > 0
      ? pagos.reduce((s, r) => s + parseN(r['Días']) * parseN(r['Total Pagado ($)']), 0) / totalPagado
      : null
    const fechasPago = Array.from(new Set(pagos.map(r => r['Fecha Pago']).filter(Boolean)))
      .map(toDate).filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())
    const ultimoAbono = fechasPago[fechasPago.length - 1] ?? null
    const diasEntreAbonos = fechasPago.length > 1
      ? Math.round((fechasPago[fechasPago.length - 1].getTime() - fechasPago[0].getTime()) / (1000 * 60 * 60 * 24) / (fechasPago.length - 1))
      : null

    // Deuda actual (RAW_Cartera)
    const deudaRows = cartera.filter(r => (r['NIT'] ?? '').trim() === selectedNIT && parseN(r['Saldo ($)']) > 0)
    const deudaTotal   = deudaRows.reduce((s, r) => s + parseN(r['Saldo ($)']), 0)
    const deudaVencida = deudaRows.filter(r => parseN(r['Días']) > 0).reduce((s, r) => s + parseN(r['Saldo ($)']), 0)
    const maxDiasMora  = deudaRows.reduce((m, r) => Math.max(m, parseN(r['Días'])), 0)

    // Score de riesgo
    const hace12m = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())
    const compras12m = pos.filter(r => {
      const d = toDate(r['FECHA'])
      return d && d >= hace12m
    }).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
    const deudaRatio = deudaVencida > 0
      ? (compras12m > 0 ? deudaVencida / compras12m : 1)
      : (deudaVencida === 0 ? 0 : null)

    const factorPago  = ptsPago(diasPagoPonderado ?? 0)
    const factorDeuda = ptsDeudaRatio(deudaRatio)
    const factorMora  = ptsMora(maxDiasMora)
    const score = factorPago + factorDeuda + factorMora
    const nivel = RISK_LEVELS.find(l => score >= l.min && score <= l.max) ?? RISK_LEVELS[0]

    return {
      totalHist, undHist, compraAño, compraAñoAnt, compraMes, ticket, nFacturas: facturas.size,
      primeraCompra, ultimaCompra, diasEntreCompras, diasDesdeUltima, facturasAño,
      topModelos, topMarcas,
      grupos: grupos.length, gruposRepo: gruposRepo.length, pctRepos, topRepos,
      undDevueltas, tasaDevolucion,
      ventaNeta, costoNeto, margenPct,
      nAbonos: pagos.length, totalPagado, diasPagoPonderado, ultimoAbono, diasEntreAbonos,
      deudaTotal, deudaVencida, maxDiasMora,
      score, nivel, factorPago, factorDeuda, factorMora, deudaRatio, compras12m,
    }
  }, [ventas, recibos, cartera, selectedNIT])

  const crecimiento = analisis && analisis.compraAñoAnt > 0
    ? ((analisis.compraAño - analisis.compraAñoAnt) / analisis.compraAñoAnt) * 100
    : null

  const maxModeloUnd = analisis?.topModelos[0]?.[1].und ?? 1
  const totalMarcas = analisis?.topMarcas.reduce((s, [, v]) => s + v, 0) ?? 1

  return (
    <div>
      {/* Selector de cliente */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4 mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
          Selecciona un cliente
        </div>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar cliente o NIT…"
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {matches.map(c => (
            <button
              key={c.nit}
              onClick={() => setSelectedNIT(p => p === c.nit ? null : c.nit)}
              className={`text-[11px] font-medium px-2.5 py-[4px] rounded-full border transition-all leading-none max-w-[260px] truncate ${
                selectedNIT === c.nit
                  ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
                  : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--nav-hover)]'
              }`}
              title={`${c.nombre} · ${fmt(c.total)}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {!analisis || !cliente ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card px-5 py-10 text-center">
          <div className="text-[12px] text-[var(--text-muted)]">👆 Busca y selecciona un cliente para ver su análisis completo</div>
        </div>
      ) : (
        <>
          {/* Encabezado del cliente + score de riesgo */}
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-[16px_18px] mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-bold text-[var(--text)] truncate">{cliente.nombre}</div>
                <div className="text-[11px] text-[var(--text-muted)] num">{cliente.nit}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Cliente desde {analisis.primeraCompra ? fmtFecha(analisis.primeraCompra) : '—'} · {fmtN(analisis.nFacturas)} facturas
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Score de riesgo</div>
                  <div className="text-[22px] font-bold num" style={{ color: analisis.nivel.color }}>
                    {analisis.score}<span className="text-[12px] font-normal text-[var(--text-muted)]">/9</span>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white" style={{ background: analisis.nivel.color }}>
                  {analisis.nivel.label}
                </span>
              </div>
            </div>
            {/* Desglose del score */}
            <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: 'Hábito de pago', pts: analisis.factorPago,
                  det: analisis.diasPagoPonderado != null ? `paga a ${Math.round(analisis.diasPagoPonderado)} días del vencimiento` : 'sin pagos registrados' },
                { label: 'Deuda vencida vs compras 12m', pts: analisis.factorDeuda,
                  det: analisis.deudaVencida > 0 ? `${fmt(analisis.deudaVencida)} vencido (${analisis.deudaRatio != null ? (analisis.deudaRatio * 100).toFixed(0) : '—'}%)` : 'sin deuda vencida' },
                { label: 'Antigüedad de la mora', pts: analisis.factorMora,
                  det: analisis.maxDiasMora > 0 ? `peor factura: ${fmtN(analisis.maxDiasMora)} días vencida` : 'sin facturas en mora' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2 px-2.5 py-2 rounded-[8px] bg-[var(--bar-bg)]">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${
                    f.pts === 0 ? 'bg-[#22c55e]' : f.pts === 1 ? 'bg-[#f59e0b]' : f.pts === 2 ? 'bg-[#f97316]' : 'bg-[#ef4444]'
                  }`}>{f.pts}</span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--text)]">{f.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{f.det}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs de compra */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Compras históricas</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(analisis.totalHist)}</div>
              <div className="text-[10px] text-[var(--text-muted)] num">{fmtN(analisis.undHist)} pares</div>
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Año actual</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(analisis.compraAño)}</div>
              {crecimiento != null && (
                <div className={`text-[10px] font-semibold num ${crecimiento >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {crecimiento >= 0 ? '↑' : '↓'} {Math.abs(crecimiento).toFixed(0)}% vs año anterior
                </div>
              )}
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Mes actual</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(analisis.compraMes)}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{fmtN(analisis.facturasAño)} facturas este año</div>
            </div>
            <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card p-[14px_16px]">
              <div className="text-[10px] text-[var(--text-muted)]">Ticket promedio</div>
              <div className="text-[17px] font-bold num text-[var(--text)]">{fmt(analisis.ticket)}</div>
              <div className="text-[10px] text-[var(--text-muted)]">por factura</div>
            </div>
          </div>

          {/* Frecuencia + Pagos + Salud comercial */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card title="Frecuencia de Compra" subtitle="ritmo del cliente">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Compra cada</div>
                  <div className="text-[18px] font-bold num text-[var(--text)]">
                    {analisis.diasEntreCompras != null ? `${fmtN(analisis.diasEntreCompras)} días` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Última compra</div>
                  <div className="text-[13px] font-semibold num text-[var(--text)]">
                    {analisis.ultimaCompra ? fmtFecha(analisis.ultimaCompra) : '—'}
                    {analisis.diasDesdeUltima != null && (
                      <span className={`ml-1.5 text-[10px] font-semibold ${
                        analisis.diasEntreCompras != null && analisis.diasDesdeUltima > analisis.diasEntreCompras * 2
                          ? 'text-[#ef4444]' : 'text-[var(--text-muted)]'
                      }`}>
                        hace {fmtN(analisis.diasDesdeUltima)} días
                      </span>
                    )}
                  </div>
                </div>
                {analisis.diasEntreCompras != null && analisis.diasDesdeUltima != null && analisis.diasDesdeUltima > analisis.diasEntreCompras * 2 && (
                  <div className="text-[10px] text-[#ef4444] font-medium px-2 py-1.5 rounded-[6px] bg-red-50 dark:bg-red-950/40">
                    ⚠ Lleva más del doble de su ritmo habitual sin comprar
                  </div>
                )}
              </div>
            </Card>

            <Card title="Hábito de Pago" subtitle="desde recibos de caja">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Paga en promedio</div>
                  <div className={`text-[18px] font-bold num ${
                    analisis.diasPagoPonderado == null ? 'text-[var(--text)]'
                    : analisis.diasPagoPonderado <= 0 ? 'text-[#22c55e]'
                    : analisis.diasPagoPonderado <= 30 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                  }`}>
                    {analisis.diasPagoPonderado != null
                      ? analisis.diasPagoPonderado <= 0
                        ? 'A tiempo'
                        : `${Math.round(analisis.diasPagoPonderado)} días tarde`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">vs fecha de vencimiento, ponderado por monto</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Abona cada</div>
                    <div className="text-[13px] font-semibold num text-[var(--text)]">
                      {analisis.diasEntreAbonos != null ? `${fmtN(analisis.diasEntreAbonos)} días` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Último abono</div>
                    <div className="text-[13px] font-semibold num text-[var(--text)]">
                      {analisis.ultimoAbono ? fmtFecha(analisis.ultimoAbono) : '—'}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {fmtN(analisis.nAbonos)} abonos · {fmt(analisis.totalPagado)} pagados
                  {analisis.deudaTotal > 0 && <> · <span className="text-[#ef4444] font-semibold">{fmt(analisis.deudaTotal)} pendiente</span></>}
                </div>
              </div>
            </Card>

            <Card title="Salud Comercial" subtitle="margen y devoluciones">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Margen bruto que deja</div>
                  <div className={`text-[18px] font-bold num ${
                    analisis.margenPct >= 30 ? 'text-[#22c55e]' : analisis.margenPct >= 15 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                  }`}>
                    {analisis.margenPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] num">
                    Utilidad: {fmt(analisis.ventaNeta - analisis.costoNeto)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Tasa de devolución</div>
                  <div className={`text-[15px] font-bold num ${
                    analisis.tasaDevolucion <= 3 ? 'text-[#22c55e]' : analisis.tasaDevolucion <= 8 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                  }`}>
                    {analisis.tasaDevolucion.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] num">{fmtN(analisis.undDevueltas)} pares devueltos</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Qué compra + Reposiciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card title="Qué Compra Más" subtitle="top modelos por unidades">
              <BarRows items={analisis.topModelos.map(([modelo, d]) => ({
                label: modelo,
                sublabel: d.marca,
                subvalue: `${fmtN(d.und)} und`,
                value: fmt(d.valor),
                pct: (d.und / maxModeloUnd) * 100,
                color: 'var(--brand-blue)',
              }))} />
              <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-x-3 gap-y-1">
                {analisis.topMarcas.map(([marca, valor]) => (
                  <span key={marca} className="text-[10px] text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text-sub)]">{marca}</span> {((valor / totalMarcas) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </Card>

            <Card title="Reposiciones" subtitle={`compras de menos de ${REPO_UMBRAL} pares de un mismo modelo`}>
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <div className="text-[22px] font-bold num text-[var(--text)]">{analisis.pctRepos.toFixed(0)}%</div>
                  <div className="text-[10px] text-[var(--text-muted)]">de sus compras son reposiciones</div>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {fmtN(analisis.gruposRepo)} de {fmtN(analisis.grupos)} compras modelo-factura
                </div>
              </div>
              {analisis.topRepos.length > 0 ? (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">
                    Modelos que más repone
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {analisis.topRepos.map(([modelo, n]) => (
                      <span key={modelo} className="text-[11px] font-medium px-2.5 py-[4px] rounded-full border border-[var(--border)] text-[var(--text-sub)]">
                        {modelo} <span className="text-[var(--text-muted)]">×{n}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-[10px] text-[var(--text-muted)] leading-relaxed">
                    💡 Un modelo que se repone seguido es un modelo que rota bien en su punto de venta.
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)]">Este cliente no compra reposiciones — solo curvas completas.</div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
