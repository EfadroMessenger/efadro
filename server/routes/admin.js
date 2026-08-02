import { Router } from 'express';
import * as store from '../store.js';
import { saveConfig } from '../config.js';
import crypto from 'node:crypto';
import { asyncH, vStr, HttpError, roleLevel, isValidRole, maskSecret, now } from '../util.js';
import { requireAuth, requireRole } from '../auth.js';

/**
 * Moderation API. Role hierarchy: owner(3) > admin(2) > moderator(1) > user(0).
 * Every action enforces: actor's role must be strictly above the target's role,
 * plus action-specific minimums:
 *   moderator+ : view users, mute/unmute, kick (force logout), view reports, stats
 *   admin+     : ban/unban, set roles up to moderator, resolve reports, audit log
 *   owner      : set any role, edit server config (config.json), rotate JWT secret
 */
export function adminRouter(cfg, hub, publicInfoFn) {
  const r = Router();
  r.use(requireAuth(cfg), requireRole('moderator'));

  const bootstrapOwner = () => store.getUserByUsername(cfg.owner?.username || '');

  function targetUser(id) {
    const u = store.getUserById(id);
    if (!u) throw new HttpError(404, 'User not found');
    return u;
  }

  function assertCanManage(actor, target) {
    if (actor.id === target.id) throw new HttpError(400, 'You cannot perform this action on yourself');
    // Strictly-lower-role targets only — except owners, who may manage other (non-bootstrap) owners.
    if (roleLevel(actor.role) <= roleLevel(target.role) && roleLevel(actor.role) < 3) {
      throw new HttpError(403, 'You can only manage users with a lower role than yours');
    }
  }

  function assertNotBootstrapOwner(target) {
    const bo = bootstrapOwner();
    if (bo && bo.id === target.id) {
      throw new HttpError(403, 'The bootstrap owner (from config.json) cannot be modified. Change it via the config file.');
    }
  }

  function notifySelf(target) {
    hub.sendToUser(target.id, { t: 'user:self', data: { user: store.selfUser(target) } });
  }

  /* ------------------------------ overview ------------------------------ */

  r.get('/stats', (req, res) => {
    const s = store.stats();
    s.online = hub.onlineCount();
    res.json({ stats: s });
  });

  /* ------------------------------- users ------------------------------- */

  r.get('/users', (req, res) => {
    const q = String(req.query.q || '').slice(0, 64);
    const users = store.listUsers({ q }).map((u) => ({
      ...store.adminUser(u),
      online: hub.online(u.id),
      isBootstrapOwner: bootstrapOwner()?.id === u.id,
    }));
    res.json({ users, myRole: req.user.role });
  });

  r.patch('/users/:id/role', requireRole('admin'), asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    const role = String(req.body?.role || '');
    if (!isValidRole(role)) throw new HttpError(400, 'Invalid role');
    assertCanManage(req.user, target);
    const meLvl = roleLevel(req.user.role);
    if (roleLevel(role) > meLvl || (roleLevel(role) === meLvl && meLvl < 3)) {
      throw new HttpError(403, 'You cannot grant a role equal or higher than your own');
    }
    if (roleLevel(target.role) >= roleLevel(role) && target.role === role) {
      return res.json({ user: { ...store.adminUser(target), online: hub.online(target.id) } });
    }
    if (target.id === bootstrapOwner()?.id && roleLevel(role) < 3) assertNotBootstrapOwner(target); // demotion of bootstrap owner
    const updated = store.updateUser(target.id, { role });
    store.audit(req.user.id, 'role_change', target.id, { from: target.role, to: role });
    notifySelf(updated);
    res.json({ user: { ...store.adminUser(updated), online: hub.online(updated.id) } });
  }));

  r.post('/users/:id/ban', requireRole('admin'), asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    assertNotBootstrapOwner(target);
    assertCanManage(req.user, target);
    const reason = vStr(req.body?.reason, { label: 'Reason', min: 0, max: 300, optional: true });
    const updated = store.updateUser(target.id, {
      banned: 1, ban_reason: reason, banned_at: now(), token_version: target.token_version + 1,
    });
    store.audit(req.user.id, 'ban', target.id, { reason });
    hub.forceLogoutUser(target.id, 'You have been banned' + (reason ? `: ${reason}` : ''));
    res.json({ user: { ...store.adminUser(updated), online: false } });
  }));

  r.post('/users/:id/unban', requireRole('admin'), asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    assertCanManage(req.user, target);
    const updated = store.updateUser(target.id, { banned: 0, ban_reason: '', banned_at: 0 });
    store.audit(req.user.id, 'unban', target.id);
    res.json({ user: { ...store.adminUser(updated), online: hub.online(updated.id) } });
  }));

  r.post('/users/:id/mute', asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    assertNotBootstrapOwner(target);
    assertCanManage(req.user, target);
    const minutes = Math.min(Math.max(Number(req.body?.minutes) || 0, 1), 43200); // up to 30 days
    const reason = vStr(req.body?.reason, { label: 'Reason', min: 0, max: 300, optional: true });
    const updated = store.updateUser(target.id, { muted_until: now() + minutes * 60000, mute_reason: reason });
    store.audit(req.user.id, 'mute', target.id, { minutes, reason });
    notifySelf(updated);
    res.json({ user: { ...store.adminUser(updated), online: hub.online(updated.id) } });
  }));

  r.post('/users/:id/unmute', asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    assertCanManage(req.user, target);
    const updated = store.updateUser(target.id, { muted_until: 0, mute_reason: '' });
    store.audit(req.user.id, 'unmute', target.id);
    notifySelf(updated);
    res.json({ user: { ...store.adminUser(updated), online: hub.online(updated.id) } });
  }));

  r.post('/users/:id/kick', asyncH(async (req, res) => {
    const target = targetUser(req.params.id);
    assertCanManage(req.user, target);
    store.updateUser(target.id, { token_version: target.token_version + 1 });
    store.audit(req.user.id, 'kick', target.id);
    hub.forceLogoutUser(target.id, 'You were signed out by staff');
    res.json({ ok: true });
  }));

  /* ------------------------------ reports ------------------------------ */

  r.get('/reports', (req, res) => {
    res.json({ reports: store.listReports(200) });
  });

  r.post('/reports/:id/resolve', requireRole('moderator'), asyncH(async (req, res) => {
    const rep = store.getReport(Number(req.params.id));
    if (!rep) throw new HttpError(404, 'Report not found');
    store.resolveReport(rep.id, req.user.id);
    store.audit(req.user.id, 'report_resolve', String(rep.author_id), { reportId: rep.id });
    res.json({ ok: true });
  }));

  /* ------------------------------- audit ------------------------------- */

  r.get('/audit', requireRole('admin'), (req, res) => {
    res.json({ entries: store.listAudit(150) });
  });

  /* -------------------------- server config (owner) -------------------------- */

  r.get('/server/config', requireRole('owner'), (req, res) => {
    res.json({
      config: {
        serverName: cfg.serverName,
        serverPasswordSet: Boolean(cfg.serverPassword),
        registrationEnabled: Boolean(cfg.registration?.enabled),
        turnstile: {
          enabled: Boolean(cfg.turnstile?.enabled),
          siteKey: cfg.turnstile?.siteKey || '',
          secretKeyMasked: maskSecret(cfg.turnstile?.secretKey),
          secretKeySet: Boolean(cfg.turnstile?.secretKey),
        },
        jwtSecretMasked: maskSecret(cfg.jwtSecret),
        tokenExpiryDays: cfg.tokenExpiryDays,
      },
    });
  });

  r.patch('/server/config', requireRole('owner'), asyncH(async (req, res) => {
    const b = req.body || {};
    const changes = {};

    if (b.serverName !== undefined) {
      cfg.serverName = vStr(b.serverName, { label: 'Server name', min: 1, max: 80 });
      changes.serverName = cfg.serverName;
    }
    if (b.serverPassword !== undefined) {
      cfg.serverPassword = vStr(String(b.serverPassword), { label: 'Server password', min: 0, max: 128, optional: true });
      changes.serverPassword = cfg.serverPassword ? 'set' : 'cleared';
    }
    if (b.registrationEnabled !== undefined) {
      cfg.registration.enabled = Boolean(b.registrationEnabled);
      changes.registrationEnabled = cfg.registration.enabled;
    }
    if (b.turnstileEnabled !== undefined) {
      cfg.turnstile.enabled = Boolean(b.turnstileEnabled);
      changes.turnstileEnabled = cfg.turnstile.enabled;
    }
    if (b.turnstileSiteKey !== undefined) {
      cfg.turnstile.siteKey = vStr(b.turnstileSiteKey, { label: 'Turnstile site key', min: 0, max: 64, optional: true });
      changes.turnstileSiteKey = 'updated';
    }
    if (b.turnstileSecretKey !== undefined && String(b.turnstileSecretKey).trim() !== '') {
      cfg.turnstile.secretKey = vStr(b.turnstileSecretKey, { label: 'Turnstile secret key', min: 0, max: 64, optional: true });
      changes.turnstileSecretKey = 'updated';
    }
    if (b.tokenExpiryDays !== undefined) {
      const d = Math.min(Math.max(Number(b.tokenExpiryDays) || 7, 1), 90);
      cfg.tokenExpiryDays = d;
      changes.tokenExpiryDays = d;
    }

    saveConfig(cfg);
    store.audit(req.user.id, 'config_update', '', changes);
    hub.broadcast({ t: 'server:updated', data: { info: publicInfoFn(cfg) } });
    res.json({ ok: true, applied: Object.keys(changes) });
  }));

  r.post('/server/regenerate-secret', requireRole('owner'), asyncH(async (req, res) => {
    cfg.jwtSecret = crypto.randomBytes(48).toString('hex');
    saveConfig(cfg);
    store.bumpAllTokenVersions();
    store.audit(req.user.id, 'secret_rotate', '');
    // Respond first, then drop every session.
    res.json({ ok: true });
    setImmediate(() => hub.forceLogoutAll('Server security keys were rotated — please sign in again'));
  }));

  return r;
}
