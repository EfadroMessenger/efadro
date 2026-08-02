/* efadro E2EE crypto core — pure WebCrypto, no DOM, no Node APIs.
 * Imported by the web client (app.js) AND by scripts/smoke.mjs (Node ≥ 19
 * exposes the same globalThis.crypto.subtle), so test math == client math.
 *
 * Protocol v1
 *  - identity: ECDH P-256 (key agreement) + ECDSA P-256 (signing)
 *  - chat key: random 256-bit AES-GCM key, per chat, versioned by epoch
 *  - key wrap: ECDH(own dh, peer dh) -> HKDF-SHA256 -> AES-GCM wrap, random IV
 *  - message:  AES-GCM(chatKey, random IV) + AAD(chatId:epoch)
 *  - signature: ECDSA/SHA-256 over the envelope (server verifies it too)
 *  - device transfer: ephemeral ECDH + SAS (short authentication string)
 */

const te = new TextEncoder();
const td = new TextDecoder();
export const subtle = globalThis.crypto.subtle;

/* ------------------------------- base64 ------------------------------- */

export function b64encode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/* ------------------------------ identity ------------------------------ */

export async function genIdentity() {
  const dh = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sig = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { dh, sig };
}

export const exportPub = async (key) => b64encode(await subtle.exportKey('spki', key));
export const exportPrivJwk = (key) => subtle.exportKey('jwk', key);

export const importDhPub = (b64) =>
  subtle.importKey('spki', b64decode(b64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
export const importDhPriv = (jwk) =>
  subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
export const importSigPub = (b64) =>
  subtle.importKey('spki', b64decode(b64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
export const importSigPriv = (jwk) =>
  subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);

export async function sha256Hex(bytes) {
  const h = await subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : utf8(String(bytes)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Matches server identityFingerprint(): sha256 hex of the SPKI bytes. */
export const dhHashOf = (dhPubB64) => sha256Hex(b64decode(dhPubB64));

/** Human fingerprint: "3F9A 02C1 77BE …" (first 24 hex chars). */
export const fmtFingerprint = (hex) => hex.slice(0, 24).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

/* --------------------------- key agreement ---------------------------- */

const ecdhBits = (priv, pub) => subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);

async function hkdfAesKey(sharedBits, salt, info) {
  const ikm = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(salt), info: utf8(info) },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/* --------------------------- chat keys -------------------------------- */

export const genChatKey = () => randomBytes(32);

export const importChatKey = (bytes) =>
  subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

const wrapSalt = (chatId, epoch, fromId, toId) => `efadro|${[fromId, toId].sort().join('|')}|${chatId}|${epoch}`;
const WRAP_INFO = 'efadro-wrap:v1';

/** Wrap a raw chat key for `toId`, deriving the wrap key via ECDH(me, them). */
export async function wrapChatKey(myDhPriv, theirDhPub, chatKeyBytes, { chatId, epoch, fromId, toId }) {
  const key = await hkdfAesKey(await ecdhBits(myDhPriv, theirDhPub), wrapSalt(chatId, epoch, fromId, toId), WRAP_INFO);
  const wiv = randomBytes(12);
  const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv: wiv }, key, chatKeyBytes);
  return { wrapped: b64encode(wrapped), wiv: b64encode(wiv) };
}

/** Undo wrapChatKey — the math is symmetric since both sides derive the same secret. */
export async function unwrapChatKey(myDhPriv, theirDhPub, wrappedB64, wivB64, ctx) {
  const key = await hkdfAesKey(await ecdhBits(myDhPriv, theirDhPub), wrapSalt(ctx.chatId, ctx.epoch, ctx.fromId, ctx.toId), WRAP_INFO);
  try {
    const raw = await subtle.decrypt({ name: 'AES-GCM', iv: b64decode(wivB64) }, key, b64decode(wrappedB64));
    return new Uint8Array(raw);
  } catch { return null; }
}

/* ----------------------------- messages ------------------------------- */

const msgAad = (chatId, epoch) => utf8(`m:${chatId}:${epoch}`);

export async function encryptMessage(chatKey, text, { chatId, epoch }) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: msgAad(chatId, epoch) }, chatKey, utf8(text));
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptMessage(chatKey, ivB64, ctB64, { chatId, epoch }) {
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(ivB64), additionalData: msgAad(chatId, epoch) },
      chatKey, b64decode(ctB64),
    );
    return fromUtf8(pt);
  } catch { return null; }
}

/** Signed bytes — MUST stay byte-identical to server/services.js signedMessageBytes(). */
export const signedEnvelopeBytes = ({ chatId, kid, iv, ct }) =>
  utf8(`efadro-msg:v1\n${chatId}\n${kid}\n${iv}\n${ct}`);

export async function signEnvelope(sigPriv, envelope) {
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sigPriv, signedEnvelopeBytes(envelope));
  return b64encode(sig);
}

export async function verifyEnvelope(sigPubB64, envelope, sigB64) {
  try {
    const pub = await importSigPub(sigPubB64);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64decode(sigB64), signedEnvelopeBytes(envelope));
  } catch { return false; }
}

/* ------------------------------ files ------------------------------- */

const fileAad = (chatId, epoch) => utf8(`f:${chatId}:${epoch}`);

/** Encrypt raw file bytes with the chat key. Returns raw ciphertext (no base64). */
export async function encryptFileBytes(chatKey, bytes, { chatId, epoch }) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: fileAad(chatId, epoch) }, chatKey, bytes);
  return { iv: b64encode(iv), ct: new Uint8Array(ct) };
}

export async function decryptFileBytes(chatKey, fivB64, ctBytes, { chatId, epoch }) {
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(fivB64), additionalData: fileAad(chatId, epoch) },
      chatKey, ctBytes,
    );
    return new Uint8Array(pt);
  } catch { return null; }
}

/* ------------------------- device-to-device transfer ------------------------- */

export const genTransferPair = () => subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);

/** Short authentication string shown on BOTH devices: sha256 of the ephemeral pub. */
export async function sasCode(ephPubB64) {
  const hex = await sha256Hex(b64decode(ephPubB64));
  return hex.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

const TRANSFER_INFO = 'efadro-device:v1';

/** Old device side: transfer key from its identity dh + the new device's ephemeral pub. */
export async function transferKeyForOld(myDhPriv, ephPubB64) {
  const ephPub = await importDhPub(ephPubB64);
  return hkdfAesKey(await ecdhBits(myDhPriv, ephPub), `efadro|transfer|${ephPubB64.slice(0, 32)}`, TRANSFER_INFO);
}

/** New device side: same key, derived from the ephemeral private key + old device pub. */
export async function transferKeyForNew(ephPriv, oldDhPubB64, ephPubB64) {
  const oldPub = await importDhPub(oldDhPubB64);
  return hkdfAesKey(await ecdhBits(ephPriv, oldPub), `efadro|transfer|${ephPubB64.slice(0, 32)}`, TRANSFER_INFO);
}

export async function sealTransferPayload(key, obj) {
  const piv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: piv }, key, utf8(JSON.stringify(obj)));
  return { payload: b64encode(ct), piv: b64encode(piv) };
}

export async function openTransferPayload(key, payloadB64, pivB64) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64decode(pivB64) }, key, b64decode(payloadB64));
    return JSON.parse(fromUtf8(pt));
  } catch { return null; }
}
