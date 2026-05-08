import { NextRequest, NextResponse } from 'next/server'
import { getSheetData, updateSheetRow } from '@/lib/sheets'
import { hashPassword } from '@/lib/crypto'
import { recordFailedAttempt, isBlocked } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const { usuario, codigoRecuperacion, nuevaContraseña } = await req.json()

  if (!usuario || !codigoRecuperacion || !nuevaContraseña)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (nuevaContraseña.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

  // Reutilizar el rate limiter para evitar fuerza bruta sobre el código
  const key = `recover:${usuario.toLowerCase()}`
  if (isBlocked(key))
    return NextResponse.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, { status: 429 })

  // Verificar el código de recuperación
  const validCode = process.env.ADMIN_RECOVERY_CODE
  if (!validCode || codigoRecuperacion !== validCode) {
    recordFailedAttempt(key)
    return NextResponse.json({ error: 'Código de recuperación incorrecto' }, { status: 403 })
  }

  // Buscar y actualizar la contraseña en el sheet
  const rawRows = await getSheetData('LS_Usuarios')
  const rowIdx = rawRows.findIndex((r, i) => i > 0 && r[1]?.toLowerCase().trim() === usuario.toLowerCase().trim())
  if (rowIdx === -1)
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const rowData = [...rawRows[rowIdx]]
  rowData[2] = await hashPassword(nuevaContraseña)
  await updateSheetRow('LS_Usuarios', rowIdx + 1, rowData)

  return NextResponse.json({ ok: true })
}
