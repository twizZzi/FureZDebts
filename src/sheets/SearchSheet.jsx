import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Icon from "../components/Icon";
import Sheet from "../components/Sheet";
import { Avatar, Empty } from "../components/ui";
import { useDebounced } from "../hooks";
import { fullName, handle, shareBotUrl } from "../lib/format";
import { haptic, openTelegramLink } from "../telegram";
import { useStore, useUi } from "../useStore";

function normalize(text) {
  return text.trim().replace(/^@/, "").toLowerCase();
}

export default function SearchSheet({ sheetKey }) {
  const { state, friendsById, mutate } = useStore();
  const { closeSheet, openSheet } = useUi();
  const [query, setQuery] = useState("");
  const debounced = normalize(useDebounced(query, 300));
  const [results, setResults] = useState({ query: "", users: [], error: null });
  const [busyId, setBusyId] = useState(null);
  const tooShort = debounced.length < 3;

  useEffect(() => {
    if (debounced.length < 3) return undefined;
    let cancelled = false;
    api
      .get(`/users/search?q=${encodeURIComponent(debounced)}`)
      .then((data) => !cancelled && setResults({ query: debounced, users: data.users, error: null }))
      .catch((error) => !cancelled && setResults({ query: debounced, users: [], error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // Relation comes from the live state, so it updates right after a request or accept.
  const relationOf = useMemo(() => {
    const incoming = new Set(state.incoming.map((user) => user.id));
    const outgoing = new Set(state.outgoing.map((user) => user.id));
    return (id) =>
      friendsById.has(id) ? "friend" : incoming.has(id) ? "incoming" : outgoing.has(id) ? "outgoing" : "none";
  }, [state.incoming, state.outgoing, friendsById]);

  const add = async (user) => {
    setBusyId(user.id);
    const result = await mutate("POST", `/friends/${user.id}/request`);
    setBusyId(null);
    if (result) haptic.success();
  };

  const searching = !tooShort && results.query !== debounced;
  const shown = tooShort ? [] : results.users;

  return (
    <Sheet title="Найти друга" onClose={() => closeSheet(sheetKey)}>
      <label className="search-field">
        <Icon name="search" size={18} />
        <input
          type="search"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          placeholder="@username"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {tooShort ? (
        <p className="hint">
          Введи username друга целиком или первые 3 буквы. Найти можно только тех, кто уже открывал
          {state.bot ? ` @${state.bot}` : " бота"}.
        </p>
      ) : searching ? (
        <div className="card search-results">
          <div className="spinner small" />
        </div>
      ) : results.error ? (
        <section className="card search-results">
          <Empty title="Не получилось найти" text={results.error} />
        </section>
      ) : shown.length ? (
        <div className="list search-results">
          {shown.map((user) => {
            const relation = relationOf(user.id);
            return (
              <div key={user.id} className="list-item">
                <Avatar user={user} />
                <div>
                  <strong>{fullName(user)}</strong>
                  <span>{handle(user)}</span>
                </div>
                {relation === "friend" ? (
                  <button
                    type="button"
                    className="text-button muted-button"
                    onClick={() => openSheet("friend", { friendId: user.id })}
                  >
                    В друзьях
                  </button>
                ) : relation === "outgoing" ? (
                  <span className="status-label">Заявка отправлена</span>
                ) : (
                  <button
                    type="button"
                    className="pill-button"
                    disabled={busyId === user.id}
                    onClick={() => add(user)}
                  >
                    {relation === "incoming" ? "Принять" : "Добавить"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <section className="card search-results">
          <Empty title="Никого не нашли" text={`Никто с @${debounced} пока не открывал бота. Отправь другу ссылку — после запуска его можно будет найти.`} />
        </section>
      )}

      {state.bot && (
        <button type="button" className="add-button" onClick={() => openTelegramLink(shareBotUrl(state.bot))}>
          <Icon name="share" size={18} />
          Отправить ссылку на бота
        </button>
      )}
    </Sheet>
  );
}
