'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }

export interface FacturaInfo {
  numero: string
  nit: string
  cliente: string
  vendedor?: string
  fechaFactura?: string
  fechaVence?: string
  dias?: number
  bucket?: string
  total?: number
  abonado?: number
  saldo?: number
}

export interface AbonoInfo {
  recibo: string
  fechaPago: string
  monto: number
}

interface Props {
  factura: FacturaInfo | null
  abonos: AbonoInfo[]
  onClose: () => void
}

/**
 * Modal con el detalle de una factura y sus abonos. Se renderiza en un portal
 * a document.body porque el contenedor donde se dispara (fichas con overflow
 * o animaciones fade-in-up) puede crear un containing block propio y romper
 * position:fixed — ver el mismo problema resuelto antes en InventarioSaldos.
 */
export default function FacturaPopup({ factura, abonos, onClose }: Props) {
  useEffect(() => {
    if (!factura) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [factura, onClose])

  if (!factura || typeof document === 'undefined') return null

  const totalAbonado = abonos.reduce((s, a) => s + a.monto, 0)
  const saldo = factura.saldo ?? (factura.total != null ? factura.total - totalAbonado : undefined)

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
      className="flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] max-h-[85vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-[14px] shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3 sticky top-0 bg-[var(--card)] z-10">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-0.5">Factura</div>
            <div className="text-[16px] font-bold text-[var(--text)] num truncate">{factura.numero}</div>
            <div className="text-[12px] text-[var(--text-sub)] truncate">{factura.cliente}</div>
            <div className="text-[10px] text-[var(--text-muted)] num">{factura.nit}</div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)] transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Info de la factura */}
        <div className="px-5 py-4 border-b border-[var(--border)] grid grid-cols-2 gap-3">
          {factura.vendedor && (
            <div className="col-span-2">
              <div className="text-[10px] text-[var(--text-muted)]">Vendedor</div>
              <div className="text-[12px] font-medium text-[var(--text)]">{factura.vendedor}</div>
            </div>
          )}
          {factura.fechaFactura && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">Fecha Factura</div>
              <div className="text-[12px] font-medium text-[var(--text)] num">{factura.fechaFactura}</div>
            </div>
          )}
          {factura.fechaVence && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">Fecha Vence</div>
              <div className="text-[12px] font-medium text-[var(--text)] num">{factura.fechaVence}</div>
            </div>
          )}
          {factura.bucket && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">Estado</div>
              <div className="text-[12px] font-medium text-[var(--text)]">{factura.bucket}</div>
            </div>
          )}
          {factura.dias != null && factura.dias > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">Días vencido</div>
              <div className="text-[12px] font-medium text-[#ef4444] num">{factura.dias}</div>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="px-5 py-4 border-b border-[var(--border)] grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] text-[var(--text-muted)]">Total</div>
            <div className="text-[13px] font-bold text-[var(--text)] num">{factura.total != null ? fmt(factura.total) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)]">Abonado</div>
            <div className="text-[13px] font-bold text-[#22c55e] num">{fmt(totalAbonado)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)]">Saldo</div>
            <div className={`text-[13px] font-bold num ${saldo != null && saldo > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
              {saldo != null ? fmt(saldo) : '—'}
            </div>
          </div>
        </div>

        {/* Lista de abonos */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2.5">
            Abonos · {abonos.length}
          </div>
          {abonos.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">
              No hay abonos registrados para esta factura
            </div>
          ) : (
            <div className="space-y-1.5">
              {abonos
                .slice()
                .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago))
                .map((a, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] bg-[var(--bar-bg)]">
                    <div className="w-6 h-6 rounded-full bg-[var(--brand-blue)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-[var(--text)] truncate">{a.recibo || 'Recibo'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] num">{a.fechaPago}</div>
                    </div>
                    <div className="text-[12px] font-semibold text-[#22c55e] num flex-shrink-0">{fmt(a.monto)}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
