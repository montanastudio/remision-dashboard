'use client'

import { useMemo, useState } from 'react'
import { fmt } from '@/lib/format'

interface CiudadCubierta {
  nombre: string
  valor: number
  unidades: number
}

interface CiudadFaltante {
  nombre: string
  poblacion: number
  departamento: string
}

interface Props {
  tipo: 'cubiertas' | 'faltantes'
  zonaLabel: string
  zonaColor: string
  ciudadesCubiertas: CiudadCubierta[]
  ciudadesFaltantes: CiudadFaltante[]
  onClose: () => void
}

export type { CiudadCubierta, CiudadFaltante }

export default function CiudadesModal({
  tipo, zonaLabel, zonaColor, ciudadesCubiertas, ciudadesFaltantes, onClose,
}: Props) {
  const [busqueda, setBusqueda] = useState('')

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase()
    if (tipo === 'cubiertas') {
      return ciudadesCubiertas
        .filter(c => c.nombre.toLowerCase().includes(q))
    } else {
      return ciudadesFaltantes
        .filter(c => c.nombre.toLowerCase().includes(q) || c.departamento.toLowerCase().includes(q))
    }
  }, [tipo, busqueda, ciudadesCubiertas, ciudadesFaltantes])

  const titulo  = tipo === 'cubiertas' ? 'Ciudades Cubiertas' : 'Ciudades Faltantes'
  const subtipo = tipo === 'cubiertas'
    ? `${ciudadesCubiertas.length} ciudades · ordenadas por ventas`
    : `${ciudadesFaltantes.length} ciudades · ordenadas por población`

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: zonaColor }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: zonaColor }}>
                {zonaLabel}
              </span>
            </div>
            <h2 className="text-[16px] font-bold text-[var(--text)]">{titulo}</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtipo}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center text-[14px] flex-shrink-0 mt-1"
          >✕</button>
        </div>

        {/* Buscador */}
        <div className="px-5 pb-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Buscar ciudad..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--text-muted)] transition-colors"
          />
        </div>

        {/* Encabezado columnas */}
        <div className="flex items-center px-5 pb-2 flex-shrink-0 border-b border-[var(--border)]">
          {tipo === 'cubiertas' ? (
            <>
              <span className="flex-1 text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Ciudad</span>
              <span className="w-28 text-right text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Ventas $</span>
              <span className="w-16 text-right text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Unidades</span>
            </>
          ) : (
            <>
              <span className="flex-1 text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Ciudad</span>
              <span className="hidden sm:inline w-36 text-right text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Departamento</span>
              <span className="w-24 text-right text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Población</span>
            </>
          )}
        </div>

        {/* Lista scrollable */}
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-[var(--text-muted)]">
              No se encontraron ciudades
            </div>
          ) : tipo === 'cubiertas' ? (
            (lista as CiudadCubierta[]).map((c, i) => (
              <div
                key={i}
                className="flex items-center px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--text)] truncate">{c.nombre}</div>
                  {/* mini barra proporcional al top */}
                  <div className="mt-1 h-0.5 rounded-full bg-[var(--bar-bg)] w-24 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ciudadesCubiertas[0]?.valor > 0 ? (c.valor / ciudadesCubiertas[0].valor) * 100 : 0}%`,
                        background: zonaColor,
                      }}
                    />
                  </div>
                </div>
                <span className="w-28 text-right text-[12px] font-semibold text-[#22c55e] tabular-nums">
                  {fmt(c.valor)}
                </span>
                <span className="w-16 text-right text-[11px] text-[var(--text-sub)] tabular-nums">
                  {c.unidades.toLocaleString('es-CO')}
                </span>
              </div>
            ))
          ) : (
            (lista as CiudadFaltante[]).map((c, i) => (
              <div
                key={i}
                className="flex items-center px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--text)] break-words">{c.nombre}</div>
                  <div className="text-[10px] text-[var(--text-muted)] sm:hidden">{c.departamento}</div>
                </div>
                <span className="hidden sm:inline w-36 text-right text-[11px] text-[var(--text-muted)] truncate">{c.departamento}</span>
                <span className="w-24 text-right text-[11px] font-medium text-[var(--text-sub)] tabular-nums">
                  {c.poblacion.toLocaleString('es-CO')}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">
            {lista.length} de {tipo === 'cubiertas' ? ciudadesCubiertas.length : ciudadesFaltantes.length} resultados
          </span>
          <button
            onClick={onClose}
            className="text-[11px] font-semibold px-4 py-1.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
