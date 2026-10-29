// Domain actions shared by the API and the bot. Each throws HttpError on bad input
// and sends the other side a notification in the background (ctx.waitUntil).
import { isCurrency, MAX_AMOUNT } from "../shared/money.js";
import { canOffset, isPaymentMethod } from "../shared/labels.js";
import {
  acceptFriendRequest,
  balanceWith,
  countActiveInvites,
  createInvite,
  deleteFriendship,
  getEntries,
  getEntry,
  getFriendship,
  getUser,
  insertEntry,
  insertFriendRequest,
  isFriend,
  makeFriends,
  publicEntry,
  redeemInvite,
  respondToEntry,
  upsertUser,
} from "./db.js";
import {
  entriesDeletedText,
  entryPendingText,
  entryRespondedText,
  friendAcceptedText,
  friendRequestText,
  inviteUsedText,
} from "./messages.js";
import { notifyUser, openAppKeyboard } from "./telegram.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function background(ctx, promise) {
  ctx.waitUntil(promise.catch((error) => console.warn("notification failed", error)));
}

// ---------- access ----------

// "inv_<code>" from a bot /start payload or a Mini App start_param.
export function inviteCodeFrom(payload) {
  const match = /^inv_([a-z0-9]{6,32})$/.exec(String(payload || "").trim());
  return match ? match[1] : null;
}

// Lets in a member, or anyone with a valid invite (they become friends with its author).
// Strangers get null and nothing about them is stored.
export async function admitUser({ env, ctx, origin }, tgUser, { invite = null, canNotify = false } = {}) {
  const existing = await getUser(env.DB, tgUser.id);
  const inviterId = invite ? await redeemInvite(env.DB, invite, tgUser.id) : null;
  if (!existing?.approved_at && !inviterId) return null;

  const me = await upsertUser(env.DB, tgUser, { canNotify, invitedBy: inviterId });
  if (inviterId) {
    await makeFriends(env.DB, me.id, inviterId, inviterId);
    const inviter = await getUser(env.DB, inviterId);
    background(ctx, notifyUser(env, inviter, inviteUsedText(me), { origin }));
  }
  return me;
}

const MAX_ACTIVE_INVITES = 10;

export async function newInvite({ env }, me) {
  if ((await countActiveInvites(env.DB, me.id)) >= MAX_ACTIVE_INVITES) {
    throw new HttpError(429, "У тебя уже 10 неиспользованных приглашений. Подожди, пока друзья ими воспользуются, или пока они истекут.");
  }
  const invite = await createInvite(env.DB, me.id);
  return { link: `https://t.me/${env.BOT_USERNAME}?start=inv_${invite.code}`, expiresAt: invite.expires_at };
}

// ---------- friends ----------

export async function requestFriend({ env, ctx, origin }, me, otherId) {
  if (otherId === me.id) throw new HttpError(400, "Нельзя добавить себя");
  const other = await getUser(env.DB, otherId);
  if (!other) throw new HttpError(404, "Пользователь не найден");

  const existing = await getFriendship(env.DB, me.id, otherId);
  if (existing?.status === "accepted") return "friend";
  if (existing?.requested_by === me.id) return "outgoing";
  // They already asked us: a request back means yes.
  if (existing) return acceptFriend({ env, ctx, origin }, me, otherId);

  await insertFriendRequest(env.DB, me.id, otherId);
  background(
    ctx,
    notifyUser(env, other, friendRequestText(me), {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "Принять", callback_data: `fr:acc:${me.id}` },
            { text: "Отклонить", callback_data: `fr:dec:${me.id}` },
          ],
        ],
      },
    })
  );
  return "outgoing";
}

export async function acceptFriend({ env, ctx, origin }, me, otherId) {
  const accepted = await acceptFriendRequest(env.DB, me.id, otherId);
  if (!accepted) {
    if (await isFriend(env.DB, me.id, otherId)) return "friend";
    throw new HttpError(404, "Заявка уже неактуальна");
  }
  const other = await getUser(env.DB, otherId);
  background(ctx, notifyUser(env, other, friendAcceptedText(me), { origin }));
  return "friend";
}

