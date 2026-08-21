import { randomBytes, createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import * as store from './store.js';
import { HttpError, vStr, now, roleLevel } from './util.js';

/**
 * Chat/message business logic shared between REST endpoints and the WebSocket
 * hub, including the real-time fan-out so both transports behave identically.
 */

function checkCanPost(user, chatId) {
  const chat = store.getChat(chatId);
  if (!chat) throw new HttpError(404, 'Chat not found');
  if (!store.isMember(chatId, user.id)) throw new HttpError(403, 'You are not a member of this chat');
  if (user.muted_until > now()) {
    throw new HttpError(403, `You are muted until ${new Date(user.muted_until).toISOString()}`, {
      code: 'muted', mutedUntil: user.muted_until, reason: user.mute_reason,
    });
  }
  let silentFor = null;
  if (chat.type === 'dm') {
    const peer = store.getMembers(chatId).find((m) => m.id !== user.id);
    if (peer) {
      if (store.isBlocked(user.id, peer.id)) {
        // the blocker knows they blocked — a clear error is helpful (and private)
        throw new HttpError(403, 'You blocked this user — unblock them to chat', { code: 'blocked' });
      }
      if (store.isBlocked(peer.id, user.id)) {
        // stealth blocking: the sender must NOT be able to tell. Accept the
        // message as a ghost — stored for their eyes only, never fanned out.
        silentFor = [peer.id];
      }
    }
  }
  return { chat, silentFor };
}

/** Insert a centered system message (group events: renames, member changes…). */
export function postSystemMessage(chatId, actorId, content, { dropped = false } = {}) {
  return store.createMessage({
    chatId, userId: actorId,
    content: vStr(String(content ?? ''), { label: 'System message', min: 1, max: 300 }),
    system: true, dropped,
  });
}

/** Search a chat's history (members only). */
export function searchMessagesInChat(user, chatId, qRaw) {
  if (!store.isMember(chatId, user.id)) throw new HttpError(404, 'Chat not found');
  const q = String(qRaw ?? '').trim();
  if (q.length < 1 || q.length > 200) throw new HttpError(400, 'Search query must be 1–200 characters');
  return store.searchMessages(chatId, q, 50);
}

/** Global search across every chat the user belongs to (most recent first). */
export function globalMessageSearch(user, qRaw) {
  const q = String(qRaw ?? '').trim();
  if (q.length < 2 || q.length > 200) throw new HttpError(400, 'Global search needs at least 2 characters');
  return store.searchMessagesGlobal(user.id, q, 30);
}

/** Message id of the first unread @mention of the user in a chat (for the jump button). */
export function mentionJumpTarget(user, chatId) {
  const payload = store.chatPayloadFor(chatId, user.id);
  if (!payload) throw new HttpError(404, 'Chat not found');
  return store.firstUnreadMentionId(chatId, user.id, payload.myLastRead ?? 0, user.username);
}

/* ---------------------- per-user chat prefs (v1.4) ---------------------- */

/** Pin / archive / mute a chat for the current user only. */
export function updateChatPrefs(user, chatId, patch) {
  if (!store.getChat(chatId) || !store.isMember(chatId, user.id)) throw new HttpError(404, 'Chat not found');
  return store.setChatPrefs(user.id, chatId, patch);
}

/* ------------------------------ blocking (v1.7) ------------------------------ */

/** Block a user: they can no longer DM or call you (either direction is cut off). */
export function blockUserAs(user, targetId, hub) {
  if (targetId === user.id) throw new HttpError(400, 'You cannot block yourself');
  const target = store.getUserById(targetId);
  if (!target) throw new HttpError(404, 'User not found');
  store.blockUser(user.id, targetId);
  // the blocker's own view of the DM changes (composer banner) — push a fresh payload
  if (hub) {
    const key = [user.id, targetId].sort().join(':');
    const chat = store.getDmByKey(key);
    if (chat) emitChatToMembers(hub, chat.id, { onlyUserIds: [user.id] });
  }
  return { ok: true };
}

/** Undo a block; DMs flow again immediately. */
export function unblockUserAs(user, targetId, hub) {
  const target = store.getUserById(targetId);
  if (!target) throw new HttpError(404, 'User not found');
  store.unblockUser(user.id, targetId);
  if (hub) {
    const key = [user.id, targetId].sort().join(':');
    const chat = store.getDmByKey(key);
    if (chat) emitChatToMembers(hub, chat.id, { onlyUserIds: [user.id] });
  }
  return { ok: true };
}

/** Everyone the user has blocked (Settings → Privacy). */
export function listBlockedUsersAs(user) {
  return store.listBlockedUsers(user.id).map((u) => ({
    ...store.publicUser(u),
    blockedAt: u.blocked_at,
  }));
}

/* ------------------------------ polls (v1.4) ------------------------------ */

/** Create a poll message (any writable chat member). Anonymous, single-choice. */
export function createPollInChat(user, chatId, raw) {
  const { chat, silentFor } = checkCanPost(user, chatId);
  const question = vStr(String(raw?.question ?? ''), { label: 'Poll question', min: 1, max: 300 });
  if (!Array.isArray(raw?.options)) throw new HttpError(400, 'Poll options must be an array');
  const options = raw.options.map((o) => String(o ?? '').trim());
  if (options.length < 2) throw new HttpError(400, 'A poll needs at least 2 options');
  if (options.length > 10) throw new HttpError(400, 'A poll can have at most 10 options');
  for (const o of options) vStr(o, { label: 'Poll option', min: 1, max: 100 });
  const message = store.createMessage({ chatId, userId: user.id, content: '', dropped: Boolean(silentFor) });
  store.createPoll(message.id, question, options);
  message.poll = store.getPoll(message.id, user.id);
  return { chat, message, silentFor };
}

/** Cast, change, or retract (optionId = null) a single-choice vote. */
export function voteInPoll(user, messageId, optionId) {
  const raw = store.getMessageRaw(Number(messageId));
  if (!raw || raw.deleted) throw new HttpError(404, 'Message not found');
  if (!store.isMember(raw.chat_id, user.id)) throw new HttpError(404, 'Message not found');
  if (!store.getPoll(raw.id)) throw new HttpError(404, 'That message is not a poll');
  if (optionId !== null && optionId !== undefined) {
    const oid = Number(optionId);
    if (!Number.isInteger(oid) || !store.getPollOption(raw.id, oid)) {
      throw new HttpError(400, 'Invalid poll option');
    }
    store.votePoll(raw.id, user.id, oid);
  } else {
    store.votePoll(raw.id, user.id, null); // retract
  }
  return store.getPoll(raw.id, user.id);
}

/** Live poll tallies, personalized per member (their own vote highlighted). */
export function emitPollUpdate(hub, chatId, messageId) {
  for (const id of fanoutMembers(chatId, messageId)) {
    hub.sendToUser(id, { t: 'poll:update', data: { chatId, messageId, poll: store.getPoll(messageId, id) } });
  }
}

/* --------------------------- invite links (v1.4) --------------------------- */

const canManageInvite = (user, chat) =>
  chat.type === 'group' && (chat.created_by === user.id || roleLevel(user.role) >= 1);

/** Show the group's current invite link (creator or staff only). */
export function inviteLinkForChat(user, chatId) {
  const chat = store.getChat(chatId);
  if (!chat || !store.isMember(chatId, user.id)) throw new HttpError(404, 'Chat not found');
  if (!canManageInvite(user, chat)) throw new HttpError(403, 'Only the group creator or staff can manage invite links');
  const inv = store.getInviteForChat(chatId);
  return inv ? { token: inv.token, createdAt: inv.created_at } : null;
}

/** Create (or rotate) the group's invite link — revokes any previous one. */
export function rotateInviteLink(user, chatId) {
  const chat = store.getChat(chatId);
  if (!chat || !store.isMember(chatId, user.id)) throw new HttpError(404, 'Chat not found');
  if (!canManageInvite(user, chat)) throw new HttpError(403, 'Only the group creator or staff can manage invite links');
  store.deleteInvitesForChat(chatId);
  const token = randomBytes(9).toString('base64url');
  store.createInviteRow({ token, chatId, createdBy: user.id });
  return { token, createdAt: now() };
}

/** Revoke the group's invite link. */
export function revokeInviteLink(user, chatId) {
  const chat = store.getChat(chatId);
  if (!chat || !store.isMember(chatId, user.id)) throw new HttpError(404, 'Chat not found');
  if (!canManageInvite(user, chat)) throw new HttpError(403, 'Only the group creator or staff can manage invite links');
  store.deleteInvitesForChat(chatId);
}

/** Join a group through an invite link. Returns { chat, alreadyMember, systemMessage? }. */
export function joinViaInvite(user, token, limits) {
  const inv = store.getInvite(token);
  if (!inv) throw new HttpError(404, 'This invite link is invalid or was revoked');
  const chat = store.getChat(inv.chat_id);
  if (!chat) throw new HttpError(404, 'This invite link is invalid or was revoked');
  if (user.banned) throw new HttpError(403, 'You are banned from this server');
  if (store.isMember(chat.id, user.id)) return { chat, alreadyMember: true };
  const maxSize = limits?.maxGroupSize ?? 100;
  if (store.getMembers(chat.id).length >= maxSize) throw new HttpError(400, 'This group is full');
  store.addMembers(chat.id, [user.id]);
  const sys = postSystemMessage(chat.id, user.id, `${user.display_name} joined via invite link`);
  return { chat, alreadyMember: false, systemMessage: sys };
}

/** Send a message (validates membership, mute status, length, reply target). */
export function postMessage(user, chatId, rawContent, limits, meta = {}) {
  const { chat, silentFor } = checkCanPost(user, chatId);
  if (meta.e2ee) {
    const enc = validateE2eeEnvelope(user, chat, meta.e2ee, limits);
    let replyTo = null;
    if (meta.replyTo !== undefined && meta.replyTo !== null) {
      const target = store.getMessageRaw(Number(meta.replyTo));
      if (!target || target.chat_id !== chatId || target.deleted) {
        throw new HttpError(400, 'Invalid reply target');
      }
      replyTo = target.id;
    }
    const message = store.createMessage({ chatId, userId: user.id, content: enc.ct, replyTo, enc, dropped: Boolean(silentFor) });
    return { chat, message, silentFor };
  }
  const content = vStr(String(rawContent ?? ''), {
    label: 'Message', min: 1, max: limits?.maxMessageLength ?? 4000,
  });
  let replyTo = null;
  if (meta.replyTo !== undefined && meta.replyTo !== null) {
    const target = store.getMessageRaw(Number(meta.replyTo));
    if (!target || target.chat_id !== chatId || target.deleted) {
      throw new HttpError(400, 'Invalid reply target');
    }
    replyTo = target.id;
  }
  const message = store.createMessage({ chatId, userId: user.id, content, replyTo, dropped: Boolean(silentFor) });
  bumpMentionCounters(chat, user.id, content); // groups only, @username hits
  return { chat, message, silentFor };
}

/** +1 unread-mention badge for every group member @-mentioned in a message. */
export function bumpMentionCounters(chat, authorId, content) {
  if (chat.type !== 'group' || !content) return;
  const names = [...String(content).matchAll(/@([A-Za-z0-9_]{2,24})(?![A-Za-z0-9_])/g)]
    .map((m) => m[1].toLowerCase());
  if (!names.length) return;
  const hit = store.getMembers(chat.id)
    .filter((m) => m.id !== authorId && names.includes(String(m.username).toLowerCase()))
    .map((m) => m.id);
  store.bumpUnreadMentions(chat.id, [...new Set(hit)]);
}

const REACTION_RE = /\p{Extended_Pictographic}/u;

/** Toggle an emoji reaction on a message (any chat member). */
export function toggleReactionAs(user, messageId, rawEmoji) {
  const emoji = String(rawEmoji ?? '').trim();
  if (!emoji || [...emoji].length > 16 || !REACTION_RE.test(emoji)) {
    throw new HttpError(400, 'Invalid reaction emoji');
  }
  const msg = store.getMessage(messageId, user.id);
  if (!msg) throw new HttpError(404, 'Message not found');
  if (!store.isMember(msg.chatId, user.id)) throw new HttpError(403, 'You are not a member of this chat');
  const hasIt = msg.reactions.some((r) => r.emoji === emoji && r.me);
  if (!hasIt) {
    if (store.userReactionCount(messageId, user.id) >= 3) {
      throw new HttpError(400, 'Maximum 3 reactions per message');
    }
    if (store.distinctReactionEmojis(messageId) >= 20) {
      throw new HttpError(400, 'Too many different reactions on this message');
    }
  }
  const action = store.toggleReaction(messageId, user.id, emoji);
  return { chatId: msg.chatId, action, emoji };
}

/** Broadcast a personalized reaction summary to every chat member. */
export function emitReactionUpdate(hub, chatId, messageId) {
  for (const id of fanoutMembers(chatId, messageId)) {
    hub.sendToUser(id, {
      t: 'msg:reaction',
      data: { chatId, messageId, reactions: store.reactionSummary(messageId, id) },
    });
  }
}

/** Copy a message (content + file reference snapshot) into another chat. */
export function forwardMessage(user, messageId, targetChatId, limits) {
  const src = store.getMessage(messageId, user.id); // authors may forward their own ghost messages
  if (!src) throw new HttpError(404, 'Message not found');
  if (!store.isMember(src.chatId, user.id)) throw new HttpError(403, 'You are not a member of the source chat');
  if (src.poll) throw new HttpError(400, 'Polls cannot be forwarded');
  if (src.enc) throw new HttpError(400, 'Encrypted messages cannot be forwarded');
  const { chat: target, silentFor } = checkCanPost(user, targetChatId);
  const content = vStr(String(src.content ?? ''), {
    label: 'Message', min: 0, max: limits?.maxMessageLength ?? 4000, optional: true,
  });
  const message = store.createMessage({
    chatId: targetChatId, userId: user.id, content, fwdFrom: src.author.displayName,
    dropped: Boolean(silentFor),
  });
  // Re-point a new file row at the same stored bytes (no extra disk usage)
  const f = store.getFile(src.file?.id ?? '');
  if (f) {
    store.createFile({
      messageId: message.id, chatId: targetChatId,
      storedName: f.stored_name, originalName: f.original_name,
      mime: f.mime, size: f.size, uploadedBy: user.id,
      kind: f.kind, duration: f.duration,
    });
  }
  return { chat: target, message: store.getMessage(message.id, user.id, { includeDropped: true }), silentFor };
}

/** Pin/unpin a message. DMs: any member. Groups: creator or staff. */
export function setPinnedAs(user, messageId, pin) {
  const msg = store.getMessageRaw(messageId);
  if (!msg || msg.deleted) throw new HttpError(404, 'Message not found');
  const chat = store.getChat(msg.chat_id);
  if (!chat) throw new HttpError(404, 'Chat not found');
  if (!store.isMember(chat.id, user.id)) throw new HttpError(403, 'You are not a member of this chat');
  const canPin = chat.type === 'dm' || chat.created_by === user.id || roleLevel(user.role) >= 1;
  if (!canPin) throw new HttpError(403, 'Only the group creator or staff can pin messages here');
  store.setPinnedMessage(chat.id, pin ? msg.id : null);
  return { chatId: chat.id };
}

/** Attach an already-uploaded file to a new message (caption optional). */
export function postFileMessage(user, chatId, caption, file, limits, e2ee = null) {
  const { chat, silentFor } = checkCanPost(user, chatId);
  const dropped = Boolean(silentFor);
  if (e2ee) {
    // caption travels as a normal encrypted message envelope; the bytes are
    // client-encrypted too (validated on upload metadata, opaque to us)
    const enc = validateE2eeEnvelope(user, chat, { kid: e2ee.kid, iv: e2ee.civ, ct: e2ee.cct, sig: e2ee.csig }, limits);
    const fiv = vB64(e2ee.fiv, { label: 'file iv', minBytes: 12, maxBytes: 12 });
    const message = store.createMessage({ chatId, userId: user.id, content: enc.ct, enc, dropped });
    store.createFile({
      messageId: message.id, chatId,
      storedName: file.storedName, originalName: file.originalName,
      mime: file.mime, size: file.size, uploadedBy: user.id,
      kind: file.kind, duration: file.duration, enc: true, fiv,
    });
    return { chat, message: store.getMessage(message.id, user.id, { includeDropped: true }), silentFor };
  }
  const content = vStr(String(caption ?? ''), {
    label: 'Caption', min: 0, max: limits?.maxMessageLength ?? 4000, optional: true,
  });
  const message = store.createMessage({ chatId, userId: user.id, content, dropped });
  store.createFile({
    messageId: message.id, chatId,
    storedName: file.storedName, originalName: file.originalName,
    mime: file.mime, size: file.size, uploadedBy: user.id,
    kind: file.kind, duration: file.duration,
  });
  return { chat, message: store.getMessage(message.id, user.id, { includeDropped: true }), silentFor };
}

/** Broadcast a fresh per-member chat payload to all members. */
export function emitChatToMembers(hub, chatId, { type = 'chat:updated', onlyUserIds = null, excludeUserId = null } = {}) {
  const members = store.getMembers(chatId);
  for (const m of members) {
    if (onlyUserIds && !onlyUserIds.includes(m.id)) continue;
    if (excludeUserId && m.id === excludeUserId) continue;
    const payload = store.chatPayloadFor(chatId, m.id);
    if (payload) hub.sendToUser(m.id, { t: type, data: { chat: payload } });
  }
}

/** Broadcast a new message to every chat member (sender included — client dedupes / reconciles). */
export function emitNewMessage(hub, chatId, message, clientId = null, { excludeUserIds = null } = {}) {
  const members = fanoutMembers(chatId, message?.id ?? null, excludeUserIds);
  hub.sendToUsers(members, { t: 'msg:new', data: { message, clientId } });
}

/**
 * Recipients for an event about a message: everyone — unless the message is a
 * ghost (dropped), in which case only its author ever hears about it. Extra
 * `excludeUserIds` covers the "just blocked, suppress the live echo" case.
 */
function fanoutMembers(chatId, messageId = null, excludeUserIds = null) {
  const raw = messageId ? store.getMessageRaw(messageId) : null;
  let ids;
  if (raw?.dropped) ids = [raw.user_id];
  else ids = store.getMembers(chatId).map((m) => m.id);
  if (excludeUserIds) ids = ids.filter((id) => !excludeUserIds.includes(id));
  return ids;
}

export function emitMessageEdited(hub, chatId, message) {
  const members = fanoutMembers(chatId, message?.id ?? null);
  hub.sendToUsers(members, { t: 'msg:edited', data: { message } });
}

export function emitMessageDeleted(hub, chatId, messageId, byMod) {
  const members = fanoutMembers(chatId, messageId);
  hub.sendToUsers(members, { t: 'msg:deleted', data: { chatId, messageId, byMod } });
}

export function emitRead(hub, chatId, userId, messageId) {
  const members = store.getMembers(chatId);
  // No read receipts across a block — silence in both directions
  const chat = store.getChat(chatId);
  const recipients = chat?.type === 'dm'
    ? members.filter((m) => m.id === userId || !store.isBlockedEitherWay(userId, m.id))
    : members;
  hub.sendToUsers(recipients.map((m) => m.id), { t: 'read', data: { chatId, userId, messageId } });
}

/** Edit a message — only the author may edit. */
export function editMessageAs(user, messageId, rawContent, limits, e2eeMeta = null) {
  const msg = store.getMessage(messageId, user.id); // authors can edit their own ghost messages
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.author.id !== user.id) throw new HttpError(403, 'You can only edit your own messages');
  if (msg.enc) {
    if (!e2eeMeta) throw new HttpError(400, 'Encrypted messages must be edited with a fresh ciphertext envelope');
    const chat = store.getChat(msg.chatId);
    const enc = validateE2eeEnvelope(user, chat, { ...e2eeMeta, kid: msg.kid }, limits);
    store.editMessage(messageId, enc.ct, enc);
    return store.getMessage(messageId, user.id, { includeDropped: true });
  }
  const content = vStr(String(rawContent ?? ''), {
    label: 'Message', min: 1, max: limits?.maxMessageLength ?? 4000,
  });
  store.editMessage(messageId, content);
  return store.getMessage(messageId, user.id, { includeDropped: true });
}

