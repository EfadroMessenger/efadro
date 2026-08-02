import { Router } from 'express';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import * as store from '../store.js';
import {
  asyncH, makeLimiter, vStr, USERNAME_RE, HttpError,
  genTotpSecret, totpVerify, otpauthUrl, genBackupCodes, hashBackupCode,
} from '../util.js';
import { requireAuth, requireGate, signAccessToken } from '../auth.js';

const BCRYPT_ROUNDS = 12;

/** Short-lived token proving the password step passed; still needs the TOTP step. */
function sign2faToken(user, cfg) {
  return jwt.sign({ sub: user.id, tv: user.token_version, type: '2fa' }, cfg.jwtSecret, { expiresIn: '5m' });
}

function require2faPending(cfg) {
  return (req, res, next) => {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    let payload = null;
    try { payload = jwt.verify(token, cfg.jwtSecret); } catch { payload = null; }
    if (!payload || payload.type !== '2fa') {
      return next(new HttpError(401, 'Two-factor step required', { code: '2fa' }));
    }
    const user = store.getUserById(payload.sub);
    if (!user || user.token_version !== payload.tv || user.banned || !user.totp_secret) {
      return next(new HttpError(401, 'Two-factor step required', { code: '2fa' }));
    }
    req.user = user;
    next();
  };
}

/** Accept either a TOTP code or a one-time backup code (consumes the backup code). */
function verifyTotpOrBackup(user, code) {
  if (totpVerify(user.totp_secret, code)) return { ok: true, usedBackup: false };
  const hashes = JSON.parse(user.backup_codes || '[]');
  const h = hashBackupCode(code);
  const idx = hashes.indexOf(h);
  if (idx >= 0) {
    hashes.splice(idx, 1);
    store.updateUser(user.id, { backup_codes: JSON.stringify(hashes) });
    return { ok: true, usedBackup: true };
  }
  return { ok: false };
}

