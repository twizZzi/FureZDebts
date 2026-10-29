import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import EntryList from "../components/EntryList";
import { Empty } from "../components/ui";
import { showAlert } from "../telegram";
import { useStore, useUi } from "../useStore";

export default function FeedScreen() {
  const { version, friendsById } = useStore();
  const { openSheet } = useUi();
  const [page, setPage] = useState({ entries: [], users: {}, hasMore: false, loaded: false, error: null });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/feed")
      .then((data) => !cancelled && setPage({ ...data, loaded: true, error: null }))
      .catch((error) => !cancelled && setPage((prev) => ({ ...prev, loaded: true, error: error.message })));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const loadMore = async () => {
    const last = page.entries[page.entries.length - 1];
    setLoadingMore(true);
    try {
      const data = await api.get(`/feed?before=${last.id}`);
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

  const userFor = useCallback((id) => friendsById.get(id) || page.users[id], [friendsById, page.users]);

  return (
    <>
      <header className="screen-header">
        <div>
          <p className="eyebrow">Все записи</p>
          <h1>Лента</h1>
        </div>
      </header>

      {!page.loaded ? (
        <div className="card">
          <div className="spinner small" />
        </div>
      ) : page.error && !page.entries.length ? (
        <section className="card">
          <Empty title="Не получилось загрузить" text={page.error} />
        </section>
      ) : !page.entries.length ? (
        <section className="card">
          <Empty title="Записей пока нет" text="Здесь появятся все долги и возвраты — твои и те, что записали друзья." />
        </section>
      ) : (
        <>
          <EntryList
            entries={page.entries}
            users={userFor}
            onSelect={(entry) => openSheet("friend", { friendId: entry.friendId })}
          />
          {page.hasMore && (
            <button type="button" className="secondary-button" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Загружаю…" : "Показать ещё"}
            </button>
          )}
        </>
      )}
    </>
  );
}
