-- contracts/schema.sql — SQLite (better-sqlite3). Activer : PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name   TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  uploader_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  storage_path  TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  attached      INTEGER NOT NULL DEFAULT 0,   -- 0 = orphelin, 1 = rattaché
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_orphans ON files(attached, created_at);

CREATE TABLE IF NOT EXISTS conversations (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('direct','group')),
  title            TEXT,
  direct_key       TEXT UNIQUE,               -- "idMin:idMax" pour 'direct'
  created_at       TEXT NOT NULL,
  last_message_seq INTEGER
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  joined_at       TEXT NOT NULL,
  last_read_seq   INTEGER NOT NULL DEFAULT 0,
  muted           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,   -- ordre total serveur
  id              TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_msg_id   TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('text','image','file','system')),
  body            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  deleted_at      TEXT,
  UNIQUE (sender_id, client_msg_id)                    -- idempotence
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq DESC);

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, file_id)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TEXT,
  read_at      TEXT,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON message_receipts(user_id);

CREATE TABLE IF NOT EXISTS calls (
  id           TEXT PRIMARY KEY,
  caller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media        TEXT NOT NULL CHECK (media IN ('audio','video')),
  status       TEXT NOT NULL CHECK (status IN
                 ('completed','missed','rejected','cancelled','busy','failed')),
  started_at   TEXT NOT NULL,
  answered_at  TEXT,
  ended_at     TEXT,
  duration_sec INTEGER,
  end_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id, started_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
