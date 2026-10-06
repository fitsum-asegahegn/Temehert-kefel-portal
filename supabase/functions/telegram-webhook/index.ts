// Supabase Edge Function: telegram-webhook
// Telegram calls this when someone writes to the school bot. Deploy WITHOUT JWT verification
// (Telegram has no login) — it is protected by the secret token instead:
//   supabase functions deploy telegram-webhook --no-verify-jwt
// Secrets needed: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

const HELP =
  'ሰላም! እኔ የፍኖተ ጥበብ ሰ/ት/ቤት የውጤት መልእክተኛ ነኝ።\n' +
  'ለማገናኘት በመተግበሪያው ውስጥ "ከቴሌግራም ጋር አገናኝ" ይጫኑ።\n' +
  '/stop — መልእክቶችን ማቆም\n\n' +
  'Hello! I send school results. To connect, press "Connect Telegram" inside the app. /stop turns messages off.'

async function reply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 })
  try {
    const update = await req.json()
    const msg = update.message
    if (!msg?.text || msg.chat?.type !== 'private') return new Response('ok')
    const chatId: number = msg.chat.id
    const text: string = msg.text.trim()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1]
      if (!code) { await reply(chatId, HELP); return new Response('ok') }
      const { data: row } = await admin.from('telegram_link_codes').select('user_id, expires_at').eq('code', code).maybeSingle()
      if (!row || new Date(row.expires_at) < new Date()) {
        await reply(chatId, 'ይህ ኮድ ጊዜው አልፎበታል ወይም ልክ አይደለም። በመተግበሪያው ውስጥ እንደገና "ከቴሌግራም ጋር አገናኝ" ይጫኑ።\nThis code is invalid or expired — press "Connect Telegram" in the app again.')
        return new Response('ok')
      }
      await admin.from('telegram_links').upsert({ user_id: row.user_id, chat_id: chatId })
      await admin.from('telegram_link_codes').delete().eq('code', code)
      const { data: p } = await admin.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle()
      await reply(chatId, `✓ ተገናኝቷል${p?.full_name ? ` — ${p.full_name}` : ''}።\nውጤት ሲለቀቅ እዚህ መልእክት ይደርስዎታል።\n\nConnected${p?.full_name ? ` — ${p.full_name}` : ''}. You will get a message here when results are released.`)
    } else if (text.startsWith('/stop')) {
      await admin.from('telegram_links').delete().eq('chat_id', chatId)
      await reply(chatId, 'መልእክቶች ቆመዋል። Messages turned off.')
    } else {
      await reply(chatId, HELP)
    }
  } catch { /* always answer 200 so Telegram does not retry forever */ }
  return new Response('ok')
})
