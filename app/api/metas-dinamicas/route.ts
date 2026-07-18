import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setSheetData } from '@/lib/sheets'

/**
 * Guarda en LS_METAS_VENDEDOR las metas dinámicas ya calculadas en el cliente
 * (AnalisisVendedores). Recibe la matriz completa: header + una fila por
 * vendedor. Se agregan filas en blanco al final para limpiar residuos de
 * escrituras anteriores más largas (setSheetData no borra, solo sobreescribe).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (role !== 'Administrador' && role !== 'Gerencia') {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  let values: string[][]
  try {
    const body = await req.json()
    values = body?.values
    if (!Array.isArray(values) || values.length < 2 || !Array.isArray(values[0])) {
      return Response.json({ error: 'Formato inválido' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const ancho = values[0].length
  const blancos = Array.from({ length: 8 }, () => Array.from({ length: ancho }, () => ''))

  try {
    await setSheetData('LS_METAS_VENDEDOR', [...values, ...blancos])
    return Response.json({ ok: true, filas: values.length - 1 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
