import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataContext, UiContext } from "./useStore";
import { api, request } from "./api";
import { haptic, onAppActivated, showAlert } from "./telegram";

let sheetSequence = 0;

export function StoreProvider({ children }) {
  const [state, setState] = useState(null); // { me, friends, incoming, outgoing, bot }
  const [loadError, setLoadError] = useState(null);
  // Bumped on every server change, so open sheets and the feed know to refetch.
  const [version, setVersion] = useState(0);
  const lastRefresh = useRef(0);

  const applyState = useCallback((next) => {
    if (next) setState(next);
    setVersion((value) => value + 1);
  }, []);

  const refresh = useCallback(() => {
    lastRefresh.current = Date.now();
    return api.get("/state").then(
      (data) => {
        applyState(data.state);
        setLoadError(null);
      },
      (error) => setLoadError(error)
    );
  }, [applyState]);

  useEffect(() => {
    let active = true;
    const load = () => {
      lastRefresh.current = Date.now();
      api.get("/state").then(
        (data) => {
          if (!active) return;
          applyState(data.state);
          setLoadError(null);
        },
        (error) => active && setLoadError(error)
      );
    };
    load();
    // Friends may have added entries while the app sat in the background.
    const unsubscribe = onAppActivated(() => {
      if (Date.now() - lastRefresh.current > 3000) load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyState]);

  // Runs a change on the server; the worker answers with fresh state. Resolves to null on error.
  const mutate = useCallback(
    async (method, path, body) => {
      try {
        const data = await request(method, path, body);
        applyState(data.state);
        return data;
      } catch (error) {
        haptic.warning();
        await showAlert(error.message);
        return null;
      }
    },
    [applyState]
  );

  const friendsById = useMemo(() => new Map((state?.friends || []).map((friend) => [friend.id, friend])), [state]);

  const [tab, setTab] = useState("balance");
  const [sheets, setSheets] = useState([]);

  const openSheet = useCallback((type, props = {}) => {
    const key = ++sheetSequence;
    setSheets((prev) => [...prev, { key, type, props }]);
    return key;
  }, []);

  const closeSheet = useCallback((key) => {
    setSheets((prev) => (key ? prev.filter((sheet) => sheet.key !== key) : prev.slice(0, -1)));
  }, []);

  const closeAllSheets = useCallback(() => setSheets([]), []);

  const ui = useMemo(
    () => ({ tab, setTab, sheets, openSheet, closeSheet, closeAllSheets }),
    [tab, sheets, openSheet, closeSheet, closeAllSheets]
  );

  const store = useMemo(
    () => ({ state, loadError, version, refresh, mutate, friendsById }),
    [state, loadError, version, refresh, mutate, friendsById]
  );

  return (
    <DataContext.Provider value={store}>
      <UiContext.Provider value={ui}>{children}</UiContext.Provider>
    </DataContext.Provider>
  );
}
