'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
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
  clave: string
  nit: string
  nombre: string
  ciudad?: string
  unidades: number
  valor: number
  deuda: number
  vendedor: string
}

interface ClienteDeVendedor {
  nit: string
  nombre: string
  activo: boolean
  ultimaCompra: string
  diasSinComprar: number
}

interface VendedorClientes {
  vendedor: string
  total: number
  activos: number
  inactivos: number
  clientes: ClienteDeVendedor[]
}

interface ClienteInactivo {
  nit: string
  nombre: string
  vendedor: string
  ultimaCompra: string
  diasSinComprar: number
}

interface Props {
  todosClientes: Cliente[]
  vendidosCliente: Row[]
  carteraRows: Row[]
  totalVal: number
  topValor: number
  clientesPorVendedor: VendedorClientes[]
  clientesInactivos: ClienteInactivo[]
  añoEnCuestion: number
}

type Modulo = 'clientes' | 'vendedores' | 'inactivos'

export default function ClientesInteractivo({ todosClientes, vendidosCliente, carteraRows, totalVal, topValor, clientesPorVendedor, clientesInactivos, añoEnCuestion }: Props) {
  // Módulo activo (hub de navegación)
  const [moduloActivo, setModuloActivo] = useState<Modulo | null>(null)
  // Nivel 1: cliente seleccionado (clave de agrupación REPRESENTA/NIT+nombre)
  const [selectedClave, setSelectedClave] = useState<string | null>(null)
  // Filtro vendedor para tabla de inactivos
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  // Búsqueda y expansión en tabla de clientes
  const [busqueda, setBusqueda] = useState<string>('')
  const [expandido, setExpandido] = useState<boolean>(false)
  const FILAS_DEFECTO = 20
  // Nivel 2: código seleccionado
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  const nivel2Ref = useRef<HTMLDivElement>(null)
  const nivel3Ref = useRef<HTMLDivElement>(null)
  // Vendedor seleccionado para drill-down
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null)
  const vendedorDetalleRef = useRef<HTMLDivElement>(null)


  // ── Nivel 2: códigos comprados por el cliente seleccionado ───────────
  const nivel2Rows = useMemo(() => {
    if (!selectedClave) return []
    const filasCliente = vendidosCliente.filter(r => r['Clave'] === selectedClave)
    // Agrupar por Código: cuántos códigos compra y cuánto por cada uno
    const map: Record<string, { key: string; codigo: string; referencia: string; marca: string; modelo: string; cantidad: number; valor: number }> = {}
    filasCliente.forEach(r => {
      const key = r['Código'] || r['Referencia'] || r['Modelo'] || '—'
      if (!map[key]) {
        map[key] = {
          key,
          codigo:     r['Código']     || '—',
          referencia: r['Referencia'] || '—',
          marca:      r['Marca']      || '',
          modelo:     r['Modelo']     || '',
          cantidad:   0,
          valor:      0,
        }
      }
      map[key].cantidad += parseNum(r['Cantidad'])
      map[key].valor    += parseNum(r['Vr. Bruto ($)'])
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [selectedClave, vendidosCliente])

  const maxRef = nivel2Rows[0]?.valor ?? 1

  // ── Deuda del cliente seleccionado (facturas pendientes de cartera) ──
  const carteraCliente = useMemo(() => {
    if (!selectedClave) return []
    return carteraRows
      .filter(r => r['Clave'] === selectedClave)
      .sort((a, b) => parseNum(b['Días']) - parseNum(a['Días']))
  }, [selectedClave, carteraRows])
  const deudaCliente = carteraCliente.reduce((s, r) => s + parseNum(r['Saldo ($)']), 0)

  // ── Nivel 3: facturas del cliente + código seleccionados ─────────────
  const nivel3Rows = useMemo(() => {
    if (!selectedClave || !selectedRef) return []
    return vendidosCliente
      .filter(r => r['Clave'] === selectedClave && (r['Código'] || r['Referencia'] || r['Modelo'] || '—') === selectedRef)
      .sort((a, b) => {
        // Ordenar por fecha descendente si existe
        const fa = a['Fecha'] ?? '', fb = b['Fecha'] ?? ''
        return fb.localeCompare(fa)
      })
  }, [selectedClave, selectedRef, vendidosCliente])

  const selectedRefData = selectedRef ? nivel2Rows.find(r => r.key === selectedRef) : null

  // Scroll automático al aparecer cada nivel
  useEffect(() => {
    if (selectedClave) {
      setTimeout(() => nivel2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [selectedClave])

  useEffect(() => {
    if (selectedRef) {
      setTimeout(() => nivel3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [selectedRef])

  // Clientes filtrados por búsqueda y limitados por expansión
  const clientesFiltrados = useMemo(() => {
    if (!busqueda.trim()) return todosClientes
    const q = busqueda.trim().toLowerCase()
    return todosClientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.nit.toLowerCase().includes(q) ||
      c.vendedor.toLowerCase().includes(q)
    )
  }, [busqueda, todosClientes])

  const hayBusqueda    = busqueda.trim().length > 0
  const clientesMostrados = (hayBusqueda || expandido)
    ? clientesFiltrados
    : clientesFiltrados.slice(0, FILAS_DEFECTO)
  const hayMas = !hayBusqueda && !expandido && clientesFiltrados.length > FILAS_DEFECTO

  const selectedCliente = selectedClave ? todosClientes.find(c => c.clave === selectedClave) : null

  // Inactivos filtrados por vendedor
  const inactivosFiltrados = useMemo(() => {
    if (filtroVendedor === 'todos') return clientesInactivos
    return clientesInactivos.filter(c => c.vendedor === filtroVendedor)
  }, [filtroVendedor, clientesInactivos])

  const maxVendedorClientes = clientesPorVendedor[0]?.total ?? 1

  const toggleVendedor = (vendedor: string) => {
    setSelectedVendedor(prev => prev === vendedor ? null : vendedor)
  }

  useEffect(() => {
    if (selectedVendedor) {
      setTimeout(() => vendedorDetalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [selectedVendedor])

  const vendedorSeleccionadoData = selectedVendedor
    ? clientesPorVendedor.find(v => v.vendedor === selectedVendedor) ?? null
    : null

  const toggleCliente = (clave: string) => {
    setSelectedRef(null)
    setSelectedClave(prev => prev === clave ? null : clave)
  }

  const toggleRef = (ref: string) => {
    setSelectedRef(prev => prev === ref ? null : ref)
  }

  return (
    <>
      {/* ══ HUB: navegación de análisis ══ */}
      {!moduloActivo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Botón: Clientes del período */}
          <button
            onClick={() => setModuloActivo('clientes')}
            className="group flex flex-col gap-4 rounded-card border p-5 bg-[var(--card)] border-[var(--border)] shadow-card hover:shadow-card-hover hover:border-[var(--brand-blue)]/50 cursor-pointer transition-all text-left"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-[#1a3a8f]/10 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="text-[#1a3a8f]">
                  <path d="M2 5h16M2 10h16M2 15h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-[var(--text-muted)] group-hover:text-[#1a3a8f] transition-colors text-[18px] leading-none">→</span>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Clientes del período</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-snug">Lista completa · búsqueda · drill-down por producto y factura</div>
            </div>
            <div className="mt-auto pt-2 border-t border-[var(--border)]">
              <span className="text-[24px] font-bold text-[#1a3a8f] num leading-none">{todosClientes.length}</span>
              <span className="text-[11px] text-[var(--text-muted)] ml-1.5">clientes</span>
            </div>
          </button>

          {/* Botón: Por Vendedor */}
          <button
            onClick={() => setModuloActivo('vendedores')}
            className="group flex flex-col gap-4 rounded-card border p-5 bg-[var(--card)] border-[var(--border)] shadow-card hover:shadow-card-hover hover:border-[#a78bfa]/50 cursor-pointer transition-all text-left"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-[#a78bfa]/10 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="text-[#a78bfa]">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-[var(--text-muted)] group-hover:text-[#a78bfa] transition-colors text-[18px] leading-none">→</span>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Por Vendedor</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-snug">Clientes asignados por vendedor · activos e inactivos · año {añoEnCuestion}</div>
            </div>
            <div className="mt-auto pt-2 border-t border-[var(--border)]">
              <span className="text-[24px] font-bold text-[#a78bfa] num leading-none">{clientesPorVendedor.length}</span>
              <span className="text-[11px] text-[var(--text-muted)] ml-1.5">vendedores</span>
            </div>
          </button>

          {/* Botón: Sin actividad */}
          <button
            onClick={() => setModuloActivo('inactivos')}
            className={`group flex flex-col gap-4 rounded-card border p-5 bg-[var(--card)] border-[var(--border)] shadow-card hover:shadow-card-hover cursor-pointer transition-all text-left ${
              clientesInactivos.length > 0 ? 'hover:border-[#f97316]/50' : 'hover:border-[#22c55e]/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${clientesInactivos.length > 0 ? 'bg-[#f97316]/10' : 'bg-[#22c55e]/10'}`}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className={clientesInactivos.length > 0 ? 'text-[#f97316]' : 'text-[#22c55e]'}>
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <span className={`transition-colors text-[18px] leading-none ${clientesInactivos.length > 0 ? 'text-[var(--text-muted)] group-hover:text-[#f97316]' : 'text-[var(--text-muted)] group-hover:text-[#22c55e]'}`}>→</span>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Sin actividad reciente</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-snug">Clientes sin compra en los últimos 4 meses · exportable a Excel</div>
            </div>
            <div className="mt-auto pt-2 border-t border-[var(--border)]">
              <span className={`text-[24px] font-bold num leading-none ${clientesInactivos.length > 0 ? 'text-[#f97316]' : 'text-[#22c55e]'}`}>{clientesInactivos.length}</span>
              <span className="text-[11px] text-[var(--text-muted)] ml-1.5">clientes</span>
            </div>
          </button>
        </div>
      )}

      {/* ══ MÓDULO: Clientes por Vendedor ══ */}
      {moduloActivo === 'vendedores' && (
        <>
          <button
            onClick={() => { setModuloActivo(null); setSelectedVendedor(null) }}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] mb-4 transition-colors"
          >
            ← Volver a análisis
          </button>
          <Card title="Clientes por Vendedor" subtitle={`clientes únicos atendidos · año ${añoEnCuestion}`}>
          <div className="table-scroll" style={{ maxHeight: 248 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['Vendedor', 'Clientes', ''].map((h, i) => (
                    <th key={i} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i === 1 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesPorVendedor.map((v, i) => {
                  const isActive = selectedVendedor === v.vendedor
                  return (
                    <tr
                      key={v.vendedor}
                      onClick={() => toggleVendedor(v.vendedor)}
                      className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                          : 'hover:bg-[var(--nav-hover)]'
                      }`}
                    >
                      <td className="px-[10px] py-[9px]">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] transition-transform ${isActive ? 'text-[var(--brand-blue)] rotate-90' : 'text-[var(--text-muted)]'}`}>▸</span>
                          <span className={`text-[10px] font-semibold ${i === 0 ? 'text-[#f59e0b]' : 'text-[var(--text-muted)]'}`}>{i + 1}</span>
                          <span className="font-medium text-[var(--text)] text-[11px] break-words leading-snug">{v.vendedor}</span>
                        </div>
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] font-semibold text-[var(--brand-blue)]">
                        {v.total}
                      </td>
                      <td className="px-[10px] py-[9px] w-[110px]">
                        <div className="flex flex-col gap-[3px]">
                          <div className="w-full h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--brand-blue)] rounded-full"
                              style={{ width: `${((v.total / maxVendedorClientes) * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <div className="flex gap-1 justify-end">
                            <span className="text-[9px] text-[#22c55e] font-semibold">{v.activos}A</span>
                            <span className="text-[9px] text-[var(--text-muted)]">/</span>
                            <span className="text-[9px] text-[#f97316] font-semibold">{v.inactivos}I</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Nota aclaratoria */}
          <div className="mt-3 px-[2px] flex items-start gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)] mt-[1px] flex-shrink-0">ⓘ</span>
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              Muestra clientes únicos con al menos una compra durante el <span className="font-semibold text-[var(--text-sub)]">año {añoEnCuestion}</span>.
              El año se ajusta automáticamente según el filtro de período activo.
              Para ver la cartera total histórica usa el filtro <span className="font-semibold text-[var(--text-sub)]">Todo el historial</span>.
            </p>
          </div>
        </Card>
        </>
      )}

      {/* ══ MÓDULO: Sin actividad reciente ══ */}
      {moduloActivo === 'inactivos' && (
        <>
          <button
            onClick={() => setModuloActivo(null)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] mb-4 transition-colors"
          >
            ← Volver a análisis
          </button>
          <Card
            title="Sin actividad reciente"
            subtitle="+4 meses sin comprar · base histórica"
          >
          {/* Filtro por vendedor */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {['todos', ...clientesPorVendedor.map(v => v.vendedor)].map(v => {
              const count = v === 'todos'
                ? clientesInactivos.length
                : clientesInactivos.filter(c => c.vendedor === v).length
              if (v !== 'todos' && count === 0) return null
              return (
                <button
                  key={v}
                  onClick={() => setFiltroVendedor(v)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    filtroVendedor === v
                      ? 'bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)]'
                  }`}
                >
                  {v === 'todos' ? 'Todos' : v} <span className="opacity-70">({count})</span>
                </button>
              )
            })}
          </div>
          <div className="table-scroll" style={{ maxHeight: 210 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--card)] z-10">
                <tr>
                  {['Cliente', 'Vendedor', 'Última compra', 'Días'].map((h, i) => (
                    <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactivosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-[10px] py-[16px] text-center text-[11px] text-[var(--text-muted)]">
                      Sin clientes inactivos en este período
                    </td>
                  </tr>
                ) : inactivosFiltrados.map((c) => {
                  const nivel = c.diasSinComprar > 365
                    ? { bg: 'bg-[#ef444420]', text: 'text-[#ef4444]' }
                    : c.diasSinComprar > 180
                    ? { bg: 'bg-[#f97316]/10', text: 'text-[#f97316]' }
                    : { bg: 'bg-[#eab308]/10', text: 'text-[#eab308]' }
                  return (
                    <tr key={c.nit} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] w-[35%]">
                        <div className="font-medium text-[var(--text)] text-[11px] break-words leading-snug">{c.nombre}</div>
                        <div className="text-[10px] text-[var(--text-muted)] tabular-nums">{c.nit}</div>
                      </td>
                      <td className="px-[10px] py-[9px] text-[11px] text-[var(--text-sub)]">
                        {c.vendedor || '—'}
                      </td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                        {c.ultimaCompra}
                      </td>
                      <td className="px-[10px] py-[9px] text-right">
                        <span className={`inline-block text-[10px] font-semibold num px-1.5 py-0.5 rounded ${nivel.bg} ${nivel.text}`}>
                          {c.diasSinComprar}d
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {inactivosFiltrados.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--text-muted)]">
                {inactivosFiltrados.length} clientes · sin compra desde hace más de 4 meses
              </span>
              <button
                onClick={() => {
                  const filas = inactivosFiltrados.map(c => ({
                    'Cliente':          c.nombre,
                    'NIT':              c.nit,
                    'Vendedor':         c.vendedor || '—',
                    'Última compra':    c.ultimaCompra,
                    'Días sin comprar': c.diasSinComprar,
                  }))
                  const ws  = XLSX.utils.json_to_sheet(filas)
                  // Ancho de columnas
                  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 18 }]
                  const wb = XLSX.utils.book_new()
                  XLSX.utils.book_append_sheet(wb, ws, 'Sin actividad')
                  const label = filtroVendedor === 'todos' ? 'todos' : filtroVendedor.replace(/\s+/g, '_')
                  XLSX.writeFile(wb, `clientes_inactivos_${label}.xlsx`)
                }}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--nav-hover)] transition-colors flex-shrink-0"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <path d="M8 1v9m0 0L5 7m3 3 3-3M2 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Descargar Excel
              </button>
            </div>
          )}
        </Card>
        </>
      )}

      {/* ══ DETALLE VENDEDOR: lista de clientes activos/inactivos ══ */}
      {moduloActivo === 'vendedores' && selectedVendedor && vendedorSeleccionadoData && (
        <div ref={vendedorDetalleRef} className="mb-4">
          <Card
            title={vendedorSeleccionadoData.vendedor}
            subtitle={`${vendedorSeleccionadoData.total} clientes en el año · click en fila para cerrar`}
          >
            {/* Cabecera con resumen */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[#22c55e]/10 text-[#22c55e] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
                {vendedorSeleccionadoData.activos} activos
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[#f97316]/10 text-[#f97316] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] inline-block" />
                {vendedorSeleccionadoData.inactivos} sin actividad +4m
              </span>
              <button
                onClick={() => setSelectedVendedor(null)}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="table-scroll" style={{ maxHeight: 380 }}>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr>
                    {['Cliente', 'NIT', 'Última compra', 'Estado'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Separador activos */}
                  {vendedorSeleccionadoData.activos > 0 && (
                    <tr>
                      <td colSpan={4} className="px-[10px] py-[6px] bg-[#22c55e]/5 border-b border-[var(--border)]">
                        <span className="text-[10px] font-semibold text-[#22c55e] uppercase tracking-wider">
                          Activos — compraron en los últimos 4 meses
                        </span>
                      </td>
                    </tr>
                  )}
                  {vendedorSeleccionadoData.clientes.filter(c => c.activo).map(c => (
                    <tr key={c.nit} className="border-b border-[var(--border)] hover:bg-[var(--nav-hover)] transition-colors">
                      <td className="px-[10px] py-[9px] w-[40%]">
                        <span className="font-medium text-[var(--text)] text-[11px] break-words leading-snug">{c.nombre}</span>
                      </td>
                      <td className="px-[10px] py-[9px] num text-[10px] text-[var(--text-muted)]">{c.nit}</td>
                      <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{c.ultimaCompra}</td>
                      <td className="px-[10px] py-[9px] text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
                          Activo
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Separador inactivos */}
                  {vendedorSeleccionadoData.inactivos > 0 && (
                    <tr>
                      <td colSpan={4} className="px-[10px] py-[6px] bg-[#f97316]/5 border-b border-[var(--border)]">
                        <span className="text-[10px] font-semibold text-[#f97316] uppercase tracking-wider">
                          Sin actividad — más de 4 meses sin comprar
                        </span>
                      </td>
                    </tr>
                  )}
                  {vendedorSeleccionadoData.clientes.filter(c => !c.activo).map(c => {
                    const color = c.diasSinComprar > 365 ? '#ef4444' : '#f97316'
                    return (
                      <tr key={c.nit} className="border-b border-[var(--border)] hover:bg-[var(--nav-hover)] transition-colors">
                        <td className="px-[10px] py-[9px] w-[40%]">
                          <span className="font-medium text-[var(--text)] text-[11px] break-words leading-snug">{c.nombre}</span>
                        </td>
                        <td className="px-[10px] py-[9px] num text-[10px] text-[var(--text-muted)]">{c.nit}</td>
                        <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{c.ultimaCompra}</td>
                        <td className="px-[10px] py-[9px] text-right">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: `${color}18`, color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
                            {c.diasSinComprar}d
                          </span>
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

      {/* ══ MÓDULO: Clientes del período ══ */}
      {moduloActivo === 'clientes' && (
        <>
          <button
            onClick={() => { setModuloActivo(null); setSelectedClave(null); setSelectedRef(null) }}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] mb-4 transition-colors"
          >
            ← Volver a análisis
          </button>
          {/* ══ TABLA: Todos los clientes ══ */}
          <Card
            title="Clientes del período"
        subtitle={`${todosClientes.length} clientes · por valor comprado · click para ver productos`}
        className="mb-4"
      >
        {/* Buscador */}
        <div className="mb-3">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setExpandido(false) }}
              placeholder="Buscar por cliente, NIT o vendedor…"
              className="w-full pl-7 pr-3 py-[7px] text-[11px] bg-[var(--bar-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] transition-colors"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-[11px]"
              >✕</button>
            )}
          </div>
          {hayBusqueda && (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {clientesFiltrados.length} resultado{clientesFiltrados.length !== 1 ? 's' : ''} para &ldquo;{busqueda}&rdquo;
            </p>
          )}
        </div>

        <div className="table-scroll">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-[var(--card)] z-10">
              <tr>
                {['#', 'Cliente', 'Vendedor', 'Unidades', 'Vr. Bruto', 'Deuda', 'Participación'].map((h, i) => (
                  <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 3 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientesMostrados.map((c) => {
                const rank = Number(c._rank)
                const isActive = selectedClave === c.clave
                return (
                  <tr
                    key={c.clave}
                    onClick={() => toggleCliente(c.clave)}
                    className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                        : 'hover:bg-[var(--nav-hover)]'
                    }`}
                  >
                    <td className="px-[10px] py-[9px] w-[32px]">
                      <span className={`text-[11px] font-semibold num ${rank <= 3 ? 'text-[#f59e0b]' : 'text-[var(--text-muted)]'}`}>{rank}</span>
                    </td>
                    <td className="px-[10px] py-[9px] w-[35%]">
                      <div className="flex items-start gap-1.5">
                        <span className={`text-[10px] mt-[2px] flex-shrink-0 transition-transform ${isActive ? 'text-[var(--brand-blue)] rotate-90' : 'text-[var(--text-muted)]'}`}>▸</span>
                        <div>
                          <div className="font-medium text-[var(--text)] break-words leading-snug">{c.nombre}</div>
                          <div className="text-[10px] text-[var(--text-muted)] tabular-nums">{c.nit}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-[10px] py-[9px]">
                      <span className="text-[11px] text-[var(--text-sub)]">{c.vendedor || '—'}</span>
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">
                      {fmtN(c.unidades)}
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      <span className="text-[#22c55e]">{fmt(c.valor)}</span>
                    </td>
                    <td className="px-[10px] py-[9px] text-right num text-[11px]">
                      {c.deuda > 0
                        ? <span className="text-[#ef4444] font-semibold">{fmt(c.deuda)}</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-[10px] py-[9px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-[4px] bg-[var(--bar-bg)] rounded-full overflow-hidden" style={{ minWidth: 48 }}>
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

              {/* Fila expandir — aparece cuando hay más de 20 y no está expandido */}
              {hayMas && (
                <tr>
                  <td colSpan={7} className="px-[10px] py-[10px] text-center border-t border-[var(--border)]">
                    <button
                      onClick={() => setExpandido(true)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--brand-blue)] hover:underline transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Ver todos ({clientesFiltrados.length} clientes)
                    </button>
                  </td>
                </tr>
              )}

              {/* Fila ocultar — cuando está expandido y hay más de 20 */}
              {expandido && !hayBusqueda && clientesFiltrados.length > FILAS_DEFECTO && (
                <tr>
                  <td colSpan={7} className="px-[10px] py-[10px] text-center border-t border-[var(--border)]">
                    <button
                      onClick={() => setExpandido(false)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Ocultar — mostrar solo los primeros 20
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ══ NIVEL 2: Códigos comprados por el cliente seleccionado ══ */}
      {selectedClave && (
        <div ref={nivel2Ref} className="mb-4">
          <Card
            title={`Productos comprados — ${selectedCliente?.nombre ?? ''}`}
            subtitle="agrupado por código · click para ver facturas"
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[11px] text-[var(--text-muted)]">
                Compra <span className="font-semibold text-[var(--text)]">{nivel2Rows.length}</span> códigos distintos
                {selectedCliente ? <> · NIT {selectedCliente.nit}</> : null}
              </span>
              {deudaCliente > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[#ef4444]/10 text-[#ef4444] font-semibold">
                  Debe {fmt(deudaCliente)} · {carteraCliente.length} factura{carteraCliente.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={() => { setSelectedClave(null); setSelectedRef(null) }}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="table-scroll" style={{ maxHeight: 360 }}>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr>
                    {['Código', 'Referencia', 'Marca', 'Modelo', 'Unidades', 'Vr. Bruto', '% del cliente'].map((h, i) => (
                      <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 4 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nivel2Rows.map((row) => {
                    const isActive = selectedRef === row.key
                    const clienteTotal = nivel2Rows.reduce((s, r) => s + r.valor, 0)
                    return (
                      <tr
                        key={row.key}
                        onClick={() => toggleRef(row.key)}
                        className={`border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-[var(--bar-bg)] ring-1 ring-inset ring-[var(--border)]'
                            : 'hover:bg-[var(--nav-hover)]'
                        }`}
                      >
                        <td className="px-[10px] py-[9px]">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] transition-transform ${isActive ? 'text-[var(--brand-blue)] rotate-90' : 'text-[var(--text-muted)]'}`}>▸</span>
                            <span className="num text-[11px] font-medium text-[var(--text)]">{row.codigo}</span>
                          </div>
                        </td>
                        <td className="px-[10px] py-[9px] num text-[11px] text-[var(--text-sub)]">{row.referencia}</td>
                        <td className="px-[10px] py-[9px] text-[var(--text-sub)] text-[11px]">{row.marca}</td>
                        <td className="px-[10px] py-[9px] w-[30%]">
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

      {/* ══ CARTERA: facturas pendientes del cliente seleccionado ══ */}
      {selectedClave && carteraCliente.length > 0 && (
        <div className="mb-4">
          <Card
            title={`Cartera pendiente — ${selectedCliente?.nombre ?? ''}`}
            subtitle={`${carteraCliente.length} facturas · saldo total ${fmt(deudaCliente)}`}
          >
            <div className="table-scroll" style={{ maxHeight: 280 }}>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--card)] z-10">
                  <tr>
                    {['Factura', 'Estado', 'Fecha Vence', 'Días', 'Saldo'].map((h, i) => (
                      <th key={h} className={`px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] border-b border-[var(--border)] ${i >= 2 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {carteraCliente.map((r, i) => {
                    const dias = parseNum(r['Días'])
                    const color = dias > 90 ? '#ef4444' : dias > 30 ? '#f97316' : dias > 0 ? '#eab308' : '#22c55e'
                    return (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors">
                        <td className="px-[10px] py-[9px] num text-[11px] font-medium text-[var(--text)]">{r['Factura'] || '—'}</td>
                        <td className="px-[10px] py-[9px] text-[11px] text-[var(--text-sub)]">{r['Estado'] || '—'}</td>
                        <td className="px-[10px] py-[9px] text-right num text-[11px] text-[var(--text-sub)]">{r['Fecha Vence'] || '—'}</td>
                        <td className="px-[10px] py-[9px] text-right">
                          <span className="inline-block text-[10px] font-semibold num px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                            {dias > 0 ? `${fmtN(dias)}d vencida` : 'al día'}
                          </span>
                        </td>
                        <td className="px-[10px] py-[9px] text-right num text-[11px]">
                          <span className="text-[#ef4444] font-semibold">{fmt(parseNum(r['Saldo ($)']))}</span>
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

      {/* ══ NIVEL 3: Facturas del código seleccionado ══ */}
      {selectedClave && selectedRef && (
        <div ref={nivel3Ref}>
          <Card
            title={`Facturas — ${selectedRefData?.modelo || selectedRefData?.codigo || selectedRef}`}
            subtitle={`${selectedCliente?.nombre ?? ''} · código ${selectedRefData?.codigo ?? selectedRef} · ${nivel3Rows.length} líneas`}
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
      )}
    </>
  )
}
