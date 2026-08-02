import { db } from './db.js';
import { newId, now, avatarColorFor } from './util.js';

/* ============================= USERS ============================= */

const qUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const qUserByName = db.prepare('SELECT * FROM users WHERE username = ?');

export const getUserById = (id) => qUserById.get(id);
export const getUserByUsername = (username) => qUserByName.get(String(username));

export function createUser({ username, displayName, passwordHash, role = 'user' }) {
  const id = newId();
  db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, avatar_color, created_at, last_seen)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, username, displayName, passwordHash, role, avatarColorFor(id), now(), now());
  return getUserById(id);
}

export function updateUser(id, patch) {
  const allowed = [
    'display_name', 'password_hash', 'role', 'banned', 'ban_reason', 'banned_at',
    'muted_until', 'mute_reason', 'token_version',
    'totp_secret', 'totp_pending', 'backup_codes', 'avatar_file',
  ];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in patch) { sets.push(`${k} = ?`); vals.push(patch[k]); }
  }
  if (!sets.length) return getUserById(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getUserById(id);
}

export const touchLastSeen = (id, ts = now()) => db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(ts, id);

export function searchUsers(q, limit = 20, excludeId = null) {
  const like = `%${String(q || '').trim()}%`;
  return db.prepare(`SELECT * FROM users
                     WHERE banned = 0 AND (username LIKE ? OR display_name LIKE ?) ${excludeId ? 'AND id != ?' : ''}
                     ORDER BY username COLLATE NOCASE LIMIT ?`)
    .all(like, like, ...(excludeId ? [excludeId] : []), limit);
}

export function listUsers({ q = '', limit = 300, offset = 0 } = {}) {
  const like = `%${q}%`;
  return db.prepare(`SELECT * FROM users
                     WHERE username LIKE ? OR display_name LIKE ?
                     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
                              username COLLATE NOCASE
                     LIMIT ? OFFSET ?`).all(like, like, limit, offset);
}

/* ---- JSON views ---- */

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    avatarColor: u.avatar_color,
    avatarUrl: u.avatar_file ? `/api/avatars/${u.id}` : null,
    lastSeen: u.last_seen,
    createdAt: u.created_at,
  };
}

export function selfUser(u) {
  let codesLeft = 0;
  try { codesLeft = JSON.parse(u.backup_codes || '[]').length; } catch { codesLeft = 0; }
  return {
    ...publicUser(u),
    createdAt: u.created_at,
    mutedUntil: u.muted_until,
    muteReason: u.mute_reason,
    totpEnabled: Boolean(u.totp_secret),
    backupCodesLeft: u.totp_secret ? codesLeft : 0,
  };
}

export function adminUser(u) {
  return {
    ...selfUser(u),
    banned: Boolean(u.banned),
    banReason: u.ban_reason,
    bannedAt: u.banned_at,
  };
}

/* ============================= CHATS ============================= */

export const getChat = (id) => db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
export const getDmByKey = (key) => db.prepare('SELECT * FROM chats WHERE dm_key = ?').get(key);

export const isMember = (chatId, userId) =>
  Boolean(db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId));

export function getMembers(chatId) {
  return db.prepare(`SELECT u.*, cm.last_read AS last_read, cm.joined_at AS joined_at
                     FROM chat_members cm JOIN users u ON u.id = cm.user_id
                     WHERE cm.chat_id = ?
                     ORDER BY u.username COLLATE NOCASE`).all(chatId);
}

export function createChat({ type, name = '', dmKey = null, createdBy, memberIds }) {
  const id = newId();
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO chats (id, type, name, dm_key, created_by, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, type, name, dmKey, createdBy, ts);
    const ins = db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, joined_at) VALUES (?,?,?)');
    for (const uid of new Set(memberIds)) ins.run(id, uid, ts);
  });
  tx();
  return getChat(id);
}

export function addMembers(chatId, userIds) {
  const ts = now();
  const ins = db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, joined_at) VALUES (?,?,?)');
  const added = [];
  const tx = db.transaction(() => {
    for (const uid of userIds) {
      if (ins.run(chatId, uid, ts).changes > 0) added.push(uid);
    }
  });
  tx();
  return added;
}

