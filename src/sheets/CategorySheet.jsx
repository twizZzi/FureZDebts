import { useMemo, useState } from "react";
import { DEFAULT_CATEGORIES } from "../../shared/labels.js";
import Icon from "../components/Icon";
import Sheet from "../components/Sheet";
import { confirmAction, haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

// Pick a category for a debt or create a new one. Built-in categories plus my own.
export default function CategorySheet({ sheetKey, value, onSelect }) {
  const { state, mutate } = useStore();
  const { closeSheet } = useUi();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => closeSheet(sheetKey);
  const choose = (name) => {
    haptic.select();
    onSelect(name);
    close();
  };

  const options = useMemo(() => {
    const own = state.categories.map((item) => ({ name: item.name, id: item.id }));
    const ownNames = new Set(own.map((item) => item.name.toLowerCase()));
    const builtIn = DEFAULT_CATEGORIES.filter((name) => !ownNames.has(name.toLowerCase())).map((name) => ({ name }));
    return [...own, ...builtIn];
  }, [state.categories]);

  const search = query.trim().replace(/\s+/g, " ");
  const filtered = options.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const exact = options.some((item) => item.name.toLowerCase() === search.toLowerCase());

  const create = async () => {
    setBusy(true);
    const result = await mutate("POST", "/categories", { name: search });
    setBusy(false);
    if (result) choose(search.slice(0, 40));
  };

  const remove = async (item) => {
    if (!(await confirmAction(`Удалить категорию «${item.name}»? В старых записях она останется.`))) return;
    mutate("DELETE", `/categories/${item.id}`);
  };

  return (
    <Sheet variant="bottom" title="Категория" onClose={close}>
      <label className="search-field category-search">
        <Icon name="search" size={18} />
        <input
          autoComplete="off"
          maxLength={40}
          placeholder="Найти или создать"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !search) return;
            if (exact) choose(options.find((item) => item.name.toLowerCase() === search.toLowerCase()).name);
            else create();
          }}
        />
      </label>

      <div className="action-list category-list">
        {search && !exact && (
          <button type="button" className="category-create" disabled={busy} onClick={create}>
            <Icon name="plus" size={18} />
            Создать «{search}»
          </button>
        )}
        {value && !search && (
          <button type="button" className="category-clear" onClick={() => choose(null)}>
            Без категории
          </button>
        )}
        {filtered.map((item) => (
          <div key={item.name} className={`category-row ${item.name === value ? "active" : ""}`}>
            <button type="button" onClick={() => choose(item.name)}>
              {item.name}
              {item.name === value && <Icon name="check" size={18} />}
            </button>
            {item.id && (
              <button
                type="button"
                className="category-remove"
                aria-label={`Удалить ${item.name}`}
                onClick={() => remove(item)}
              >
                <Icon name="trash" size={17} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
