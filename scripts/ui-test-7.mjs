/* UI verification for v1.5.1: server-only mode + the single-file client build.
   Boots efadro with --server-only (no built-in web app), serves the built
   dist/efadro-client.html from a DIFFERENT origin, then drives a real browser:
   connect → signup → DM round-trip across origins (CORS + cross-origin WS).
   Requires playwright (npm i playwright --no-save). Runs `npm run build` first. */

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const API_PORT = 3227;
const WEB_PORT = 3228;
const BASE = `http://127.0.0.1:${API_PORT}`;
const SHOTS = '/home/user/shots7';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

/* ---- 0. build the single-file client ------------------------------------- */
console.log('• Building single-file client…');
const build = spawnSync(process.execPath, ['scripts/build-single-html.mjs'], { cwd: ROOT, encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(1); }
const htmlFile = path.join(ROOT, 'dist', 'efadro-client.html');
ok(fs.existsSync(htmlFile), 'npm run build produced dist/efadro-client.html');

/* ---- 1. efadro in server-only mode --------------------------------------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui7-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'Server-Only UI', host: '127.0.0.1', port: API_PORT, serverPassword: '',
  jwtSecret: 'ui7-test-secret-0123456789abcdef0123456789abcde',
  owner: { username: 'owner', password: 'owner-passw0rd' },
  turnstile: { enabled: false, siteKey: '', secretKey: '' },
  registration: { enabled: true }, rateLimit: { enabled: false },
  uploads: { maxFileSizeMb: 5 },
}, null, 2));

const child = spawn(process.execPath, ['server/index.js', '--server-only'], {
  cwd: ROOT,
  env: { ...process.env, EFADRO_CONFIG: path.join(tmp, 'config.json') },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

/* ---- 2. dumb static host on a different origin ---------------------------- */
const staticHost = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  fs.createReadStream(htmlFile).pipe(res);
});
await new Promise((r) => staticHost.listen(WEB_PORT, '127.0.0.1', r));

const apiReq = async (m, p, token, body) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: r.status, j: await r.json().catch(() => null) };
};

let browser = null;
try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }

  /* ---- server-only behaviour over the wire ---- */
  console.log('• Server-only mode');
  const landing = await fetch(BASE + '/');
  const landingJson = await landing.json();
  ok(landing.status === 200 && landingJson.product === 'efadro' && landingJson.mode === 'server',
    'GET / answers JSON landing (mode: server)', JSON.stringify(landingJson).slice(0, 120));
  ok((await fetch(BASE + '/api/info')).status === 200, 'REST API alive in server-only mode');
  const noClient = await fetch(BASE + '/js/app.js');
  ok(noClient.status === 404 && (await noClient.json()).hint?.includes('server-only'),
    'built-in web client is NOT served (404 JSON)');

  /* ---- seed bob, open the single-file client from another origin ---- */
  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const bob = (await apiReq('POST', '/api/auth/signup', gate, { username: 'bob', password: 'bob-password-1', displayName: 'Bob' })).j;

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

  console.log('• Single-file client from a foreign origin');
  await page.goto(`http://127.0.0.1:${WEB_PORT}/efadro-client.html`, { waitUntil: 'load' });
  await page.waitForSelector('#server-url', { timeout: 10000 });
  ok(true, 'single-file client boots from a plain static host');

  const prefill = await page.inputValue('#server-url');
  ok(prefill === 'http://localhost:3000', 'server box suggests http://localhost:3000 (not the static host)', prefill);

  await page.fill('#server-url', BASE);
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  ok(true, 'connects cross-origin to the server-only backend (CORS)');

  await page.click('#tab-register');
  await page.fill('#auth-display', 'Alice');
  await page.fill('#auth-user', 'alice');
  await page.fill('#auth-pass', 'alice-password-1');
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 8000 });
  ok(true, 'signup works from the single file');

  /* E2EE identity should auto-publish — proves WebCrypto from a foreign origin */
  let aliceKeys = null;
  const login = (await apiReq('POST', '/api/auth/login', gate, { username: 'alice', password: 'alice-password-1' })).j;
  const me = (await apiReq('GET', '/api/auth/me', login.token)).j;
  for (let i = 0; i < 20; i++) {
    const keys = (await apiReq('GET', `/api/e2ee/identity?ids=${me.user.id}`, login.token)).j;
    if (keys.keys?.[me.user.id]?.dhPub) { aliceKeys = keys.keys[me.user.id]; break; }
    await sleep(500);
  }
  ok(Boolean(aliceKeys?.dhPub && aliceKeys?.sigPub), 'E2EE identity auto-published from the single file (WebCrypto OK)');

  /* DM round-trip: alice in the single file → bob via REST */
  await page.click('#new-chat-btn');
  await page.waitForSelector('.modal .new-chat-list');
  await page.fill('.modal .field .input', 'bob');
  await sleep(700);
  await page.click('.pick-row');
  await page.waitForSelector('#composer-input', { timeout: 8000 });
  await page.fill('#composer-input', 'hello from the single-file client — one HTML, zero installs');
  await page.press('#composer-input', 'Enter');
  await sleep(900);
  const bubbleVisible = await page.evaluate(() => [...document.querySelectorAll('.bubble-text, .msg-text')]
    .some((n) => n.textContent.includes('single-file client')));
  ok(bubbleVisible, 'sent message renders in the single-file UI');

  const bobLogin = (await apiReq('POST', '/api/auth/login', gate, { username: 'bob', password: 'bob-password-1' })).j;
  const bobChats = (await apiReq('GET', '/api/chats', bobLogin.token)).j;
  const dm = bobChats.chats?.find((c) => c.type === 'dm');
  const bobMsgs = dm ? (await apiReq('GET', `/api/chats/${dm.id}/messages`, bobLogin.token)).j : { messages: [] };
  ok(bobMsgs.messages?.some((m) => m.content?.includes('single-file client')),
    'message reached the server and is readable by bob (API)');

  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/50-single-file-connected.png` });
} catch (e) {
  failed++;
  console.error('  ✗ unexpected error:', e.message);
  if (browser) {
    try { await (await browser.pages())[0]?.screenshot({ path: `${SHOTS}/99-fatal.png` }); } catch {}
  }
} finally {
  if (browser) await browser.close();
  staticHost.close();
  child.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nUI result: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
