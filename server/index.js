import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';

import { loadConfig, CONFIG_PATH, turnstileEffective } from './config.js';
import { HttpError, safeEq } from './util.js';
import * as store from './store.js';
import { createHub } from './ws.js';
import { publicRouter, publicInfo, APP_VERSION } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { chatsRouter, messagesRouter } from './routes/chats.js';
import { invitesRouter } from './routes/invites.js';
import { e2eeRouter } from './routes/e2ee.js';
import { usersRouter } from './routes/users.js';
import { adminRouter } from './routes/admin.js';
import { filesRouter } from './routes/files.js';
import { callsRouter } from './routes/calls.js';

const cfg = loadConfig();
const app = express();
const server = http.createServer(app);
const hub = createHub(server, cfg);

/* ------------------------- bootstrap owner account ------------------------- */
(function ensureOwner() {
  const username = String(cfg.owner?.username || 'owner');
  const password = String(cfg.owner?.password || 'efadro-owner');
  let user = store.getUserByUsername(username);
  if (!user) {
    user = store.createUser({
      username,
      displayName: 'Owner',
      passwordHash: bcrypt.hashSync(password, 12),
      role: 'owner',
    });
    console.log(`[efadro] created owner account "${username}" from config.json`);
  } else if (user.role !== 'owner') {
    store.updateUser(user.id, { role: 'owner' });
    console.log(`[efadro] restored owner role for "${username}"`);
  }
  if (cfg.owner?.forceReset) {
    store.updateUser(user.id, {
      password_hash: bcrypt.hashSync(password, 12),
      token_version: user.token_version + 1,
    });
    console.log(`[efadro] owner password reset from config.json (forceReset)`);
  }
  if (safeEq(password, 'efadro-owner')) {
    console.warn('[efadro] WARNING: owner is using the default password "efadro-owner" — change it in config.json!');
  }
  if (!cfg.serverPassword) {
    console.log('[efadro] no server password set — anyone with the URL can register');
  }
  if (cfg.turnstile?.enabled && !turnstileEffective(cfg)) {
    console.warn('[efadro] WARNING: turnstile.enabled is true but siteKey/secretKey are missing — captcha is DISABLED until both keys are set');
  }
})();

/* ------------------------------ middleware ------------------------------ */

app.disable('x-powered-by');
app.set('trust proxy', Boolean(process.env.EFADRO_TRUST_PROXY));

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
      frameSrc: ['https://challenges.cloudflare.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — the web client can be pointed at any efadro server, so API is open by
// default (tokens live in headers, not cookies). Restrict via corsOrigins.
app.use((req, res, next) => {
  const origins = Array.isArray(cfg.corsOrigins) && cfg.corsOrigins.length ? cfg.corsOrigins : ['*'];
  const origin = req.headers.origin;
  if (origins.includes('*')) {
    res.set('Access-Control-Allow-Origin', '*');
  } else if (origin && origins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '256kb' }));

/* -------------------------------- routes -------------------------------- */

app.use('/api', publicRouter(cfg));
app.use('/api/auth', authRouter(cfg, hub));
app.use('/api/chats', chatsRouter(cfg, hub));
app.use('/api/messages', messagesRouter(cfg, hub));
app.use('/api/invites', invitesRouter(cfg, hub));
app.use('/api/e2ee', e2eeRouter(cfg, hub));
app.use('/api/calls', callsRouter(cfg));
app.use('/api/users', usersRouter(cfg, hub));
app.use('/api/admin', adminRouter(cfg, hub, publicInfo));
app.use('/api', filesRouter(cfg, hub));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Static frontend + SPA fallback — unless the server runs in API-only mode
// (client.serve=false in config.json, --server-only flag, or EFADRO_NO_CLIENT=1),
// which is handy when the web client is hosted separately (e.g. the single-file
// build from `npm run build`).
const argvFlags = new Set(process.argv.slice(2));
const serveClient = cfg.client?.serve !== false
  && !argvFlags.has('--server-only')
  && !argvFlags.has('--api-only')
  && !process.env.EFADRO_NO_CLIENT;

if (serveClient) {
  // HTML is served with no-cache (so the shell always revalidates), while
  // version-busted assets (?v=APP_VERSION) can be cached safely for a day.
  const publicDir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'public');
  app.use(express.static(publicDir, {
    index: 'index.html',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.(js|css|png|jpg|svg|woff2?)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
  app.get(/^\/(?!api\/|ws$).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  // API-only: a tiny JSON landing page, everything else outside /api is a JSON 404.
  app.get('/', (req, res) => {
    res.json({
      product: 'efadro',
      version: APP_VERSION,
      name: cfg.serverName,
      mode: 'server',
      hint: 'This efadro server runs in API-only mode (no built-in web client). '
        + 'Point any efadro client at this address — e.g. the single-file build from `npm run build`.',
    });
  });
  app.get(/^\/(?!api\/|ws$).*/, (req, res) => {
    res.status(404).json({ error: 'Not found', hint: 'This server runs without the built-in web client (server-only mode)' });
  });
}

/* --------------------------- error middleware --------------------------- */

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  if (String(err?.code || '').startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Conflict: resource already exists' });
  }
  console.error('[efadro] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ------------------------------ startup ------------------------------- */

const host = cfg.host || '0.0.0.0';
const port = Number(cfg.port) || 3000;

server.listen(port, host, () => {
  const banner = [
    '',
    '        __          _          ',
    '  ___  / _| __ _  __| |_ __ ___ ',
    ' / _ \\| |_ / _` |/ _` | \'__/ _ \\',
    '|  __/|  _| (_| | (_| | | | (_) |',
    ' \\___||_|  \\__,_|\\__,_|_|  \\___/ ',
    '',
    `  efadro server v${APP_VERSION}`,
    `  ➜ local:   http://localhost:${port}`,
    `  ➜ mode:    ${serveClient ? 'web client + API + WebSocket' : 'server-only (API + WebSocket, no web client)'}`,
    `  ➜ config:  ${CONFIG_PATH}`,
    '',
  ].join('\n');
  console.log(banner);
});

function shutdown() {
  console.log('\n[efadro] shutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
