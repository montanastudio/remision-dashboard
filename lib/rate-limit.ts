/**
 * Rate limiter en memoria por clave (username o IP).
 * Máx. 5 intentos fallidos en una ventana de 15 minutos.
 * En producción multi-instancia reemplazar por Redis.
 */

interface Entry { count: number; windowStart: number }

const store = new Map<string, Entry>()

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000   // 15 minutos

/** Registra un intento fallido. Devuelve true si la clave debe ser bloqueada. */
export function recordFailedAttempt(key: string): boolean {
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  return entry.count >= MAX_ATTEMPTS
}

/** Verifica si la clave está actualmente bloqueada (sin incrementar el contador). */
export function isBlocked(key: string): boolean {
  const entry = store.get(key)
  if (!entry) return false
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    store.delete(key)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

/** Reinicia el contador tras un login exitoso. */
export function resetLimit(key: string): void {
  store.delete(key)
}

// Limpieza periódica para evitar memory leaks
setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (now - entry.windowStart > WINDOW_MS) store.delete(key)
  })
}, WINDOW_MS)
