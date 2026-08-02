/* UI verification for v1.4.0: chat context menu (pin/mute/archive), unread
   mention badge + jump-to-mention, global message search, formatting toolbar
   + Ctrl+B/E shortcuts, sending→sent state, polls (create/vote/live tally),
   group invite links (create/rotate/revoke + join-by-link).
   Requires playwright (npm i playwright --no-save). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3224;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots5';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui5-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'UI Server', host: '127.0.0.1', port: PORT, serverPassword: '',
  jwtSecret: 'ui5-test-secret-0123456789abcdef0123456789abcde',
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

const DM_SEL = '.chat-item:has(.ci-name:text-is("Bob"))';

const notifStub = () => {
  class FakeNotification {
    static permission = 'granted';
    static async requestPermission() { return 'granted'; }
    constructor(title, opts) { (window.__notifs ||= []).push({ title, ...opts }); this.onclick = null; }
    close() {}
  }
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
};

const registerViaUi = async (page, display, user, pass) => {
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 9000 });
  await page.click('#tab-register');
  await page.fill('#auth-display', display);
  await page.fill('#auth-user', user);
  await page.fill('#auth-pass', pass);
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 9000 });
};

try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }

  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const bob = (await apiReq('POST', '/api/auth/signup', gate, { username: 'bob', password: 'bob-password-1', displayName: 'Bob' })).j;
  const carol = (await apiReq('POST', '/api/auth/signup', gate, { username: 'carol', password: 'carol-password-1', displayName: 'Carol' })).j;

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['notifications'] });
  const alice = await ctx.newPage();
  await alice.addInitScript(notifStub);
  alice.on('pageerror', (e) => console.error('[pageerror]', e.message));
  alice.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 200)); });

  console.log('• Boot & register');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await registerViaUi(alice, 'Alice', 'alice', 'alice-password-1');
  ok(true, 'alice registered through the gate UI');

  // REST-side fixtures: DM bob↔alice + group with all three
  const aliceTok = (await apiReq('POST', '/api/auth/login', gate, { username: 'alice', password: 'alice-password-1' })).j.token;
  const aliceId = (await apiReq('GET', '/api/auth/me', aliceTok, null)).j.user.id;
  const dm = (await apiReq('POST', '/api/chats/dm', bob.token, { userId: aliceId })).j.chat;
  await apiReq('POST', `/api/chats/${dm.id}/messages`, bob.token, { content: 'hi alice, bob here' });
  const grp = (await apiReq('POST', '/api/chats/group', aliceTok, { name: 'Poll Squad', memberIds: [bob.user.id, carol.user.id] })).j.chat;
  await apiReq('POST', `/api/chats/${grp.id}/messages`, bob.token, { content: 'welcome to the squad' });
  await alice.waitForSelector('.chat-item:has-text("Poll Squad")', { timeout: 6000 });
  ok(true, 'DM + group show up in the sidebar');

  /* --------------------- context menu: pin / mute / archive --------------------- */
  console.log('• Chat context menu (pin / mute / archive)');
  await alice.click(DM_SEL, { button: 'right' });
  await alice.waitForSelector('.ctx-menu', { timeout: 4000 });
  const menuText = await alice.$eval('.ctx-menu', (el) => el.textContent);
  ok(menuText.includes('Pin chat') && menuText.includes('Mute notifications') && menuText.includes('Archive chat') && menuText.includes('Delete chat'), 'right-click menu offers pin/mute/archive/delete');
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/20-ctx-menu.png` });

  await alice.click('.ctx-menu [data-ci="pin"]');
  await alice.waitForSelector(`${DM_SEL} .ci-flag[title="Pinned"]`, { timeout: 4000 });
  const firstIsBob = await alice.$eval('.chat-item', (el) => el.querySelector('.ci-name')?.textContent === 'Bob');
  ok(firstIsBob, 'pinned chat jumps to the top of the list');

  await alice.click(DM_SEL, { button: 'right' });
  await alice.waitForSelector('.ctx-menu', { timeout: 4000 });
  await alice.click('.ctx-menu [data-ci="mute"]');
  await alice.waitForSelector(`${DM_SEL} .ci-flag[title="Muted"]`, { timeout: 4000 });
  ok(true, 'mute flag renders on the chat item');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/21-pinned-muted.png` });

  await alice.click(DM_SEL, { button: 'right' });
  await alice.waitForSelector('.ctx-menu', { timeout: 4000 });
  await alice.click('.ctx-menu [data-ci="arch"]');
  await alice.waitForSelector('#arch-toggle', { timeout: 4000 });
  const mainListHasBob = await alice.$$eval('.chat-item', (els) => els.some((c) => c.querySelector('.ci-name')?.textContent === 'Bob'));
  ok(!mainListHasBob, 'archived chat leaves the main list');
  await alice.click('#arch-toggle');
  await alice.waitForSelector(DM_SEL, { timeout: 4000 });
  ok(true, 'archived section expands to reveal the chat');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/22-archived.png` });
  await alice.click(DM_SEL, { button: 'right' });
  await alice.waitForSelector('.ctx-menu', { timeout: 4000 });
  const archLabel = await alice.$eval('.ctx-menu [data-ci="arch"]', (el) => el.textContent);
  await alice.click('.ctx-menu [data-ci="arch"]');
  await sleep(500);
  const stillArchived = await alice.$('#arch-toggle');
  const bobBack = await alice.$$eval('.chat-item', (els) => els.some((c) => c.querySelector('.ci-name')?.textContent === 'Bob'));
  ok(archLabel.includes('Unarchive') && !stillArchived && bobBack, 'unarchive returns the chat to the main list');

  /* --------------------- unread mention badge + jump --------------------- */
  console.log('• Unread @mention badge + jump-to-mention');
  await apiReq('POST', `/api/chats/${grp.id}/messages`, bob.token, { content: '@alice umbrella sync at noon — a quixotic quest' });
  await alice.waitForSelector('.chat-item:has-text("Poll Squad") .ci-badge-me', { timeout: 5000 });
  const badgeTxt = await alice.$eval('.chat-item:has-text("Poll Squad") .ci-badge-me', (el) => el.textContent.trim());
  ok(badgeTxt === '@1', 'mention badge shows @1 on the group chat');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/23-mention-badge.png` });

  await alice.click('.chat-item:has-text("Poll Squad")');
  await alice.waitForSelector('#mention-jump', { timeout: 5000 });
  ok(true, 'floating @ jump button appears while a mention is unread');
  await alice.click('#mention-jump');
  await alice.waitForSelector('.msg-row.flash', { timeout: 5000 });
  const flashed = await alice.$eval('.msg-row.flash', (el) => el.textContent);
  ok(flashed.includes('quixotic'), 'jump scrolls to and highlights the mention');
  await sleep(600);
  const meBadge = await alice.$('.chat-item:has-text("Poll Squad") .ci-badge-me');
  ok(!meBadge, 'opening the chat clears the mention badge');

  /* --------------------- global message search --------------------- */
  console.log('• Global message search');
  await alice.click('#chat-filter');
  await alice.type('#chat-filter', 'quixotic', { delay: 20 });
  await alice.waitForSelector('.gs-row', { timeout: 6000 });
  const gsMark = await alice.$eval('.gs-row mark', (el) => el.textContent.toLowerCase());
  ok(gsMark === 'quixotic', 'result row highlights the needle with <mark>');
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/24-global-search.png` });
  await alice.click('.gs-row');
  await alice.waitForSelector('.msg-row.flash', { timeout: 6000 });
  const flashed2 = await alice.$eval('.msg-row.flash', (el) => el.textContent);
  ok(flashed2.includes('quixotic'), 'clicking a result jumps straight to the message');
  await alice.click('#chat-filter');
  await alice.press('#chat-filter', 'Escape');
  await sleep(300);
  const gsHidden = await alice.$eval('#gs-results', (el) => getComputedStyle(el).display === 'none' || el.style.display === 'none');
  ok(gsHidden, 'Escape collapses the global results');

  /* --------------------- formatting toolbar + shortcuts + pending --------------------- */
  console.log('• Formatting toolbar, shortcuts & sending state');
  await alice.click(DM_SEL);
  await alice.waitForSelector('#composer-input', { timeout: 5000 });
  ok(await alice.$('#fmt-bar') !== null, 'formatting toolbar renders above the composer');

  await alice.fill('#composer-input', 'bold move');
  await alice.$eval('#composer-input', (el) => { el.focus(); el.setSelectionRange(5, 9); });
  await alice.click('#fmt-bar [data-fmt="**"]');
  const tv1 = await alice.$eval('#composer-input', (el) => el.value);
  ok(tv1 === 'bold **move**', 'toolbar wraps the selection in **bold**', `got: ${tv1}`);
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/25-formatting.png` });
  await alice.press('#composer-input', 'Enter');
  await alice.waitForSelector('.msg-row.out .msg-text', { timeout: 5000 });
  const boldHtml = await alice.evaluate(() => {
    const rows = [...document.querySelectorAll('.msg-row.out')];
    return rows.at(-1)?.querySelector('.msg-text')?.innerHTML || '';
  });
  ok(/<(b|strong)>move<\/(b|strong)>/.test(boldHtml), 'sent message renders real bold', `got: ${boldHtml}`);

  await alice.fill('#composer-input', 'code path');
  await alice.$eval('#composer-input', (el) => { el.focus(); el.setSelectionRange(5, 9); });
  await alice.press('#composer-input', 'Control+e');
  const tv2 = await alice.$eval('#composer-input', (el) => el.value);
  ok(tv2 === 'code `path`', 'Ctrl+E wraps the selection in `code`', `got: ${tv2}`);
  await alice.press('#composer-input', 'Enter');
  await sleep(400);
  const codeTxt = await alice.evaluate(() => {
    const rows = [...document.querySelectorAll('.msg-row.out')];
    return rows.at(-1)?.querySelector('.msg-text code')?.textContent || '';
  });
  ok(codeTxt === 'path', 'sent message renders inline code');

  await alice.fill('#composer-input', 'pending probe');
  await alice.press('#composer-input', 'Enter');
  let sawPending = true;
  try { await alice.waitForSelector('.msg-row.pending', { timeout: 3000 }); } catch { sawPending = false; }
  ok(sawPending, 'optimistic bubble shows the sending (clock) state');
  await alice.waitForSelector('.msg-row.pending', { state: 'detached', timeout: 5000 }).catch(() => {});
  const pendGone = await alice.$('.msg-row.pending');
  ok(!pendGone, 'bubble flips to sent once the server confirms');

  /* --------------------- polls --------------------- */
  console.log('• Polls');
  await alice.click('.chat-item:has-text("Poll Squad")');
  await alice.waitForSelector('#composer-input', { timeout: 5000 });
  await alice.click('#attach-btn');
  await alice.waitForSelector('.attach-menu', { timeout: 4000 });
  ok(true, 'paperclip opens the attach menu');
  await alice.click('.attach-menu [data-am="poll"]');
  await alice.waitForSelector('#poll-q', { timeout: 4000 });
  await alice.fill('#poll-q', 'Lunch pick?');
  await alice.locator('.poll-opt-row input').nth(0).fill('Pizza');
  await alice.locator('.poll-opt-row input').nth(1).fill('Sushi');
  await alice.click('#poll-add');
  await alice.locator('.poll-opt-row input').nth(2).fill('Tacos');
  await sleep(250);
  await alice.screenshot({ path: `${SHOTS}/26-poll-modal.png` });
  await alice.click('#poll-create');
  await alice.waitForSelector('.poll', { timeout: 5000 });
  const optCount = await alice.$$eval('.poll .poll-opt', (els) => els.length);
  ok(optCount === 3, 'poll bubble arrives with all three options');

  await alice.click('.poll .poll-opt');
  await alice.waitForSelector('.poll .poll-opt.mine', { timeout: 5000 });
  const foot1 = await alice.$eval('.poll .poll-foot', (el) => el.textContent);
  ok(foot1.includes('1 vote'), 'voting marks my option and counts it', `foot: ${foot1}`);

  const gms = (await apiReq('GET', `/api/chats/${grp.id}/messages`, bob.token, null)).j.messages;
  const pollMsg = gms.find((m) => m.poll);
  await apiReq('POST', `/api/messages/${pollMsg.id}/vote`, bob.token, { optionId: pollMsg.poll.options[1].id });
  await alice.waitForFunction(() => document.querySelector('.poll .poll-foot')?.textContent.includes('2 votes'), { timeout: 5000 });
  const pct2 = await alice.$$eval('.poll .poll-opt', (els) => els[1]?.querySelector('.poll-pct')?.textContent || '');
  ok(pct2 === '50%', 'live poll:update over the socket refreshes tallies', `pct: ${pct2}`);
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/27-poll-live.png` });

  /* --------------------- invite links --------------------- */
  console.log('• Group invite links');
  await alice.click('#members-btn');
  await alice.waitForSelector('#inv-create', { timeout: 5000 });
  ok(true, 'members drawer offers invite-link creation to staff');
  await alice.click('#inv-create');
  await alice.waitForSelector('#inv-url', { timeout: 5000 });
  const link1 = await alice.$eval('#inv-url', (el) => el.value);
  ok(link1.includes('#invite='), 'invite link created with a token');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/28-invite.png` });

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dave = await ctx2.newPage();
  await dave.addInitScript(notifStub);
  dave.on('pageerror', (e) => console.error('[dave pageerror]', e.message));
  await dave.goto(link1, { waitUntil: 'domcontentloaded' });
  await registerViaUi(dave, 'Dave', 'dave', 'dave-password-1');
  await dave.waitForSelector('.chat-item:has-text("Poll Squad")', { timeout: 8000 });
  ok(true, 'opening the link + registering joins the group automatically');
  await sleep(600);
  await dave.screenshot({ path: `${SHOTS}/29-dave-joined.png` });

  // back on alice: rotate, then revoke (close the drawer first — it overlays the header)
  await alice.click('#drawer-close');
  await sleep(350);
  await alice.click('#members-btn');
  await alice.waitForSelector('#inv-url', { timeout: 5000 });
  await alice.click('#inv-regen');
  await alice.click('[data-x="yes"]');
  await alice.waitForFunction((old) => document.querySelector('#inv-url')?.value && document.querySelector('#inv-url').value !== old, link1, { timeout: 5000 });
  const link2 = await alice.$eval('#inv-url', (el) => el.value);
  ok(link2 !== link1, 'rotate issues a fresh token');
  const joinOld = await apiReq('POST', `/api/invites/${link1.split('#invite=')[1]}/join`, carol.token, {});
  ok(joinOld.s === 404, 'old link dies right after rotation');
  await alice.click('#inv-revoke');
  await alice.click('[data-x="yes"]');
  await alice.waitForSelector('#inv-create', { timeout: 5000 });
  ok(true, 'revoke removes the link (drawer offers to create again)');
  await sleep(450);
  await alice.screenshot({ path: `${SHOTS}/30-invite-revoked.png` });
} catch (e) {
  failed++;
  console.error('FATAL during UI test:', e);
  try { await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: `${SHOTS}/99-fatal.png` }); } catch {}
} finally {
  try { await browser?.close(); } catch {}
  child.kill('SIGKILL');
  await sleep(300);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=================\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
