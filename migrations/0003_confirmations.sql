-- A new entry waits for the other person: they confirm it (as a new debt or as an offset
-- against the existing one) or decline it. Only confirmed entries count in balances.
ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('pending', 'confirmed', 'declined'));
ALTER TABLE entries ADD COLUMN responded_at INTEGER;
-- What the debt was for, e.g. "Заправка". Free text picked from the author's list.
ALTER TABLE entries ADD COLUMN category TEXT;
-- How a return was paid: card | cash | purchase | other.
ALTER TABLE entries ADD COLUMN method TEXT;

-- Each user's own categories; built-in ones live in shared/labels.js.
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name_lc)
);
