// Minimal Bot API client. Without BOT_TOKEN (local dev) calls are skipped.
import { setCanNotify } from "./db.js";

export async function callBot(env, method, params) {
  if (!env.BOT_TOKEN) return { ok: false, skipped: true };
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const result = await response.json();
    if (!result.ok) console.warn(`Bot API ${method} failed`, result.error_code, result.description);
    return result;
  } catch (error) {
    console.warn(`Bot API ${method} threw`, error);
    return { ok: false };
  }
}

// web_app buttons only accept https URLs, so locally the message goes without one.
export function openAppKeyboard(origin, text = "Открыть") {
  if (!origin?.startsWith("https://")) return undefined;
  return { inline_keyboard: [[{ text, web_app: { url: origin } }]] };
}

export function sendText(env, chatId, text, replyMarkup) {
  return callBot(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup,
  });
}

// Notification to another user. 403 means they blocked the bot: stop trying.
export async function notifyUser(env, userRow, text, { origin, replyMarkup } = {}) {
  if (!userRow?.can_notify) return;
  const result = await sendText(env, userRow.id, text, replyMarkup || openAppKeyboard(origin));
  if (result.error_code === 403) await setCanNotify(env.DB, userRow.id, false);
}
