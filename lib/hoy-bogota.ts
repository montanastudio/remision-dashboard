/**
 * Fecha y hora en zona horaria de Colombia.
 *
 * Sin esto el módulo usaba `new Date().toISOString()`, que es UTC. Colombia
 * es UTC-5, así que entre las 7 p. m. y la medianoche el "hoy" de UTC ya es
 * el día siguiente: marcar un cliente como contactado a esa hora guardaba la
 * fecha de mañana y el botón quedaba encendido todo el día siguiente.
 *
 * Módulo puro (sin googleapis) para poder usarlo también en componentes
 * cliente, donde además corrige el caso de un navegador en otra zona.
 */

const ZONA = 'America/Bogota'

/** 'YYYY-MM-DD' del día actual en Colombia. */
export function hoyBogota(): string {
  // 'en-CA' produce exactamente YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
}

/** 'HH:MM' (24 h) de la hora actual en Colombia. */
export function horaBogota(): string {
  return new Date().toLocaleTimeString('es-CO', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** 'YYYY-MM-DD' desplazado N días respecto de hoy en Colombia. */
export function diaBogota(offsetDias: number): string {
  const hoy = hoyBogota()
  const [y, m, d] = hoy.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + offsetDias)
  return base.toISOString().slice(0, 10)
}
