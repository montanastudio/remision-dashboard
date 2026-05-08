'use client'

import { useState, useMemo, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import Badge from '@/components/Badge'
import { fmt, fmtN } from '@/lib/format'

function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const s = String(v ?? '').trim()
  const periodCount = (s.match(/\./g) ?? []).length
  const clean = periodCount > 1 ? s.replace(/\./g, '') : s
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

const ESTADO_VARIANTS: Record<string, 'red' | 'amber' | 'blue' | 'green' | 'gray'> = {
  CRITICO: 'red',
  ALTO: 'amber',
  MEDIO: 'blue',
  OK: 'green',
}

// estado en BD → nombre del segmento en el donut
const ESTADO_TO_SEGMENT: Record<string, string> = {
  CRITICO: 'CRÍTICO',
  ALTO: 'ALTO',
  MEDIO: 'MEDIO',
}

// nombre del segmento → estado en BD
const ESTADO_KEY: Record<string, string> = {
  'CRÍTICO': 'CRITICO',
  'ALTO': 'ALTO',
  'MEDIO': 'MEDIO',
}

// colores por estado para los chips
const CHIP_COLOR: Record<string, string> = {
  CRITICO: '#ef4444',
  ALTO: '#f59e0b',
  MEDIO: '#3b82f6',
}

type Row = Record<string, string>
interface Segment { name: string; value: number; color: string }
interface Props { segments: Segment[]; sinRotar: Row[] }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Segment }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-[var(--card)] border-[var(--border)] shadow-lg px-3 py-2 text-[12px]">
      <div className="font-semibold text-[var(--text)]">{d.name}</div>
      <div className="text-[var(--text-sub)] mt-0.5">{fmt(d.value)}</div>
    </div>
  )
}

