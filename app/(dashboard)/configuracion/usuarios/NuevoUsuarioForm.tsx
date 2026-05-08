'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NuevoUsuarioForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<string[]>(['Administrador', 'Gerencia', 'Ventas'])
  const [form, setForm] = useState({
    nombre: '',
    usuario: '',
    contraseña: '',
    rol: 'Ventas',
    iniciales: '',
  })

  useEffect(() => {
    fetch('/api/permisos')
      .then((r) => r.json())
      .then((d) => { if (d.roles?.length) setRoles(d.roles) })
      .catch(() => {})
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'nombre') {
        const parts = value.trim().split(' ').filter(Boolean)
        next.iniciales = parts.map((p) => p[0]).join('').toUpperCase().slice(0, 3)
        if (!prev.usuario || prev.usuario === prev.nombre.toLowerCase().replace(/\s+/g, '')) {
          next.usuario = value.toLowerCase().replace(/\s+/g, '').slice(0, 20)
        }
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear usuario'); return }
      setOpen(false)
      setForm({ nombre: '', usuario: '', contraseña: '', rol: 'Ventas', iniciales: '' })
      router.refresh()
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
        className="flex items-center gap-2 px-4 py-2 rounded-nav text-[13px] font-semibold text-white transition-colors"
        style={{ background: 'var(--brand-blue)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Nuevo usuario
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-shell shadow-shell-day dark:shadow-shell-night">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <span className="text-[15px] font-bold text-[var(--text)]">Nuevo usuario</span>
              <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {[
                { label: 'Nombre completo', name: 'nombre', type: 'text', placeholder: 'Ej: Juan Pérez' },
                { label: 'Usuario (login)', name: 'usuario', type: 'text', placeholder: 'Ej: juanperez' },
                { label: 'Contraseña', name: 'contraseña', type: 'password', placeholder: 'Mínimo 6 caracteres' },
              ].map(({ label, name, type, placeholder }) => (
                <div key={name}>
                  <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">{label}</label>
                  <input
                    name={name}
                    type={type}
                    placeholder={placeholder}
                    value={form[name as keyof typeof form]}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Rol</label>
                  <select
                    name="rol"
                    value={form.rol}
                    onChange={handleChange}
                    className="w-full px-3 py-2 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                  >
                    {roles.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-sub)] mb-1">Iniciales</label>
                  <input
                    name="iniciales"
                    type="text"
                    maxLength={3}
                    placeholder="Ej: JP"
                    value={form.iniciales}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-nav border border-[var(--border)] bg-[var(--bg)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-blue)] transition-colors uppercase"
                  />
                </div>
              </div>

              {error && (
                <p className="text-[12px] text-[#ef4444] bg-[#ef444415] px-3 py-2 rounded-nav">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2 rounded-nav border border-[var(--border)] text-[13px] text-[var(--text-sub)] hover:bg-[var(--nav-hover)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 rounded-nav text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: 'var(--brand-blue)' }}
                >
                  {loading ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
