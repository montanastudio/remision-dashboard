'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { hoyBogota } from '@/lib/hoy-bogota'

export interface Recordatorio {
  ID: string; NIT: string; FechaRecordar: string; Descripcion: string
  CreadoPor: string; FechaCreacion: string; Completado: string; FechaCompletado: string
}

interface Props {
  /** NIT → nombre del cliente, para no mostrar solo el NIT pelado */
  nombrePorNit: Record<string, string>
  /** Abre el panel de notas del cliente al hacer clic en un recordatorio */
  onVerCliente: (nit: string) => void
  /** Avisa al padre que cambió algo (para refrescar contadores del tablero) */
  onCambio?: () => void
}

function hoyISO() {
  return hoyBogota()
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' para mostrar. */
function fechaLarga(iso: string): string {
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

/** Días de diferencia contra hoy, contando en fechas puras (sin horas). */
function diasDesdeHoy(iso: string): number {
  const p = iso.split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return 0
  const objetivo = Date.UTC(p[0], p[1] - 1, p[2])
  const h = hoyISO().split('-').map(Number)
  const hoy = Date.UTC(h[0], h[1] - 1, h[2])
  return Math.round((objetivo - hoy) / 86400000)
}

function etiquetaRelativa(iso: string): string {
  const d = diasDesdeHoy(iso)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Ayer'
  if (d < 0) return `Hace ${Math.abs(d)} días`
  return `En ${d} días`
}

export default function RecordatoriosBell({ nombrePorNit, onVerCliente, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [completando, setCompletando] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const res = await fetch('/api/gestion-cartera/recordatorios')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status} al cargar recordatorios`)
        setRecordatorios([])
        return
      }
      setRecordatorios(data.recordatorios ?? [])
    } catch {
      setError('No se pudo conectar con el servidor')
      setRecordatorios([])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Cerrar con Escape
  useEffect(() => {
    if (!abierto) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto])

  async function completar(id: string) {
    setCompletando(id)
    try {
      await fetch('/api/gestion-cartera/recordatorios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completado: true }),
      })
      setRecordatorios((prev) => prev.filter((r) => r.ID !== id))
      onCambio?.()
    } finally {
      setCompletando(null)
    }
  }

  const today = hoyISO()
  const pendientes = recordatorios.filter((r) => r.Completado !== 'SI' && r.FechaRecordar)

  const vencidos  = pendientes.filter((r) => r.FechaRecordar <  today)
  const hoy       = pendientes.filter((r) => r.FechaRecordar === today)
  const proximos  = pendientes.filter((r) => r.FechaRecordar >  today)

  // El badge cuenta lo accionable ahora: lo vencido y lo de hoy.
  const porAtender = vencidos.length + hoy.length

  const grupos = [
    { key: 'vencidos', titulo: 'Vencidos',    items: vencidos, color: 'text-red-500',    punto: 'bg-red-500' },
    { key: 'hoy',      titulo: 'Para hoy',    items: hoy,      color: 'text-amber-500',  punto: 'bg-amber-500' },
    { key: 'proximos', titulo: 'Próximos',    items: proximos, color: 'text-[var(--text-muted)]', punto: 'bg-[var(--text-muted)]' },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="relative" ref={contenedor}>
      <button
        onClick={() => { setAbierto((v) => !v); if (!abierto) cargar() }}
        className={`relative p-1.5 rounded-[6px] transition-colors ${
          abierto
            ? 'text-[var(--text)] bg-[var(--bar-bg)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)]'
        }`}
        title="Recordatorios">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {porAtender > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${
            vencidos.length > 0 ? 'bg-red-500' : 'bg-amber-500'
          }`}>
            {porAtender > 99 ? '99+' : porAtender}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[360px] max-w-[92vw] rounded-card border bg-[var(--card)] border-[var(--border)] shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <div className="text-[12px] font-semibold text-[var(--text)]">Recordatorios</div>
              <div className="flex items-center gap-2">
                <button onClick={cargar} disabled={cargando}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
                  {cargando ? 'Cargando...' : 'Actualizar'}
                </button>
                <button onClick={() => setAbierto(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] text-[13px] leading-none transition-colors">✕</button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {error ? (
                <div className="py-8 px-4 text-center text-[11px] text-red-500 leading-relaxed">{error}</div>
              ) : cargando && recordatorios.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Cargando...</div>
              ) : pendientes.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <div className="text-[12px] text-[var(--text-muted)]">No tienes recordatorios pendientes</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    Puedes crearlos desde el botón <span className="font-medium">Notas</span> de cada cliente.
                  </div>
                </div>
              ) : (
                grupos.map((g) => (
                  <div key={g.key}>
                    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--bar-bg)] sticky top-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${g.punto}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${g.color}`}>
                        {g.titulo} ({g.items.length})
                      </span>
                    </div>
                    {g.items.map((r) => (
                      <div key={r.ID}
                        className="flex items-start gap-2 px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--bar-bg)] transition-colors">
                        <button
                          onClick={() => { onVerCliente(r.NIT); setAbierto(false) }}
                          className="flex-1 min-w-0 text-left">
                          <div className="text-[11px] font-semibold text-[var(--text)] truncate">
                            {nombrePorNit[r.NIT] ?? r.NIT}
                          </div>
                          <div className="text-[11px] text-[var(--text-sub)] leading-snug mt-0.5 break-words">
                            {r.Descripcion}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 num">
                            {etiquetaRelativa(r.FechaRecordar)} · {fechaLarga(r.FechaRecordar)}
                            {r.CreadoPor && <span className="ml-1">· {r.CreadoPor}</span>}
                          </div>
                        </button>
                        <button
                          onClick={() => completar(r.ID)}
                          disabled={completando === r.ID}
                          title="Marcar como completado"
                          className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-[5px] border border-[var(--border)] text-[var(--text-muted)] hover:border-green-500 hover:text-green-500 transition-colors disabled:opacity-40 text-[11px] leading-none">
                          ✓
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
