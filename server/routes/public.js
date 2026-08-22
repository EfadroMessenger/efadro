import { Router } from 'express';
import { asyncH, makeLimiter, safeEq, verifyTurnstile } from '../util.js';
import { signGateToken } from '../auth.js';
import { turnstileEffective } from '../config.js';

export const APP_VERSION = '1.8.1';

export function publicInfo(cfg) {
  const ts = turnstileEffective(cfg);
  return {
    product: 'efadro',
    version: APP_VERSION,
    name: cfg.serverName,
    turnstile: { enabled: ts, siteKey: ts ? cfg.turnstile.siteKey : '' },
    serverPasswordRequired: Boolean(cfg.serverPassword),
    registrationEnabled: Boolean(cfg.registration?.enabled),
    callsEnabled: cfg.calls?.enabled !== false,
    limits: {
      maxMessageLength: cfg.limits?.maxMessageLength ?? 4000,
      maxFileSizeMb: cfg.uploads?.maxFileSizeMb ?? 25,
    },
  };
}

/**
 * Public endpoints every client hits before authentication:
 *   GET  /api/info  — what gates does this server require?
 *   POST /api/gate  — pass captcha + server password, receive a short-lived gate token
 */
export function publicRouter(cfg) {
  const r = Router();
  const gateLimiter = makeLimiter({
    windowMs: cfg.rateLimit?.windowMs ?? 60000,
    max: cfg.rateLimit?.authPerMinute ?? 20,
    message: 'Too many attempts, try again later',
    enabled: cfg.rateLimit?.enabled !== false,
  });

  r.get('/info', (req, res) => res.json(publicInfo(cfg)));

  r.post('/gate', gateLimiter, asyncH(async (req, res) => {
    const { serverPassword = '', turnstileToken = '' } = req.body || {};

    if (turnstileEffective(cfg)) {
      const ok = await verifyTurnstile(cfg.turnstile.secretKey, turnstileToken, req.ip);
      if (!ok) return res.status(403).json({ error: 'Captcha verification failed, please retry', code: 'captcha' });
    }
    if (cfg.serverPassword) {
      if (!safeEq(serverPassword, cfg.serverPassword)) {
        return res.status(403).json({ error: 'Incorrect server password', code: 'password' });
      }
    }
    res.json({ gateToken: signGateToken(cfg), info: publicInfo(cfg) });
  }));

  return r;
}
