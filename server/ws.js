import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import * as store from './store.js';
import * as services from './services.js';
import { authenticateWs } from './auth.js';
import { now } from './util.js';

/**
 * WebSocket hub: tracks online users and fans out real-time events.
 *
 * Client -> server frames (JSON):
 *   {t:'msg:send', data:{chatId, content, clientId?}}
 *   {t:'typing',   data:{chatId, typing:boolean}}
 *   {t:'read',     data:{chatId, messageId}}
 *   {t:'ping'}
 *
 * Server -> client frames:
 *   ready, msg:new, msg:edited, msg:deleted, chat:new, chat:updated,
 *   chat:removed, presence, typing, read, user:self, user:updated,
 *   server:updated, force_logout, error, pong
 */
export function createHub(server, cfg) {
  const sockets = new Map(); // userId -> Set<ws>
  const wss = new WebSocketServer({ noServer: true });

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  /* --------------------- 1:1 call signaling (v1.6) --------------------- */
  // Media never touches the server (WebRTC p2p) — we only relay the handshake
  // and keep per-user/per-chat call state so "busy" and ring timeouts behave.
  const calls = new Map();        // callId -> call record
  const activeCallOf = new Map(); // userId -> callId (as caller or callee)

  const peerOf = (c) => c.members.find((id) => id !== c.from) ?? null;
  const bothOf = (c) => [c.from, peerOf(c)].filter(Boolean);
  const publicCall = (c) => ({
    callId: c.id, chatId: c.chatId, from: c.from, to: peerOf(c),
    members: c.members, video: c.video, state: c.state,
  });
  const callsEnabled = () => cfg.calls?.enabled !== false;
  const ringTimeoutMs = () => Math.min(120000, Math.max(5000, Number(cfg.calls?.ringTimeoutSec) * 1000 || 45000));

  function dmMembersFor(user, chatId) {
    const chat = store.getChat(String(chatId || ''));
    if (!chat || chat.type !== 'dm') throw Object.assign(new Error('Calls are only available in direct chats'), { status: 400 });
    const members = store.getMembers(chat.id).map((m) => m.id);
    if (!members.includes(user.id)) throw Object.assign(new Error('Chat not found'), { status: 404 });
    return { chatId: chat.id, members };
  }

  const icon = (video) => (video ? '📹' : '📞');
  const callLog = (c, text) => {
    try {
      const sys = services.postSystemMessage(c.chatId, c.from, `${icon(c.video)} ${text}`.
        slice(0, 290));
      services.emitNewMessage(hub, c.chatId, sys);
    } catch { /* call log failures must never crash the hub */ }
  };

  function finishCall(c, ending) {
    if (!c || calls.get(c.id) !== c) return; // already finished
    clearTimeout(c.ringTimer);
    calls.delete(c.id);
    for (const uid of bothOf(c)) if (activeCallOf.get(uid) === c.id) activeCallOf.delete(uid);
    const dur = c.startedAt ? Math.max(0, Math.round((Date.now() - c.startedAt) / 1000)) : 0;
    const mmss = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    let event = 'call:ended';
    let log = null;
    const kind = c.video ? 'Video call' : 'Voice call';
    switch (ending) {
      case 'missed': event = 'call:cancelled'; log = 'Missed call'; break;
      case 'cancelled': event = 'call:cancelled'; log = 'Missed call'; break;
      case 'declined': event = 'call:declined'; log = 'Declined call'; break;
      case 'busy': event = 'call:cancelled'; log = `Missed call · ${c.reasonWord || 'busy'}`; break;
      case 'offline': event = 'call:cancelled'; log = 'Missed call · unreachable'; break;
      case 'answered-elsewhere': event = 'call:ended'; log = 'Missed call · answered on another device'; break;
      case 'hangup': log = `${kind} · ${mmss}`; break;
      case 'failed': log = `${kind} · connection failed`; break;
      case 'lost': log = `${kind} · ${mmss} · connection lost`; break;
      default: log = `${kind} ended`; break;
    }
    hub.sendToUsers(bothOf(c), { t: event, data: { callId: c.id, chatId: c.chatId, reason: ending, duration: dur } });
    if (log) callLog(c, log);
  }
  const callOf = (callId) => calls.get(String(callId || '')) || null;

  /* ------------------------------ hub API ------------------------------ */

  const hub = {
    online(userId) { return sockets.has(userId) && sockets.get(userId).size > 0; },
    onlineIds() { return [...sockets.keys()].filter((id) => hub.online(id)); },
    onlineCount() { return hub.onlineIds().length; },
    sendToUser(userId, obj) {
      const set = sockets.get(userId);
      if (set) for (const ws of set) send(ws, obj);
    },
    sendToUsers(userIds, obj) { for (const id of userIds) hub.sendToUser(id, obj); },
    broadcast(obj) { for (const id of sockets.keys()) hub.sendToUser(id, obj); },
    broadcast(obj) { for (const id of sockets.keys()) hub.sendToUser(id, obj); },
    forceLogoutUser(userId, reason = 'Session terminated') {
      const set = sockets.get(userId);
      if (!set) return;
      for (const ws of set) {
        send(ws, { t: 'force_logout', data: { reason } });
        try { ws.close(4001, 'force_logout'); } catch { /* ignore */ }
      }
    },
    forceLogoutAll(reason = 'Server restarted authentication') {
      for (const id of sockets.keys()) hub.forceLogoutUser(id, reason);
    },
  };

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const user = authenticateWs(url.searchParams.get('token'), cfg);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = user.id;
      wss.emit('connection', ws, req, user);
    });
  });

  wss.on('connection', (ws, req, user) => {
    if (!sockets.has(user.id)) sockets.set(user.id, new Set());
    sockets.get(user.id).add(ws);
    store.touchLastSeen(user.id);

    send(ws, { t: 'ready', data: { user: store.selfUser(store.getUserById(user.id)), online: hub.onlineIds() } });
    hub.broadcast({ t: 'presence', data: { userId: user.id, online: true, lastSeen: now() } });

    // Per-socket throttles
    const msgTimes = [];
    const typingTimes = [];
    const limited = (arr, max, windowMs) => {
      const cutoff = Date.now() - windowMs;
      while (arr.length && arr[0] < cutoff) arr.shift();
      if (arr.length >= max) return true;
      arr.push(Date.now());
      return false;
    };

    ws.on('message', (raw) => {
      let frame;
      try {
        if (raw.length > 8192) throw new Error('too big');
        frame = JSON.parse(raw.toString());
      } catch {
        return send(ws, { t: 'error', data: { message: 'Malformed frame' } });
      }
      const { t, data = {} } = frame || {};
      const freshUser = store.getUserById(user.id); // role/mute state is read live
      try {
        switch (t) {
          case 'ping':
            send(ws, { t: 'pong' });
            break;

          case 'msg:send': {
            const perMin = cfg.rateLimit?.enabled === false ? Infinity : (cfg.rateLimit?.messagePerMinute ?? 120);
            if (limited(msgTimes, perMin, 60000)) {
              return send(ws, { t: 'error', data: { message: 'You are sending messages too fast' } });
            }
            const e2ee = data.enc ? { kid: data.kid, iv: data.iv, ct: data.ct, sig: data.sig } : null;
            const { chat, message } = services.postMessage(
              freshUser, String(data.chatId || ''), e2ee ? data.ct : data.content, cfg.limits,
              { replyTo: data.replyTo, e2ee },
            );
            services.emitNewMessage(hub, chat.id, message, data.clientId ?? null);
            break;
          }

          case 'typing': {
            if (limited(typingTimes, 6, 3000)) return;
            const chatId = String(data.chatId || '');
            if (!store.isMember(chatId, freshUser.id)) return;
            const chat = store.getChat(chatId);
            const members = store.getMembers(chatId).filter((m) => {
              if (m.id === freshUser.id) return false;
              // no typing signals across a block
              return !(chat?.type === 'dm' && store.isBlockedEitherWay(freshUser.id, m.id));
            });
            for (const m of members) {
              hub.sendToUser(m.id, {
                t: 'typing',
                data: { chatId, user: store.publicUser(freshUser), typing: Boolean(data.typing) },
              });
            }
            break;
          }

          case 'read': {
            const id = services.markRead(freshUser, String(data.chatId || ''), data.messageId);
            services.emitRead(hub, String(data.chatId || ''), freshUser.id, id);
            break;
          }

          /* --------------------- call signaling --------------------- */

          case 'call:invite': {
            if (!callsEnabled()) throw Object.assign(new Error('Calls are disabled on this server'), { status: 403 });
            const { chatId, members } = dmMembersFor(freshUser, data.chatId);
            const peer = members.find((id) => id !== freshUser.id);
            if (!peer || peer === freshUser.id) throw Object.assign(new Error('You can’t call yourself'), { status: 400 });
            if (store.isBlockedEitherWay(freshUser.id, peer)) {
              return send(ws, { t: 'call:error', data: { message: 'You can’t call this user' } });
            }
            const video = Boolean(data.video);
            if (activeCallOf.has(freshUser.id) || [...calls.values()].some((c) => c.chatId === chatId)) {
              return send(ws, { t: 'call:error', data: { message: 'Already in a call' } });
            }
            if (activeCallOf.has(peer)) {
              // callee is busy — tell the caller immediately, log a missed call
              const missed = {
                id: crypto.randomUUID(), chatId, from: freshUser.id, members, video,
                state: 'ringing', startedAt: 0, ringTimer: null, reasonWord: 'busy',
              };
              send(ws, { t: 'call:busy', data: { chatId } });
              callLog(missed, 'Missed call · busy');
              return;
            }
            const call = {
              id: crypto.randomUUID(), chatId, from: freshUser.id, members, video,
              state: 'ringing', startedAt: 0, ringTimer: null,
            };
            calls.set(call.id, call);
            activeCallOf.set(freshUser.id, call.id);
            activeCallOf.set(peer, call.id);
            call.ringTimer = setTimeout(() => finishCall(call, 'missed'), ringTimeoutMs());
            // ring on every device of the peer; the caller gets the echo to build UI from
            hub.sendToUser(peer, { t: 'call:ring', data: { call: publicCall(call) } });
            send(ws, { t: 'call:ringing', data: { call: publicCall(call) } });
            if (!hub.online(peer)) finishCall(call, 'offline');
            break;
          }

          case 'call:accept': {
            const c = callOf(data.callId);
            if (!c || c.state !== 'ringing' || peerOf(c) !== freshUser.id) return;
            // someone else may already be ringing this user in another chat
            const loser = [...calls.values()].filter((o) => o.id !== c.id
              && (peerOf(o) === freshUser.id || o.from === freshUser.id));
            clearTimeout(c.ringTimer);
            c.state = 'active';
            c.startedAt = Date.now();
            hub.sendToUsers(bothOf(c), { t: 'call:accepted', data: { callId: c.id, video: c.video } });
            for (const o of loser) {
              o.reasonWord = 'answered another call';
              finishCall(o, 'answered-elsewhere');
            }
            break;
          }

          case 'call:decline': {
            const c = callOf(data.callId);
            if (!c || c.state !== 'ringing' || peerOf(c) !== freshUser.id) return;
            finishCall(c, 'declined');
            break;
          }

          case 'call:cancel': {
            const c = callOf(data.callId);
            if (!c || c.state !== 'ringing' || c.from !== freshUser.id) return;
            finishCall(c, 'cancelled');
            break;
          }

          case 'call:end': {
            const c = callOf(data.callId);
            if (!c || !bothOf(c).includes(freshUser.id)) return;
            const reason = ['hangup', 'failed'].includes(data.reason) ? data.reason : 'hangup';
            if (c.state === 'ringing') finishCall(c, c.from === freshUser.id ? 'cancelled' : 'declined');
            else finishCall(c, reason);
            break;
          }

          case 'call:signal': {
            const c = callOf(data.callId);
            if (!c || !bothOf(c).includes(freshUser.id)) return;
            const to = c.from === freshUser.id ? peerOf(c) : c.from;
            const payload = JSON.stringify(data.data ?? null);
            if (payload.length > 12000) return; // keep the relay small — SDPs+candidates only
            hub.sendToUser(to, { t: 'call:signal', data: { callId: c.id, from: freshUser.id, data: data.data ?? null } });
            break;
          }

          default:
            send(ws, { t: 'error', data: { message: `Unknown frame type: ${String(t)}` } });
        }
      } catch (e) {
        // msg:send failures echo the client's own bubble id so the optimistic
        // row can flip to "failed" instead of hanging on "sending…"
        const ctx = t === 'msg:send'
          ? { chatId: String(data.chatId || ''), clientId: data.clientId ? String(data.clientId) : null }
          : {};
        send(ws, { t: 'error', data: { message: e.message || 'Error', status: e.status || 500, ...ctx } });
      }
    });

    ws.on('close', () => {
      const set = sockets.get(user.id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          sockets.delete(user.id);
          store.touchLastSeen(user.id);
          hub.broadcast({ t: 'presence', data: { userId: user.id, online: false, lastSeen: now() } });
          // fully offline while in a call → the call dies with them
          const callId = activeCallOf.get(user.id);
          const c = callId && calls.get(callId);
          if (c) finishCall(c, c.state === 'active' ? 'lost' : (c.from === user.id ? 'cancelled' : 'offline'));
        }
      }
    });

    ws.on('error', () => { /* socket errors are followed by close */ });
  });

  return hub;
}
