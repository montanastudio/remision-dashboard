'use client'

import { useEffect } from 'react'

export default function Error({
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
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="text-[var(--text-muted)] text-sm font-medium uppercase tracking-widest mb-2">
        Error
      </div>
      <h2 className="text-[var(--text)] text-lg font-semibold">
        Algo salió mal
      </h2>
      <p className="text-[var(--text-sub)] text-sm text-center max-w-sm">
        {error.message || 'Ocurrió un error inesperado.'}
      </p>
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 rounded-lg bg-[var(--brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Reintentar
      </button>
    </div>
  )
}
