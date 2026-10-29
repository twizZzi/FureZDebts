import { Hono } from "hono";
import { isCurrency } from "../shared/money.js";
import {
  acceptFriend,
  createEntry,
  declineFriend,
  deleteEntry,
  HttpError,
  removeFriend,
  requestFriend,
  settle,
} from "./actions.js";
import { DEV_USERS, validateInitData } from "./auth.js";
import { handleUpdate } from "./bot.js";
import {
  balanceWith,
  buildState,
  entriesWith,
  feed,
  getFriendship,
  getUser,
  publicUser,
  searchUsers,
  setCanNotify,
  setDefaultCurrency,
  upsertUser,
} from "./db.js";

const app = new Hono();

const deps = (c) => ({ env: c.env, ctx: c.executionCtx, origin: new URL(c.req.url).origin });

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
  console.error(error);
  return c.json({ error: "Что-то пошло не так, попробуй ещё раз" }, 500);
});

app.notFound((c) => c.json({ error: "Не найдено" }, 404));

// ---------- bot ----------

app.post("/bot/webhook", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (!secret || c.req.header("x-telegram-bot-api-secret-token") !== secret) return c.text("forbidden", 403);
  const update = await c.req.json().catch(() => null);
  // Always 200: Telegram re-sends failed updates, and a broken one would loop forever.
  if (update) {
    try {
      await handleUpdate(update, deps(c));
    } catch (error) {
      console.error("update failed", error);
    }
  }
  return c.text("ok");
});

// ---------- api ----------

const api = new Hono();

api.use("*", async (c, next) => {
  const header = c.req.header("authorization") || "";
  let tgUser = null;
  if (header.startsWith("tma ")) tgUser = await validateInitData(header.slice(4), c.env.BOT_TOKEN);
  else if (c.env.DEV_MODE === "1") tgUser = DEV_USERS[c.req.header("x-dev-user")] || null;
  if (!tgUser) return c.json({ error: "Открой приложение через Telegram" }, 401);

  c.set("me", await upsertUser(c.env.DB, tgUser, { canNotify: tgUser.allows_write_to_pm === true }));
  await next();
});

function idParam(c, name = "id") {
  const id = Number(c.req.param(name));
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Некорректный id");
  return id;
}

function cursor(c) {
  const before = Number(c.req.query("before"));
  return Number.isSafeInteger(before) && before > 0 ? before : undefined;
}

async function stateResponse(c, extra = {}) {
  const me = await getUser(c.env.DB, c.get("me").id);
  return c.json({ ...extra, state: await buildState(c.env.DB, me, c.env.BOT_USERNAME) });
}

api.get("/state", (c) => stateResponse(c));

api.patch("/me", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body.defaultCurrency !== undefined) {
    if (!isCurrency(body.defaultCurrency)) throw new HttpError(400, "Неизвестная валюта");
    await setDefaultCurrency(c.env.DB, c.get("me").id, body.defaultCurrency);
  }
  return stateResponse(c);
});

// Called after WebApp.requestWriteAccess() succeeds.
api.post("/me/notifications", async (c) => {
  await setCanNotify(c.env.DB, c.get("me").id, true);
  return stateResponse(c);
});

api.get("/users/search", async (c) => {
  const query = String(c.req.query("q") || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(query)) return c.json({ users: [] });
  return c.json({ users: await searchUsers(c.env.DB, c.get("me").id, query) });
});

api.post("/friends/:id/request", async (c) => {
  const relation = await requestFriend(deps(c), c.get("me"), idParam(c));
  return stateResponse(c, { relation });
});

api.post("/friends/:id/accept", async (c) => {
  await acceptFriend(deps(c), c.get("me"), idParam(c));
  return stateResponse(c);
});

api.post("/friends/:id/decline", async (c) => {
  await declineFriend(deps(c), c.get("me"), idParam(c));
  return stateResponse(c);
});

api.delete("/friends/:id", async (c) => {
  await removeFriend(deps(c), c.get("me"), idParam(c));
  return stateResponse(c);
});

api.get("/friends/:id/entries", async (c) => {
  const me = c.get("me").id;
  const friendId = idParam(c);
  const [friend, friendship, page, balances] = await Promise.all([
    getUser(c.env.DB, friendId),
    getFriendship(c.env.DB, me, friendId),
    entriesWith(c.env.DB, me, friendId, cursor(c)),
    balanceWith(c.env.DB, me, friendId),
  ]);
  // Profiles are visible to friends and to anyone you still share history with.
  if (!friend || (friendship?.status !== "accepted" && !page.entries.length)) throw new HttpError(404, "Друг не найден");
  return c.json({ friend: publicUser(friend), isFriend: friendship?.status === "accepted", balances, ...page });
});

api.post("/friends/:id/settle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await settle(deps(c), c.get("me"), idParam(c), String(body.currency || ""));
  return stateResponse(c);
});

api.get("/feed", async (c) => {
  const page = await feed(c.env.DB, c.get("me").id, cursor(c));
  const ids = [...new Set(page.entries.map((entry) => entry.friendId))];
  let users = {};
  if (ids.length) {
    const { results } = await c.env.DB.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all();
    users = Object.fromEntries(results.map((row) => [row.id, publicUser(row)]));
  }
  return c.json({ ...page, users });
});

api.post("/entries", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const entry = await createEntry(deps(c), c.get("me"), body);
  return stateResponse(c, { entryId: entry.id });
});

api.delete("/entries/:id", async (c) => {
  await deleteEntry(deps(c), c.get("me"), idParam(c));
  return stateResponse(c);
});

app.route("/api", api);

export default app;