// Only touches a pending request from `otherId`, so a stale bot button cannot drop a friendship.
export async function declineFriend({ env }, me, otherId) {
  const existing = await getFriendship(env.DB, me.id, otherId);
  if (existing?.status !== "pending" || existing.requested_by !== otherId) return false;
  await deleteFriendship(env.DB, me.id, otherId);
  return true;
}

// Declines an incoming request, cancels an outgoing one or removes a friend.
export async function removeFriend({ env }, me, otherId) {
  const existing = await getFriendship(env.DB, me.id, otherId);
  if (!existing) return "none";
  if (existing.status === "accepted") {
    const balances = await balanceWith(env.DB, me.id, otherId);
    if (balances.length) throw new HttpError(409, "Сначала закройте долги: удалить можно только друга, с которым вы в расчёте");
  }
  await deleteFriendship(env.DB, me.id, otherId);
  return "none";
}

// ---------- entries ----------

export async function createEntry({ env, ctx, origin }, me, input) {
  const friendId = Number(input.friendId);
  const amount = Number(input.amount);
  const currency = String(input.currency || "");
  const note = String(input.note || "").trim().slice(0, 200);
  const category = input.kind === "debt" ? String(input.category || "").trim().slice(0, 40) : "";
  const method = input.kind === "payment" && input.method ? String(input.method) : null;

  if (!["they_owe", "i_owe"].includes(input.direction)) throw new HttpError(400, "Неизвестное направление");
  if (!["debt", "payment"].includes(input.kind)) throw new HttpError(400, "Неизвестный тип записи");
  if (input.kind === "debt" && !note) throw new HttpError(400, "Добавь описание: за что этот долг");
  if (method && !isPaymentMethod(method)) throw new HttpError(400, "Неизвестный способ оплаты");
  if (method === "purchase" && !note) throw new HttpError(400, "Напиши, что было куплено");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new HttpError(400, "Некорректная сумма");
  if (!isCurrency(currency)) throw new HttpError(400, "Неизвестная валюта");
  if (!(await isFriend(env.DB, me.id, friendId))) throw new HttpError(403, "Записывать долги можно только друзьям");

  // they_owe: I gave value, so the friend owes me more afterwards.
  const theyOwe = input.direction === "they_owe";
  const entry = await insertEntry(env.DB, {
    creditorId: theyOwe ? me.id : friendId,
    debtorId: theyOwe ? friendId : me.id,
    amount,
    currency,
    kind: input.kind,
    note,
    category,
    method,
    createdBy: me.id,
  });

  background(ctx, askToConfirm(env, origin, entry, me, friendId));
  return entry;
}

// Records a payment of the whole open balance in one currency; the friend confirms it like any entry.
export async function settle({ env, ctx, origin }, me, friendId, input) {
  const currency = String(input.currency || "");
  if (!isCurrency(currency)) throw new HttpError(400, "Неизвестная валюта");
  const balance = (await balanceWith(env.DB, me.id, friendId)).find((item) => item.currency === currency);
  if (!balance) throw new HttpError(409, "В этой валюте вы уже в расчёте");
  const comment = String(input.note || "").trim();
  return createEntry({ env, ctx, origin }, me, {
    friendId,
    // Friend owes me (positive) -> they paid me back -> the entry goes from them to me.
    direction: balance.amount > 0 ? "i_owe" : "they_owe",
    kind: "payment",
    amount: Math.abs(balance.amount),
    currency,
    method: input.method || null,
    note: comment || (input.method === "purchase" ? "" : "Погашено полностью"),
  });
}

const DECISIONS = ["confirm", "offset", "decline"];

