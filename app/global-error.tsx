'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f1117', color: '#e2e8f0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 8 }}>
            Error global
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Algo salió mal
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 360, margin: 0 }}>
            {error.message || 'Ocurrió un error inesperado.'}
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
