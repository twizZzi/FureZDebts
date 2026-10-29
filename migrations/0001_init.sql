-- Users are Telegram accounts; id is the Telegram user id.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  username_lc TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT,
  photo_url TEXT,
  default_currency TEXT NOT NULL DEFAULT 'RUB',
  can_notify INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE INDEX users_username_lc ON users (username_lc);

-- One row per pair, user_a < user_b. A pending row is a friend request from requested_by.
CREATE TABLE friendships (
  user_a INTEGER NOT NULL REFERENCES users (id),
  user_b INTEGER NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  requested_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX friendships_user_b ON friendships (user_b);

-- creditor gave value to debtor: lent money (kind = 'debt') or paid a debt back (kind = 'payment').
-- Balance between two people = what I gave minus what they gave, per currency.
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creditor_id INTEGER NOT NULL REFERENCES users (id),
  debtor_id INTEGER NOT NULL REFERENCES users (id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('debt', 'payment')),
  note TEXT,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by INTEGER
);

CREATE INDEX entries_creditor ON entries (creditor_id, debtor_id);
CREATE INDEX entries_debtor ON entries (debtor_id);
