// Webhook updates: /start registers the user, inline buttons answer friend requests.
import {
  acceptFriend,
  admitUser,
  answerKeyboard,
  confirmChoiceKeyboard,
  declineFriend,
  HttpError,
  inviteCodeFrom,
  pendingAnswer,
  respondEntry,
} from "./actions.js";
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

// First tap picks (c/o/d), second tap confirms (yc/yo/yd), b goes back to the choice.
const ENTRY_CHOICES = new Set(["c", "o", "d"]);
const ENTRY_DECISIONS = { yc: "confirm", yo: "offset", yd: "decline" };

async function handleEntryCallback(query, action, entryId, deps) {
  const { env, origin } = deps;
  const me = await admitUser(deps, query.from, { canNotify: true });
  if (!me) return "";
  const target = { chat_id: query.message.chat.id, message_id: query.message.message_id };

  if (ENTRY_CHOICES.has(action) || action === "b") {
    const pending = await pendingAnswer(env, me, entryId);
    if (!pending) {
      await callBot(env, "editMessageReplyMarkup", { ...target, reply_markup: openAppKeyboard(origin) });
      return "Запись уже обработана или удалена";
    }
    if (action === "o" && !pending.offset) return "Вычитать не из чего";
    const replyMarkup = action === "b" ? answerKeyboard(entryId, pending.offset, origin) : confirmChoiceKeyboard(entryId, action);
    await callBot(env, "editMessageReplyMarkup", { ...target, reply_markup: replyMarkup });
    return action === "b" ? "" : "Нажми ещё раз, чтобы подтвердить";
  }

  const decision = ENTRY_DECISIONS[action];
  if (!decision) return "";
  let text = "Запись уже обработана или удалена.";
  let notice;
  try {
    const { entry, balances } = await respondEntry(deps, me, entryId, decision);
    text = entryAnsweredText(entry, me.id, balances, decision);
    notice = decision === "decline" ? "Отклонено" : "Готово";
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    notice = error.message;
  }
  await callBot(env, "editMessageText", { ...target, text, parse_mode: "HTML", reply_markup: openAppKeyboard(origin) });
  return notice;
}

async function handleCallback(query, deps) {
  const { env, origin } = deps;
  const [scope, action, rawId] = String(query.data || "").split(":");
  let notice = "";

  if (scope === "en" && query.message) {
    notice = await handleEntryCallback(query, action, Number(rawId), deps);
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
