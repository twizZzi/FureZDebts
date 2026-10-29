import { useEffect } from "react";
import "./App.css";
import Icon from "./components/Icon";
import { BrowserMainButton } from "./components/ui";
import { StoreProvider } from "./store";
import { useStore, useUi } from "./useStore";
import { DepthContext } from "./hooks";
import { haptic, isTelegram, openTelegramLink } from "./telegram";

import BalanceScreen from "./screens/BalanceScreen";
import FeedScreen from "./screens/FeedScreen";
import FriendsScreen from "./screens/FriendsScreen";

import FriendSheet from "./sheets/FriendSheet";
import EntrySheet from "./sheets/EntrySheet";
import SearchSheet from "./sheets/SearchSheet";
import SettingsSheet from "./sheets/SettingsSheet";
import ActionsSheet from "./sheets/ActionsSheet";
import CategorySheet from "./sheets/CategorySheet";
import SettleSheet from "./sheets/SettleSheet";
import { ConfirmSheet, PendingSheet } from "./sheets/ConfirmSheets";

const TABS = [
  { id: "balance", title: "Долги", icon: "wallet", Screen: BalanceScreen },
  { id: "feed", title: "Лента", icon: "feed", Screen: FeedScreen },
  { id: "friends", title: "Друзья", icon: "users", Screen: FriendsScreen },
];

const SHEETS = {
  friend: FriendSheet,
  entry: EntrySheet,
  search: SearchSheet,
  settings: SettingsSheet,
  actions: ActionsSheet,
  category: CategorySheet,
  settle: SettleSheet,
  confirm: ConfirmSheet,
  pending: PendingSheet,
};

// Tabs built from the shared state reload it on every visit; the feed fetches on its own.
const REFRESH_ON_VISIT = new Set(["balance", "friends"]);

function BottomNav() {
  const { tab, setTab } = useUi();
  const { state, refresh } = useStore();
  const badges = { friends: state?.incoming.length || 0, balance: state?.pendingIncoming.length || 0 };

  return (
    <nav className="bottom-nav">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={tab === item.id ? "active" : ""}
          onClick={() => {
            if (tab !== item.id) haptic.select();
            if (REFRESH_ON_VISIT.has(item.id)) refresh();
            setTab(item.id);
            window.scrollTo({ top: 0 });
          }}
        >
          <span className="nav-icon">
            <Icon name={item.icon} size={22} />
            {badges[item.id] > 0 && <i className="nav-badge">{badges[item.id]}</i>}
          </span>
          <span>{item.title}</span>
        </button>
      ))}
    </nav>
  );
}

function Splash() {
  const { loadError, refresh, state } = useStore();

  if (!loadError) {
    return (
      <div className="splash" aria-busy="true">
        <div className="spinner" />
      </div>
    );
  }

  const unauthorized = loadError.status === 401;
  if (loadError.code === "invite_required") {
    return (
      <div className="splash">
        <div className="empty">
          <strong>Закрытый бот</strong>
          <p>
            Сюда пускают только по приглашению. Попроси друга, который уже пользуется ботом, отправить тебе
            ссылку — она есть у него в приложении на вкладке «Друзья».
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="splash">
      <div className="empty">
        <strong>{unauthorized ? "Открой приложение в Telegram" : "Не получилось загрузить"}</strong>
        <p>{unauthorized ? "Вход работает через твой Telegram-аккаунт, отдельный пароль не нужен." : loadError.message}</p>
      </div>
      {unauthorized && !isTelegram ? (
        <button
          type="button"
          className="primary-button"
          onClick={() => openTelegramLink(`https://t.me/${state?.bot || "FureZDebtsBot"}`)}
        >
          Открыть бота
        </button>
      ) : (
        <button type="button" className="primary-button" onClick={refresh}>
          Повторить
        </button>
      )}
    </div>
  );
}

function Shell() {
  const { state } = useStore();
  const { tab, sheets } = useUi();
  const { Screen } = TABS.find((item) => item.id === tab) || TABS[0];

  useEffect(() => {
    document.documentElement.classList.toggle("sheet-open", sheets.length > 0);
  }, [sheets.length]);

  if (!state) return <Splash />;

  return (
    <div className="app">
      <main className="screen" aria-hidden={sheets.length > 0 || undefined}>
        <Screen />
      </main>
      <BottomNav />

      {sheets.map((sheet, index) => {
        const SheetComponent = SHEETS[sheet.type];
        return (
          <DepthContext.Provider key={sheet.key} value={index + 1}>
            <SheetComponent sheetKey={sheet.key} {...sheet.props} />
          </DepthContext.Provider>
        );
      })}

      <BrowserMainButton />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
