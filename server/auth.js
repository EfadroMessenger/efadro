import jwt from 'jsonwebtoken';
import * as store from './store.js';
import { HttpError, roleLevel } from './util.js';

/** Access token bound to the user's token_version so it dies on ban/kick/password change. */
export function signAccessToken(user, cfg) {
  const days = Number(cfg.tokenExpiryDays) > 0 ? Number(cfg.tokenExpiryDays) : 7;
  return jwt.sign(
    { sub: user.id, tv: user.token_version, type: 'access' },
    cfg.jwtSecret,
    { expiresIn: `${days}d` },
  );
}

/** Short-lived "gate" token proving the caller passed captcha + server password. */
export function signGateToken(cfg) {
  return jwt.sign({ type: 'gate' }, cfg.jwtSecret, { expiresIn: '10m' });
}

export function verifyToken(token, cfg) {
  try {
    return jwt.verify(String(token || ''), cfg.jwtSecret);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** Require a gate token (captcha + server password already passed). */
export function requireGate(cfg) {
  return (req, res, next) => {
    const payload = verifyToken(bearer(req), cfg);
    if (!payload || payload.type !== 'gate') {
      return next(new HttpError(401, 'Access gate required: complete captcha / server password first', { code: 'gate' }));
    }
    next();
  };
}

/** Require a valid access token; loads a fresh user row and rejects banned users. */
export function requireAuth(cfg) {
  return (req, res, next) => {
    const payload = verifyToken(bearer(req), cfg);
    if (!payload || payload.type !== 'access') {
      return next(new HttpError(401, 'Authentication required', { code: 'auth' }));
    }
    const user = store.getUserById(payload.sub);
    if (!user) return next(new HttpError(401, 'Account no longer exists', { code: 'auth' }));
    if (user.token_version !== payload.tv) {
      return next(new HttpError(401, 'Session expired, please sign in again', { code: 'auth' }));
    }
    if (user.banned) {
      return next(new HttpError(403, 'This account is banned', { code: 'banned', reason: user.ban_reason }));
    }
    req.user = user;
    next();
  };
}

/** Require at least the given role (roleLevel(minRole)). */
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required', { code: 'auth' }));
    if (roleLevel(req.user.role) < roleLevel(minRole)) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }
    next();
  };
}

/** Authenticate a WS connection from its query-string token. Returns user or null. */
export function authenticateWs(token, cfg) {
  const payload = verifyToken(token, cfg);
  if (!payload || payload.type !== 'access') return null;
  const user = store.getUserById(payload.sub);
  if (!user || user.token_version !== payload.tv || user.banned) return null;
  return user;
}
