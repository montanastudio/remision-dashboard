import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setSheetData } from '@/lib/sheets'
import { ZONAS_CONFIG } from '@/lib/zonas-config'

export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (role !== 'Administrador') {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  const headers = ['Vendedor', 'Zona', 'Color', 'Cód. Depto', 'Departamento']
  const rows = ZONAS_CONFIG.flatMap(z =>
    z.deptos.map(d => [z.vendedor, z.zona, z.color, d.cod, d.nombre])
  )

  await setSheetData('LS_ZONAS', [headers, ...rows])

  return Response.json({ ok: true, filas: rows.length })
}
