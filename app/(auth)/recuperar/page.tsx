'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function RecuperarPage() {
  const router = useRouter()
  const [form, setForm] = useState({ usuario: '', codigoRecuperacion: '', nuevaContraseña: '', confirmar: '' })
  const [showCode, setShowCode] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.nuevaContraseña !== form.confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: form.usuario,
          codigoRecuperacion: form.codigoRecuperacion,
          nuevaContraseña: form.nuevaContraseña,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al restablecer'); return }
      setSuccess(true)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-shell shadow-shell-day dark:shadow-shell-night p-8">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <Image src="/logo.png" alt="Montana" width={40} height={40} className="rounded-xl" />
          <div>
            <div className="text-[16px] font-bold text-[var(--text)]">Montana</div>
            <div className="text-[11px] text-[var(--text-muted)]">REMISION GROUP</div>
          </div>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#22c55e20] flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[var(--text)]">Contraseña restablecida</p>
            <p className="text-[12px] text-[var(--text-muted)]">Ya puedes ingresar con tu nueva contraseña.</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 rounded-nav text-[13px] font-semibold text-white transition-opacity"
              style={{ background: 'var(--brand-blue)' }}
            >
              Ir al login
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-[15px] font-bold text-[var(--text)]">Restablecer contraseña</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">
                Ingresa tu usuario y el código de recuperación que te entregó el administrador del sistema.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Usuario */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Usuario</label>
                <input
                  name="usuario"
                  type="text"
                  placeholder="Tu nombre de usuario"
                  value={form.usuario}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2.5 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                />
              </div>

              {/* Código de recuperación */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Código de recuperación</label>
                <div className="relative">
                  <input
                    name="codigoRecuperacion"
                    type={showCode ? 'text' : 'password'}
                    placeholder="Código entregado por el administrador"
                    value={form.codigoRecuperacion}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2.5 pr-10 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowCode(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                    {showCode
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              {/* Nueva contraseña */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Nueva contraseña</label>
                <div className="relative">
                  <input
                    name="nuevaContraseña"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={form.nuevaContraseña}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full px-3 py-2.5 pr-10 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              {/* Confirmar */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Confirmar contraseña</label>
                <input
                  name="confirmar"
                  type="password"
                  placeholder="Repite la nueva contraseña"
                  value={form.confirmar}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2.5 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                />
              </div>

              {error && (
                <p className="text-[12px] text-[#ef4444] bg-[#ef444415] px-3 py-2 rounded-nav">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-nav text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--brand-blue)' }}
              >
                {loading ? 'Restableciendo...' : 'Restablecer contraseña'}
              </button>

              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                ← Volver al login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
