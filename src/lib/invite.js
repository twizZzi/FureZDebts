import { api } from "../api";
import { haptic, openTelegramLink, showAlert } from "../telegram";

const TEXT = "Зову тебя в FureZ Debts — будем записывать наши долги. Ссылка одноразовая и действует 7 дней.";

// Creates a one-time invite and opens Telegram's share dialog with it.
export async function shareInvite() {
  try {
    const { link } = await api.post("/invites");
    haptic.tap();
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(TEXT)}`);
  } catch (error) {
    haptic.warning();
    showAlert(error.message);
  }
}
