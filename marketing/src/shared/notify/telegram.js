// Lightweight Telegram notifier. No SDK — just node fetch against the
// Bot API. Env-driven: if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is
// missing, calls are silent no-ops so the rest of the pipeline doesn't
// care whether notifications are configured.
//
// Fire-and-forget: callers should NOT await this in critical paths. The
// helper catches its own errors and never throws — Telegram being down
// must never block triage / draft / scan.

const TELEGRAM_API = 'https://api.telegram.org';

function escapeMarkdownV2(text) {
  // Telegram MarkdownV2 requires escaping these characters everywhere
  // except inside fenced code blocks. We use plain text + simple bold,
  // so we just escape the punctuation that would otherwise blow up parse.
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Send a Telegram message. Resolves to {ok, error?} — never throws.
 *
 * @param {string} text   Message body. Plain text is safe; if you want
 *                        bold or links, use options.parseMode='MarkdownV2'
 *                        and escape with `escapeMarkdownV2()` yourself.
 * @param {object} [opts]
 * @param {string} [opts.parseMode]            'MarkdownV2' | 'HTML' | undefined
 * @param {boolean} [opts.disablePreview=true] Skip link previews — keeps
 *                                              alerts compact in the chat list.
 * @param {boolean} [opts.silent=false]        Send without notification sound.
 * @param {string} [opts.chatId]               Override env TELEGRAM_CHAT_ID.
 * @param {string} [opts.botToken]             Override env TELEGRAM_BOT_TOKEN.
 * @param {object} [opts.replyMarkup]          Inline keyboard etc.
 */
export async function sendTelegram(text, opts = {}) {
  const botToken = opts.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { ok: false, error: 'telegram_not_configured', skipped: true };
  }
  if (!text) return { ok: false, error: 'empty_text' };

  const body = {
    chat_id: chatId,
    text: String(text).slice(0, 4000), // Telegram caps at 4096 chars
    disable_web_page_preview: opts.disablePreview ?? true,
    disable_notification: opts.silent ?? false,
  };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, error: `telegram ${res.status}: ${errBody.slice(0, 150)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export { escapeMarkdownV2 };
