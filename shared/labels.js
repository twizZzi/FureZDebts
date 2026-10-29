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
