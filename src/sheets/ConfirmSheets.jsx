import { useState } from "react";
import { balanceSummary, canOffset, entryDetails, entryLabel } from "../../shared/labels.js";
import { formatMoney } from "../../shared/money.js";
import Sheet from "../components/Sheet";
import { Avatar, Empty } from "../components/ui";
import { fullName, shortDate } from "../lib/format";
import { haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

// One entry a friend recorded that waits for my answer. Answering takes two taps:
// pick an option, then confirm it, so a stray tap changes nothing.
function PendingCard({ entry, onDone }) {
  const { friendsById, mutate } = useStore();
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const friend = friendsById.get(entry.friendId) || entry.friend;
  const balances = friendsById.get(entry.friendId)?.balances || [];
  const balance = balances.find((item) => item.currency === entry.currency)?.amount || 0;
  const offset = canOffset(entry.kind, entry.amount, balance);
  const after = balanceSummary([{ currency: entry.currency, amount: balance + entry.amount }]);
  const details = entryDetails(entry);

  const options = [
    {
      id: "confirm",
      title: offset ? "Новый долг" : "Подтвердить",
      text: offset ? `Добавится как новый долг. Станет: ${after}` : `Станет: ${after}`,
    },
    offset && {
      id: "offset",
      title: "Вычесть из долга",
      text: `Уменьшит текущий долг и запишется как возврат. Станет: ${after}`,
    },
    { id: "decline", title: "Отклонить", text: "Запись не попадёт в баланс", destructive: true },
  ].filter(Boolean);
  const picked = options.find((option) => option.id === choice);

  const pick = (id) => {
    haptic.select();
    setChoice((current) => (current === id ? null : id));
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    const result = await mutate("POST", `/entries/${entry.id}/respond`, { decision: picked.id });
    setBusy(false);
    if (result) {
      haptic.success();
      onDone?.();
    }
  };

  return (
    <section className="card pending-card">
      <div className="pending-head">
        <Avatar user={friend} size={40} />
        <div>
          <strong>{fullName(friend)}</strong>
          <span>{shortDate(entry.createdAt)}</span>
        </div>
      </div>

      <p className="eyebrow">{entryLabel(entry.kind, entry.amount)}</p>
      <strong className={`pending-amount ${entry.kind === "debt" && entry.amount < 0 ? "negative" : ""}`}>
        {formatMoney(Math.abs(entry.amount), entry.currency)}
      </strong>
      {details && <p className="pending-details">{details}</p>}
      <p className="hint">Сейчас: {balanceSummary(balances.filter((item) => item.currency === entry.currency))}</p>

      <div className="choice-list" role="radiogroup" aria-label="Ответ на запись">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choice === option.id}
            className={`${choice === option.id ? "active" : ""} ${option.destructive ? "destructive" : ""}`}
            disabled={busy}
            onClick={() => pick(option.id)}
          >
            <span className="choice-dot" aria-hidden="true" />
            <span>
              <strong>{option.title}</strong>
              <small>{option.text}</small>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`primary-button ${picked?.destructive ? "danger" : ""}`}
        disabled={!picked || busy}
        onClick={submit}
      >
        {busy ? "Сохраняю…" : picked ? `Подтвердить выбор: ${picked.title.toLowerCase()}` : "Выбери вариант"}
      </button>
    </section>
  );
}

// A single pending entry, opened from the feed or a friend's history.
export function ConfirmSheet({ sheetKey, entryId }) {
  const { state } = useStore();
  const { closeSheet } = useUi();
  const entry = state.pendingIncoming.find((item) => item.id === entryId);
  const close = () => closeSheet(sheetKey);

  return (
    <Sheet variant="bottom" title="Подтверждение" onClose={close}>
      {entry ? (
        <PendingCard entry={entry} onDone={close} />
      ) : (
        <Empty title="Запись уже обработана" text="Её подтвердили, отклонили или удалили." />
      )}
    </Sheet>
  );
}

// Everything that waits for my answer.
export function PendingSheet({ sheetKey }) {
  const { state } = useStore();
  const { closeSheet } = useUi();

  return (
    <Sheet title="Ждут подтверждения" onClose={() => closeSheet(sheetKey)}>
      {state.pendingIncoming.length ? (
        state.pendingIncoming.map((entry) => <PendingCard key={entry.id} entry={entry} />)
      ) : (
        <section className="card">
          <Empty title="Всё подтверждено" text="Новых записей от друзей нет." />
        </section>
      )}
    </Sheet>
  );
}
