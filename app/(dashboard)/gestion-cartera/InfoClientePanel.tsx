'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BUCKETS_CANONICOS } from '@/lib/cartera-normalize'

// Saldo por bucket canónico — las claves son los nombres de BUCKETS_CANONICOS
type Aging = Record<string, number>
interface Lugar {
  nombre: string; totalAdeudado: number; facturas: number
}
interface Factura {
  numero: string; tipo: string; lugar: string
  fechaEmision: string; fechaVencimiento: string
  valor: number; total: number; abonado: number
  diasVencido: number; bucket: string; enMora: boolean
}
interface Abono {
  recibo: string; fecha: string; factura: string; monto: number
}
interface DetalleData {
  nit: string; totalFacturas: number; totalAdeudado: number
  aging: Aging; lugares: Lugar[]; facturas: Factura[]
  abonos: Abono[]; totalAbonado: number; ultimoAbono: Abono | null
}

function fmt(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + ' M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}
function fmtFull(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

const BUCKET_STYLE: Record<string, { bg: string; text: string; bar: string }> = {
  // Nuevos nombres
  'Jurídico':         { bg: 'bg-red-100 dark:bg-red-950/50',       text: 'text-red-800 dark:text-red-300',    bar: 'bg-red-800' },
  'Prejurídico':      { bg: 'bg-red-100 dark:bg-red-950/50',       text: 'text-red-600 dark:text-red-400',    bar: 'bg-red-500' },
  'Mora':             { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-600',                   bar: 'bg-orange-500' },
  'Vencida':          { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-500',                   bar: 'bg-orange-400' },
  'Próximo a vencer': { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-600',                   bar: 'bg-yellow-400' },
  '1-30 días':        { bg: 'bg-green-100 dark:bg-green-950/50',   text: 'text-green-700',                    bar: 'bg-green-400' },
  'No vencida':       { bg: 'bg-green-100 dark:bg-green-950/50',   text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' },
  // Legacy
  '+90 días':   { bg: 'bg-red-100 dark:bg-red-950/50',       text: 'text-red-800 dark:text-red-300',    bar: 'bg-red-800' },
  '61-90 días': { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-600',                   bar: 'bg-orange-500' },
  '31-60 días': { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-500',                   bar: 'bg-orange-400' },
}

interface Props { nit: string; nombre: string; onClose: () => void }

export default function InfoClientePanel({ nit, nombre, onClose }: Props) {
  const [data, setData] = useState<DetalleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'resumen' | 'facturas' | 'abonos'>('resumen')
  const [lugarFiltro, setLugarFiltro] = useState<string>('__todos__')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gestion-cartera/clientes/detalle?nit=${encodeURIComponent(nit)}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [nit])

  const ag = data?.aging
  const total = data?.totalAdeudado ?? 0
  const agingItems = ag
    ? BUCKETS_CANONICOS.map((b) => ({ label: b, value: ag[b] ?? 0, key: b }))
    : []

  const multiLugar = (data?.lugares?.length ?? 0) > 1

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed top-0 right-0 bottom-0 z-50 w-[460px] max-w-[96vw] flex flex-col shadow-2xl"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 pr-2">
              <div className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">{nombre}</div>
              <div className="text-[11px] text-[var(--text-muted)] num mt-0.5">{nit}</div>
            </div>
            <button onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-[16px] leading-none flex-shrink-0 mt-0.5">✕</button>
          </div>

          {/* Total destacado */}
          {!loading && data && (
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Total adeudado</div>
                <div className="text-[26px] font-bold text-red-500 num leading-tight">{fmt(total)}</div>
                <div className="text-[10px] text-[var(--text-muted)] num">{fmtFull(total)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[var(--text-muted)]">{data.totalFacturas} {data.totalFacturas === 1 ? 'factura' : 'facturas'}</div>
                {multiLugar && (
                  <div className="text-[11px] text-[var(--text-muted)]">{data.lugares.length} sucursales</div>
                )}
                {data.totalAbonado > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[10px] text-[var(--text-muted)]">Abonado histórico</div>
                    <div className="text-[13px] font-bold text-green-600 dark:text-green-400 num leading-tight">{fmt(data.totalAbonado)}</div>
                    {data.ultimoAbono && (
                      <div className="text-[10px] text-[var(--text-muted)]">último: {data.ultimoAbono.fecha}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aging bar visual */}
          {!loading && ag && total > 0 && (
            <div className="space-y-1">
              <div className="h-3 rounded-full overflow-hidden flex gap-px bg-[var(--bar-bg)]">
                {agingItems.filter(i => i.value > 0).map((item) => (
                  <div key={item.key}
                    className={`h-full ${BUCKET_STYLE[item.key]?.bar ?? 'bg-gray-400'} transition-all`}
                    style={{ width: `${(item.value / total) * 100}%` }}
                    title={`${item.label}: ${fmtFull(item.value)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {agingItems.filter(i => i.value > 0).map((item) => {
                  const s = BUCKET_STYLE[item.key]
                  return (
                    <div key={item.key} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s?.bar ?? 'bg-gray-400'}`} />
                      <span className="text-[10px] text-[var(--text-muted)]">{item.label}</span>
                      <span className={`text-[10px] font-semibold ${s?.text ?? ''}`}>{fmt(item.value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Tabs */}
          {!loading && (
            <div className="flex gap-1 mt-3">
              {(['resumen', 'facturas', 'abonos'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
                    tab === t
                      ? 'bg-[var(--brand-blue)] text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bar-bg)]'
                  }`}>
                  {t === 'resumen'
                    ? (multiLugar ? `Sucursales (${data?.lugares.length})` : 'Resumen')
                    : t === 'facturas'
                      ? `Facturas (${data?.totalFacturas})`
                      : `Abonos (${data?.abonos.length ?? 0})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">Cargando...</div>
          ) : !data || (data.totalFacturas === 0 && data.abonos.length === 0) ? (
            <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">Sin datos para este NIT</div>
          ) : tab === 'abonos' ? (
            data.abonos.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
                Este cliente no registra abonos
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-[8px] border p-3 bg-green-50/50 dark:bg-green-950/20" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Total abonado</div>
                      <div className="text-[20px] font-bold text-green-600 dark:text-green-400 num leading-tight">{fmt(data.totalAbonado)}</div>
                      <div className="text-[10px] text-[var(--text-muted)] num">{fmtFull(data.totalAbonado)}</div>
                    </div>
                    <div className="text-right text-[11px] text-[var(--text-muted)]">
                      {data.abonos.length} {data.abonos.length === 1 ? 'pago' : 'pagos'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {data.abonos.map((a, i) => (
                    <div key={`${a.recibo}-${a.factura}-${i}`}
                      className="rounded-[8px] border p-3 flex items-start justify-between gap-2"
                      style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--text)] num">{a.recibo}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          {a.fecha}
                          {a.factura && <> · factura <span className="num text-[var(--text-sub)]">{a.factura}</span></>}
                        </div>
                      </div>
                      <div className="text-[13px] font-bold text-green-600 dark:text-green-400 num flex-shrink-0">
                        {fmt(a.monto)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : tab === 'resumen' ? (
            <div className="space-y-3">
              {/* Aging detalle */}
              <div className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11px] font-semibold text-[var(--text-sub)] mb-2">Desglose por vencimiento</div>
                <div className="space-y-1.5">
                  {agingItems.map((item) => {
                    const s = BUCKET_STYLE[item.key]
                    const pct = total > 0 ? (item.value / total) * 100 : 0
                    return (
                      <div key={item.key} className="flex items-center gap-2">
                        <span className={`text-[10px] w-16 flex-shrink-0 font-medium ${s?.text ?? 'text-[var(--text-muted)]'}`}>{item.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--bar-bg)] overflow-hidden">
                          <div className={`h-full rounded-full ${s?.bar ?? 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--text)] num w-20 text-right">{fmt(item.value)}</span>
                        <span className="text-[10px] text-[var(--text-muted)] w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Por sucursal */}
              {multiLugar ? (
                <div className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11px] font-semibold text-[var(--text-sub)] mb-2">Deuda por sucursal / lugar</div>
                  <div className="space-y-2">
                    {data.lugares.map((l) => {
                      const pct = total > 0 ? (l.totalAdeudado / total) * 100 : 0
                      return (
                        <div key={l.nombre}>
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <span className="text-[11px] text-[var(--text-sub)] leading-tight flex-1">{l.nombre}</span>
                            <span className="text-[11px] font-semibold text-red-500 num flex-shrink-0">{fmt(l.totalAdeudado)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-[var(--bar-bg)] overflow-hidden">
                              <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)]">{l.facturas} fact.</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11px] font-semibold text-[var(--text-sub)] mb-1">Sucursal</div>
                  <div className="text-[12px] text-[var(--text)]">{data.lugares[0]?.nombre}</div>
                </div>
              )}
            </div>
          ) : (
            /* Facturas tab */
            <div>
              {/* Chips de filtro por sucursal */}
              {multiLugar && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    onClick={() => setLugarFiltro('__todos__')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      lugarFiltro === '__todos__'
                        ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--bar-bg)]'
                    }`}>
                    Todos ({data.totalFacturas})
                  </button>
                  {data.lugares.map((l) => {
                    const active = lugarFiltro === l.nombre
                    return (
                      <button
                        key={l.nombre}
                        onClick={() => setLugarFiltro(active ? '__todos__' : l.nombre)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors max-w-[180px] truncate ${
                          active
                            ? 'bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--bar-bg)]'
                        }`}
                        title={l.nombre}>
                        {l.nombre.length > 22 ? l.nombre.slice(0, 22) + '…' : l.nombre} ({l.facturas})
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="space-y-2">
              {data.facturas
                .filter((f) => lugarFiltro === '__todos__' || f.lugar === lugarFiltro)
                .map((f, i) => {
                return (
                  <div key={`${f.numero}-${i}`}
                    className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-[var(--text)] num">{f.numero}</span>
                          {f.enMora && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600">EN MORA</span>
                          )}
                        </div>
                        {(multiLugar && lugarFiltro === '__todos__') && (
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{f.lugar}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[13px] font-bold text-red-500 num">{fmt(f.total)}</div>
                        {f.total !== f.valor && (
                          <div className="text-[10px] text-[var(--text-muted)] num">Fact: {fmt(f.valor)}</div>
                        )}
                        {f.abonado > 0 && (
                          <div className="text-[10px] font-semibold text-green-600 dark:text-green-400 num">
                            Abonado: {fmt(f.abonado)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] mb-2">
                      <span>Emisión: <span className="text-[var(--text-sub)]">{f.fechaEmision}</span></span>
                      <span>Vence: <span className="text-[var(--text-sub)]">{f.fechaVencimiento}</span></span>
                      {f.diasVencido > 0 && (
                        <span className="text-red-500 font-semibold">{f.diasVencido} días vencida</span>
                      )}
                    </div>

                    {/* Bucket de esta factura */}
                    {f.total > 0 && f.bucket && (() => {
                      const s = BUCKET_STYLE[f.bucket]
                      return (
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${s?.bg ?? ''} ${s?.text ?? ''}`}>
                          {f.bucket} {fmt(f.total)}
                        </span>
                      )
                    })()}
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
