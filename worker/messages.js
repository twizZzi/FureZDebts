// Bot message texts (HTML parse mode), written from the recipient's side.
import { formatMoney } from "../shared/money.js";
import { balanceSummary, entryLabel } from "../shared/labels.js";
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
  const note = view.note ? ` — ${escapeHtml(view.note)}` : "";
  return `${entryLabel(view.kind, view.amount)}: ${formatMoney(Math.abs(view.amount), view.currency)}${note}`;
}

export function entryCreatedText(entry, actor, recipientId, balances) {
  return [
    `${who(actor)} · новая запись`,
    entryLine(entry, recipientId),
    "",
    `Итого: ${balanceSummary(balances)}`,
  ].join("\n");
}

export function entryDeletedText(entry, actor, recipientId, balances) {
  return [
    `${who(actor)} · запись удалена`,
    `<s>${entryLine(entry, recipientId)}</s>`,
    "",
    `Итого: ${balanceSummary(balances)}`,
  ].join("\n");
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
