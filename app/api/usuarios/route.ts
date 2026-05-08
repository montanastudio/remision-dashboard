import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSheetData, appendSheetRow, updateSheetRow, rowsToObjects } from '@/lib/sheets'
import { hashPassword } from '@/lib/crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const rows = await getSheetData('LS_Usuarios')
    const users = rowsToObjects(rows).map((u) => ({
      nombre: u['Nombre'],
      usuario: u['Usuario'],
      rol: u['Rol'],
      iniciales: u['Iniciales'],
      activo: u['Activo'],
    }))
    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ users: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'Administrador')
    return NextResponse.json({ error: 'Acceso denegado — se requiere rol Administrador' }, { status: 403 })

  const { nombre, usuario, contraseña, rol, iniciales } = await req.json()

  if (!nombre || !usuario || !contraseña || !rol || !iniciales) {
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
  }

  // Check if username already exists
  try {
    const rows = await getSheetData('LS_Usuarios')
    const users = rowsToObjects(rows)
    const exists = users.some((u) => u['Usuario']?.toLowerCase() === usuario.toLowerCase())
    if (exists) {
      return NextResponse.json({ error: 'El usuario ya existe' }, { status: 409 })
    }
  } catch {
    // If sheet doesn't exist yet, proceed to create first user
  }

  const hash = await hashPassword(contraseña)

  await appendSheetRow('LS_Usuarios', [
    nombre,
    usuario.toLowerCase().trim(),
    hash,
    rol,
    iniciales.toUpperCase(),
    'SI',
  ])

  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'Administrador')
    return NextResponse.json({ error: 'Acceso denegado — se requiere rol Administrador' }, { status: 403 })

  const { usuario, nuevaContraseña } = await req.json()
  if (!usuario || !nuevaContraseña)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (nuevaContraseña.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

  const rawRows = await getSheetData('LS_Usuarios')
  // Buscar la fila del usuario (rawRows[0] = headers, rawRows[1+] = datos)
  const rowIdx = rawRows.findIndex((r, i) => i > 0 && r[1]?.toLowerCase().trim() === usuario.toLowerCase())
  if (rowIdx === -1)
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const rowData = [...rawRows[rowIdx]]
  rowData[2] = await hashPassword(nuevaContraseña)  // columna C = Contraseña
  await updateSheetRow('LS_Usuarios', rowIdx + 1, rowData)  // +1 → índice 1-based en Sheets

  return NextResponse.json({ ok: true })
}
