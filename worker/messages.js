// Bot message texts (HTML parse mode), written from the recipient's side.
import { formatMoney } from "../shared/money.js";
import { balanceSummary, entryDetails, entryLabel } from "../shared/labels.js";
import { displayName, publicEntry } from "./db.js";

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function who(user) {
  const name = `<b>${escapeHtml(displayName(user))}</b>`;
  return user.username ? `${name} (@${escapeHtml(user.username)})` : name;
}

function entryLine(entry, recipientId) {
  const view = publicEntry(entry, recipientId);
  const details = entryDetails(view);
  return `${entryLabel(view.kind, view.amount)}: ${formatMoney(Math.abs(view.amount), view.currency)}${
    details ? ` — ${escapeHtml(details)}` : ""
  }`;
}

// Sent to the other side right after an entry is recorded; buttons come with it.
export function entryPendingText(entry, actor, recipientId, balances, offset) {
  const lines = [
    `${who(actor)} · новая запись, нужно подтверждение`,
    entryLine(entry, recipientId),
    "",
    `Сейчас: ${balanceSummary(balances)}`,
  ];
  if (offset) lines.push("«Вычесть из долга» — сумма не станет новым долгом, а уменьшит текущий.");
  return lines.join("\n");
}

const RESPONSES = {
  confirm: "запись подтверждена",
  offset: "засчитано в счёт долга",
  decline: "запись отклонена",
};

// To the author, after the other side answered.
export function entryRespondedText(entry, responder, recipientId, balances, decision) {
  const line = entryLine(entry, recipientId);
  return [
    `${who(responder)} · ${RESPONSES[decision]}`,
    decision === "decline" ? `<s>${line}</s>` : line,
    "",
    `Итого: ${balanceSummary(balances)}`,
  ].join("\n");
}

// Replaces the buttons message for the person who answered.
export function entryAnsweredText(entry, recipientId, balances, decision) {
  const line = entryLine(entry, recipientId);
  const mark = decision === "decline" ? "✕ Отклонено" : decision === "offset" ? "✓ Засчитано в счёт долга" : "✓ Подтверждено";
  return [mark, decision === "decline" ? `<s>${line}</s>` : line, "", `Итого: ${balanceSummary(balances)}`].join("\n");
}

export function entriesDeletedText(entries, actor, recipientId, balances) {
  const header = entries.length === 1 ? "запись удалена" : `удалено записей: ${entries.length}`;
  return [
    `${who(actor)} · ${header}`,
    ...entries.slice(0, 10).map((entry) => `<s>${entryLine(entry, recipientId)}</s>`),
    entries.length > 10 ? `…и ещё ${entries.length - 10}` : null,
    "",
    `Итого: ${balanceSummary(balances)}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function friendRequestText(from) {
  return `${who(from)} хочет добавить тебя в друзья, чтобы вместе записывать долги.`;
}

export function friendAcceptedText(by) {
  return `${who(by)} теперь в друзьях. Можно записывать долги.`;
}

export function friendDeclinedText(from) {
  return `Заявка от ${who(from)} отклонена.`;
}

export function inviteUsedText(user) {
  return `${who(user)} теперь здесь по твоему приглашению — вы уже друзья, можно записывать долги.`;
}

export function lockedText(inviteFailed) {
  if (inviteFailed) {
    return "Это приглашение уже использовано или устарело. Попроси у друга новую ссылку.";
  }
  return [
    "Это закрытый бот для своих.",
    "",
    "Чтобы войти, попроси приглашение у друга, который уже пользуется ботом: в приложении на вкладке «Друзья» есть кнопка «Пригласить». Ссылка одноразовая и действует 7 дней.",
  ].join("\n");
}

export function startText(user) {
  const lines = [
    `Привет, ${escapeHtml(user.first_name || "друг")}!`,
    "",
    "Здесь можно записывать, кто кому сколько должен: находи друзей по @username, добавляй долги и возвраты в любой валюте. Друг сразу получит уведомление.",
  ];
  if (!user.username) {
    lines.push(
      "",
      "⚠️ У тебя не задан username, поэтому друзья не найдут тебя через поиск. Задай его в настройках Telegram (Профиль → Имя пользователя) и снова нажми /start."
    );
  }
  return lines.join("\n");
}
