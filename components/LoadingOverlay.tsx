/**
 * Overlay con rueda giratoria. Componente presentacional puro (sin hooks), así
 * que sirve tanto en el loading.tsx del server como en transiciones del cliente
 * (aplicar filtro, cambiar de pestaña) vía useTransition.
 */
export default function LoadingOverlay({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg)]/55 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-3 rounded-[16px] bg-[var(--card)] border border-[var(--border)] shadow-2xl px-8 py-6">
        <div className="w-9 h-9 rounded-full border-[3px] border-[var(--border)] border-t-[var(--brand-blue)] animate-spin" />
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{label}</span>
      </div>
    </div>
  )
}
