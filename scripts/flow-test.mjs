/* Verifies the full join flow with Turnstile (official Cloudflare test keys) + server password + mobile layout.
   Optional dev tool: requires `npm i -D playwright && npx playwright install chromium`. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3218;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-flow-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'Fort Knox',
  host: '127.0.0.1',
  port: PORT,
  serverPassword: 'letmein',
  jwtSecret: 'flow-test-secret-0123456789abcdef0123456789abcdefzz',
  owner: { username: 'owner', password: 'bootstrap-owner-pass' },
  turnstile: { enabled: true, siteKey: '1x00000000000000000000AA', secretKey: '1x0000000000000000000000000000000AA' },
  rateLimit: { enabled: false },
}, null, 2));

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, EFADRO_CONFIG: path.join(tmp, 'config.json') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

try {
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); }
  }
  const info = await (await fetch(BASE + '/api/info')).json();
  console.log('turnstile enabled:', info.turnstile.enabled, '| password required:', info.serverPasswordRequired);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#connect-btn');

  // captcha step — wait for the widget (test key auto-passes without a visible iframe)
  await page.waitForSelector('#ts-container', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.turnstile === 'object', null, { timeout: 15000 });
  await sleep(2500);
  await page.screenshot({ path: `${SHOTS}/f1-captcha.png` });

  const tsFrame = page.frames().find((f) => f.url().includes('challenges.cloudflare.com'));
  if (tsFrame) {
    await tsFrame.click('input[type="checkbox"]', { timeout: 5000 }).catch(() => {});
  }
  await page.waitForFunction(() => !document.querySelector('#ts-next')?.disabled, null, { timeout: 20000 });
  await page.click('#ts-next');

  // server password step
  await page.waitForSelector('#server-pass', { timeout: 8000 });
  await sleep(500);
  await page.fill('#server-pass', 'wrong-pass');
  await page.click('#pass-next');
  await page.waitForSelector('.form-error.show', { timeout: 8000 });
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/f2-password-error.png` });

  await page.fill('#server-pass', 'letmein');
  await page.click('#pass-next');
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  await sleep(400);
  console.log('full gate flow (captcha + password) OK');

  // register a user through the whole flow
  await page.click('#tab-register');
  await page.fill('#auth-display', 'Flow User');
  await page.fill('#auth-user', 'flowuser');
  await page.fill('#auth-pass', 'flow-password-1');
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 8000 });
  console.log('signup after full gate flow OK');

  // mobile layout
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(600);
  await m.screenshot({ path: `${SHOTS}/f3-mobile-connect.png` });
  await m.click('#connect-btn');
  await m.waitForSelector('#ts-container', { timeout: 15000 });
  await sleep(3500);
  await m.screenshot({ path: `${SHOTS}/f4-mobile-captcha.png` });

  await browser.close();
  console.log('flow test done');
} finally {
  child.kill('SIGTERM');
}
