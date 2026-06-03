'use client'

import { useState } from 'react'

export interface Cliente {
  nit: string; nombre: string; saldo: number; bucket: string
  diasVencido: number; listaId: string; contactadoHoy: boolean
  recordatoriosPendientes: number; vendedores: string[]
}
export interface Lista { ID: string; Nombre: string; Color: string; Orden: string }

const BUCKET_BADGE: Record<string, { bg: string; text: string }> = {
  // Nuevos nombres
  'Jurídico':         { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-800 dark:text-red-300' },
  'Prejurídico':      { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-600 dark:text-red-400' },
  'Mora':             { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400' },
  'Vencida':          { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-500 dark:text-orange-400' },
  'Próximo a vencer': { bg: 'bg-yellow-100 dark:bg-yellow-950/60', text: 'text-yellow-600 dark:text-yellow-500' },
  '1-30 días':        { bg: 'bg-green-100 dark:bg-green-950/60',   text: 'text-green-700 dark:text-green-400' },
  'No vencida':       { bg: 'bg-green-100 dark:bg-green-950/60',   text: 'text-green-600 dark:text-green-400' },
  // Legacy
  '+90 días':   { bg: 'bg-red-100 dark:bg-red-950/60',       text: 'text-red-800 dark:text-red-300' },
  '61-90 días': { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400' },
  '31-60 días': { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-500 dark:text-orange-400' },
  '1-30 días':  { bg: 'bg-yellow-100 dark:bg-yellow-950/60', text: 'text-yellow-600 dark:text-yellow-500' },
}

function fmt(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + ' M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

interface Props {
  clientes: Cliente[]
  listas: Lista[]
  selectedNIT: string | null
  infoNIT: string | null
  onSelectClient: (nit: string) => void
  onInfoClient: (nit: string) => void
  onClienteUpdate: (nit: string, changes: Partial<Cliente>) => void
  onListaCreada: (lista: Lista) => void
  onListaEliminada: (id: string) => void
}

export default function KanbanBoard({
  clientes, listas, selectedNIT, infoNIT, onSelectClient, onInfoClient, onClienteUpdate, onListaCreada, onListaEliminada,
}: Props) {
  const [movingNIT, setMovingNIT] = useState<string | null>(null)
  const [showNuevaLista, setShowNuevaLista] = useState(false)
  const [nuevaListaNombre, setNuevaListaNombre] = useState('')
  const [nuevaListaColor, setNuevaListaColor] = useState('#3b82f6')
  const [savingLista, setSavingLista] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b']

  // Agrupar clientes por lista
  const columns: { id: string; nombre: string; color: string; clientes: Cliente[] }[] = [
    {
      id: '',
      nombre: 'Sin clasificar',
      color: '#94a3b8',
      clientes: clientes.filter((c) => !c.listaId || !listas.find((l) => l.ID === c.listaId)),
    },
    ...listas.map((l) => ({
      id: l.ID,
      nombre: l.Nombre,
      color: l.Color || '#3b82f6',
      clientes: clientes.filter((c) => c.listaId === l.ID),
    })),
  ]

  async function moverCliente(nit: string, listaId: string) {
    setMovingNIT(null)
    onClienteUpdate(nit, { listaId })
    await fetch('/api/gestion-cartera/clientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit, listaId }),
    })
  }

  async function marcarContactado(nit: string, contactadoHoy: boolean) {
    onClienteUpdate(nit, { contactadoHoy: !contactadoHoy })
    await fetch('/api/gestion-cartera/clientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit, contactado: !contactadoHoy }),
    })
  }

  async function crearLista() {
    if (!nuevaListaNombre.trim() || savingLista) return
    setSavingLista(true)
    const res = await fetch('/api/gestion-cartera/listas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevaListaNombre.trim(), color: nuevaListaColor }),
    })
    if (res.ok) {
      // Reload listas
      const data = await fetch('/api/gestion-cartera/listas').then((r) => r.json())
      const nueva = (data.listas as Lista[]).find(
        (l) => l.Nombre === nuevaListaNombre.trim() && l.Color === nuevaListaColor
      )
      if (nueva) onListaCreada(nueva)
      setNuevaListaNombre('')
      setNuevaListaColor('#3b82f6')
      setShowNuevaLista(false)
    }
    setSavingLista(false)
  }

  async function eliminarLista(id: string) {
    setConfirmDeleteId(null)
    await fetch('/api/gestion-cartera/listas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    onListaEliminada(id)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-[var(--text-muted)]">
          {clientes.length} clientes · {clientes.filter(c=>c.contactadoHoy).length} contactados hoy
        </div>
        <button onClick={() => setShowNuevaLista(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)] transition-colors">
          + Nueva lista
        </button>
      </div>

      {/* Modal nueva lista */}
      {showNuevaLista && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNuevaLista(false)}>
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-semibold text-[var(--text)] mb-4">Nueva lista</div>
            <input type="text" value={nuevaListaNombre} onChange={(e) => setNuevaListaNombre(e.target.value)}
              placeholder="Nombre de la lista" autoFocus
              className="w-full text-[12px] px-3 py-2 rounded-[6px] border bg-[var(--bar-bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none mb-3"
              style={{ borderColor: 'var(--border)' }} />
            <div className="flex flex-wrap gap-2 mb-4">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setNuevaListaColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${nuevaListaColor === c ? 'ring-2 ring-offset-2 ring-[var(--text)]' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNuevaLista(false)}
                className="px-3 py-1.5 rounded-[6px] text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                Cancelar
              </button>
              <button onClick={crearLista} disabled={!nuevaListaNombre.trim() || savingLista}
                className="px-3 py-1.5 rounded-[6px] text-[11px] font-medium text-white disabled:opacity-40 transition-opacity"
                style={{ background: nuevaListaColor }}>
                {savingLista ? 'Creando...' : 'Crear lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-xl p-5 w-72" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-semibold text-[var(--text)] mb-2">¿Eliminar lista?</div>
            <div className="text-[12px] text-[var(--text-muted)] mb-4">Los clientes de esta lista pasarán a "Sin clasificar".</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1.5 rounded-[6px] text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">Cancelar</button>
              <button onClick={() => eliminarLista(confirmDeleteId)} className="px-3 py-1.5 rounded-[6px] text-[11px] font-medium bg-red-500 text-white hover:opacity-90">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-[270px] flex flex-col">
            {/* Column header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-[12px] font-semibold text-[var(--text)] truncate max-w-[160px]">{col.nombre}</span>
                <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bar-bg)] px-1.5 rounded-full">{col.clientes.length}</span>
              </div>
              {col.id && (
                <button onClick={() => setConfirmDeleteId(col.id)}
                  className="text-[var(--text-muted)] hover:text-red-400 text-[11px] px-1 transition-colors opacity-0 group-hover:opacity-100">
                  ×
                </button>
              )}
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1">
              {col.clientes.length === 0 && (
                <div className="rounded-[8px] border-2 border-dashed border-[var(--border)] p-4 text-center text-[11px] text-[var(--text-muted)]">
                  Vacía
                </div>
              )}
              {col.clientes.map((c) => {
                const bs = BUCKET_BADGE[c.bucket]
                const isSelected = selectedNIT === c.nit
                const isInfo = infoNIT === c.nit
                const isMoving = movingNIT === c.nit
                return (
                  <div key={c.nit}
                    className={`rounded-[8px] border bg-[var(--card)] p-3 cursor-pointer transition-all hover:shadow-md ${
                      isInfo ? 'ring-2 border-transparent' : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                    }`}
                    style={isInfo ? { '--tw-ring-color': col.color, borderColor: col.color } as React.CSSProperties : {}}
                    onClick={() => onInfoClient(c.nit)}>

                    {/* Card header */}
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-[var(--text)] truncate">{c.nombre}</div>
                        <div className="text-[10px] text-[var(--text-muted)] num">{c.nit}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {c.recordatoriosPendientes > 0 && (
                          <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                            {c.recordatoriosPendientes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Saldo */}
                    <div className="text-[15px] font-bold text-[var(--text)] num mb-2">{fmt(c.saldo)}</div>

                    {/* Bucket */}
                    {c.bucket && bs && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold mb-2 ${bs.bg} ${bs.text}`}>
                        {c.bucket}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                      {/* Marcar contactado */}
                      <button
                        onClick={() => marcarContactado(c.nit, c.contactadoHoy)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] font-medium transition-all flex-1 justify-center ${
                          c.contactadoHoy
                            ? 'bg-green-100 dark:bg-green-950/50 text-green-600 dark:text-green-400'
                            : 'bg-[var(--bar-bg)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]'
                        }`}>
                        {c.contactadoHoy ? '✓ Contactado' : 'Contactar'}
                      </button>

                      {/* Info de contacto */}
                      <button
                        onClick={() => onInfoClient(c.nit)}
                        className={`px-2 py-1 rounded-[5px] text-[10px] font-medium border transition-colors ${
                          isInfo
                            ? 'border-[#f59e0b] text-[#f59e0b] bg-amber-50 dark:bg-amber-950/30'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--bar-bg)]'
                        }`}
                        title="Ver información de contacto">
                        Info
                      </button>

                      {/* Notas */}
                      <button
                        onClick={() => onSelectClient(c.nit)}
                        className={`px-2 py-1 rounded-[5px] text-[10px] font-medium border transition-colors ${
                          isSelected
                            ? 'border-[var(--brand-blue)] text-[var(--brand-blue)] bg-blue-50 dark:bg-blue-950/30'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--bar-bg)]'
                        }`}
                        title="Ver notas y recordatorios">
                        Notas
                      </button>

                      {/* Mover */}
                      <div className="relative">
                        <button
                          onClick={() => setMovingNIT(isMoving ? null : c.nit)}
                          className="px-2 py-1 rounded-[5px] text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--bar-bg)] border border-[var(--border)] transition-colors"
                          title="Mover a lista">
                          ⇄
                        </button>
                        {isMoving && (
                          <div className="absolute right-0 top-full mt-1 z-20 rounded-[8px] border bg-[var(--card)] border-[var(--border)] shadow-xl py-1 w-44">
                            <div className="px-3 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Mover a</div>
                            {[{ id: '', nombre: 'Sin clasificar', color: '#94a3b8' }, ...listas.map(l=>({id:l.ID,nombre:l.Nombre,color:l.Color||'#3b82f6'}))].map((opt) => (
                              <button key={opt.id} onClick={() => moverCliente(c.nit, opt.id)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-[var(--bar-bg)] transition-colors text-left ${opt.id === c.listaId ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-sub)]'}`}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                                {opt.nombre}
                                {opt.id === c.listaId && <span className="ml-auto text-[var(--text-muted)]">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
