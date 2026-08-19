// Identidad de cliente — regla de negocio (2026-08-19):
// El export del ERP concatena "RAZÓN SOCIAL/NOMBRE COMERCIAL" en la columna
// Cliente (el nombre comercial es el campo REPRESENTA del ERP). El REPRESENTA
// identifica al cliente real: une NITs distintos del mismo dueño y separa
// clientes distintos que facturan por el mismo NIT (p.ej. sucursales).
// Sin REPRESENTA, el cliente se identifica por NIT base + nombre.
//
// Este módulo es puro (sin googleapis) — seguro para importar en componentes
// cliente ('use client') y en server components.

/** NIT sin el sufijo de sucursal: "830092713-8  Ç" → "830092713-8" */
export function nitBase(nit: string | undefined): string {
  return (nit ?? '').trim().split(/\s+/)[0] ?? ''
}

/** Nombre comercial (REPRESENTA): texto después del primer "/" en Cliente. */
export function parseRepresenta(nombre: string | undefined): string {
  const s = nombre ?? ''
  const idx = s.indexOf('/')
  if (idx < 0) return ''
  return s.slice(idx + 1).replace(/\s+/g, ' ').trim()
}

/** Razón social: texto antes del primer "/" (o el nombre completo si no hay). */
export function razonSocial(nombre: string | undefined): string {
  const s = nombre ?? ''
  const idx = s.indexOf('/')
  return (idx < 0 ? s : s.slice(0, idx)).trim()
}

/**
 * Nombre base de una sucursal numerada: quita el número de tienda al inicio
 * o al final del REPRESENTA ("40 TITINOS", "ENGATIVA #1", "CALI2" → base).
 * Números internos se conservan ("RESTREPO 2 DELIO EXTRA" no cambia).
 */
export function baseSucursal(rep: string): string {
  let r = rep.replace(/\s+/g, ' ').trim()
  r = r.replace(/^\d+[\s.-]+/, '')
  r = r.replace(/[\s#.-]*\d+$/, '').trim()
  r = r.replace(/[\s#.-]+$/, '').trim()
  return r
}

// Única consolidación de tiendas numeradas autorizada por el usuario
// (2026-08-19): TITINOS. El resto de sucursales numeradas ("CHIA 3",
// "loc 41"…) se dejan como clientes separados — los nombres se van a
// ajustar directamente en el ERP/Sheets.
const CONSOLIDAR_BASES = new Set(['TITINOS'])

/**
 * Clave de agrupación del cliente.
 * Con REPRESENTA → la clave es el nombre comercial (une NITs del mismo dueño
 * y separa clientes que facturan por el mismo NIT). Las tiendas numeradas de
 * las bases en CONSOLIDAR_BASES ("40 TITINOS", "41 TITINOS"…) se consolidan
 * en un solo cliente, siempre dentro del mismo NIT (el nombre base sin NIT
 * uniría dueños distintos con tiendas homónimas).
 * Sin REPRESENTA → NIT base + nombre normalizado.
 */
export function claveCliente(nit: string | undefined, nombre: string | undefined): string {
  const rep = parseRepresenta(nombre)
  if (rep) {
    const repU = rep.toUpperCase()
    const base = baseSucursal(rep).toUpperCase()
    if (base !== repU && CONSOLIDAR_BASES.has(base)) return 'R|' + base + '|' + nitBase(nit)
    return 'R|' + repU
  }
  const nom = (nombre ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  return 'N|' + nitBase(nit) + '|' + nom
}

/**
 * Nombre a mostrar: el REPRESENTA si existe, si no el nombre completo.
 * Para las bases consolidadas se muestra el nombre sin número de tienda.
 */
export function nombreCliente(nombre: string | undefined): string {
  const rep = parseRepresenta(nombre)
  if (!rep) return (nombre ?? '').trim()
  const base = baseSucursal(rep)
  return CONSOLIDAR_BASES.has(base.toUpperCase()) ? base : rep
}