/**
 * Delete a message — the author always may; staff may delete messages of
 * strictly-lower-role members; the group creator may delete inside their group.
 */
export function deleteMessageAs(actor, messageId, roleLevelFn) {
  const msg = store.getMessage(messageId, actor.id); // authors can delete their own ghost messages
  if (!msg) throw new HttpError(404, 'Message not found');
  const chat = store.getChat(msg.chatId);
  const isAuthor = msg.author.id === actor.id;
  const isStaff = roleLevelFn(actor.role) > roleLevelFn(msg.author.role) && roleLevelFn(actor.role) >= 1;
  const isChatCreator = chat && chat.created_by === actor.id && chat.type === 'group';
  if (!isAuthor && !isStaff && !isChatCreator) throw new HttpError(403, 'Not allowed to delete this message');
  const byMod = !isAuthor;
  store.softDeleteMessage(messageId, byMod);
  if (byMod) store.audit(actor.id, 'message_delete', msg.author.id, { messageId, chatId: msg.chatId });
  return { chatId: msg.chatId, byMod };
}

/** Mark messages as read (idempotent, monotone). */
export function markRead(user, chatId, messageId) {
  if (!store.isMember(chatId, user.id)) throw new HttpError(403, 'You are not a member of this chat');
  const id = Number(messageId);
  if (!Number.isInteger(id) || id < 0) throw new HttpError(400, 'Invalid message id');
  store.setLastRead(chatId, user.id, id);
  return id;
}

