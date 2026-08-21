import { Router } from 'express';
import * as store from '../store.js';
import * as services from '../services.js';
import { asyncH, vStr, vInt, makeLimiter, HttpError, roleLevel } from '../util.js';
import { requireAuth } from '../auth.js';

export function chatsRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));

  const msgLimiter = makeLimiter({
    windowMs: 60000,
    max: cfg.rateLimit?.messagePerMinute ?? 120,
    keyFn: (req) => req.user.id,
    message: 'You are sending messages too fast',
    enabled: cfg.rateLimit?.enabled !== false,
  });

  /* ------------------------------ chats ------------------------------ */

  r.get('/', (req, res) => {
    res.json({ chats: store.listChatsForUser(req.user.id) });
  });

  /** Global message search across all of the user's chats. */
  r.get('/search/messages', asyncH(async (req, res) => {
    res.json({ results: services.globalMessageSearch(req.user, req.query.q) });
  }));

  r.post('/dm', asyncH(async (req, res) => {
    const targetId = vStr(req.body?.userId, { label: 'userId', min: 1, max: 64 });
    if (targetId === req.user.id) {
      // "Saved Messages" self-chat
      let chat = store.getDmByKey(`self:${req.user.id}`);
      if (!chat) {
        chat = store.createChat({ type: 'dm', dmKey: `self:${req.user.id}`, createdBy: req.user.id, memberIds: [req.user.id] });
        services.emitChatToMembers(hub, chat.id, { type: 'chat:new' });
      } else if (!store.isMember(chat.id, req.user.id)) {
        store.addMembers(chat.id, [req.user.id]);
        store.setLastRead(chat.id, req.user.id, store.maxMessageId(chat.id));
      }
      return res.json({ chat: store.chatPayloadFor(chat.id, req.user.id) });
    }
    const target = store.getUserById(targetId);
    if (!target) throw new HttpError(404, 'User not found');
    if (target.banned) throw new HttpError(403, 'This user is banned');
    if (store.isBlocked(req.user.id, targetId)) {
      throw new HttpError(403, 'You blocked this user — unblock them to chat', { code: 'blocked' });
    }
    // If THEY blocked the caller, everything proceeds normally for the caller
    // (stealth blocking) — but the blocker must not learn a new chat appeared.
    const stealth = store.isBlocked(targetId, req.user.id);
    const key = [req.user.id, targetId].sort().join(':');
    let chat = store.getDmByKey(key);
    if (!chat) {
      chat = store.createChat({ type: 'dm', dmKey: key, createdBy: req.user.id, memberIds: [req.user.id, targetId] });
      services.emitChatToMembers(hub, chat.id, { type: 'chat:new', onlyUserIds: stealth ? [req.user.id] : null });
    } else if (!store.isMember(chat.id, req.user.id)) {
      // Re-joining after "delete chat": fresh start (no backlog of unread)
      store.addMembers(chat.id, [req.user.id]);
      store.setLastRead(chat.id, req.user.id, store.maxMessageId(chat.id));
      services.emitChatToMembers(hub, chat.id, { type: 'chat:new', onlyUserIds: [req.user.id] });
    }
    res.json({ chat: store.chatPayloadFor(chat.id, req.user.id) });
  }));

  r.post('/group', asyncH(async (req, res) => {
    const name = vStr(req.body?.name, { label: 'Group name', min: 1, max: cfg.limits?.maxGroupNameLength ?? 64 });
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    const maxSize = cfg.limits?.maxGroupSize ?? 100;
    const unique = [...new Set(memberIds)].filter((id) => id !== req.user.id);
    if (unique.length + 1 > maxSize) throw new HttpError(400, `Groups are limited to ${maxSize} members`);
    for (const id of unique) {
      const u = store.getUserById(id);
      if (!u) throw new HttpError(404, 'One of the users does not exist');
      if (u.banned) throw new HttpError(403, `${u.username} is banned and cannot be added`);
    }
    const chat = store.createChat({ type: 'group', name, createdBy: req.user.id, memberIds: [req.user.id, ...unique] });
    const sys = services.postSystemMessage(chat.id, req.user.id, `${req.user.display_name} created the group “${name}”`);
    services.emitChatToMembers(hub, chat.id, { type: 'chat:new' });
    services.emitNewMessage(hub, chat.id, sys);
    res.status(201).json({ chat: store.chatPayloadFor(chat.id, req.user.id) });
  }));

  r.get('/:id', asyncH(async (req, res) => {
    if (!store.isMember(req.params.id, req.user.id)) throw new HttpError(404, 'Chat not found');
    res.json({ chat: store.chatPayloadFor(req.params.id, req.user.id) });
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    const chat = store.getChat(req.params.id);
    if (!chat || !store.isMember(chat.id, req.user.id)) throw new HttpError(404, 'Chat not found');
    if (chat.type !== 'group') throw new HttpError(400, 'Only groups can be renamed');
    const name = vStr(req.body?.name, { label: 'Group name', min: 1, max: cfg.limits?.maxGroupNameLength ?? 64 });
    store.renameChat(chat.id, name);
    const sys = services.postSystemMessage(chat.id, req.user.id, `${req.user.display_name} renamed the group to “${name}”`);
    services.emitNewMessage(hub, chat.id, sys);
    services.emitChatToMembers(hub, chat.id);
    res.json({ chat: store.chatPayloadFor(chat.id, req.user.id) });
  }));

  r.post('/:id/members', asyncH(async (req, res) => {
    const chat = store.getChat(req.params.id);
    if (!chat || !store.isMember(chat.id, req.user.id)) throw new HttpError(404, 'Chat not found');
    if (chat.type !== 'group') throw new HttpError(400, 'Cannot add members to a direct chat');
    const ids = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.map(String))] : [];
    if (!ids.length) throw new HttpError(400, 'No users specified');
    const maxSize = cfg.limits?.maxGroupSize ?? 100;
    const current = store.getMembers(chat.id).length;
    if (current + ids.length > maxSize) throw new HttpError(400, `Groups are limited to ${maxSize} members`);
    for (const id of ids) {
      const u = store.getUserById(id);
      if (!u) throw new HttpError(404, 'One of the users does not exist');
      if (u.banned) throw new HttpError(403, `${u.username} is banned and cannot be added`);
    }
    const added = store.addMembers(chat.id, ids);
    if (added.length) {
      const names = added.map((id) => store.getUserById(id)?.display_name || 'someone');
      const sys = services.postSystemMessage(chat.id, req.user.id, `${req.user.display_name} added ${names.join(', ')}`);
      services.emitNewMessage(hub, chat.id, sys);
    }
    services.emitChatToMembers(hub, chat.id, { type: 'chat:new', onlyUserIds: added });
    services.emitChatToMembers(hub, chat.id, { excludeUserId: null });
    res.json({ chat: store.chatPayloadFor(chat.id, req.user.id), added });
  }));

  r.delete('/:id/members/:uid', asyncH(async (req, res) => {
    const chat = store.getChat(req.params.id);
    if (!chat || !store.isMember(chat.id, req.user.id)) throw new HttpError(404, 'Chat not found');
    const targetId = req.params.uid;
    const isSelf = targetId === req.user.id;
    if (chat.type === 'dm' && !isSelf) throw new HttpError(400, 'You can only remove yourself from a direct chat');
    if (chat.type === 'group' && !isSelf && chat.created_by !== req.user.id && roleLevel(req.user.role) < 1) {
      throw new HttpError(403, 'Only the group creator or staff can remove other members');
    }
    // Group membership events are recorded as visible system messages
    if (chat.type === 'group') {
      const target = store.getUserById(targetId);
      const sys = isSelf
        ? services.postSystemMessage(chat.id, req.user.id, `${req.user.display_name} left the group`)
        : services.postSystemMessage(chat.id, req.user.id, `${req.user.display_name} removed ${target?.display_name || 'a member'}`);
      services.emitNewMessage(hub, chat.id, sys);
    }
    const remaining = store.removeMember(chat.id, targetId);
    hub.sendToUser(targetId, { t: 'chat:removed', data: { chatId: chat.id } });
    if (remaining > 0) services.emitChatToMembers(hub, chat.id);
    res.json({ ok: true });
  }));

  /* ----------------------------- messages ----------------------------- */

  r.get('/:id/messages/search', asyncH(async (req, res) => {
    const results = services.searchMessagesInChat(req.user, req.params.id, req.query.q);
    res.json({ results });
  }));

  r.get('/:id/mention-jump', asyncH(async (req, res) => {
    res.json({ messageId: services.mentionJumpTarget(req.user, req.params.id) });
  }));

  /* ---------------------- per-user chat prefs (v1.4) ---------------------- */

  r.patch('/:id/prefs', asyncH(async (req, res) => {
    const patch = {};
    for (const k of ['pinned', 'archived', 'muted']) {
      if (req.body?.[k] !== undefined) patch[k] = Boolean(req.body[k]);
    }
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
    const prefs = services.updateChatPrefs(req.user, req.params.id, patch);
    hub.sendToUser(req.user.id, { t: 'chat:prefs', data: { chatId: req.params.id, prefs } });
    res.json({ prefs });
  }));

  /* ------------------------------ polls (v1.4) ------------------------------ */

  r.post('/:id/polls', msgLimiter, asyncH(async (req, res) => {
    const { chat, message, silentFor } = services.createPollInChat(req.user, req.params.id, req.body ?? {});
    services.emitNewMessage(hub, chat.id, message, null, { excludeUserIds: silentFor });
    res.status(201).json({ message });
  }));

  /* --------------------------- invite links (v1.4) --------------------------- */

  r.get('/:id/invite', asyncH(async (req, res) => {
    res.json({ invite: services.inviteLinkForChat(req.user, req.params.id) });
  }));

  r.post('/:id/invite', asyncH(async (req, res) => {
    res.status(201).json({ invite: services.rotateInviteLink(req.user, req.params.id) });
  }));

  r.delete('/:id/invite', asyncH(async (req, res) => {
    services.revokeInviteLink(req.user, req.params.id);
    res.json({ ok: true });
  }));

  r.get('/:id/messages', asyncH(async (req, res) => {
    const chatId = req.params.id;
    if (!store.isMember(chatId, req.user.id)) throw new HttpError(404, 'Chat not found');
    const before = req.query.before !== undefined ? vInt(req.query.before, { label: 'before', min: 1 }) : Infinity;
    const limit = vInt(req.query.limit, { label: 'limit', min: 1, max: 100, def: 40 });
    const { messages, hasMore } = store.listMessages(chatId, { before, limit, viewerId: req.user.id });
    const maxId = messages.length ? messages[messages.length - 1].id : 0;
    if (maxId > 0) {
      store.setLastRead(chatId, req.user.id, maxId);
      services.emitRead(hub, chatId, req.user.id, maxId);
    }
    res.json({ messages, hasMore });
  }));

  r.post('/:id/messages', msgLimiter, asyncH(async (req, res) => {
    const e2ee = req.body?.enc ? { kid: req.body?.kid, iv: req.body?.iv, ct: req.body?.ct, sig: req.body?.sig } : null;
    const { chat, message, silentFor } = services.postMessage(
      req.user, req.params.id, e2ee ? req.body?.ct : req.body?.content, cfg.limits,
      { replyTo: req.body?.replyTo, e2ee },
    );
    // silentFor: stealth blocking — the blocker receives no frame at all
    services.emitNewMessage(hub, chat.id, message, req.body?.clientId ?? null, { excludeUserIds: silentFor });
    res.status(201).json({ message });
  }));

  r.post('/:id/read', asyncH(async (req, res) => {
    const id = services.markRead(req.user, req.params.id, req.body?.messageId);
    services.emitRead(hub, req.params.id, req.user.id, id);
    res.json({ ok: true, messageId: id });
  }));

  return r;
}

