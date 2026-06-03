'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import KanbanBoard, { type Cliente, type Lista } from './KanbanBoard'
import NotasPanel from './NotasPanel'
import InfoClientePanel from './InfoClientePanel'
import SupervisionView from './SupervisionView'
import KanbanFilters, { type Filters, FILTERS_EMPTY, applyFilters } from './KanbanFilters'

interface Props {
  initialClientes: Cliente[]
  initialListas: Lista[]
  initialVendedores: string[]
  isSupervision: boolean
  userName: string
  role: string
}

export default function GestionCarteraClient({
  initialClientes, initialListas, initialVendedores, isSupervision, role,
}: Props) {
  const [clientes,   setClientes]   = useState<Cliente[]>(initialClientes)
  const [listas,     setListas]     = useState<Lista[]>(initialListas)
  const [vendedores, setVendedores] = useState<string[]>(initialVendedores)
  const [filters,    setFilters]    = useState<Filters>(FILTERS_EMPTY)
  const [selectedNIT, setSelectedNIT] = useState<string | null>(null)
  const [infoNIT,     setInfoNIT]     = useState<string | null>(null)
  const [view,        setView]        = useState<'kanban' | 'supervision'>('kanban')
  const [refreshing,  setRefreshing]  = useState(false)

  useEffect(() => {
    fetch('/api/gestion-cartera/listas')
      .then((r) => r.json())
      .then((d) => { if (d.listas?.length > 0) setListas(d.listas) })
      .catch(() => {})
  }, [])

  const filteredClientes = useMemo(() => applyFilters(clientes, filters), [clientes, filters])
  const selectedCliente  = clientes.find((c) => c.nit === selectedNIT) ?? null

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await fetch('/api/gestion-cartera/clientes').then((r) => r.json())
      setClientes(data.clientes ?? [])
      if (data.vendedores?.length) setVendedores(data.vendedores)
    } finally {
      setRefreshing(false)
    }
  }, [])

  function handleSelectClient(nit: string) {
    setSelectedNIT((prev) => (prev === nit ? null : nit))
    setInfoNIT(null)
  }

  function handleInfoClient(nit: string) {
    setInfoNIT((prev) => (prev === nit ? null : nit))
    setSelectedNIT(null)
  }

  function handleClienteUpdate(nit: string, changes: Partial<Cliente>) {
    setClientes((prev) => prev.map((c) => c.nit === nit ? { ...c, ...changes } : c))
  }

  function handleListaCreada(lista: Lista) {
    setListas((prev) => [...prev, lista])
  }

  function handleListaEliminada(id: string) {
    setListas((prev) => prev.filter((l) => l.ID !== id))
    setClientes((prev) => prev.map((c) => c.listaId === id ? { ...c, listaId: '' } : c))
  }

  const contactadosHoy = clientes.filter((c) => c.contactadoHoy).length
  const recPendientes  = clientes.reduce((s, c) => s + c.recordatoriosPendientes, 0)

  return (
    <div className="fade-in-up">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--text)] leading-tight">Gestión Cartera</h1>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-muted)]">
            <span><span className="font-semibold text-[var(--text-sub)]">{clientes.length}</span> clientes activos</span>
            <span className="text-[var(--border)]">·</span>
            <span><span className="font-semibold text-green-500">{contactadosHoy}</span> contactados hoy</span>
            {recPendientes > 0 && (
              <>
                <span className="text-[var(--border)]">·</span>
                <span><span className="font-semibold text-red-500">{recPendientes}</span> recordatorios vencidos</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={refreshing}
            className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)] transition-colors disabled:opacity-40"
            title="Actualizar datos">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={refreshing ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </button>
          {isSupervision && (
            <div className="flex rounded-[6px] border border-[var(--border)] overflow-hidden">
              {(['kanban', 'supervision'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    view === v
                      ? 'bg-[var(--brand-blue)] text-white'
                      : 'text-[var(--text-sub)] hover:bg-[var(--bar-bg)]'
                  }`}>
                  {v === 'kanban' ? 'Tablero' : 'Supervisión'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === 'supervision' && isSupervision ? (
        <SupervisionView clientes={clientes} />
      ) : (
        <>
          {/* Filtros */}
          <KanbanFilters
            filters={filters}
            onChange={setFilters}
            vendedores={vendedores}
            totalClientes={clientes.length}
            filteredCount={filteredClientes.length}
          />

          {/* Kanban */}
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-4">
            <KanbanBoard
              clientes={filteredClientes}
              listas={listas}
              selectedNIT={selectedNIT}
              infoNIT={infoNIT}
              onSelectClient={handleSelectClient}
              onInfoClient={handleInfoClient}
              onClienteUpdate={handleClienteUpdate}
              onListaCreada={handleListaCreada}
              onListaEliminada={handleListaEliminada}
            />
          </div>

          {/* Botón setup (solo Admin) */}
          {role === 'Administrador' && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <details className="group">
                <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text)] transition-colors list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                  Configuración del segundo Google Sheet
                </summary>
                <div className="mt-3 p-4 rounded-[8px] bg-[var(--bar-bg)] text-[12px] space-y-2">
                  <p className="text-[var(--text-sub)]">
                    Agrega <code className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[11px]">GOOGLE_SHEETS_ID_CARTERA=&lt;id&gt;</code> en <code className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[11px]">.env.local</code> y comparte la hoja con la cuenta de servicio. Luego ejecuta el setup una vez.
                  </p>
                  <button
                    onClick={async () => {
                      const r = await fetch('/api/gestion-cartera/setup', { method: 'POST' })
                      const d = await r.json()
                      alert(JSON.stringify(d.results, null, 2))
                    }}
                    className="px-3 py-1.5 rounded-[6px] text-[11px] font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors">
                    Ejecutar setup de hojas
                  </button>
                </div>
              </details>
            </div>
          )}
        </>
      )}

      {/* Panel info de contacto */}
      {infoNIT && (() => {
        const c = clientes.find((cl) => cl.nit === infoNIT)
        if (!c) return null
        return <InfoClientePanel nit={c.nit} nombre={c.nombre} onClose={() => setInfoNIT(null)} />
      })()}

      {/* Drawer de notas — renderizado en body para escapar el transform de fade-in-up */}
      {selectedCliente && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
            onClick={() => setSelectedNIT(null)}
          />
          {/* Panel */}
          <div
            className="fixed top-0 right-0 bottom-0 z-50 w-[420px] max-w-[95vw] flex flex-col shadow-2xl"
            style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}
          >
            <NotasPanel
              key={selectedCliente.nit}
              nit={selectedCliente.nit}
              nombre={selectedCliente.nombre}
              saldo={selectedCliente.saldo}
              onClose={() => setSelectedNIT(null)}
            />
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
