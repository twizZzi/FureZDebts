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
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ---------- users ----------

export async function upsertUser(db, tgUser, { canNotify = false } = {}) {
  const now = Date.now();
  const username = tgUser.username || null;
  return db
    .prepare(
      `INSERT INTO users (id, username, username_lc, first_name, last_name, photo_url, can_notify, created_at, seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT (id) DO UPDATE SET
         username = excluded.username,
         username_lc = excluded.username_lc,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         photo_url = COALESCE(excluded.photo_url, users.photo_url),
         can_notify = MAX(users.can_notify, excluded.can_notify),
         seen_at = excluded.seen_at
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
      now
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
       WHERE u.username_lc LIKE ?2 ESCAPE '\\' AND u.id != ?1
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
       WHERE (creditor_id = ?1 OR debtor_id = ?1) AND deleted_at IS NULL
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
         AND deleted_at IS NULL
       GROUP BY currency`
    )
    .bind(me, other)
    .all();
  return results.filter((row) => row.amount !== 0);
}

// Everything the app shows on its main tabs, in one round trip.
export async function buildState(db, meRow, botUsername) {
  const me = meRow.id;
  const [{ results: rows }, balances] = await Promise.all([
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
    bot: botUsername || null,
  };
}

// ---------- entries ----------

export function insertEntry(db, { creditorId, debtorId, amount, currency, kind, note, createdBy }) {
  return db
    .prepare(
      `INSERT INTO entries (creditor_id, debtor_id, amount, currency, kind, note, created_by, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING *`
    )
    .bind(creditorId, debtorId, amount, currency, kind, note || null, createdBy, Date.now())
    .first();
}

export function getEntry(db, id) {
  return db.prepare("SELECT * FROM entries WHERE id = ?1 AND deleted_at IS NULL").bind(id).first();
}

export function softDeleteEntry(db, id, by) {
  return db
    .prepare("UPDATE entries SET deleted_at = ?2, deleted_by = ?3 WHERE id = ?1 AND deleted_at IS NULL")
    .bind(id, Date.now(), by)
    .run();
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

export async function feed(db, me, before) {
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
