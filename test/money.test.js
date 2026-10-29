import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, parseAmount } from "../shared/money.js";
import { balanceSummary, entryLabel } from "../shared/labels.js";

test("parses amounts typed with spaces and commas", () => {
  assert.equal(parseAmount("1 250,5"), 125050);
  assert.equal(parseAmount("1 250.50"), 125050);
  assert.equal(parseAmount("300"), 30000);
  assert.equal(parseAmount("0,07"), 7);
});

test("rejects zero, negatives, extra decimals and junk", () => {
  for (const input of ["", "0", "0,00", "-5", "1,234", "abc", "1e3", "12345678901"]) {
    assert.equal(parseAmount(input), null, input);
  }
});

test("formats whole amounts without kopecks", () => {
  assert.equal(formatMoney(125000, "RUB").replace(/\s/g, " "), "1 250 ₽");
  assert.equal(formatMoney(125050, "USD").replace(/\s/g, " "), "1 250,50 $");
  assert.equal(formatMoney(-500, "EUR", { sign: true }), "−5 €");
  assert.equal(formatMoney(500, "USDT", { sign: true }), "+5 USDT");
});

test("labels entries from the viewer's side", () => {
  assert.equal(entryLabel("debt", 100), "Долг тебе");
  assert.equal(entryLabel("debt", -100), "Твой долг");
  assert.equal(entryLabel("payment", 100), "Твой возврат");
  assert.equal(entryLabel("payment", -100), "Возврат тебе");
  assert.equal(balanceSummary([]), "в расчёте");
  assert.equal(
    balanceSummary([{ currency: "RUB", amount: 30000 }, { currency: "USD", amount: -1000 }]).replace(/\s/g, " "),
    "долг тебе 300 ₽, твой долг 10 $"
  );
});
