import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = undefined) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const ROLE_LEVEL = { user: 0, moderator: 1, admin: 2, owner: 3 };
export const roleLevel = (r) => ROLE_LEVEL[r] ?? 0;
export const isValidRole = (r) => r in ROLE_LEVEL;

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

// Wrap async route handlers so rejections reach the error middleware.
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate and normalize a string field. Throws HttpError(400) on failure. */
export function vStr(value, { label = 'value', min = 0, max = 1024, re = null, reMsg = '', optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw new HttpError(400, `${label} is required`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be a string`);
  const s = value.trim();
  if (s.length < min) throw new HttpError(400, `${label} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`);
  if (re && !re.test(s)) throw new HttpError(400, reMsg || `${label} has an invalid format`);
  return s;
}

export function vInt(value, { label = 'value', min = -Infinity, max = Infinity, def = undefined } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new HttpError(400, `${label} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new HttpError(400, `${label} must be an integer`);
  if (n < min) throw new HttpError(400, `${label} must be >= ${min}`);
  if (n > max) throw new HttpError(400, `${label} must be <= ${max}`);
  return n;
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function safeEq(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const AVATAR_PALETTE = [
  '#6366f1', '#22d3ee', '#f472b6', '#34d399', '#fbbf24',
  '#f87171', '#a78bfa', '#2dd4bf', '#fb923c', '#60a5fa',
];
export function avatarColorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** Simple in-memory sliding-window rate limiter middleware factory. */
export function makeLimiter({ windowMs = 60000, max = 60, keyFn = (req) => req.ip, message = 'Too many requests, slow down', enabled = true } = {}) {
  const hits = new Map(); // key -> [timestamps]
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(k); else hits.set(k, kept);
    }
  }, Math.max(windowMs, 30000));
  timer.unref?.();
  return (req, res, next) => {
    if (!enabled) return next();
    const k = keyFn(req);
    const cutoff = Date.now() - windowMs;
    const arr = (hits.get(k) || []).filter((t) => t > cutoff);
    if (arr.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    arr.push(Date.now());
    hits.set(k, arr);
    next();
  };
}

/** Server-side verification of a Cloudflare Turnstile token. */
export async function verifyTurnstile(secretKey, token, remoteIp) {
  if (!token || typeof token !== 'string') return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal,
    });
    const j = await r.json();
    return Boolean(j?.success);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export const maskSecret = (s) => (s ? String(s).slice(0, 4) + '•'.repeat(10) : '');

/* ============================ TOTP (RFC 6238) ============================ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new 160-bit TOTP shared secret (base32). */
export function genTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBytes, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBytes).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

export function totpCode(secretB32, offsetSteps = 0, at = Date.now()) {
  const counter = Math.floor(at / 30000) + offsetSteps;
  return hotp(base32Decode(secretB32), counter);
}

/** Verify a TOTP code with ±window 30s steps of clock drift. */
export function totpVerify(secretB32, code, window = 1) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (let i = -window; i <= window; i++) {
    if (safeEq(totpCode(secretB32, i), clean)) return true;
  }
  return false;
}

export function otpauthUrl({ issuer, account, secret }) {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(account)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ------------------------------ backup codes ------------------------------ */

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no i/l/o/0/1 — readable when typed

export function genBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    let raw = '';
    for (let j = 0; j < 12; j++) raw += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return codes;
}

export const hashBackupCode = (code) =>
  crypto.createHash('sha256').update(String(code).toLowerCase().trim()).digest('hex');
