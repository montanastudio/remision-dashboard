import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rutas que no requieren autenticación
const PUBLIC_PREFIXES = [
  '/login',
  '/recuperar',     // Página de recuperación de contraseña
  '/api/auth',      // NextAuth callbacks, CSRF, session
  '/api/setup',     // Bootstrap inicial — se auto-bloquea tras crear el primer usuario
  '/api/recuperar', // Endpoint de recuperación de contraseña
]

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Permitir rutas públicas
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── CSRF: verificar Origin en requests mutantes de API ──────────────
  // El navegador siempre envía Origin en requests cross-site.
  // Si no coincide con nuestro host, es una petición de otro origen → rechazar.
  if (
    MUTATING_METHODS.has(req.method) &&
    pathname.startsWith('/api/')
  ) {
    const origin = req.headers.get('origin')
    const host   = req.headers.get('host') ?? ''

    if (origin) {
      let originHost: string
      try {
        originHost = new URL(origin).host
      } catch {
        return NextResponse.json({ error: 'Origin inválido' }, { status: 403 })
      }
      if (originHost !== host) {
        console.warn(`[csrf] Origen bloqueado: ${origin} → host esperado: ${host}`)
        return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
      }
    }
  }

  // ── Autenticación ───────────────────────────────────────────────────
  // Verificar JWT (funciona en Edge sin acceder a Google Sheets)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Rutas de API sin sesión → 401 JSON (no redirigir, son llamadas programáticas)
  if (pathname.startsWith('/api/')) {
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Páginas sin sesión → redirigir al login conservando la URL de destino
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname))
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Aplicar a todas las rutas excepto:
     * - Archivos estáticos de Next.js (_next/static, _next/image)
     * - Archivos públicos (imágenes, fuentes, favicon)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
