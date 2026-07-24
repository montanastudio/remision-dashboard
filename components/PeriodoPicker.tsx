'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { filtroLabel } from '@/lib/filtro-ventas'
import type { FiltroTipo } from '@/lib/filtro-ventas'
import { useEstadoDatos } from './EstadoDatosContext'

const MESES_FULL = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const OPCIONES: { id: FiltroTipo; label: string; sub: string }[] = [
  { id: 'actual', label: 'Período actual',     sub: 'Mes más reciente del historial' },
  { id: 'mes',    label: 'Por mes',             sub: 'Elige mes y año específico' },
  { id: 'año',    label: 'Por año',             sub: 'Ver todo el año completo' },
  { id: 'rango',  label: 'Por día / rango',     sub: 'Fechas específicas (desde–hasta)' },
  { id: 'todo',   label: 'Todo el historial',   sub: 'Sin filtro de fechas' },
]

export default function PeriodoPicker() {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const { fechaInfoISO } = useEstadoDatos()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Topes según el último día con datos (fecha de información).
  const maxYear  = fechaInfoISO ? parseInt(fechaInfoISO.slice(0, 4), 10) : new Date().getFullYear()
  const maxMonth = fechaInfoISO ? parseInt(fechaInfoISO.slice(5, 7), 10) : 12  // 1-based
  const AÑOS: string[] = Array.from({ length: maxYear - 2022 }, (_, i) => String(2023 + i))

  // ── Estado actual en la URL ──────────────────────────────────────────
  const urlFiltro = (searchParams.get('filtro') ?? 'actual') as FiltroTipo
  const urlM      = searchParams.get('m')     ?? ''
  const urlY      = searchParams.get('y')     ?? ''
  const urlDesde  = searchParams.get('desde') ?? ''
  const urlHasta  = searchParams.get('hasta') ?? ''

  // ── Borrador (draft) mientras el panel está abierto ──────────────────
  const [tipo,  setTipo]  = useState<FiltroTipo>(urlFiltro)
  const [mes,   setMes]   = useState(urlM)
  const [año,   setAño]   = useState(urlY || String(new Date().getFullYear()))
  const [desde, setDesde] = useState(urlDesde)
  const [hasta, setHasta] = useState(urlHasta)

  // Sincronizar borrador cuando cambia la URL (navegación con barra lateral)
  useEffect(() => {
    setTipo((searchParams.get('filtro') ?? 'actual') as FiltroTipo)
    setMes(searchParams.get('m')     ?? '')
    setAño(searchParams.get('y')     ?? String(new Date().getFullYear()))
    setDesde(searchParams.get('desde') ?? '')
    setHasta(searchParams.get('hasta') ?? '')
  }, [searchParams])

  // Cerrar al hacer click fuera del panel
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  // ── Aplicar filtro → actualizar URL ───────────────────────────────────
  function apply() {
    const p = new URLSearchParams()
    if (tipo !== 'actual') {
      p.set('filtro', tipo)
      if (tipo === 'mes')   { p.set('m', mes);  p.set('y', año) }
      if (tipo === 'año')   { p.set('y', año) }
      if (tipo === 'rango') { p.set('desde', desde); p.set('hasta', hasta) }
    }
    const qs = p.toString()
    router.push(pathname + (qs ? `?${qs}` : ''))
    setOpen(false)
  }

  // ── Limpiar filtro ────────────────────────────────────────────────────
  function clear() {
    setTipo('actual'); setMes(''); setDesde(''); setHasta('')
    router.push(pathname)
    setOpen(false)
  }

  const isFiltered   = urlFiltro !== 'actual'
  const currentLabel = filtroLabel({ filtro: urlFiltro, m: urlM, y: urlY, desde: urlDesde, hasta: urlHasta })

  // Deshabilitar botón Aplicar si falta info requerida
  const canApply =
    !(tipo === 'mes'   && (!mes  || !año)) &&
    !(tipo === 'rango' && (!desde || !hasta))

  return (
    <div ref={ref} className="relative">
      {/* ── Botón principal ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors bg-[#f1f5f9] dark:bg-[#1e2d47]"
        title={currentLabel}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={isFiltered ? '#2563eb' : '#475569'} strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8"  y1="2" x2="8"  y2="6" />
          <line x1="3"  y1="10" x2="21" y2="10" />
        </svg>
        {/* Punto azul si hay filtro activo */}
        {isFiltered && (
          <span className="absolute top-[6px] right-[6px] w-[6px] h-[6px] rounded-full bg-[#2563eb]" />
        )}
      </button>

      {/* ── Panel desplegable ── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[290px] max-w-[calc(100vw-2rem)] bg-[var(--card)] border border-[var(--border)] rounded-[14px] shadow-shell-day dark:shadow-shell-night z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <p className="text-[13px] font-bold text-[var(--text)]">Filtrar período</p>
            <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Opciones tipo radio */}
          <div className="p-2 space-y-0.5">
            {OPCIONES.map(opt => (
              <button
                key={opt.id}
                onClick={() => setTipo(opt.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[8px] transition-colors ${
                  tipo === opt.id ? 'bg-[var(--brand-blue)]/10' : 'hover:bg-[var(--nav-hover)]'
                }`}
              >
                {/* Radio circle */}
                <div
                  className="w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ borderColor: tipo === opt.id ? 'var(--brand-blue)' : 'var(--border)' }}
                >
                  {tipo === opt.id && (
                    <div className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--brand-blue)' }} />
                  )}
                </div>
                <div>
                  <div className={`text-[12px] font-medium leading-tight ${
                    tipo === opt.id ? 'text-[var(--brand-blue)]' : 'text-[var(--text)]'
                  }`}>{opt.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-[1px]">{opt.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Selectores condicionales ── */}
          {(tipo === 'mes' || tipo === 'año') && (
            <div className="px-4 pb-3 pt-1 flex gap-2">
              {tipo === 'mes' && (
                <select
                  value={mes}
                  onChange={e => setMes(e.target.value)}
                  className="flex-1 text-[12px] px-2 py-2 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--brand-blue)]"
                >
                  <option value="">Mes...</option>
                  {(parseInt(año, 10) >= maxYear ? MESES_FULL.slice(0, maxMonth) : MESES_FULL).map((m, i) => (
                    <option key={i} value={String(i + 1)}>{m}</option>
                  ))}
                </select>
              )}
              <select
                value={año}
                onChange={e => setAño(e.target.value)}
                className="flex-1 text-[12px] px-2 py-2 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--brand-blue)]"
              >
                {AÑOS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {tipo === 'rango' && (
            <div className="px-4 pb-3 pt-1 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Desde</label>
                <input
                  type="date"
                  value={desde}
                  max={fechaInfoISO ?? undefined}
                  onChange={e => setDesde(e.target.value)}
                  className="w-full text-[12px] px-2 py-2 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--brand-blue)]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={e => setHasta(e.target.value)}
                  min={desde}
                  max={fechaInfoISO ?? undefined}
                  className="w-full text-[12px] px-2 py-2 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--brand-blue)]"
                />
              </div>
            </div>
          )}

          {/* ── Botón aplicar ── */}
          <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] flex gap-2">
            {isFiltered && (
              <button
                onClick={clear}
                className="flex-1 py-2 rounded-[8px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                Limpiar
              </button>
            )}
            <button
              onClick={apply}
              disabled={!canApply}
              className="flex-1 py-2 rounded-[8px] text-[13px] font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--brand-blue)' }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
