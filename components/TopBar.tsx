'use client'

import { Suspense } from 'react'
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
}

// Páginas donde el filtro de período es relevante (usan LS_VENTAS)
const FILTRO_PAGES = new Set(['/resumen', '/ventas', '/vendedores', '/clientes', '/zona'])

// Fallback estático mientras PeriodoPicker carga (Suspense)
function PeriodoPickerFallback() {
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-[6px] rounded-pill border border-[var(--border)] bg-[var(--card)] text-[12px] font-medium text-[var(--text-sub)]">
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

        {/* Estado En línea */}
        <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#22c55e]">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] inline-block" />
          En línea
        </div>

        <DarkModeToggle />

        {/* Avatar */}
        <div
          className="w-[32px] h-[32px] md:w-[34px] md:h-[34px] rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #d42020, #1a3a8f)' }}
        >
          {user?.initials ?? 'GM'}
        </div>
      </div>
    </div>
  )
}