export function removeMember(chatId, userId) {
  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
  const remaining = db.prepare('SELECT COUNT(*) AS c FROM chat_members WHERE chat_id = ?').get(chatId).c;
  if (remaining === 0) db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
  return remaining;
}

export const renameChat = (chatId, name) => db.prepare('UPDATE chats SET name = ? WHERE id = ?').run(name, chatId);

const MESSAGE_VIEW = `
  SELECT m.id, m.chat_id AS chatId, m.content, m.created_at AS createdAt, m.edited_at AS editedAt,
         m.reply_to AS replyToId, m.fwd_from AS fwdFrom, m.system AS systemFlag,
         m.enc, m.kid, m.iv, m.sig,
         r2.enc AS r_enc,
         u.id AS a_id, u.username AS a_username, u.display_name AS a_displayName,
         u.role AS a_role, u.avatar_color AS a_avatarColor, u.avatar_file AS a_avatarFile,
         f.id AS f_id, f.original_name AS f_name, f.mime AS f_mime, f.size AS f_size,
         f.kind AS f_kind, f.duration AS f_duration, f.enc AS f_enc, f.fiv AS f_fiv,
         r2.deleted AS r_deleted, substr(COALESCE(r2.content, ''), 1, 90) AS r_snippet,
         ru.display_name AS r_authorName,
         (SELECT COUNT(*) FROM files rf WHERE rf.message_id = r2.id) AS r_hasFile
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN files f ON f.message_id = m.id
  LEFT JOIN messages r2 ON r2.id = m.reply_to
  LEFT JOIN users ru ON ru.id = r2.user_id`;

function mapMessageRow(r, reactions = undefined) {
  return {
    id: r.id,
    chatId: r.chatId,
    content: r.content,
    createdAt: r.createdAt,
    editedAt: r.editedAt ?? null,
    system: Boolean(r.systemFlag ?? 0),
    fwdFrom: r.fwdFrom ?? null,
    enc: Boolean(r.enc ?? 0),
    kid: r.kid ?? null,
    iv: r.iv ?? null,
    sig: r.sig ?? null,
    replyTo: r.replyToId
      ? (r.r_deleted
        ? { id: r.replyToId, deleted: true }
        : { id: r.replyToId, authorName: r.r_authorName || 'Unknown', snippet: r.r_snippet || '', hasFile: Boolean(r.r_hasFile), enc: Boolean(r.r_enc ?? 0) })
      : null,
    file: r.f_id ? { id: r.f_id, name: r.f_name, mime: r.f_mime, size: r.f_size, kind: r.f_kind || 'file', duration: r.f_duration || 0, enc: Boolean(r.f_enc ?? 0), fiv: r.f_fiv ?? null } : null,
    reactions: reactions ?? [],
    author: {
      id: r.a_id,
      username: r.a_username,
      displayName: r.a_displayName,
      role: r.a_role,
      avatarColor: r.a_avatarColor,
      avatarUrl: r.a_avatarFile ? `/api/avatars/${r.a_id}` : null,
    },
  };
}

export function createMessage({ chatId, userId, content, replyTo = null, fwdFrom = null, system = false, enc = null }) {
  const res = db.prepare(`INSERT INTO messages (chat_id, user_id, content, created_at, reply_to, fwd_from, system, enc, kid, iv, sig)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(chatId, userId, content, now(), replyTo, fwdFrom, system ? 1 : 0,
      enc ? 1 : 0, enc?.kid ?? null, enc?.iv ?? null, enc?.sig ?? null);
  return getMessage(res.lastInsertRowid);
}

export const maxMessageId = (chatId) =>
  db.prepare('SELECT COALESCE(MAX(id), 0) AS c FROM messages WHERE chat_id = ?').get(chatId).c;

/** Most-recent-first content search inside one chat (parameterized LIKE). */
export function searchMessages(chatId, q, limit = 50) {
  const like = `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return db.prepare(`SELECT m.id, m.content, m.created_at AS createdAt, m.chat_id AS chatId,
                            m.user_id AS authorId, u.display_name AS authorName,
                            EXISTS(SELECT 1 FROM files f WHERE f.message_id = m.id) AS hasFile
                     FROM messages m JOIN users u ON u.id = m.user_id
                     WHERE m.chat_id = ? AND m.deleted = 0 AND m.system = 0 AND m.enc = 0
                       AND m.content LIKE ? ESCAPE '\\'
                     ORDER BY m.id DESC LIMIT ?`).all(chatId, like, limit);
}

export function getMessage(id, viewerId = null) {
  const r = db.prepare(`${MESSAGE_VIEW} WHERE m.id = ? AND m.deleted = 0`).get(id);
  if (!r) return null;
  const msg = mapMessageRow(r, viewerId ? reactionSummary(id, viewerId) : []);
  if (hasPoll(id)) msg.poll = getPoll(id, viewerId);
  return msg;
}

export function listMessages(chatId, { before = Infinity, limit = 40, viewerId = null } = {}) {
  const rows = db.prepare(`${MESSAGE_VIEW}
    WHERE m.chat_id = ? AND m.deleted = 0 AND m.id < ?
    ORDER BY m.id DESC LIMIT ?`).all(chatId, before, limit + 1);
  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit).reverse();
  const rmap = viewerId ? reactionsMap(slice.map((r) => r.id), viewerId) : new Map();
  const pollIds = pollsInMessages(slice.map((r) => r.id));
  return {
    messages: slice.map((r) => {
      const m = mapMessageRow(r, rmap.get(r.id) ?? []);
      if (pollIds.has(m.id)) m.poll = getPoll(m.id, viewerId);
      return m;
    }),
    hasMore,
  };
}

