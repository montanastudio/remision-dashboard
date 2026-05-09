'use client'

import { useState } from 'react'
import VendedorMetaCard from './VendedorMetaCard'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export interface GaugeVendedor {
  label: string
  color: string
  actualPorMes: number[]   // índice 0=Ene … 11=Dic
  metaPorMes:   number[]
  metaAnual:    number
}

interface Props {
  gauges:      GaugeVendedor[]
  añoActual:   number
  mesActualN:  number        // 1-12, mes actual del año
}

export default function MetasGauges({ gauges, añoActual, mesActualN }: Props) {
  // -1 = YTD acumulado; 0-11 = mes específico
  const [sel, setSel] = useState<number>(-1)

  // Meses disponibles: sólo hasta el mes actual
  const mesesDisponibles = MESES.slice(0, mesActualN)

  const getVals = (g: GaugeVendedor) => {
    if (sel === -1) {
      // Avance del año: real acumulado vs meta anual completa
      const actual = g.actualPorMes.slice(0, mesActualN).reduce((s, v) => s + v, 0)
      return { actual, meta: g.metaAnual }
    }
    return { actual: g.actualPorMes[sel] ?? 0, meta: g.metaPorMes[sel] ?? 0 }
  }

  const labelSel = sel === -1
    ? `Avance del año · Ene–${MESES[mesActualN - 1]} vs meta anual ${añoActual}`
    : `${MESES[sel]} ${añoActual}`

  return (
    <div>
      {/* ── Selector de mes ── */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setSel(-1)}
          className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
            sel === -1
              ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)]'
          }`}
        >
          Acumulado
        </button>
        {mesesDisponibles.map((m, idx) => (
          <button
            key={m}
            onClick={() => setSel(idx)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
              sel === idx
                ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)]'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ── Label período activo ── */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3">
        {labelSel}
      </p>

      {/* ── Gauges ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {gauges.map(g => {
          const { actual, meta } = getVals(g)
          return (
            <VendedorMetaCard
              key={g.label}
              nombre={g.label}
              actual={actual}
              meta={meta}
              metaAnual={undefined}
              metaLabel={sel === -1 ? `Meta anual ${añoActual}` : `Meta ${MESES[sel]}`}
              color={g.color}
            />
          )
        })}
      </div>
    </div>
  )
}
