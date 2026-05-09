'use client'

import { useState } from 'react'
import { fmt } from '@/lib/format'

interface VendedorResumen {
  vendedor: string
  metaAnual: number
}

export default function SeedMetasButton() {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ ok: boolean; mensaje?: string; crecimiento?: string; vendedores?: VendedorResumen[]; error?: string } | null>(null)

  const ejecutar = async () => {
    if (!confirm('¿Generar metas en LS_METAS_VENDEDOR? Esto sobreescribirá la hoja.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/seed-metas-vendedor', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ ok: false, error: 'Error de red' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[12px] text-[var(--text-sub)] mb-3">
          Genera las metas mensuales por vendedor en la hoja <code className="bg-[var(--bg)] px-1 rounded text-[11px]">LS_METAS_VENDEDOR</code> usando las ventas del año anterior como base, aplicando el porcentaje de crecimiento configurado.
          Puedes editar los valores directamente en el Sheet después.
        </p>
        <button
          onClick={ejecutar}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: 'var(--brand-blue)', color: '#fff' }}
        >
          {loading ? 'Generando…' : 'Generar metas en Sheets'}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg border px-4 py-3 text-[12px] ${result.ok ? 'border-[#22c55e]/40 bg-[#22c55e]/5' : 'border-[#ef4444]/40 bg-[#ef4444]/5'}`}>
          {result.ok ? (
            <>
              <div className="font-semibold text-[var(--text)] mb-1">✓ {result.mensaje}</div>
              <div className="text-[var(--text-muted)] mb-2">Crecimiento aplicado: {result.crecimiento}</div>
              <div className="space-y-1">
                {result.vendedores?.map(v => (
                  <div key={v.vendedor} className="flex justify-between">
                    <span className="text-[var(--text-sub)]">{v.vendedor}</span>
                    <span className="font-semibold text-[var(--text)] num">{fmt(v.metaAnual)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[#ef4444]">Error: {result.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
