// Telegram Mini App initData validation:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const encoder = new TextEncoder();
const MAX_AGE_SECONDS = 24 * 60 * 60;

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signInitData(fields, botToken) {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  return toHex(await hmac(secret, checkString));
}

// Returns { user, startParam } from a valid initData string, or null.
export async function validateInitData(initData, botToken, now = Date.now()) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const fields = {};
  for (const [key, value] of params) if (key !== "hash") fields[key] = value;

  const expected = await signInitData(fields, botToken);
  if (!safeEqual(expected, hash.toLowerCase())) return null;

  const authDate = Number(fields.auth_date);
  if (!authDate || now / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(fields.user || "null");
    return user && Number.isSafeInteger(user.id) ? { user, startParam: fields.start_param || null } : null;
  } catch {
    return null;
  }
}

// Local-only fake accounts, enabled by DEV_MODE=1 in .dev.vars.
export const DEV_USERS = {
  1001: { id: 1001, first_name: "Рома", username: "roma_dev", allows_write_to_pm: false },
  1002: { id: 1002, first_name: "Петя", last_name: "Иванов", username: "petya_dev", allows_write_to_pm: false },
  1003: { id: 1003, first_name: "Аня", username: "anya_dev", allows_write_to_pm: false },
  // Not members yet: they need an invite (?start=inv_<code>).
  1004: { id: 1004, first_name: "Гость", username: "guest_dev", allows_write_to_pm: false },
  1005: { id: 1005, first_name: "Чужой", username: "stranger_dev", allows_write_to_pm: false },
};
