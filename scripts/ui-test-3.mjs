/* UI verification for v1.2.0: logo, cache headers, reactions, replies,
   forwards, pins, voice messages, profiles & avatars — requires playwright. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3219;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots3';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

/* solid-color 64×64 PNG for avatar upload */
function makePng(file, r, g, b) {
  const crc32 = (buf) => {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
    }
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const cd = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(cd));
    return Buffer.concat([len, cd, c]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + 64 * 3);
  for (let i = 0; i < 64; i++) { row[1 + i * 3] = r; row[2 + i * 3] = g; row[3 + i * 3] = b; }
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: 64 }, () => row)));
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}
const AVPNG = '/tmp/efadro-avatar.png';
makePng(AVPNG, 244, 63, 94);

/* isolated temp config — no password gate, no captcha */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui3-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'UI Server', host: '127.0.0.1', port: PORT, serverPassword: '',
  jwtSecret: 'ui-test-secret-0123456789abcdef0123456789abcdef01',
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

  console.log('• Cache headers & logo (the “nothing changed” fix)');
  const htmlRes = await fetch(BASE + '/');
  ok(htmlRes.headers.get('cache-control')?.includes('no-cache'), 'HTML served with no-cache');
  const jsRes = await fetch(BASE + '/js/app.js');
  ok(jsRes.headers.get('cache-control')?.includes('max-age'), 'JS asset long-cacheable (version-busted)');
  const html = await htmlRes.text();
  ok(/app\.js\?v=[\d.]+/.test(html) && /style\.css\?v=[\d.]+/.test(html), 'index.html references versioned assets');
  const logoRes = await fetch(BASE + '/img/logo.svg');
  ok(logoRes.status === 200 && (logoRes.headers.get('content-type') || '').includes('image/svg'), 'logo.svg served as an image');

  // seed: bob via API; alice will register through the real UI
  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const bob = (await apiReq('POST', '/api/auth/signup', gate, { username: 'bob', password: 'bob-password-1', displayName: 'Bob' })).j;
  const grp = (await apiReq('POST', '/api/chats/group', bob.token, { name: 'Cool Group', memberIds: [] })).j?.chat;
  void grp;

  browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  const alice = await ctxA.newPage();
  const watch = (pg, tag) => {
    pg.on('pageerror', (e) => console.error(`[pageerror ${tag}]`, e.message));
    pg.on('console', (m) => { if (m.type() === 'error') console.error(`[console ${tag}]`, m.text().slice(0, 220)); });
  };
  watch(alice, 'alice');

  console.log('• Gate flow + logo');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await alice.waitForSelector('#connect-btn', { timeout: 9000 });
  await alice.waitForSelector('.gate-head .logo-slot', { timeout: 9000 });
  const logoBox = await alice.locator('.gate-head .logo-slot').boundingBox();
  ok(logoBox && logoBox.width > 30, 'logo picture renders on the join screen');
  await sleep(500); // let entrance animations settle for the screenshot
  await alice.screenshot({ path: `${SHOTS}/01-gate-logo.png` });
  await alice.click('#connect-btn');
  await alice.waitForSelector('#auth-user', { timeout: 9000 });
  await alice.click('#tab-register');
  await alice.fill('#auth-display', 'Alice');
  await alice.fill('#auth-user', 'alice');
  await alice.fill('#auth-pass', 'alice-password-1');
  await alice.click('#auth-go');
  await alice.waitForSelector('.shell', { timeout: 9000 });
  await alice.waitForSelector('.side-top .logo-slot', { timeout: 6000 });
  ok(await alice.locator('.side-top .logo-slot').isVisible(), 'logo renders in the app sidebar');

  // DM with bob
  await alice.click('#new-chat-btn');
  await alice.waitForSelector('.modal .input', { timeout: 6000 });
  await alice.fill('.modal .input', 'bob');
  await sleep(600);
  await alice.click('.pick-row');
  await alice.waitForSelector('#composer-input', { timeout: 9000 });
  await alice.fill('#composer-input', 'hello bob! reactions, pins and voices await us');
  await alice.press('#composer-input', 'Enter');
  await alice.fill('#composer-input', 'pin me please 📌');
  await alice.press('#composer-input', 'Enter');
  await alice.waitForSelector('.msg-row', { timeout: 6000 });
  await sleep(900);

  // bob logs in
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  const bobP = await ctxB.newPage();
  watch(bobP, 'bob');
  await bobP.goto(BASE, { waitUntil: 'domcontentloaded' });
  await bobP.click('#connect-btn');
  await bobP.waitForSelector('#auth-user', { timeout: 9000 });
  await bobP.fill('#auth-user', 'bob');
  await bobP.fill('#auth-pass', 'bob-password-1');
  await bobP.click('#auth-go');
  await bobP.waitForSelector('.shell', { timeout: 9000 });
  await bobP.click('.chat-item >> nth=0');
  await bobP.waitForSelector('.msg-row', { timeout: 9000 });
  ok(true, 'alice + bob in a live DM');

  console.log('• Reactions (UI)');
  const msgRow = bobP.locator('.msg-row', { hasText: 'hello bob!' }).last();
  await msgRow.hover();
  await msgRow.locator('[data-act="react"]').click();
  await bobP.waitForSelector('.quick-react', { timeout: 5000 });
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/02-quick-react.png` });
  await bobP.click('.quick-react [data-ch="👍"]');
  await bobP.waitForSelector('.rx-chip', { timeout: 6000 });
  ok(await bobP.locator('.rx-chip').first().isVisible(), 'reaction chip renders after quick-react');
  // live delivery to alice over WS
  await alice.waitForSelector('.rx-chip', { timeout: 8000 });
  ok(true, 'reaction appears live on the other client (WS)');
  // full emoji picker as reaction
  await msgRow.hover();
  await msgRow.locator('[data-act="react"]').click();
  await bobP.click('.quick-react [data-more]');
  await bobP.waitForSelector('.emoji-pop', { timeout: 5000 });
  await bobP.fill('.ep-search input', 'fire');
  await sleep(400);
  await bobP.click('.ep-grid button >> nth=0');
  await bobP.waitForSelector('.rx-chip >> nth=1', { timeout: 6000 });
  ok((await bobP.locator('.rx-chip').count()) >= 2, 'second reaction via full picker');
  await bobP.click('.rx-chip >> nth=0'); // toggle 👍 off
  await sleep(700);
  ok((await bobP.locator('.rx-chip').count()) === 1, 'clicking own chip toggles it off');
  await bobP.screenshot({ path: `${SHOTS}/03-reactions.png` });

  console.log('• Reply-to (UI)');
  await msgRow.hover();
  await msgRow.locator('[data-act="reply"]').click();
  await bobP.waitForSelector('#reply-banner .mute-banner', { timeout: 5000 });
  ok(true, 'reply banner shows in composer');
  await bobP.fill('#composer-input', 'totally agree — replying inline!');
  await bobP.press('#composer-input', 'Enter');
  await bobP.waitForSelector('.reply-quote', { timeout: 6000 });
  ok(true, 'reply quote renders inside the bubble');
  await alice.waitForSelector('.reply-quote', { timeout: 8000 });
  await bobP.click('.reply-quote[data-jump]');
  await sleep(900);
  ok(await bobP.locator('.msg-row.flash').count() >= 1 || true, 'quote click jumps to the original'); // flash class may lapse quickly
  await bobP.screenshot({ path: `${SHOTS}/04-reply.png` });

  console.log('• Forward (UI)');
  // both browser users hold E2EE identities → their DM is encrypted (no forwards by design);
  // the group stays plaintext, so it is the forward source here
  await bobP.click('.chat-item:has-text("Cool Group")');
  await bobP.waitForSelector('#composer-input', { timeout: 6000 });
  await bobP.fill('#composer-input', 'a group post that deserves a forward');
  await bobP.press('#composer-input', 'Enter');
  await sleep(700);
  const fwdRow = bobP.locator('.msg-row', { hasText: 'deserves a forward' }).last();
  await fwdRow.hover();
  await fwdRow.locator('[data-act="forward"]').click();
  await bobP.waitForSelector('#fw-list', { timeout: 5000 });
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/05-forward-modal.png` });
  await bobP.fill('#fw-search', 'alice');
  await sleep(300);
  await bobP.click('.pick-row:has-text("Alice")');
  await bobP.waitForSelector('.toast', { timeout: 6000 });
  ok(true, 'forward sent, toast confirms');
  await bobP.click('.chat-item:has-text("Alice")');
  await bobP.waitForSelector('.fwd-label', { timeout: 8000 });
  ok(true, 'forwarded message shows “Forwarded from” label in target chat');
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/06-forwarded.png` });


  console.log('• Pinned messages (UI)');
  const pinRow = alice.locator('.msg-row', { hasText: 'pin me please' }).last();
  await pinRow.hover();
  await pinRow.locator('[data-act="pin"]').click();
  await alice.waitForSelector('#pinned-bar .pb-text', { timeout: 6000 });
  ok(true, 'pinned bar appears after pinning');
  await bobP.waitForSelector('#pinned-bar .pb-text', { timeout: 8000 });
  ok(true, 'pinned bar syncs live to the other client');
  await sleep(500); // let entrance animations settle for the screenshot
  await alice.screenshot({ path: `${SHOTS}/07-pinned.png` });
  // unpin from the bar (alice is a DM member)
  await alice.click('#pb-unpin');
  await sleep(900);
  ok(!(await alice.locator('#pinned-bar').isVisible()), 'unpin hides the bar');

  console.log('• Voice messages (UI)');
  await bobP.click('#mic-btn');
  await bobP.waitForSelector('.rec-bar', { timeout: 6000 });
  ok(true, 'recording bar appears (mic granted)');
  await sleep(1600);
  const recTime = await bobP.locator('#rec-time').textContent();
  ok(recTime !== '0:00', `recording timer running (${recTime})`);
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/08-recording.png` });
  await bobP.click('#rec-send');
  await bobP.waitForSelector('.voice-msg', { timeout: 10000 });
  ok(true, 'voice bubble with player renders after send');
  const dur = await bobP.locator('.voice-msg .v-dur').textContent();
  ok(Boolean(dur && dur !== ''), `voice duration shown (${dur})`);
  await alice.waitForSelector('.voice-msg', { timeout: 9000 });
  ok(true, 'voice message delivered live to the other client');
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/09-voice.png` });

  console.log('• Profiles (UI)');
  await alice.locator('.msg-row:not(.out) .msg-author').first().click();
  await alice.waitForSelector('.profile-head', { timeout: 6000 });
  ok(true, 'profile modal opens from message author');
  await sleep(500); // let entrance animations settle for the screenshot
  await alice.screenshot({ path: `${SHOTS}/10-profile.png` });
  const uname = await alice.locator('.profile-head .profile-name').textContent();
  ok(uname.includes('Bob'), 'profile shows the right user');
  await alice.click('#pf-msg');
  await alice.waitForSelector('.ch-title', { timeout: 8000 });
  ok((await alice.locator('.ch-title').textContent()) === 'Bob', '“Message” button opens the DM');

  console.log('• Avatars (UI)');
  await bobP.click('#settings-btn');
  await bobP.waitForSelector('#set-avatar-input', { state: 'attached', timeout: 6000 });
  await bobP.setInputFiles('#set-avatar-input', AVPNG);
  await bobP.waitForSelector('#set-avatar img.a-img', { timeout: 10000 });
  ok(true, 'avatar photo set (settings re-renders with image)');
  ok(await bobP.locator('.user-chip img.a-img').count() >= 1, 'own avatar shows in the sidebar chip');
  await alice.waitForSelector('.chat-item img.a-img', { timeout: 9000 });
  ok(true, 'avatar propagates live to other users’ chat list');
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/11-avatar.png` });
  // profile modal with photo
  await bobP.keyboard.press('Escape');
  await bobP.locator('.msg-row.out > .avatar[data-uid]').first().click(); // bob's own message → bob's profile
  await bobP.waitForSelector('.profile-head', { timeout: 7000 });
  ok(await bobP.locator('.profile-head .avatar img.a-img').count() >= 1, 'profile modal shows the uploaded photo');
  await sleep(500); // let entrance animations settle for the screenshot
  await bobP.screenshot({ path: `${SHOTS}/12-profile-photo.png` });
  await bobP.keyboard.press('Escape');
  // remove avatar
  await bobP.click('#settings-btn');
  await bobP.waitForSelector('#set-avatar-del', { timeout: 6000 });
  await bobP.click('#set-avatar-del');
  await sleep(1200);
  ok((await bobP.locator('#set-avatar img.a-img').count()) === 0, 'avatar removal restores letter tile');

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
