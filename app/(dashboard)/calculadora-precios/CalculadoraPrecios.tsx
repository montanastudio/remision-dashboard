'use client'

import { useState, useMemo } from 'react'

const IVA_RATE = 0.19

function parseInput(v: string): number {
  // Acepta: 1.200.000 / 1200000 / 1200,000
  const clean = v.replace(/\./g, '').replace(/,/g, '').replace(/[^0-9]/g, '')
  return parseInt(clean, 10) || 0
}

function fmtCOP(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function fmtPct(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(1) + '%'
}

interface InputFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  prefix?: string
  placeholder?: string
  hint?: string
}

function InputField({ label, value, onChange, suffix, prefix, placeholder, hint }: InputFieldProps) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-[13px] font-medium text-[var(--text-sub)] pointer-events-none select-none">
            {prefix}
          </span>
        )}
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '0'}
          className={`w-full py-[10px] text-[14px] font-semibold rounded-[8px] border bg-[var(--bar-bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 transition-all num
            ${prefix ? 'pl-7' : 'pl-3'}
            ${suffix ? 'pr-8' : 'pr-3'}
          `}
          style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--brand-blue)' } as React.CSSProperties}
        />
        {suffix && (
          <span className="absolute right-3 text-[12px] font-medium text-[var(--text-muted)] pointer-events-none select-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

interface ResultRowProps {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  muted?: boolean
  color?: string
  indent?: boolean
  separator?: boolean
}

function ResultRow({ label, value, sub, highlight, muted, color, indent, separator }: ResultRowProps) {
  return (
    <>
      {separator && <div className="border-t border-[var(--border)] my-2" />}
      <div className={`flex items-center justify-between py-[7px] ${indent ? 'pl-4' : ''} ${highlight ? 'rounded-[6px] px-3 -mx-3' : ''}`}
        style={highlight ? { background: 'var(--bar-bg)' } : {}}>
        <div>
          <span className={`text-[12px] ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-sub)]'} ${highlight ? 'font-semibold text-[var(--text)]' : ''}`}>
            {label}
          </span>
          {sub && <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">{sub}</span>}
        </div>
        <span className={`text-[13px] font-semibold num ${highlight ? 'text-[15px]' : ''}`}
          style={{ color: color ?? (muted ? 'var(--text-muted)' : 'var(--text)') }}>
          {value}
        </span>
      </div>
    </>
  )
}

export default function CalculadoraPrecios() {
  const [costo,     setCosto]     = useState('')
  const [precio,    setPrecio]    = useState('')
  const [descuento, setDescuento] = useState('')

  const calc = useMemo(() => {
    const costoN     = parseInput(costo)
    const precioN    = parseInput(precio)
    const descPct    = Math.min(Math.max(parseFloat(descuento) || 0, 0), 100)

    const precioConDesc  = precioN * (1 - descPct / 100)
    const ivaValor       = precioConDesc * IVA_RATE
    const precioFinal    = precioConDesc + ivaValor          // precio que paga el cliente
    const utilidad       = precioConDesc - costoN            // margen real (IVA no es ingreso)
    const margenPct      = precioConDesc > 0 ? (utilidad / precioConDesc) * 100 : 0
    const markupPct      = costoN > 0 ? (utilidad / costoN) * 100 : 0

    return {
      costoN, precioN, descPct,
      precioConDesc, ivaValor, precioFinal,
      utilidad, margenPct, markupPct,
      ready: precioN > 0 && costoN > 0,
    }
  }, [costo, precio, descuento])

  const margenColor =
    calc.margenPct >= 30 ? '#22c55e' :
    calc.margenPct >= 15 ? '#f59e0b' :
    calc.margenPct >= 0  ? '#f97316' : '#ef4444'

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-[var(--text)] tracking-[-0.3px]">Calculadora de Precios</h1>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
          IVA 19% · Descuento de pronto pago aplicado antes del IVA
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-5 mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-4">
          Datos de entrada
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InputField
            label="Costo mercancía"
            value={costo}
            onChange={setCosto}
            prefix="$"
            placeholder="0"
            hint="Costo neto sin IVA"
          />
          <InputField
            label="Precio de lista"
            value={precio}
            onChange={setPrecio}
            prefix="$"
            placeholder="0"
            hint="Precio antes de descuento e IVA"
          />
          <InputField
            label="Desc. pronto pago"
            value={descuento}
            onChange={setDescuento}
            suffix="%"
            placeholder="0"
            hint="Se aplica antes del IVA · 45 días"
          />
        </div>
      </div>

      {/* Resultados */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-3">
          Desglose del precio
        </div>

        {!calc.ready ? (
          <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            Ingresa el costo y el precio de lista para ver los resultados
          </div>
        ) : (
          <div>
            <ResultRow
              label="Precio de lista"
              value={fmtCOP(calc.precioN)}
              muted
            />
            {calc.descPct > 0 && (
              <ResultRow
                label="Descuento pronto pago"
                sub={`(${fmtPct(calc.descPct)})`}
                value={`− ${fmtCOP(calc.precioN - calc.precioConDesc)}`}
                muted
                indent
              />
            )}
            <ResultRow
              label="Precio con descuento"
              value={fmtCOP(calc.precioConDesc)}
            />
            <ResultRow
              label="IVA 19%"
              value={`+ ${fmtCOP(calc.ivaValor)}`}
              muted
              indent
            />
            <ResultRow
              label="Precio final al cliente"
              value={fmtCOP(calc.precioFinal)}
              highlight
              separator
            />

            <div className="border-t border-[var(--border)] my-3" />

            <ResultRow
              label="Costo mercancía"
              value={`− ${fmtCOP(calc.costoN)}`}
              muted
            />
            <ResultRow
              label="Utilidad bruta"
              sub="(precio c/desc − costo)"
              value={fmtCOP(calc.utilidad)}
              color={calc.utilidad >= 0 ? '#22c55e' : '#ef4444'}
            />

            {/* Margen visual */}
            <div className="mt-4 p-4 rounded-[10px] border" style={{ borderColor: 'var(--border)', background: 'var(--bar-bg)' }}>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Margen neto</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Sobre precio con descuento</div>
                </div>
                <div className="text-right">
                  <div className="text-[32px] font-bold tracking-[-0.5px] num leading-none" style={{ color: margenColor }}>
                    {fmtPct(calc.margenPct)}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    Markup: <span className="font-semibold num" style={{ color: margenColor }}>{fmtPct(calc.markupPct)}</span> sobre costo
                  </div>
                </div>
              </div>
              {/* Barra de margen */}
              <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(calc.margenPct, 0), 100)}%`,
                    background: margenColor,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-[var(--text-muted)]">
                <span>0%</span>
                <span className="text-[#f59e0b]">15%</span>
                <span className="text-[#22c55e]">30%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Resumen compacto */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'Precio c/desc',   value: fmtCOP(calc.precioConDesc), color: 'var(--text)'   },
                { label: 'Precio + IVA',    value: fmtCOP(calc.precioFinal),   color: 'var(--text)'   },
                { label: 'Utilidad',        value: fmtCOP(calc.utilidad),      color: margenColor     },
              ].map(chip => (
                <div key={chip.label} className="rounded-[8px] p-3 text-center" style={{ background: 'var(--bar-bg)', border: '1px solid var(--border)' }}>
                  <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">{chip.label}</div>
                  <div className="text-[12px] font-bold num" style={{ color: chip.color }}>{chip.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
