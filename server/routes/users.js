import { Router } from 'express';
import * as store from '../store.js';
import { requireAuth } from '../auth.js';

export function usersRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));

  r.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 1 || q.length > 64) return res.json({ users: [] });
    const users = store.searchUsers(q, 20, req.user.id).map((u) => ({
      ...store.publicUser(u),
      online: hub.online(u.id),
    }));
    res.json({ users });
  });

  r.get('/:id/profile', (req, res) => {
    const u = store.getUserById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { ...store.publicUser(u), online: hub.online(u.id) } });
  });

  return r;
}
