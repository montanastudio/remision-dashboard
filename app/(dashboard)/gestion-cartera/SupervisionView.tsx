'use client'

import { useState, useEffect, useMemo } from 'react'

interface Nota {
  ID: string; NIT: string; Fecha: string; Hora: string
  Usuario: string; Texto: string; Tipo: string; Monto: string
}
interface Recordatorio {
  ID: string; NIT: string; FechaRecordar: string; Descripcion: string
  CreadoPor: string; Completado: string
}
interface Cliente {
  nit: string; nombre: string; saldo: number; contactadoHoy: boolean
  recordatoriosPendientes: number
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

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }

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

interface Props { clientes: Cliente[] }

export default function SupervisionView({ clientes }: Props) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('hoy')

  const today = toISO(new Date())

  useEffect(() => {
    Promise.all([
      fetch('/api/gestion-cartera/notas').then((r) => r.json()).catch(() => ({ notas: [] })),
      fetch('/api/gestion-cartera/recordatorios').then((r) => r.json()).catch(() => ({ recordatorios: [] })),
    ]).then(([n, r]) => {
      setNotas(n.notas ?? [])
      setRecordatorios(r.recordatorios ?? [])
      if (!n.notas && !r.recordatorios) {
        setLoadError('No se pudieron cargar los datos. Verifica que GOOGLE_SHEETS_ID_CARTERA esté configurado en Vercel.')
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

  const abonosPeriodo = notasPeriodo.filter((n) => n.Tipo === 'abono')
  const totalAbonosPeriodo = abonosPeriodo.reduce((s, n) => s + (Number(n.Monto) || 0), 0)

  const recVencidos = recordatorios.filter((r) => r.Completado !== 'SI' && r.FechaRecordar <= today)

  const nitNombre = Object.fromEntries(clientes.map((c) => [c.nit, c.nombre]))

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: periodo === 'hoy' ? 'Contactados hoy' : `Contactados (${periodoLabel.toLowerCase()})`,
            value: todosContactados.length,
            total: clientes.length,
            color: '#22c55e',
          },
          {
            label: periodo === 'hoy' ? 'Notas hoy' : `Notas (${periodoLabel.toLowerCase()})`,
            value: notasPeriodo.length,
            total: undefined,
            color: '#3b82f6',
          },
          {
            label: 'Abonos gestionados',
            value: abonosPeriodo.length,
            sub: totalAbonosPeriodo > 0 ? fmt(totalAbonosPeriodo) : undefined,
            total: undefined,
            color: '#14b8a6',
          },
          {
            label: 'Recordatorios vencidos',
            value: recVencidos.length,
            total: undefined,
            color: '#ef4444',
          },
        ].map((m) => (
          <div key={m.label} className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1 leading-tight">{m.label}</div>
            <div className="text-[28px] font-bold tracking-tight" style={{ color: m.color }}>{m.value}</div>
            {'sub' in m && m.sub && (
              <div className="text-[12px] font-semibold text-green-600 mt-0.5">{m.sub}</div>
            )}
            {m.total !== undefined && (
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">de {m.total} total</div>
            )}
          </div>
        ))}
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

        {/* Clientes contactados en el período */}
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
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
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