/* ======================= E2EE services (v1.5) ======================= */

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const vB64 = (v, { label, minBytes = 1, maxBytes = 4096 }) => {
  const str = String(v ?? '');
  if (!str || str.length % 4 !== 0 || !B64_RE.test(str)) throw new HttpError(400, `${label} must be valid base64`);
  const len = Buffer.byteLength(str, 'base64');
  if (len < minBytes || len > maxBytes) throw new HttpError(400, `${label} has an invalid size`);
  return str;
};

export const identityFingerprint = (dhPubB64) =>
  createHash('sha256').update(Buffer.from(dhPubB64, 'base64')).digest('hex');

/** Publish (or rotate) my public identity bundle. Secrets never touch the server. */
export function publishIdentity(user, { dhPub, sigPub }) {
  const dh = vB64(dhPub, { label: 'dhPub', minBytes: 60, maxBytes: 200 });
  const sg = vB64(sigPub, { label: 'sigPub', minBytes: 60, maxBytes: 200 });
  // both keys must parse as EC P-256 SPKI, and the ECDH one must actually be a DH key
  for (const [b64, label] of [[dh, 'dhPub'], [sg, 'sigPub']]) {
    try {
      const k = createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
      if (k.asymmetricKeyType !== 'ec') throw new Error('not ec');
    } catch { throw new HttpError(400, `${label} is not a valid EC public key`); }
  }
  const prev = store.getIdentityKey(user.id);
  const dhHash = identityFingerprint(dh);
  store.setIdentityKey(user.id, { dhPub: dh, sigPub: sg, dhHash });
  return { dhHash, changed: !prev || prev.dhHash !== dhHash };
}

