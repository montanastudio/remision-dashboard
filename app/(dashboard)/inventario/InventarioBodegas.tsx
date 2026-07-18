'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fmt, fmtN } from '@/lib/format'
import Card from '@/components/Card'

type Row = Record<string, string>

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const s = String(v ?? '').trim()
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function pickCol(r: Row, ...candidates: string[]): string {
  for (const c of candidates) { if (r[c] !== undefined && r[c] !== '') return r[c] }
  return ''
}
function extractSaldo(r: Row): number {
  return parseNum(pickCol(r, 'Stock Total', 'Saldo Sistema', 'Saldo', 'Existencias', 'Cantidad', 'Saldo (und)', 'Und. Stock'))
}
function extractPrecio(r: Row): number {
  return parseNum(pickCol(r, 'Precio Venta ($)', 'Valor Venta ($)', 'Precio Venta', 'Precio', 'Vr. Unitario ($)', 'P. Venta'))
}
function extractValorTotal(r: Row): number {
  const s = extractSaldo(r)
  const p = extractPrecio(r)
  if (s > 0 && p > 0) return s * p
  return parseNum(pickCol(r, 'Valor a Precio Venta ($)', 'Vr. Existencia ($)', 'Valor Existencia ($)', 'Vr. Total ($)', 'Total ($)'))
}
function pickDesc(r: Row): string {
  return String(r['Descripción'] || r['Producto'] || '').trim()
}
// "CALZ.PEGASUS REF.PGS-6200Y-01 OXFORD" → "OXFORD"
function pickModelo(r: Row): string {
  if (r['Modelo']) return r['Modelo']
  const m = pickDesc(r).toUpperCase().match(/REF\.?\s*[A-Z0-9][A-Z0-9-]*\s*(.*)$/)
  return (m ? m[1] : pickDesc(r)).trim()
}

const BODEGA_LABEL_OVERRIDES: Record<string, string> = {
  CEDI: 'CEDI',
  PALMASECA: 'Palmaseca',
  ECOMERCE: 'Ecomerce',
  RESERVAS: 'Reservas',
}
function bodegaLabel(col: string): string {
  const key = col.replace(/^Stock\s+/i, '').replace(/^BODEGA\s+/i, '').trim().toUpperCase()
  if (BODEGA_LABEL_OVERRIDES[key]) return BODEGA_LABEL_OVERRIDES[key]
  return key.charAt(0) + key.slice(1).toLowerCase()
}
function extractBodegas(r: Row): Record<string, number> {
  const out: Record<string, number> = {}
  Object.keys(r).forEach(k => {
    if (!/^Stock /i.test(k) || /^Stock Total$/i.test(k)) return
    const label = bodegaLabel(k)
    out[label] = (out[label] ?? 0) + parseNum(r[k])
  })
  return out
}

