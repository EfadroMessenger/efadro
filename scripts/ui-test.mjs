/* UI screenshot/verification script — drives the real frontend with Chromium.
   Optional dev tool: requires `npm i -D playwright && npx playwright install chromium`. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:3000';
const SHOTS = '/home/user/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); }
  }

  // Seed a second user via API
  const gate = (await (await fetch(BASE + '/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).gateToken;
  await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${gate}` }, body: JSON.stringify({ username: 'bob', password: 'bob-password-1', displayName: 'Bob' }) });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

  // 1. connect screen
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/1-connect.png` });

  // 2. connect → auth screen
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/2-login.png` });

  // 3. signup tab
  await page.click('#tab-register');
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/3-signup.png` });

  // 4. register alice via UI
  await page.fill('#auth-display', 'Alice');
  await page.fill('#auth-user', 'alice');
  await page.fill('#auth-pass', 'alice-password-1');
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 8000 });
  await sleep(1200);
  await page.screenshot({ path: `${SHOTS}/4-app-empty.png` });

  // 5. open DM with bob, send messages
  await page.click('#new-chat-btn');
  await page.waitForSelector('.modal .new-chat-list');
  await page.fill('.modal .field .input', 'bob');
  await sleep(700);
  await page.click('.pick-row');
  await page.waitForSelector('#composer-input', { timeout: 8000 });
  await sleep(600);
  await page.fill('#composer-input', 'Hey Bob! Welcome to efadro 🎉');
  await page.press('#composer-input', 'Enter');
  await sleep(400);
  await page.fill('#composer-input', 'This messenger is fully self-hosted, check https://github.com for more');
  await page.press('#composer-input', 'Enter');
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/5-chat.png` });

  // 6. members drawer
  await page.click('#members-btn');
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/6-drawer.png` });
  await page.click('#drawer-close');

  // 7. owner session — staff panel
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => console.error('[pageerror p2]', e.message));
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.click('#connect-btn');
  await p2.waitForSelector('#auth-user', { timeout: 8000 });
  await p2.fill('#auth-user', 'owner');
  await p2.fill('#auth-pass', 'efadro-owner');
  await p2.click('#auth-go');
  await p2.waitForSelector('.shell', { timeout: 8000 });
  await sleep(900);
  await p2.click('#panel-btn');
  await p2.waitForSelector('.panel-overlay');
  await sleep(1100);
  await p2.screenshot({ path: `${SHOTS}/7-panel-users.png` });

  // 8. owner: server settings tab
  await p2.click('[data-tab="server"]');
  await sleep(1000);
  await p2.screenshot({ path: `${SHOTS}/8-panel-server.png` });

  // 9. owner opens alice's user menu (promote → moderator to check visibility)
  await p2.click('[data-tab="users"]');
  await sleep(900);
  const btns = await p2.$$('.pu-actions');
  console.log('action buttons found:', btns.length);

  // 10. light theme + settings on alice
  await page.click('#settings-btn');
  await page.waitForSelector('.modal');
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/9-settings.png` });
  await page.click('#set-theme');
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/10-light.png` });

  await browser.close();
  console.log('UI test done — screenshots in', SHOTS);
} finally {
  child.kill('SIGTERM');
}
