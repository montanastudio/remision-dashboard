'use client'

import { Suspense, useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import DarkModeToggle from './DarkModeToggle'
import PeriodoPicker from './PeriodoPicker'
import { useSession } from 'next-auth/react'

interface TopBarProps {
  onMenuToggle?: () => void
}

const PAGE_TITLES: Record<string, string> = {
  '/resumen': 'Resumen Ejecutivo',
  '/ventas': 'Ventas',
  '/vendedores': 'Vendedores',
  '/clientes': 'Clientes',
  '/cartera': 'Cartera',
  '/inventario': 'Inventario',
  '/zona': 'Zonas',
  '/configuracion/usuarios': 'Usuarios',
  '/configuracion/permisos': 'Permisos',
  '/calculadora-precios': 'Calculadora de Precios',
  '/gestion-cartera': 'Gestión Cartera',
}

const PAGE_SUBS: Record<string, string> = {
  '/resumen': 'Vista general del negocio',
  '/ventas': 'Análisis de ventas por período',
  '/vendedores': 'Rendimiento del equipo comercial',
  '/clientes': 'Top clientes y detalle de compras',
  '/cartera': 'Gestión de cartera y antigüedad',
  '/inventario': 'Stock, rotación y movimientos',
  '/zona': 'Cobertura geográfica por zona',
  '/configuracion/usuarios': 'Gestión de acceso al sistema',
  '/configuracion/permisos': 'Control de acceso por rol',
  '/calculadora-precios': 'Simulador de márgenes y precios',
  '/gestion-cartera': 'Seguimiento y cobranza',
}

// Páginas donde el filtro de período es relevante (usan LS_VENTAS)
const FILTRO_PAGES = new Set(['/resumen', '/ventas', '/vendedores', '/clientes', '/zona'])

// Fallback estático mientras PeriodoPicker carga (Suspense)
function PeriodoPickerFallback() {
  return (
    <div className="flex items-center gap-2 px-2 md:px-3 py-[6px] rounded-pill border border-[var(--border)] bg-[var(--card)] text-[12px] font-medium text-[var(--text-sub)]">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8"  y1="2" x2="8"  y2="6" />
        <line x1="3"  y1="10" x2="21" y2="10" />
      </svg>
      <span>Período actual</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as { name?: string; initials?: string } | undefined

  const title = PAGE_TITLES[pathname] ?? 'Dashboard'
  const sub   = PAGE_SUBS[pathname]   ?? 'REMISION GROUP'
  const showFiltro = FILTRO_PAGES.has(pathname)

  // ── Estado del popup de última fecha ────────────────────────────────
  const [popupOpen,  setPopupOpen]  = useState(false)
  const [fechaData,  setFechaData]  = useState<{ fecha?: string; error?: string } | null>(null)
  const [loading,    setLoading]    = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopupOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  async function togglePopup() {
    if (popupOpen) { setPopupOpen(false); return }
    setPopupOpen(true)
    if (fechaData) return   // ya cargado, no re-fetch
    setLoading(true)
    try {
      const res  = await fetch('/api/ultima-fecha')
      const data = await res.json()
      setFechaData(data)
    } catch {
      setFechaData({ error: 'No se pudo conectar' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 md:px-6 py-[14px] md:py-[18px] border-b border-[var(--border)] bg-[var(--sidebar)] sticky top-0 z-20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden flex-shrink-0 p-1.5 rounded-nav text-[var(--text-sub)] hover:bg-[var(--nav-hover)] transition-colors"
          onClick={onMenuToggle}
          aria-label="Abrir menú"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="min-w-0">
          <h1 className="text-[18px] md:text-[22px] font-bold tracking-[-0.5px] text-[var(--text)] truncate">{title}</h1>
          <p className="text-[11px] md:text-[12px] text-[var(--text-sub)] mt-0.5 hidden sm:block">REMISION GROUP — {sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Selector de período — sólo en páginas con datos de ventas */}
        {showFiltro && (
          <Suspense fallback={<PeriodoPickerFallback />}>
            <PeriodoPicker />
          </Suspense>
        )}

        <DarkModeToggle />

        {/* Avatar con aro verde — clickeable, abre popup de estado */}
        <div ref={popupRef} className="relative">
          <button
            onClick={togglePopup}
            className="w-[32px] h-[32px] md:w-[34px] md:h-[34px] rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 transition-opacity hover:opacity-90"
            style={{
              background:  'linear-gradient(135deg, #d42020, #1a3a8f)',
              boxShadow:   '0 0 0 2px var(--sidebar), 0 0 0 4px #22c55e',
            }}
            aria-label="Estado del sistema"
          >
            {user?.initials ?? 'GM'}
          </button>

          {/* Popup */}
          {popupOpen && (
            <div className="absolute right-0 top-full mt-2 w-[230px] bg-[var(--card)] border border-[var(--border)] rounded-[12px] shadow-shell-day dark:shadow-shell-night z-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] flex-shrink-0" />
                <span className="text-[12px] font-semibold text-[var(--text)]">Datos en tiempo real</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-2 leading-relaxed">
                Los datos se leen directamente de Google Sheets cada vez que cargas la página.
              </p>
              <div className="border-t border-[var(--border)] pt-2 mt-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1">
                  Último registro en ventas
                </p>
                {loading ? (
                  <p className="text-[12px] text-[var(--text-muted)]">Consultando…</p>
                ) : fechaData?.fecha ? (
                  <p className="text-[13px] font-semibold text-[var(--text)]">{fechaData.fecha}</p>
                ) : (
                  <p className="text-[12px] text-[#ef4444]">{fechaData?.error ?? 'Sin datos'}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
