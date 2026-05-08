'use client'

import { useEffect } from 'react'

export default function DashboardError({
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
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 p-8 fade-in-up">
      <div className="text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-[1px] mb-2">
        Error
      </div>
      <h2 className="text-[var(--text)] text-base font-semibold">
        No se pudo cargar esta página
      </h2>
      <p className="text-[var(--text-sub)] text-sm text-center max-w-sm">
        {error.message || 'Ocurrió un error al obtener los datos.'}
      </p>
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 rounded-lg bg-[var(--brand-blue)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        Reintentar
      </button>
    </div>
  )
}
