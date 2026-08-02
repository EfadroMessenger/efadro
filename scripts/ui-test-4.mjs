/* UI verification for v1.3.0: formatting, mentions, system messages, unread
   divider, drafts, chat search, :emoji: suggest, Ctrl+K, notifications, delete chat.
   Requires playwright (npm i playwright --no-save). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3223;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots4';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui4-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'UI Server', host: '127.0.0.1', port: PORT, serverPassword: '',
  jwtSecret: 'ui4-test-secret-0123456789abcdef0123456789abcde',
  owner: { username: 'owner', password: 'owner-passw0rd' },
  turnstile: { enabled: false, siteKey: '', secretKey: '' },
  registration: { enabled: true }, rateLimit: { enabled: false },
  uploads: { maxFileSizeMb: 5 },
}, null, 2));

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, EFADRO_CONFIG: path.join(tmp, 'config.json') },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
let browser = null;

const apiReq = async (m, p, token, body) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: r.status, j: await r.json().catch(() => null) };
};

try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }

  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const bob = (await apiReq('POST', '/api/auth/signup', gate, { username: 'bob', password: 'bob-password-1', displayName: 'Bob' })).j;
  const carol = (await apiReq('POST', '/api/auth/signup', gate, { username: 'carol', password: 'carol-password-1', displayName: 'Carol' })).j;

  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['notifications', 'microphone'],
  });
  const alice = await ctx.newPage();
  // Headless Chromium always reports Notification.permission === 'denied'; stub it granted
  await alice.addInitScript(() => {
    class FakeNotification {
      static permission = 'granted';
      static async requestPermission() { return 'granted'; }
      constructor(title, opts) {
        (window.__notifs ||= []).push({ title, ...opts });
        this.onclick = null;
      }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
  });
  alice.on('pageerror', (e) => console.error('[pageerror]', e.message));
  alice.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 200)); });

  console.log('• Boot & register');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await alice.click('#connect-btn');
  await alice.waitForSelector('#auth-user', { timeout: 9000 });
  await alice.click('#tab-register');
  await alice.fill('#auth-display', 'Alice');
  await alice.fill('#auth-user', 'alice');
  await alice.fill('#auth-pass', 'alice-password-1');
  await alice.click('#auth-go');
  await alice.waitForSelector('.shell', { timeout: 9000 });

  // seed: bob + carol group (alice added via REST), bob's DM with alice
  const aliceId = (await apiReq('GET', '/api/auth/me', (await apiReq('POST', '/api/auth/login', gate, { username: 'alice', password: 'alice-password-1' })).j.token, null)).j.user.id;
  const grp = (await apiReq('POST', '/api/chats/group', bob.token, { name: 'Cool Group', memberIds: [bob.user.id, carol.user.id] })).j.chat;
  await apiReq('POST', `/api/chats/${grp.id}/members`, bob.token, { userIds: [aliceId] });
  await apiReq('DELETE', `/api/chats/${grp.id}/members/${carol.user.id}`, bob.token, null);
  await apiReq('POST', `/api/chats/${grp.id}/members`, bob.token, { userIds: [carol.user.id] });
  const dm = (await apiReq('POST', '/api/chats/dm', bob.token, { userId: aliceId })).j.chat;
  await sleep(800); // let WS deliver the group/DM to alice

  console.log('• Text formatting & spoilers');
  await alice.click('.chat-item:has-text("Bob")');
  await alice.waitForSelector('#composer-input', { timeout: 9000 });
  await alice.fill('#composer-input', 'Format test: **bold move** __ital words__ ~~gone~~ `sn ip` ||top secret||');
  await alice.press('#composer-input', 'Enter');
  await alice.fill('#composer-input', '```line one\nline two```');
  await alice.press('#composer-input', 'Enter');
  await alice.fill('#composer-input', 'pineapple cakes recipe 🍍');
  await alice.press('#composer-input', 'Enter');
  await alice.waitForSelector('.msg-row', { timeout: 6000 });
  await sleep(700);
  ok(await alice.locator('.msg-text b', { hasText: 'bold move' }).count() >= 1, 'bold renders');
  ok(await alice.locator('.msg-text i', { hasText: 'ital words' }).count() >= 1, 'italic renders');
  ok(await alice.locator('.msg-text s', { hasText: 'gone' }).count() >= 1, 'strikethrough renders');
  ok(await alice.locator('code.msg-code', { hasText: 'sn ip' }).count() >= 1, 'inline code renders');
  ok(await alice.locator('pre.msg-pre').count() >= 1, 'code block renders');
  const spoiler = alice.locator('.spoiler', { hasText: 'top secret' }).first();
  ok(await spoiler.count() >= 1, 'spoiler renders hidden');
  await spoiler.click();
  ok(await alice.locator('.spoiler.revealed').count() >= 1, 'spoiler reveals on click');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/01-formatting.png` });

  console.log('• Unread divider');
  await alice.click('.chat-item:has-text("Cool Group")');
  await alice.waitForSelector('#composer-input', { timeout: 6000 });
  await apiReq('POST', `/api/chats/${dm.id}/messages`, bob.token, { content: 'alice, first new one' });
  await apiReq('POST', `/api/chats/${dm.id}/messages`, bob.token, { content: 'and another while you were away' });
  await sleep(900);
  await alice.click('.chat-item:has-text("Bob")');
  await alice.waitForSelector('.unread-sep', { timeout: 6000 });
  ok(true, '“New messages” divider appears above first unread');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/02-unread-divider.png` });

  console.log('• Drafts');
  await alice.fill('#composer-input', 'draft kept between chats');
  await alice.click('.chat-item:has-text("Cool Group")');
  await alice.waitForTimeout(400);
  await alice.click('.chat-item:has-text("Bob")');
  await alice.waitForSelector('#composer-input', { timeout: 6000 });
  ok((await alice.locator('#composer-input').inputValue()) === 'draft kept between chats', 'draft restored when returning to the chat');
  await alice.press('#composer-input', 'Enter'); // sends it
  await sleep(700);
  await alice.click('.chat-item:has-text("Cool Group")');
  await alice.waitForTimeout(300);
  await alice.click('.chat-item:has-text("Bob")');
  ok((await alice.locator('#composer-input').inputValue()) === '', 'draft cleared after sending');

  console.log('• In-chat search');
  await alice.click('#search-btn');
  await alice.waitForSelector('#cs-input', { timeout: 5000 });
  await alice.fill('#cs-input', 'pineapple');
  await alice.waitForFunction(() => document.querySelector('#cs-count')?.textContent.includes('of'), null, { timeout: 6000 });
  const countTxt = await alice.locator('#cs-count').textContent();
  ok(countTxt.trim().startsWith('1 of'), `search shows result count (${countTxt.trim()})`);
  await alice.waitForSelector('.flash', { timeout: 6000 }).catch(() => {});
  await sleep(400);
  await alice.screenshot({ path: `${SHOTS}/03-search.png` });
  await alice.click('#cs-close');

  console.log('• :emoji: shortcode suggest');
  await alice.click('#composer-input');
  await alice.type('#composer-input', 'hot take :fir', { delay: 40 });
  await alice.waitForSelector('.suggest-pop', { timeout: 5000 });
  ok(await alice.locator('.suggest-pop button').count() >= 1, 'suggest popover appears');
  await sleep(350);
  await alice.screenshot({ path: `${SHOTS}/04-shortcode.png` });
  await alice.press('#composer-input', 'Enter'); // completes the emoji
  const val = await alice.locator('#composer-input').inputValue();
  ok(val.includes('🔥') && !val.includes(':fir'), 'shortcode completes to emoji');
  await alice.press('#composer-input', 'Enter'); // sends
  await sleep(800);

  console.log('• Mentions & system messages');
  await alice.click('.chat-item:has-text("Cool Group")');
  await alice.waitForSelector('.sys-msg-row', { timeout: 6000 });
  ok(true, 'system messages render (member events)');
  await apiReq('POST', `/api/chats/${grp.id}/messages`, bob.token, { content: 'hey @alice check **this** out' });
  await alice.waitForSelector('.mention.me', { timeout: 6000 });
  ok(true, '@mention highlights (and glows for mentioned self)');
  await apiReq('PATCH', `/api/chats/${grp.id}`, bob.token, { name: 'Cool Group 2' });
  await sleep(900);
  const sysTexts = await alice.locator('.sys-msg').allTextContents();
  ok(sysTexts.some((t) => t.includes('renamed the group')), 'rename system message appears live');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/05-mentions-sysmsgs.png` });

  console.log('• Ctrl+K quick switcher');
  await alice.keyboard.press('Control+k');
  await alice.waitForSelector('#qs-input', { timeout: 5000 });
  await sleep(350);
  await alice.screenshot({ path: `${SHOTS}/06-switcher.png` });
  await alice.fill('#qs-input', 'bob');
  await sleep(300);
  await alice.press('#qs-input', 'Enter');
  await sleep(800);
  ok((await alice.locator('.ch-title').textContent()) === 'Bob', 'switcher jumps to the picked chat');

  console.log('• Desktop notifications setting');
  await alice.click('#settings-btn');
  await alice.waitForSelector('#set-notify', { state: 'attached', timeout: 5000 });
  await alice.click('label.toggle:has(#set-notify) .track');
  await sleep(700);
  const pref = await alice.evaluate(() => JSON.parse(localStorage.getItem('efadro:prefs') || '{}').notify);
  ok(pref === true, 'notifications toggle persists (permission granted)');
  await sleep(350);
  await alice.screenshot({ path: `${SHOTS}/07-settings-notify.png` });
  await alice.keyboard.press('Escape');

  console.log('• Delete direct chat');
  // Positive control: the group preview really does contain "Bob" (sys events)
  const preDel = await alice.evaluate(() => [...document.querySelectorAll('.chat-item')].map((c) => ({ title: c.querySelector('.ci-name')?.textContent, text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) })));
  console.log('   chats before delete:', JSON.stringify(preDel));
  await alice.click('#members-btn');
  await alice.waitForSelector('#drawer-delete', { timeout: 5000 });
  await alice.click('#drawer-delete');
  await alice.waitForSelector('.modal [data-x="yes"]', { timeout: 5000 });
  await alice.click('.modal [data-x="yes"]');
  await sleep(1100);
  const afterDel = await alice.evaluate(() => [...document.querySelectorAll('.chat-item')].map((c) => c.querySelector('.ci-name')?.textContent));
  ok(!afterDel.includes('Bob'), 'deleted DM disappears from the chat list');
  await alice.screenshot({ path: `${SHOTS}/08-chat-deleted.png` });

  console.log(`\nUI result: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
} catch (e) {
  failed++;
  console.error('\nFATAL during UI test:', e);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { /* ignore */ }
  child.kill('SIGTERM');
}