export default function InventarioSinRotar({ segments, sinRotar }: Props) {
  const [mounted, setMounted]           = useState(false)
  const [selected, setSelected]         = useState<string | null>(null)   // segmento donut
  const [selectedModel, setSelectedModel] = useState<string | null>(null) // chip de modelo

  useEffect(() => { setMounted(true) }, [])

  // ── rango de días por estado ──────────────────────────────────────────
  const daysPerEstado = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {}
    sinRotar.forEach(r => {
      const estado = String(r['Estado'] ?? '').trim()
      const dias   = parseNum(r['Días Sin Rotar'])
      if (!dias || !estado) return
      if (!map[estado]) map[estado] = { min: dias, max: dias }
      else { map[estado].min = Math.min(map[estado].min, dias); map[estado].max = Math.max(map[estado].max, dias) }
    })
    return map
  }, [sinRotar])

  // ── lista única de modelos sin rotar ─────────────────────────────────
  const models = useMemo(() => {
    const seen = new Set<string>()
    return sinRotar
      .filter(r => {
        const m = String(r['Modelo'] ?? '').trim()
        if (!m || seen.has(m)) return false
        seen.add(m)
        return true
      })
      .map(r => ({
        nombre:  String(r['Modelo'] ?? '').trim(),
        estado:  String(r['Estado'] ?? '').trim(),
        segment: ESTADO_TO_SEGMENT[String(r['Estado'] ?? '').trim()] ?? '',
        color:   CHIP_COLOR[String(r['Estado'] ?? '').trim()] ?? '#6b7280',
        dias:    parseNum(r['Días Sin Rotar']),
      }))
      .sort((a, b) => b.dias - a.dias)
  }, [sinRotar])

  // ── handlers ─────────────────────────────────────────────────────────
  const clickSegment = (name: string) => {
    if (selected === name) {
      setSelected(null)
      setSelectedModel(null)
    } else {
      setSelected(name)
      setSelectedModel(null)
    }
  }

  const clickModel = (nombre: string, segment: string) => {
    if (selectedModel === nombre) {
      setSelectedModel(null)
      // mantiene el segmento activo
    } else {
      setSelectedModel(nombre)
      setSelected(segment || null)
    }
  }

  // ── filas filtradas para la tabla ─────────────────────────────────────
  const filtered = useMemo(() => {
    if (selectedModel) return sinRotar.filter(r => String(r['Modelo'] ?? '').trim() === selectedModel)
    if (!selected || selected === 'En rotación') return []
    const estadoKey = ESTADO_KEY[selected]
    if (!estadoKey) return []
    return sinRotar.filter(r => r['Estado'] === estadoKey)
  }, [selected, selectedModel, sinRotar])

  const isRotacion = selected === 'En rotación'

  // chips filtrados por segmento activo
  const visibleModels: typeof models = (selected !== null && selected !== 'En rotación')
    ? models.filter(m => m.segment === selected)
    : models

  if (!mounted) return (
    <div className="h-[200px] flex items-center justify-center text-[12px] text-[var(--text-muted)]">
      Cargando...
    </div>
  )

  return (
    <div>
      {/* ── Donut + leyenda ── */}
      <div className="flex flex-col md:flex-row items-center gap-6 mb-4">
        <div className="w-[200px] h-[200px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={84}
                dataKey="value"
                paddingAngle={2}
                onClick={(d) => d?.name && clickSegment(d.name)}
                cursor="pointer"
              >
                {segments.map((s) => (
                  <Cell
                    key={s.name}
                    fill={s.color}
                    opacity={selected && selected !== s.name ? 0.25 : 1}
                    stroke={selected === s.name ? '#fff' : 'transparent'}
                    strokeWidth={selected === s.name ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 w-full">
          {segments.map((s) => {
            const isActive   = selected === s.name
            const estadoKey  = ESTADO_KEY[s.name]
            const days       = estadoKey ? daysPerEstado[estadoKey] : null
            return (
              <button
                key={s.name}
                onClick={() => clickSegment(s.name)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left w-full transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-hover)] ring-1 ring-[var(--border)]'
                    : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: s.color }} />
                <span className="flex flex-col flex-1 min-w-0">
                  <span className="text-[13px] text-[var(--text)]">{s.name}</span>
                  {days && (
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                      {days.min === days.max ? `${days.min} días` : `${days.min} – ${days.max} días`}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-semibold text-[var(--text-sub)] tabular-nums flex-shrink-0">{fmt(s.value)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chips de modelos ── */}
      {visibleModels.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
            Modelos sin rotar · {visibleModels.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleModels.map((m) => {
              const isActive = selectedModel === m.nombre
              return (
                <button
                  key={m.nombre}
                  onClick={() => clickModel(m.nombre, m.segment)}
                  className="rounded-full px-2.5 py-[3px] text-[11px] font-medium transition-all border leading-none"
                  style={
                    isActive
                      ? { background: m.color, borderColor: m.color, color: '#fff' }
                      : { background: 'transparent', borderColor: m.color + '70', color: m.color }
                  }
                >
                  {m.nombre}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tabla / estados vacíos ── */}
      {!selected && !selectedModel && (
        <p className="text-center py-6 text-[12px] text-[var(--text-muted)]">
          Selecciona un segmento o modelo para ver el detalle
        </p>
      )}

      {isRotacion && (
        <p className="text-center py-6 text-[12px] text-[var(--text-muted)]">
          El inventario en rotación normal no tiene detalle de productos sin rotar.
        </p>
      )}

      {(selectedModel || (selected && !isRotacion)) && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-2">
            {selectedModel ? `Modelo: ${selectedModel}` : selected} · {filtered.length} SKUs
          </div>
          <div className="table-scroll" style={{ maxHeight: 400 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['Línea','Referencia','Modelo','Saldo','Vr. Existencia','Última Salida','Días','Estado'].map(h => (
                    <th
                      key={h}
                      className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${
                        ['Saldo','Vr. Existencia','Días'].includes(h) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const estado = String(r['Estado'] ?? '')
                  return (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] text-[var(--text-sub)]">{r['Línea'] ?? ''}</td>
                      <td className="px-[10px] py-[9px] text-[var(--text-sub)] num text-[11px]">{r['Referencia'] ?? ''}</td>
                      <td className="px-[10px] py-[9px]"><span className="font-medium text-[var(--text)]">{r['Modelo'] ?? ''}</span></td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{fmtN(parseNum(r['Saldo (und)']))}</td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]"><span className="text-[#f59e0b]">{fmt(parseNum(r['Vr. Existencia ($)']))}</span></td>
                      <td className="px-[10px] py-[9px] text-[var(--text-sub)]">{r['Última Salida'] ?? ''}</td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px]"><span className="font-semibold text-[var(--text-sub)]">{fmtN(parseNum(r['Días Sin Rotar']))}</span></td>
                      <td className="px-[10px] py-[9px]"><Badge variant={ESTADO_VARIANTS[estado] ?? 'gray'}>{estado}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
