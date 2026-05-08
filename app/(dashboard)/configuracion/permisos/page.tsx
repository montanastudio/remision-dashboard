'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import {
  SECTIONS, SECTION_LABELS, DEFAULT_PERMISSIONS, NEW_ROLE_DEFAULTS, LOCKED_ROLES,
  type AllPerms,
} from '@/lib/permissions-config'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function PermisosPage() {
  const [perms, setPerms] = useState<AllPerms>(DEFAULT_PERMISSIONS)
  const [roles, setRoles] = useState<string[]>(['Administrador', 'Gerencia', 'Ventas'])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewRol, setShowNewRol] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/permisos')
      .then((r) => r.json())
      .then((d) => {
        if (d.perms) setPerms(d.perms)
        if (d.roles) setRoles(d.roles)
      })
  }, [])

  async function save(next: AllPerms) {
    setSaveState('saving')
    try {
      const res = await fetch('/api/permisos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perms: next }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
    setTimeout(() => setSaveState('idle'), 2000)
  }

  function toggle(rol: string, section: string) {
    if (LOCKED_ROLES.includes(rol)) return
    const prev = perms[rol] ?? {}
    const next: AllPerms = {
      ...perms,
      [rol]: { ...prev, [section as keyof typeof prev]: !(prev as Record<string, boolean>)[section] },
    }
    setPerms(next)
    save(next)
  }

  async function createRole() {
    const name = newRoleName.trim()
    if (!name || roles.includes(name)) return
    setCreating(true)
    const next: AllPerms = { ...perms, [name]: { ...NEW_ROLE_DEFAULTS } }
    const nextRoles = [...roles, name]
    setPerms(next)
    setRoles(nextRoles)
    setNewRoleName('')
    setShowNewRol(false)
    await save(next)
    setCreating(false)
  }

  function deleteRole(rol: string) {
    if (LOCKED_ROLES.includes(rol)) return
    const next = { ...perms }
    delete next[rol]
    const nextRoles = roles.filter((r) => r !== rol)
    setPerms(next)
    setRoles(nextRoles)
    save(next)
  }

  const roleColor: Record<string, string> = {
    Administrador: '#1a3a8f',
    Gerencia: '#f59e0b',
    Ventas: '#22c55e',
  }
  function getRoleColor(rol: string) {
    return roleColor[rol] ?? '#60a5fa'
  }

  return (
    <div className="fade-in-up max-w-4xl">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Control de acceso
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[var(--text-sub)]">
          Define qué secciones puede ver cada rol. El Administrador siempre tiene acceso total.
        </p>
        <div className="flex items-center gap-3">
          <span className={`text-[12px] font-medium transition-opacity ${saveState === 'idle' ? 'opacity-0' : 'opacity-100'} ${
            saveState === 'saved' ? 'text-[#22c55e]' : saveState === 'error' ? 'text-[#ef4444]' : 'text-[var(--text-muted)]'
          }`}>
            {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? '✓ Guardado' : saveState === 'error' ? 'Error' : ''}
          </span>
          <button
            onClick={() => setShowNewRol(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-nav text-[12px] font-semibold text-white"
            style={{ background: 'var(--brand-blue)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo rol
          </button>
        </div>
      </div>

      <Card title="Permisos por rol" subtitle="cambios se guardan automáticamente">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className="text-left pb-3 pr-4 text-[var(--text-sub)] font-semibold w-36">Rol</th>
                {SECTIONS.map((s) => (
                  <th key={s} className="pb-3 px-2 text-center text-[var(--text-sub)] font-medium min-w-[76px]">
                    {SECTION_LABELS[s]}
                  </th>
                ))}
                <th className="pb-3 pl-4 w-8" />
              </tr>
            </thead>
            <tbody>
              {roles.map((rol) => {
                const locked = LOCKED_ROLES.includes(rol)
                return (
                  <tr key={rol} className="border-t border-[var(--border)] group">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: getRoleColor(rol) }}
                        >
                          {rol[0]}
                        </div>
                        <span className="font-medium text-[var(--text)] whitespace-nowrap">{rol}</span>
                      </div>
                    </td>
                    {SECTIONS.map((s) => {
                      const allowed = perms[rol]?.[s] ?? DEFAULT_PERMISSIONS[rol]?.[s] ?? false
                      return (
                        <td key={s} className="py-3 px-2 text-center">
                          <button
                            onClick={() => toggle(rol, s)}
                            disabled={locked}
                            title={locked ? 'El Administrador siempre tiene acceso total' : allowed ? 'Quitar acceso' : 'Dar acceso'}
                            className={`w-10 h-6 rounded-full relative transition-colors focus:outline-none ${
                              locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            } ${allowed ? 'bg-[var(--brand-blue)]' : 'bg-[var(--bar-bg)] border border-[var(--border)]'}`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${allowed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                      )
                    })}
                    <td className="py-3 pl-4 text-right">
                      {!locked && (
                        <button
                          onClick={() => deleteRole(rol)}
                          className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[#ef4444] transition-all"
                          title={`Eliminar rol ${rol}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* New role inline form */}
              {showNewRol && (
                <tr className="border-t border-[var(--border)] bg-[var(--bar-bg)]">
                  <td className="py-3 pr-4">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nombre del rol"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createRole(); if (e.key === 'Escape') setShowNewRol(false) }}
                      className="w-full px-2 py-1 rounded-nav border border-[var(--brand-blue)] bg-[var(--bg)] text-[12px] text-[var(--text)] outline-none"
                    />
                  </td>
                  {SECTIONS.map((s) => (
                    <td key={s} className="py-3 px-2 text-center">
                      <div className="w-10 h-6 rounded-full bg-[var(--bar-bg)] border border-[var(--border)] relative opacity-40">
                        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow" />
                      </div>
                    </td>
                  ))}
                  <td className="py-3 pl-4">
                    <div className="flex gap-1">
                      <button
                        onClick={createRole}
                        disabled={!newRoleName.trim() || creating}
                        className="px-2 py-1 rounded-nav text-[11px] font-semibold text-white disabled:opacity-40"
                        style={{ background: 'var(--brand-blue)' }}
                      >
                        {creating ? '…' : 'Crear'}
                      </button>
                      <button
                        onClick={() => { setShowNewRol(false); setNewRoleName('') }}
                        className="px-2 py-1 rounded-nav text-[11px] text-[var(--text-muted)] hover:bg-[var(--nav-hover)]"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 px-4 py-3 rounded-nav border border-[var(--border)] bg-[var(--bar-bg)]">
        <p className="text-[11px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-sub)]">Nota:</span> Los roles y permisos se guardan en{' '}
          <span className="font-mono">LS_Permisos</span>. Los nuevos roles empiezan con acceso a Resumen, Ventas,
          Vendedores y Clientes. Los permisos se aplican inmediatamente al iniciar sesión.
        </p>
      </div>
    </div>
  )
}
