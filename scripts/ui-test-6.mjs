/* UI verification for v1.5.0 E2EE: auto-keyed encrypted DMs (real browser keys),
   lock chip + fingerprints, encrypted edit, server-blind ciphertext, and the
   device-to-device transfer flow (new device requests → old device approves).
   Requires playwright (npm i playwright --no-save). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3226;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots6';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui6-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'UI Server', host: '127.0.0.1', port: PORT, serverPassword: '',
  jwtSecret: 'ui6-test-secret-0123456789abcdef0123456789abcdef',
  owner: { username: 'owner', password: 'owner-passw0rd' },
  turnstile: { enabled: false }, registration: { enabled: true }, rateLimit: { enabled: false },
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

const loginViaUi = async (page, user, pass) => {
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 9000 });
  await page.fill('#auth-user', user);
  await page.fill('#auth-pass', pass);
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 9000 });
};

try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }

  browser = await chromium.launch();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 160)); });
    return { ctx, page };
  };
  const { page: alice } = await mk();
  const { page: bob } = await mk();

  console.log('• Boot & auto identity');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await registerViaUi(alice, 'Alice', 'alice', 'alice-password-1');
  await bob.goto(BASE, { waitUntil: 'domcontentloaded' });
  await registerViaUi(bob, 'Bob', 'bob', 'bob-password-1');
  // identities are generated + published silently on first login
  const aliceId = await alice.evaluate(() => JSON.parse(localStorage.getItem('efadro:sessions') || '{}'));
  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const bobTok = (await apiReq('POST', '/api/auth/login', gate, { username: 'bob', password: 'bob-password-1' })).j.token;
  const bobId = (await apiReq('GET', '/api/auth/me', bobTok, null)).j.user.id;
  const aliceTok = (await apiReq('POST', '/api/auth/login', gate, { username: 'alice', password: 'alice-password-1' })).j.token;
  const aliceUserId = (await apiReq('GET', '/api/auth/me', aliceTok, null)).j.user.id;
  void aliceId;
  ok((await apiReq('GET', '/api/e2ee/identity/me', aliceTok, null)).j.identity !== null, 'alice identity auto-published (WebCrypto, in-browser)');
  ok((await apiReq('GET', '/api/e2ee/identity/me', bobTok, null)).j.identity !== null, 'bob identity auto-published');

  console.log('• Auto-keyed encrypted DM');
  await bob.click('#new-chat-btn');
  await bob.waitForSelector('.modal .field .input', { timeout: 6000 });
  await bob.type('.modal .field .input', 'alice', { delay: 25 });
  await bob.waitForSelector('.pick-row', { timeout: 6000 });
  await bob.click('.pick-row');
  await bob.waitForSelector('#composer-input', { timeout: 7000 });
  await bob.fill('#composer-input', 'secret handshake 🤫 — the server must never see this');
  await bob.press('#composer-input', 'Enter');
  // first send in a DM auto-creates key epoch 1 → system row + lock chip
  await bob.waitForSelector('.sys-msg:has-text("End-to-end encryption")', { timeout: 9000 });
  ok(true, 'first message auto-keys the chat (system row appears)');
  await bob.waitForSelector('#lock-chip', { timeout: 6000 });
  ok(true, 'lock chip renders in the chat header');
  const bobPlaceholder = await bob.$eval('#composer-input', (el) => el.placeholder);
  ok(bobPlaceholder.includes('🔒'), 'composer placeholder shows the lock');
  await sleep(500);
  await bob.screenshot({ path: `${SHOTS}/40-e2ee-first-message.png` });

  await alice.waitForSelector('.chat-item:has(.ci-name:text-is("Bob"))', { timeout: 8000 });
  const alicePreview = await alice.$eval('.chat-item:has(.ci-name:text-is("Bob"))', (el) => el.textContent);
  ok(alicePreview.includes('🔒'), 'chat list preview shows the lock marker');
  await alice.click('.chat-item:has(.ci-name:text-is("Bob"))');
  await alice.waitForSelector('.msg-row:not([class*="pending"]) .msg-text', { timeout: 8000 });
  const alicetxt = await alice.$eval('.msg-row:not(.pending) .msg-text', (el) => el.textContent);
  ok(alicetxt.includes('secret handshake'), 'alice decrypts and reads the bubble in-browser');
  await sleep(400);

  console.log('• Server blind spot (REST cross-check)');
  const dmChat = (await apiReq('GET', '/api/chats', aliceTok, null)).j.chats.find((c) => c.type === 'dm');
  ok(dmChat?.e2ee === true, 'chat payload says e2ee: true');
  const raw = (await apiReq('GET', `/api/chats/${dmChat.id}/messages`, bobTok, null)).j.messages;
  const encRow = raw.find((m) => m.enc);
  ok(Boolean(encRow), 'server stores an enc=1 row');
  ok(!raw.some((m) => (m.content || '').includes('secret handshake')), 'server-stored history contains zero plaintext');
  ok(!encRow.content || /^[A-Za-z0-9+/]+={0,2}$/.test(encRow.content), 'stored content is base64 ciphertext');

  console.log('• Fingerprints & edit');
  await alice.click('#lock-chip');
  await alice.waitForSelector('#e2ee-fp-body .fp-row', { timeout: 6000 });
  const fpText = await alice.$eval('#e2ee-fp-body', (el) => el.textContent.replace(/\s+/g, ''));
  const bobFpRest = (await apiReq('GET', '/api/e2ee/identity/me', bobTok, null)).j.identity.dhHash;
  ok(fpText.toUpperCase().includes(bobFpRest.slice(0, 8).toUpperCase()), 'fingerprint modal shows bob’s real identity hash');
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/41-fingerprints.png` });
  await alice.keyboard.press('Escape');

  // bob edits his encrypted message → re-encrypted on the wire; alice sees it live
  await bob.hover('.msg-row');
  await bob.click('.msg-row .msg-actions [data-act="edit"]');
  await bob.fill('#composer-input', 'secret handshake 🤫 — edited & still sealed');
  await bob.press('#composer-input', 'Enter');
  await alice.waitForFunction(() => document.querySelector('.msg-row .msg-text')?.textContent.includes('edited & still sealed'), { timeout: 8000 });
  ok(true, 'edited ciphertext decrypts live on alice’s side');
  const raw2 = (await apiReq('GET', `/api/chats/${dmChat.id}/messages`, bobTok, null)).j.messages.find((m) => m.id === encRow.id);
  ok(!raw2.content.includes('edited'), 'edited history on the server is still ciphertext');
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/42-e2ee-live.png` });

  console.log('• Encrypted attachments');
  const pngPath = path.join(tmp, 'photo.png');
  fs.writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await bob.click('#attach-btn');
  await bob.waitForSelector('.attach-menu', { timeout: 4000 });
  await bob.click('.attach-menu [data-am="file"]');
  await bob.setInputFiles('#attach-input', pngPath);
  await bob.waitForSelector('#up-caption', { timeout: 6000 });
  await bob.fill('#up-caption', 'for your eyes only');
  await bob.click('[data-x="send"]');
  await bob.waitForSelector('.msg-row .msg-img', { timeout: 12000 });
  const bobImgSrc = await bob.$eval('.msg-row .msg-img', (el) => el.src);
  ok(bobImgSrc.startsWith('blob:'), 'sender renders the decrypted attachment from a blob URL');
  // what the server stores is NOT the original PNG
  const fileMsg = (await apiReq('GET', `/api/chats/${dmChat.id}/messages`, bobTok, null)).j.messages.find((m) => m.file);
  ok(fileMsg?.file?.enc === true && fileMsg?.enc === true, 'file row marked encrypted in the API payload');
  const rawDl = await fetch(`${BASE}/api/files/${fileMsg.file.id}`, { headers: { authorization: `Bearer ${bobTok}` } });
  const rawBytes = new Uint8Array(await rawDl.arrayBuffer());
  ok(!(rawBytes[0] === 0x89 && rawBytes[1] === 0x50), 'stored file bytes are not the original PNG');
  const capText = await bob.$eval('.msg-row:last-of-type .msg-text', (el) => el.textContent).catch(() => '');
  ok(capText.includes('for your eyes only'), 'caption decrypts for the sender');
  await alice.waitForFunction(() => [...document.querySelectorAll('.msg-row .msg-img')].some((el) => el.src.startsWith('blob:')), { timeout: 12000 });
  ok(true, 'alice decrypts the same attachment to a blob URL');
  const aliceCap = await alice.evaluate(() => [...document.querySelectorAll('.msg-row .msg-text')].map((e) => e.textContent).join(' '));
  ok(aliceCap.includes('for your eyes only'), 'caption decrypts for alice too');
  await sleep(400);
  await alice.screenshot({ path: `${SHOTS}/47-e2ee-attachment.png` });

  console.log('• Device-to-device key transfer');
  const { page: laptop } = await mk(); // a brand-new "device": fresh storage, same account
  await laptop.goto(BASE, { waitUntil: 'domcontentloaded' });
  await loginViaUi(laptop, 'alice', 'alice-password-1');
  await laptop.waitForSelector('#e2ee-banner', { timeout: 9000 });
  ok(true, 'new device shows the "locked" setup banner');
  await laptop.click('.chat-item:has(.ci-name:text-is("Bob"))');
  await laptop.waitForSelector('.msg-locked', { timeout: 8000 });
  const lockedTxt = await laptop.$eval('.msg-locked', (el) => el.textContent);
  ok(lockedTxt.includes('Encrypted message'), 'bubbles are locked placeholders until setup');
  await sleep(300);
  await laptop.screenshot({ path: `${SHOTS}/43-new-device-locked.png` });

  await laptop.click('#e2ee-setup-btn');
  await laptop.waitForSelector('[data-x="go"]', { timeout: 6000 });
  await laptop.click('[data-x="go"]');
  await laptop.waitForSelector('#sas-new', { timeout: 9000 });
  const codeNew = await laptop.$eval('#sas-new', (el) => el.textContent.trim());
  ok(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(codeNew), 'new device shows a formatted SAS code');
  await sleep(300);
  await laptop.screenshot({ path: `${SHOTS}/44-sas-new-device.png` });

  // the old device gets a push prompt with the SAME code
  await alice.waitForSelector('#sas-old', { timeout: 9000 });
  const codeOld = await alice.$eval('#sas-old', (el) => el.textContent.trim());
  ok(codeOld === codeNew, 'old device computes the identical SAS code (MITM check)');
  await sleep(300);
  await alice.screenshot({ path: `${SHOTS}/45-sas-approve-old.png` });
  await alice.click('[data-x="ok"]');
  await alice.waitForSelector('.toast:has-text("Keys sent")', { timeout: 9000 });
  ok(true, 'old device seals + ships the key bundle');

  await laptop.waitForFunction(() => !document.querySelector('.modal'), { timeout: 15000 });
  await laptop.waitForSelector('.msg-row:not(.pending) .msg-text', { timeout: 10000 });
  await laptop.waitForFunction(() => [...document.querySelectorAll('.msg-text')].some((el) => el.textContent.includes('edited & still sealed')), { timeout: 10000 });
  ok(true, 'new device unlocked the chat after transfer');
  ok(await laptop.$('.msg-locked') === null, 'no locked placeholders remain');
  const chipNow = await laptop.$('#lock-chip');
  ok(chipNow !== null, 'lock chip now present on the new device too');
  await sleep(450);
  await laptop.screenshot({ path: `${SHOTS}/46-new-device-unlocked.png` });

  // new device can ALSO send encrypted messages on its own
  await laptop.fill('#composer-input', 'sent from the newly authorized laptop 💻');
  await laptop.press('#composer-input', 'Enter');
  await bob.waitForFunction(() => [...document.querySelectorAll('.msg-text')].some((el) => el.textContent.includes('newly authorized laptop')), { timeout: 10000 });
  ok(true, 'new device encrypts outbound messages that bob can read');
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