export function authRouter(cfg, hub) {
  const r = Router();
  const authLimiter = makeLimiter({
    windowMs: cfg.rateLimit?.windowMs ?? 60000,
    max: cfg.rateLimit?.authPerMinute ?? 20,
    message: 'Too many attempts, try again later',
    enabled: cfg.rateLimit?.enabled !== false,
  });

  r.post('/signup', authLimiter, requireGate(cfg), asyncH(async (req, res) => {
    if (!cfg.registration?.enabled) throw new HttpError(403, 'Registration is disabled on this server');
    const username = vStr(req.body?.username, {
      label: 'Username', min: 3, max: 24, re: USERNAME_RE,
      reMsg: 'Username may only contain letters, numbers and underscores (3–24 chars)',
    });
    const password = vStr(req.body?.password, { label: 'Password', min: 8, max: 128 });
    const displayName = vStr(req.body?.displayName, {
      label: 'Display name', min: 0, max: cfg.limits?.maxDisplayNameLength ?? 40, optional: true,
    }) || username;

    if (store.getUserByUsername(username)) throw new HttpError(409, 'This username is already taken');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = store.createUser({ username, displayName, passwordHash });
    store.audit(user.id, 'signup', user.id, { username });
    res.status(201).json({ token: signAccessToken(user, cfg), user: store.selfUser(user) });
  }));

  r.post('/login', authLimiter, requireGate(cfg), asyncH(async (req, res) => {
    const username = vStr(req.body?.username, { label: 'Username', min: 1, max: 24 });
    const password = vStr(req.body?.password, { label: 'Password', min: 1, max: 128 });
    const user = store.getUserByUsername(username);
    const ok = user && await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Invalid username or password');
    if (user.banned) {
      throw new HttpError(403, 'This account is banned', { code: 'banned', reason: user.ban_reason });
    }
    if (user.totp_secret) {
      // Password accepted — second factor still required.
      return res.json({ twoFactor: true, pendingToken: sign2faToken(user, cfg) });
    }
    store.touchLastSeen(user.id);
    res.json({ token: signAccessToken(user, cfg), user: store.selfUser(user) });
  }));

  r.post('/login/2fa', authLimiter, require2faPending(cfg), asyncH(async (req, res) => {
    const code = vStr(req.body?.code, { label: 'Code', min: 6, max: 20 });
    const result = verifyTotpOrBackup(req.user, code);
    if (!result.ok) throw new HttpError(401, 'Invalid verification code');
    store.touchLastSeen(req.user.id);
    res.json({
      token: signAccessToken(req.user, cfg),
      user: store.selfUser(store.getUserById(req.user.id)),
      usedBackupCode: result.usedBackup,
    });
  }));

  r.get('/me', requireAuth(cfg), (req, res) => {
    res.json({ user: store.selfUser(req.user) });
  });

  r.patch('/me', requireAuth(cfg), asyncH(async (req, res) => {
    const displayName = vStr(req.body?.displayName, {
      label: 'Display name', min: 1, max: cfg.limits?.maxDisplayNameLength ?? 40,
    });
    const user = store.updateUser(req.user.id, { display_name: displayName });
    hub.broadcast({ t: 'user:updated', data: { user: store.publicUser(user) } });
    res.json({ user: store.selfUser(user) });
  }));

  r.post('/change-password', authLimiter, requireAuth(cfg), asyncH(async (req, res) => {
    const current = vStr(req.body?.current, { label: 'Current password', min: 1, max: 128 });
    const next = vStr(req.body?.next, { label: 'New password', min: 8, max: 128 });
    const ok = await bcrypt.compare(current, req.user.password_hash);
    if (!ok) throw new HttpError(403, 'Current password is incorrect');
    const passwordHash = await bcrypt.hash(next, BCRYPT_ROUNDS);
    const user = store.updateUser(req.user.id, {
      password_hash: passwordHash,
      token_version: req.user.token_version + 1, // invalidate every other session
    });
    hub.forceLogoutUser(user.id, 'Password changed');
    store.audit(user.id, 'password_change', user.id);
    res.json({ token: signAccessToken(user, cfg), user: store.selfUser(user) });
  }));

  /* -------------------------- two-factor (TOTP) -------------------------- */

  // Step 1: create a pending secret and return it (+ QR code) for the authenticator app
  r.post('/2fa/setup', authLimiter, requireAuth(cfg), asyncH(async (req, res) => {
    if (req.user.totp_secret) throw new HttpError(400, 'Two-factor authentication is already enabled — disable it first');
    const secret = genTotpSecret();
    store.updateUser(req.user.id, { totp_pending: secret });
    const url = otpauthUrl({ issuer: cfg.serverName || 'efadro', account: req.user.username, secret });
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 260, color: { dark: '#0b0d14', light: '#ffffff' } });
    res.json({ secret, url, qr });
  }));

  // Step 2: prove the app is linked, then persist the secret and issue backup codes
  r.post('/2fa/enable', authLimiter, requireAuth(cfg), asyncH(async (req, res) => {
    if (!req.user.totp_pending) throw new HttpError(400, 'Call /2fa/setup first');
    const code = vStr(req.body?.code, { label: 'Code', min: 6, max: 10 });
    if (!totpVerify(req.user.totp_pending, code)) throw new HttpError(400, 'Invalid code — check your authenticator app and try again');
    const backupCodes = genBackupCodes(8);
    store.updateUser(req.user.id, {
      totp_secret: req.user.totp_pending,
      totp_pending: null,
      backup_codes: JSON.stringify(backupCodes.map(hashBackupCode)),
    });
    store.audit(req.user.id, '2fa_enable', req.user.id);
    res.json({ backupCodes, user: store.selfUser(store.getUserById(req.user.id)) });
  }));

  // Disable with password + current TOTP code (defense in depth)
  r.post('/2fa/disable', authLimiter, requireAuth(cfg), asyncH(async (req, res) => {
    if (!req.user.totp_secret) throw new HttpError(400, 'Two-factor authentication is not enabled');
    const password = vStr(req.body?.password, { label: 'Password', min: 1, max: 128 });
    const code = vStr(req.body?.code, { label: 'Code', min: 6, max: 20 });
    const ok = await bcrypt.compare(password, req.user.password_hash);
    if (!ok) throw new HttpError(403, 'Incorrect password');
    const result = verifyTotpOrBackup(req.user, code);
    if (!result.ok) throw new HttpError(401, 'Invalid verification code');
    store.updateUser(req.user.id, { totp_secret: null, totp_pending: null, backup_codes: '[]' });
    store.audit(req.user.id, '2fa_disable', req.user.id);
    res.json({ user: store.selfUser(store.getUserById(req.user.id)) });
  }));

  // Regenerate backup codes (requires a fresh TOTP code)
  r.post('/2fa/backup-codes', authLimiter, requireAuth(cfg), asyncH(async (req, res) => {
    if (!req.user.totp_secret) throw new HttpError(400, 'Two-factor authentication is not enabled');
    const code = vStr(req.body?.code, { label: 'Code', min: 6, max: 10 });
    if (!totpVerify(req.user.totp_secret, code)) throw new HttpError(401, 'Invalid verification code');
    const backupCodes = genBackupCodes(8);
    store.updateUser(req.user.id, { backup_codes: JSON.stringify(backupCodes.map(hashBackupCode)) });
    store.audit(req.user.id, '2fa_backup_regen', req.user.id);
    res.json({ backupCodes, user: store.selfUser(store.getUserById(req.user.id)) });
  }));

  return r;
}