/** Wipe identity + every wrapped key aimed at me (device-loss recovery). */
export function resetIdentityAs(user) {
  store.resetIdentityKey(user.id);
}

/** Canonical bytes a message signature covers — must match the client exactly. */
export const signedMessageBytes = ({ chatId, kid, iv, ct }) =>
  Buffer.from(`efadro-msg:v1\n${chatId}\n${kid}\n${iv}\n${ct}`, 'utf8');

/** Verify an author's ECDSA signature over the ciphertext envelope. */
export function verifyMessageSignature(sigPubB64, envelope, sigB64) {
  try {
    const key = createPublicKey({ key: Buffer.from(sigPubB64, 'base64'), format: 'der', type: 'spki' });
    return cryptoVerify('SHA-256', signedMessageBytes(envelope), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sigB64, 'base64'));
  } catch { return false; }
}

/** Validate + authenticate an incoming encrypted envelope against the author's identity. */
export function validateE2eeEnvelope(user, chat, { kid, iv, ct, sig }, limits) {
  if (chat.type !== 'dm') throw new HttpError(400, 'Encryption is only available in direct chats');
  const epoch = Number(kid);
  if (!Number.isInteger(epoch) || epoch < 1) throw new HttpError(400, 'Invalid key epoch');
  if (!store.chatIsE2ee(chat.id)) throw new HttpError(400, 'This chat has no encryption keys yet');
  if (epoch > store.currentKeyEpoch(chat.id)) throw new HttpError(400, 'Unknown key epoch');
  if (!store.hasWrapForEpoch(chat.id, epoch, user.id)) {
    throw new HttpError(400, 'You hold no key for this epoch — refresh key state');
  }
  const cleanIv = vB64(iv, { label: 'iv', minBytes: 12, maxBytes: 12 });
  const maxPlain = (limits?.maxMessageLength ?? 4000) * 4; // utf8 worst case
  const cleanCt = vB64(ct, { label: 'ciphertext', minBytes: 16, maxBytes: maxPlain + 16 });
  const cleanSig = vB64(sig, { label: 'signature', minBytes: 60, maxBytes: 80 });
  const me = store.getIdentityKey(user.id);
  if (!me) throw new HttpError(400, 'Publish an encryption identity first');
  if (!verifyMessageSignature(me.sigPub, { chatId: chat.id, kid: epoch, iv: cleanIv, ct: cleanCt }, cleanSig)) {
    throw new HttpError(400, 'Message signature check failed');
  }
  return { kid: epoch, iv: cleanIv, ct: cleanCt, sig: cleanSig };
}

