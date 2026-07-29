/**
 * UI de carga del dashboard. Next.js la muestra automáticamente mientras el
 * server component de cada página trae los datos (navegación entre secciones,
 * cambios de pestaña con ?tab=, refresco). Es un overlay con una rueda giratoria
 * para que quede claro que algo está cargando, en vez de que la vista se quede
 * quieta.
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg)]/55 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-3 rounded-[16px] bg-[var(--card)] border border-[var(--border)] shadow-2xl px-8 py-6">
        <div className="w-9 h-9 rounded-full border-[3px] border-[var(--border)] border-t-[var(--brand-blue)] animate-spin" />
        <span className="text-[12px] font-medium text-[var(--text-muted)]">Cargando…</span>
      </div>
    </div>
  )
}
