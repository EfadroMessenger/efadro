/* efadro E2EE (v1.5) — browser orchestration layer.
 * Headless on purpose: all DOM/UI lives in app.js; this module owns the
 * keystore (IndexedDB), chat-key management, en/decryption and device
 * transfers. Everything cryptographic comes from e2ee-core.js.
 */
import * as C from './e2ee-core.js?v=1.6.2';

/* ------------------------------ keystore ------------------------------ */

const DB_NAME = 'efadro-e2ee';
let dbPromise = null;

function dbOpen() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  return dbPromise;
}

async function kvGet(key) {
  const db = await dbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    tx.onsuccess = () => resolve(tx.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function kvSet(key, val) {
  const db = await dbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function kvAll() {
  const db = await dbOpen();
  return new Promise((resolve, reject) => {
    const out = [];
    const cur = db.transaction('kv', 'readonly').objectStore('kv').openCursor();
    cur.onsuccess = () => {
      if (cur.result) { out.push([cur.result.key, cur.result.value]); cur.result.continue(); }
      else resolve(out);
    };
    cur.onerror = () => reject(cur.error);
  });
}

/* ------------------------------- state -------------------------------- */

const E = {
  api: null,          // (path, opts) => api json — injected
  base: '',
  userId: '',
  status: 'off',      // off | locked | ready
  dhPriv: null, sigPriv: null,
  pubs: null,         // { dhPub, sigPub }
  chatKeys: new Map(),    // `${chatId}|${epoch}` -> Uint8Array raw key
  keyImports: new Map(),  // same -> CryptoKey
  pubCache: new Map(),    // userId -> {dhPub, sigPub, dhHash}
  stateCache: new Map(),  // chatId -> {ts, state} (short-lived)
  ensuredChats: new Set(),// chats whose current epoch is usable by us
};

export const status = () => E.status;
export const isReady = () => E.status === 'ready';
export const myFingerprint = async () =>
  E.pubs ? C.fmtFingerprint(await C.dhHashOf(E.pubs.dhPub)) : null;

const ID_KEY = () => `id|${E.base}|${E.userId}`;
const CK_KEY = (chatId, epoch) => `ck|${E.base}|${E.userId}|${chatId}|${epoch}`;

/** Boot: probe server identity + local keystore and settle into a status. */
export async function init({ api, base, userId }) {
  Object.assign(E, { api, base, userId, status: 'off', pubs: null, dhPriv: null, sigPriv: null });
  E.chatKeys.clear(); E.keyImports.clear(); E.pubCache.clear(); E.stateCache.clear(); E.ensuredChats.clear();
  let server = null;
  try { server = (await api('/api/e2ee/identity/me')).identity; } catch { server = null; }
  const local = await kvGet(ID_KEY()).catch(() => null);
  if (server && local && local.dhPub === server.dhPub) {
    try {
      E.dhPriv = await C.importDhPriv(local.dhPriv);
      E.sigPriv = await C.importSigPriv(local.sigPriv);
      E.pubs = { dhPub: server.dhPub, sigPub: server.sigPub };
      E.status = 'ready';
    } catch { E.status = 'locked'; }
  } else if (server && !local) {
    E.status = 'locked'; // this device doesn't hold the keys yet — transfer needed
  } else {
    // fresh: generate a brand-new identity and publish it
    try {
      const id = await C.genIdentity();
      const dhPub = await C.exportPub(id.dh.publicKey);
      const sigPub = await C.exportPub(id.sig.publicKey);
      await api('/api/e2ee/identity', { method: 'PUT', body: { dhPub, sigPub } });
      await kvSet(ID_KEY(), { dhPub, sigPub, dhPriv: await C.exportPrivJwk(id.dh.privateKey), sigPriv: await C.exportPrivJwk(id.sig.privateKey) });
      E.dhPriv = id.dh.privateKey; E.sigPriv = id.sig.privateKey;
      E.pubs = { dhPub, sigPub };
      E.status = 'ready';
    } catch { E.status = 'off'; }
  }
  return E.status;
}

/** After a successful transfer, import identity + chat keys and mark ready. */
async function adoptBundle(bundle) {
  const dhPub = bundle.dhPub, sigPub = bundle.sigPub;
  E.dhPriv = await C.importDhPriv(bundle.dhPriv);
  E.sigPriv = await C.importSigPriv(bundle.sigPriv);
  E.pubs = { dhPub, sigPub };
  await kvSet(ID_KEY(), { dhPub, sigPub, dhPriv: bundle.dhPriv, sigPriv: bundle.sigPriv });
  for (const ch of bundle.chats || []) {
    for (const ep of ch.epochs || []) {
      const raw = C.b64decode(ep.key);
      E.chatKeys.set(`${ch.chatId}|${ep.epoch}`, raw);
      await kvSet(CK_KEY(ch.chatId, ep.epoch), ep.key);
    }
  }
  E.status = 'ready';
}

/** Create the local part of a fresh identity WITHOUT touching history keys. */
export async function rekeyIdentity() {
  const id = await C.genIdentity();
  const dhPub = await C.exportPub(id.dh.publicKey);
  const sigPub = await C.exportPub(id.sig.publicKey);
  await api('/api/e2ee/identity', { method: 'PUT', body: { dhPub, sigPub } });
  await kvSet(ID_KEY(), { dhPub, sigPub, dhPriv: await C.exportPrivJwk(id.dh.privateKey), sigPriv: await C.exportPrivJwk(id.sig.privateKey) });
  E.dhPriv = id.dh.privateKey; E.sigPriv = id.sig.privateKey;
  E.pubs = { dhPub, sigPub };
  E.status = 'ready';
  E.ensuredChats.clear(); E.stateCache.clear();
}

/* --------------------------- public key directory --------------------------- */

async function pubsFor(userIds) {
  const miss = userIds.filter((id) => !E.pubCache.has(id));
  if (miss.length) {
    const { keys } = await E.api(`/api/e2ee/identity?ids=${miss.map(encodeURIComponent).join(',')}`);
    for (const id of miss) E.pubCache.set(id, keys[id] || null);
  }
  return Object.fromEntries(userIds.map((id) => [id, E.pubCache.get(id) || null]));
}

/** A peer rotated/reset their identity: drop caches so the next send re-keys. */
export function invalidateUser(userId) {
  E.pubCache.delete(userId);
  E.stateCache.clear();
  E.ensuredChats.clear();
}

/** Fingerprint of any user's current identity (for the verify screen). */
export async function fingerprintOf(userId) {
  if (userId === E.userId) return myFingerprint();
  const pubs = await pubsFor([userId]);
  return pubs[userId] ? C.fmtFingerprint(pubs[userId].dhHash) : null;
}

/* ------------------------------ chat keys ------------------------------ */

async function keyState(chatId, force = false) {
  const hit = E.stateCache.get(chatId);
  if (hit && !force && Date.now() - hit.ts < 15000) return hit.state;
  const state = await E.api(`/api/e2ee/chats/${encodeURIComponent(chatId)}/keys`);
  E.stateCache.set(chatId, { ts: Date.now(), state });
  return state;
}

const wrapRowToRaw = async (chatId, row, peerPub) =>
  C.unwrapChatKey(E.dhPriv, await C.importDhPub(peerPub), row.wrapped, row.wiv,
    { chatId, epoch: row.epoch, fromId: row.wrappedBy, toId: E.userId });

/** Ensure we hold the raw key for one epoch (unwrap from server storage or IndexedDB). */
async function rawKeyFor(chatId, epoch) {
  const tag = `${chatId}|${epoch}`;
  if (E.chatKeys.has(tag)) return E.chatKeys.get(tag);
  const disk = await kvGet(CK_KEY(chatId, epoch)).catch(() => null);
  if (disk) {
    const raw = C.b64decode(disk);
    E.chatKeys.set(tag, raw);
    return raw;
  }
  const state = await keyState(chatId);
  const row = state.keys.find((k) => k.epoch === epoch);
  if (!row) return null;
  const pubs = await pubsFor([row.wrappedBy]);
  const by = pubs[row.wrappedBy];
  if (!by) return null;
  const raw = await wrapRowToRaw(chatId, row, by.dhPub);
  if (!raw) return null;
  E.chatKeys.set(tag, raw);
  kvSet(CK_KEY(chatId, epoch), C.b64encode(raw)).catch(() => {});
  return raw;
}

async function cryptoKeyFor(chatId, epoch) {
  const tag = `${chatId}|${epoch}`;
  if (E.keyImports.has(tag)) return E.keyImports.get(tag);
  const raw = await rawKeyFor(chatId, epoch);
  if (!raw) return null;
  const key = await C.importChatKey(raw);
  E.keyImports.set(tag, key);
  return key;
}

/**
 * Make sure a DM is key-ready for sending: create epoch 1 when possible,
 * re-key from scratch when any member identity rotated. Returns
 * { e2ee, epoch } — e2ee=false means "send plaintext" (peer has no identity).
 */
export async function ensureChatReady(chat, { forceRefresh = false } = {}) {
  if (chat.type !== 'dm' || !isReady()) return { e2ee: false };
  if (!forceRefresh && E.ensuredChats.has(chat.id)) {
    const st = await keyState(chat.id);
    return { e2ee: true, epoch: st.currentEpoch };
  }
  const memberIds = chat.members.map((m) => m.id);
  const pubs = await pubsFor(memberIds);
  const everyoneKeyed = memberIds.every((id) => pubs[id]);
  if (!everyoneKeyed) return { e2ee: false }; // still a plaintext DM

  const state = await keyState(chat.id, true);

  // identity churn? re-key with a FRESH chat key in a new epoch
  const staleWrap = state.e2ee && !state.keys.length; // wrapped to an identity I no longer hold
  const needRekey = state.e2ee && (staleWrap || !(await cryptoKeyFor(chat.id, state.currentEpoch)));
  if (state.e2ee && !needRekey) {
    E.ensuredChats.add(chat.id);
    return { e2ee: true, epoch: state.currentEpoch };
  }
  const epoch = state.currentEpoch + 1;
  const chatKey = C.genChatKey(); // fresh key: rekey restores security without recovering history keys
  const wraps = [];
  for (const id of memberIds) {
    const w = await C.wrapChatKey(E.dhPriv, await C.importDhPub(pubs[id].dhPub), chatKey,
      { chatId: chat.id, epoch, fromId: E.userId, toId: id });
    wraps.push({ user: id, ...w });
  }
  await E.api(`/api/e2ee/chats/${encodeURIComponent(chat.id)}/keys`, { method: 'POST', body: { epoch, wraps } });
  E.chatKeys.set(`${chat.id}|${epoch}`, chatKey);
  kvSet(CK_KEY(chat.id, epoch), C.b64encode(chatKey)).catch(() => {});
  E.stateCache.delete(chat.id);
  E.ensuredChats.add(chat.id);
  return { e2ee: true, epoch };
}

/** Encrypt an outgoing DM message. Throws when encryption is mandatory but impossible. */
export async function encryptOutgoing(chat, text) {
  const { e2ee, epoch } = await ensureChatReady(chat);
  if (!e2ee) return null; // plaintext send
  const key = await cryptoKeyFor(chat.id, epoch);
  if (!key) throw new Error('No usable chat key on this device');
  const env = await C.encryptMessage(key, text, { chatId: chat.id, epoch });
  const sig = await C.signEnvelope(E.sigPriv, { chatId: chat.id, kid: epoch, ...env });
  return { enc: 1, kid: epoch, ...env, sig };
}

/** Re-encrypt for an edit of an already-encrypted message (same epoch). */
export async function encryptEdit(chat, msg, text) {
  const key = await cryptoKeyFor(chat.id, msg.kid);
  if (!key) throw new Error('No usable chat key on this device');
  const env = await C.encryptMessage(key, text, { chatId: chat.id, epoch: msg.kid });
  const sig = await C.signEnvelope(E.sigPriv, { chatId: chat.id, kid: msg.kid, ...env });
  return { enc: 1, ...env, sig };
}

/** Decrypt a batch of message payloads in place (adds `_pt`), tolerating failures. */
export async function decryptInto(chatId, messages) {
  const enc = (messages || []).filter((m) => m && m.enc);
  if (!enc.length) return;
  if (!isReady()) { enc.forEach((m) => { m._pt = null; m._locked = true; }); return; }
  // batch-fetch author identity keys for signature verification (best effort)
  const authorIds = [...new Set(enc.map((m) => m.author?.id).filter(Boolean))];
  const pubs = await pubsFor(authorIds).catch(() => ({}));
  for (const m of enc) {
    try {
      const key = await cryptoKeyFor(chatId, m.kid);
      m._pt = key ? await C.decryptMessage(key, m.iv, m.content, { chatId, epoch: m.kid }) : null;
      const ap = pubs[m.author?.id];
      m._verified = m._pt != null && ap ? await C.verifyEnvelope(ap.sigPub, { chatId, kid: m.kid, iv: m.iv, ct: m.content }, m.sig) : null;
    } catch { m._pt = null; }
    if (m._pt === null) m._locked = true;
  }
}

/* ------------------------------ files ------------------------------ */

/** Encrypt an outgoing attachment (+its caption) for a DM. null = send plaintext. */
export async function encryptFile(chat, bytesU8, caption) {
  if (chat.type !== 'dm') return null;
  const { e2ee, epoch } = await ensureChatReady(chat);
  if (!e2ee) {
    if (chat.e2ee) throw new Error('Encryption keys unavailable for this chat');
    return null; // plaintext DM attachment
  }
  const key = await cryptoKeyFor(chat.id, epoch);
  if (!key) throw new Error('No usable chat key on this device');
  const f = await C.encryptFileBytes(key, bytesU8, { chatId: chat.id, epoch });
  const cap = await C.encryptMessage(key, caption ?? '', { chatId: chat.id, epoch });
  const csig = await C.signEnvelope(E.sigPriv, { chatId: chat.id, kid: epoch, iv: cap.iv, ct: cap.ct });
  return { kid: epoch, fiv: f.iv, ctBytes: f.ct, civ: cap.iv, cct: cap.ct, csig };
}

/** Decrypt downloaded attachment bytes for a message (null = unable). */
export async function decryptFile(msg, bytesU8) {
  const key = await cryptoKeyFor(msg.chatId, msg.kid);
  if (!key) return null;
  return C.decryptFileBytes(key, msg.file.fiv, bytesU8, { chatId: msg.chatId, epoch: msg.kid });
}

/* ------------------------------ transfers ------------------------------ */

/** New device: create a request; returns {id, code, done:Promise<bool>}. */
export async function transferRequest({ onAnswered, onDeclined } = {}) {
  const pair = await C.genTransferPair();
  const ephPub = await C.exportPub(pair.publicKey);
  const { request } = await E.api('/api/e2ee/transfers', { method: 'POST', body: { ephPub } });
  const code = await C.sasCode(ephPub);
  let stopped = false;
  const finish = async (req) => {
    if (!req || req.status !== 'answered' || !req.payload) return false;
    // the sealing device is "this account"'s published identity
    const me = (await E.api('/api/e2ee/identity/me')).identity;
    const key = await C.transferKeyForNew(pair.privateKey, me.dhPub, ephPub);
    const bundle = await C.openTransferPayload(key, req.payload, req.piv);
    if (!bundle) return false;
    await adoptBundle(bundle);
    return true;
  };
  const poll = async () => {
    while (!stopped) {
      try {
        const { request: req } = await E.api(`/api/e2ee/transfers/${request.id}`);
        if (!req) return onDeclined?.();
        if (req.status === 'answered') { await finish(req) ? onAnswered?.() : onDeclined?.(); return; }
        if (req.status === 'declined') { onDeclined?.(); return; }
      } catch { /* transient */ }
      await new Promise((r) => setTimeout(r, 2500));
    }
  };
  const done = poll();
  return {
    id: request.id,
    code,
    ephPub,
    expiresAt: request.expiresAt,
    stop: () => { stopped = true; },
    abort: async () => { stopped = true; try { await E.api(`/api/e2ee/transfers/${request.id}/decline`, { method: 'POST' }); } catch {} },
    done,
  };
}

/** Old device: seal our whole key ring for the requesting device. */
export async function transferApprove(request) {
  if (!isReady()) throw new Error('This device does not hold the keys');
  // rebuild the payload from IndexedDB so nothing relies on memory state
  const chats = new Map();
  const prefix = `ck|${E.base}|${E.userId}|`;
  for (const [k, v] of await kvAll().catch(() => [])) {
    const ks = String(k);
    if (!ks.startsWith(prefix)) continue;
    const rest = ks.slice(prefix.length);
    const idx = rest.lastIndexOf('|');
    const chatId = rest.slice(0, idx), epoch = Number(rest.slice(idx + 1));
    if (!Number.isInteger(epoch)) continue;
    if (!chats.has(chatId)) chats.set(chatId, []);
    chats.get(chatId).push({ epoch, key: v });
  }
  // don't forget keys that only live in memory right now
  for (const [tag, raw] of E.chatKeys) {
    const idx = tag.lastIndexOf('|');
    const chatId = tag.slice(0, idx), epoch = Number(tag.slice(idx + 1));
    if (!chats.has(chatId)) chats.set(chatId, []);
    if (!chats.get(chatId).some((e) => e.epoch === epoch)) chats.get(chatId).push({ epoch, key: C.b64encode(raw) });
  }
  const bundle = {
    v: 1,
    dhPub: E.pubs.dhPub,
    sigPub: E.pubs.sigPub,
    dhPriv: await C.exportPrivJwk(E.dhPriv),
    sigPriv: await C.exportPrivJwk(E.sigPriv),
    chats: [...chats.entries()].map(([chatId, epochs]) => ({ chatId, epochs: epochs.sort((a, b) => a.epoch - b.epoch) })),
  };
  const key = await C.transferKeyForOld(E.dhPriv, request.ephPub);
  const sealed = await C.sealTransferPayload(key, bundle);
  await E.api(`/api/e2ee/transfers/${request.id}/answer`, { method: 'POST', body: sealed });
}

export const transferDecline = (requestId) =>
  E.api(`/api/e2ee/transfers/${requestId}/decline`, { method: 'POST' });

export const pendingTransfers = () => E.api('/api/e2ee/transfers');

export { C as core };
