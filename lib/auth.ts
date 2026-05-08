import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getSheetData, rowsToObjects } from './sheets'
import { verifyPassword } from './crypto'
import { isBlocked, recordFailedAttempt, resetLimit } from './rate-limit'

async function findUser(username: string, password: string) {
  // Google Sheets es la única fuente de verdad.
  // Si falla, el login no procede — nunca se cae a credenciales hardcodeadas.
  let rows: string[][]
  try {
    rows = await getSheetData('LS_Usuarios')
  } catch (err) {
    console.error('[auth] No se pudo conectar a Google Sheets:', err)
    return null
  }

  const users = rowsToObjects(rows)
  const activeUsers = users.filter((u) => u['Activo'] === 'SI')

  const user = activeUsers.find(
    (u) => u['Usuario']?.toLowerCase().trim() === username
  )
  if (!user) return null

  const stored = user['Contraseña'] ?? ''

  // Sólo se aceptan contraseñas cifradas (formato hash:salt).
  // Contraseñas en texto plano en el sheet son rechazadas.
  if (!stored.includes(':')) {
    console.warn(`[auth] Usuario "${username}" tiene contraseña sin cifrar — acceso denegado. Usa /usuarios para regenerar la contraseña.`)
    return null
  }

  if (!await verifyPassword(password, stored)) return null

  return {
    id: user['Usuario'],
    name: user['Nombre'],
    email: `${user['Usuario']}@remisiongroup.com`,
    role: user['Rol'],
    initials: user['Iniciales'],
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username?.toLowerCase().trim()
        const password = credentials?.password
        if (!username || !password) return null

        // Bloquear si superó el límite de intentos
        if (isBlocked(username)) {
          console.warn(`[auth] Usuario "${username}" bloqueado temporalmente por exceso de intentos fallidos.`)
          return null
        }

        const result = await findUser(username, password)

        if (!result) {
          const blocked = recordFailedAttempt(username)
          if (blocked) console.warn(`[auth] Usuario "${username}" bloqueado tras 5 intentos fallidos.`)
          return null
        }

        // Login exitoso — reiniciar contador
        resetLimit(username)
        return result
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.initials = (user as { initials?: string }).initials
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string
        ;(session.user as { initials?: string }).initials = token.initials as string
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
