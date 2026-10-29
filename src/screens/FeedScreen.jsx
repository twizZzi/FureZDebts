import { useCallback, useEffect, useState } from "react";
import { balanceSummary } from "../../shared/labels.js";
import { api } from "../api";
import EntryList from "../components/EntryList";
import Icon from "../components/Icon";
import { Avatar, Empty, ScreenAction } from "../components/ui";
import { useLayer } from "../hooks";
import { fullName, plural } from "../lib/format";
import { confirmAction, haptic, showAlert } from "../telegram";
import { useStore, useUi } from "../useStore";

// While picking entries, Telegram's Back button leaves selection mode.
function SelectionBack({ onBack }) {
  useLayer(0, onBack);
  return null;
}

const EMPTY_PAGE = { entries: [], users: {}, hasMore: false, loaded: false, error: null, filter: null };

function feedPath(filter, before) {
  const params = new URLSearchParams();
  if (filter) params.set("friend", filter);
  if (before) params.set("before", before);
  const query = params.toString();
  return `/feed${query ? `?${query}` : ""}`;
}

export default function FeedScreen() {
  const { state, version, friendsById, mutate } = useStore();
  const { openSheet } = useUi();
  const [filter, setFilter] = useState(null); // friend id or null for everyone
  const [page, setPage] = useState(EMPTY_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState(null); // Set of entry ids while selecting, otherwise null

  // A friend that was removed drops out of the filter.
  const activeFilter = filter && friendsById.has(filter) ? filter : null;
  const loaded = page.loaded && page.filter === activeFilter;

  useEffect(() => {
    let cancelled = false;
    api
      .get(feedPath(activeFilter))
      .then((data) => !cancelled && setPage({ ...data, loaded: true, error: null, filter: activeFilter }))
      .catch(
        (error) => !cancelled && setPage({ ...EMPTY_PAGE, loaded: true, error: error.message, filter: activeFilter })
      );
    return () => {
      cancelled = true;
    };
  }, [version, activeFilter]);

  const loadMore = async () => {
    const last = page.entries[page.entries.length - 1];
    setLoadingMore(true);
    try {
      const data = await api.get(feedPath(activeFilter, last.id));
      setPage((prev) => ({
        ...prev,
        entries: [...prev.entries, ...data.entries],
        users: { ...prev.users, ...data.users },
        hasMore: data.hasMore,
      }));
    } catch (error) {
      showAlert(error.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const choose = (id) => {
    haptic.select();
    setPicked(null);
    setFilter(id);
  };

  const selection = {
    active: Boolean(picked),
    ids: picked || new Set(),
    start: (id) => setPicked(new Set([id])),
    toggle: (id) => {
      haptic.select();
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next.size ? next : null;
      });
    },
  };

  const selectAll = () => {
    haptic.select();
    setPicked(new Set(page.entries.map((entry) => entry.id)));
  };

  const deletePicked = async () => {
    const count = picked.size;
    const words = plural(count, ["запись", "записи", "записей"]);
    if (!(await confirmAction(`Удалить ${count} ${words}? Друзья получат уведомление.`))) return;
    if (await mutate("POST", "/entries/delete", { ids: [...picked] })) {
      haptic.success();
      setPicked(null);
    }
  };

  const openEntry = (entry) => {
    const waitsForMe = entry.status === "pending" && entry.createdBy !== state.me.id;
    if (waitsForMe) openSheet("confirm", { entryId: entry.id });
    else openSheet("friend", { friendId: entry.friendId });
  };

  const userFor = useCallback((id) => friendsById.get(id) || page.users[id], [friendsById, page.users]);
  const selected = activeFilter ? friendsById.get(activeFilter) : null;

  return (
    <>
      <header className="screen-header">
        <div>
          <p className="eyebrow">
            {picked ? `Выбрано: ${picked.size}` : selected ? `С ${fullName(selected)}` : "Только твои записи"}
          </p>
          <h1>Лента</h1>
        </div>
        {picked && (
          <div className="header-actions">
            <button type="button" className="text-button" onClick={selectAll}>
              Все
            </button>
            <button type="button" className="text-button muted-button" onClick={() => setPicked(null)}>
              Отмена
            </button>
          </div>
        )}
      </header>
      {picked && <SelectionBack onBack={() => setPicked(null)} />}

      {state.friends.length > 0 && (
        <div className="friend-picker feed-filter" role="tablist" aria-label="Фильтр по другу">
          <button type="button" className={!activeFilter ? "active" : ""} onClick={() => choose(null)}>
            <span className="avatar filter-all" style={{ width: 44, height: 44 }}>
              <Icon name="users" size={20} />
            </span>
            <span>Все</span>
          </button>
          {state.friends.map((friend) => (
            <button
              key={friend.id}
              type="button"
              className={friend.id === activeFilter ? "active" : ""}
              onClick={() => choose(friend.id)}
            >
              <Avatar user={friend} size={44} />
              <span>{friend.firstName}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <button
          type="button"
          className="notice notice-button"
          onClick={() => openSheet("friend", { friendId: selected.id })}
        >
          <span>
            Сейчас: <b>{balanceSummary(selected.balances)}</b>
          </span>
          <Icon name="chevronRight" />
        </button>
      )}

      {!loaded ? (
        <div className="card">
          <div className="spinner small" />
        </div>
      ) : page.error && !page.entries.length ? (
        <section className="card">
          <Empty title="Не получилось загрузить" text={page.error} />
        </section>
      ) : !page.entries.length ? (
        <section className="card">
          <Empty
            title="Записей пока нет"
            text={
              selected
                ? `С ${fullName(selected)} ещё ничего не записано.`
                : "Здесь появятся долги и возвраты, в которых участвуешь ты. Чужие записи между другими людьми не видны."
            }
          />
        </section>
      ) : (
        <>
          <EntryList entries={page.entries} users={userFor} onSelect={openEntry} selection={selection} />
          {page.hasMore && (
            <button type="button" className="secondary-button" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Загружаю…" : "Показать ещё"}
            </button>
          )}
          {!picked && <p className="footer-note">Зажми запись, чтобы выбрать несколько и удалить</p>}
        </>
      )}

      {picked && (
        <ScreenAction danger onClick={deletePicked}>
          <Icon name="trash" size={18} />
          Удалить {picked.size} {plural(picked.size, ["запись", "записи", "записей"])}
        </ScreenAction>
      )}
    </>
  );
}