/**
 * Register a new chat-key epoch: one wrapped copy per member, sequential epochs,
 * wrapper's identity hash snapshotted so peers can derive the wrap key.
 * Returns { firstEpoch } so the route can announce it in the chat.
 */
export function createKeyEpoch(user, chatId, epochRaw, wrapsRaw) {
  const { chat, silentFor } = checkCanPost(user, chatId); // member + not muted
  if (chat.type !== 'dm') throw new HttpError(400, 'Encryption is only available in direct chats');
  const epoch = Number(epochRaw);
  const current = store.currentKeyEpoch(chatId);
  if (!Number.isInteger(epoch) || epoch !== current + 1) {
    throw new HttpError(400, epoch === current + 1 ? 'Invalid epoch' : `Next epoch must be ${current + 1}`);
  }
  const me = store.getIdentityKey(user.id);
  if (!me) throw new HttpError(400, 'Publish an encryption identity first');
  const members = store.getMembers(chatId).map((m) => m.id);
  if (!Array.isArray(wrapsRaw)) throw new HttpError(400, 'wraps must be an array');
  const seen = new Set();
  const wraps = wrapsRaw.map((w) => {
    const u = String(w?.user ?? '');
    if (seen.has(u)) throw new HttpError(400, 'Duplicate wrap target');
    seen.add(u);
    return {
      user: u,
      wrapped: vB64(w?.wrapped, { label: 'wrapped key', minBytes: 32, maxBytes: 96 }),
      wiv: vB64(w?.wiv, { label: 'wrap iv', minBytes: 12, maxBytes: 12 }),
    };
  });
  // full coverage: exactly the member set, everyone on their CURRENT identity
  const missing = members.filter((id) => !seen.has(id));
  const extra = [...seen].filter((id) => !members.includes(id));
  if (missing.length || extra.length) throw new HttpError(400, 'Wraps must cover exactly the current member set');
  const pubs = store.getIdentityKeys(members);
  for (const id of members) {
    if (!pubs[id]) throw new HttpError(400, `Member ${id} has not published an encryption identity`);
  }
  store.putChatKeyEpoch(chatId, epoch, user.id, me.dhHash, wraps);
  return { chat, epoch, firstEpoch: epoch === 1, silentFor };
}
