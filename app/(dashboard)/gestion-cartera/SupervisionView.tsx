'use client'

import { useState, useEffect, useMemo } from 'react'
import { BUCKET_ORDER, BUCKETS_CANONICOS } from '@/lib/cartera-normalize'

interface Nota {
  ID: string; NIT: string; Fecha: string; Hora: string
  Usuario: string; Texto: string; Tipo: string; Monto: string
}
interface Recordatorio {
  ID: string; NIT: string; FechaRecordar: string; Descripcion: string
  CreadoPor: string; Completado: string
}
interface Cliente {
  nit: string; nombre: string; saldo: number; bucket: string
  contactadoHoy: boolean; recordatoriosPendientes: number
}
interface Recaudo {
  nit: string; cliente: string; recibo: string; factura: string
  fecha: string; monto: number
}

type Periodo = 'hoy' | '3dias' | 'semana' | 'mes'

const PERIODOS: { key: Periodo; label: string; days: number }[] = [
  { key: 'hoy',    label: 'Hoy',         days: 0 },
  { key: '3dias',  label: 'Últimos 3 días', days: 2 },
  { key: 'semana', label: 'Última semana',  days: 6 },
  { key: 'mes',    label: 'Último mes',     days: 29 },
]

const TIPO_COLORS: Record<string, string> = {
  llamada: '#3b82f6', mensaje: '#8b5cf6', visita: '#14b8a6', nota: '#64748b', abono: '#22c55e',
}
const TIPO_LABEL: Record<string, string> = {
  llamada: 'Llamada', mensaje: 'Mensaje', visita: 'Visita', nota: 'Nota', abono: 'Abono',
}

