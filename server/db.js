import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CONFIG_PATH } from './config.js';

// The database lives next to config.json so an instance is fully self-contained.
export const DATA_DIR = process.env.EFADRO_DATA
  ? path.resolve(process.env.EFADRO_DATA)
  : path.join(path.dirname(CONFIG_PATH), 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'efadro.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner','admin','moderator','user')),
  avatar_color  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  ban_reason    TEXT NOT NULL DEFAULT '',
  banned_at     INTEGER NOT NULL DEFAULT 0,
  muted_until   INTEGER NOT NULL DEFAULT 0,
  mute_reason   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS chats (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('dm','group')),
  name       TEXT NOT NULL DEFAULT '',
  dm_key     TEXT UNIQUE,              -- ensures one DM per user pair (or self-chat)
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id   TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  last_read INTEGER NOT NULL DEFAULT 0, -- id of last message read by this member
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id        TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id),
  content        TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  edited_at      INTEGER,
  deleted        INTEGER NOT NULL DEFAULT 0,
  deleted_by_mod INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  target_id  TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(id DESC);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  message_id    INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  stored_name   TEXT NOT NULL,   -- random name on disk in data/uploads
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  uploaded_by   TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_chat ON files(chat_id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id);
`);

/* Lightweight migrations for databases created before a column existed. */
function ensureColumn(table, ddl, colName) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === colName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`[efadro] migrated: added ${table}.${colName}`);
  }
}
ensureColumn('users', 'totp_secret TEXT', 'totp_secret');
ensureColumn('users', 'totp_pending TEXT', 'totp_pending');
ensureColumn('users', "backup_codes TEXT NOT NULL DEFAULT '[]'", 'backup_codes');
ensureColumn('users', 'avatar_file TEXT', 'avatar_file');
ensureColumn('messages', 'reply_to INTEGER', 'reply_to');
ensureColumn('messages', 'fwd_from TEXT', 'fwd_from');
ensureColumn('chats', 'pinned_message INTEGER', 'pinned_message');
ensureColumn('files', "kind TEXT NOT NULL DEFAULT 'file'", 'kind');
ensureColumn('files', 'duration INTEGER NOT NULL DEFAULT 0', 'duration');
ensureColumn('messages', 'system INTEGER NOT NULL DEFAULT 0', 'system');
ensureColumn('chat_members', 'unread_mentions INTEGER NOT NULL DEFAULT 0', 'unread_mentions');

/* v1.4.0: per-user chat preferences, polls and group invite links */
db.exec(`
CREATE TABLE IF NOT EXISTS chat_prefs (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, chat_id)
);
CREATE TABLE IF NOT EXISTS polls (
  message_id INTEGER PRIMARY KEY,
  question TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_chat ON invites(chat_id);
`);

/* v1.5.0: end-to-end encryption — identity keys, wrapped chat keys, transfers */
ensureColumn('messages', 'enc INTEGER NOT NULL DEFAULT 0', 'enc');
ensureColumn('messages', 'kid INTEGER', 'kid'); // chat-key epoch used for ciphertext
ensureColumn('messages', 'iv TEXT', 'iv');
ensureColumn('messages', 'sig TEXT', 'sig');
ensureColumn('files', 'enc INTEGER NOT NULL DEFAULT 0', 'enc');
ensureColumn('files', 'fiv TEXT', 'fiv');
db.exec(`
-- One E2EE identity per user (ECDH + ECDSA public keys; secrets never leave clients)
CREATE TABLE IF NOT EXISTS user_e2ee (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dh_pub     TEXT NOT NULL,   -- EC P-256 SPKI, base64
  sig_pub    TEXT NOT NULL,   -- EC P-256 SPKI, base64
  dh_hash    TEXT NOT NULL,   -- sha256 hex of the SPKI bytes (fingerprint)
  updated_at INTEGER NOT NULL
);
-- Per-recipient wrapped copies of each chat key epoch (ECDH+HKDF wrapped, opaque to server)
CREATE TABLE IF NOT EXISTS chat_keys (
  chat_id    TEXT NOT NULL,
  epoch      INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  wrapped    TEXT NOT NULL,   -- base64 AES-GCM wrapped raw chat key
  wiv        TEXT NOT NULL,   -- base64 wrap IV
  wrapped_by TEXT NOT NULL,   -- member who created this epoch (their ECDH was used)
  by_dh_hash TEXT NOT NULL,   -- dh_hash of the wrapper at creation time
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, epoch, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_keys_chat ON chat_keys(chat_id);
-- Pending device-to-device key transfers (payload is client-wrapped, opaque to server)
CREATE TABLE IF NOT EXISTS key_transfers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eph_pub    TEXT NOT NULL,   -- ephemeral ECDH public key of the new device
  payload    TEXT,            -- wrapped key bundle (set when an old device approves)
  piv        TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | answered | declined
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_key_transfers_user ON key_transfers(user_id, status);
`);
