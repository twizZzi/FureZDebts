-- Invite-only access: a user gets in through a one-time invite from an existing member.
ALTER TABLE users ADD COLUMN approved_at INTEGER;
ALTER TABLE users ADD COLUMN invited_by INTEGER;

-- Everyone who joined before invites keeps access.
UPDATE users SET approved_at = created_at;

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by INTEGER,
  used_at INTEGER
);

CREATE INDEX invites_created_by ON invites (created_by);