const PALETTE = ['#3b82f6', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']

type EnrichedRow = Row & { _saldo: number; _valorTotal: number; _bodegas: Record<string, number> }

interface Props { saldos: Row[] }

export default function InventarioBodegas({ saldos }: Props) {
  const [selectedBodega, setSelectedBodega] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [valorPopup, setValorPopup] = useState<{ top: number; left: number; valor: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setValorPopup(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function openValorPopup(e: React.MouseEvent, valor: number) {
    const rect = e.currentTarget.getBoundingClientRect()
    setValorPopup({ top: rect.top - 8, left: rect.left + rect.width / 2, valor })
  }

  const enriched: EnrichedRow[] = useMemo(() => saldos.map(r => ({
    ...r,
    _saldo: extractSaldo(r),
    _valorTotal: extractValorTotal(r),
    _bodegas: extractBodegas(r),
  } as EnrichedRow)), [saldos])

  const resumenBodegas = useMemo(() => {
    const agg: Record<string, { qty: number; valor: number; skus: number }> = {}
    enriched.forEach(r => {
      Object.entries(r._bodegas).forEach(([label, qty]) => {
        if (qty <= 0) return
        if (!agg[label]) agg[label] = { qty: 0, valor: 0, skus: 0 }
        agg[label].qty += qty
        agg[label].valor += r._saldo > 0 ? r._valorTotal * (qty / r._saldo) : 0
        agg[label].skus += 1
      })
    })
    return Object.entries(agg)
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([label, d], i) => ({ label, ...d, color: PALETTE[i % PALETTE.length] }))
  }, [enriched])

  const totalQty = resumenBodegas.reduce((s, b) => s + b.qty, 0)

  const productosDeBodega = useMemo(() => {
    if (!selectedBodega) return []
    let list = enriched.filter(r => (r._bodegas[selectedBodega] ?? 0) > 0)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(r =>
        pickDesc(r).toLowerCase().includes(q) ||
        (r['Referencia'] ?? '').toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => (b._bodegas[selectedBodega] ?? 0) - (a._bodegas[selectedBodega] ?? 0))
  }, [enriched, selectedBodega, query])

  const bodegaInfo = resumenBodegas.find(b => b.label === selectedBodega)

  return (
    <div>
      {/* Tarjetas resumen por bodega */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {resumenBodegas.map(b => {
          const isSelected = selectedBodega === b.label
          const pct = totalQty > 0 ? (b.qty / totalQty) * 100 : 0
          return (
            <button
              key={b.label}
              onClick={() => setSelectedBodega(p => p === b.label ? null : b.label)}
              className={`text-left rounded-card border p-[14px_16px] shadow-card transition-all ${
                isSelected ? 'ring-2' : 'hover:shadow-card-hover'
              }`}
              style={{
                borderColor: isSelected ? b.color : 'var(--border)',
                background: 'var(--card)',
                ['--tw-ring-color' as string]: b.color,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                <span className="text-[12px] font-semibold text-[var(--text)]">{b.label}</span>
              </div>
              <div className="text-[20px] font-bold num text-[var(--text)] leading-tight">
                {fmtN(b.qty)} <span className="text-[10px] font-normal text-[var(--text-muted)]">und</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] num mt-0.5">{fmt(b.valor)}</div>
              <div className="mt-2 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">{fmtN(b.skus)} SKUs · {pct.toFixed(0)}%</div>
            </button>
          )
        })}
      </div>

      {/* Detalle de la bodega seleccionada */}
      {!selectedBodega ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--card)] shadow-card px-5 py-10 text-center">
          <div className="text-[12px] text-[var(--text-muted)]">👆 Selecciona una bodega para ver su inventario</div>
        </div>
      ) : (
        <Card
          title={`Inventario en ${selectedBodega}`}
          subtitle={`${fmtN(productosDeBodega.length)} referencias · ${fmtN(bodegaInfo?.qty ?? 0)} und`}
        >
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar modelo, referencia…"
            className="w-full mb-3 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
          />
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['Modelo', 'Referencia', 'Cantidad'].map(h => (
                    <th key={h}
                      className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap ${
                        h === 'Cantidad' ? 'text-right' : 'text-left'
                      }`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productosDeBodega.map((r, i) => {
                  const qty = r._bodegas[selectedBodega] ?? 0
                  const precio = extractPrecio(r)
                  return (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] font-medium text-[var(--text)] max-w-[220px] truncate">{pickModelo(r)}</td>
                      <td className="px-[10px] py-[9px] text-[var(--text-sub)] num text-[11px]">{r['Referencia'] ?? ''}</td>
                      <td className="px-[10px] py-[9px] text-right">
                        <span
                          onClick={(e) => openValorPopup(e, qty * precio)}
                          className="text-[11px] font-semibold text-[var(--text)] num cursor-pointer border-b border-dotted border-[var(--text-muted)]"
                        >
                          {fmtN(qty)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {productosDeBodega.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">Sin resultados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Popup de valor (portal a document.body para evitar containing blocks) */}
      {valorPopup && typeof document !== 'undefined' && createPortal(
        <div ref={popupRef}
          style={{
            position: 'fixed', top: valorPopup.top, left: valorPopup.left, zIndex: 9999,
            transform: 'translate(-50%, -100%)',
          }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-[10px] shadow-lg px-3 py-2">
          <div className="text-[10px] text-[var(--text-muted)]">Valor</div>
          <div className="text-[13px] font-bold text-[var(--text)] num whitespace-nowrap">{fmt(valorPopup.valor)}</div>
        </div>,
        document.body
      )}
    </div>
  )
}
