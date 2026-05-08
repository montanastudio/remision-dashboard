export interface ZonaConfig {
  id: string
  zona: string
  vendedor: string
  /** Valores exactos de NVENDEDOR en LS_VENTAS que pertenecen a este asesor */
  nvendedores: string[]
  color: string
  colorLight: string
  deptos: { cod: string; nombre: string; municipios: number }[]
}

/** Total de municipios objetivo por zona (fuente: DANE 2023) */
export function totalMunicipios(z: ZonaConfig): number {
  return z.deptos.reduce((s, d) => s + d.municipios, 0)
}

export const ZONAS_CONFIG: ZonaConfig[] = [
  {
    id: 'centro-oriente',
    zona: 'Centro-Oriente',
    vendedor: 'Margarita',
    nvendedores: ['MARGARITA', 'MARGARITA 1%'],
    color: '#3b82f6',
    colorLight: '#bfdbfe',
    deptos: [
      { cod: '11', nombre: 'Bogotá D.C.',   municipios: 1   },
      { cod: '15', nombre: 'Boyacá',         municipios: 123 },
      { cod: '25', nombre: 'Cundinamarca',   municipios: 116 },
      { cod: '50', nombre: 'Meta',           municipios: 29  },
      { cod: '81', nombre: 'Arauca',         municipios: 7   },
      { cod: '85', nombre: 'Casanare',       municipios: 19  },
    ],
  },
  {
    id: 'norte-costa',
    zona: 'Norte y Costa Caribe',
    vendedor: 'Samuel Gómez',
    nvendedores: ['SAMUEL GOMEZ'],
    color: '#f59e0b',
    colorLight: '#fde68a',
    deptos: [
      { cod: '08', nombre: 'Atlántico',          municipios: 23 },
      { cod: '13', nombre: 'Bolívar',             municipios: 46 },
      { cod: '20', nombre: 'Cesar',               municipios: 25 },
      { cod: '44', nombre: 'La Guajira',          municipios: 15 },
      { cod: '47', nombre: 'Magdalena',           municipios: 30 },
      { cod: '54', nombre: 'Norte de Santander',  municipios: 40 },
      { cod: '68', nombre: 'Santander',           municipios: 87 },
      { cod: '95', nombre: 'Guaviare',            municipios: 4  },
    ],
  },
  {
    id: 'occidente-norte',
    zona: 'Occidente y Norte',
    vendedor: 'Gustavo Giraldo',
    nvendedores: ['GUSTAVO GIRALDO'],
    color: '#22c55e',
    colorLight: '#bbf7d0',
    deptos: [
      { cod: '05', nombre: 'Antioquia', municipios: 125 },
      { cod: '23', nombre: 'Córdoba',   municipios: 30  },
      { cod: '27', nombre: 'Chocó',     municipios: 30  },
      { cod: '70', nombre: 'Sucre',     municipios: 26  },
    ],
  },
  {
    id: 'sur-occidente',
    zona: 'Sur-Occidente y Eje Cafetero',
    vendedor: 'Martha López',
    nvendedores: ['MARTHA LOPEZ', 'MARTHA LOPEZ 1%'],
    color: '#a855f7',
    colorLight: '#e9d5ff',
    deptos: [
      { cod: '17', nombre: 'Caldas',           municipios: 27 },
      { cod: '18', nombre: 'Caquetá',          municipios: 16 },
      { cod: '19', nombre: 'Cauca',            municipios: 42 },
      { cod: '41', nombre: 'Huila',            municipios: 37 },
      { cod: '52', nombre: 'Nariño',           municipios: 64 },
      { cod: '63', nombre: 'Quindío',          municipios: 12 },
      { cod: '66', nombre: 'Risaralda',        municipios: 14 },
      { cod: '73', nombre: 'Tolima',           municipios: 47 },
      { cod: '76', nombre: 'Valle del Cauca',  municipios: 42 },
      { cod: '86', nombre: 'Putumayo',         municipios: 13 },
      { cod: '88', nombre: 'San Andrés',       municipios: 2  },
    ],
  },
]

/** Código DANE (2 dígitos) → ZonaConfig */
export const DPTO_TO_ZONA: Record<string, ZonaConfig> = Object.fromEntries(
  ZONAS_CONFIG.flatMap(z => z.deptos.map(d => [d.cod.padStart(2, '0'), z]))
)
