// Thin wrapper over Telegram.WebApp. Every call is safe in a plain browser.
const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

// telegram-web-app.js defines WebApp everywhere; initData is only filled inside Telegram.
export const isTelegram = Boolean(webApp?.initData);

function supports(version) {
  return isTelegram && webApp.isVersionAtLeast?.(version);
}

function readCssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function syncChrome() {
  if (!isTelegram) return;
  const bg = readCssColor("--bg", "#ffffff");
  try {
    if (supports("6.1")) {
      webApp.setHeaderColor(bg);
      webApp.setBackgroundColor(bg);
    }
    if (supports("7.10")) webApp.setBottomBarColor(bg);
  } catch {
    // Older clients reject custom colors; keep defaults.
  }
  document.documentElement.dataset.scheme = webApp.colorScheme;
}

export function initTelegram() {
  if (!isTelegram) return;
  webApp.ready();
  webApp.expand();
  if (supports("7.7")) webApp.disableVerticalSwipes();
  document.documentElement.classList.add("in-telegram");
  syncChrome();
  webApp.onEvent("themeChanged", () => {
    syncChrome();
    refreshButtons();
  });
}

export function getTelegramUser() {
  return webApp?.initDataUnsafe?.user || null;
}

// Signed launch data, sent to the worker as `Authorization: tma <initData>`.
export function getInitData() {
  return isTelegram ? webApp.initData : "";
}

// Lets the bot message a user who opened the app without pressing /start.
export function requestWriteAccess() {
  if (!supports("6.9")) return Promise.resolve(false);
  return new Promise((resolve) => webApp.requestWriteAccess((granted) => resolve(Boolean(granted))));
}

export function openTelegramLink(url) {
  if (isTelegram) webApp.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

// Fires when the user comes back to an app that stayed open in the background.
export function onAppActivated(callback) {
  const onVisible = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", onVisible);
  if (supports("8.0")) webApp.onEvent("activated", callback);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    if (supports("8.0")) webApp.offEvent("activated", callback);
  };
}

export const haptic = {
  tap() {
    if (supports("6.1")) webApp.HapticFeedback.impactOccurred("light");
  },
  impact(style = "medium") {
    if (supports("6.1")) webApp.HapticFeedback.impactOccurred(style);
  },
  success() {
    if (supports("6.1")) webApp.HapticFeedback.notificationOccurred("success");
    else navigator.vibrate?.(40);
  },
  warning() {
    if (supports("6.1")) webApp.HapticFeedback.notificationOccurred("warning");
    else navigator.vibrate?.([30, 60, 30]);
  },
  select() {
    if (supports("6.1")) webApp.HapticFeedback.selectionChanged();
  },
};

export function confirmAction(message) {
  if (supports("6.2")) {
    return new Promise((resolve) => webApp.showConfirm(message, (ok) => resolve(Boolean(ok))));
  }
  return Promise.resolve(window.confirm(message));
}

export function showAlert(message) {
  if (supports("6.2")) {
    return new Promise((resolve) => webApp.showAlert(message, resolve));
  }
  window.alert(message);
  return Promise.resolve();
}

export function setClosingConfirmation(enabled) {
  if (!supports("6.2")) return;
  if (enabled) webApp.enableClosingConfirmation();
  else webApp.disableClosingConfirmation();
}

/*
  Layer registry for BackButton and MainButton.
  Every open sheet registers a layer (depth N). Components register a main
  button on the depth they render at. The top-most layer owns the buttons,
  so a sheet without its own main action hides the one underneath.
*/

let sequence = 0;
const layers = new Map(); // id -> { depth, seq, onBack }
const mainButtons = new Map(); // id -> { depth, seq, props }
const listeners = new Set();
let snapshot = { canGoBack: false, mainButton: null };

function topLayerDepth() {
  let depth = 0;
  layers.forEach((layer) => {
    depth = Math.max(depth, layer.depth);
  });
  return depth;
}

function topBackHandler() {
  let top = null;
  layers.forEach((layer) => {
    if (!top || layer.depth > top.depth || (layer.depth === top.depth && layer.seq > top.seq)) top = layer;
  });
  return top?.onBack || null;
}

function topMainButton() {
  const depth = topLayerDepth();
  let top = null;
  mainButtons.forEach((button) => {
    if (button.depth !== depth || button.props.visible === false) return;
    if (!top || button.seq > top.seq) top = button;
  });
  return top?.props || null;
}

const handleBack = () => topBackHandler()?.();
// Always resolves the current top button, so callers never hold a stale onClick.
export const triggerMainButton = () => {
  const props = topMainButton();
  if (props && props.enabled !== false) props.onClick();
};

if (isTelegram) {
  webApp.BackButton.onClick(handleBack);
  webApp.MainButton.onClick(triggerMainButton);
}

function refreshButtons() {
  const canGoBack = layers.size > 0;
  const mainButton = topMainButton();

  if (isTelegram) {
    if (canGoBack) webApp.BackButton.show();
    else webApp.BackButton.hide();

    if (mainButton) {
      const enabled = mainButton.enabled !== false;
      webApp.MainButton.setParams({
        text: mainButton.text,
        color: readCssColor("--accent", "#111111"),
        text_color: readCssColor("--accent-text", "#ffffff"),
        is_active: enabled,
        is_visible: true,
      });
    } else {
      webApp.MainButton.hide();
    }
  }

  document.documentElement.classList.toggle("has-main-button", Boolean(mainButton) && !isTelegram);
  snapshot = { canGoBack, mainButton };
  listeners.forEach((listener) => listener());
}

export function registerLayer(depth, onBack) {
  const id = ++sequence;
  layers.set(id, { depth, seq: id, onBack });
  refreshButtons();
  return {
    update(nextOnBack) {
      const layer = layers.get(id);
      if (layer) layer.onBack = nextOnBack;
    },
    remove() {
      layers.delete(id);
      refreshButtons();
    },
  };
}

export function registerMainButton(depth, props) {
  const id = ++sequence;
  mainButtons.set(id, { depth, seq: id, props });
  refreshButtons();
  return {
    update(nextProps) {
      const entry = mainButtons.get(id);
      if (!entry) return;
      const changed =
        entry.props.text !== nextProps.text ||
        entry.props.enabled !== nextProps.enabled ||
        entry.props.visible !== nextProps.visible;
      entry.props = nextProps;
      if (changed) refreshButtons();
    },
    remove() {
      mainButtons.delete(id);
      refreshButtons();
    },
  };
}

export function subscribeButtons(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getButtonsSnapshot() {
  return snapshot;
}