// The other side answers a pending entry: a new debt, an offset against the existing debt, or no.
export async function respondEntry({ env, ctx, origin }, me, entryId, decision) {
  if (!DECISIONS.includes(decision)) throw new HttpError(400, "Неизвестный ответ");
  const pending = await getEntry(env.DB, entryId);
  if (!pending || pending.status !== "pending" || pending.created_by === me.id) {
    throw new HttpError(409, "Запись уже обработана или удалена");
  }
  if (pending.creditor_id !== me.id && pending.debtor_id !== me.id) throw new HttpError(404, "Запись не найдена");

  const friendId = pending.created_by;
  if (decision === "offset") {
    const view = publicEntry(pending, me.id);
    const balance = (await balanceWith(env.DB, me.id, friendId)).find((item) => item.currency === view.currency);
    if (!canOffset(pending.kind, view.amount, balance?.amount || 0)) {
      throw new HttpError(409, "Вычитать не из чего: встречного долга в этой валюте нет");
    }
  }

  const entry = await respondToEntry(env.DB, entryId, me.id, {
    status: decision === "decline" ? "declined" : "confirmed",
    // An offset is the same money flow, recorded as paying back the existing debt.
    kind: decision === "offset" ? "payment" : pending.kind,
  });
  if (!entry) throw new HttpError(409, "Запись уже обработана или удалена");

  const [friend, friendBalances, myBalances] = await Promise.all([
    getUser(env.DB, friendId),
    balanceWith(env.DB, friendId, me.id),
    balanceWith(env.DB, me.id, friendId),
  ]);
  background(
    ctx,
    notifyUser(env, friend, entryRespondedText(entry, me, friendId, friendBalances, decision), { origin })
  );
  return { entry, balances: myBalances };
}

// Soft-deletes the given entries I take part in; each friend gets one message about theirs.
export async function deleteEntries({ env, ctx, origin }, me, ids) {
  const unique = [...new Set(ids.map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 100);
  const entries = (await getEntries(env.DB, unique)).filter(
    (entry) => entry.creditor_id === me.id || entry.debtor_id === me.id
  );
  if (!entries.length) throw new HttpError(404, "Записи не найдены");

  await env.DB.batch(
    entries.map((entry) =>
      env.DB.prepare("UPDATE entries SET deleted_at = ?2, deleted_by = ?3 WHERE id = ?1 AND deleted_at IS NULL").bind(
        entry.id,
        Date.now(),
        me.id
      )
    )
  );

  const byFriend = new Map();
  for (const entry of entries) {
    const friendId = entry.creditor_id === me.id ? entry.debtor_id : entry.creditor_id;
    byFriend.set(friendId, [...(byFriend.get(friendId) || []), entry]);
  }
  for (const [friendId, list] of byFriend) {
    background(ctx, notifyDeleted(env, origin, list, me, friendId));
  }
  return entries.length;
}

async function askToConfirm(env, origin, entry, actor, friendId) {
  const [friend, balances] = await Promise.all([getUser(env.DB, friendId), balanceWith(env.DB, friendId, actor.id)]);
  const view = publicEntry(entry, friendId);
  const balance = balances.find((item) => item.currency === view.currency)?.amount || 0;
  const offset = canOffset(entry.kind, view.amount, balance);
  const answer = offset
    ? [
        { text: "Новый долг", callback_data: `en:c:${entry.id}` },
        { text: "Вычесть из долга", callback_data: `en:o:${entry.id}` },
      ]
    : [{ text: "Подтвердить", callback_data: `en:c:${entry.id}` }];
  const keyboard = [answer, [{ text: "Отклонить", callback_data: `en:d:${entry.id}` }]];
  const open = openAppKeyboard(origin);
  if (open) keyboard.push(...open.inline_keyboard);

  await notifyUser(env, friend, entryPendingText(entry, actor, friendId, balances, offset), {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function notifyDeleted(env, origin, entries, actor, friendId) {
  const [friend, balances] = await Promise.all([getUser(env.DB, friendId), balanceWith(env.DB, friendId, actor.id)]);
  await notifyUser(env, friend, entriesDeletedText(entries, actor, friendId, balances), { origin });
}
