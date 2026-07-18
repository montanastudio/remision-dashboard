'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
// usePathname is used inside NavLinks
import { signOut, useSession } from 'next-auth/react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  section: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

interface SidebarNavProps {
  isMobileOpen?: boolean
  onClose?: () => void
  allowedSections?: string[]
}

const sections: NavSection[] = [
  {
    label: 'Principal',
    items: [
      {
        href: '/resumen',
        section: 'resumen',
        label: 'Resumen Ejecutivo',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      {
        href: '/ventas',
        section: 'ventas',
        label: 'Ventas',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        ),
      },
      {
        href: '/vendedores',
        section: 'vendedores',
        label: 'Vendedores',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        ),
      },
      {
        href: '/clientes',
        section: 'clientes',
        label: 'Clientes',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ),
      },
      {
        href: '/zona',
        section: 'zona',
        label: 'Zonas',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Financiero',
    items: [
      {
        href: '/cartera',
        section: 'cartera',
        label: 'Cartera',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        ),
      },
      {
        href: '/recaudos',
        section: 'recaudos',
        label: 'Recaudos',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 12V8H6a2 2 0 010-4h12v4" />
            <path d="M4 6v12a2 2 0 002 2h14v-4" />
            <path d="M18 12a2 2 0 000 4h4v-4Z" />
          </svg>
        ),
      },
      {
        href: '/gestion-cartera',
        section: 'gestion_cartera',
        label: 'Gestión Cartera',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
            <path d="M7 10h2l2 4 2-8 2 4h2" />
          </svg>
        ),
      },
      {
        href: '/inventario',
        section: 'inventario',
        label: 'Inventario',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      {
        href: '/calculadora-precios',
        section: 'calculadora_precios',
        label: 'Calculadora Precios',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="10" y2="10" />
            <line x1="14" y1="10" x2="16" y2="10" />
            <line x1="8" y1="14" x2="10" y2="14" />
            <line x1="14" y1="14" x2="16" y2="14" />
            <line x1="8" y1="18" x2="10" y2="18" />
            <line x1="14" y1="18" x2="16" y2="18" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        href: '/configuracion/usuarios',
        section: 'configuracion',
        label: 'Usuarios',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            <line x1="19" y1="8" x2="23" y2="8" />
            <line x1="21" y1="6" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        href: '/configuracion/permisos',
        section: 'configuracion',
        label: 'Permisos',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        ),
      },
    ],
  },
]

// Páginas que leen el filtro de período desde URL params
const FILTRO_PAGES = new Set(['/resumen', '/ventas', '/vendedores', '/clientes', '/zona', '/recaudos'])

/** Inner component que usa useSearchParams para preservar el filtro al navegar */
function NavLinks({
  sections: navSections,
  allowedSections,
  onClose,
}: {
  sections: NavSection[]
  allowedSections?: string[]
  onClose?: () => void
}) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // Reconstruir query string del filtro activo (si aplica a la página destino)
  const filterQS = (() => {
    const filtro = searchParams.get('filtro')
    if (!filtro || filtro === 'actual') return ''
    const p = new URLSearchParams()
    p.set('filtro', filtro)
    ;['m', 'y', 'desde', 'hasta'].forEach(k => {
      const v = searchParams.get(k)
      if (v) p.set(k, v)
    })
    return p.toString()
  })()

  return (
    <>
      {navSections.map(section => (
        <div key={section.label}>
          <div className="px-2 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
            {section.label}
          </div>
          {section.items
            .filter(item => !allowedSections || allowedSections.includes(item.section))
            .map(item => {
              const isActive = pathname === item.href
              // Preservar filtro sólo en páginas que lo soportan
              const href = FILTRO_PAGES.has(item.href) && filterQS
                ? `${item.href}?${filterQS}`
                : item.href
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-[10px] px-3 py-[9px] my-[1px] rounded-nav text-[13px] transition-all ${
                    isActive
                      ? 'bg-[var(--brand-blue)] text-white font-semibold'
                      : 'text-[var(--text-sub)] hover:bg-[var(--nav-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
        </div>
      ))}
    </>
  )
}

export default function SidebarNav({ isMobileOpen = false, onClose, allowedSections }: SidebarNavProps) {
  const { data: session } = useSession()

  const user = session?.user as { name?: string; role?: string; initials?: string } | undefined

  return (
    <div
      className={[
        'flex flex-col flex-shrink-0 bg-[var(--sidebar)] border-r border-[var(--border)] transition-all duration-300',
        'fixed inset-y-0 left-0 z-40',
        'md:relative md:z-auto md:translate-x-0',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
      style={{ width: 220, height: '100%' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 p-[16px_20px] border-b border-[var(--border)] cursor-pointer"
        onClick={() => onClose?.()}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #d42020, #1a3a8f)' }}
        >
          <Image src="/logo-blanco.png" alt="Montana" width={29} height={29} className="object-contain" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold text-[var(--text)] leading-tight">Montana</span>
          <span className="text-[10px] text-[var(--text-muted)] leading-tight">Gerencia</span>
        </div>
      </div>

      {/* Nav — usa Suspense porque NavLinks lee useSearchParams */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <Suspense fallback={
          <div className="space-y-0.5">
            {sections.map(s => s.items).flat()
              .filter(item => !allowedSections || allowedSections.includes(item.section))
              .map(item => (
                <Link key={item.href} href={item.href} onClick={onClose}
                  className="flex items-center gap-[10px] px-3 py-[9px] my-[1px] rounded-nav text-[13px] text-[var(--text-sub)] hover:bg-[var(--nav-hover)]">
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              ))
            }
          </div>
        }>
          <NavLinks sections={sections} allowedSections={allowedSections} onClose={onClose} />
        </Suspense>
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #d42020, #1a3a8f)' }}
          >
            {user?.initials ?? 'GM'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[var(--text)] truncate">{user?.name ?? 'Usuario'}</div>
            <div className="text-[11px] text-[var(--text-sub)] truncate">{user?.role ?? ''}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-[11px] text-[var(--text-muted)] hover:text-[#ef4444] px-2 py-1 rounded transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
