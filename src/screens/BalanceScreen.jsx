import { useMemo } from "react";
import { formatMoney } from "../../shared/money.js";
import Icon from "../components/Icon";
import FriendRow from "../components/FriendRow";
import { Avatar, Empty, ScreenAction } from "../components/ui";
import { plural, totals } from "../lib/format";
import { useStore, useUi } from "../useStore";

function SummaryColumn({ label, items, negative = false }) {
  return (
    <div className="summary-col">
      <p className="eyebrow">{label}</p>
      {items.length ? (
        items.map((item, index) => (
          <strong key={item.currency} className={`${index ? "secondary" : ""} ${negative ? "negative" : ""}`}>
            {formatMoney(item.amount, item.currency)}
          </strong>
        ))
      ) : (
        <strong className="zero">0</strong>
      )}
    </div>
  );
}

export default function BalanceScreen() {
  const { state } = useStore();
  const { openSheet, setTab } = useUi();
  const { me, friends, incoming, pendingIncoming } = state;

  const { owedToMe, iOwe } = useMemo(() => totals(friends), [friends]);
  const withDebts = friends.filter((friend) => friend.balances.length);
  const settled = friends.length - withDebts.length;

  return (
    <>
      <header className="screen-header">
        <div>
          <p className="eyebrow">Привет, {me.firstName}</p>
          <h1>Долги</h1>
        </div>
        <button type="button" className="avatar-button" onClick={() => openSheet("settings")} aria-label="Профиль">
          <Avatar user={me} />
        </button>
      </header>

      {pendingIncoming.length > 0 && (
        <button type="button" className="notice notice-button notice-accent" onClick={() => openSheet("pending")}>
          <span>
            Ждут твоего подтверждения: {pendingIncoming.length}{" "}
            {plural(pendingIncoming.length, ["запись", "записи", "записей"])}
          </span>
          <Icon name="chevronRight" />
        </button>
      )}

      <section className="card summary">
        <SummaryColumn label="Тебе должны" items={owedToMe} />
        <SummaryColumn label="Твои долги" items={iOwe} negative />
      </section>

      {incoming.length > 0 && (
        <button type="button" className="notice notice-button" onClick={() => setTab("friends")}>
          <span>
            {incoming.length} {plural(incoming.length, ["заявка", "заявки", "заявок"])} в друзья
          </span>
          <Icon name="chevronRight" />
        </button>
      )}

      {friends.length === 0 ? (
        <section className="card">
          <Empty
            title="Пока нет друзей"
            text="Найди друга по @username. Когда он примет заявку, можно будет записывать долги."
          />
          <button type="button" className="primary-button" onClick={() => openSheet("search")}>
            <Icon name="search" size={18} />
            Найти друга
          </button>
        </section>
      ) : withDebts.length === 0 ? (
        <section className="card">
          <Empty title="Все в расчёте" text="Открытых долгов нет. Новую запись можно добавить кнопкой ниже." />
        </section>
      ) : (
        <>
          <h3 className="section-title">Открытые долги</h3>
          <div className="list">
            {withDebts.map((friend) => (
              <FriendRow key={friend.id} friend={friend} />
            ))}
          </div>
        </>
      )}

      {settled > 0 && withDebts.length > 0 && (
        <p className="footer-note">
          Ещё {settled} {plural(settled, ["друг", "друга", "друзей"])} в расчёте
        </p>
      )}

      {friends.length > 0 && (
        <ScreenAction onClick={() => openSheet("entry")}>
          <Icon name="plus" size={20} />
          Записать долг
        </ScreenAction>
      )}
    </>
  );
}
