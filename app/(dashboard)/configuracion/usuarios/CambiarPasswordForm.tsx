'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CambiarPasswordForm({ usuario, nombre }: { usuario: string; nombre: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ nuevaContraseña: '', confirmar: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.nuevaContraseña !== form.confirmar) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, nuevaContraseña: form.nuevaContraseña }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al cambiar contraseña'); return }
      setOk(true)
      setTimeout(() => { setOpen(false); setOk(false); setForm({ nuevaContraseña: '', confirmar: '' }); router.refresh() }, 1500)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Cambiar contraseña"
        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--brand-blue)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-shell shadow-shell-day dark:shadow-shell-night">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div>
                <p className="text-[15px] font-bold text-[var(--text)]">Cambiar contraseña</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{nombre} · <span className="font-mono">{usuario}</span></p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {ok ? (
                <div className="flex items-center gap-2 text-[#22c55e] text-[13px] font-medium py-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Contraseña actualizada correctamente
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Nueva contraseña</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={form.nuevaContraseña}
                        onChange={e => setForm(p => ({ ...p, nuevaContraseña: e.target.value }))}
                        required minLength={6}
                        className="w-full px-3 py-2 pr-10 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                      />
                      <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                        {showPass
                          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Confirmar contraseña</label>
                    <input
                      type="password"
                      placeholder="Repite la nueva contraseña"
                      value={form.confirmar}
                      onChange={e => setForm(p => ({ ...p, confirmar: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                    />
                  </div>

                  {error && <p className="text-[12px] text-[#ef4444] bg-[#ef444415] px-3 py-2 rounded-nav">{error}</p>}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setOpen(false)}
                      className="flex-1 py-2 rounded-nav border border-[var(--border)] text-[13px] text-[var(--text-sub)] hover:bg-[var(--nav-hover)] transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-1 py-2 rounded-nav text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                      style={{ background: 'var(--brand-blue)' }}>
                      {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
