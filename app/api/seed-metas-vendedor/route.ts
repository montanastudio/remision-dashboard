import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSheetData, setSheetData, rowsToObjects, normalizeVentasColumns, parseNum } from '@/lib/sheets'
import { parseFecha } from '@/lib/sheets'

const MESES_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const VENDEDORES_OBJETIVO = [
  { label: 'Margarita Marchena',    match: ['margarita', 'marchena'],               tasaCustom: null,  distribucion: 'estacional' as const },
  { label: 'Samuel Gómez',          match: ['samuel', 'gómez', 'gomez'],            tasaCustom: null,  distribucion: 'estacional' as const },
  { label: 'Gustavo Giraldo',       match: ['gustavo', 'giraldo'],                  tasaCustom: null,  distribucion: 'estacional' as const },
  { label: 'Martha López',          match: ['martha', 'marta', 'lópez', 'lopez'],   tasaCustom: null,  distribucion: 'estacional' as const },
  { label: 'Ventas Directas',       match: ['directa', 'directo', 'ventas directas'], tasaCustom: null, distribucion: 'estacional' as const },
  // Consignación: meta = +80% sobre el año base, distribuida uniformemente (patrón irregular)
  { label: 'Clientes Consignación', match: ['consign'],                             tasaCustom: 0.80,  distribucion: 'uniforme'   as const },
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

  // ── Leer ventas históricas ───────────────────────────────────────────
  let rawVentas: Record<string, string>[] = []
  try {
    rawVentas = normalizeVentasColumns(rowsToObjects(await getSheetData('RAW_Ventas')))
  } catch {
    return Response.json({ error: 'No se pudo leer RAW_Ventas' }, { status: 500 })
  }

  // Detectar el año más reciente con datos completos (año anterior al máximo)
  let maxYear = 0
  rawVentas.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (f && f.year > maxYear) maxYear = f.year
  })
  const añoBase = maxYear > 0 ? maxYear - 1 : new Date().getFullYear() - 1
  const añoMeta = añoBase + 1

  // ── Agregar ventas del año base por vendedor × mes ───────────────────
  // map: vendedorLabel → [12 valores mensuales]
  const ventasPorVendMes: Record<string, number[]> = {}
  VENDEDORES_OBJETIVO.forEach(vo => {
    ventasPorVendMes[vo.label] = Array(12).fill(0)
  })

  rawVentas.forEach(r => {
    const f = parseFecha(r['FECHA'])
    if (!f || f.year !== añoBase) return
    const mesIdx = f.mes   // 0-based
    if (mesIdx < 0 || mesIdx > 11) return

    const vend  = r['NVENDEDOR']?.trim() ?? ''
    const valor = parseNum(r['VRTOTAL'])
    if (!vend || !valor) return

    const vo = VENDEDORES_OBJETIVO.find(v => matchVendor(vend, v.match))
    if (!vo) return
    ventasPorVendMes[vo.label][mesIdx] += valor
  })

  // ── Leer meta de crecimiento (LS METAS Y PROYECCION) ─────────────────
  let metaPct = 0.10
  try {
    const metasRows = rowsToObjects(await getSheetData('LS METAS Y PROYECCION'))
    const claves = ['Crecimiento (%)', 'Meta (%)', 'Crecimiento', 'Growth', 'Porcentaje']
    outer: for (const row of metasRows) {
      for (const k of claves) {
        if (row[k] !== undefined) {
          const v = parseNum(row[k])
          if (v > 0) { metaPct = v > 1 ? v / 100 : v; break outer }
        }
      }
    }
  } catch { /* usar 10% por defecto */ }

  // ── Construir filas con metas proyectadas ────────────────────────────
  // Meta mensual = venta del mismo mes año base × (1 + crecimiento)
  // Si el mes base es 0, distribuye el promedio anual uniformemente
  const headers = ['Vendedor', ...MESES_LABELS, `Total ${añoMeta}`]

  const filas: string[][] = VENDEDORES_OBJETIVO.map((vo, rowIdx) => {
    const meses     = ventasPorVendMes[vo.label]
    const totalBase = meses.reduce((s, v) => s + v, 0)
    const tasa      = vo.tasaCustom !== null ? vo.tasaCustom : metaPct
    const metaAnual = Math.round(totalBase * (1 + tasa))

    let metasMes: number[]

    if (vo.distribucion === 'uniforme') {
      // Reparte la meta anual en 12 cuotas iguales
      const cuota = Math.round(metaAnual / 12)
      metasMes = Array(12).fill(cuota)
    } else {
      // Distribuye respetando la estacionalidad del año base
      const promedioMes = totalBase / 12
      metasMes = meses.map(v => {
        const base = v > 0 ? v : promedioMes
        return Math.round(base * (1 + tasa))
      })
    }

    const sheetRow     = rowIdx + 2
    const totalFormula = `=SUMA(B${sheetRow}:M${sheetRow})`

    return [vo.label, ...metasMes.map(String), totalFormula]
  })

  // ── Escribir en LS_METAS_VENDEDOR ────────────────────────────────────
  await setSheetData('LS_METAS_VENDEDOR', [headers, ...filas])

  // Resumen para la respuesta
  const resumen = VENDEDORES_OBJETIVO.map((vo, i) => {
    const totalAnual = filas[i].slice(1, 13).reduce((s, v) => s + Number(v), 0)
    const tasa = vo.tasaCustom !== null ? vo.tasaCustom : metaPct
    return {
      vendedor:     vo.label,
      metaAnual:    Math.round(totalAnual),
      tasa:         `${(tasa * 100).toFixed(0)}%`,
      distribucion: vo.distribucion,
    }
  })

  return Response.json({
    ok: true,
    mensaje: `Metas ${añoMeta} generadas desde datos de ${añoBase}`,
    crecimientoGeneral: `${(metaPct * 100).toFixed(1)}%`,
    vendedores: resumen,
  })
}
