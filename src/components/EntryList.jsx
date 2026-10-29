import { useRef } from "react";
import { entryDetails, entryLabel } from "../../shared/labels.js";
import { formatMoney } from "../../shared/money.js";
import Icon from "./Icon";
import { Avatar, Money } from "./ui";
import { fullName, groupByDay, timeLabel } from "../lib/format";
import { haptic } from "../telegram";
import { useStore } from "../useStore";

const LONG_PRESS_MS = 450;

// Press-and-hold without moving fires onLongPress; the click that follows it is swallowed.
function useLongPress(onLongPress, onClick) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);

  // Handlers stay the same shape even without onLongPress: the row re-renders into selection
  // mode mid-press, and the click that ends that press must still be swallowed.
  return {
    onPointerDown: (event) => {
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      cancel();
      if (!onLongPress) return;
      timer.current = setTimeout(() => {
        fired.current = true;
        haptic.impact("medium");
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event) => event.preventDefault(),
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onClick();
    },
  };
}

function statusOf(entry, meId) {
  if (entry.status === "declined") return { label: "отклонено", className: "declined" };
  if (entry.status !== "pending") return null;
  return entry.createdBy === meId
    ? { label: "ждёт подтверждения", className: "waiting" }
    : { label: "нужно подтвердить", className: "action" };
}

function EntryRow({ entry, friend, showFriend, selecting, selected, onSelect, onLongPress }) {
  const { state } = useStore();
  const press = useLongPress(onLongPress && (() => onLongPress(entry)), () => onSelect(entry));
  const status = statusOf(entry, state.me.id);
  const caption = [entryLabel(entry.kind, entry.amount), entryDetails(entry)].filter(Boolean).join(" · ");
  const counted = entry.status === "confirmed";

  return (
    <button
      type="button"
      className={`list-item entry-row ${selected ? "selected" : ""} ${counted ? "" : "uncounted"}`}
      {...press}
    >
      {selecting && (
        <span className="check-circle" aria-hidden="true">
          {selected && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      )}
      {showFriend && <Avatar user={friend} size={40} />}
      <div>
        <strong>{showFriend ? fullName(friend) : caption}</strong>
        <span>{showFriend ? `${caption} · ${timeLabel(entry.createdAt)}` : timeLabel(entry.createdAt)}</span>
        {status && <em className={`entry-status ${status.className}`}>{status.label}</em>}
      </div>
      {entry.kind === "debt" && counted ? (
        <Money amount={entry.amount} currency={entry.currency} className="entry-amount" />
      ) : (
        // Returns only move a debt towards zero; unconfirmed entries do not count yet.
        <span className="money entry-amount payment">{formatMoney(Math.abs(entry.amount), entry.currency)}</span>
      )}
    </button>
  );
}

// Entries grouped by day. With `users` each row shows the friend (feed);
// without it rows are a single friend's history. `selection` turns on multi-select.
export default function EntryList({ entries, users, onSelect, selection }) {
  return groupByDay(entries).map((group) => (
    <section key={group.key}>
      <h3 className="section-title">{group.label}</h3>
      <div className="list">
        {group.items.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            friend={users?.(entry.friendId)}
            showFriend={Boolean(users)}
            selecting={Boolean(selection?.active)}
            selected={Boolean(selection?.ids.has(entry.id))}
            onSelect={selection?.active ? (item) => selection.toggle(item.id) : onSelect}
            onLongPress={selection && !selection.active ? (item) => selection.start(item.id) : null}
          />
        ))}
      </div>
    </section>
  ));
}
