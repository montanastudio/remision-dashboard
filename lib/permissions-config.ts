export const SECTIONS = [
  'resumen', 'ventas', 'vendedores', 'clientes',
  'cartera', 'inventario', 'zona', 'configuracion',
] as const

export type Seccion = typeof SECTIONS[number]

export const SECTION_LABELS: Record<Seccion, string> = {
  resumen: 'Resumen Ejecutivo',
  ventas: 'Ventas',
  vendedores: 'Vendedores',
  clientes: 'Clientes',
  cartera: 'Cartera',
  inventario: 'Inventario',
  zona: 'Ventas por Zona',
  configuracion: 'Configuración',
}

export type RolePerms = Record<Seccion, boolean>
export type AllPerms = Record<string, RolePerms>

export const DEFAULT_PERMISSIONS: AllPerms = {
  Administrador: { resumen: true, ventas: true, vendedores: true, clientes: true, cartera: true, inventario: true, zona: true, configuracion: true },
  Gerencia:      { resumen: true, ventas: true, vendedores: true, clientes: true, cartera: true, inventario: true, zona: true, configuracion: false },
  Ventas:        { resumen: true, ventas: true, vendedores: true, clientes: true, cartera: false, inventario: false, zona: false, configuracion: false },
}

export const NEW_ROLE_DEFAULTS: RolePerms = {
  resumen: true, ventas: true, vendedores: true, clientes: true,
  cartera: false, inventario: false, zona: false, configuracion: false,
}

export const LOCKED_ROLES = ['Administrador']
