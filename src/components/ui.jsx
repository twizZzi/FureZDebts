import { useState, useSyncExternalStore } from "react";
import { formatMoney } from "../../shared/money.js";
import { balanceLabel } from "../../shared/labels.js";
import { fullName, initials } from "../lib/format";
import { getButtonsSnapshot, haptic, isTelegram, subscribeButtons, triggerMainButton } from "../telegram";

export function Segmented({ options, value, onChange, className = "" }) {
  return (
    <div className={`segmented ${className}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "active" : ""}
          onClick={() => {
            haptic.select();
            onChange(option.id);
          }}
        >
          {option.title}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`chip ${value === option.id ? "active" : ""}`}
          onClick={() => {
            haptic.select();
            onChange(option.id);
          }}
        >
          {option.title}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, text, children }) {
  return (
    <div className="empty">
      {title && <strong>{title}</strong>}
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Avatar({ user, size = 44 }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (user?.photoUrl && !broken) {
    return (
      <span className="avatar" style={style}>
        <img src={user.photoUrl} alt="" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="avatar" style={style} aria-label={fullName(user)}>
      {initials(user)}
    </span>
  );
}

// Signed amount from my side: + they owe me, − I owe them.
export function Money({ amount, currency, sign = true, className = "" }) {
  return (
    <span className={`money ${amount < 0 ? "negative" : ""} ${className}`}>
      {formatMoney(amount, currency, { sign })}
    </span>
  );
}

// Right-hand column of a friend row: one line per currency, or "в расчёте".
export function BalanceStack({ balances }) {
  if (!balances.length) return <span className="balance-stack settled">в расчёте</span>;
  return (
    <span className="balance-stack">
      {balances.map((item) => (
        <span key={item.currency}>
          <span className={`money ${item.amount < 0 ? "negative" : ""}`}>
            {formatMoney(Math.abs(item.amount), item.currency)}
          </span>
          <small>{balanceLabel(item.amount)}</small>
        </span>
      ))}
    </span>
  );
}

// Outside Telegram the MainButton is rendered as a sticky in-page button.
export function BrowserMainButton() {
  const { mainButton } = useSyncExternalStore(subscribeButtons, getButtonsSnapshot);
  if (isTelegram || !mainButton) return null;

  return (
    <div className="browser-main-button">
      <button type="button" disabled={mainButton.enabled === false} onClick={triggerMainButton}>
        {mainButton.text}
      </button>
    </div>
  );
}