const BUCKET_COLOR: Record<string, string> = {
  'Jurídico': '#991b1b', 'Prejurídico': '#ef4444', 'Mora': '#f97316', 'Vencida': '#fb923c',
  'Próximo a vencer': '#eab308', '1-30 días': '#4ade80', 'No vencida': '#22c55e',
}

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }
function fmtK(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + ' M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

function getDesde(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toISO(d)
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Lista de fechas ISO desde `desde` hasta `hasta`, ambas inclusive. */
function rangoDias(desde: string, hasta: string): string[] {
  const out: string[] = []
  const d = new Date(desde + 'T12:00:00Z')
  while (toISO(d) <= hasta) {
    out.push(toISO(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

interface Props { clientes: Cliente[] }

export default function SupervisionView({ clientes }: Props) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [recaudos, setRecaudos] = useState<Recaudo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('hoy')

  const today = toISO(new Date())

  useEffect(() => {
    Promise.all([
      fetch('/api/gestion-cartera/notas').then((r) => r.json()).catch(() => ({ notas: [] })),
      fetch('/api/gestion-cartera/recordatorios').then((r) => r.json()).catch(() => ({ recordatorios: [] })),
      fetch('/api/gestion-cartera/recaudos').then((r) => r.json()).catch(() => ({ recaudos: [] })),
    ]).then(([n, r, p]) => {
      setNotas(n.notas ?? [])
      setRecordatorios(r.recordatorios ?? [])
      setRecaudos(p.recaudos ?? [])
      if (!n.notas && !r.recordatorios) {
        setLoadError(n.error ?? r.error ?? 'No se pudieron cargar los datos de gestión.')
      }
    }).finally(() => setLoading(false))
  }, [])

  const { desde, label: periodoLabel } = useMemo(() => {
    const p = PERIODOS.find((p) => p.key === periodo)!
    return { desde: getDesde(p.days), label: p.label }
  }, [periodo])

  // Notes filtered by period
  const notasPeriodo = useMemo(
    () => notas.filter((n) => n.Fecha >= desde && n.Fecha <= today),
    [notas, desde, today]
  )

  // Unique NITs with activity in period = "contacted"
  const nitsContactados = useMemo(() => new Set(notasPeriodo.map((n) => n.NIT)), [notasPeriodo])
  const clientesContactados = clientes.filter((c) => nitsContactados.has(c.nit))

  // For "hoy" we also include clients marked via the Contactar button
  const contactadosMarcados = periodo === 'hoy' ? clientes.filter((c) => c.contactadoHoy) : []
  const nitsContactadosMarcados = new Set(contactadosMarcados.map((c) => c.nit))
  const todosContactados = periodo === 'hoy'
    ? clientes.filter((c) => nitsContactados.has(c.nit) || nitsContactadosMarcados.has(c.nit))
    : clientesContactados
  const nitsTodosContactados = useMemo(
    () => new Set(todosContactados.map((c) => c.nit)),
    [todosContactados]
  )

  const abonosPeriodo = notasPeriodo.filter((n) => n.Tipo === 'abono')
  const totalAbonosPeriodo = abonosPeriodo.reduce((s, n) => s + (Number(n.Monto) || 0), 0)

  // Recaudo real (RAW_Recibos) en el período
  const recaudosPeriodo = useMemo(
    () => recaudos.filter((r) => r.fecha >= desde && r.fecha <= today),
    [recaudos, desde, today]
  )
  const totalRecaudoPeriodo = recaudosPeriodo.reduce((s, r) => s + r.monto, 0)
  const recibosUnicos = new Set(recaudosPeriodo.map((r) => r.recibo)).size

  const recVencidos = recordatorios.filter((r) => r.Completado !== 'SI' && r.FechaRecordar <= today)

  const nitNombre = Object.fromEntries(clientes.map((c) => [c.nit, c.nombre]))

  // Clientes sin ningún contacto en el período, los más graves primero
  const sinGestionar = useMemo(() =>
    clientes
      .filter((c) => !nitsTodosContactados.has(c.nit))
      .sort((a, b) => {
        const ba = BUCKET_ORDER[a.bucket] ?? -1
        const bb = BUCKET_ORDER[b.bucket] ?? -1
        if (bb !== ba) return bb - ba
        return b.saldo - a.saldo
      }),
    [clientes, nitsTodosContactados]
  )
  const saldoSinGestionar = sinGestionar.reduce((s, c) => s + c.saldo, 0)

  // Cobertura por bucket: contactados / total (del más grave al más sano)
  const cobertura = useMemo(() =>
    [...BUCKETS_CANONICOS]
      .sort((a, b) => (BUCKET_ORDER[b] ?? 0) - (BUCKET_ORDER[a] ?? 0))
      .map((bucket) => {
        const del = clientes.filter((c) => c.bucket === bucket)
        const contactados = del.filter((c) => nitsTodosContactados.has(c.nit))
        return { bucket, total: del.length, contactados: contactados.length }
      })
      .filter((b) => b.total > 0),
    [clientes, nitsTodosContactados]
  )

  // Actividad y recaudo por día del período (para las mini gráficas)
  const dias = useMemo(() => rangoDias(desde, today), [desde, today])
  const porDia = useMemo(() => {
    const gestiones: Record<string, number> = {}
    const plata: Record<string, number> = {}
    for (const d of dias) { gestiones[d] = 0; plata[d] = 0 }
    for (const n of notasPeriodo) if (gestiones[n.Fecha] !== undefined) gestiones[n.Fecha]++
    for (const r of recaudosPeriodo) if (plata[r.fecha] !== undefined) plata[r.fecha] += r.monto
    const maxGestiones = Math.max(1, ...Object.values(gestiones))
    const maxPlata = Math.max(1, ...Object.values(plata))
    return { gestiones, plata, maxGestiones, maxPlata }
  }, [dias, notasPeriodo, recaudosPeriodo])

  // Group activity by date for multi-day views
  const actividadPorFecha = useMemo(() => {
    const sorted = [...notasPeriodo].sort((a, b) => {
      const ka = `${a.Fecha}${a.Hora}`; const kb = `${b.Fecha}${b.Hora}`
      return kb.localeCompare(ka)
    })
    if (periodo === 'hoy') return { [today]: sorted }
    const groups: Record<string, Nota[]> = {}
    for (const n of sorted) {
      if (!groups[n.Fecha]) groups[n.Fecha] = []
      groups[n.Fecha].push(n)
    }
    return groups
  }, [notasPeriodo, periodo, today])

  if (loading) {
    return <div className="py-12 text-center text-[12px] text-[var(--text-muted)]">Cargando datos de supervisión...</div>
  }

  if (loadError) {
    return (
      <div className="rounded-card border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-5 py-6 text-center">
        <div className="text-[13px] font-semibold text-red-600 dark:text-red-400 mb-1">No se pudieron cargar los datos</div>
        <div className="text-[12px] text-red-500 dark:text-red-400 leading-relaxed">{loadError}</div>
      </div>
    )
  }

  const MOSTRAR_SIN_GESTIONAR = 15

  return (
    <div className="space-y-4">
      {/* Filtro de período */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--text-muted)] font-medium">Ver período:</span>
        <div className="flex rounded-[8px] border border-[var(--border)] overflow-hidden">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                periodo === p.key
                  ? 'bg-[var(--brand-blue)] text-white'
                  : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {periodo !== 'hoy' && (
          <span className="text-[10px] text-[var(--text-muted)]">
            {fmtFecha(desde)} — {fmtFecha(today)}
          </span>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: periodo === 'hoy' ? 'Contactados hoy' : `Contactados (${periodoLabel.toLowerCase()})`,
            value: String(todosContactados.length),
            sub: `de ${clientes.length} clientes`,
            color: '#22c55e',
          },
          {
            label: periodo === 'hoy' ? 'Notas hoy' : `Notas (${periodoLabel.toLowerCase()})`,
            value: String(notasPeriodo.length),
            sub: undefined,
            color: '#3b82f6',
          },
          {
            label: 'Abonos anotados',
            value: String(abonosPeriodo.length),
            sub: totalAbonosPeriodo > 0 ? fmt(totalAbonosPeriodo) : undefined,
            color: '#14b8a6',
          },
          {
            label: 'Recaudo real',
            value: fmtK(totalRecaudoPeriodo),
            sub: recibosUnicos > 0 ? `${recibosUnicos} ${recibosUnicos === 1 ? 'recibo' : 'recibos'}` : 'sin pagos en el período',
            color: '#16a34a',
          },
          {
            label: 'Recordatorios vencidos',
            value: String(recVencidos.length),
            sub: undefined,
            color: '#ef4444',
          },
        ].map((m) => (
          <div key={m.label} className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1 leading-tight">{m.label}</div>
            <div className="text-[24px] font-bold tracking-tight num leading-tight" style={{ color: m.color }}>{m.value}</div>
            {m.sub && (
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{m.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sin gestionar — lo que nadie ha tocado en el período */}
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[13px] font-semibold text-[var(--text)]">
              Sin gestionar — {periodoLabel.toLowerCase()}
            </div>
            <span className="text-[11px] font-semibold text-red-500 num">{fmtK(saldoSinGestionar)}</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mb-3">
            {sinGestionar.length} {sinGestionar.length === 1 ? 'cliente' : 'clientes'} sin ningún contacto, los más graves primero
          </div>
          {sinGestionar.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-green-600">Todos los clientes fueron contactados 🎉</div>
          ) : (
            <>
              <div className="space-y-1 max-h-[340px] overflow-y-auto">
                {sinGestionar.slice(0, MOSTRAR_SIN_GESTIONAR).map((c) => (
                  <div key={c.nit} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="min-w-0 pr-2">
                      <div className="text-[12px] text-[var(--text-sub)] truncate">{c.nombre}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BUCKET_COLOR[c.bucket] ?? '#94a3b8' }} />
                        <span className="text-[10px]" style={{ color: BUCKET_COLOR[c.bucket] ?? 'var(--text-muted)' }}>{c.bucket || 'Sin bucket'}</span>
                      </div>
                    </div>
                    <div className="text-[11px] num text-[var(--text)] font-medium flex-shrink-0">{fmt(c.saldo)}</div>
                  </div>
                ))}
              </div>
              {sinGestionar.length > MOSTRAR_SIN_GESTIONAR && (
                <div className="mt-2 text-[10px] text-[var(--text-muted)] text-center">
                  y {sinGestionar.length - MOSTRAR_SIN_GESTIONAR} más — usa el tablero para verlos todos
                </div>
              )}
            </>
          )}
        </div>

        {/* Cobertura por bucket + ritmo del período */}
        <div className="space-y-4">
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
            <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Cobertura por bucket</div>
            <div className="text-[11px] text-[var(--text-muted)] mb-3">Clientes contactados sobre el total de cada categoría</div>
            <div className="space-y-2">
              {cobertura.map(({ bucket, total, contactados }) => {
                const pct = total > 0 ? (contactados / total) * 100 : 0
                return (
                  <div key={bucket} className="flex items-center gap-2">
                    <span className="text-[10px] w-[92px] flex-shrink-0 font-medium truncate" style={{ color: BUCKET_COLOR[bucket] }}>{bucket}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--bar-bg)] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BUCKET_COLOR[bucket] }} />
                    </div>
                    <span className="text-[10px] text-[var(--text-sub)] num w-14 text-right flex-shrink-0">{contactados} / {total}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {periodo !== 'hoy' && (
            <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
              <div className="text-[13px] font-semibold text-[var(--text)] mb-3">Ritmo del período</div>

              <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1">Gestiones por día</div>
              <div className="flex items-end gap-[3px] h-14 mb-1">
                {dias.map((d) => (
                  <div key={d} className="flex-1 rounded-t-[3px] bg-[var(--brand-blue)] min-h-[2px] transition-all"
                    style={{ height: `${(porDia.gestiones[d] / porDia.maxGestiones) * 100}%`, opacity: porDia.gestiones[d] === 0 ? 0.15 : 1 }}
                    title={`${fmtFecha(d)}: ${porDia.gestiones[d]} gestiones`} />
                ))}
              </div>

              <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1 mt-3">Recaudo por día</div>
              <div className="flex items-end gap-[3px] h-14 mb-1">
                {dias.map((d) => (
                  <div key={d} className="flex-1 rounded-t-[3px] bg-green-500 min-h-[2px] transition-all"
                    style={{ height: `${(porDia.plata[d] / porDia.maxPlata) * 100}%`, opacity: porDia.plata[d] === 0 ? 0.15 : 1 }}
                    title={`${fmtFecha(d)}: ${fmt(porDia.plata[d])}`} />
                ))}
              </div>

              <div className="flex justify-between text-[9px] text-[var(--text-muted)] num">
                <span>{fmtFecha(desde)}</span>
                <span>{fmtFecha(today)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Feed de actividad */}
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
          <div className="text-[13px] font-semibold text-[var(--text)] mb-3">
            Actividad — {periodoLabel}
            <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{notasPeriodo.length} registros</span>
          </div>
          {notasPeriodo.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">Sin actividad en este período</div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto">
              {Object.entries(actividadPorFecha)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([fecha, items]) => (
                  <div key={fecha}>
                    {periodo !== 'hoy' && (
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 sticky top-0 bg-[var(--card)] py-0.5">
                        {fecha === today ? 'Hoy' : fmtFecha(fecha)}
                        <span className="ml-1.5 font-normal normal-case">({items.length})</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {items.map((n) => (
                        <div key={n.ID} className="flex gap-2.5 p-2 rounded-[8px] bg-[var(--bar-bg)]">
                          <div className="w-1.5 flex-shrink-0 rounded-full mt-0.5 self-stretch" style={{ background: TIPO_COLORS[n.Tipo] ?? '#94a3b8' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-medium text-[var(--text)] truncate">{nitNombre[n.NIT] ?? n.NIT}</span>
                              <span className="text-[10px] text-[var(--text-muted)] ml-auto flex-shrink-0">{n.Hora}</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-sub)] leading-relaxed line-clamp-2">{n.Texto}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--text-muted)]">{n.Usuario}</span>
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                                style={{ background: TIPO_COLORS[n.Tipo] ?? '#94a3b8' }}>
                                {TIPO_LABEL[n.Tipo] ?? n.Tipo}
                              </span>
                              {n.Tipo === 'abono' && n.Monto && (
                                <span className="text-[10px] font-bold text-green-600">{fmt(Number(n.Monto))}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Contactados + pagos del período */}
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
          <div className="text-[13px] font-semibold text-[var(--text)] mb-3">
            {periodo === 'hoy' ? 'Contactados hoy' : `Contactados — ${periodoLabel}`}
            <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{todosContactados.length} de {clientes.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bar-bg)] mb-3 overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${clientes.length > 0 ? (todosContactados.length / clientes.length) * 100 : 0}%` }} />
          </div>
          {todosContactados.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-[var(--text-muted)]">
              {periodo === 'hoy' ? 'Ninguno aún' : 'Sin contactos en este período'}
            </div>
          ) : (
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {todosContactados.map((c) => (
                <div key={c.nit} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                  <div>
                    <div className="text-[12px] text-[var(--text-sub)]">{c.nombre}</div>
                    <div className="text-[10px] text-[var(--text-muted)] num">{c.nit}</div>
                  </div>
                  <div className="text-[11px] num text-[var(--text)] font-medium">{fmt(c.saldo)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pagos reales del período */}
          {recaudosPeriodo.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)]">
              <div className="text-[12px] font-semibold text-green-600 mb-2">
                Pagos recibidos — {periodoLabel.toLowerCase()} ({recibosUnicos})
              </div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {recaudosPeriodo.slice(0, 30).map((r, i) => (
                  <div key={`${r.recibo}-${r.factura}-${i}`} className="flex items-center justify-between py-1">
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] text-[var(--text-sub)] truncate">{nitNombre[r.nit] ?? (r.cliente || r.nit)}</div>
                      <div className="text-[10px] text-[var(--text-muted)] num">{fmtFecha(r.fecha)} · {r.recibo}</div>
                    </div>
                    <span className="text-[11px] font-semibold text-green-600 num flex-shrink-0">{fmt(r.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recordatorios vencidos — siempre actuales */}
          {recVencidos.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)]">
              <div className="text-[12px] font-semibold text-red-500 mb-2">Recordatorios vencidos ({recVencidos.length})</div>
              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                {recVencidos.map((r) => (
                  <div key={r.ID} className="py-1">
                    <div className="text-[11px] text-[var(--text-sub)]">{nitNombre[r.NIT] ?? r.NIT} — {r.Descripcion}</div>
                    <div className="text-[10px] text-red-400 num">{r.FechaRecordar}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
