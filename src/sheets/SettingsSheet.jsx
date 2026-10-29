import { CURRENCIES, currencySymbol } from "../../shared/money.js";
import Icon from "../components/Icon";
import Sheet from "../components/Sheet";
import { Avatar, Chips } from "../components/ui";
import { fullName, handle } from "../lib/format";
import { haptic, isTelegram, requestWriteAccess, showAlert } from "../telegram";
import { useStore, useUi } from "../useStore";

const OPTIONS = CURRENCIES.map((item) => ({
  id: item.code,
  title: item.code === item.symbol ? item.code : `${item.code} ${item.symbol}`,
}));

export default function SettingsSheet({ sheetKey }) {
  const { state, mutate } = useStore();
  const { closeSheet } = useUi();
  const { me } = state;

  const changeCurrency = (code) => {
    if (code !== me.defaultCurrency) mutate("PATCH", "/me", { defaultCurrency: code });
  };

  const enableNotifications = async () => {
    if (!isTelegram) return;
    if (await requestWriteAccess()) {
      if (await mutate("POST", "/me/notifications")) haptic.success();
    } else {
      showAlert("Без разрешения бот не сможет присылать уведомления. Можно также просто нажать /start в чате с ботом.");
    }
  };

  return (
    <Sheet variant="bottom" onClose={() => closeSheet(sheetKey)}>
      <div className="profile-head">
        <Avatar user={me} size={64} />
        <div>
          <h2>{fullName(me)}</h2>
          <p className="muted">{handle(me) || "username не задан"}</p>
        </div>
      </div>

      {!me.username && (
        <div className="notice">
          Без username друзья не найдут тебя в поиске. Задай его в настройках Telegram и открой приложение заново.
        </div>
      )}

      <p className="field-caption">Валюта по умолчанию</p>
      <Chips options={OPTIONS} value={me.defaultCurrency} onChange={changeCurrency} />
      <p className="hint">Подставляется в новые записи. Сейчас: {currencySymbol(me.defaultCurrency)}</p>

      <p className="field-caption">Уведомления</p>
      {me.canNotify ? (
        <div className="notice">
          <Icon name="bell" size={18} />
          Бот присылает новые записи и заявки в чат
        </div>
      ) : (
        <button type="button" className="secondary-button" onClick={enableNotifications}>
          <Icon name="bell" size={18} />
          Разрешить уведомления от бота
        </button>
      )}

      <p className="footer-note">FureZ Debts{state.bot ? ` · @${state.bot}` : ""}</p>
    </Sheet>
  );
}