/* Standalone message operations: /api/messages/... */
export function messagesRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));

  r.patch('/:id', asyncH(async (req, res) => {
    const e2ee = req.body?.enc ? { iv: req.body?.iv, ct: req.body?.ct, sig: req.body?.sig } : null;
    const message = services.editMessageAs(req.user, vInt(req.params.id, { label: 'id', min: 1 }),
      e2ee ? req.body?.ct : req.body?.content, cfg.limits, e2ee);
    services.emitMessageEdited(hub, message.chatId, message);
    res.json({ message });
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    const { chatId, byMod } = services.deleteMessageAs(
      req.user, vInt(req.params.id, { label: 'id', min: 1 }), roleLevel,
    );
    services.emitMessageDeleted(hub, chatId, Number(req.params.id), byMod);
    res.json({ ok: true });
  }));

  r.post('/:id/report', asyncH(async (req, res) => {
    const msgId = vInt(req.params.id, { label: 'id', min: 1 });
    const reason = vStr(req.body?.reason, { label: 'Reason', min: 0, max: 500, optional: true });
    const msg = store.getMessage(msgId);
    if (!msg) throw new HttpError(404, 'Message not found');
    if (!store.isMember(msg.chatId, req.user.id)) throw new HttpError(403, 'Not your chat');
    if (msg.author.id === req.user.id) throw new HttpError(400, 'You cannot report your own message');
    store.createReport({ messageId: msgId, reporterId: req.user.id, reason });
    res.json({ ok: true });
  }));

  /* ------------------------------ polls (v1.4) ------------------------------ */

  r.post('/:id/vote', asyncH(async (req, res) => {
    const msgId = vInt(req.params.id, { label: 'Poll message id', min: 1 });
    const raw = store.getMessageRaw(msgId);
    if (!raw || raw.deleted) throw new HttpError(404, 'Message not found');
    const poll = services.voteInPoll(req.user, msgId, req.body?.optionId ?? null);
    services.emitPollUpdate(hub, raw.chat_id, msgId);
    res.json({ poll });
  }));

  /* ---------------------- reactions / pin / forward ---------------------- */

  r.post('/:id/reactions', asyncH(async (req, res) => {
    const msgId = vInt(req.params.id, { label: 'id', min: 1 });
    const { chatId } = services.toggleReactionAs(req.user, msgId, req.body?.emoji);
    services.emitReactionUpdate(hub, chatId, msgId);
    res.json({ reactions: store.reactionSummary(msgId, req.user.id) });
  }));

  r.post('/:id/pin', asyncH(async (req, res) => {
    const msgId = vInt(req.params.id, { label: 'id', min: 1 });
    const { chatId } = services.setPinnedAs(req.user, msgId, Boolean(req.body?.pin));
    services.emitChatToMembers(hub, chatId);
    res.json({ ok: true });
  }));

  r.post('/:id/forward', asyncH(async (req, res) => {
    const msgId = vInt(req.params.id, { label: 'id', min: 1 });
    const target = vStr(req.body?.chatId, { label: 'Target chat', min: 1, max: 64 });
    const { chat, message, silentFor } = services.forwardMessage(req.user, msgId, target, cfg.limits);
    services.emitNewMessage(hub, chat.id, message, null, { excludeUserIds: silentFor });
    res.status(201).json({ message });
  }));

  return r;
}