export const getMessageRaw = (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id);

/* ----------------------------- reactions ----------------------------- */

export function toggleReaction(messageId, userId, emoji) {
  const exists = db.prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(messageId, userId, emoji);
  if (exists) {
    db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(messageId, userId, emoji);
    return 'removed';
  }
  db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)')
    .run(messageId, userId, emoji, now());
  return 'added';
}

export const userReactionCount = (messageId, userId) =>
  db.prepare('SELECT COUNT(*) AS c FROM message_reactions WHERE message_id = ? AND user_id = ?').get(messageId, userId).c;

export const distinctReactionEmojis = (messageId) =>
  db.prepare('SELECT COUNT(DISTINCT emoji) AS c FROM message_reactions WHERE message_id = ?').get(messageId).c;

/** [{emoji, count, me}] for one message from a viewer's perspective. */
export function reactionSummary(messageId, viewerId = null) {
  return db.prepare(`SELECT emoji, COUNT(*) AS count, ${viewerId ? 'SUM(user_id = ?)' : 'NULL'} AS me
                     FROM message_reactions WHERE message_id = ?
                     GROUP BY emoji ORDER BY MIN(created_at)`)
    .all(...(viewerId ? [viewerId, messageId] : [messageId]))
    .map((r) => ({ emoji: r.emoji, count: r.count, me: Boolean(r.me) }));
}

