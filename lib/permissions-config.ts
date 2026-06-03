export const SECTIONS = [
  'resumen', 'ventas', 'vendedores', 'clientes',
  'cartera', 'gestion_cartera', 'inventario', 'zona', 'configuracion',
  'calculadora_precios',
] as const

export type Seccion = typeof SECTIONS[number]

export const SECTION_LABELS: Record<Seccion, string> = {
  resumen: 'Resumen Ejecutivo',
  ventas: 'Ventas',
  vendedores: 'Vendedores',
  clientes: 'Clientes',
  cartera: 'Cartera',
  gestion_cartera: 'Gestión Cartera',
  inventario: 'Inventario',
  zona: 'Ventas por Zona',
  configuracion: 'Configuración',
  calculadora_precios: 'Calculadora de Precios',
}

export type RolePerms = Record<Seccion, boolean>
export type AllPerms = Record<string, RolePerms>

export const DEFAULT_PERMISSIONS: AllPerms = {
  Administrador: { resumen: true,  ventas: true,  vendedores: true,  clientes: true,  cartera: true,  gestion_cartera: true,  inventario: true,  zona: true,  configuracion: true,  calculadora_precios: true  },
  Gerencia:      { resumen: true,  ventas: true,  vendedores: true,  clientes: true,  cartera: true,  gestion_cartera: true,  inventario: true,  zona: true,  configuracion: false, calculadora_precios: true  },
  Ventas:        { resumen: true,  ventas: true,  vendedores: true,  clientes: true,  cartera: false, gestion_cartera: false, inventario: false, zona: false, configuracion: false, calculadora_precios: false },
  Cartera:       { resumen: false, ventas: false, vendedores: false, clientes: false, cartera: true,  gestion_cartera: true,  inventario: false, zona: false, configuracion: false, calculadora_precios: false },
}

export const NEW_ROLE_DEFAULTS: RolePerms = {
  resumen: true, ventas: true, vendedores: true, clientes: true,
  cartera: false, gestion_cartera: false, inventario: false, zona: false, configuracion: false,
  calculadora_precios: false,
}

export const LOCKED_ROLES = ['Administrador']

export const SECTION_ROUTES: Record<Seccion, string> = {
  resumen:              '/resumen',
  ventas:               '/ventas',
  vendedores:           '/vendedores',
  clientes:             '/clientes',
  cartera:              '/cartera',
  gestion_cartera:      '/gestion-cartera',
  inventario:           '/inventario',
  zona:                 '/zona',
  configuracion:        '/configuracion/usuarios',
  calculadora_precios:  '/calculadora-precios',
}
