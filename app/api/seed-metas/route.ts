import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSheetData, setSheetData, rowsToObjects, normalizeVentasColumns, parseNum } from '@/lib/sheets'

const VENDEDORES_OBJETIVO = [
  { label: 'Ventas Directas',       match: ['directa', 'directo', 'ventas directas'] },
  { label: 'Clientes Consignación', match: ['consign'] },
  { label: 'Samuel Gómez',          match: ['samuel', 'gómez', 'gomez'] },
  { label: 'Margarita Marchena',    match: ['margarita', 'marchena'] },
  { label: 'Gustavo Giraldo',       match: ['gustavo', 'giraldo'] },
  { label: 'Martha López',          match: ['martha', 'marta', 'lópez', 'lopez'] },
]

function matchVendor(nombre: string, terms: string[]): boolean {
  const n = nombre.toLowerCase()
  return terms.some(t => n.includes(t))
}

export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (role !== 'Administrador') {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Fetch sheets
  const añoAnterior = new Date().getFullYear() - 1

  const [vh, mt] = await Promise.all([
    getSheetData('RAW_Ventas_Excel'),
    getSheetData('LS METAS Y PROYECCION'),
  ])
  const ventasHistorico = normalizeVentasColumns(rowsToObjects(vh))
  const metasRows = rowsToObjects(mt)

  // Parse meta de crecimiento
  let metaPct = 0.10
  const clavesMeta = ['Crecimiento (%)', 'Meta (%)', 'Crecimiento', 'Meta Crecimiento', 'Growth', 'Porcentaje']
  outer: for (const r of metasRows) {
    for (const k of clavesMeta) {
      if (r[k] !== undefined) {
        const v = parseNum(r[k])
        if (v > 0) { metaPct = v > 1 ? v / 100 : v; break outer }
      }
    }
    for (const k of Object.keys(r)) {
      const v = parseNum(r[k])
      if (v > 0) { metaPct = v > 1 ? v / 100 : v; break outer }
    }
  }

  // Totales 2025 por vendedor
  const ventas2025: Record<string, number> = {}
  let total2025 = 0

  ventasHistorico.forEach((r) => {
    const codigo = (r['Código'] || r['Codigo'] || r['codigo'] || '').trim()
    if (!codigo) return
    const mesStr = (r['Mes'] || '').toLowerCase().trim()
    const añoMatch = mesStr.match(/\b(20\d{2})\b/)
    if (!añoMatch || parseInt(añoMatch[1]) !== añoAnterior) return
    const vendedor = (r['Vendedor'] || r['Nombre Vendedor'] || r['NombreVendedor'] || '').trim()
    if (!vendedor) return
    const valor = parseNum(r['Valor Bruto ($)'] || '0')
    const dev = parseNum(r['Devolución'] || r['Devolucion'] || '0')
    const neto = valor - dev
    if (neto <= 0) return
    ventas2025[vendedor] = (ventas2025[vendedor] || 0) + neto
    total2025 += neto
  })

  const total2026 = total2025 * (1 + metaPct)
  const metaMensualTotal = total2026 / 12

  // Calcular metas por vendedor
  const filas = VENDEDORES_OBJETIVO.map(vo => {
    const base2025 = Object.entries(ventas2025)
      .filter(([n]) => matchVendor(n, vo.match))
      .reduce((s, [, v]) => s + v, 0)

    const proporcion = total2025 > 0 ? base2025 / total2025 : 1 / VENDEDORES_OBJETIVO.length
    const metaMensual = metaMensualTotal * proporcion
    const metaAnual = metaMensual * 12

    return [
      vo.label,
      Math.round(metaMensual).toString(),
      Math.round(metaAnual).toString(),
      Math.round(base2025).toString(),
      `${(metaPct * 100).toFixed(1)}%`,
      `${(proporcion * 100).toFixed(2)}%`,
    ]
  })

  const headers = [
    'Vendedor',
    'Meta Mensual ($)',
    'Meta Anual ($)',
    `Base ${añoAnterior} ($)`,
    'Crecimiento (%)',
    'Proporción (%)',
  ]

  await setSheetData('LS_METAS_VENDEDORES', [headers, ...filas])

  return Response.json({
    ok: true,
    metaPct: `${(metaPct * 100).toFixed(1)}%`,
    total2025: Math.round(total2025),
    total2026: Math.round(total2026),
    vendedores: filas.length,
  })
}
