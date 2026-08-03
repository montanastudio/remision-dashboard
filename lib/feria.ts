import { google } from 'googleapis'

// ID del sheet de feria. Se puede sobreescribir por entorno; si no, usa el
// compartido actual. El service account debe tener acceso de lectura al archivo.
const FERIA_ID = process.env.GOOGLE_SHEETS_ID_FERIA || '1xzv-7viLg0mwsLOdkVs4TuVApmC-VKMc_JGQNUoYN_I'

export interface FeriaProducto {
  referencia: string
  producto: string
  listaBT: number
  stockTotal: number
  descuentoPct: number    // 0, 0.2, 0.3, 0.4, 0.5
  descuentoLabel: string  // 'Sin descuento' | '20%' | ...
  descuentoColor: string  // color del badge
  precioFinal: number     // listaBT * (1 - descuentoPct), redondeado
}

// Mapeo confirmado con gerencia: el color de fondo de la columna PRODUCTO
// indica el descuento que le corresponde a cada producto en la feria.
const COLOR_DISCOUNT: { rgb: [number, number, number]; pct: number; color: string }[] = [
  { rgb: [255, 255, 255], pct: 0.00, color: '#94a3b8' }, // blanco  → sin descuento
  { rgb: [0, 176, 240],   pct: 0.50, color: '#0ea5e9' }, // azul    → 50%
  { rgb: [251, 228, 213], pct: 0.40, color: '#f97316' }, // durazno → 40%
  { rgb: [153, 255, 204], pct: 0.30, color: '#22c55e' }, // verde   → 30%
  { rgb: [255, 153, 255], pct: 0.20, color: '#d946ef' }, // rosado  → 20%
]

function matchDiscount(c?: { red?: number | null; green?: number | null; blue?: number | null } | null) {
  // La API de Sheets OMITE los canales que valen 0 (p. ej. el azul 0,176,240
  // llega como {green,blue} sin 'red'). Por eso un canal ausente = 0, no 255.
  // Si no hay color de fondo del todo, se asume blanco (sin descuento).
  if (!c) return COLOR_DISCOUNT[0]
  const r = Math.round((c.red ?? 0) * 255)
  const g = Math.round((c.green ?? 0) * 255)
  const b = Math.round((c.blue ?? 0) * 255)
  let best = COLOR_DISCOUNT[0]
  let bestDist = Infinity
  for (const cd of COLOR_DISCOUNT) {
    const d = (cd.rgb[0] - r) ** 2 + (cd.rgb[1] - g) ** 2 + (cd.rgb[2] - b) ** 2
    if (d < bestDist) { bestDist = d; best = cd }
  }
  return best
}

function parseN(v?: string | null): number {
  if (!v) return 0
  let s = String(v).trim()
  // Formato "82,353" (coma de miles) o "82.353" → quitar separadores de miles
  const commaCount = (s.match(/,/g) ?? []).length
  const dotCount = (s.match(/\./g) ?? []).length
  if (commaCount >= 1 && dotCount === 0) s = s.replace(/,/g, '')
  else if (dotCount > 1) s = s.replace(/\./g, '')
  s = s.replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

export async function getFeriaProductos(): Promise<FeriaProducto[]> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    // Fila 1 = título, fila 2 = encabezados; los datos arrancan en la fila 3.
    const res = await sheets.spreadsheets.get({
      spreadsheetId: FERIA_ID,
      ranges: ["'GENERAL'!A3:G"],
      includeGridData: true,
      fields: 'sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)',
    })
    const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    const productos: FeriaProducto[] = []
    rowData.forEach(rd => {
      const cells = rd.values ?? []
      const referencia = (cells[0]?.formattedValue ?? '').trim()
      const producto = (cells[1]?.formattedValue ?? '').trim()
      if (!referencia && !producto) return
      const listaBT = parseN(cells[2]?.formattedValue)
      const stockTotal = parseN(cells[6]?.formattedValue)
      const disc = matchDiscount(cells[1]?.effectiveFormat?.backgroundColor)
      productos.push({
        referencia, producto, listaBT, stockTotal,
        descuentoPct: disc.pct,
        descuentoLabel: disc.pct === 0 ? 'Sin descuento' : `${Math.round(disc.pct * 100)}%`,
        descuentoColor: disc.color,
        precioFinal: Math.round(listaBT * (1 - disc.pct)),
      })
    })
    return productos
  } catch {
    return []
  }
}
