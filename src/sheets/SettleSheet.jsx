import { useState } from "react";
import { PAYMENT_METHODS } from "../../shared/labels.js";
import { formatMoney } from "../../shared/money.js";
import Sheet from "../components/Sheet";
import { Chips } from "../components/ui";
import { useMainButton } from "../hooks";
import { fullName } from "../lib/format";
import { haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({ id: method.id, title: method.title }));

// "Погасить полностью": records a return of the whole balance in one currency and how it was paid.
export default function SettleSheet({ sheetKey, friendId }) {
  const { friendsById, mutate } = useStore();
  const { closeSheet } = useUi();
  const friend = friendsById.get(friendId);
  const balances = friend?.balances || [];

  const [currency, setCurrency] = useState(balances[0]?.currency || null);
  const [method, setMethod] = useState("card");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const balance = balances.find((item) => item.currency === currency);
  const needsNote = method === "purchase" && !note.trim();
  const ready = Boolean(balance) && !needsNote && !saving;
  const close = () => closeSheet(sheetKey);

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    const result = await mutate("POST", `/friends/${friendId}/settle`, { currency, method, note: note.trim() });
    setSaving(false);
    if (result) {
      haptic.success();
      close();
    }
  };

  useMainButton({
    text: saving ? "Сохраняю…" : needsNote ? "Напиши, что куплено" : "Отметить погашение",
    onClick: save,
    enabled: ready,
  });

  const name = fullName(friend);

  return (
    <Sheet variant="bottom" title="Погасить полностью" subtitle={name} onClose={close}>
      {balances.length > 1 && (
        <Chips
          options={balances.map((item) => ({ id: item.currency, title: formatMoney(Math.abs(item.amount), item.currency) }))}
          value={currency}
          onChange={setCurrency}
        />
      )}

      {balance ? (
        <div className="settle-summary">
          <p className="eyebrow">{balance.amount > 0 ? "Возврат тебе" : "Твой возврат"}</p>
          <strong>{formatMoney(Math.abs(balance.amount), balance.currency)}</strong>
        </div>
      ) : (
        <p className="hint">В этой валюте вы уже в расчёте.</p>
      )}

      <p className="field-caption">Как погашено</p>
      <Chips options={METHOD_OPTIONS} value={method} onChange={setMethod} />

      <input
        className={`field note-input ${needsNote ? "required" : ""}`}
        maxLength={200}
        placeholder={method === "purchase" ? "Что куплено — обязательно" : "Комментарий — необязательно"}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && save()}
      />

      <p className="hint">Долг закроется, когда {name} подтвердит погашение.</p>
    </Sheet>
  );
}
