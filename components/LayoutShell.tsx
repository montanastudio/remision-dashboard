'use client'

import { useState } from 'react'
import SidebarNav from './SidebarNav'
import TopBar from './TopBar'

interface LayoutShellProps {
  children: React.ReactNode
  allowedSections: string[]
}

export default function LayoutShell({ children, allowedSections }: LayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* Backdrop solo en móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <SidebarNav
        isMobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        allowedSections={allowedSections}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 p-4 md:p-[16px_24px_24px] fade-in-up">
          {children}
        </main>
        <footer className="flex items-center justify-between px-4 md:px-6 py-[7px] border-t border-[var(--border)] bg-[var(--sidebar)]">
          <span className="text-[10.5px] text-[var(--text-muted)]">Montana · Dashboard Gerencial v1.0</span>
          <span className="text-[10.5px] text-[var(--text-muted)] hidden sm:block">REMISION GROUP</span>
        </footer>
      </div>
    </div>
  )
}
