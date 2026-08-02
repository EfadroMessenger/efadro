/**
 * efadro end-to-end smoke test.
 * Boots a real server instance on a temp config and exercises:
 * gate flow, auth, DMs, groups, WebSocket events, moderation hierarchy.
 *
 * Run: node scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import WebSocket from 'ws';
import { totpCode } from '../server/util.js';
import * as E2EC from '../public/js/e2ee-core.js';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = 3217;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
};

async function req(method, p, { token, gate, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (gate) headers.Authorization = `Bearer ${gate}`;
  const res = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws?token=${encodeURIComponent(token)}`);
    ws.frames = [];
    ws.waiters = [];
    ws.on('message', (raw) => {
      const f = JSON.parse(raw.toString());
      ws.frames.push(f);
      ws.waiters = ws.waiters.filter((w) => !w(f));
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
function waitFrame(ws, t, timeout = 4000, filter = () => true) {
  const existing = ws.frames.find((f) => f.t === t && filter(f));
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for '${t}'`)), timeout);
    ws.waiters.push((f) => {
      if (f.t === t && filter(f)) { clearTimeout(timer); resolve(f); return true; }
      return false;
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-smoke-'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
  serverName: 'Smoke Server',
  host: '127.0.0.1',
  port: PORT,
  serverPassword: 's3cret-pass',
  jwtSecret: 'smoke-test-secret-0123456789abcdef0123456789abcdef',
  owner: { username: 'owner', password: 'bootstrap-owner-pass' },
  turnstile: { enabled: false, siteKey: '', secretKey: '' },
  registration: { enabled: true },
  rateLimit: { enabled: false },
  uploads: { maxFileSizeMb: 1 },
}, null, 2));

console.log('\nefadro smoke test\n=================\n');
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, EFADRO_CONFIG: path.join(tmp, 'config.json') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

let exitCode = 0;
try {
  // wait for boot
  let info = null;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/info'); info = await r.json(); break; }
    catch { await sleep(250); }
  }
  if (!info) throw new Error('server did not start');

  console.log('• Server info & gates');
  ok(info.product === 'efadro', 'info identifies as efadro');
  ok(info.name === 'Smoke Server', 'server name from config');
  ok(info.serverPasswordRequired === true, 'server password flagged as required');
  ok(info.turnstile.enabled === false, 'turnstile disabled');

  const noPass = await req('POST', '/api/gate', { body: {} });
  ok(noPass.status === 403, 'gate rejects missing password');
  const wrongPass = await req('POST', '/api/gate', { body: { serverPassword: 'nope' } });
  ok(wrongPass.status === 403, 'gate rejects wrong password');
  const goodGate = await req('POST', '/api/gate', { body: { serverPassword: 's3cret-pass' } });
  ok(goodGate.status === 200 && goodGate.json.gateToken, 'gate issues token with correct password');
  const gate = goodGate.json.gateToken;

  console.log('• Auth');
  const noGateSignup = await req('POST', '/api/auth/signup', { body: { username: 'xuser', password: 'password123' } });
  ok(noGateSignup.status === 401, 'signup blocked without gate token');
  const badUser = await req('POST', '/api/auth/signup', { gate, body: { username: 'no spaces!', password: 'password123' } });
  ok(badUser.status === 400, 'invalid username rejected');
  const shortPw = await req('POST', '/api/auth/signup', { gate, body: { username: 'alice', password: 'short' } });
  ok(shortPw.status === 400, 'short password rejected');

  const signup = async (u) => (await req('POST', '/api/auth/signup', { gate, body: { username: u, password: `${u}-password-1`, displayName: u[0].toUpperCase() + u.slice(1) } })).json;
  const alice = await signup('alice');
  const bob = await signup('bob');
  const carol = await signup('carol');
  ok(alice?.token && bob?.token && carol?.token, 'three users registered');
  const dup = await req('POST', '/api/auth/signup', { gate, body: { username: 'ALICE', password: 'password1234' } });
  ok(dup.status === 409, 'duplicate username (case-insensitive) rejected');

  const ownerLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'owner', password: 'bootstrap-owner-pass' } });
  ok(ownerLogin.status === 200 && ownerLogin.json.user.role === 'owner', 'owner from config.json logs in with owner role');
  const owner = ownerLogin.json;
  const wrongLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'alice', password: 'wrong' } });
  ok(wrongLogin.status === 401, 'wrong login rejected');

  const meA = await req('GET', '/api/auth/me', { token: alice.token });
  ok(meA.status === 200 && meA.json.user.username === 'alice', 'GET /me works');

  console.log('• Chats & messages (REST)');
  const dmRes = await req('POST', '/api/chats/dm', { token: alice.token, body: { userId: bob.user.id } });
  ok(dmRes.status === 200 && dmRes.json.chat.type === 'dm', 'alice creates DM with bob');
  const dm = dmRes.json.chat;
  const dmDup = await req('POST', '/api/chats/dm', { token: bob.token, body: { userId: alice.user.id } });
  ok(dmDup.json.chat.id === dm.id, 'DM is reused, not duplicated');
  const bobChats = await req('GET', '/api/chats', { token: bob.token });
  ok(bobChats.json.chats.some((c) => c.id === dm.id), 'bob sees the DM in his list');

  const m1 = await req('POST', `/api/chats/${dm.id}/messages`, { token: alice.token, body: { content: 'hello bob!' } });
  ok(m1.status === 201 && m1.json.message.content === 'hello bob!', 'alice sends a message');
  const longMsg = await req('POST', `/api/chats/${dm.id}/messages`, { token: alice.token, body: { content: 'x'.repeat(5000) } });
  ok(longMsg.status === 400, 'over-length message rejected');
  const bobUnread = await req('GET', '/api/chats', { token: bob.token });
  ok(bobChats && bobUnread.json.chats.find((c) => c.id === dm.id)?.unread === 1, 'bob has 1 unread message');
  const bobMsgs = await req('GET', `/api/chats/${dm.id}/messages`, { token: bob.token });
  ok(bobMsgs.json.messages.length === 1, 'bob reads message history');
  const bobUnread2 = await req('GET', '/api/chats', { token: bob.token });
  ok(bobUnread2.json.chats.find((c) => c.id === dm.id)?.unread === 0, 'unread cleared after fetching history');

  const outsiderMsg = await req('POST', `/api/chats/${dm.id}/messages`, { token: carol.token, body: { content: 'im not in this chat' } });
  ok(outsiderMsg.status === 403, 'non-member cannot post to the DM');

  const edited = await req('PATCH', `/api/messages/${m1.json.message.id}`, { token: alice.token, body: { content: 'hello bob (edited)' } });
  ok(edited.status === 200 && edited.json.message.editedAt, 'author edits message');
  const editOther = await req('PATCH', `/api/messages/${m1.json.message.id}`, { token: bob.token, body: { content: 'hax' } });
  ok(editOther.status === 403, 'non-author cannot edit');

  console.log('• WebSocket realtime');
  const wsBob = await wsConnect(bob.token); // bob first so alice's ready frame already lists him
  const wsAlice = await wsConnect(alice.token);
  const readyA = await waitFrame(wsAlice, 'ready');
  ok(readyA.data.user.username === 'alice', 'ws ready frame carries self');
  ok(readyA.data.online.includes(bob.user.id), 'ready frame includes currently-online users');
  const presP = waitFrame(wsAlice, 'presence', 4000, (f) => f.data.userId === bob.user.id && f.data.online === true);
  const wsBob2 = await wsConnect(bob.token); // second device
  await presP;
  ok(true, 'presence broadcast works', '');
  wsBob2.close();

  const wsMsgP = waitFrame(wsBob, 'msg:new', 4000, (f) => f.data.message.chatId === dm.id);
  await req('POST', `/api/chats/${dm.id}/messages`, { token: alice.token, body: { content: 'via rest → ws' } });
  const wsMsg = await wsMsgP;
  ok(wsMsg.data.message.content === 'via rest → ws', 'REST send reaches WS listeners');

  const wsSendP = waitFrame(wsAlice, 'msg:new', 4000, (f) => f.data.message.content === 'via ws → ws');
  wsBob.send(JSON.stringify({ t: 'msg:send', data: { chatId: dm.id, content: 'via ws → ws', clientId: 'c1' } }));
  await wsSendP;
  ok(true, 'WS send reaches other members');

  const typingP = waitFrame(wsAlice, 'typing', 4000, (f) => f.data.user.username === 'bob');
  wsBob.send(JSON.stringify({ t: 'typing', data: { chatId: dm.id, typing: true } }));
  await typingP;
  ok(true, 'typing indicator delivered');

  const readP = waitFrame(wsAlice, 'read', 4000, (f) => f.data.userId === bob.user.id);
  const lastId = (await req('GET', `/api/chats/${dm.id}/messages`, { token: bob.token })).json.messages.at(-1).id;
  wsBob.send(JSON.stringify({ t: 'read', data: { chatId: dm.id, messageId: lastId } }));
  const readF = await readP;
  ok(readF.data.messageId === lastId, 'read receipts synchronized');
  const dmAfterRead = (await req('GET', `/api/chats/${dm.id}`, { token: alice.token })).json.chat;
  ok(dmAfterRead.members.find((m) => m.id === bob.user.id)?.lastRead === lastId, 'peer lastRead updates (seen ✓✓)');

  console.log('• Groups');
  const grp = (await req('POST', '/api/chats/group', {
    token: alice.token, body: { name: 'Test Group', memberIds: [bob.user.id, carol.user.id] },
  })).json.chat;
  ok(grp?.type === 'group' && grp.members.length === 3, 'group created with 3 members');
  const wsCarol = await wsConnect(carol.token);
  const grpMsgP = waitFrame(wsCarol, 'msg:new', 4000, (f) => f.data.message.chatId === grp.id);
  wsBob.send(JSON.stringify({ t: 'msg:send', data: { chatId: grp.id, content: 'group hello' } }));
  await grpMsgP;
  ok(true, 'group message broadcast to all members');
  const chatNewP = waitFrame(wsCarol, 'chat:updated', 4000, (f) => f.data.chat.id === grp.id);
  await req('PATCH', `/api/chats/${grp.id}`, { token: bob.token, body: { name: 'Renamed Group' } });
  await chatNewP;
  ok(true, 'group rename broadcast');
  const ghost = await req('POST', `/api/chats/${grp.id}/messages`, { token: bob.token, body: { content: 'still here' } });
  ok(ghost.status === 201, 'member posts in group');

  console.log('• Saved messages');
  const saved = (await req('POST', '/api/chats/dm', { token: carol.token, body: { userId: carol.user.id } })).json.chat;
  ok(saved?.type === 'dm' && saved.members.length === 1, 'self-chat (saved messages) works');

  console.log('• Moderation hierarchy');
  const bobAdminTry = await req('GET', '/api/admin/users', { token: bob.token });
  ok(bobAdminTry.status === 403, 'regular user blocked from staff API');

  const promMod = await req('PATCH', `/api/admin/users/${alice.user.id}/role`, { token: owner.token, body: { role: 'moderator' } });
  ok(promMod.status === 200 && promMod.json.user.role === 'moderator', 'owner promotes alice → moderator');
  const selfFrameP = waitFrame(wsAlice, 'user:self', 4000, (f) => f.data.user.role === 'moderator');
  ok((await selfFrameP).data.user.role === 'moderator', 'role change pushed live to the user');

  const banByMod = await req('POST', `/api/admin/users/${bob.user.id}/ban`, { token: alice.token, body: {} });
  ok(banByMod.status === 403, 'moderator cannot ban');

  const muteByMod = await req('POST', `/api/admin/users/${bob.user.id}/mute`, { token: alice.token, body: { minutes: 10, reason: 'test mute' } });
  ok(muteByMod.status === 200 && muteByMod.json.user.mutedUntil > Date.now(), 'moderator mutes bob');
  const mutedPost = await req('POST', `/api/chats/${dm.id}/messages`, { token: bob.token, body: { content: 'am i muted?' } });
  ok(mutedPost.status === 403 && mutedPost.json.code === 'muted', 'muted user cannot send messages');

  const modBanOwner = await req('POST', `/api/admin/users/${owner.user.id}/mute`, { token: alice.token, body: { minutes: 5 } });
  ok(modBanOwner.status === 403, 'moderator cannot touch the owner (hierarchy)');

  const unmute = await req('POST', `/api/admin/users/${bob.user.id}/unmute`, { token: alice.token, body: {} });
  ok(unmute.status === 200 && unmute.json.user.mutedUntil === 0, 'unmute works');

  const delOtherAsMember = await req('DELETE', `/api/messages/${ghost.json.message.id}`, { token: carol.token });
  ok(delOtherAsMember.status === 403, 'regular user cannot delete others’ messages');
  const delAsMod = await req('DELETE', `/api/messages/${ghost.json.message.id}`, { token: alice.token });
  ok(delAsMod.status === 200, 'moderator deletes lower-role user’s message');
  const deletedGone = await req('GET', `/api/chats/${grp.id}/messages`, { token: bob.token });
  ok(!deletedGone.json.messages.some((m) => m.id === ghost.json.message.id), 'deleted message disappears from history');

  console.log('• Admin actions');
  const promAdmin = await req('PATCH', `/api/admin/users/${alice.user.id}/role`, { token: owner.token, body: { role: 'admin' } });
  ok(promAdmin.status === 200, 'owner promotes alice → admin');
  const selfRoleOwner = await req('PATCH', `/api/admin/users/${owner.user.id}/role`, { token: owner.token, body: { role: 'user' } });
  ok(selfRoleOwner.status === 400, 'owner cannot change their own role');
  const banCarol = await req('POST', `/api/admin/users/${carol.user.id}/ban`, { token: alice.token, body: { reason: 'rule 1' } });
  ok(banCarol.status === 200 && banCarol.json.user.banned === true, 'admin bans carol');
  const carolApi = await req('GET', '/api/chats', { token: carol.token });
  ok(carolApi.status === 401, 'banned user’s token is invalidated');
  const carolLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'carol', password: 'carol-password-1' } });
  ok(carolLogin.status === 403 && carolLogin.json.code === 'banned', 'banned login gives clear reason');
  const kf = wsCarol.frames.find((f) => f.t === 'force_logout');
  ok(Boolean(kf), 'banned user received force_logout push');
  const unbanCarol = await req('POST', `/api/admin/users/${carol.user.id}/unban`, { token: alice.token, body: {} });
  ok(unbanCarol.status === 200, 'unban works');
  const carolRelogin = await req('POST', '/api/auth/login', { gate, body: { username: 'carol', password: 'carol-password-1' } });
  ok(carolRelogin.status === 200, 'unbanned user can sign in again');

  const kickBob = await req('POST', `/api/admin/users/${bob.user.id}/kick`, { token: alice.token, body: {} });
  ok(kickBob.status === 200, 'kick signs out sessions');
  await sleep(150);
  const bobAfterKick = await req('GET', '/api/chats', { token: bob.token });
  ok(bobAfterKick.status === 401, 'kicked user token invalidated');

  const bootstrapProtect = await req('POST', `/api/admin/users/${owner.user.id}/ban`, { token: alice.token, body: {} });
  ok(bootstrapProtect.status === 403, 'bootstrap owner cannot be banned');

  console.log('• Reports & audit');
  const bobFresh = await loginFresh(gate, 'bob');
  ok(bobFresh?.token, 'kicked user can sign in again');
  const ownReport = await req('POST', `/api/messages/${lastId}/report`, { token: bobFresh.token, body: { reason: 'spam' } });
  ok(ownReport.status === 400, 'users cannot report their own message');
  const report = await req('POST', `/api/messages/${m1.json.message.id}/report`, { token: bobFresh.token, body: { reason: 'spam' } });
  ok(report.status === 200, 'report submitted');
  const repList = await req('GET', '/api/admin/reports', { token: alice.token });
  ok(repList.status === 200 && repList.json.reports.length >= 1, 'moderator+ sees open reports');
  const repId = repList.json.reports[0]?.id;
  const resolve = await req('POST', `/api/admin/reports/${repId}/resolve`, { token: alice.token, body: {} });
  ok(resolve.status === 200, 'report resolved');
  const audit = await req('GET', '/api/admin/audit', { token: alice.token });
  ok(audit.status === 200 && audit.json.entries.some((e) => e.action === 'ban'), 'audit log records moderation actions');
  const stats = await req('GET', '/api/admin/stats', { token: alice.token });
  ok(stats.status === 200 && stats.json.stats.users >= 4, 'stats endpoint works');

  console.log('• File upload & download');
  // tiny valid PNG (1x1)
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('caption', 'a picture for you');
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'pixel.png');
  const upRes = await fetch(`${BASE}/api/chats/${dm.id}/files`, {
    method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: form,
  });
  const upJson = await upRes.json();
  ok(upRes.status === 201 && upJson.message?.file?.name === 'pixel.png', 'image upload creates message with file');
  ok(upJson.message.content === 'a picture for you', 'file caption stored');
  const fMsgP = waitFrame(wsAlice, 'msg:new', 4000, (f) => f.data.message.file?.id === upJson.message.file.id);
  ok((await fMsgP).data.message.file.id === upJson.message.file.id, 'file message broadcast over WS');

  const dl = await fetch(`${BASE}/api/files/${upJson.message.file.id}`, { headers: { authorization: `Bearer ${bobFresh.token}` } });
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && dlBuf.equals(pngBytes), 'member downloads exact bytes');
  ok((dl.headers.get('content-disposition') || '').startsWith('inline'), 'images served inline');
  const dlQuery = await fetch(`${BASE}/api/files/${upJson.message.file.id}?t=${encodeURIComponent(alice.token)}`);
  ok(dlQuery.status === 200, 'query-token download works (for <img> tags)');
  const dlNoAuth = await fetch(`${BASE}/api/files/${upJson.message.file.id}`);
  ok(dlNoAuth.status === 401, 'download without token rejected');
  const carolFresh = await loginFresh(gate, 'carol');
  const dlOut = await fetch(`${BASE}/api/files/${upJson.message.file.id}?t=${encodeURIComponent(carolFresh.token)}`);
  ok(dlOut.status === 403, 'non-member cannot download');
  const bigForm = new FormData();
  bigForm.append('file', new Blob([new Uint8Array(1.6 * 1024 * 1024)], { type: 'application/octet-stream' }), 'big.bin');
  const bigRes = await fetch(`${BASE}/api/chats/${dm.id}/files`, {
    method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: bigForm,
  });
  ok(bigRes.status === 413, 'oversized file rejected with 413');
  const upOutsider = new FormData();
  upOutsider.append('file', new Blob([Buffer.from('x')], { type: 'text/plain' }), 'x.txt');
  const upOutRes = await fetch(`${BASE}/api/chats/${dm.id}/files`, {
    method: 'POST', headers: { authorization: `Bearer ${carolFresh.token}` }, body: upOutsider,
  });
  ok(upOutRes.status === 403, 'non-member cannot upload to a DM');

  console.log('• Reactions');
  const react1 = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '👍' } });
  ok(react1.status === 200 && react1.json.reactions.some((r) => r.emoji === '👍' && r.count === 1 && r.me === true), 'reaction added, personalized summary returned');
  const reactOff = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '👍' } });
  ok(reactOff.status === 200 && reactOff.json.reactions.length === 0, 'same reaction again toggles it off');
  const wsBobF = await wsConnect(bobFresh.token);
  const rxFrameP = waitFrame(wsBobF, 'msg:reaction', 4000, (f) => f.data.messageId === m1.json.message.id && f.data.reactions.some((r) => r.emoji === '❤️'));
  await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: alice.token, body: { emoji: '❤️' } });
  await rxFrameP;
  ok(true, 'reaction updates broadcast live over WS');
  const reactBad = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: 'nope' } });
  ok(reactBad.status === 400, 'non-emoji reaction rejected');
  const reactOutsider = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: carolFresh.token, body: { emoji: '👍' } });
  ok(reactOutsider.status === 403, 'non-member cannot react');
  const many = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '😂' } });
  const many2 = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '🔥' } });
  const many3 = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '😮' } });
  const many4 = await req('POST', `/api/messages/${m1.json.message.id}/reactions`, { token: bobFresh.token, body: { emoji: '🎉' } });
  ok(many.status === 200 && many2.status === 200 && many3.status === 200 && many4.status === 400, 'max 3 distinct reactions per user enforced');
  const histWithRx = await req('GET', `/api/chats/${dm.id}/messages`, { token: bobFresh.token });
  const m1Hist = histWithRx.json.messages.find((m) => m.id === m1.json.message.id);
  ok(m1Hist?.reactions.length >= 3 && m1Hist.reactions.some((r) => r.me), 'history payload carries reactions (with viewer flag)');

  console.log('• Replies & forwards');
  const reply = await req('POST', `/api/chats/${dm.id}/messages`, { token: bobFresh.token, body: { content: 'replying to you', replyTo: m1.json.message.id } });
  ok(reply.status === 201 && reply.json.message.replyTo?.id === m1.json.message.id, 'reply created with quoted parent');
  ok(reply.json.message.replyTo?.authorName === 'Alice' && reply.json.message.replyTo?.snippet.includes('edited'), 'reply quote carries author + snippet');
  const gMsgForX = await req('POST', `/api/chats/${grp.id}/messages`, { token: alice.token, body: { content: 'cross chat target' } });
  const xReply = await req('POST', `/api/chats/${dm.id}/messages`, { token: bobFresh.token, body: { content: 'x', replyTo: gMsgForX.json.message.id } });
  ok(xReply.status === 400, 'reply to a message in another chat rejected');
  const bobSaved = (await req('POST', '/api/chats/dm', { token: bobFresh.token, body: { userId: bob.user.id } })).json.chat;
  const fwd = await req('POST', `/api/messages/${m1.json.message.id}/forward`, { token: bobFresh.token, body: { chatId: bobSaved.id } });
  ok(fwd.status === 201 && fwd.json.message.fwdFrom === 'Alice' && fwd.json.message.content.includes('edited'), 'forward copies content with attribution');
  const fwdFile = await req('POST', `/api/messages/${upJson.message.id}/forward`, { token: bobFresh.token, body: { chatId: grp.id } });
  ok(fwdFile.status === 201 && fwdFile.json.message.file?.name === 'pixel.png', 'forwarding a file message keeps the attachment');
  const fwdFileDl = await fetch(`${BASE}/api/files/${fwdFile.json.message.file.id}`, { headers: { authorization: `Bearer ${carolFresh.token}` } });
  ok(fwdFileDl.status === 200, 'forwarded file downloadable by target chat members');
  const fwdOut = await req('POST', `/api/messages/${m1.json.message.id}/forward`, { token: carolFresh.token, body: { chatId: bobSaved.id } });
  ok(fwdOut.status === 403, 'outsider cannot forward from a chat they are not in');

  console.log('• Pinned messages');
  const pinWsP = waitFrame(wsAlice, 'chat:updated', 4000, (f) => f.data.chat.id === dm.id && f.data.chat.pinnedMessage?.id === m1.json.message.id);
  const pinDm = await req('POST', `/api/messages/${m1.json.message.id}/pin`, { token: bobFresh.token, body: { pin: true } });
  ok(pinDm.status === 200, 'DM member can pin');
  await pinWsP;
  ok(true, 'pin pushes live chat:updated with pinnedMessage');
  const unpinDm = await req('POST', `/api/messages/${m1.json.message.id}/pin`, { token: bobFresh.token, body: { pin: false } });
  ok(unpinDm.status === 200, 'unpin works');
  const pinByMember = await req('POST', `/api/messages/${gMsgForX.json.message.id}/pin`, { token: carolFresh.token, body: { pin: true } });
  ok(pinByMember.status === 403, 'regular group member cannot pin in a group');
  const pinByCreator = await req('POST', `/api/messages/${gMsgForX.json.message.id}/pin`, { token: alice.token, body: { pin: true } });
  ok(pinByCreator.status === 200, 'group creator pins');
  const grpNow = (await req('GET', `/api/chats/${grp.id}`, { token: carolFresh.token })).json.chat;
  ok(grpNow.pinnedMessage?.id === gMsgForX.json.message.id, 'chat payload exposes the pinned message');

  console.log('• Voice messages');
  const voiceForm = new FormData();
  voiceForm.append('kind', 'voice');
  voiceForm.append('duration', '1234');
  voiceForm.append('file', new Blob([Buffer.from('OggS-test-audio-bytes')], { type: 'audio/webm' }), 'voice-message.webm');
  const voiceRes = await fetch(`${BASE}/api/chats/${dm.id}/files`, {
    method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: voiceForm,
  });
  const voiceJson = await voiceRes.json();
  ok(voiceRes.status === 201 && voiceJson.message?.file?.kind === 'voice' && voiceJson.message?.file?.duration === 1234, 'voice upload keeps kind + duration');

  console.log('• Profiles & avatars');
  const avForm = new FormData();
  avForm.append('avatar', new Blob([pngBytes], { type: 'image/png' }), 'me.png');
  const avRes = await fetch(`${BASE}/api/avatars`, {
    method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: avForm,
  });
  const avJson = await avRes.json();
  ok(avRes.status === 200 && avJson.user?.avatarUrl === `/api/avatars/${alice.user.id}`, 'avatar upload sets avatarUrl');
  const avGet = await fetch(`${BASE}/api/avatars/${alice.user.id}`, { headers: { authorization: `Bearer ${bobFresh.token}` } });
  const avBuf = Buffer.from(await avGet.arrayBuffer());
  ok(avGet.status === 200 && avBuf.equals(pngBytes), 'other members can fetch the avatar bytes');
  const avNoAuth = await fetch(`${BASE}/api/avatars/${alice.user.id}`);
  ok(avNoAuth.status === 401, 'avatar fetch requires auth');
  const profile = await req('GET', `/api/users/${alice.user.id}/profile`, { token: bobFresh.token });
  ok(profile.status === 200 && profile.json.user.username === 'alice' && profile.json.user.avatarUrl && 'online' in profile.json.user, 'profile endpoint returns public card + presence');
  const avDel = await req('DELETE', '/api/avatars', { token: alice.token });
  ok(avDel.status === 200 && avDel.json.user.avatarUrl === null, 'avatar removal works');
  const avGone = await fetch(`${BASE}/api/avatars/${alice.user.id}`, { headers: { authorization: `Bearer ${bobFresh.token}` } });
  ok(avGone.status === 404, 'removed avatar 404s');

  console.log('• Message search');
  const needle = await req('POST', `/api/chats/${dm.id}/messages`, { token: alice.token, body: { content: 'pineapple pancakes for breakfast' } });
  ok(needle.status === 201, 'seed message for search');
  const srch = await req('GET', `/api/chats/${dm.id}/messages/search?q=pineapple`, { token: bobFresh.token });
  ok(srch.status === 200 && srch.json.results.some((r) => r.id === needle.json.message.id && r.hasFile === 0), 'search finds the message');
  const srchNone = await req('GET', `/api/chats/${dm.id}/messages/search?q=zzzznope`, { token: bobFresh.token });
  ok(srchNone.status === 200 && srchNone.json.results.length === 0, 'search with no hits returns empty');
  const srchEmpty = await req('GET', `/api/chats/${dm.id}/messages/search?q=`, { token: bobFresh.token });
  ok(srchEmpty.status === 400, 'empty query rejected');
  const srchOut = await req('GET', `/api/chats/${dm.id}/messages/search?q=pineapple`, { token: carolFresh.token });
  ok(srchOut.status === 404, 'non-member cannot search a chat');

  console.log('• System messages');
  const grp2 = (await req('POST', '/api/chats/group', { token: bobFresh.token, body: { name: 'Sys Group', memberIds: [alice.user.id] } })).json.chat;
  const g2msgs = await req('GET', `/api/chats/${grp2.id}/messages`, { token: alice.token });
  const createSys = g2msgs.json.messages.at(-1);
  ok(createSys?.system === true && createSys.content.includes('created the group'), 'group creation writes a system message');
  await req('PATCH', `/api/chats/${grp2.id}`, { token: bobFresh.token, body: { name: 'Sys Group 2' } });
  const g2msgs2 = await req('GET', `/api/chats/${grp2.id}/messages`, { token: alice.token });
  ok(g2msgs2.json.messages.at(-1)?.system === true && g2msgs2.json.messages.at(-1).content.includes('renamed the group'), 'rename writes a system message');
  const erin = await req('POST', '/api/auth/signup', { gate, body: { username: 'erin', password: 'erin-password-1', displayName: 'Erin' } });
  await req('POST', `/api/chats/${grp2.id}/members`, { token: bobFresh.token, body: { userIds: [erin.json.user.id] } });
  const g2msgs3 = await req('GET', `/api/chats/${grp2.id}/messages`, { token: bobFresh.token });
  ok(g2msgs3.json.messages.at(-1)?.system === true && g2msgs3.json.messages.at(-1).content.includes('added Erin'), 'member-add writes a system message');
  await req('DELETE', `/api/chats/${grp2.id}/members/${alice.user.id}`, { token: bobFresh.token });
  const g2msgs4 = await req('GET', `/api/chats/${grp2.id}/messages`, { token: bobFresh.token });
  ok(g2msgs4.json.messages.at(-1)?.system === true && g2msgs4.json.messages.at(-1).content.includes('removed Alice'), 'member-remove writes a system message');
  const srchSys = await req('GET', `/api/chats/${grp2.id}/messages/search?q=group`, { token: bobFresh.token });
  ok(!srchSys.json.results.length || srchSys.json.results.every((r) => !r.content.includes('created the group')), 'system messages are excluded from search');

  console.log('• Delete direct chat');
  const dmCD = (await req('POST', '/api/chats/dm', { token: carolFresh.token, body: { userId: erin.json.user.id } })).json.chat;
  await req('POST', `/api/chats/${dmCD.id}/messages`, { token: carolFresh.token, body: { content: 'temporary dm' } });
  const delDM = await req('DELETE', `/api/chats/${dmCD.id}/members/${carolFresh.user.id}`, { token: carolFresh.token });
  ok(delDM.status === 200, 'carol leaves (deletes) the DM');
  const carolChatsNow = await req('GET', '/api/chats', { token: carolFresh.token });
  ok(!carolChatsNow.json.chats.some((c) => c.id === dmCD.id), 'chat gone from carol’s list');
  const erinStill = await req('GET', '/api/chats', { token: erin.json.token });
  ok(erinStill.json.chats.some((c) => c.id === dmCD.id), 'erin keeps her copy');
  await req('POST', `/api/chats/${dmCD.id}/messages`, { token: erin.json.token, body: { content: 'hello?' } });
  const dmRejoin = (await req('POST', '/api/chats/dm', { token: carolFresh.token, body: { userId: erin.json.user.id } })).json.chat;
  ok(dmRejoin?.id === dmCD.id, 're-opening recreates the same DM');
  ok(dmRejoin?.unread === 0, 'no unread backlog after re-joining');

  console.log('• Chat prefs (pin/archive/mute)');
  const p1 = await req('PATCH', `/api/chats/${grp.id}/prefs`, { token: carolFresh.token, body: { pinned: true, muted: true } });
  ok(p1.status === 200 && p1.json.prefs.pinned === true && p1.json.prefs.muted === true, 'prefs updated for carol');
  const carolListP = (await req('GET', '/api/chats', { token: carolFresh.token })).json.chats.find((c) => c.id === grp.id);
  ok(carolListP.prefs?.pinned === true && carolListP.prefs?.muted === true && carolListP.prefs?.archived === false, 'prefs persisted in chat payload');
  const bobListP = (await req('GET', '/api/chats', { token: bobFresh.token })).json.chats.find((c) => c.id === grp.id);
  ok(!bobListP.prefs?.pinned, 'prefs are per-user (bob unaffected)');
  const pEmpty = await req('PATCH', `/api/chats/${grp.id}/prefs`, { token: carolFresh.token, body: {} });
  ok(pEmpty.status === 400, 'empty prefs patch rejected');
  const pOut = await req('PATCH', `/api/chats/${grp.id}/prefs`, { token: erin.json.token, body: { pinned: true } });
  ok(pOut.status === 404, 'outsider cannot set prefs');
  await req('PATCH', `/api/chats/${grp.id}/prefs`, { token: carolFresh.token, body: { archived: true } });
  const carolListP2 = (await req('GET', '/api/chats', { token: carolFresh.token })).json.chats.find((c) => c.id === grp.id);
  ok(carolListP2.prefs?.archived === true, 'archive persists');
  await req('PATCH', `/api/chats/${grp.id}/prefs`, { token: carolFresh.token, body: { archived: false, muted: false, pinned: false } });

  console.log('• Global message search');
  await req('POST', `/api/chats/${grp.id}/messages`, { token: bobFresh.token, body: { content: 'the quixotic umbrella protocol' } });
  await req('POST', `/api/chats/${dm.id}/messages`, { token: alice.token, body: { content: 'umbrella meetup tomorrow' } });
  const gs1 = await req('GET', '/api/chats/search/messages?q=umbrella', { token: alice.token });
  ok(gs1.status === 200 && gs1.json.results.length >= 2, 'global search spans multiple chats');
  ok(gs1.json.results.every((r) => r.chatId && r.authorName), 'results carry chat + author');
  const gsErine = await req('GET', '/api/chats/search/messages?q=umbrella', { token: erin.json.token });
  ok(gsErine.json.results.length === 0, 'outsiders see nothing (membership-scoped)');
  const gsShort = await req('GET', '/api/chats/search/messages?q=u', { token: alice.token });
  ok(gsShort.status === 400, 'single-character global search rejected');

  console.log('• Polls');
  const grpPoll = await req('POST', `/api/chats/${grp.id}/polls`, { token: bobFresh.token, body: { question: 'Pizza day?', options: ['Friday', 'Monday', 'Wednesday'] } });
  ok(grpPoll.status === 201 && grpPoll.json.message.poll, 'poll created');
  ok(grpPoll.json.message.poll.question === 'Pizza day?' && grpPoll.json.message.poll.options.length === 3, 'poll payload carries question + options');
  const pollMsgId = grpPoll.json.message.id;
  const pollOpt1 = grpPoll.json.message.poll.options[0].id;
  const pollOpt2 = grpPoll.json.message.poll.options[1].id;
  ok((await req('POST', `/api/chats/${grp.id}/polls`, { token: bobFresh.token, body: { question: 'x', options: ['one'] } })).status === 400, 'poll with 1 option rejected');
  ok((await req('POST', `/api/chats/${grp.id}/polls`, { token: bobFresh.token, body: { question: 'x', options: ['1','2','3','4','5','6','7','8','9','10','11'] } })).status === 400, 'poll with 11 options rejected');
  ok((await req('POST', `/api/chats/${grp.id}/polls`, { token: erin.json.token, body: { question: 'x', options: ['a', 'b'] } })).status === 403, 'non-member cannot create a poll');
  const wsPollBob = await wsConnect(bobFresh.token);
  const pollUpdP = waitFrame(wsPollBob, 'poll:update', 5000, (f) => f.data.messageId === pollMsgId);
  const vote1 = await req('POST', `/api/messages/${pollMsgId}/vote`, { token: carolFresh.token, body: { optionId: pollOpt1 } });
  ok(vote1.status === 200 && vote1.json.poll.myVote === pollOpt1 && vote1.json.poll.totalVoters === 1, 'vote counted + personalized myVote');
  const pollUpd = await pollUpdP;
  ok(pollUpd.data.poll.options.find((o) => o.id === pollOpt1)?.votes === 1 && pollUpd.data.poll.myVote === null, 'poll:update broadcast is live + viewer-scoped');
  const vote2 = await req('POST', `/api/messages/${pollMsgId}/vote`, { token: carolFresh.token, body: { optionId: pollOpt2 } });
  ok(vote2.json.poll.options.find((o) => o.id === pollOpt1).votes === 0 && vote2.json.poll.options.find((o) => o.id === pollOpt2).votes === 1, 'changing vote moves the tally');
  const retract = await req('POST', `/api/messages/${pollMsgId}/vote`, { token: carolFresh.token, body: { optionId: null } });
  ok(retract.json.poll.totalVoters === 0 && retract.json.poll.myVote === null, 'vote retracted');
  ok((await req('POST', `/api/messages/${pollMsgId}/vote`, { token: carolFresh.token, body: { optionId: 99999 } })).status === 400, 'unknown option rejected');
  ok((await req('POST', `/api/messages/${pollMsgId}/vote`, { token: erin.json.token, body: { optionId: pollOpt1 } })).status === 404, 'outsider cannot vote');
  ok((await req('POST', `/api/messages/${pollMsgId}/forward`, { token: bobFresh.token, body: { chatId: dm.id } })).status === 400, 'polls cannot be forwarded');
  wsPollBob.close();

  console.log('• Mention counters & jump');
  const men1 = await req('POST', `/api/chats/${grp.id}/messages`, { token: bobFresh.token, body: { content: 'hey @carol standup time' } });
  const carolMen = (await req('GET', '/api/chats', { token: carolFresh.token })).json.chats.find((c) => c.id === grp.id);
  ok(carolMen.unreadMentions === 1, 'mention bumps the badge counter');
  await req('POST', `/api/chats/${grp.id}/messages`, { token: bobFresh.token, body: { content: 'again @carol wake up' } });
  const carolMen2 = (await req('GET', '/api/chats', { token: carolFresh.token })).json.chats.find((c) => c.id === grp.id);
  ok(carolMen2.unreadMentions === 2, 'counter accumulates');
  const menJump = await req('GET', `/api/chats/${grp.id}/mention-jump`, { token: carolFresh.token });
  ok(menJump.status === 200 && menJump.json.messageId === men1.json.message.id, 'mention-jump targets the FIRST unread mention');
  const carolMax = (await req('GET', `/api/chats/${grp.id}/messages?limit=1`, { token: carolFresh.token })).json.messages.at(-1).id;
  await req('POST', `/api/chats/${grp.id}/read`, { token: carolFresh.token, body: { messageId: carolMax } });
  ok((await req('GET', '/api/chats', { token: carolFresh.token })).json.chats.find((c) => c.id === grp.id).unreadMentions === 0, 'reading clears the mention badge');
  await req('POST', `/api/chats/${dm.id}/messages`, { token: bobFresh.token, body: { content: 'hey @alice dm ping' } });
  ok((await req('GET', '/api/chats', { token: alice.token })).json.chats.find((c) => c.id === dm.id).unreadMentions === 0, 'DM mentions do not badge');

  console.log('• Group invite links');
  const inv1 = await req('POST', `/api/chats/${grp.id}/invite`, { token: alice.token });
  ok(inv1.status === 201 && inv1.json.invite?.token, 'creator creates an invite link');
  const invGet = await req('GET', `/api/chats/${grp.id}/invite`, { token: alice.token });
  ok(invGet.json.invite?.token === inv1.json.invite.token, 'invite readable afterwards');
  ok((await req('POST', `/api/chats/${grp.id}/invite`, { token: carolFresh.token })).status === 403, 'plain member cannot manage invites');
  const fred = await signup('fred');
  const membersBefore = (await req('GET', `/api/chats/${grp.id}`, { token: bobFresh.token })).json.chat.members.length;
  const fredJoin = await req('POST', `/api/invites/${inv1.json.invite.token}/join`, { token: fred.token });
  ok(fredJoin.status === 200 && fredJoin.json.alreadyMember === false && fredJoin.json.chat.members.length === membersBefore + 1, 'invite link joins the group');
  const fredHist = (await req('GET', `/api/chats/${grp.id}/messages?limit=5`, { token: fred.token })).json.messages;
  ok(fredHist.some((m) => m.system && m.content.includes('joined via invite link')), 'join recorded as a system message');
  const fredRe = await req('POST', `/api/invites/${inv1.json.invite.token}/join`, { token: fred.token });
  ok(fredRe.json.alreadyMember === true, 're-join is a no-op');
  const grace = await signup('grace');
  const rot = await req('POST', `/api/chats/${grp.id}/invite`, { token: alice.token });
  ok(rot.json.invite.token !== inv1.json.invite.token, 'creator rotates the link');
  ok((await req('POST', `/api/invites/${inv1.json.invite.token}/join`, { token: grace.token })).status === 404, 'old link dies after rotation');
  ok((await req('DELETE', `/api/chats/${grp.id}/invite`, { token: alice.token })).status === 200, 'revoke works');
  ok((await req('POST', `/api/invites/${rot.json.invite.token}/join`, { token: grace.token })).status === 404, 'revoked link is dead');

  console.log('• End-to-end encryption (v1.5)');
  // alice & bob get real WebCrypto identities; their private keys live only in this test process
  const mkIdentity = async () => {
    const id = await E2EC.genIdentity();
    return { kp: id, dhPriv: id.dh.privateKey, sigPriv: id.sig.privateKey,
      pubs: { dhPub: await E2EC.exportPub(id.dh.publicKey), sigPub: await E2EC.exportPub(id.sig.publicKey) } };
  };
  const aId = await mkIdentity(), bId = await mkIdentity();
  ok((await req('PUT', '/api/e2ee/identity', { token: alice.token, body: aId.pubs })).json.changed === true, 'alice publishes her E2EE identity');
  ok((await req('PUT', '/api/e2ee/identity', { token: bobFresh.token, body: bId.pubs })).status === 200, 'bob publishes his E2EE identity');
  ok((await req('PUT', '/api/e2ee/identity', { token: alice.token, body: { dhPub: 'bm90LWtleQ==', sigPub: aId.pubs.sigPub } })).status === 400, 'garbage public key rejected');
  const dir = (await req('GET', `/api/e2ee/identity?ids=${alice.user.id},${bob.user.id}`, { token: alice.token })).json.keys;
  ok(dir[alice.user.id]?.dhHash === await E2EC.dhHashOf(aId.pubs.dhPub), 'identity directory hash matches client fingerprint math');

  const e2eDm = (await req('POST', '/api/chats/dm', { token: alice.token, body: { userId: bob.user.id } })).json.chat;
  const ks0 = (await req('GET', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token })).json;
  ok(ks0.e2ee === false && ks0.currentEpoch === 0, 'a fresh DM starts unencrypted');
  const chatKey = E2EC.genChatKey();
  const wrap = async (priv, theirPubB64, toId, epoch) =>
    E2EC.wrapChatKey(priv, await E2EC.importDhPub(theirPubB64), chatKey, { chatId: e2eDm.id, epoch, fromId: alice.user.id, toId });
  const wA1 = await wrap(aId.dhPriv, aId.pubs.dhPub, alice.user.id, 1);
  const wB1 = await wrap(aId.dhPriv, bId.pubs.dhPub, bob.user.id, 1);
  ok((await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token, body: { epoch: 2, wraps: [{ user: alice.user.id, ...wA1 }, { user: bob.user.id, ...wB1 }] } })).status === 400, 'first epoch must be 1');
  ok((await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token, body: { epoch: 1, wraps: [{ user: alice.user.id, ...wA1 }] } })).status === 400, 'wraps must cover exactly the member set');
  ok((await req('POST', `/api/e2ee/chats/${grp.id}/keys`, { token: alice.token, body: { epoch: 1, wraps: [] } })).status === 400, 'group chats are not E2EE-keyable in this release');
  const epoch1 = await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token, body: { epoch: 1, wraps: [{ user: alice.user.id, ...wA1 }, { user: bob.user.id, ...wB1 }] } });
  ok(epoch1.status === 201, 'epoch 1 registers with full coverage');
  ok((await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token, body: { epoch: 1, wraps: [{ user: alice.user.id, ...wA1 }, { user: bob.user.id, ...wB1 }] } })).status === 400, 'epoch 1 cannot be re-registered');
  ok((await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: bobFresh.token, body: { epoch: 3, wraps: [{ user: alice.user.id, ...wA1 }, { user: bob.user.id, ...wB1 }] } })).status === 400, 'epochs cannot skip ahead (must be current+1)');
  const ksB = (await req('GET', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: bobFresh.token })).json;
  ok(ksB.e2ee === true && ksB.currentEpoch === 1 && ksB.keys.length === 1 && ksB.keys[0].wrappedBy === alice.user.id, 'bob sees the chat keyed with his private wrap');
  const recovered = await E2EC.unwrapChatKey(bId.dhPriv, await E2EC.importDhPub(aId.pubs.dhPub), ksB.keys[0].wrapped, ksB.keys[0].wiv,
    { chatId: e2eDm.id, epoch: 1, fromId: alice.user.id, toId: bob.user.id });
  ok(recovered && E2EC.b64encode(recovered) === E2EC.b64encode(chatKey), 'bob unwraps the exact chat key (ECDH+HKDF cross-check)');
  const sysRow = (await req('GET', `/api/chats/${e2eDm.id}/messages?limit=5`, { token: bobFresh.token })).json.messages;
  ok(sysRow.some((m) => m.system && m.content.includes('End-to-end encryption')), 'epoch 1 posts the "encryption is on" system row');

  const secretText = 'rendezvous at coordinates 51.6 — op «umbrella»';
  const env = await E2EC.encryptMessage(await E2EC.importChatKey(chatKey), secretText, { chatId: e2eDm.id, epoch: 1 });
  const goodSig = await E2EC.signEnvelope(bId.sigPriv, { chatId: e2eDm.id, kid: 1, ...env });
  const encSend = await req('POST', `/api/chats/${e2eDm.id}/messages`, { token: bobFresh.token, body: { enc: 1, kid: 1, ...env, sig: goodSig } });
  ok(encSend.status === 201 && encSend.json.message.enc === true && encSend.json.message.content === env.ct, 'encrypted envelope accepted, ciphertext stored verbatim');
  ok(!JSON.stringify(encSend.json).includes('rendezvous'), 'server never receives plaintext');
  const badSig = await E2EC.signEnvelope(aId.sigPriv, { chatId: e2eDm.id, kid: 1, ...env });
  ok((await req('POST', `/api/chats/${e2eDm.id}/messages`, { token: bobFresh.token, body: { enc: 1, kid: 1, ...env, sig: badSig } })).status === 400, 'forged signature rejected by the server');
  ok((await req('POST', `/api/chats/${e2eDm.id}/messages`, { token: alice.token, body: { enc: 1, kid: 1, ...env, sig: goodSig } })).status === 400, 'replaying someone else’s envelope fails sig check');
  ok((await req('POST', `/api/chats/${e2eDm.id}/messages`, { token: bobFresh.token, body: { enc: 1, kid: 9, ...env, sig: goodSig } })).status === 400, 'unknown epoch rejected');
  const plainInEnc = await req('POST', `/api/chats/${e2eDm.id}/messages`, { token: bobFresh.token, body: { content: 'just plain' } });
  ok(plainInEnc.status === 201, 'plaintext technically still allowed by the transport (clients refuse to downgrade)');
  const histE = (await req('GET', `/api/chats/${e2eDm.id}/messages?limit=10`, { token: alice.token })).json.messages;
  const encMsg = histE.find((m) => m.enc);
  const decBack = await E2EC.decryptMessage(await E2EC.importChatKey(chatKey), encMsg.iv, encMsg.content, { chatId: e2eDm.id, epoch: encMsg.kid });
  ok(decBack === secretText, 'ciphertext round-trips to the exact plaintext');
  ok(await E2EC.verifyEnvelope(bId.pubs.sigPub, { chatId: e2eDm.id, kid: encMsg.kid, iv: encMsg.iv, ct: encMsg.content }, encMsg.sig), 'signature verifies client-side too');
  ok(!(await req('GET', `/api/chats/${e2eDm.id}/messages/search?q=rendezvous`, { token: alice.token })).json.results.length, 'in-chat search cannot see ciphertext');
  ok(!(await req('GET', `/api/chats/search/messages?q=rendezvous`, { token: alice.token })).json.results.length, 'global search cannot see ciphertext');
  ok((await req('POST', `/api/messages/${encMsg.id}/forward`, { token: alice.token, body: { chatId: e2eDm.id } })).status === 400, 'encrypted messages cannot be forwarded');
  const ke = (await req('GET', `/api/chats/${e2eDm.id}`, { token: alice.token })).json.chat;
  ok(ke.e2ee === true, 'chat payload carries the e2ee flag');

  const env2 = await E2EC.encryptMessage(await E2EC.importChatKey(chatKey), 'updated coordinates received', { chatId: e2eDm.id, epoch: 1 });
  const sig2 = await E2EC.signEnvelope(bId.sigPriv, { chatId: e2eDm.id, kid: 1, ...env2 });
  const encEdit = await req('PATCH', `/api/messages/${encMsg.id}`, { token: bobFresh.token, body: { enc: 1, ...env2, sig: sig2 } });
  ok(encEdit.status === 200 && encEdit.json.message.enc === true, 'encrypted edit accepted');
  ok((await req('PATCH', `/api/messages/${encMsg.id}`, { token: bobFresh.token, body: { content: 'plaintext swap' } })).status === 400, 'encrypted messages refuse plaintext edits');
  const histE2 = (await req('GET', `/api/chats/${e2eDm.id}/messages?limit=10`, { token: alice.token })).json.messages.find((m) => m.id === encMsg.id);
  ok(await E2EC.decryptMessage(await E2EC.importChatKey(chatKey), histE2.iv, histE2.content, { chatId: e2eDm.id, epoch: 1 }) === 'updated coordinates received', 'edited ciphertext decrypts to the new text');

  console.log('• Device-to-device key transfer');
  const eph = await E2EC.genTransferPair();
  const ephPub = await E2EC.exportPub(eph.publicKey);
  const tr = await req('POST', '/api/e2ee/transfers', { token: alice.token, body: { ephPub } });
  ok(tr.status === 201 && tr.json.request.status === 'pending', 'new device creates a transfer request');
  const pend = (await req('GET', '/api/e2ee/transfers', { token: alice.token })).json.transfers;
  ok(pend.length === 1 && pend[0].id === tr.json.request.id, 'old device can poll the pending request');
  ok((await req('POST', '/api/e2ee/transfers', { token: grace.token, body: { ephPub } })).status === 201, 'requests are per-account (grace can make her own)');
  const sealKeyOld = await E2EC.transferKeyForOld(aId.dhPriv, ephPub);
  const bundleChats = [{ chatId: e2eDm.id, epochs: [{ epoch: 1, key: E2EC.b64encode(chatKey) }] }];
  const sealed = await E2EC.sealTransferPayload(sealKeyOld, {
    dhPriv: await E2EC.exportPrivJwk(aId.dhPriv), sigPriv: await E2EC.exportPrivJwk(aId.sigPriv), chats: bundleChats,
  });
  ok((await req('POST', `/api/e2ee/transfers/${tr.json.request.id}/answer`, { token: bobFresh.token, body: sealed })).status === 404, 'strangers cannot answer my transfer');
  ok((await req('POST', `/api/e2ee/transfers/${tr.json.request.id}/answer`, { token: alice.token, body: sealed })).status === 200, 'old device seals and posts the bundle');
  ok((await req('POST', `/api/e2ee/transfers/${tr.json.request.id}/answer`, { token: alice.token, body: sealed })).status === 400, 'answered requests cannot be re-answered');
  const got = (await req('GET', `/api/e2ee/transfers/${tr.json.request.id}`, { token: alice.token })).json.request;
  ok(got.status === 'answered' && got.payload === sealed.payload, 'new device fetches the sealed bundle');
  const sealKeyNew = await E2EC.transferKeyForNew(eph.privateKey, aId.pubs.dhPub, ephPub);
  const opened = await E2EC.openTransferPayload(sealKeyNew, got.payload, got.piv);
  ok(opened && opened.chats[0].epochs[0].key === E2EC.b64encode(chatKey), 'bundle unwraps intact on the new device');
  const wrongPair = await E2EC.genTransferPair();
  const wrongKey = await E2EC.transferKeyForNew(wrongPair.privateKey, aId.pubs.dhPub, ephPub);
  ok(await E2EC.openTransferPayload(wrongKey, got.payload, got.piv) === null, 'a wrong ephemeral key cannot open the bundle');
  ok(!(await req('GET', '/api/e2ee/transfers', { token: grace.token })).json.transfers.some((t) => t.id === tr.json.request.id), 'transfer data is invisible to other accounts');
  const tr2 = await req('POST', '/api/e2ee/transfers', { token: grace.token, body: { ephPub: tr.json.request.ephPub } });
  ok(tr2.status === 201, 'grace already has a fresh pending request');
  ok((await req('POST', `/api/e2ee/transfers/${tr2.json.request.id}/decline`, { token: grace.token })).status === 200, 'declining works');
  ok(((await req('GET', `/api/e2ee/transfers/${tr2.json.request.id}`, { token: grace.token })).json.request || {}).status === 'declined', 'declined state sticks');

  console.log('• Identity reset & peer re-key');
  await req('DELETE', '/api/e2ee/identity', { token: alice.token });
  ok((await req('GET', '/api/e2ee/identity/me', { token: alice.token })).json.identity === null, 'identity reset wipes the server records');
  ok((await req('GET', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token })).json.keys.length === 0, 'reset also drops my wrapped copies');
  const aId2 = await mkIdentity();
  await req('PUT', '/api/e2ee/identity', { token: alice.token, body: aId2.pubs });
  const chatKey2 = E2EC.genChatKey();
  const wA2 = await E2EC.wrapChatKey(bId.dhPriv, await E2EC.importDhPub(aId2.pubs.dhPub), chatKey2, { chatId: e2eDm.id, epoch: 2, fromId: bob.user.id, toId: alice.user.id });
  const wB2 = await E2EC.wrapChatKey(bId.dhPriv, await E2EC.importDhPub(bId.pubs.dhPub), chatKey2, { chatId: e2eDm.id, epoch: 2, fromId: bob.user.id, toId: bob.user.id });
  ok((await req('POST', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: bobFresh.token, body: { epoch: 2, wraps: [{ user: alice.user.id, ...wA2 }, { user: bob.user.id, ...wB2 }] } })).status === 201, 'the keyed peer drives epoch 2 after my reset');
  const ksA2 = (await req('GET', `/api/e2ee/chats/${e2eDm.id}/keys`, { token: alice.token })).json;
  ok(ksA2.currentEpoch === 2 && ksA2.keys.length === 1, 'reset user only holds the fresh epoch');
  const recovered2 = await E2EC.unwrapChatKey(aId2.dhPriv, await E2EC.importDhPub(bId.pubs.dhPub), ksA2.keys[0].wrapped, ksA2.keys[0].wiv,
    { chatId: e2eDm.id, epoch: 2, fromId: bob.user.id, toId: alice.user.id });
  ok(recovered2 && E2EC.b64encode(recovered2) === E2EC.b64encode(chatKey2), 'new identity unwraps the re-keyed chat');
  ok(decBack === secretText && histE2, 'old ciphertext stays put for whoever still holds the old key');

  console.log('• Two-factor authentication (TOTP)');
  const dave = await signup('dave');
  ok(dave?.token, 'dave registered for 2FA tests');
  const setup = await req('POST', '/api/auth/2fa/setup', { token: dave.token, body: {} });
  ok(setup.status === 200 && setup.json.secret && setup.json.qr.startsWith('data:image/png'), 'setup returns secret + QR code');
  const badEnable = await req('POST', '/api/auth/2fa/enable', { token: dave.token, body: { code: '000000' } });
  ok(badEnable.status === 400, 'wrong enable code rejected');
  const goodEnable = await req('POST', '/api/auth/2fa/enable', { token: dave.token, body: { code: totpCode(setup.json.secret) } });
  ok(goodEnable.status === 200 && goodEnable.json.backupCodes.length === 8, '2FA enabled, 8 backup codes issued');
  ok(goodEnable.json.user.totpEnabled === true, 'self payload reports totpEnabled');
  const secondSetup = await req('POST', '/api/auth/2fa/setup', { token: dave.token, body: {} });
  ok(secondSetup.status === 400, 'setup twice blocked');

  const login2fa = await req('POST', '/api/auth/login', { gate, body: { username: 'dave', password: 'dave-password-1' } });
  ok(login2fa.status === 200 && login2fa.json.twoFactor === true && !login2fa.json.token, 'login stops at the 2FA step');
  const pending = login2fa.json.pendingToken;
  const wrongCode = await req('POST', '/api/auth/login/2fa', { token: pending, body: { code: '000000' } });
  ok(wrongCode.status === 401, 'wrong TOTP code rejected');
  const goodCode = await req('POST', '/api/auth/login/2fa', { token: pending, body: { code: totpCode(setup.json.secret) } });
  ok(goodCode.status === 200 && goodCode.json.token && goodCode.json.usedBackupCode === false, 'correct TOTP code signs in');
  const meWith2fa = await req('GET', '/api/auth/me', { token: goodCode.json.token });
  ok(meWith2fa.status === 200, '2FA session token works');

  const backupLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'dave', password: 'dave-password-1' } });
  const bcode = goodEnable.json.backupCodes[0];
  const useBackup = await req('POST', '/api/auth/login/2fa', { token: backupLogin.json.pendingToken, body: { code: bcode } });
  ok(useBackup.status === 200 && useBackup.json.usedBackupCode === true, 'backup code works');
  const reuseBackupLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'dave', password: 'dave-password-1' } });
  const reuseBackup = await req('POST', '/api/auth/login/2fa', { token: reuseBackupLogin.json.pendingToken, body: { code: bcode } });
  ok(reuseBackup.status === 401, 'backup codes are single-use');

  const regen = await req('POST', '/api/auth/2fa/backup-codes', { token: goodCode.json.token, body: { code: totpCode(setup.json.secret) } });
  ok(regen.status === 200 && regen.json.backupCodes[0] !== bcode, 'backup codes regenerated');
  const disableBadPw = await req('POST', '/api/auth/2fa/disable', { token: goodCode.json.token, body: { password: 'wrong', code: totpCode(setup.json.secret) } });
  ok(disableBadPw.status === 403, 'disable requires the real password');
  const disable = await req('POST', '/api/auth/2fa/disable', { token: goodCode.json.token, body: { password: 'dave-password-1', code: totpCode(setup.json.secret) } });
  ok(disable.status === 200 && disable.json.user.totpEnabled === false, '2FA disabled with password + code');
  const plainLogin = await req('POST', '/api/auth/login', { gate, body: { username: 'dave', password: 'dave-password-1' } });
  ok(plainLogin.status === 200 && plainLogin.json.token && !plainLogin.json.twoFactor, 'login without 2FA after disable');

  console.log('• Server config (owner panel)');
  const srvCfg = await req('GET', '/api/admin/server/config', { token: owner.token });
  ok(srvCfg.status === 200 && srvCfg.json.config.jwtSecretMasked.includes('•'), 'owner reads masked server config');
  const srvCfgDenied = await req('GET', '/api/admin/server/config', { token: bobFresh.token });
  ok(srvCfgDenied.status === 403, 'non-owner cannot read server config');
  const upd = await req('PATCH', '/api/admin/server/config', { token: owner.token, body: { serverName: 'Renamed Server', registrationEnabled: false } });
  ok(upd.status === 200, 'owner patches server config');
  const info2 = await (await fetch(BASE + '/api/info')).json();
  ok(info2.name === 'Renamed Server' && info2.registrationEnabled === false, 'live config applied to /api/info');
  const savedCfg = JSON.parse(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8'));
  ok(savedCfg.serverName === 'Renamed Server' && savedCfg.registration.enabled === false, 'config.json persisted to disk');
  const regClosed = await req('POST', '/api/auth/signup', { gate, body: { username: 'dave', password: 'dave-password-1' } });
  ok(regClosed.status === 403, 'registration toggle enforced');
  await req('PATCH', '/api/admin/server/config', { token: owner.token, body: { registrationEnabled: true } });

  console.log('• Secret rotation');
  const rotate = await req('POST', '/api/admin/server/regenerate-secret', { token: owner.token, body: {} });
  ok(rotate.status === 200, 'owner rotates JWT secret');
  await sleep(250);
  const stale = await req('GET', '/api/auth/me', { token: owner.token });
  ok(stale.status === 401, 'all sessions invalidated after rotation');
  const relogin = await req('POST', '/api/auth/login', { gate, body: { username: 'owner', password: 'bootstrap-owner-pass' } });
  ok(relogin.status === 401 && relogin.json.code === 'gate', 'old gate tokens also die after rotation');
  const freshGate = (await req('POST', '/api/gate', { body: { serverPassword: 's3cret-pass' } })).json.gateToken;
  const relogin2 = await req('POST', '/api/auth/login', { gate: freshGate, body: { username: 'owner', password: 'bootstrap-owner-pass' } });
  ok(relogin2.status === 200, 'fresh gate → login works after rotation');

  console.log('• Calls (v1.6) — signaling over WS');
  {
    // secret rotation above invalidated every session — sign back in first
    const gateNow = (await req('POST', '/api/gate', { body: { serverPassword: 's3cret-pass' } })).json.gateToken;
    const alice = await loginFresh(gateNow, 'alice');
    const bob = await loginFresh(gateNow, 'bob');
    const carol = await loginFresh(gateNow, 'carol');

    const infoNow = await (await fetch(BASE + '/api/info')).json();
    ok(infoNow.callsEnabled === true, 'info advertises callsEnabled');
    const cfgNoAuth = await fetch(BASE + '/api/calls/config');
    ok(cfgNoAuth.status === 401, 'calls config requires auth');
    const callCfgRes = await req('GET', '/api/calls/config', { token: alice.token });
    ok(callCfgRes.json.enabled === true && Array.isArray(callCfgRes.json.iceServers), 'calls config returns enabled + iceServers');

    const wA = await wsConnect(alice.token);
    const wB = await wsConnect(bob.token);
    const wsSend = (ws, t, data) => ws.send(JSON.stringify({ t, data }));
    // waitFrame pre-scans ws.frames — with repeated event types (ring per flow)
    // we must only consume FUTURE frames, so arm the waiter before sending
    const waitNext = (ws, t, timeout = 4000, filter = () => true) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for '${t}'`)), timeout);
      ws.waiters.push((f) => {
        if (f.t === t && filter(f)) { clearTimeout(timer); resolve(f); return true; }
        return false;
      });
    });

    // 1) full cycle: invite → ring → accept → signal relay → hang up
    const pRinging = waitNext(wA, 'call:ringing');
    wsSend(wA, 'call:invite', { chatId: dm.id, video: false });
    const ringingEcho = await pRinging;
    ok(ringingEcho.data.call.chatId === dm.id && ringingEcho.data.call.from === alice.user.id, 'server confirms outgoing call (call:ringing)');
    const callId = ringingEcho.data.call.callId;
    const ringB = await waitFrame(wB, 'call:ring', 4000, (f) => f.data.call.callId === callId);
    ok(ringB.data.call.video === false, 'callee rings with matching callId');

    const pDupErr = waitNext(wA, 'call:error');
    wsSend(wA, 'call:invite', { chatId: dm.id, video: true });
    ok(/Already in a call/i.test((await pDupErr).data.message), 'second invite while ringing is rejected');

    const pAccA = waitNext(wA, 'call:accepted');
    const pAccB = waitNext(wB, 'call:accepted');
    wsSend(wB, 'call:accept', { callId });
    const [accA, accB] = await Promise.all([pAccA, pAccB]);
    ok(accA.data.callId === callId && accB.data.callId === callId, 'both sides learn the call was accepted');

    const pSigB = waitNext(wB, 'call:signal', 4000, (f) => f.data?.data?.kind === 'sdp');
    wsSend(wA, 'call:signal', { callId, data: { kind: 'sdp', description: { type: 'offer', sdp: 'v=0 fake-sdp' } } });
    const sigB = await pSigB;
    ok(sigB.data.from === alice.user.id && sigB.data.data.description.sdp.includes('fake-sdp'), 'SDP relays caller → callee');
    const pSigA = waitNext(wA, 'call:signal', 4000, (f) => f.data?.data?.kind === 'ice');
    wsSend(wB, 'call:signal', { callId, data: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp 211 127.0.0.1 9 typ host' } } });
    ok((await pSigA).data.from === bob.user.id, 'ICE candidate relays callee → caller');

    const pEndA = waitNext(wA, 'call:ended');
    const pEndB = waitNext(wB, 'call:ended');
    wsSend(wB, 'call:end', { callId, reason: 'hangup' });
    const [endA, endB] = await Promise.all([pEndA, pEndB]);
    ok(endA.data.reason === 'hangup' && endB.data.callId === callId, 'hangup reaches both sides');
    await sleep(250);
    const logMsgs = (await req('GET', `/api/chats/${dm.id}/messages`, { token: alice.token })).json.messages;
    ok(logMsgs.some((m) => m.system && /📞 Voice call · \d{2}:\d{2}/.test(m.content)), 'completed call leaves a chat row with duration');

    // 2) decline flow
    const pRing2 = waitNext(wA, 'call:ringing');
    wsSend(wA, 'call:invite', { chatId: dm.id, video: false });
    const id2 = (await pRing2).data.call.callId;
    await waitFrame(wB, 'call:ring', 4000, (f) => f.data.call.callId === id2);
    const pDecA = waitNext(wA, 'call:declined');
    wsSend(wB, 'call:decline', { callId: id2 });
    ok((await pDecA).data.callId === id2, 'decline reaches the caller');
    await sleep(250);
    const logMsgs2 = (await req('GET', `/api/chats/${dm.id}/messages`, { token: alice.token })).json.messages;
    ok(logMsgs2.some((m) => m.system && m.content.includes('Declined call')), 'declined call is logged in chat');

    // 3) cancel flow
    const pRing3 = waitNext(wA, 'call:ringing');
    wsSend(wA, 'call:invite', { chatId: dm.id, video: true });
    const id3 = (await pRing3).data.call.callId;
    const ringB3 = await waitFrame(wB, 'call:ring', 4000, (f) => f.data.call.callId === id3);
    ok(ringB3.data.call.video === true, 'video flag survives in the ring payload');
    const pCancB = waitNext(wB, 'call:cancelled');
    wsSend(wA, 'call:cancel', { callId: id3 });
    ok((await pCancB).data.reason === 'cancelled', 'caller cancel reaches the callee');

    // 4) busy: alice rings bob (no answer) → carol tries to call alice
    const carolDm = (await req('POST', '/api/chats/dm', { token: carol.token, body: { userId: alice.user.id } })).json.chat;
    const wC = await wsConnect(carol.token);
    const pRing4 = waitNext(wA, 'call:ringing');
    wsSend(wA, 'call:invite', { chatId: dm.id, video: false });
    const id4 = (await pRing4).data.call.callId;
    await waitFrame(wB, 'call:ring', 4000, (f) => f.data.call.callId === id4);
    const pBusyC = waitNext(wC, 'call:busy');
    wsSend(wC, 'call:invite', { chatId: carolDm.id, video: false });
    ok((await pBusyC).data.chatId === carolDm.id, 'a callee who is already ringing answers busy');
    const pDecA2 = waitNext(wA, 'call:declined');
    wsSend(wB, 'call:decline', { callId: id4 });
    await pDecA2;
    ok(true, 'busy probe leaves the original ring intact');
    wA.close(); wB.close(); wC.close();
    await sleep(200);
  }

  console.log('• Calls — disabled mode & ring timeout');
  {
    const startInstance = async (port2, extra, secret) => {
      const tmpX = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-smoke-calls-'));
      fs.writeFileSync(path.join(tmpX, 'config.json'), JSON.stringify({
        serverName: 'Calls Smoke', host: '127.0.0.1', port: port2, serverPassword: '',
        jwtSecret: secret,
        owner: { username: 'owner', password: 'owner-pass-9' },
        registration: { enabled: true }, rateLimit: { enabled: false },
        ...extra,
      }, null, 2));
      const ch = spawn(process.execPath, ['server/index.js'], {
        cwd: ROOT,
        env: { ...process.env, EFADRO_CONFIG: path.join(tmpX, 'config.json') },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const baseX = `http://127.0.0.1:${port2}`;
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(baseX + '/api/info'); if (r.ok) return { ch, tmpX, baseX }; } catch { /* booting */ }
        await sleep(250);
      }
      ch.kill('SIGTERM'); fs.rmSync(tmpX, { recursive: true, force: true });
      throw new Error('instance did not boot');
    };

    // calls.enabled=false → invite refused, flags off
    {
      const { ch, tmpX, baseX } = await startInstance(3252, { calls: { enabled: false } }, 'dis-calls-secret-0123456789abcdef0123456789abcdef');
      try {
        const infoX = await (await fetch(baseX + '/api/info')).json();
        ok(infoX.callsEnabled === false, 'calls disabled: info flag off');
        const gX = (await (await fetch(baseX + '/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).gateToken;
        const signup = async (u) => (await (await fetch(baseX + '/api/auth/signup', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${gX}` },
          body: JSON.stringify({ username: u, password: `${u}-password-1`, displayName: u }),
        })).json());
        const ua = await signup('caa'), ub = await signup('cbb');
        const cfgX = await (await fetch(baseX + '/api/calls/config', { headers: { authorization: `Bearer ${ua.token}` } })).json();
        ok(cfgX.enabled === false, 'calls disabled: config endpoint agrees');
        const dmX = (await (await fetch(baseX + '/api/chats/dm', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ua.token}` },
          body: JSON.stringify({ userId: ub.user.id }),
        })).json()).chat;
        const wsA = await new Promise((res, rej) => {
          const w = new WebSocket(`${baseX.replace('http', 'ws')}/ws?token=${encodeURIComponent(ua.token)}`);
          w.on('open', () => res(w)); w.on('error', rej);
        });
        wsA.send(JSON.stringify({ t: 'call:invite', data: { chatId: dmX.id, video: false } }));
        const errFrame = await new Promise((res) => {
          wsA.on('message', (raw) => { const f = JSON.parse(raw.toString()); if (f.t === 'error') res(f); });
          setTimeout(() => res(null), 4000);
        });
        ok(/Calls are disabled/.test(errFrame?.data?.message || ''), 'calls disabled: invite rejected with a clear error');
        wsA.close();
      } finally { ch.kill('SIGTERM'); fs.rmSync(tmpX, { recursive: true, force: true }); }
    }

    // ringTimeoutSec: unanswered calls expire and log a missed call
    {
      const { ch, tmpX, baseX } = await startInstance(3253, { calls: { enabled: true, ringTimeoutSec: 5 } }, 'ring-timeout-secret-0123456789abcdef0123456789abcdef');
      try {
        const gX = (await (await fetch(baseX + '/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).gateToken;
        const signup = async (u) => (await (await fetch(baseX + '/api/auth/signup', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${gX}` },
          body: JSON.stringify({ username: u, password: `${u}-password-1`, displayName: u }),
        })).json());
        const ua = await signup('raa'), ub = await signup('rbb');
        const dmX = (await (await fetch(baseX + '/api/chats/dm', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ua.token}` },
          body: JSON.stringify({ userId: ub.user.id }),
        })).json()).chat;
        const mkWs = (tok) => new Promise((res, rej) => {
          const w = new WebSocket(`${baseX.replace('http', 'ws')}/ws?token=${encodeURIComponent(tok)}`);
          w.frames = []; w.on('message', (raw) => w.frames.push(JSON.parse(raw.toString())));
          w.on('open', () => res(w)); w.on('error', rej);
        });
        const wA = await mkWs(ua.token), wB = await mkWs(ub.token);
        wA.send(JSON.stringify({ t: 'call:invite', data: { chatId: dmX.id, video: false } }));
        let missed = null;
        for (let i = 0; i < 40 && !missed; i++) {
          missed = wA.frames.find((f) => f.t === 'call:cancelled' && f.data?.reason === 'missed') || null;
          if (!missed) await sleep(250);
        }
        ok(Boolean(missed), 'unanswered call expires with reason "missed"');
        await sleep(400);
        const msgsX = (await (await fetch(baseX + `/api/chats/${dmX.id}/messages`, { headers: { authorization: `Bearer ${ua.token}` } })).json()).messages;
        ok(msgsX.some((m) => m.system && m.content.includes('Missed call')), 'expired ring logs a missed call row');
        wA.close(); wB.close();
      } finally { ch.kill('SIGTERM'); fs.rmSync(tmpX, { recursive: true, force: true }); }
    }
  }

  console.log('• Static frontend');
  const html = await (await fetch(BASE + '/')).text();
  ok(html.includes('/js/app.js') && html.includes('efadro'), 'index.html served at /');
  const js = await fetch(BASE + '/js/app.js');
  ok(js.status === 200 && (js.headers.get('content-type') || '').includes('javascript'), 'app.js served');
  const css = await fetch(BASE + '/css/style.css');
  ok(css.status === 200, 'style.css served');
  const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
  ok(Boolean(csp && csp.includes('challenges.cloudflare.com')), 'CSP allows Turnstile');

  console.log('• Server-only mode (--server-only)');
  {
    const PORT2 = 3251, BASE2 = `http://127.0.0.1:${PORT2}`;
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'efadro-smoke-so-'));
    fs.writeFileSync(path.join(tmp2, 'config.json'), JSON.stringify({
      serverName: 'Server-Only Smoke', host: '127.0.0.1', port: PORT2, serverPassword: '',
      jwtSecret: 'smoke2-test-secret-0123456789abcdef0123456789abcde',
      owner: { username: 'owner', password: 'owner-pass-2' },
      registration: { enabled: true }, rateLimit: { enabled: false },
    }, null, 2));
    const child2 = spawn(process.execPath, ['server/index.js', '--server-only'], {
      cwd: ROOT,
      env: { ...process.env, EFADRO_CONFIG: path.join(tmp2, 'config.json') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const jsonHeaders = { 'content-type': 'application/json' };
    try {
      let landing = null;
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE2 + '/'); if (r.ok) { landing = await r.json(); break; } } catch { /* not up yet */ }
        await sleep(250);
      }
      ok(landing?.product === 'efadro' && landing?.mode === 'server', 'server-only: / answers JSON landing (mode: server)');
      const info2 = await (await fetch(BASE2 + '/api/info')).json();
      ok(info2.product === 'efadro' && info2.name === 'Server-Only Smoke', 'server-only: REST API alive');
      const missJs = await fetch(BASE2 + '/js/app.js');
      ok(missJs.status === 404 && (await missJs.json()).error === 'Not found', 'server-only: web client not mounted (404 JSON)');
      const missCss = await fetch(BASE2 + '/css/style.css');
      ok(missCss.status === 404, 'server-only: static assets not mounted either');
      const g2 = (await (await fetch(BASE2 + '/api/gate', { method: 'POST', headers: jsonHeaders, body: '{}' })).json()).gateToken;
      const su2 = await (await fetch(BASE2 + '/api/auth/signup', {
        method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${g2}` },
        body: JSON.stringify({ username: 'solo', password: 'solo-password-1', displayName: 'Solo' }),
      })).json();
      ok(Boolean(su2.token), 'server-only: gate → signup works');
      const dm2 = await (await fetch(BASE2 + '/api/chats/dm', {
        method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${su2.token}` },
        body: JSON.stringify({ userId: su2.user.id }),
      })).json();
      const msg2 = await fetch(BASE2 + `/api/chats/${dm2.chat.id}/messages`, {
        method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${su2.token}` },
        body: JSON.stringify({ content: 'api-only hello' }),
      });
      ok(msg2.status === 201, 'server-only: message post works over REST');
    } finally {
      child2.kill('SIGTERM');
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  }
} catch (e) {
  failed++;
  console.error('\nFATAL during smoke test:', e);
  exitCode = 1;
} finally {
  child.kill('SIGTERM');
}

async function loginFresh(gate, u) {
  return (await req('POST', '/api/auth/login', { gate, body: { username: u, password: `${u}-password-1` } })).json;
}

if (exitCode === 0) exitCode = failed > 0 ? 1 : 0;
console.log(`\n=================\n${passed} passed, ${failed} failed\n`);
process.exit(exitCode);
