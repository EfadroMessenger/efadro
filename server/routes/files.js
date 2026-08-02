import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as store from '../store.js';
import * as services from '../services.js';
import { DATA_DIR } from '../db.js';
import { asyncH, vStr, HttpError } from '../util.js';
import { requireAuth, verifyToken } from '../auth.js';

/** MIME types that may be displayed inline in the client; everything else downloads. */
const INLINE_SAFE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/aac', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function multerError(err, cfg) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new HttpError(413, `File too large (max ${cfg.uploads?.maxFileSizeMb ?? 25} MB)`);
    }
    return new HttpError(400, `Upload failed: ${err.message}`);
  }
  return err;
}

const sanitizeExt = (name) => {
  const ext = path.extname(String(name || '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 10 ? ext : '';
};

export function filesRouter(cfg, hub) {
  const uploadDir = path.join(DATA_DIR, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // small slack for the AES-GCM tag on client-encrypted uploads (+16 bytes)
  const maxBytes = (cfg.uploads?.maxFileSizeMb ?? 25) * 1024 * 1024 + 4096;
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + sanitizeExt(file.originalname)),
    }),
    limits: { fileSize: maxBytes, files: 1 },
  });

  const r = Router();

  /* Upload a file into a chat (multipart form: file + optional caption). */
  r.post('/chats/:id/files',
    requireAuth(cfg),
    (req, res, next) => upload.single('file')(req, res, (err) => next(err ? multerError(err, cfg) : undefined)),
    asyncH(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'No file received (field name must be "file")');
      try {
        const caption = vStr(req.body?.caption ?? '', {
          label: 'Caption', min: 0, max: cfg.limits?.maxMessageLength ?? 4000, optional: true,
        });
        const kind = req.body?.kind === 'voice' ? 'voice' : 'file';
        const duration = Math.min(Math.max(Number(req.body?.duration) || 0, 0), 10 * 60 * 1000);
        const e2ee = req.body?.enc === '1' ? {
          kid: req.body?.kid, civ: req.body?.civ, cct: req.body?.cct, csig: req.body?.csig, fiv: req.body?.fiv,
        } : null;
        const { chat, message } = services.postFileMessage(req.user, req.params.id, caption, {
          storedName: req.file.filename,
          originalName: String(req.file.originalname || 'file').slice(0, 200),
          // ciphertext uploads always arrive as octet-stream; the true mime travels as a field
          mime: String((e2ee ? req.body?.mime : req.file.mimetype) || 'application/octet-stream').slice(0, 100),
          size: req.file.size,
          kind, duration,
        }, cfg.limits, e2ee);
        services.emitNewMessage(hub, chat.id, message, req.body?.clientId ?? null);
        res.status(201).json({ message });
      } catch (e) {
        fs.promises.unlink(path.join(uploadDir, req.file.filename)).catch(() => {});
        throw e;
      }
    }),
  );

  /* ------------------------------ avatars ------------------------------ */

  const avatarDir = path.join(DATA_DIR, 'avatars');
  fs.mkdirSync(avatarDir, { recursive: true });

  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: avatarDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + sanitizeExt(file.originalname) || '.png'),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!String(file.mimetype || '').startsWith('image/')) {
        return cb(new HttpError(400, 'Avatars must be image files'));
      }
      cb(null, true);
    },
  });

  const removeAvatarFile = (stored) => {
    if (stored) fs.promises.unlink(path.join(avatarDir, path.basename(stored))).catch(() => {});
  };

  r.post('/avatars',
    requireAuth(cfg),
    (req, res, next) => avatarUpload.single('avatar')(req, res, (err) => next(err ? multerError(err, cfg) : undefined)),
    asyncH(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'No image received (field name must be "avatar")');
      const prev = req.user.avatar_file;
      const user = store.updateUser(req.user.id, { avatar_file: req.file.filename });
      removeAvatarFile(prev);
      hub.broadcast({ t: 'user:updated', data: { user: store.publicUser(user) } });
      res.json({ user: store.selfUser(user) });
    }),
  );

  r.delete('/avatars', requireAuth(cfg), asyncH(async (req, res) => {
    const prev = req.user.avatar_file;
    const user = store.updateUser(req.user.id, { avatar_file: null });
    removeAvatarFile(prev);
    hub.broadcast({ t: 'user:updated', data: { user: store.publicUser(user) } });
    res.json({ user: store.selfUser(user) });
  }));

  // Profile pictures are visible to any authenticated member of this server.
  r.get('/avatars/:userId', asyncH(async (req, res) => {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.t || '');
    const payload = token ? verifyToken(token, cfg) : null;
    const authed = payload && payload.type === 'access' ? store.getUserById(payload.sub) : null;
    if (!authed || authed.token_version !== payload.tv || authed.banned) {
      throw new HttpError(401, 'Authentication required');
    }
    const user = store.getUserById(req.params.userId);
    if (!user?.avatar_file) throw new HttpError(404, 'No avatar');
    const full = path.join(avatarDir, path.basename(user.avatar_file));
    if (!fs.existsSync(full)) throw new HttpError(404, 'No avatar');
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    });
    res.sendFile(full);
  }));

  /* Download/view a file. Auth via Authorization header or ?t= token (for <img>/<audio> tags). */
  r.get('/files/:id', asyncH(async (req, res) => {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.t || '');
    const payload = token ? verifyToken(token, cfg) : null;
    const user = payload && payload.type === 'access' ? store.getUserById(payload.sub) : null;
    if (!user || user.token_version !== payload.tv) throw new HttpError(401, 'Authentication required');
    if (user.banned) throw new HttpError(403, 'This account is banned');

    const file = store.getFile(req.params.id);
    if (!file) throw new HttpError(404, 'File not found');
    if (!store.isMember(file.chat_id, user.id)) throw new HttpError(403, 'You are not a member of this chat');

    const full = path.join(uploadDir, path.basename(file.stored_name));
    if (!fs.existsSync(full)) throw new HttpError(404, 'File data missing');

    const inline = INLINE_SAFE.has(file.mime);
    const name = encodeURIComponent(file.original_name);
    res.set({
      'Content-Type': inline ? file.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(file.size),
    });
    fs.createReadStream(full).pipe(res);
  }));

  return r;
}
