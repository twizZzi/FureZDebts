import { useState } from "react";
import { balanceSummary, canOffset, entryDetails, entryLabel } from "../../shared/labels.js";
import { formatMoney } from "../../shared/money.js";
import Sheet from "../components/Sheet";
import { Avatar, Empty } from "../components/ui";
import { fullName, shortDate } from "../lib/format";
import { confirmAction, haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

// One entry a friend recorded that waits for my answer.
function PendingCard({ entry, onDone }) {
  const { friendsById, mutate } = useStore();
  const [busy, setBusy] = useState(false);
  const friend = friendsById.get(entry.friendId) || entry.friend;
  const balances = friendsById.get(entry.friendId)?.balances || [];
  const balance = balances.find((item) => item.currency === entry.currency)?.amount || 0;
  const offset = canOffset(entry.kind, entry.amount, balance);
  const after = [{ currency: entry.currency, amount: balance + entry.amount }];
  const details = entryDetails(entry);

  const respond = async (decision) => {
    if (decision === "decline" && !(await confirmAction(`Отклонить запись от ${fullName(friend)}?`))) return;
    setBusy(true);
    const result = await mutate("POST", `/entries/${entry.id}/respond`, { decision });
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
      <p className="hint">
        Сейчас: {balanceSummary(balances.filter((item) => item.currency === entry.currency))}. После подтверждения:{" "}
        <b>{balanceSummary(after)}</b>.
      </p>

      {offset ? (
        <>
          <div className="button-row">
            <button type="button" className="primary-button" disabled={busy} onClick={() => respond("confirm")}>
              Новый долг
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => respond("offset")}>
              Вычесть из долга
            </button>
          </div>
          <p className="hint">«Вычесть из долга» — сумма не станет новым долгом, а уменьшит текущий и запишется как возврат.</p>
        </>
      ) : (
        <button type="button" className="primary-button" disabled={busy} onClick={() => respond("confirm")}>
          Подтвердить
        </button>
      )}
      <button type="button" className="danger-link" disabled={busy} onClick={() => respond("decline")}>
        Отклонить
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
