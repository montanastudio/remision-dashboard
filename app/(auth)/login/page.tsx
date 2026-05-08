'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.ok) {
      router.push('/')
    } else {
      setError('Usuario o contraseña incorrectos')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div
        className="w-[380px] rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-[48px_40px] shadow-[0_8px_40px_rgba(0,0,0,.12)]"
        style={{ animation: 'fadeInUp 0.4s ease both' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #d42020, #1a3a8f)' }}
          >
            <Image src="/logo-blanco.png" alt="Montana" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <div className="text-[20px] font-semibold tracking-[-0.5px] text-[var(--text)]">Montana</div>
            <div className="text-[11px] text-[var(--text-sub)]">REMISION GROUP</div>
          </div>
        </div>

        <p className="text-[13px] text-[var(--text-sub)] mb-7">
          Ingresa tus credenciales para acceder al dashboard gerencial
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1.5 tracking-[0.03em]">
            Usuario
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="usuario"
            autoComplete="username"
            required
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] px-[14px] py-[11px] text-[14px] mb-4 focus:outline-none focus:border-[var(--brand-blue)] transition-colors placeholder:text-[var(--text-muted)]"
          />

          <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1.5 tracking-[0.03em]">
            Contraseña
          </label>
          <div className="relative mb-2">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] px-[14px] pr-[44px] py-[11px] text-[14px] focus:outline-none focus:border-[var(--brand-blue)] transition-colors placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? (
                /* Ojo tachado */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                /* Ojo abierto */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {error && (
            <p className="text-[12px] text-[#ef4444] mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 rounded-[8px] py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-60"
            style={{ background: 'var(--brand-blue)' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          <div className="mt-4 text-center">
            <a
              href="/recuperar"
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--brand-blue)] transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
