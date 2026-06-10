'use client'

import { useState, useMemo } from 'react'

function parseNum(v: string): number {
  const clean = v.replace(/\./g, '').replace(/,/g, '').replace(/[^0-9]/g, '')
  return parseInt(clean, 10) || 0
}

function parsePct(v: string): number {
  const n = parseFloat(v.replace(',', '.')) || 0
  return Math.min(Math.max(n, 0), 100)
}

function fmtCOP(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function fmtPct(n: number, decimals = 1): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(decimals) + '%'
}

// ── Componente de campo numérico ────────────────────────────────────────────
interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  prefix?: string
  placeholder?: string
  hint?: string
  accent?: boolean
}

function Field({ label, value, onChange, suffix, prefix, placeholder, hint, accent }: FieldProps) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-[13px] font-medium text-[var(--text-sub)] pointer-events-none select-none z-10">
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
            ${accent ? 'border-[var(--brand-blue)] ring-1 ring-[var(--brand-blue)]/30' : ''}
          `}
          style={{ borderColor: accent ? 'var(--brand-blue)' : 'var(--border)', '--tw-ring-color': 'var(--brand-blue)' } as React.CSSProperties}
        />
        {suffix && (
          <span className="absolute right-3 text-[12px] font-medium text-[var(--text-muted)] pointer-events-none select-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-snug">{hint}</p>}
    </div>
  )
}

// ── Fila de resultado ───────────────────────────────────────────────────────
interface RowProps {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  muted?: boolean
  color?: string
  indent?: boolean
  separator?: boolean
  negative?: boolean
}

function Row({ label, value, sub, highlight, muted, color, indent, separator, negative }: RowProps) {
  return (
    <>
      {separator && <div className="border-t border-[var(--border)] my-2" />}
      <div
        className={`flex items-center justify-between py-[6px] ${indent ? 'pl-4' : ''} ${highlight ? 'rounded-[8px] px-3 -mx-3 mt-1' : ''}`}
        style={highlight ? { background: 'var(--bar-bg)' } : {}}
      >
        <div className="flex items-center gap-1.5">
          {negative && <span className="text-[11px] text-[#ef4444] font-bold">−</span>}
          <span className={`text-[12px] ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-sub)]'} ${highlight ? 'font-semibold text-[var(--text)] text-[13px]' : ''}`}>
            {label}
          </span>
          {sub && <span className="text-[10px] text-[var(--text-muted)]">{sub}</span>}
        </div>
        <span
          className={`font-semibold num ${highlight ? 'text-[15px]' : 'text-[12px]'}`}
          style={{ color: color ?? (muted ? 'var(--text-muted)' : 'var(--text)') }}
        >
          {value}
        </span>
      </div>
    </>
  )
}

