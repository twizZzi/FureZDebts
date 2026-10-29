// Webhook updates: /start registers the user, inline buttons answer friend requests.
import { acceptFriend, admitUser, declineFriend, HttpError, inviteCodeFrom, respondEntry } from "./actions.js";
import { getUser } from "./db.js";
import { entryAnsweredText, friendAcceptedText, friendDeclinedText, lockedText, startText } from "./messages.js";
import { callBot, openAppKeyboard, sendText } from "./telegram.js";

export async function handleUpdate(update, deps) {
  if (update.message) await handleMessage(update.message, deps);
  else if (update.callback_query) await handleCallback(update.callback_query, deps);
}

async function handleMessage(message, deps) {
  const { env, origin } = deps;
  if (message.chat?.type !== "private" || !message.from || message.from.is_bot) return;

  const [command, payload] = String(message.text || "").split(/\s+/);
  const isStart = command === "/start";
  const invite = isStart ? inviteCodeFrom(payload) : null;
  // Writing to the bot means it may write back.
  const me = await admitUser(deps, message.from, { invite, canNotify: true });

  if (!me) {
    await sendText(env, message.chat.id, lockedText(Boolean(invite)));
    return;
  }
  const text = isStart ? startText(message.from) : "Долги записываются в приложении — открой его кнопкой ниже.";
  await sendText(env, message.chat.id, text, openAppKeyboard(origin, "Открыть приложение"));
}

const ENTRY_DECISIONS = { c: "confirm", o: "offset", d: "decline" };

async function handleCallback(query, deps) {
  const { env, origin } = deps;
  const [scope, action, rawId] = String(query.data || "").split(":");
  let notice = "";

  if (scope === "en" && query.message && ENTRY_DECISIONS[action]) {
    const me = await admitUser(deps, query.from, { canNotify: true });
    if (!me) return callBot(env, "answerCallbackQuery", { callback_query_id: query.id });
    const decision = ENTRY_DECISIONS[action];
    let text = "Запись уже обработана или удалена.";
    try {
      const { entry, balances } = await respondEntry(deps, me, Number(rawId), decision);
      text = entryAnsweredText(entry, me.id, balances, decision);
      notice = decision === "decline" ? "Отклонено" : "Готово";
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      notice = error.message;
    }
    await callBot(env, "editMessageText", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text,
      parse_mode: "HTML",
      reply_markup: openAppKeyboard(origin),
    });
  }

  if (scope === "fr" && query.message) {
    const me = await admitUser(deps, query.from, { canNotify: true });
    if (!me) return callBot(env, "answerCallbackQuery", { callback_query_id: query.id });
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
