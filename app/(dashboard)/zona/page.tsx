import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects, parseNum } from '@/lib/sheets'
import { filtrarVentas } from '@/lib/filtro-ventas'
import { ZONAS_CONFIG } from '@/lib/zonas-config'
import ZonaInteractivo from './ZonaInteractivo'

export const dynamic = 'force-dynamic'

// ── Normaliza string: minúsculas, sin tildes, sin chars especiales ──────
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, '').trim()
}

// Mapa de nombre de departamento normalizado → código DANE 2 dígitos
const dptoCodMap: Record<string, string> = {}
ZONAS_CONFIG.forEach(z => {
  z.deptos.forEach(d => {
    dptoCodMap[norm(d.nombre)] = d.cod.padStart(2, '0')
  })
})

// Aliases: abreviaciones que usa el ERP que no coinciden con el nombre oficial
const DEPTO_ALIASES: Record<string, string> = {
  'valle':    '76', // Valle del Cauca
  'guajira':  '44', // La Guajira
  'bolivar':  '13', // Bolívar
  'cordoba':  '23', // Córdoba
  'narino':   '52', // Nariño
  'san andres': '88',
}
Object.assign(dptoCodMap, DEPTO_ALIASES)

// Fallback ciudad→departamento para ciudades sin sufijo de depto en CIUDAD
const CIUDAD_FALLBACK: Record<string, string> = {
  // Huila
  'neiva': '41', 'la plata': '41', 'pitalito': '41', 'garzon': '41',
  // Cauca
  'popayan': '19', 'piendamo': '19', 'santander de quilichao': '19',
  'puerto tejada': '19', 'guapi': '19',
  // Bolívar
  'cartagena': '13', 'magangue': '13', 'el carmen de bolivar': '13',
  // Bogotá
  'bogota': '11',
  // Chocó
  'quibdo': '27',
  // Antioquia
  'medellin': '05', 'santa rosa de osos': '05', 'apartado': '05',
  'turbo': '05', 'caucasia': '05', 'envigado': '05', 'bello': '05',
  'itagui': '05', 'rionegro': '05',
  // Córdoba
  'monteria': '23', 'lorica': '23', 'cerete': '23', 'montelibano': '23',
  // Santander
  'bucaramanga': '68', 'san gil': '68', 'lebrija': '68', 'socorro': '68',
  'velez': '68', 'giron': '68', 'piedecuesta': '68', 'floridablanca': '68',
  // Sucre
  'corozal': '70', 'since': '70', 'sincelejo': '70',
  // Caquetá
  'florencia': '18',
  // Valle del Cauca
  'palmira': '76', 'tulua': '76', 'cartago': '76', 'buga': '76',
  'buenaventura': '76', 'jamundi': '76', 'florida': '76', 'pradera': '76',
  // Caldas
  'manizales': '17', 'la dorada': '17', 'chinchina': '17',
  // Risaralda
  'santa rosa de cabal': '66', 'dosquebradas': '66',
  // Tolima
  'fresno': '73', 'espinal': '73', 'melgar': '73', 'honda': '73',
  'ibague': '73',
  // Casanare
  'tauramena': '85', 'yopal': '85', 'aguazul': '85', 'villanueva': '85',
  // Arauca
  'arauquita': '81', 'arauca': '81', 'tame': '81',
  // Boyacá
  'sogamoso': '15', 'duitama': '15', 'chiquinquira': '15', 'soata': '15', 'socha': '15',
  // Antioquia (adicionales)
  'san pedro de los milagros': '05', 'lorica': '23',
  // Cundinamarca
  'zipaquira': '25', 'chia': '25', 'cajica': '25', 'facatativa': '25',
  'fusagasuga': '25', 'girardot': '25', 'mosquera': '25', 'soacha': '25',
  // Nariño
  'pasto': '52', 'tumaco': '52', 'ipiales': '52', 'la union': '52',
  // Valle del Cauca (adicionales)
  'cali': '76', 'buga valle': '76',
  // Norte de Santander
  'cucuta': '54', 'pamplona': '54', 'ocana': '54',
  // Guaviare
  'san jose del guaviare': '95', 'san jose guaviare': '95',
  // Cesar
  'valledupar': '20', 'la jagua de ibirico': '20', 'aguachica': '20',
  // Magdalena
  'santa marta': '47', 'cienaga': '47',
  // Atlántico
  'barranquilla': '08', 'soledad': '08', 'malambo': '08',
  // Meta
  'villavicencio': '50', 'granada': '50', 'acacias': '50',
  // Quindío
  'armenia': '63', 'calarca': '63',
  // Putumayo
  'mocoa': '86', 'puerto asis': '86',
}

