/* UI verification for emoji panel, file sending and 2FA — requires playwright. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { totpCode } from '../server/util.js';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:3000';
const SHOTS = '/home/user/shots2';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build a real (tiny) PNG file on disk for upload
function makePng(file, r, g, b) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? 0 : 0);
    const crcTable = (t => Buffer.from([t]))(0); void crcTable;
    const crcData = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, crcData, c]);
  };
  function crc32(buf) {
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
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + 64 * 3);
  for (let i = 0; i < 64; i++) { row[1 + i * 3] = r; row[2 + i * 3] = g; row[3 + i * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: 64 }, () => row));
  const idat = zlib.deflateSync(raw);
  fs.writeFileSync(file, Buffer.concat([
    sig, chunk('IHDR', ihdr), chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}
const PNG = '/tmp/efadro-upload.png';
makePng(PNG, 99, 102, 241);

const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

try {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }
  const gate = (await (await fetch(BASE + '/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).gateToken;
  await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${gate}` }, body: JSON.stringify({ username: 'bob', password: 'bob-password-1', displayName: 'Bob' }) });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  await page.click('#tab-register');
  await page.fill('#auth-display', 'Alice');
  await page.fill('#auth-user', 'alice');
  await page.fill('#auth-pass', 'alice-password-1');
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 8000 });

  // open DM with bob
  await page.click('#new-chat-btn');
  await page.waitForSelector('.modal .new-chat-list');
  await page.fill('.modal .field .input', 'bob');
  await sleep(700);
  await page.click('.pick-row');
  await page.waitForSelector('#composer-input', { timeout: 8000 });
  await sleep(400);

  // 1) emoji panel
  await page.click('#emoji-btn');
  await sleep(800);
  await page.screenshot({ path: `${SHOTS}/e1-emoji-panel.png` });
  await page.fill('.ep-search input', 'heart');
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/e2-emoji-search.png` });
  await page.click('.ep-grid button'); // first heart
  await page.keyboard.press('Escape'); void 0;
  await page.mouse.click(640, 600); // close panel

  // jumbo emoji message + text message
  await page.fill('#composer-input', '🔥🎉✨');
  await page.press('#composer-input', 'Enter');
  await sleep(500);
  await page.fill('#composer-input', 'Nice! 😊🎉');
  await page.press('#composer-input', 'Enter');
  await sleep(900);
  await page.screenshot({ path: `${SHOTS}/e3-jumbo.png` });

  // 2) file upload via paperclip
  await page.click('#attach-btn');
  await page.setInputFiles('#attach-input', PNG);
  await page.waitForSelector('.upload-preview img', { timeout: 8000 });
  await sleep(400);
  await page.fill('#up-caption', 'A generated PNG, uploaded with progress 🧪');
  await page.screenshot({ path: `${SHOTS}/e4-upload-modal.png` });
  await page.click('[data-x="send"]');
  await sleep(1500);
  await page.waitForSelector('.msg-img', { timeout: 8000 });
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/e5-file-in-chat.png` });
  console.log('file upload via UI OK');

  // 3) 2FA wizard
  await page.click('#settings-btn');
  await page.waitForSelector('.modal');
  await sleep(300);
  await page.click('#set-2fa-on');
  await page.waitForSelector('.qr-box img', { timeout: 8000 });
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/e6-2fa-qr.png` });
  const secret = (await page.textContent('.secret-row code')).trim();
  console.log('got TOTP secret from wizard:', secret.slice(0, 6) + '…');
  await page.click('#tfa-next');
  await page.fill('#tfa-code', totpCode(secret));
  await page.click('#tfa-verify');
  await page.waitForSelector('.codes-grid', { timeout: 8000 });
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/e7-backup-codes.png` });
  await page.click('#bc-done');
  console.log('2FA enabled via UI OK');

  // 4) log out, log back in → TOTP step
  await page.click('#logout-btn');
  await page.waitForSelector('.modal');
  await page.click('[data-x="yes"]');
  await page.waitForSelector('#server-url', { timeout: 8000 });
  await sleep(300);
  await page.click('#connect-btn');
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  await page.fill('#auth-user', 'alice');
  await page.fill('#auth-pass', 'alice-password-1');
  await page.click('#auth-go');
  await page.waitForSelector('#tf-code', { timeout: 8000 });
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/e8-totp-login.png` });
  await page.fill('#tf-code', totpCode(secret));
  await page.click('#tf-go');
  await page.waitForSelector('.shell', { timeout: 8000 });
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/e9-logged-in.png` });
  console.log('TOTP login via UI OK');

  await browser.close();
  console.log('UI test 2 done');
} finally {
  child.kill('SIGTERM');
}
