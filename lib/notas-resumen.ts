/**
 * Resumen de notas por cliente para el tablero de Gestión Cartera.
 * Permite ver de un vistazo quién registró la última gestión de cada
 * cliente cuando varios usuarios trabajan sobre el mismo tablero.
 */

export interface UltimaNota {
  usuario: string
  fecha: string
  hora: string
  tipo: string
}

export interface ResumenNotas {
  ultima: UltimaNota | null
  total: number
}

/**
 * Agrupa GC_Notas por NIT. La "última" es la más reciente por fecha+hora,
 * comparadas como texto porque ambas vienen en formato ordenable
 * (YYYY-MM-DD y HH:MM).
 */
export function notasResumen(
  notas: Record<string, string>[]
): Record<string, ResumenNotas> {
  const out: Record<string, ResumenNotas> = {}

  for (const n of notas) {
    const nit = (n['NIT'] ?? '').trim()
    if (!nit) continue

    const fecha = n['Fecha'] ?? ''
    const hora  = n['Hora'] ?? ''
    out[nit] ??= { ultima: null, total: 0 }
    out[nit].total += 1

    const prev = out[nit].ultima
    const esMasReciente = !prev || `${fecha}${hora}` > `${prev.fecha}${prev.hora}`
    if (esMasReciente) {
      out[nit].ultima = {
        usuario: (n['Usuario'] ?? '').trim(),
        fecha,
        hora,
        tipo: (n['Tipo'] ?? '').trim() || 'nota',
      }
    }
  }

  return out
}

/** Iniciales para el avatar del autor: "Cristian Montaña" → "CM". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}