/**
 * Extrae el código DANE del departamento a partir del campo CIUDAD del ERP.
 * Capa 1: sufijos — "ARAUCA ARAUCA", "CALI VALLE DEL CAUCA"
 * Capa 2: búsqueda interna — "MEDELLIN-ANTIOQUIA ENVIAR MENSAJE"
 * Capa 3: fallback ciudad conocida — "NEIVA", "BOGOTA"
 */
function extractCod(ciudad: string): string {
  if (!ciudad.trim()) return ''
  const normFull = norm(ciudad)
  const parts    = ciudad.toUpperCase().trim().split(/\s+/)

  // Normalizar guiones como espacios (ej. "MEDELLIN-ANTIOQUIA" → "MEDELLIN ANTIOQUIA")
  const clean = ciudad.toUpperCase().trim().replace(/-/g, ' ')
  const cleanNorm = norm(clean)
  const parts2 = clean.split(/\s+/)

  // Capa 1: sufijo de longitud decreciente
  for (let len = parts2.length - 1; len >= 1; len--) {
    const candidate = norm(parts2.slice(parts2.length - len).join(' '))
    const cod = dptoCodMap[candidate]
    if (cod) return cod
  }

  // Capa 2: palabra completa de departamento dentro del string
  for (const [deptNorm, cod] of Object.entries(dptoCodMap)) {
    if (cleanNorm === deptNorm || cleanNorm.includes(' ' + deptNorm + ' ') ||
        cleanNorm.startsWith(deptNorm + ' ') || cleanNorm.endsWith(' ' + deptNorm)) {
      return cod
    }
  }

  // Capa 3: fallback por nombre de ciudad conocida
  return CIUDAD_FALLBACK[cleanNorm] ?? CIUDAD_FALLBACK[norm(parts2[0] || '')] ?? ''
}

export default async function ZonaPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  const role    = (session?.user as { role?: string })?.role ?? ''
  const perms   = await getPermissions()
  if (!canAccess(role, 'zona', perms)) redirect('/resumen')

  const sp = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]![0] : searchParams[k] ?? undefined)
  const filtroParams = { filtro: sp('filtro'), m: sp('m'), y: sp('y'), desde: sp('desde'), hasta: sp('hasta') }

  type Row = Record<string, string>
  let rawRows: Row[] = []

  try {
    const raw = await getSheetData('LS_VENTAS')
    rawRows = rowsToObjects(raw)
  } catch {
    // empty
  }

  const filtrados = filtrarVentas(rawRows, filtroParams)

  // Enriquecer cada fila con los campos que ZonaInteractivo necesita:
  // - 'Cód. Depto': código DANE 2 dígitos (ej. "81")
  // - 'Ciudad': nombre de ciudad para mostrar en modal (usamos CIUDAD completo)
  const detalle: Row[] = filtrados.map(r => ({
    ...r,
    'Cód. Depto': extractCod(r['CIUDAD'] ?? ''),
    'Ciudad':     r['CIUDAD'] ?? '',
    'Valor Bruto ($)': r['VRTOTAL'] ?? '0',
    'Cantidad':   r['CANTIDAD'] ?? '0',
  }))

  const detalleHeaders = ['Cód. Depto', 'Ciudad', 'Vendedor', 'Cliente', 'Referencia', 'Grupo', 'Cantidad', 'Valor Bruto ($)']

  // Enriquecer detalle también con los campos de display
  const detalleDisplay: Row[] = detalle.map(r => ({
    'Cód. Depto':     r['Cód. Depto'],
    'Ciudad':         r['Ciudad'],
    'Vendedor':       r['NVENDEDOR'] ?? '',
    'Cliente':        r['NCLIENTE']  ?? '',
    'Referencia':     r['REFERENCIA'] ?? '',
    'Grupo':          r['NGRUPO']    ?? '',
    'Cantidad':       r['CANTIDAD']  ?? '',
    'Valor Bruto ($)': r['VRTOTAL']  ?? '',
  }))

  const totalValor = detalle.reduce((s, r) => s + parseNum(r['Valor Bruto ($)']), 0)
  const ciudadesTotal = new Set(
    detalle.map(r => String(r['Ciudad'] ?? '').trim()).filter(Boolean)
  ).size

  return (
    <div className="fade-in-up">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Análisis por zona
      </div>

      <ZonaInteractivo
        detalle={detalleDisplay}
        detalleHeaders={detalleHeaders}
        totalValor={totalValor}
        ciudadesTotal={ciudadesTotal}
      />
    </div>
  )
}
