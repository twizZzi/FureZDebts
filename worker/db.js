// D1 queries. Times are unix milliseconds, amounts are minor units.

export function pair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username || null,
    firstName: row.first_name,
    lastName: row.last_name || null,
    photoUrl: row.photo_url || null,
  };
}

export function displayName(row) {
  return [row.first_name ?? row.firstName, row.last_name ?? row.lastName].filter(Boolean).join(" ") || "Без имени";
}

export function publicEntry(row, me) {
  const mine = row.creditor_id === me;
  return {
    id: row.id,
    friendId: mine ? row.debtor_id : row.creditor_id,
    // Positive: the entry increases what the friend owes me.
    amount: mine ? row.amount : -row.amount,
    currency: row.currency,
    kind: row.kind,
    note: row.note || null,
    category: row.category || null,
    method: row.method || null,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ---------- users ----------

// Only call for members: an existing approved user, or someone who just redeemed an invite.
export async function upsertUser(db, tgUser, { canNotify = false, invitedBy = null } = {}) {
  const now = Date.now();
  const username = tgUser.username || null;
  return db
    .prepare(
      `INSERT INTO users (id, username, username_lc, first_name, last_name, photo_url, can_notify, created_at, seen_at,
                          approved_at, invited_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8, ?9)
       ON CONFLICT (id) DO UPDATE SET
         username = excluded.username,
         username_lc = excluded.username_lc,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         photo_url = COALESCE(excluded.photo_url, users.photo_url),
         can_notify = MAX(users.can_notify, excluded.can_notify),
         seen_at = excluded.seen_at,
         approved_at = COALESCE(users.approved_at, excluded.approved_at),
         invited_by = COALESCE(users.invited_by, excluded.invited_by)
       RETURNING *`
    )
    .bind(
      tgUser.id,
      username,
      username ? username.toLowerCase() : null,
      tgUser.first_name || "",
      tgUser.last_name || null,
      tgUser.photo_url || null,
      canNotify ? 1 : 0,
      now,
      invitedBy
    )
    .first();
}

export function getUser(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first();
}

export function setDefaultCurrency(db, id, currency) {
  return db.prepare("UPDATE users SET default_currency = ?2 WHERE id = ?1").bind(id, currency).run();
}

export function setCanNotify(db, id, value) {
  return db.prepare("UPDATE users SET can_notify = ?2 WHERE id = ?1").bind(id, value ? 1 : 0).run();
}

// Prefix search by username; `query` is already lowercased and validated as [a-z0-9_].
export async function searchUsers(db, me, query) {
  const pattern = `${query.replace(/_/g, "\\_")}%`;
  const { results } = await db
    .prepare(
      `SELECT u.*, f.status AS friendship_status, f.requested_by
       FROM users u
       LEFT JOIN friendships f
         ON (f.user_a = MIN(u.id, ?1) AND f.user_b = MAX(u.id, ?1))
       WHERE u.username_lc LIKE ?2 ESCAPE '\\' AND u.id != ?1 AND u.approved_at IS NOT NULL
       ORDER BY (u.username_lc = ?3) DESC, u.username_lc
       LIMIT 20`
    )
    .bind(me, pattern, query)
    .all();
  return results.map((row) => ({ ...publicUser(row), relation: relation(row, me) }));
}

function relation(row, me) {
  if (!row.friendship_status) return "none";
  if (row.friendship_status === "accepted") return "friend";
  return row.requested_by === me ? "outgoing" : "incoming";
}

// ---------- friendships ----------

export function getFriendship(db, me, other) {
  const [a, b] = pair(me, other);
  return db.prepare("SELECT * FROM friendships WHERE user_a = ?1 AND user_b = ?2").bind(a, b).first();
}

export function insertFriendRequest(db, me, other) {
  const [a, b] = pair(me, other);
  return db
    .prepare(
      `INSERT INTO friendships (user_a, user_b, status, requested_by, created_at)
       VALUES (?1, ?2, 'pending', ?3, ?4) ON CONFLICT DO NOTHING`
    )
    .bind(a, b, me, Date.now())
    .run();
}

// Only the receiver of a pending request can accept it.
export async function acceptFriendRequest(db, me, other) {
  const [a, b] = pair(me, other);
  const result = await db
    .prepare(
      `UPDATE friendships SET status = 'accepted', created_at = ?4
       WHERE user_a = ?1 AND user_b = ?2 AND status = 'pending' AND requested_by = ?3`
    )
    .bind(a, b, other, Date.now())
    .run();
  return result.meta.changes > 0;
}

export async function deleteFriendship(db, me, other) {
  const [a, b] = pair(me, other);
  const result = await db.prepare("DELETE FROM friendships WHERE user_a = ?1 AND user_b = ?2").bind(a, b).run();
  return result.meta.changes > 0;
}

// Used by invites: the two people become friends right away.
export function makeFriends(db, me, other, requestedBy) {
  const [a, b] = pair(me, other);
  return db
    .prepare(
      `INSERT INTO friendships (user_a, user_b, status, requested_by, created_at)
       VALUES (?1, ?2, 'accepted', ?3, ?4)
       ON CONFLICT (user_a, user_b) DO UPDATE SET status = 'accepted'`
    )
    .bind(a, b, requestedBy, Date.now())
    .run();
}

export async function isFriend(db, me, other) {
  const row = await getFriendship(db, me, other);
  return row?.status === "accepted";
}

// ---------- balances ----------

export async function balancesByFriend(db, me) {
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN creditor_id = ?1 THEN debtor_id ELSE creditor_id END AS friend_id,
              currency,
              SUM(CASE WHEN creditor_id = ?1 THEN amount ELSE -amount END) AS amount,
              MAX(created_at) AS last_at
       FROM entries
       WHERE (creditor_id = ?1 OR debtor_id = ?1) AND deleted_at IS NULL AND status = 'confirmed'
       GROUP BY friend_id, currency`
    )
    .bind(me)
    .all();

  const byFriend = new Map();
  for (const row of results) {
    const item = byFriend.get(row.friend_id) || { balances: [], lastAt: 0 };
    if (row.amount !== 0) item.balances.push({ currency: row.currency, amount: row.amount });
    item.lastAt = Math.max(item.lastAt, row.last_at);
    byFriend.set(row.friend_id, item);
  }
  return byFriend;
}

export async function balanceWith(db, me, other) {
  const { results } = await db
    .prepare(
      `SELECT currency, SUM(CASE WHEN creditor_id = ?1 THEN amount ELSE -amount END) AS amount
       FROM entries
       WHERE ((creditor_id = ?1 AND debtor_id = ?2) OR (creditor_id = ?2 AND debtor_id = ?1))
         AND deleted_at IS NULL AND status = 'confirmed'
       GROUP BY currency`
    )
    .bind(me, other)
    .all();
  return results.filter((row) => row.amount !== 0);
}

// Everything the app shows on its main tabs, in one round trip.
export async function buildState(db, meRow, botUsername) {
  const me = meRow.id;
  const [{ results: rows }, balances, pendingIncoming, categories] = await Promise.all([
    db
      .prepare(
        `SELECT u.*, f.status, f.requested_by, f.created_at AS since
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
         WHERE f.user_a = ?1 OR f.user_b = ?1`
      )
      .bind(me)
      .all(),
    balancesByFriend(db, me),
    pendingFor(db, me),
    listCategories(db, me),
  ]);

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const row of rows) {
    const user = publicUser(row);
    if (row.status === "accepted") {
      const item = balances.get(row.id);
      friends.push({ ...user, since: row.since, balances: item?.balances || [], lastAt: item?.lastAt || 0 });
    } else if (row.requested_by === me) {
      outgoing.push({ ...user, at: row.since });
    } else {
      incoming.push({ ...user, at: row.since });
    }
  }

  friends.sort((a, b) => b.lastAt - a.lastAt || displayName(a).localeCompare(displayName(b), "ru"));
  incoming.sort((a, b) => b.at - a.at);
  outgoing.sort((a, b) => b.at - a.at);

  return {
    me: { ...publicUser(meRow), defaultCurrency: meRow.default_currency, canNotify: Boolean(meRow.can_notify) },
    friends,
    incoming,
    outgoing,
    pendingIncoming,
    categories,
    bot: botUsername || null,
  };
}

// ---------- entries ----------

// New entries start as pending: they count only after the other side confirms.
export function insertEntry(db, { creditorId, debtorId, amount, currency, kind, note, category, method, createdBy }) {
  return db
    .prepare(
      `INSERT INTO entries (creditor_id, debtor_id, amount, currency, kind, note, category, method, created_by, created_at, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending') RETURNING *`
    )
    .bind(creditorId, debtorId, amount, currency, kind, note || null, category || null, method || null, createdBy, Date.now())
    .first();
}

// Only the participant who did not create a pending entry can answer it, once.
export function respondToEntry(db, id, me, { status, kind }) {
  return db
    .prepare(
      `UPDATE entries SET status = ?3, kind = ?4, responded_at = ?5
       WHERE id = ?1 AND status = 'pending' AND deleted_at IS NULL
         AND created_by != ?2 AND (creditor_id = ?2 OR debtor_id = ?2)
       RETURNING *`
    )
    .bind(id, me, status, kind, Date.now())
    .first();
}

// Entries friends recorded that wait for my answer, with the friend's profile attached.
export async function pendingFor(db, me) {
  const { results } = await db
    .prepare(
      `SELECT e.*, u.id AS u_id, u.username AS u_username, u.first_name AS u_first_name,
              u.last_name AS u_last_name, u.photo_url AS u_photo_url
       FROM entries e JOIN users u ON u.id = e.created_by
       WHERE e.status = 'pending' AND e.deleted_at IS NULL AND e.created_by != ?1
         AND (e.creditor_id = ?1 OR e.debtor_id = ?1)
       ORDER BY e.id DESC LIMIT 50`
    )
    .bind(me)
    .all();
  return results.map((row) => ({
    ...publicEntry(row, me),
    friend: publicUser({
      id: row.u_id,
      username: row.u_username,
      first_name: row.u_first_name,
      last_name: row.u_last_name,
      photo_url: row.u_photo_url,
    }),
  }));
}

export async function getEntries(db, ids) {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(`SELECT * FROM entries WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all();
  return results;
}

export function getEntry(db, id) {
  return db.prepare("SELECT * FROM entries WHERE id = ?1 AND deleted_at IS NULL").bind(id).first();
}

const PAGE = 50;

export async function entriesWith(db, me, other, before) {
  const { results } = await db
    .prepare(
      `SELECT * FROM entries
       WHERE ((creditor_id = ?1 AND debtor_id = ?2) OR (creditor_id = ?2 AND debtor_id = ?1))
         AND deleted_at IS NULL AND id < ?3
       ORDER BY id DESC LIMIT ?4`
    )
    .bind(me, other, before || Number.MAX_SAFE_INTEGER, PAGE)
    .all();
  return { entries: results.map((row) => publicEntry(row, me)), hasMore: results.length === PAGE };
}

// Only entries the user takes part in; other people's debts are never visible.
export async function feed(db, me, before, friendId) {
  if (friendId) return entriesWith(db, me, friendId, before);
  const { results } = await db
    .prepare(
      `SELECT * FROM entries
       WHERE (creditor_id = ?1 OR debtor_id = ?1) AND deleted_at IS NULL AND id < ?2
       ORDER BY id DESC LIMIT ?3`
    )
    .bind(me, before || Number.MAX_SAFE_INTEGER, PAGE)
    .all();
  return { entries: results.map((row) => publicEntry(row, me)), hasMore: results.length === PAGE };
}

// ---------- invites ----------

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

export function countActiveInvites(db, me) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM invites WHERE created_by = ?1 AND used_by IS NULL AND expires_at > ?2")
    .bind(me, Date.now())
    .first("n");
}

export function createInvite(db, me) {
  const now = Date.now();
  return db
    .prepare("INSERT INTO invites (code, created_by, created_at, expires_at) VALUES (?1, ?2, ?3, ?4) RETURNING *")
    .bind(inviteCode(), me, now, now + INVITE_TTL)
    .first();
}

// Marks a fresh invite as used and returns its author's id, or null. Atomic, so a code works once.
export function redeemInvite(db, code, userId) {
  if (!/^[a-z0-9]{6,32}$/.test(code)) return null;
  const now = Date.now();
  return db
    .prepare(
      `UPDATE invites SET used_by = ?2, used_at = ?3
       WHERE code = ?1 AND used_by IS NULL AND expires_at > ?3 AND created_by != ?2
       RETURNING created_by`
    )
    .bind(code, userId, now)
    .first("created_by");
}

// ---------- categories ----------

export async function listCategories(db, me) {
  const { results } = await db
    .prepare("SELECT id, name FROM categories WHERE user_id = ?1 ORDER BY name_lc")
    .bind(me)
    .all();
  return results;
}

export function addCategory(db, me, name) {
  return db
    .prepare(
      `INSERT INTO categories (user_id, name, name_lc, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id, name_lc) DO NOTHING`
    )
    .bind(me, name, name.toLowerCase(), Date.now())
    .run();
}

export function deleteCategory(db, me, id) {
  return db.prepare("DELETE FROM categories WHERE id = ?1 AND user_id = ?2").bind(id, me).run();
}
