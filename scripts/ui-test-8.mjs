/* UI verification for v1.6.0/1.6.1: 1:1 calls. Two browser profiles with fake
   media devices make a REAL WebRTC call over loopback through the efadro
   signaling hub: invite → ringing UI → accept → connected timer → mute/cam
   toggles → hang up with chat log; decline and video layouts too.
   Requires playwright (npm i playwright --no-save). */

import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3231;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = '/home/user/shots8';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-ui8-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'Calls UI', host: '127.0.0.1', port: PORT, serverPassword: '',
  jwtSecret: 'ui8-test-secret-0123456789abcdef0123456789abcde',
  owner: { username: 'owner', password: 'owner-passw0rd' },
  turnstile: { enabled: false, siteKey: '', secretKey: '' },
  registration: { enabled: true }, rateLimit: { enabled: false },
  // loopback-only ICE for the test lab — host candidates on 127.0.0.1 suffice
  calls: { enabled: true, ringTimeoutSec: 45, iceServers: [] },
}, null, 2));

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, EFADRO_CONFIG: path.join(tmp, 'config.json') },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

const apiReq = async (m, p, token, body) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: r.status, j: await r.json().catch(() => null) };
};

let browser = null;
const activePages = () => { try { return browser?.contexts().flatMap((c) => c.pages()) ?? []; } catch { return []; } };

async function loginPage(ctx, username, password) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[pageerror ${username}]`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[console ${username}]`, m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#server-url', { timeout: 10000 });
  await page.click('#connect-btn'); // prefilled with this origin — server URL is correct
  await page.waitForSelector('#auth-user', { timeout: 8000 });
  await page.fill('#auth-user', username);
  await page.fill('#auth-pass', password);
  await page.click('#auth-go');
  await page.waitForSelector('.shell', { timeout: 8000 });
  return page;
}

async function openDmWith(page, name) {
  await page.click('#new-chat-btn');
  await page.waitForSelector('.modal .new-chat-list');
  await page.fill('.modal .field .input', name);
  await sleep(700);
  await page.click('.pick-row');
  await page.waitForSelector('#composer-input', { timeout: 8000 });
}

