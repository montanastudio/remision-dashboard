const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Envía un mensaje a Telegram usando el Bot API. Lee el token del bot y el
 * chat destino desde variables de entorno (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
 * El texto admite HTML básico (<b>, <i>).
 */
export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return { ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en el entorno' }
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data = await res.json()
    return data?.ok ? { ok: true } : { ok: false, error: data?.description ?? 'Error de Telegram' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
