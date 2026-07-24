'use client'

import { useState } from 'react'
import { useEstadoDatos } from './EstadoDatosContext'

/**
 * Popup que aparece al abrir/refrescar el dashboard e informa hasta qué fecha
 * hay datos (fecha de información) y cuándo se actualizó por última vez el sheet
 * (fecha de actualización) — dos cosas distintas. Se monta en el layout, así que
 * aparece una vez por carga de página; la navegación entre secciones no lo repite.
 */
export default function AvisoFechaDatos() {
  const { loading, fechaInfoLabel, actualizadoLabel } = useEstadoDatos()
  const [dismissed, setDismissed] = useState(false)

  if (loading || dismissed || !fechaInfoLabel) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      onClick={() => setDismissed(true)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[380px] bg-[var(--card)] border border-[var(--border)] rounded-[16px] shadow-2xl p-6"
        style={{ animation: 'fadeInUp 0.3s ease both' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] flex-shrink-0" />
          <span className="text-[13px] font-bold text-[var(--text)]">Estado de los datos</span>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-[10px] bg-[var(--bar-bg)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">📅 Información hasta</div>
            <div className="text-[16px] font-bold text-[var(--text)] leading-tight">{fechaInfoLabel}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">Último día con transacciones registradas</div>
          </div>

          {actualizadoLabel && (
            <div className="rounded-[10px] bg-[var(--bar-bg)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">🔄 Última actualización</div>
              <div className="text-[14px] font-semibold text-[var(--text)] leading-tight">{actualizadoLabel}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">Cuándo se cargaron los datos al sistema</div>
            </div>
          )}
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="w-full mt-4 py-2.5 rounded-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--brand-blue)' }}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
