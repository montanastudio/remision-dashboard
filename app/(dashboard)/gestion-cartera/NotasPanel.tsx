'use client'

import { useState, useEffect, useCallback } from 'react'

interface Nota {
  ID: string; NIT: string; Fecha: string; Hora: string
  Usuario: string; Texto: string; Tipo: string; Monto: string
}
interface Recordatorio {
  ID: string; NIT: string; FechaRecordar: string; Descripcion: string
  CreadoPor: string; FechaCreacion: string; Completado: string; FechaCompletado: string
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  llamada: { label: 'Llamada',  color: '#3b82f6' },
  mensaje: { label: 'Mensaje',  color: '#8b5cf6' },
  visita:  { label: 'Visita',   color: '#14b8a6' },
  nota:    { label: 'Nota',     color: '#64748b' },
  abono:   { label: 'Abono',    color: '#22c55e' },
}

interface Props {
  nit: string
  nombre: string
  saldo: number
  onClose: () => void
}

export default function NotasPanel({ nit, nombre, saldo, onClose }: Props) {
  const [tab, setTab] = useState<'notas' | 'recordatorios'>('notas')
  const [notas, setNotas] = useState<Nota[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('nota')
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)
  const [fechaRec, setFechaRec] = useState('')
  const [descRec, setDescRec] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rNotas, rRec] = await Promise.all([
        fetch(`/api/gestion-cartera/notas?nit=${nit}`).then((r) => r.json()),
        fetch(`/api/gestion-cartera/recordatorios?nit=${nit}`).then((r) => r.json()),
      ])
      setNotas(rNotas.notas ?? [])
      setRecordatorios(rRec.recordatorios ?? [])
    } finally {
      setLoading(false)
    }
  }, [nit])

  useEffect(() => { load() }, [load])

  async function crearNota() {
    if (!texto.trim() || saving) return
    if (tipo === 'abono' && !monto) return
    setSaving(true)
    await fetch('/api/gestion-cartera/notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit, texto, tipo, monto: monto ? Number(monto.replace(/\./g, '')) : undefined }),
    })
    setTexto('')
    setTipo('nota')
    setMonto('')
    await load()
    setSaving(false)
  }

  async function crearRecordatorio() {
    if (!fechaRec || !descRec.trim() || saving) return
    setSaving(true)
    await fetch('/api/gestion-cartera/recordatorios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit, fechaRecordar: fechaRec, descripcion: descRec }),
    })
    setFechaRec('')
    setDescRec('')
    await load()
    setSaving(false)
  }

  async function completarRecordatorio(id: string, completado: boolean) {
    await fetch('/api/gestion-cartera/recordatorios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completado }),
    })
    await load()
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const pendientes = recordatorios.filter((r) => r['Completado'] !== 'SI' && r['FechaRecordar'] <= today)

  return (
    <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <span className="text-[13px] font-semibold text-[var(--text)]">{nombre}</span>
          <span className="ml-2 text-[11px] text-[var(--text-muted)] num">{nit}</span>
          <span className="ml-2 text-[11px] font-medium text-red-500 num">{fmt(saldo)}</span>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded transition-colors text-[13px]">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {(['notas', 'recordatorios'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-medium transition-colors relative ${
              tab === t
                ? 'text-[var(--brand-blue)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-blue)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            {t === 'notas' ? `Notas (${notas.length})` : `Recordatorios (${recordatorios.filter(r=>r.Completado!=='SI').length})`}
            {t === 'recordatorios' && pendientes.length > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] inline-flex items-center justify-center">{pendientes.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">Cargando...</div>
        ) : tab === 'notas' ? (
          <>
            {/* Nueva nota */}
            <div className="mb-4 p-3 rounded-[8px] bg-[var(--bar-bg)] space-y-2">
              <div className="flex gap-2">
                <select value={tipo} onChange={(e) => { setTipo(e.target.value); setMonto('') }}
                  className="text-[11px] px-2 py-1.5 rounded-[6px] border bg-[var(--card)] text-[var(--text)] focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                {tipo === 'abono' && (
                  <input
                    type="number"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="Monto abonado $"
                    min="0"
                    className="flex-1 text-[11px] px-2 py-1.5 rounded-[6px] border bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none font-semibold text-green-600"
                    style={{ borderColor: '#22c55e' }}
                  />
                )}
              </div>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={tipo === 'abono' ? 'Descripción del abono (forma de pago, observaciones...)' : 'Escribe una nota sobre este cliente...'}
                rows={2}
                className="w-full text-[12px] px-3 py-2 rounded-[6px] border bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 resize-none"
                style={{ borderColor: 'var(--border)', ['--tw-ring-color' as string]: 'var(--brand-blue)' }}
              />
              <button onClick={crearNota} disabled={!texto.trim() || saving || (tipo === 'abono' && !monto)}
                className="px-3 py-1.5 rounded-[6px] text-[11px] font-medium bg-[var(--brand-blue)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
                {saving ? 'Guardando...' : tipo === 'abono' ? '+ Registrar abono' : '+ Agregar nota'}
              </button>
            </div>

            {/* Lista de notas */}
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {notas.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">Sin notas aún</div>
              ) : notas.map((n) => {
                const t = TIPO_LABELS[n.Tipo] ?? TIPO_LABELS.nota
                return (
                  <div key={n.ID} className="p-3 rounded-[8px] border bg-[var(--bar-bg)]" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: t.color }}>{t.label}</span>
                      {n.Tipo === 'abono' && n.Monto && (
                        <span className="text-[11px] font-bold text-green-600">
                          ${Number(n.Monto).toLocaleString('es-CO')}
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--text-muted)]">{n.Fecha} · {n.Hora}</span>
                      <span className="text-[10px] text-[var(--text-sub)] ml-auto">{n.Usuario}</span>
                    </div>
                    <p className="text-[12px] text-[var(--text-sub)] leading-relaxed">{n.Texto}</p>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* Recordatorios vencidos */}
            {pendientes.length > 0 && (
              <div className="mb-3 p-2 rounded-[8px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-1">Vencidos ({pendientes.length})</div>
                {pendientes.map((r) => (
                  <div key={r.ID} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-[11px] text-[var(--text-sub)]">{r.Descripcion}</span>
                      <span className="ml-2 text-[10px] text-[var(--text-muted)] num">{r.FechaRecordar}</span>
                    </div>
                    <button onClick={() => completarRecordatorio(r.ID, true)}
                      className="text-[10px] px-2 py-0.5 rounded bg-[var(--brand-blue)] text-white hover:opacity-90 ml-2 flex-shrink-0">
                      Marcar listo
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Nuevo recordatorio */}
            <div className="mb-4 p-3 rounded-[8px] bg-[var(--bar-bg)] space-y-2">
              <div className="text-[11px] font-medium text-[var(--text-sub)]">Nuevo recordatorio</div>
              <input type="date" value={fechaRec} onChange={(e) => setFechaRec(e.target.value)} min={today}
                className="w-full text-[12px] px-3 py-1.5 rounded-[6px] border bg-[var(--card)] text-[var(--text)] focus:outline-none"
                style={{ borderColor: 'var(--border)' }} />
              <input type="text" value={descRec} onChange={(e) => setDescRec(e.target.value)}
                placeholder="Descripción del recordatorio..."
                className="w-full text-[12px] px-3 py-1.5 rounded-[6px] border bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                style={{ borderColor: 'var(--border)' }} />
              <button onClick={crearRecordatorio} disabled={!fechaRec || !descRec.trim() || saving}
                className="px-3 py-1.5 rounded-[6px] text-[11px] font-medium bg-[var(--brand-blue)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
                {saving ? 'Guardando...' : '+ Agregar recordatorio'}
              </button>
            </div>

            {/* Lista */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {recordatorios.filter(r=>r.Completado!=='SI').length === 0 ? (
                <div className="py-4 text-center text-[12px] text-[var(--text-muted)]">Sin recordatorios pendientes</div>
              ) : recordatorios.filter(r=>r.Completado!=='SI').map((r) => (
                <div key={r.ID} className="flex items-center justify-between p-2 rounded-[8px] border bg-[var(--bar-bg)]" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <div className="text-[12px] text-[var(--text-sub)]">{r.Descripcion}</div>
                    <div className="text-[10px] text-[var(--text-muted)] num mt-0.5">{r.FechaRecordar} · {r.CreadoPor}</div>
                  </div>
                  <button onClick={() => completarRecordatorio(r.ID, true)}
                    className="ml-3 text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-green-500 hover:text-green-500 flex-shrink-0 transition-colors">
                    ✓
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