export function reactionsMap(messageIds, viewerId) {
  const map = new Map();
  if (!messageIds.length) return map;
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT message_id, emoji, COUNT(*) AS count, SUM(user_id = ?) AS me
                           FROM message_reactions WHERE message_id IN (${placeholders})
                           GROUP BY message_id, emoji ORDER BY MIN(created_at)`)
    .all(viewerId, ...messageIds);
  for (const r of rows) {
    if (!map.has(r.message_id)) map.set(r.message_id, []);
    map.get(r.message_id).push({ emoji: r.emoji, count: r.count, me: Boolean(r.me) });
  }
  return map;
}

/* ------------------------------ pinning ------------------------------ */

export function setPinnedMessage(chatId, messageId) {
  if (messageId === null) {
    db.prepare('UPDATE chats SET pinned_message = NULL WHERE id = ?').run(chatId);
  } else {
    db.prepare('UPDATE chats SET pinned_message = ? WHERE id = ?').run(messageId, chatId);
  }
}

export const editMessage = (id, content, enc = null) =>
  db.prepare('UPDATE messages SET content = ?, edited_at = ?, iv = ?, sig = ? WHERE id = ?')
    .run(content, now(), enc?.iv ?? null, enc?.sig ?? null, id);

export const softDeleteMessage = (id, byMod) =>
  db.prepare('UPDATE messages SET deleted = 1, deleted_by_mod = ? WHERE id = ?').run(byMod ? 1 : 0, id);

export function setLastRead(chatId, userId, messageId) {
  db.prepare('UPDATE chat_members SET last_read = MAX(last_read, ?), unread_mentions = 0 WHERE chat_id = ? AND user_id = ?')
    .run(messageId, chatId, userId);
}

/** Increment the unread-@mention counter for the given members of a chat. */
export function bumpUnreadMentions(chatId, userIds) {
  if (!userIds.length) return;
  const stmt = db.prepare('UPDATE chat_members SET unread_mentions = unread_mentions + 1 WHERE chat_id = ? AND user_id = ?');
  for (const id of userIds) stmt.run(chatId, id);
}

/** Full chat payloads (per-user: unread differs) for every member of a chat. */
export function chatPayloadFor(chatId, userId) {
  const c = getChat(chatId);
  if (!c) return null;
  const cm = db.prepare('SELECT last_read, unread_mentions FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  if (!cm) return null;
  const unread = db.prepare(`SELECT COUNT(*) AS c FROM messages
                             WHERE chat_id = ? AND deleted = 0 AND id > ? AND user_id != ?`)
    .get(chatId, cm.last_read, userId).c;
  const lm = db.prepare(`${MESSAGE_VIEW}
    WHERE m.chat_id = ? AND m.deleted = 0 AND m.id = (SELECT MAX(id) FROM messages WHERE chat_id = ? AND deleted = 0)`)
    .get(chatId, chatId);
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    createdBy: c.created_by,
    createdAt: c.created_at,
    unread,
    unreadMentions: cm.unread_mentions,
    e2ee: Boolean(db.prepare('SELECT 1 FROM chat_keys WHERE chat_id = ? LIMIT 1').get(chatId)),
    prefs: getChatPrefs(userId, chatId),
    myLastRead: cm.last_read,
    lastMessage: lm ? mapMessageRow(lm) : null,
    pinnedMessage: c.pinned_message ? getMessage(c.pinned_message, userId) : null,
    members: getMembers(chatId).map((m) => ({ ...publicUser(m), lastRead: m.last_read })),
  };
}

export function listChatsForUser(userId) {
  const rows = db.prepare(`SELECT c.id FROM chats c
                           JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
                           ORDER BY COALESCE((SELECT MAX(created_at) FROM messages WHERE chat_id = c.id AND deleted = 0), c.created_at) DESC`)
    .all(userId);
  return rows.map((r) => chatPayloadFor(r.id, userId)).filter(Boolean);
}

/* ============================= REPORTS ============================= */

export function createReport({ messageId, reporterId, reason }) {
  const res = db.prepare('INSERT INTO reports (message_id, reporter_id, reason, created_at) VALUES (?,?,?,?)')
    .run(messageId, reporterId, reason, now());
  return res.lastInsertRowid;
}

export function listReports(limit = 100) {
  return db.prepare(`
    SELECT r.id, r.reason, r.status, r.created_at AS createdAt,
           m.id AS msg_id, m.chat_id AS msg_chatId, m.content AS msg_content, m.created_at AS msg_createdAt, m.deleted AS msg_deleted,
           au.id AS a_id, au.username AS a_username, au.display_name AS a_displayName,
           ru.id AS r_id, ru.username AS r_username, ru.display_name AS r_displayName
    FROM reports r
    JOIN messages m ON m.id = r.message_id
    JOIN users au ON au.id = m.user_id
    JOIN users ru ON ru.id = r.reporter_id
    WHERE r.status = 'open'
    ORDER BY r.id DESC LIMIT ?`).all(limit)
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      message: {
        id: r.msg_id, chatId: r.msg_chatId, content: r.msg_content,
        createdAt: r.msg_createdAt, deleted: Boolean(r.msg_deleted),
      },
      author: { id: r.a_id, username: r.a_username, displayName: r.a_displayName },
      reporter: { id: r.r_id, username: r.r_username, displayName: r.r_displayName },
    }));
}

export const getReport = (id) =>
  db.prepare(`SELECT r.*, m.user_id AS author_id, m.chat_id FROM reports r JOIN messages m ON m.id = r.message_id WHERE r.id = ?`).get(id);

export const resolveReport = (id, resolverId) =>
  db.prepare(`UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = ? WHERE id = ?`).run(resolverId, now(), id);

/* ============================= FILES ============================= */

export function createFile({ messageId, chatId, storedName, originalName, mime, size, uploadedBy, kind = 'file', duration = 0, enc = false, fiv = null }) {
  const id = newId();
  db.prepare(`INSERT INTO files (id, message_id, chat_id, stored_name, original_name, mime, size, uploaded_by, kind, duration, enc, fiv, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, messageId, chatId, storedName, originalName, mime, size, uploadedBy, kind, duration, enc ? 1 : 0, fiv, now());
  return id;
}

