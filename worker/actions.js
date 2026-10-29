// Domain actions shared by the API and the bot. Each throws HttpError on bad input
// and sends the other side a notification in the background (ctx.waitUntil).
import { isCurrency, MAX_AMOUNT } from "../shared/money.js";
import {
  acceptFriendRequest,
  balanceWith,
  countActiveInvites,
  createInvite,
  deleteFriendship,
  getEntry,
  getFriendship,
  getUser,
  insertEntry,
  insertFriendRequest,
  isFriend,
  makeFriends,
  redeemInvite,
  softDeleteEntry,
  upsertUser,
} from "./db.js";
import {
  entryCreatedText,
  entryDeletedText,
  friendAcceptedText,
  friendRequestText,
  inviteUsedText,
} from "./messages.js";
import { notifyUser } from "./telegram.js";

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

  if (!["they_owe", "i_owe"].includes(input.direction)) throw new HttpError(400, "Неизвестное направление");
  if (!["debt", "payment"].includes(input.kind)) throw new HttpError(400, "Неизвестный тип записи");
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
    createdBy: me.id,
  });

  background(ctx, notifyEntry(env, origin, entry, me, friendId, entryCreatedText));
  return entry;
}

// Records a payment that brings the balance in one currency to zero.
export async function settle({ env, ctx, origin }, me, friendId, currency) {
  if (!isCurrency(currency)) throw new HttpError(400, "Неизвестная валюта");
  const balance = (await balanceWith(env.DB, me.id, friendId)).find((item) => item.currency === currency);
  if (!balance) throw new HttpError(409, "В этой валюте вы уже в расчёте");
  return createEntry({ env, ctx, origin }, me, {
    friendId,
    // Friend owes me (positive) -> they paid me back -> the entry goes from them to me.
    direction: balance.amount > 0 ? "i_owe" : "they_owe",
    kind: "payment",
    amount: Math.abs(balance.amount),
    currency,
    note: "Погашено полностью",
  });
}

export async function deleteEntry({ env, ctx, origin }, me, entryId) {
  const entry = await getEntry(env.DB, entryId);
  if (!entry || (entry.creditor_id !== me.id && entry.debtor_id !== me.id)) throw new HttpError(404, "Запись не найдена");
  await softDeleteEntry(env.DB, entry.id, me.id);
  const friendId = entry.creditor_id === me.id ? entry.debtor_id : entry.creditor_id;
  background(ctx, notifyEntry(env, origin, entry, me, friendId, entryDeletedText));
}

async function notifyEntry(env, origin, entry, actor, friendId, makeText) {
  const [friend, balances] = await Promise.all([getUser(env.DB, friendId), balanceWith(env.DB, friendId, actor.id)]);
  await notifyUser(env, friend, makeText(entry, actor, friendId, balances), { origin });
}
