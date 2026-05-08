/**
 * Endpoint de bootstrap — crea el primer usuario Administrador.
 * Solo funciona si LS_Usuarios NO tiene ningún usuario todavía.
 * Una vez creado el primer usuario este endpoint queda inaccesible.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSheetData, appendSheetRow, rowsToObjects } from '@/lib/sheets'
import { hashPassword } from '@/lib/crypto'

export async function POST(req: NextRequest) {
  const { nombre, usuario, contraseña, iniciales } = await req.json()

  if (!nombre || !usuario || !contraseña || !iniciales) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // Verificar que la hoja esté vacía (solo headers o ninguna fila)
  try {
    const rows = await getSheetData('LS_Usuarios')
    const users = rowsToObjects(rows).filter(u => u['Usuario']?.trim())
    if (users.length > 0) {
      return NextResponse.json(
        { error: 'Ya existen usuarios — este endpoint está deshabilitado' },
        { status: 403 }
      )
    }
  } catch {
    // La hoja aún no existe o está vacía — continuar
  }

  const hash = await hashPassword(contraseña)

  await appendSheetRow('LS_Usuarios', [
    nombre,
    usuario.toLowerCase().trim(),
    hash,
    'Administrador',
    iniciales.toUpperCase(),
    'SI',
  ])

  return NextResponse.json({ ok: true, mensaje: `Usuario "${usuario}" creado como Administrador.` })
}
