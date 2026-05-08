import { getSheetData, rowsToObjects } from './sheets'
import {
  SECTIONS, DEFAULT_PERMISSIONS,
  type Seccion, type AllPerms, type RolePerms,
} from './permissions-config'

export * from './permissions-config'

let _cache: { data: AllPerms; ts: number } | null = null
const CACHE_MS = 60_000

export async function getPermissions(): Promise<AllPerms> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.data

  try {
    const rows = await getSheetData('LS_Permisos')
    const objs = rowsToObjects(rows)

    if (objs.length === 0) {
      _cache = { data: DEFAULT_PERMISSIONS, ts: Date.now() }
      return DEFAULT_PERMISSIONS
    }

    const perms: AllPerms = {}
    for (const row of objs) {
      const rol = row['Rol']
      if (!rol) continue
      perms[rol] = {} as RolePerms
      for (const s of SECTIONS) {
        perms[rol][s] = row[s] !== 'NO'
      }
    }
    // Administrador always has full access
    perms['Administrador'] = { ...DEFAULT_PERMISSIONS['Administrador'] }

    _cache = { data: perms, ts: Date.now() }
    return perms
  } catch {
    return DEFAULT_PERMISSIONS
  }
}

export function getRoles(perms: AllPerms): string[] {
  const all = Object.keys(perms)
  // Administrador always first
  return ['Administrador', ...all.filter((r) => r !== 'Administrador')]
}

export function canAccess(role: string, section: Seccion, perms: AllPerms): boolean {
  return perms[role]?.[section] ?? DEFAULT_PERMISSIONS[role]?.[section] ?? false
}

export function getAllowedSections(role: string, perms: AllPerms): Seccion[] {
  return SECTIONS.filter((s) => canAccess(role, s, perms))
}

export function invalidateCache() {
  _cache = null
}