/** wait until a call timer shows > 0 seconds (i.e. WebRTC connected) */
async function waitCallConnected(page, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const txt = await page.evaluate(() => document.querySelector('#call-timer')?.textContent
      || document.querySelector('#call-timer-chip')?.textContent || '');
    if (txt && txt !== '00:00' && /^\d{2}:\d{2}$/.test(txt)) return txt;
    await sleep(400);
  }
  return null;
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/info'); break; } catch { await sleep(250); } }

  // seed both accounts + a group (for the "no call buttons in groups" check)
  const gate = (await apiReq('POST', '/api/gate', null, {})).j.gateToken;
  const alice = (await apiReq('POST', '/api/auth/signup', gate, { username: 'alice', password: 'alice-password-1', displayName: 'Alice' })).j;
  const bob = (await apiReq('POST', '/api/auth/signup', gate, { username: 'bob', password: 'bob-password-1', displayName: 'Bob' })).j;
  (await apiReq('POST', '/api/chats/group', alice.token, { name: 'No-Calls Group', memberIds: [bob.user.id] }));

  browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await loginPage(ctxA, 'alice', 'alice-password-1');
  const pageB = await loginPage(ctxB, 'bob', 'bob-password-1');

  console.log('• Call buttons');
  await openDmWith(pageA, 'bob');
  ok(await pageA.isVisible('#call-audio-btn'), 'voice-call button in a DM header');
  ok(await pageA.isVisible('#call-video-btn'), 'video-call button in a DM header');
  await openDmWith(pageB, 'alice');
  ok(await pageB.isVisible('#call-audio-btn'), 'callee side also has the buttons');

  // v1.6.1: group chats ALSO show the buttons — clicking explains 1:1 only
  await pageA.click('.chat-item:has-text("No-Calls Group")');
  await pageA.waitForSelector('#composer-input', { timeout: 8000 });
  ok(await pageA.isVisible('#call-audio-btn') && await pageA.isVisible('#call-video-btn'),
    'group chats also show call buttons (v1.6.1 — always visible)');
  await pageA.click('#call-audio-btn');
  await sleep(500);
  const gToast = await pageA.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join(' '));
  ok(/group calls are not supported/i.test(gToast), 'clicking call in a group explains it is 1:1 only', gToast.slice(0, 90));
  ok((await pageA.$('#call-overlay')) === null, 'no call actually starts in a group');
  await openDmWith(pageA, 'bob');

  console.log('• Voice call: full lifecycle');
  await pageA.click('#call-audio-btn');
  await pageA.waitForSelector('.call-stage', { timeout: 6000 });
  ok(true, 'outgoing call overlay appears');
  await pageA.waitForSelector('#call-cancel', { timeout: 6000 });
  ok((await pageA.textContent('#call-status'))?.match(/Calling|Ringing/) !== null, 'caller sees Calling/Ringing status');
  await sleep(700);
  await pageA.screenshot({ path: `${SHOTS}/60-outgoing.png` });

  await pageB.waitForSelector('.call-stage', { timeout: 8000 });
  ok((await pageB.textContent('#call-status'))?.includes('Incoming voice call'), 'callee sees incoming voice call');
  ok((await pageB.textContent('.call-name')) === 'Alice', 'incoming call shows the caller name');
  await sleep(700);
  await pageB.screenshot({ path: `${SHOTS}/61-incoming.png` });

  await pageB.click('#call-accept');
  const timerA = await waitCallConnected(pageA);
  const timerB = await waitCallConnected(pageB);
  ok(Boolean(timerA), 'WebRTC connected — caller has a running timer', String(timerA));
  ok(Boolean(timerB), 'WebRTC connected — callee has a running timer', String(timerB));

  const remoteAudioB = await pageB.evaluate(() => {
    const a = document.querySelector('#call-remote-audio');
    return a?.srcObject?.getAudioTracks?.().length || 0;
  });
  ok(remoteAudioB > 0, 'callee receives the remote audio track');
  await sleep(600);
  await pageA.screenshot({ path: `${SHOTS}/62-active-audio.png` });

  await pageA.click('#call-mute');
  ok(await pageA.isVisible('#call-mute.toggled'), 'mute toggles on');
  await pageA.click('#call-mute');
  ok((await pageA.$('#call-mute.toggled')) === null, 'mute toggles back off');

  await pageB.click('#call-hangup');
  await pageA.waitForSelector('.call-stage', { state: 'detached', timeout: 8000 }).catch(() => {});
  await pageB.waitForSelector('.call-stage', { state: 'detached', timeout: 8000 }).catch(() => {});
  const overlayGone = (await pageA.$('.call-stage')) === null && (await pageB.$('.call-stage')) === null;
  ok(overlayGone, 'hangup closes both overlays');
  await pageA.waitForSelector('.sys-msg:has-text("Voice call")', { timeout: 8000 });
  ok(true, 'completed call appears in the chat history');
  await sleep(500);
  await pageA.screenshot({ path: `${SHOTS}/63-call-log.png` });

  console.log('• Decline flow');
  await pageA.click('#call-audio-btn');
  await pageB.waitForSelector('#call-decline', { timeout: 8000 });
  await pageB.click('#call-decline');
  await pageA.waitForSelector('.call-stage', { state: 'detached', timeout: 8000 }).catch(() => {});
  ok((await pageA.$('.call-stage')) === null, 'decline closes the caller overlay');
  await pageA.waitForSelector('.sys-msg:has-text("Declined call")', { timeout: 8000 });
  ok(true, 'declined call is logged in chat');

  console.log('• Video call: remote video flows');
  await pageA.click('#call-video-btn');
  await pageB.waitForSelector('#call-accept', { timeout: 8000 });
  ok((await pageB.textContent('#call-status'))?.includes('Incoming video call'), 'callee sees incoming video call');
  await pageB.click('#call-accept');
  const videoConnected = async (page) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const w = await page.evaluate(() => document.querySelector('#call-remote-video')?.videoWidth || 0);
      if (w > 0) return true;
      await sleep(500);
    }
    return false;
  };
  ok(await videoConnected(pageA), 'caller receives remote video (videoWidth > 0)');
  ok(await videoConnected(pageB), 'callee receives remote video (videoWidth > 0)');
  ok(await pageB.isVisible('#call-local-video'), 'callee sees their own preview PiP');
  await sleep(800);
  await pageB.screenshot({ path: `${SHOTS}/64-video-active.png` });

  await pageA.click('#call-cam');
  ok(await pageA.isVisible('#call-cam.toggled'), 'camera-off toggles');
  ok((await pageA.$('#call-local-video.hidden')) !== null, "caller's own preview hides when the camera is off");
  await pageB.click('#call-hangup');
  await pageA.waitForSelector('.sys-msg:has-text("Video call")', { timeout: 8000 });
  ok(true, 'video call is logged with the 📹 kind');
} catch (e) {
  failed++;
  console.error('  ✗ unexpected error:', e.message);
  try { await activePages()[0]?.screenshot({ path: `${SHOTS}/99-fatal.png` }); } catch {}
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nUI result: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
