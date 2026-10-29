import { useEffect, useState } from "react";
import { formatMoney } from "../../shared/money.js";
import { balanceLabel, entryLabel } from "../../shared/labels.js";
import { api } from "../api";
import EntryList from "../components/EntryList";
import Icon from "../components/Icon";
import Sheet from "../components/Sheet";
import { Avatar, Empty } from "../components/ui";
import { useMainButton } from "../hooks";
import { fullName, handle, shortDate } from "../lib/format";
import { confirmAction, haptic, showAlert } from "../telegram";
import { useStore, useUi } from "../useStore";

export default function FriendSheet({ sheetKey, friendId }) {
  const { version, friendsById, mutate } = useStore();
  const { openSheet, closeSheet } = useUi();
  const [page, setPage] = useState(null); // { friend, isFriend, balances, entries, hasMore }
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/friends/${friendId}/entries`)
      .then((data) => !cancelled && setPage(data))
      .catch((error) => !cancelled && setPage({ error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [friendId, version]);

  const friendFromState = friendsById.get(friendId);
  const friend = friendFromState || page?.friend;
  const isFriend = Boolean(friendFromState);
  const balances = friendFromState?.balances || page?.balances || [];
  const name = fullName(friend);
  const close = () => closeSheet(sheetKey);

  useMainButton({
    text: "Записать",
    onClick: () => openSheet("entry", { friendId }),
    visible: isFriend,
  });

  const settleCurrency = async (balance) => {
    const amount = formatMoney(Math.abs(balance.amount), balance.currency);
    if (!(await confirmAction(`Отметить долг ${amount} с ${name} как полностью погашенный?`))) return;
    if (await mutate("POST", `/friends/${friendId}/settle`, { currency: balance.currency })) haptic.success();
  };

  const settle = () => {
    if (balances.length === 1) return settleCurrency(balances[0]);
    openSheet("actions", {
      title: "Какой долг погасить?",
      actions: balances.map((balance) => ({
        label: `${balanceLabel(balance.amount)} ${formatMoney(Math.abs(balance.amount), balance.currency)}`,
        onClick: () => settleCurrency(balance),
      })),
    });
  };

  const removeFriend = async () => {
    if (balances.length) {
      await showAlert("Удалить можно только друга, с которым вы в расчёте. Сначала погасите долги.");
      return;
    }
    if (!(await confirmAction(`Удалить ${name} из друзей? История записей останется в ленте.`))) return;
    if (await mutate("DELETE", `/friends/${friendId}`)) close();
  };

  const selectEntry = (entry) => {
    const title = `${entryLabel(entry.kind, entry.amount)} ${formatMoney(Math.abs(entry.amount), entry.currency)}`;
    openSheet("actions", {
      title,
      subtitle: [shortDate(entry.createdAt), entry.createdBy === friendId ? `записано: ${name}` : "записано тобой"].join(" · "),
      actions: [
        {
          label: "Удалить запись",
          destructive: true,
          onClick: async () => {
            if (await confirmAction(`Удалить «${title}»? ${name} получит уведомление.`)) {
              mutate("DELETE", `/entries/${entry.id}`);
            }
          },
        },
      ],
    });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const last = page.entries[page.entries.length - 1];
      const data = await api.get(`/friends/${friendId}/entries?before=${last.id}`);
      setPage((prev) => ({ ...prev, entries: [...prev.entries, ...data.entries], hasMore: data.hasMore }));
    } catch (error) {
      showAlert(error.message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Sheet
      title={friend ? name : "Друг"}
      subtitle={handle(friend) || undefined}
      onClose={close}
      headerRight={
        isFriend && (
          <button
            type="button"
            className="icon-button"
            aria-label="Ещё"
            onClick={() =>
              openSheet("actions", {
                title: name,
                actions: [{ label: "Удалить из друзей", destructive: true, onClick: removeFriend }],
              })
            }
          >
            <Icon name="more" />
          </button>
        )
      }
    >
      {page?.error && !friend ? (
        <section className="card">
          <Empty title="Не получилось загрузить" text={page.error} />
        </section>
      ) : (
        <>
          <section className="card friend-balance">
            {friend && <Avatar user={friend} size={56} />}
            {balances.length ? (
              <div className="friend-balance-lines">
                {balances.map((balance) => (
                  <div key={balance.currency}>
                    <p className="eyebrow">{balanceLabel(balance.amount)}</p>
                    <strong className={balance.amount < 0 ? "negative" : ""}>
                      {formatMoney(Math.abs(balance.amount), balance.currency)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="friend-balance-lines">
                <div>
                  <p className="eyebrow">Баланс</p>
                  <strong className="zero">В расчёте</strong>
                </div>
              </div>
            )}
          </section>

          {!isFriend && friend && <div className="notice">Вы больше не друзья — новые записи добавить нельзя.</div>}

          {isFriend && balances.length > 0 && (
            <button type="button" className="secondary-button settle-button" onClick={settle}>
              <Icon name="check" size={18} />
              Погасить полностью
            </button>
          )}

          {!page ? (
            <div className="card">
              <div className="spinner small" />
            </div>
          ) : page.entries?.length ? (
            <>
              <EntryList entries={page.entries} onSelect={selectEntry} />
              {page.hasMore && (
                <button type="button" className="secondary-button" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Загружаю…" : "Показать ещё"}
                </button>
              )}
            </>
          ) : (
            <section className="card">
              <Empty title="История пуста" text={`Записей с ${name} пока нет.`} />
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}
