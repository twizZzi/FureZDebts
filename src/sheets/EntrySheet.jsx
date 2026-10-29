import { useMemo, useState } from "react";
import { CURRENCIES, currencySymbol, formatMoney, parseAmount } from "../../shared/money.js";
import { balanceLabel, PAYMENT_METHODS } from "../../shared/labels.js";
import Icon from "../components/Icon";
import Sheet from "../components/Sheet";
import { Avatar, Chips, Segmented } from "../components/ui";
import { useMainButton } from "../hooks";
import { fullName } from "../lib/format";
import { haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

const KINDS = [
  { id: "debt", title: "Долг" },
  { id: "payment", title: "Возврат" },
];

const SIDES = {
  debt: [
    { id: "toMe", title: "Долг мне" },
    { id: "mine", title: "Мой долг" },
  ],
  payment: [
    { id: "toMe", title: "Возврат мне" },
    { id: "mine", title: "Мой возврат" },
  ],
};

// they_owe: I gave value (lent, or paid my debt back), so the friend's side grows.
function directionOf(kind, side) {
  if (kind === "debt") return side === "toMe" ? "they_owe" : "i_owe";
  return side === "toMe" ? "i_owe" : "they_owe";
}

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({ id: method.id, title: method.title }));

export default function EntrySheet({ sheetKey, friendId: presetFriendId }) {
  const { state, friendsById, mutate } = useStore();
  const { closeSheet, openSheet } = useUi();
  const { me, friends } = state;

  const [friendId, setFriendId] = useState(presetFriendId ?? friends[0]?.id ?? null);
  const friend = friendsById.get(friendId);
  const balances = useMemo(() => friend?.balances || [], [friend]);

  const [currency, setCurrency] = useState(() => {
    const open = (friendsById.get(presetFriendId)?.balances || [])[0];
    return open?.currency || me.defaultCurrency;
  });
  const balance = balances.find((item) => item.currency === currency)?.amount || 0;

  const [kind, setKind] = useState("debt");
  const [side, setSide] = useState("toMe");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(null);
  const [method, setMethod] = useState(null);
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  // A debt needs a reason; a return only when it was paid with a purchase.
  const noteMissing = (kind === "debt" || method === "purchase") && !note.trim();
  const ready = Boolean(amount && friend) && !noteMissing && !saving;
  const direction = directionOf(kind, side);
  const after = amount ? balance + (direction === "they_owe" ? amount : -amount) : balance;
  const overpaid = kind === "payment" && amount && balance !== 0 && Math.sign(after) === -Math.sign(balance);

  // Open balances first, then the default currency, then the rest.
  const currencyOptions = useMemo(() => {
    const first = [...balances.map((item) => item.currency), me.defaultCurrency];
    const codes = [...new Set([...first, ...CURRENCIES.map((item) => item.code)])];
    return codes.map((code) => ({ id: code, title: code === currencySymbol(code) ? code : `${code} ${currencySymbol(code)}` }));
  }, [balances, me.defaultCurrency]);

  const changeKind = (nextKind) => {
    setKind(nextKind);
    // A return usually goes against the open balance: they owe me -> they pay me back.
    if (nextKind === "payment" && balance !== 0) setSide(balance > 0 ? "toMe" : "mine");
  };

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    const result = await mutate("POST", "/entries", {
      friendId,
      direction,
      kind,
      amount,
      currency,
      note: note.trim(),
      category: kind === "debt" ? category : null,
      method: kind === "payment" ? method : null,
    });
    setSaving(false);
    if (result) {
      haptic.success();
      closeSheet(sheetKey);
    }
  };

  useMainButton({
    text: saving
      ? "Сохраняю…"
      : amount && noteMissing
        ? kind === "debt"
          ? "Напиши, за что долг"
          : "Напиши, что куплено"
        : "Отправить на подтверждение",
    onClick: save,
    enabled: ready,
  });

  return (
    <Sheet
      variant="bottom"
      title="Новая запись"
      subtitle={presetFriendId ? fullName(friend) : undefined}
      onClose={() => closeSheet(sheetKey)}
    >
      {!presetFriendId && (
        <div className="friend-picker">
          {friends.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === friendId ? "active" : ""}
              onClick={() => {
                haptic.select();
                setFriendId(item.id);
              }}
            >
              <Avatar user={item} size={48} />
              <span>{item.firstName}</span>
            </button>
          ))}
        </div>
      )}

      <Segmented options={KINDS} value={kind} onChange={changeKind} />
      <Segmented options={SIDES[kind]} value={side} onChange={setSide} className="side-switch" />

      <label className="big-input">
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amountText}
          aria-label="Сумма"
          onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,\s]/g, ""))}
          onKeyDown={(event) => event.key === "Enter" && save()}
        />
        <span>{currencySymbol(currency)}</span>
      </label>

      <Chips options={currencyOptions} value={currency} onChange={setCurrency} />

      <input
        className={`field note-input ${amount && noteMissing ? "required" : ""}`}
        maxLength={200}
        placeholder={
          kind === "debt"
            ? "За что — обязательно"
            : method === "purchase"
              ? "Что куплено — обязательно"
              : "Комментарий — необязательно"
        }
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && save()}
      />

      {kind === "debt" ? (
        <button
          type="button"
          className={`field select-field ${category ? "" : "placeholder"}`}
          onClick={() => openSheet("category", { value: category, onSelect: setCategory })}
        >
          <span>{category || "Категория — необязательно"}</span>
          <Icon name="chevronRight" size={18} />
        </button>
      ) : (
        <>
          <p className="field-caption">Как вернули — необязательно</p>
          <Chips
            options={METHOD_OPTIONS}
            value={method}
            onChange={(id) => setMethod((current) => (current === id ? null : id))}
          />
        </>
      )}

      {friend && (
        <p className="hint entry-preview">
          {amount ? "После подтверждения" : "Сейчас"}: {fullName(friend)} —{" "}
          <b className={after < 0 ? "negative" : ""}>
            {after === 0 ? "в расчёте" : `${balanceLabel(after)} ${formatMoney(Math.abs(after), currency)}`}
          </b>
          {overpaid ? ". Возврат больше долга — разница станет долгом в обратную сторону." : ""}
        </p>
      )}
    </Sheet>
  );
}
