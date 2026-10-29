import { entryLabel } from "../../shared/labels.js";
import { formatMoney } from "../../shared/money.js";
import { Avatar, Money } from "./ui";
import { fullName, groupByDay, timeLabel } from "../lib/format";

// Entries grouped by day. With `users` each row shows the friend (feed);
// without it rows are a single friend's history.
export default function EntryList({ entries, users, onSelect }) {
  return groupByDay(entries).map((group) => (
    <section key={group.key}>
      <h3 className="section-title">{group.label}</h3>
      <div className="list">
        {group.items.map((entry) => {
          const friend = users?.(entry.friendId);
          const caption = [entryLabel(entry.kind, entry.amount), entry.note].filter(Boolean).join(" · ");
          return (
            <button key={entry.id} type="button" className="list-item entry-row" onClick={() => onSelect(entry)}>
              {users && <Avatar user={friend} size={40} />}
              <div>
                <strong>{users ? fullName(friend) : caption}</strong>
                <span>{users ? `${caption} · ${timeLabel(entry.createdAt)}` : timeLabel(entry.createdAt)}</span>
              </div>
              {entry.kind === "debt" ? (
                <Money amount={entry.amount} currency={entry.currency} className="entry-amount" />
              ) : (
                // Returns only move a debt towards zero, so they are shown neutral.
                <span className="money entry-amount payment">{formatMoney(Math.abs(entry.amount), entry.currency)}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  ));
}