export const getFile = (id) => db.prepare('SELECT * FROM files WHERE id = ?').get(String(id));

/* ============================= AUDIT ============================= */

export function audit(actorId, action, targetId = '', meta = {}) {
  db.prepare('INSERT INTO audit_log (actor_id, action, target_id, meta, created_at) VALUES (?,?,?,?,?)')
    .run(actorId, action, targetId, JSON.stringify(meta), now());
}

export function listAudit(limit = 100) {
  return db.prepare(`
    SELECT a.id, a.action, a.meta, a.created_at AS createdAt,
           au.username AS actor_username, au.display_name AS actor_displayName,
           tu.username AS target_username, tu.display_name AS target_displayName
    FROM audit_log a
    LEFT JOIN users au ON au.id = a.actor_id
    LEFT JOIN users tu ON tu.id = a.target_id
    ORDER BY a.id DESC LIMIT ?`).all(limit)
    .map((r) => ({
      id: r.id,
      action: r.action,
      meta: safeJson(r.meta),
      createdAt: r.createdAt,
      actor: r.actor_username ? { username: r.actor_username, displayName: r.actor_displayName } : null,
      target: r.target_username ? { username: r.target_username, displayName: r.target_displayName } : null,
    }));
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

/* ============================= STATS ============================= */

export function stats() {
  const g = (sql) => db.prepare(sql).get().c;
  return {
    users: g('SELECT COUNT(*) AS c FROM users'),
    chats: g('SELECT COUNT(*) AS c FROM chats'),
    messages: g('SELECT COUNT(*) AS c FROM messages WHERE deleted = 0'),
    banned: g('SELECT COUNT(*) AS c FROM users WHERE banned = 1'),
    openReports: g(`SELECT COUNT(*) AS c FROM reports WHERE status = 'open'`),
    online: 0, // filled by hub at runtime
  };
}

/* ===================== PER-USER CHAT PREFS (v1.4) ===================== */

export function getChatPrefs(userId, chatId) {
  const r = db.prepare('SELECT pinned, archived, muted FROM chat_prefs WHERE user_id = ? AND chat_id = ?').get(userId, chatId);
  return { pinned: Boolean(r?.pinned), archived: Boolean(r?.archived), muted: Boolean(r?.muted) };
}

/** Upsert a subset of {pinned, archived, muted}; returns the full prefs row. */
export function setChatPrefs(userId, chatId, patch) {
  db.prepare('INSERT OR IGNORE INTO chat_prefs (user_id, chat_id) VALUES (?, ?)').run(userId, chatId);
  const sets = [];
  const vals = [];
  for (const k of ['pinned', 'archived', 'muted']) {
    if (patch[k] !== undefined) { sets.push(`${k} = ?`); vals.push(patch[k] ? 1 : 0); }
  }
  if (sets.length) {
    db.prepare(`UPDATE chat_prefs SET ${sets.join(', ')} WHERE user_id = ? AND chat_id = ?`)
      .run(...vals, userId, chatId);
  }
  return getChatPrefs(userId, chatId);
}

/* ============================= POLLS (v1.4) ============================= */

const hasPoll = (messageId) => Boolean(db.prepare('SELECT 1 FROM polls WHERE message_id = ?').get(messageId));

function pollsInMessages(ids) {
  if (!ids.length) return new Set();
  return new Set(db.prepare(`SELECT message_id FROM polls WHERE message_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids).map((r) => r.message_id));
}

export function createPoll(messageId, question, options) {
  db.prepare('INSERT INTO polls (message_id, question) VALUES (?, ?)').run(messageId, question);
  const ins = db.prepare('INSERT INTO poll_options (poll_id, idx, text) VALUES (?, ?, ?)');
  options.forEach((text, idx) => ins.run(messageId, idx, text));
  return getPoll(messageId, null);
}

/** Full poll payload for a viewer: options with vote counts, my vote, total voters. */
export function getPoll(messageId, viewerId = null) {
  const p = db.prepare('SELECT question FROM polls WHERE message_id = ?').get(messageId);
  if (!p) return null;
  const options = db.prepare(`SELECT o.id, o.text,
        (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes
      FROM poll_options o WHERE o.poll_id = ? ORDER BY o.idx`).all(messageId);
  const my = viewerId
    ? db.prepare('SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(messageId, viewerId)
    : null;
  const totalVoters = db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM poll_votes WHERE poll_id = ?').get(messageId).c;
  return { question: p.question, options, myVote: my?.option_id ?? null, totalVoters };
}

export const getPollOption = (pollId, optionId) =>
  db.prepare('SELECT id FROM poll_options WHERE poll_id = ? AND id = ?').get(pollId, optionId);

/** Cast/change (optionId) or retract (optionId = null) a vote. Single-choice. */
export function votePoll(pollId, userId, optionId) {
  db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
  if (optionId !== null && optionId !== undefined) {
    db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?,?,?,?)')
      .run(pollId, userId, optionId, now());
  }
}

/* ========================== INVITE LINKS (v1.4) ========================== */

export function createInviteRow({ token, chatId, createdBy }) {
  db.prepare('INSERT INTO invites (token, chat_id, created_by, created_at) VALUES (?,?,?,?)')
    .run(token, chatId, createdBy, now());
}

export const getInvite = (token) => db.prepare('SELECT * FROM invites WHERE token = ?').get(String(token ?? ''));
export const getInviteForChat = (chatId) =>
  db.prepare('SELECT * FROM invites WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1').get(chatId);
export const deleteInvitesForChat = (chatId) => db.prepare('DELETE FROM invites WHERE chat_id = ?').run(chatId);

/* ===================== GLOBAL MESSAGE SEARCH (v1.4) ===================== */

/** Most-recent-first content search across every chat the user is a member of. */
export function searchMessagesGlobal(userId, q, limit = 30) {
  const like = `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return db.prepare(`SELECT m.id, m.content, m.created_at AS createdAt, m.chat_id AS chatId,
                            m.user_id AS authorId, u.display_name AS authorName
                     FROM messages m
                     JOIN users u ON u.id = m.user_id
                     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
                     WHERE m.deleted = 0 AND m.system = 0 AND m.content != '' AND m.enc = 0
                       AND m.content LIKE ? ESCAPE '\\'
                     ORDER BY m.id DESC LIMIT ?`).all(userId, like, limit);
}

/** First unread message that @-mentions the user (for the jump-to-mention button). */
export function firstUnreadMentionId(chatId, userId, lastRead, username) {
  const like = `%@${String(username).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const r = db.prepare(`SELECT id, content FROM messages
                        WHERE chat_id = ? AND deleted = 0 AND system = 0 AND enc = 0 AND id > ? AND user_id != ?
                          AND content LIKE ? ESCAPE '\\'
                        ORDER BY id ASC LIMIT 50`).all(chatId, lastRead, userId, like)
    .find((m) => new RegExp(`@${username}(?![A-Za-z0-9_])`, 'i').test(m.content));
  return r?.id ?? null;
}

/* ======================= BOOTSTRAP OWNER SYNC ======================= */

export function bumpAllTokenVersions() {
  db.prepare('UPDATE users SET token_version = token_version + 1').run();
}

/* ======================= E2EE: identity & chat keys (v1.5) ======================= */

/** Create or replace a user's public identity bundle. */
export function setIdentityKey(userId, { dhPub, sigPub, dhHash }) {
  db.prepare(`INSERT INTO user_e2ee (user_id, dh_pub, sig_pub, dh_hash, updated_at)
              VALUES (?,?,?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET dh_pub=excluded.dh_pub, sig_pub=excluded.sig_pub,
                dh_hash=excluded.dh_hash, updated_at=excluded.updated_at`)
    .run(userId, dhPub, sigPub, dhHash, now());
}

export const getIdentityKey = (userId) => {
  const r = db.prepare('SELECT dh_pub AS dhPub, sig_pub AS sigPub, dh_hash AS dhHash, updated_at AS updatedAt FROM user_e2ee WHERE user_id = ?').get(userId);
  return r || null;
};

/** userIds -> { [userId]: {dhPub, sigPub, dhHash} } (missing users simply absent). */
export function getIdentityKeys(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT user_id AS user, dh_pub AS dhPub, sig_pub AS sigPub, dh_hash AS dhHash
                           FROM user_e2ee WHERE user_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return Object.fromEntries(rows.map((r) => [r.user, { dhPub: r.dhPub, sigPub: r.sigPub, dhHash: r.dhHash }]));
}

/** Nuclear identity reset: drop the identity row and every wrapped key aimed at me. */
export function resetIdentityKey(userId) {
  db.prepare('DELETE FROM user_e2ee WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM chat_keys WHERE user_id = ?').run(userId);
}

export const currentKeyEpoch = (chatId) =>
  db.prepare('SELECT COALESCE(MAX(epoch), 0) AS e FROM chat_keys WHERE chat_id = ?').get(chatId).e;

export const chatIsE2ee = (chatId) => currentKeyEpoch(chatId) > 0;

/** Insert a whole epoch: one wrapped copy per target user. */
export function putChatKeyEpoch(chatId, epoch, wrappedBy, byDhHash, wraps) {
  const ins = db.prepare(`INSERT INTO chat_keys (chat_id, epoch, user_id, wrapped, wiv, wrapped_by, by_dh_hash, created_at)
                          VALUES (?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const w of wraps) ins.run(chatId, epoch, w.user, w.wrapped, w.wiv, wrappedBy, byDhHash, now());
  });
  tx();
}

/** Everything a member needs to unlock a chat: my wrapped copies + each member's current identity hash. */
export function chatKeyState(chatId, userId) {
  const keys = db.prepare(`SELECT epoch, wrapped, wiv, wrapped_by AS wrappedBy, by_dh_hash AS byDhHash
                           FROM chat_keys WHERE chat_id = ? AND user_id = ? ORDER BY epoch`).all(chatId, userId);
  const members = getMembers(chatId).map((m) => {
    const idk = getIdentityKey(m.id);
    return { user: m.id, dhHash: idk?.dhHash ?? null };
  });
  return { e2ee: chatIsE2ee(chatId), currentEpoch: currentKeyEpoch(chatId), keys, members };
}

export const hasWrapForEpoch = (chatId, epoch, userId) =>
  Boolean(db.prepare('SELECT 1 FROM chat_keys WHERE chat_id = ? AND epoch = ? AND user_id = ?').get(chatId, epoch, userId));

/* ------------------------- device-to-device transfers ------------------------- */

const TRANSFER_TTL_MS = 10 * 60 * 1000;

export function createTransfer(userId, ephPub) {
  // one pending request per account at a time
  db.prepare("DELETE FROM key_transfers WHERE user_id = ? AND status = 'pending'").run(userId);
  const id = newId();
  const t = now();
  db.prepare('INSERT INTO key_transfers (id, user_id, eph_pub, status, created_at, expires_at) VALUES (?,?,?,?,?,?)')
    .run(id, userId, ephPub, 'pending', t, t + TRANSFER_TTL_MS);
  return getTransfer(id);
}

export const getTransfer = (id) => {
  const r = db.prepare(`SELECT id, user_id AS userId, eph_pub AS ephPub, payload, piv, status,
                               created_at AS createdAt, expires_at AS expiresAt
                        FROM key_transfers WHERE id = ?`).get(String(id));
  if (r && r.status === 'pending' && r.expiresAt < now()) {
    db.prepare('DELETE FROM key_transfers WHERE id = ?').run(r.id);
    return null;
  }
  return r || null;
};

export const pendingTransfersFor = (userId) =>
  db.prepare(`SELECT id, eph_pub AS ephPub, created_at AS createdAt, expires_at AS expiresAt
              FROM key_transfers WHERE user_id = ? AND status = 'pending' AND expires_at > ?
              ORDER BY created_at DESC`).all(userId, now());

export function answerTransfer(id, payload, piv) {
  db.prepare("UPDATE key_transfers SET payload = ?, piv = ?, status = 'answered' WHERE id = ?").run(payload, piv, id);
}

export function declineTransfer(id) {
  db.prepare("UPDATE key_transfers SET status = 'declined' WHERE id = ?").run(id);
}

export const deleteTransfer = (id) => db.prepare('DELETE FROM key_transfers WHERE id = ?').run(id);
