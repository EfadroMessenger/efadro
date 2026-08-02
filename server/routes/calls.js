import { Router } from 'express';
import { requireAuth } from '../auth.js';

/**
 * Call settings for authenticated clients: whether calls are on and which ICE
 * servers WebRTC should use (STUN/TURN). TURN credentials belong in config.json.
 */
export function callsRouter(cfg) {
  const r = Router();
  r.use(requireAuth(cfg));

  r.get('/config', (req, res) => {
    const servers = Array.isArray(cfg.calls?.iceServers) ? cfg.calls.iceServers : [];
    res.json({
      enabled: cfg.calls?.enabled !== false,
      ringTimeoutSec: Number(cfg.calls?.ringTimeoutSec) || 45,
      iceServers: servers
        .filter((s) => s && s.urls)
        .map((s) => ({
          urls: s.urls,
          ...(s.username ? { username: String(s.username) } : {}),
          ...(s.credential ? { credential: String(s.credential) } : {}),
        })),
    });
  });

  return r;
}
