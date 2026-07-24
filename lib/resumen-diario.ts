import { parseFecha } from '@/lib/fecha'
import { fmt, fmtN } from '@/lib/format'

type Row = Record<string, string>

// parseNum local — este módulo solo corre en rutas API pero lo mantenemos puro
// (sin importar de lib/sheets, que carga googleapis) por consistencia.
function parseN(v?: string): number {
  if (!v) return 0
  let s = String(v).trim()
  const periods = (s.match(/\./g) ?? []).length
  if (periods > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

// Escapa caracteres que rompen el HTML de Telegram (nombres de cliente/vendedor).
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaLabel(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function mismaFecha(r: Row, d: Date): boolean {
  const f = parseFecha(r['FECHA'])
  return !!f && f.dia === d.getDate() && f.mes === d.getMonth() && f.year === d.getFullYear()
}
function enMesHasta(r: Row, año: number, mes: number, hastaDia: number): boolean {
  const f = parseFecha(r['FECHA'])
  return !!f && f.year === año && f.mes === mes && f.dia <= hastaDia
}
function enMes(r: Row, año: number, mes: number): boolean {
  const f = parseFecha(r['FECHA'])
  return !!f && f.year === año && f.mes === mes
}

function topPorValor(rows: Row[], keyField: string, labelField: string): { label: string; valor: number } | null {
  const map: Record<string, { label: string; valor: number }> = {}
  rows.forEach(r => {
    const k = (r[keyField] ?? '').trim()
    if (!k) return
    if (!map[k]) map[k] = { label: (r[labelField] ?? '').trim() || k, valor: 0 }
    map[k].valor += parseN(r['VRTOTAL'])
  })
  return Object.values(map).sort((a, b) => b.valor - a.valor)[0] ?? null
}

/** Mensaje 1: qué pasó el día anterior. */
export function resumenDiaTexto(ventas: Row[], recibos: Row[], fecha: Date): string {
  const v = ventas.filter(r => mismaFecha(r, fecha))
  const totalV = v.reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
  const pares = v.reduce((s, r) => s + parseN(r['CANTIDAD']), 0)
  const facturas = new Set(v.filter(r => parseN(r['CANTIDAD']) > 0).map(r => r['FACTURA']).filter(Boolean)).size
  const rec = recibos.filter(r => mismaFecha(r, fecha))
  const recaudo = rec.reduce((s, r) => s + parseN(r['MONTO']), 0)
  const topVend = topPorValor(v, 'NVENDEDOR', 'NVENDEDOR')
  const topCli = topPorValor(v, 'IDCLIENTE', 'NCLIENTE')

  const L: string[] = []
  L.push('☀️ <b>Resumen del día anterior</b>')
  L.push(`<i>${fechaLabel(fecha)}</i>`)
  L.push('')
  if (totalV === 0 && recaudo === 0) {
    L.push('Sin movimientos registrados para este día.')
    return L.join('\n')
  }
  L.push(`📈 Ventas: <b>${fmt(totalV)}</b>`)
  L.push(`     ${fmtN(pares)} pares · ${fmtN(facturas)} facturas`)
  L.push(`💰 Recaudo: <b>${fmt(recaudo)}</b> · ${fmtN(rec.length)} recibos`)
  if (topVend && topVend.valor > 0) L.push(`🏆 Mejor vendedor: ${esc(topVend.label)} (${fmt(topVend.valor)})`)
  if (topCli && topCli.valor > 0) L.push(`🛒 Mayor compra: ${esc(topCli.label)} (${fmt(topCli.valor)})`)
  return L.join('\n')
}

/** Mensaje 2: acumulado del mes hasta la fecha. */
export function resumenMesTexto(ventas: Row[], recibos: Row[], cartera: Row[], año: number, mes: number, hastaDia: number): string {
  const v = ventas.filter(r => enMesHasta(r, año, mes, hastaDia))
  const totalV = v.reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
  const pares = v.reduce((s, r) => s + parseN(r['CANTIDAD']), 0)
  const totalPrev = ventas.filter(r => enMesHasta(r, año - 1, mes, hastaDia)).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
  const pct = totalPrev > 0 ? ((totalV - totalPrev) / totalPrev) * 100 : null

  const rec = recibos.filter(r => enMesHasta(r, año, mes, hastaDia))
  const recaudo = rec.reduce((s, r) => s + parseN(r['MONTO']), 0)

  const vencida = cartera.filter(r => parseN(r['Días']) > 0).reduce((s, r) => s + parseN(r['Saldo ($)']), 0)
  const mas90 = cartera.filter(r => parseN(r['Días']) >= 91).reduce((s, r) => s + parseN(r['Saldo ($)']), 0)

  const vm: Record<string, number> = {}
  v.forEach(r => { const k = (r['NVENDEDOR'] ?? '').trim(); if (k) vm[k] = (vm[k] ?? 0) + parseN(r['VRTOTAL']) })
  const top3 = Object.entries(vm).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const L: string[] = []
  L.push(`📅 <b>Resumen del mes — ${MESES[mes]} ${año}</b>`)
  L.push(`<i>del 1 al ${hastaDia}</i>`)
  L.push('')
  L.push(`📈 Ventas del mes: <b>${fmt(totalV)}</b> (${fmtN(pares)} pares)`)
  if (pct != null) L.push(`     ${pct >= 0 ? '🔼' : '🔽'} ${Math.abs(pct).toFixed(0)}% vs mismo período ${año - 1}`)
  L.push(`💰 Recaudo del mes: <b>${fmt(recaudo)}</b>`)
  L.push(`⚠️ Cartera vencida (hoy): <b>${fmt(vencida)}</b>`)
  L.push(`     +90 días: ${fmt(mas90)}`)
  if (top3.length) {
    L.push('')
    L.push('🏆 <b>Top vendedores del mes</b>')
    top3.forEach(([n, val], i) => L.push(`     ${i + 1}. ${esc(n)} — ${fmt(val)}`))
  }
  return L.join('\n')
}

/** Mensaje de cierre de mes: resumen completo del mes que terminó. */
export function resumenMesCompletoTexto(ventas: Row[], recibos: Row[], cartera: Row[], año: number, mes: number): string {
  const v = ventas.filter(r => enMes(r, año, mes))
  const totalV = v.reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
  const pares = v.reduce((s, r) => s + parseN(r['CANTIDAD']), 0)
  const costo = v.reduce((s, r) => s + parseN(r['COSTO']), 0)
  const margen = totalV > 0 ? ((totalV - costo) / totalV) * 100 : 0
  const totalPrev = ventas.filter(r => enMes(r, año - 1, mes)).reduce((s, r) => s + parseN(r['VRTOTAL']), 0)
  const pct = totalPrev > 0 ? ((totalV - totalPrev) / totalPrev) * 100 : null

  const recaudo = recibos.filter(r => enMes(r, año, mes)).reduce((s, r) => s + parseN(r['MONTO']), 0)
  const vencida = cartera.filter(r => parseN(r['Días']) > 0).reduce((s, r) => s + parseN(r['Saldo ($)']), 0)
  const totalCartera = cartera.reduce((s, r) => s + parseN(r['Saldo ($)']), 0)

  const vm: Record<string, number> = {}
  v.forEach(r => { const k = (r['NVENDEDOR'] ?? '').trim(); if (k) vm[k] = (vm[k] ?? 0) + parseN(r['VRTOTAL']) })
  const topV = Object.entries(vm).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const cm: Record<string, { label: string; val: number }> = {}
  v.forEach(r => { const k = (r['IDCLIENTE'] ?? '').trim(); if (!k) return; if (!cm[k]) cm[k] = { label: (r['NCLIENTE'] ?? '').trim() || k, val: 0 }; cm[k].val += parseN(r['VRTOTAL']) })
  const topC = Object.values(cm).sort((a, b) => b.val - a.val).slice(0, 5)

  const L: string[] = []
  L.push(`📊 <b>CIERRE DE MES — ${MESES[mes].toUpperCase()} ${año}</b>`)
  L.push('')
  L.push(`📈 Ventas totales: <b>${fmt(totalV)}</b> (${fmtN(pares)} pares)`)
  if (pct != null) L.push(`     ${pct >= 0 ? '🔼' : '🔽'} ${Math.abs(pct).toFixed(0)}% vs ${MESES[mes]} ${año - 1}`)
  L.push(`📊 Margen bruto: <b>${margen.toFixed(1)}%</b>`)
  L.push(`💰 Recaudo total: <b>${fmt(recaudo)}</b>`)
  L.push(`⚠️ Cartera al cierre: ${fmt(totalCartera)} · vencida ${fmt(vencida)}`)
  if (topV.length) {
    L.push('')
    L.push('🏆 <b>Ranking de vendedores</b>')
    topV.forEach(([n, val], i) => L.push(`     ${i + 1}. ${esc(n)} — ${fmt(val)}`))
  }
  if (topC.length) {
    L.push('')
    L.push('👥 <b>Top 5 clientes</b>')
    topC.forEach((c, i) => L.push(`     ${i + 1}. ${esc(c.label)} — ${fmt(c.val)}`))
  }
  return L.join('\n')
}