// ── Calculadora principal ───────────────────────────────────────────────────
export default function CalculadoraPrecios() {
  const [costo,     setCosto]     = useState('')
  const [cliente,   setCliente]   = useState('')   // valor que paga el cliente
  const [descPct,   setDescPct]   = useState('')   // % descuento financiero
  const [ivaPct,    setIvaPct]    = useState('19') // % IVA, editable

  const calc = useMemo(() => {
    const costoN   = parseNum(costo)
    const clienteN = parseNum(cliente)
    const d        = parsePct(descPct) / 100   // p.ej. 0.05
    const iva      = parsePct(ivaPct)  / 100   // p.ej. 0.19

    // ── Cálculo inverso ────────────────────────────────────────────────────
    // clienteN = B × (1 + iva − d)
    // B = clienteN / (1 + iva − d)
    const divisor   = 1 + iva - d
    if (divisor <= 0 || clienteN === 0) {
      return { ready: false, costoN, clienteN, d, iva, divisor }
    }

    const base         = clienteN / divisor          // Precio base (va en factura)
    const ivaValor     = base * iva                  // IVA en $
    const descValor    = base * d                    // Descuento financiero en $
    const factura      = base + ivaValor             // Total factura (base + IVA)
    const clienteCheck = factura - descValor         // Debe ser igual a clienteN

    // Utilidad = Base − Descuento − IVA − Costo
    const utilidad     = costoN > 0 ? base - descValor - ivaValor - costoN : NaN
    const margenPct    = base > 0   ? (utilidad / base) * 100 : NaN
    const markupPct    = costoN > 0 ? (utilidad / costoN) * 100 : NaN

    // Ingreso neto = lo que queda en empresa (sin IVA ni descuento)
    const ingresoNeto  = base - descValor - ivaValor

    return {
      ready: true,
      costoN, clienteN, d, iva, divisor,
      base, ivaValor, descValor, factura, clienteCheck,
      ingresoNeto, utilidad, margenPct, markupPct,
    }
  }, [costo, cliente, descPct, ivaPct])

  const margenColor =
    !isFinite(calc.margenPct as number) ? '#94a3b8' :
    (calc.margenPct as number) >= 30    ? '#22c55e' :
    (calc.margenPct as number) >= 15    ? '#f59e0b' :
    (calc.margenPct as number) >= 0     ? '#f97316' : '#ef4444'

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text)] tracking-[-0.3px]">Calculadora de Precios</h1>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
          Ingresa el valor que paga el cliente — el descuento financiero no va en la factura, el IVA se calcula sobre el precio base
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-4">
          Datos de entrada
        </div>

        {/* Fila 1: costo + valor que paga el cliente */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field
            label="Costo mercancía"
            value={costo}
            onChange={setCosto}
            prefix="$"
            placeholder="0"
            hint="Costo neto sin IVA"
          />
          <Field
            label="Valor que paga el cliente"
            value={cliente}
            onChange={setCliente}
            prefix="$"
            placeholder="0"
            hint="Lo que entra en caja — incluye IVA, ya descontado"
            accent
          />
        </div>

        {/* Fila 2: descuento + IVA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Descuento financiero"
            value={descPct}
            onChange={setDescPct}
            suffix="%"
            placeholder="0"
            hint="No aparece en la factura · se aplica sobre el precio base"
          />
          <Field
            label="Tasa de IVA"
            value={ivaPct}
            onChange={setIvaPct}
            suffix="%"
            placeholder="19"
            hint="Porcentaje de IVA aplicable al producto"
          />
        </div>
      </div>

      {/* Resultados */}
      {!calc.ready ? (
        <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-8 text-center">
          <div className="text-[11px] text-[var(--text-muted)]">Ingresa el valor que paga el cliente para ver el desglose</div>
        </div>
      ) : (
        <>
          {/* Panel: desglose de factura */}
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-3">
              Estructura del precio
            </div>

            <Row label="Precio base (factura)" value={fmtCOP(calc.base!)} />
            <Row
              label="IVA"
              sub={`(${fmtPct(calc.iva! * 100)} del base)`}
              value={`+ ${fmtCOP(calc.ivaValor!)}`}
              muted indent
            />
            <Row
              label="Total factura"
              value={fmtCOP(calc.factura!)}
              separator
            />
            {calc.d! > 0 && (
              <Row
                label="Descuento financiero"
                sub={`(${fmtPct(calc.d! * 100)} del base · fuera de factura)`}
                value={`− ${fmtCOP(calc.descValor!)}`}
                muted indent negative
              />
            )}
            <Row
              label="El cliente paga"
              value={fmtCOP(calc.clienteCheck!)}
              highlight
              separator
              color="#3b82f6"
            />
          </div>

          {/* Panel: rentabilidad */}
          <div className="rounded-card border bg-[var(--card)] border-[var(--border)] shadow-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-3">
              Rentabilidad
            </div>

            <Row label="Precio base" value={fmtCOP(calc.base!)} />
            {calc.d! > 0 && (
              <Row
                label="− Descuento financiero"
                sub={`(${fmtPct(calc.d! * 100)})`}
                value={fmtCOP(calc.descValor!)}
                muted indent negative
              />
            )}
            <Row
              label="− IVA"
              sub={`(${fmtPct(calc.iva! * 100)})`}
              value={fmtCOP(calc.ivaValor!)}
              muted indent negative
            />
            {calc.costoN > 0 && (
              <Row
                label="− Costo mercancía"
                value={fmtCOP(calc.costoN)}
                muted indent negative
              />
            )}

            {calc.costoN > 0 ? (
              <Row
                label="Utilidad"
                value={fmtCOP(calc.utilidad!)}
                highlight
                separator
                color={calc.utilidad! >= 0 ? '#22c55e' : '#ef4444'}
              />
            ) : (
              <div className="mt-3 text-[11px] text-[var(--text-muted)] italic">
                Ingresa el costo para calcular la utilidad
              </div>
            )}

            {/* Barra de margen */}
            {calc.costoN > 0 && (
              <div className="mt-4 p-4 rounded-[10px] border" style={{ borderColor: 'var(--border)', background: 'var(--bar-bg)' }}>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Margen sobre precio base</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Utilidad ÷ precio base</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[32px] font-bold tracking-[-0.5px] num leading-none" style={{ color: margenColor }}>
                      {fmtPct(calc.margenPct!)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      Markup: <span className="font-semibold num" style={{ color: margenColor }}>{fmtPct(calc.markupPct!)}</span> sobre costo
                    </div>
                  </div>
                </div>
                <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(Math.max(calc.margenPct! || 0, 0), 100)}%`,
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
            )}

            {/* Chips resumen */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Precio base',      value: fmtCOP(calc.base!),       color: 'var(--text)'  },
                { label: 'IVA',              value: fmtCOP(calc.ivaValor!),   color: '#f59e0b'      },
                { label: 'Desc. financiero', value: fmtCOP(calc.descValor!),  color: '#8b5cf6'      },
                ...(calc.costoN > 0
                  ? [{ label: 'Utilidad', value: fmtCOP(calc.utilidad!), color: margenColor }]
                  : []
                ),
              ].map(chip => (
                <div key={chip.label} className="rounded-[8px] p-3 text-center" style={{ background: 'var(--bar-bg)', border: '1px solid var(--border)' }}>
                  <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">{chip.label}</div>
                  <div className="text-[12px] font-bold num" style={{ color: chip.color }}>{chip.value}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
