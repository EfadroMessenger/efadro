import { Router } from 'express';
import * as store from '../store.js';
import * as services from '../services.js';
import { asyncH, HttpError, makeLimiter } from '../util.js';
import { requireAuth } from '../auth.js';

/**
 * E2EE endpoints (v1.5): public identity directory, wrapped chat-key epochs and
 * device-to-device key transfers. The server only ever stores/relays public
 * keys and opaque ciphertext — plaintext and secrets never leave the clients.
 */
export function e2eeRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));
  // req.user rows are refreshed per request (requireAuth), no extra plumbing needed

  /* ----------------------------- identity ----------------------------- */

  r.get('/identity/me', (req, res) => {
    res.json({ identity: store.getIdentityKey(req.user.id) });
  });

  /** Batch lookup: /api/e2ee/identity?ids=a,b,c */
  r.get('/identity', (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    res.json({ keys: store.getIdentityKeys(ids) });
  });

  /** Publish or rotate my identity bundle. Notifies online users so peers re-key lazily. */
  r.put('/identity', asyncH(async (req, res) => {
    const { dhHash, changed } = services.publishIdentity(req.user, req.body ?? {});
    if (changed) hub.broadcast({ t: 'user:e2ee', data: { user: req.user.id, dhHash } });
    res.json({ ok: true, dhHash, changed });
  }));

  /** Nuclear reset: unreadable old history for me, peers re-key on next activity. */
  r.delete('/identity', (req, res) => {
    services.resetIdentityAs(req.user);
    hub.broadcast({ t: 'user:e2ee', data: { user: req.user.id, dhHash: null } });
    res.json({ ok: true });
  });

  /* ------------------------- chat key distribution ------------------------- */

  /** My wrapped copies + per-member identity hashes for change detection. */
  r.get('/chats/:id/keys', (req, res) => {
    const chatId = String(req.params.id);
    if (!store.isMember(chatId, req.user.id)) throw new HttpError(404, 'Chat not found');
    res.json(store.chatKeyState(chatId, req.user.id));
  });

  /** Register a new epoch (first one also flips the chat into E2EE mode). */
  r.post('/chats/:id/keys', asyncH(async (req, res) => {
    const { chat, epoch, firstEpoch } = services.createKeyEpoch(
      req.user, String(req.params.id), req.body?.epoch, req.body?.wraps,
    );
    if (firstEpoch) {
      const sys = services.postSystemMessage(chat.id, req.user.id, '🔒 End-to-end encryption is now on for this chat');
      services.emitNewMessage(hub, chat.id, sys);
    }
    services.emitChatToMembers(hub, chat.id, { type: 'chat:e2ee', onlyUserIds: null });
    res.status(201).json({ ok: true, epoch });
  }));

  /* --------------------- device-to-device key transfer --------------------- */

  const transferLimiter = makeLimiter({
    windowMs: 60000, max: 20, keyFn: (req) => req.user.id,
    message: 'Too many transfer requests', enabled: cfg.rateLimit?.enabled !== false,
  });

  /** Pending requests aimed at my account (polled by the old device as a WS fallback). */
  r.get('/transfers', (req, res) => {
    res.json({ transfers: store.pendingTransfersFor(req.user.id) });
  });

  /** New device: announce an ephemeral public key and wait for approval. */
  r.post('/transfers', transferLimiter, asyncH(async (req, res) => {
    const ephPub = String(req.body?.ephPub ?? '');
    if (!ephPub || ephPub.length % 4 !== 0 || Buffer.byteLength(ephPub, 'base64') > 200) {
      throw new HttpError(400, 'Invalid ephemeral public key');
    }
    const t = store.createTransfer(req.user.id, ephPub);
    // alert any other online session of this account (the "old device")
    hub.sendToUser(req.user.id, { t: 'e2ee:transfer_request', data: { request: { id: t.id, ephPub: t.ephPub, createdAt: t.createdAt, expiresAt: t.expiresAt } } });
    res.status(201).json({ request: { id: t.id, ephPub: t.ephPub, status: t.status, expiresAt: t.expiresAt } });
  }));

  /** Any session of this user can poll a request's status/payload. */
  r.get('/transfers/:id', (req, res) => {
    const t = store.getTransfer(req.params.id);
    if (!t || t.userId !== req.user.id) throw new HttpError(404, 'Transfer not found');
    res.json({ request: t });
  });

  /** Old device: approve — attach the wrapped key bundle. */
  r.post('/transfers/:id/answer', asyncH(async (req, res) => {
    const t = store.getTransfer(req.params.id);
    if (!t || t.userId !== req.user.id) throw new HttpError(404, 'Transfer not found');
    if (t.status !== 'pending') throw new HttpError(400, 'Transfer already handled');
    const payload = String(req.body?.payload ?? '');
    const piv = String(req.body?.piv ?? '');
    if (!payload || payload.length > 200000 || !piv || Buffer.byteLength(piv, 'base64') !== 12) {
      throw new HttpError(400, 'Invalid transfer payload');
    }
    store.answerTransfer(t.id, payload, piv);
    hub.sendToUser(req.user.id, { t: 'e2ee:transfer_answer', data: { id: t.id } });
    res.json({ ok: true });
  }));

  /** Old device (or the requester): decline / abort. */
  r.post('/transfers/:id/decline', asyncH(async (req, res) => {
    const t = store.getTransfer(req.params.id);
    if (!t || t.userId !== req.user.id) throw new HttpError(404, 'Transfer not found');
    if (t.status === 'pending') store.declineTransfer(t.id);
    hub.sendToUser(req.user.id, { t: 'e2ee:transfer_declined', data: { id: t.id } });
    res.json({ ok: true });
  }));

  return r;
}
