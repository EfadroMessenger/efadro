import { Router } from 'express';
import * as store from '../store.js';
import * as services from '../services.js';
import { requireAuth } from '../auth.js';

export function usersRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));

  r.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 1 || q.length > 64) return res.json({ users: [] });
    // users who blocked the searcher never show up for them
    const users = store.searchUsers(q, 20, req.user.id).map((u) => ({
      ...store.publicUser(u),
      online: hub.online(u.id),
    }));
    res.json({ users });
  });

  /** Everyone I've blocked (Settings → Privacy). Kept before /:id routes. */
  r.get('/blocks', (req, res) => {
    res.json({ users: services.listBlockedUsersAs(req.user) });
  });

  r.post('/:id/block', (req, res) => {
    res.json(services.blockUserAs(req.user, req.params.id, hub));
  });

  r.delete('/:id/block', (req, res) => {
    res.json(services.unblockUserAs(req.user, req.params.id, hub));
  });

  r.get('/:id/profile', (req, res) => {
    const u = store.getUserById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        ...store.publicUser(u),
        online: hub.online(u.id),
        blocked: store.isBlocked(req.user.id, u.id), // my own block state, never theirs
      },
    });
  });

  return r;
}
