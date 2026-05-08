'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Card from '@/components/Card'
import { fmt, fmtN, pct } from '@/lib/format'

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const s = String(v ?? '').trim()
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

type Row = Record<string, string>

interface Cliente {
  _rank: string
  nit: string
  nombre: string
  ciudad?: string
  unidades: number
  valor: number
}

interface Props {
  top20: Cliente[]
  vendidosCliente: Row[]
  totalVal: number
  topValor: number
}

export default function ClientesInteractivo({ top20, vendidosCliente, totalVal, topValor }: Props) {
  // Nivel 1: cliente seleccionado
  const [selectedNit, setSelectedNit] = useState<string | null>(null)
  // Nivel 2: referencia seleccionada
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  const nivel2Ref = useRef<HTMLDivElement>(null)
  const nivel3Ref = useRef<HTMLDivElement>(null)

  const selectedCliente = selectedNit ? top20.find(c => c.nit === selectedNit) : null

  // ── Nivel 2: productos/referencias del cliente seleccionado ──────────
  const nivel2Rows = useMemo(() => {
    if (!selectedNit) return []
    const filasCliente = vendidosCliente.filter(r => r['NIT'] === selectedNit)
    // Agrupar por Referencia
    const map: Record<string, { referencia: string; marca: string; modelo: string; cantidad: number; valor: number }> = {}
    filasCliente.forEach(r => {
      const ref = r['Referencia'] || r['Modelo'] || '—'
      if (!map[ref]) {
        map[ref] = {
          referencia: r['Referencia'] || '—',
          marca:      r['Marca']      || '',
          modelo:     r['Modelo']     || '',
          cantidad:   0,
          valor:      0,
        }
      }
      map[ref].cantidad += parseNum(r['Cantidad'])
      map[ref].valor    += parseNum(r['Vr. Bruto ($)'])
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [selectedNit, vendidosCliente])

  const maxRef = nivel2Rows[0]?.valor ?? 1

  // ── Nivel 3: facturas del cliente + referencia seleccionados ─────────
  const nivel3Rows = useMemo(() => {
    if (!selectedNit || !selectedRef) return []
    return vendidosCliente
      .filter(r => r['NIT'] === selectedNit && (r['Referencia'] || r['Modelo'] || '—') === selectedRef)
      .sort((a, b) => {
        // Ordenar por fecha descendente si existe
        const fa = a['Fecha'] ?? '', fb = b['Fecha'] ?? ''
        return fb.localeCompare(fa)
      })
  }, [selectedNit, selectedRef, vendidosCliente])

  const selectedRefData = selectedRef ? nivel2Rows.find(r => r.referencia === selectedRef || (r.referencia === '—' && selectedRef === '—')) : null

  // Scroll automático al aparecer cada nivel
  useEffect(() => {
    if (selectedNit) {
      setTimeout(() => nivel2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [selectedNit])

  useEffect(() => {
    if (selectedRef) {
      setTimeout(() => nivel3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [selectedRef])

  const toggleCliente = (nit: string) => {
    setSelectedRef(null)
    setSelectedNit(prev => prev === nit ? null : nit)
  }

  const toggleRef = (ref: string) => {
    setSelectedRef(prev => prev === ref ? null : ref)
  }

  return (
    <>
      {/* ══ NIVEL 1: Top 20 clientes ══ */}
      <Card title="Top 20 Clientes" subtitle="por valor comprado · click para ver productos" className="mb-4">
        <div className="table-scroll">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-[var(--card)] z-10">
              <tr>
                {['#', 'Cliente', 'Unidades', 'Vr. Bruto', 'Participación'].map((h, i) => (
                  <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top20.map((c) => {
                const rank = Number(c._rank)
                const isActive = selectedNit === c.nit
                return (
                  <tr
                    key={c.nit}
                    onClick={() => toggleCliente(c.nit)}
                    className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                        : 'hover:bg-[var(--nav-hover)]'
                    }`}
                  >
                    <td className="px-[10px] py-[9px] w-[32px]">
                      <span className={`text-[11px] font-semibold num ${rank <= 3 ? 'text-[#f59e0b]' : 'text-[var(--text-muted)]'}`}>{rank}</span>
                    </td>
                    <td className="px-[10px] py-[9px] w-[40%]">
                      <div className="flex items-start gap-1.5">
                        <span className={`text-[10px] mt-[2px] flex-shrink-0 transition-transform ${isActive ? 'text-[var(--brand-blue)] rotate-90' : 'text-[var(--text-muted)]'}`}>▸</span>
                        <div>
                          <div className="font-medium text-[var(--text)] break-words leading-snug">{c.nombre}</div>
                          <div className="text-[10px] text-[var(--text-muted)] tabular-nums">{c.nit}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                      {fmtN(c.unidades)}
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      <span className="text-[#22c55e]">{fmt(c.valor)}</span>
                    </td>
                    <td className="px-[10px] py-[9px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden" style={{ minWidth: 60 }}>
                          <div
                            className="h-full bg-[var(--brand-blue)] rounded-full"
                            style={{ width: `${((c.valor / (topValor ?? 1)) * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="text-[10px] num text-[var(--text-muted)]">{pct(c.valor / totalVal)}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ══ NIVEL 2: Productos del cliente seleccionado ══ */}
      {selectedNit && (
        <div ref={nivel2Ref} className="mb-4">
          <Card
            title={`Productos comprados — ${selectedCliente?.nombre ?? selectedNit}`}
            subtitle="agrupado por referencia · click para ver facturas"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-[var(--text-muted)]">
                {nivel2Rows.length} referencias distintas
              </span>
              <button
                onClick={() => { setSelectedNit(null); setSelectedRef(null) }}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="table-scroll" style={{ maxHeight: 360 }}>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr>
                    {['Referencia', 'Marca', 'Modelo', 'Unidades', 'Vr. Bruto', '% del cliente'].map((h, i) => (
                      <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 3 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nivel2Rows.map((row) => {
                    const isActive = selectedRef === row.referencia
                    const clienteTotal = nivel2Rows.reduce((s, r) => s + r.valor, 0)
                    return (
                      <tr
                        key={row.referencia}
                        onClick={() => toggleRef(row.referencia)}
                        className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                            : 'hover:bg-[var(--nav-hover)]'
                        }`}
                      >
                        <td className="px-[10px] py-[9px]">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] transition-transform ${isActive ? 'text-[var(--brand-blue)] rotate-90' : 'text-[var(--text-muted)]'}`}>▸</span>
                            <span className="num text-[11px] text-[var(--text-sub)]">{row.referencia}</span>
                          </div>
                        </td>
                        <td className="px-[10px] py-[9px] text-[var(--text-sub)] text-[11px]">{row.marca}</td>
                        <td className="px-[10px] py-[9px] w-[35%]">
                          <span className="font-medium text-[var(--text)] break-words leading-snug">{row.modelo}</span>
                        </td>
                        <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                          {fmtN(row.cantidad)}
                        </td>
                        <td className="px-[10px] py-[9px] text-right num text-[11px]">
                          <span className="text-[#22c55e]">{fmt(row.valor)}</span>
                        </td>
                        <td className="px-[10px] py-[9px] text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-[60px] h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#60a5fa] rounded-full"
                                style={{ width: `${((row.valor / maxRef) * 100).toFixed(0)}%` }}
                              />
                            </div>
                            <span className="text-[10px] num text-[var(--text-muted)] w-[36px] text-right">
                              {clienteTotal > 0 ? pct(row.valor / clienteTotal) : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ══ NIVEL 3: Facturas del producto seleccionado ══ */}
      {selectedNit && selectedRef && (
        <div ref={nivel3Ref}>
          <Card
            title={`Facturas — ${selectedRefData?.modelo || selectedRef}`}
            subtitle={`${selectedCliente?.nombre ?? selectedNit} · ${nivel3Rows.length} líneas`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-[var(--text-muted)]">
                Total: <span className="font-semibold text-[var(--text)]">{fmt(nivel3Rows.reduce((s, r) => s + parseNum(r['Vr. Bruto ($)']), 0))}</span>
                {' · '}{fmtN(nivel3Rows.reduce((s, r) => s + parseNum(r['Cantidad']), 0))} und
              </span>
              <button
                onClick={() => setSelectedRef(null)}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="table-scroll" style={{ maxHeight: 320 }}>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr>
                    {['Factura', 'Fecha', 'Cantidad', 'Vr. Bruto'].map((h, i) => (
                      <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nivel3Rows.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] num text-[11px] font-medium text-[var(--text)]">
                        {r['Factura'] || '—'}
                      </td>
                      <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">
                        {r['Fecha'] || '—'}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                        {fmtN(parseNum(r['Cantidad']))}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]">
                        <span className="text-[#22c55e]">{fmt(parseNum(r['Vr. Bruto ($)']))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
