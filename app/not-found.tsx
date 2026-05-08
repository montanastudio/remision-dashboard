import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="text-[var(--text-muted)] text-sm font-medium uppercase tracking-widest mb-2">
        404
      </div>
      <h2 className="text-[var(--text)] text-lg font-semibold">
        Página no encontrada
      </h2>
      <p className="text-[var(--text-sub)] text-sm text-center max-w-sm">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/resumen"
        className="mt-2 px-4 py-2 rounded-lg bg-[var(--brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Ir al inicio
      </Link>
    </div>
  )
}
