// Points the bot at the deployed worker: webhook, menu button, commands, descriptions.
// Usage: BOT_TOKEN=... WEBHOOK_SECRET=... node scripts/setup-bot.mjs https://furez-debts.<account>.workers.dev
// Without env vars it reads BOT_TOKEN / WEBHOOK_SECRET from .dev.vars.
import { readFileSync } from "node:fs";

function readDevVars() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
    );
  } catch {
    return {};
  }
}

const devVars = readDevVars();
const token = process.env.BOT_TOKEN || devVars.BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET || devVars.WEBHOOK_SECRET;
const appUrl = (process.argv[2] || "").replace(/\/+$/, "");

if (!token || !secret || !appUrl.startsWith("https://")) {
  console.error("Нужны BOT_TOKEN, WEBHOOK_SECRET и https-адрес приложения первым аргументом.");
  process.exit(1);
}

async function call(method, params) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  console.log(`${result.ok ? "✓" : "✗"} ${method}${result.ok ? "" : `: ${result.description}`}`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

await call("setWebhook", {
  url: `${appUrl}/bot/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await call("setChatMenuButton", {
  menu_button: { type: "web_app", text: "Долги", web_app: { url: appUrl } },
});
await call("setMyCommands", {
  commands: [{ command: "start", description: "Открыть приложение" }],
});
await call("setMyShortDescription", {
  short_description: "Учёт долгов с друзьями: кто кому сколько должен.",
});
await call("setMyDescription", {
  description:
    "Записывай долги и возвраты с друзьями в любой валюте. Друзья находятся по @username, каждая запись сразу приходит второй стороне.",
});
