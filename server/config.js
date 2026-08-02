import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Path of config.json. Can be overridden with env var (useful for tests / multi-instance).
export const CONFIG_PATH = process.env.EFADRO_CONFIG
  ? path.resolve(process.env.EFADRO_CONFIG)
  : path.join(process.cwd(), 'config.json');

const DEFAULTS = {
  serverName: 'Efadro Server',
  host: '0.0.0.0',
  port: 3000,
  serverPassword: '',
  jwtSecret: '',
  tokenExpiryDays: 7,
  owner: { username: 'owner', password: 'efadro-owner', forceReset: false },
  turnstile: { enabled: false, siteKey: '', secretKey: '' },
  registration: { enabled: true },
  client: { serve: true },
  calls: {
    enabled: true,
    ringTimeoutSec: 45,
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], // add your coturn URL here for reliable NAT traversal
  },
  uploads: { maxFileSizeMb: 25 },
  limits: {
    maxMessageLength: 4000,
    maxGroupNameLength: 64,
    maxDisplayNameLength: 40,
    maxGroupSize: 100,
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    authPerMinute: 20,
    messagePerMinute: 120,
    apiPerMinute: 600,
  },
  corsOrigins: ['*'],
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(dst, src) {
  const out = { ...dst };
  for (const [k, v] of Object.entries(src || {})) {
    out[k] = isObj(v) && isObj(dst?.[k]) ? merge(dst[k], v) : v;
  }
  return out;
}

export function saveConfig(cfg) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_PATH);
}

export function loadConfig() {
  let stored = null;
  if (!fs.existsSync(CONFIG_PATH)) {
    stored = merge(merge({}, DEFAULTS), {
      jwtSecret: crypto.randomBytes(48).toString('hex'),
    });
    saveConfig(stored);
    console.log(`[efadro] created a fresh config file at ${CONFIG_PATH}`);
  } else {
    try {
      stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error(`[efadro] FATAL: ${CONFIG_PATH} is not valid JSON: ${e.message}`);
      process.exit(1);
    }
  }
  // Fill any missing keys with defaults and persist them.
  const cfg = merge(merge({}, DEFAULTS), stored);
  if (!cfg.jwtSecret || typeof cfg.jwtSecret !== 'string' || cfg.jwtSecret.length < 32) {
    cfg.jwtSecret = crypto.randomBytes(48).toString('hex');
    console.log('[efadro] generated a new random jwtSecret');
  }
  try { saveConfig(cfg); } catch (e) { console.error('[efadro] could not write config:', e.message); }
  return cfg;
}

// Turnstile is only effectively enabled when switched on AND both keys are present.
export function turnstileEffective(cfg) {
  return Boolean(cfg.turnstile?.enabled && cfg.turnstile?.siteKey && cfg.turnstile?.secretKey);
}
