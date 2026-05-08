import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getPermissions, canAccess } from '@/lib/permissions'
import { getSheetData, rowsToObjects } from '@/lib/sheets'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import NuevoUsuarioForm from './NuevoUsuarioForm'
import CambiarPasswordForm from './CambiarPasswordForm'

export const dynamic = 'force-dynamic'

const ROL_VARIANT: Record<string, 'blue' | 'green' | 'amber' | 'gray'> = {
  Administrador: 'blue',
  Gerencia: 'amber',
  Ventas: 'green',
}

export default async function UsuariosPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const perms = await getPermissions()
  if (!canAccess(role, 'configuracion', perms)) redirect('/resumen')

  type Row = Record<string, string>
  let usuarios: Row[] = []

  try {
    const rows = await getSheetData('LS_Usuarios')
    usuarios = rowsToObjects(rows)
  } catch {
    // sheet not configured yet
  }

  const activos = usuarios.filter((u) => u['Activo'] === 'SI')
  const inactivos = usuarios.filter((u) => u['Activo'] !== 'SI')

  return (
    <div className="fade-in-up max-w-3xl">
      <div className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-3">
        Gestión de acceso
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[13px] text-[var(--text-sub)]">
            {activos.length} usuario{activos.length !== 1 ? 's' : ''} activo{activos.length !== 1 ? 's' : ''}
            {inactivos.length > 0 && ` · ${inactivos.length} inactivo${inactivos.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <NuevoUsuarioForm />
      </div>

      <Card title="Usuarios activos" subtitle="con acceso al dashboard">
        {activos.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-[var(--text-muted)] mb-1">
              No hay usuarios en la hoja <span className="font-mono">LS_Usuarios</span>.
            </p>
            <p className="text-[12px] text-[var(--text-muted)]">
              Los usuarios predeterminados (admin, gerencia, ventas) siguen activos como respaldo.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activos.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3 rounded-nav bg-[var(--bar-bg)] hover:bg-[var(--nav-hover)] transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #d42020, #1a3a8f)' }}
                >
                  {u['Iniciales'] || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text)] truncate">{u['Nombre']}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono">{u['Usuario']}</div>
                </div>
                <Badge variant={ROL_VARIANT[u['Rol']] ?? 'gray'}>{u['Rol']}</Badge>
                <CambiarPasswordForm usuario={u['Usuario']} nombre={u['Nombre']} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {inactivos.length > 0 && (
        <Card title="Usuarios inactivos" subtitle="sin acceso" className="mt-4">
          <div className="space-y-2">
            {inactivos.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3 rounded-nav opacity-50"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 bg-[var(--text-muted)]">
                  {u['Iniciales'] || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text)] truncate">{u['Nombre']}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono">{u['Usuario']}</div>
                </div>
                <Badge variant="gray">{u['Rol'] || 'Sin rol'}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 px-4 py-3 rounded-nav border border-[var(--border)] bg-[var(--bar-bg)]">
        <p className="text-[11px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-sub)]">Nota:</span> Los usuarios se guardan en la hoja{' '}
          <span className="font-mono">LS_Usuarios</span> del Google Sheet. Las contraseñas se almacenan cifradas con PBKDF2-SHA512.
          El ícono <span className="inline-block align-middle">🔒</span> permite cambiar la contraseña de cualquier usuario.
        </p>
      </div>
    </div>
  )
}
