// Webhook updates: /start registers the user, inline buttons answer friend requests.
import { acceptFriend, declineFriend, HttpError } from "./actions.js";
import { getUser, upsertUser } from "./db.js";
import { friendAcceptedText, friendDeclinedText, startText } from "./messages.js";
import { callBot, openAppKeyboard, sendText } from "./telegram.js";

export async function handleUpdate(update, deps) {
  if (update.message) await handleMessage(update.message, deps);
  else if (update.callback_query) await handleCallback(update.callback_query, deps);
}

async function handleMessage(message, { env, origin }) {
  if (message.chat?.type !== "private" || !message.from || message.from.is_bot) return;
  // Writing to the bot means it may write back.
  await upsertUser(env.DB, message.from, { canNotify: true });

  const isStart = message.text?.startsWith("/start");
  const text = isStart ? startText(message.from) : "Долги записываются в приложении — открой его кнопкой ниже.";
  await sendText(env, message.chat.id, text, openAppKeyboard(origin, "Открыть приложение"));
}

async function handleCallback(query, deps) {
  const { env, origin } = deps;
  const [scope, action, rawId] = String(query.data || "").split(":");
  let notice = "";

  if (scope === "fr" && query.message) {
    const me = await upsertUser(env.DB, query.from, { canNotify: true });
    const otherId = Number(rawId);
    const other = await getUser(env.DB, otherId);
    let text = "Заявка уже неактуальна.";
    let replyMarkup;

    if (other && action === "acc") {
      try {
        await acceptFriend(deps, me, otherId);
        text = friendAcceptedText(other);
        replyMarkup = openAppKeyboard(origin);
        notice = "Теперь вы друзья";
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        notice = error.message;
      }
    } else if (other && action === "dec") {
      const declined = await declineFriend(deps, me, otherId);
      if (declined) {
        text = friendDeclinedText(other);
        notice = "Заявка отклонена";
      }
    }

    await callBot(env, "editMessageText", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }

  await callBot(env, "answerCallbackQuery", { callback_query_id: query.id, text: notice || undefined });
}
