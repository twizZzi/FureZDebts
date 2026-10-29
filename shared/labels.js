// Wording shared by the Mini App and bot messages. Phrases avoid gendered verbs
// ("должен/должна"), since Telegram does not tell us anyone's gender.
import { formatMoney } from "./money.js";

// `amount` is from the viewer's side: positive increases what the friend owes the viewer.
export function entryLabel(kind, amount) {
  if (kind === "debt") return amount > 0 ? "Долг тебе" : "Твой долг";
  return amount > 0 ? "Твой возврат" : "Возврат тебе";
}

export function balanceLabel(amount) {
  if (amount > 0) return "долг тебе";
  if (amount < 0) return "твой долг";
  return "в расчёте";
}

export function balanceSummary(balances) {
  const nonZero = balances.filter((item) => item.amount !== 0);
  if (!nonZero.length) return "в расчёте";
  return nonZero.map((item) => `${balanceLabel(item.amount)} ${formatMoney(Math.abs(item.amount), item.currency)}`).join(", ");
}

// How a return was paid.
export const PAYMENT_METHODS = [
  { id: "card", title: "На карту" },
  { id: "cash", title: "Наличными" },
  { id: "purchase", title: "Покупкой" },
  { id: "other", title: "Другое" },
];

export function isPaymentMethod(id) {
  return PAYMENT_METHODS.some((method) => method.id === id);
}

export function methodLabel(id) {
  return PAYMENT_METHODS.find((method) => method.id === id)?.title.toLowerCase() || null;
}

// Offered to everyone; people add their own on top.
export const DEFAULT_CATEGORIES = ["Бургер Кинг", "Заправка", "Энергос", "Продукты", "Кафе", "Такси", "Развлечения", "Подарки"];

// "Бургер Кинг · Воппер" or "наличными · вернул за кино": the parts after the label.
export function entryDetails(entry) {
  return [entry.category, methodLabel(entry.method), entry.note].filter(Boolean).join(" · ");
}

// A debt the other side wants to confirm "as an offset": it runs against the current balance.
export function canOffset(kind, amount, balance) {
  return kind === "debt" && balance !== 0 && Math.sign(balance) !== Math.sign(amount);
}
