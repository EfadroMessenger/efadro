/* ============================================================
   efadro — frontend application
   Vanilla JS SPA: server picker → captcha → server password →
   login/signup → real-time chat + moderation panels.
   ============================================================ */

'use strict';

import { EMOJI_CATEGORIES, SEARCH_INDEX, renderEmojiText, emojiOnly, emojiImg } from './emoji.js?v=1.9.0';
import * as E2EE from './e2ee.js?v=1.9.0';

/** Web-client build version — keep in sync with package.json / server APP_VERSION. */
const CLIENT_VERSION = '1.9.0';

/* ----------------------------- helpers ----------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const ROLE_LEVEL = { user: 0, moderator: 1, admin: 2, owner: 3 };
const roleLevel = (r) => ROLE_LEVEL[r] ?? 0;

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* Emoji <img> fallback: try the -fe0f variant, then strip it, then native text. */
document.addEventListener('error', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement) || !el.dataset.e) return;
  if (el.dataset.alt) {
    const alt = el.dataset.alt;
    delete el.dataset.alt;
    el.src = alt;
  } else if (el.src.endsWith('-fe0f.png')) {
    el.src = el.src.replace('-fe0f.png', '.png');
  } else {
    el.replaceWith(document.createTextNode(el.dataset.e));
  }
}, true);

const pad2 = (n) => String(n).padStart(2, '0');

function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
function fmtListTime(ts) {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return fmtTime(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 30) return `${dd}d ago`;
  return new Date(ts).toLocaleDateString();
}
function fmtLastSeen(ts) {
  if (!ts) return 'offline';
  return `last seen ${timeAgo(ts)}`;
}

const initials = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

/* ------------------------------- icons ------------------------------- */

const ic = (paths, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const icons = {
  send: ic('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', 20),
  smile: ic('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>', 20),
  search: ic('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 16),
  plus: ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18),
  users: ic('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 18),
  user: ic('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 18),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 18),
  shield: ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 18),
  logout: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 18),
  back: ic('<polyline points="15 18 9 12 15 6"/>', 20),
  down: ic('<polyline points="6 9 12 15 18 9"/>', 16),
  x: ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 16),
  check: ic('<polyline points="20 6 9 17 4 12"/>', 14),
  checks: ic('<polyline points="1.5 12.5 5.5 16.5 16 6"/><polyline points="10 14.5 12.5 17 21.5 8" opacity="0.55"/>', 14),
  trash: ic('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14),
  pencil: ic('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', 14),
  flag: ic('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', 14),
  dots: ic('<circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>', 18),
  ban: ic('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>', 15),
  mute: ic('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>', 15),
  kick: ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>', 15),
  moon: ic('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 16),
  sun: ic('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>', 16),
  copy: ic('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 14),
  globe: ic('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', 18),
  eye: ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 15),
  eyeOff: ic('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>', 15),
  refresh: ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 15),
  lock: ic('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 18),
  key: ic('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>', 16),
  warn: ic('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 16),
  chat: ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 34),
  crown: ic('<path d="M2 18h20l-2-10-5 4-3-7-3 7-5-4z"/><line x1="3" y1="22" x2="21" y2="22"/>', 13),
  activity: ic('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', 15),
  paperclip: ic('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>', 19),
  file: ic('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', 20),
  music: ic('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', 17),
  download: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 16),
  shieldCheck: ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>', 16),
  mic: ic('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>', 19),
  micOff: ic('<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>', 19),
  phone: ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', 18),
  phoneOff: ic('<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/>', 18),
  video: ic('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>', 18),
  videoOff: ic('<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>', 18),
  stop: ic('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>', 18),
  pin: ic('<path d="M9 4v6l-2 4v2h10v-2l-2-4V4"/><line x1="12" y1="16" x2="12" y2="22"/><line x1="7" y1="4" x2="17" y2="4"/>', 14),
  reply: ic('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>', 15),
  forward: ic('<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>', 15),
  up: ic('<polyline points="18 15 12 9 6 15"/>', 15),
  bell: ic('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', 16),
  bellOff: ic('<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>', 16),
  archive: ic('<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>', 16),
  chart: ic('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', 16),
  clock: ic('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/>', 13),
  at: ic('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>', 14),
  bold: '<b style="font-size:14px;font-weight:800">B</b>',
  italic: '<i style="font-size:14px;font-style:italic;font-family:Georgia,serif">I</i>',
  strike: '<s style="font-size:14px">S</s>',
  codeIc: '<span style="font-family:monospace;font-size:13px;font-weight:700">&lt;/&gt;</span>',
  preIc: '<span style="font-family:monospace;font-size:12px">{ }</span>',
  link: ic('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 15),
  zap: ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 15),
};

const NOTIFY_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#00af5c"/><text x="32" y="45" font-family="Verdana, Arial, sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="#fff">e</text></svg>');
const logoImg = (cls = '') => `<span class="logo-slot ${cls}" role="img" aria-label="efadro"></span>`;

/* ------------------------------ toasts ------------------------------ */

function toast(message, type = 'info', ms = 3400) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icn = type === 'success' ? icons.check : type === 'error' ? icons.warn : icons.activity;
  el.innerHTML = `<span class="t-icon">${icn}</span><span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* --------------------------- modal system --------------------------- */

const modalRoot = $('#modal-root');

function openModal(html, { wide = false, onMount = null } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  modalRoot.appendChild(backdrop);
  const close = () => {
    const m = backdrop.firstElementChild;
    m.classList.add('modal-closing');
    backdrop.style.transition = 'opacity .16s ease';
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 170);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  onMount?.(backdrop.firstElementChild, close);
  return close;
}

function confirmModal({ title = 'Are you sure?', body = '', confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const close = openModal(`
      <div class="modal-head"><div class="modal-title">${esc(title)}</div></div>
      ${body ? `<p class="muted" style="margin-top:-6px;line-height:1.5">${esc(body)}</p>` : ''}
      <div class="row mt-4" style="justify-content:flex-end">
        <button class="btn btn-ghost" data-x="no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirmText)}</button>
      </div>`, {
      onMount(root, c) {
        $('[data-x="no"]', root).onclick = () => { c(); resolve(false); };
        $('[data-x="yes"]', root).onclick = () => { c(); resolve(true); };
      },
    });
    void close;
  });
}

/** Generic form modal. fields: [{key,label,type,value,placeholder,options,min,max}] */
function formModal({ title, fields = [], submitText = 'Save', danger = false, note = '' }) {
  return new Promise((resolve) => {
    const fieldHtml = fields.map((f) => {
      const val = f.value ?? '';
      if (f.type === 'select') {
        const opts = f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
        return `<div class="field"><label>${esc(f.label)}</label><select class="input" name="${esc(f.key)}">${opts}</select></div>`;
      }
      if (f.type === 'textarea') {
        return `<div class="field"><label>${esc(f.label)}</label><textarea class="input textarea" name="${esc(f.key)}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea></div>`;
      }
      return `<div class="field"><label>${esc(f.label)}</label><input class="input" type="${f.type || 'text'}" name="${esc(f.key)}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} /></div>`;
    }).join('');

    openModal(`
      <div class="modal-head"><div class="modal-title">${esc(title)}</div></div>
      ${note ? `<p class="muted small" style="margin-top:-8px">${esc(note)}</p>` : ''}
      <div class="form-error" data-err></div>
      ${fieldHtml}
      <div class="row mt-4" style="justify-content:flex-end">
        <button class="btn btn-ghost" data-x="cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="ok">${esc(submitText)}</button>
      </div>`, {
      onMount(root, close) {
        $('[data-x="cancel"]', root).onclick = () => { close(); resolve(null); };
        $('[data-x="ok"]', root).onclick = () => {
          const out = {};
          for (const f of fields) {
            const el = root.querySelector(`[name="${CSS.escape(f.key)}"]`);
            out[f.key] = el ? el.value : '';
          }
          close(); resolve(out);
        };
        const first = root.querySelector('input,textarea,select');
        first?.focus();
      },
    });
  });
}

/* --------------------------- context menu --------------------------- */

let ctxClose = null;
function ctxMenu(x, y, items) {
  ctxClose?.();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.innerHTML = items.map((it, i) => it.sep
    ? '<div class="ctx-sep"></div>'
    : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon || ''}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 10)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 10)}px`;
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b || b.disabled) return;
    const it = items[Number(b.dataset.i)];
    close();
    it.onClick?.();
  });
  const close = () => { menu.remove(); document.removeEventListener('mousedown', onDoc); ctxClose = null; };
  const onDoc = (e) => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  ctxClose = close;
}

/* --------------------------- emoji picker --------------------------- */

const EMOJI_RECENT_KEY = 'efadro:emoji-recent';
const getRecentEmoji = () => { try { return JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || '[]'); } catch { return []; } };
function pushRecentEmoji(ch) {
  const list = [ch, ...getRecentEmoji().filter((x) => x !== ch)].slice(0, 24);
  localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(list));
}

function searchEmoji(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const out = new Set();
  for (const [keywords, list] of SEARCH_INDEX) {
    if (keywords.includes(q)) for (const e of list.split(' ')) out.add(e);
  }
  for (const cat of EMOJI_CATEGORIES) {
    if (cat.name.toLowerCase().includes(q)) cat.emojis.forEach((e) => out.add(e));
  }
  return [...out].slice(0, 96);
}

const emojiBtn = (ch) => `<button type="button" data-ch="${ch}" title="${ch}">${emojiImg(ch, 'emoji ep-img')}</button>`;

/** Telegram-style emoji panel: search + categories + recents, Apple-style images. */
function emojiPicker(anchor, onPick) {
  ctxClose?.();
  const pop = document.createElement('div');
  pop.className = 'emoji-pop';
  const recent = getRecentEmoji();

  const sections = [
    ...(recent.length ? [{ id: 'recent', name: 'Frequently used', emojis: recent }] : []),
    ...EMOJI_CATEGORIES,
  ];
  pop.innerHTML = `
    <div class="ep-search">${icons.search}<input placeholder="Find the right emoji" autocomplete="off" /></div>
    <div class="ep-cats">
      ${sections.map((c, i) => `<button type="button" data-cat="${esc(c.id)}" class="${i === 0 ? 'active' : ''}" title="${esc(c.name)}">${c.id === 'recent' ? '🕘' : emojiImg(c.icon ?? c.emojis[0], 'emoji cat-img')}</button>`).join('')}
    </div>
    <div class="ep-body">
      ${sections.map((c) => `
        <div class="ep-sec" data-sec="${esc(c.id)}">
          <div class="ep-sec-name">${esc(c.name)}</div>
          <div class="ep-grid">${c.emojis.map(emojiBtn).join('')}</div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 10))}px`;
  pop.style.top = `${Math.max(10, r.top - pop.offsetHeight - 10)}px`;

  const body = $('.ep-body', pop);
  const search = $('.ep-search input', pop);
  const catBtns = $$('.ep-cats button', pop);
  let scrollLock = false;

  catBtns.forEach((b) => b.addEventListener('click', () => {
    const sec = $(`[data-sec="${CSS.escape(b.dataset.cat)}"]`, body);
    if (sec) {
      scrollLock = true;
      sec.scrollIntoView({ block: 'start' });
      setTimeout(() => { scrollLock = false; }, 250);
    }
  }));

  body.addEventListener('scroll', () => {
    if (scrollLock || search.value.trim()) return;
    const secs = $$('.ep-sec', body);
    let current = secs[0];
    for (const s of secs) if (s.offsetTop - body.scrollTop <= 34) current = s;
    if (current) catBtns.forEach((b) => b.classList.toggle('active', b.dataset.cat === current.dataset.sec));
  });

  search.addEventListener('input', () => {
    const q = search.value.trim();
    if (!q) {
      body.innerHTML = sections.map((c) => `
        <div class="ep-sec" data-sec="${esc(c.id)}">
          <div class="ep-sec-name">${esc(c.name)}</div>
          <div class="ep-grid">${c.emojis.map(emojiBtn).join('')}</div>
        </div>`).join('');
      body.scrollTop = 0;
      return;
    }
    const found = searchEmoji(q);
    body.innerHTML = found.length
      ? `<div class="ep-sec"><div class="ep-sec-name">Results</div><div class="ep-grid">${found.map(emojiBtn).join('')}</div></div>`
      : `<div class="empty-note">No emoji found</div>`;
  });

  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ch]');
    if (!b) return;
    pushRecentEmoji(b.dataset.ch);
    onPick(b.dataset.ch);
  });

  const close = () => { pop.remove(); document.removeEventListener('mousedown', onDoc); };
  const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  setTimeout(() => search.focus(), 60);
}

/* --------------------------- sound & title --------------------------- */

let audioCtx = null;
function blip() {
  if (!S.prefs.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 740;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch { /* audio unavailable */ }
}

function updateTitle() {
  const total = S.chats.reduce((n, c) => n + (c.unread || 0), 0);
  document.title = total > 0 ? `(${total}) efadro` : 'efadro';
}

/* --------------------------- session storage --------------------------- */

const store = {
  get sessions() { try { return JSON.parse(localStorage.getItem('efadro:sessions') || '{}'); } catch { return {}; } },
  saveSession(base, data) {
    const s = store.sessions; s[base] = data;
    localStorage.setItem('efadro:sessions', JSON.stringify(s));
  },
  clearSession(base) {
    const s = store.sessions; delete s[base];
    localStorage.setItem('efadro:sessions', JSON.stringify(s));
  },
  get recentServers() { try { return JSON.parse(localStorage.getItem('efadro:servers') || '[]'); } catch { return []; } },
  addRecentServer(url, name) {
    let list = store.recentServers.filter((x) => x.url !== url);
    list.unshift({ url, name });
    localStorage.setItem('efadro:servers', JSON.stringify(list.slice(0, 5)));
  },
  get prefs() { try { return JSON.parse(localStorage.getItem('efadro:prefs') || '{}'); } catch { return {}; } },
  savePrefs(p) { localStorage.setItem('efadro:prefs', JSON.stringify(p)); },
};

/* ------------------------------- state ------------------------------- */

const S = {
  base: null,
  info: null,
  gateToken: null,
  gateTs: 0,        // when the gate token was issued (10-minute JWT)
  authDraft: null,  // typed-but-unsent credentials, kept across join-step re-dos
  token: null,
  user: null,
  ws: null,
  wsOpen: false,
  wsRetry: 0,
  wsManualClose: false,
  chats: [],
  activeChatId: null,
  msg: {},           // chatId -> { items: [], hasMore: bool }
  online: new Set(),
  typing: new Map(), // chatId -> Map(userId -> {user, timer})
  editing: null,     // message being edited
  replyTo: null,     // message being replied to
  rec: null,         // active voice recording session
  call: null,        // active/incoming call state (see calls section)
  search: null,      // in-chat search state {q, results, pos}
  mentionJump: null, // {chatId, messageId} pending jump-to-mention
  showArchived: false, // archived chats section expanded
  avatarTs: 0,       // cache-buster for our own avatar after upload
  prefs: { theme: 'dark', accent: '#1bd96a', sound: true, notify: false },
  tsToken: null,
  tsWidgetId: null,
  panel: { open: false, tab: 'users', cache: {} },
};

function applyPrefs() {
  document.documentElement.dataset.theme = S.prefs.theme;
  const accents = {
    '#1bd96a': '#00af5c', '#6366f1': '#22d3ee', '#22d3ee': '#34d399', '#f472b6': '#a78bfa',
    '#fbbf24': '#f87171', '#34d399': '#22d3ee',
  };
  document.documentElement.style.setProperty('--accent', S.prefs.accent);
  document.documentElement.style.setProperty('--accent-2', accents[S.prefs.accent] || '#00af5c');
}

/* ------------------------------- api -------------------------------- */

function normalizeBase(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('Enter a server address');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  return url.origin;
}

async function api(path, { method = 'GET', body, auth = true, gate = false, token = null } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  else if (gate && S.gateToken) headers['Authorization'] = `Bearer ${S.gateToken}`;
  else if (auth && S.token) headers['Authorization'] = `Bearer ${S.token}`;
  let res;
  try {
    res = await fetch(S.base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server — check your connection');
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    if (res.status === 401 && data.code === 'auth' && auth) sessionExpired(data.error);
    throw err;
  }
  return data;
}

/* ------------------------------ turnstile ---------------------------- */

let tsScriptPromise = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  tsScriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load captcha script'));
    document.head.appendChild(s);
  });
  return tsScriptPromise;
}

async function mountTurnstile(container) {
  S.tsToken = null;
  try { await loadTurnstile(); } catch (e) { throw e; }
  container.innerHTML = '';
  S.tsWidgetId = window.turnstile.render(container, {
    sitekey: S.info.turnstile.siteKey,
    theme: S.prefs.theme === 'light' ? 'light' : 'dark',
    callback: (token) => { S.tsToken = token; setErr('gate-err', ''); },
    'expired-callback': () => { S.tsToken = null; },
    'error-callback': () => { S.tsToken = null; setErr('gate-err', 'Captcha error — please retry'); },
  });
}
function resetTurnstile() {
  S.tsToken = null;
  try { if (S.tsWidgetId !== null && window.turnstile) window.turnstile.reset(S.tsWidgetId); } catch { /* ignore */ }
}

/* ----------------------- gate-token keep-alive ----------------------- */

/** Gate tokens are 10-minute JWTs. Open servers (no password, no captcha)
 *  can renew them invisibly — so lingering on the sign-in screen never
 *  kicks the user back to the start of the join flow. */
function canSilentlyRenewGate() {
  return !S.info?.serverPasswordRequired && !S.info?.turnstile?.enabled;
}

let gateRenewTimer = null;
function scheduleGateRenew() {
  clearTimeout(gateRenewTimer);
  if (!S.gateToken || S.token || !canSilentlyRenewGate()) return;
  // refresh a bit before the JWT would expire while the tab stays open
  gateRenewTimer = setTimeout(() => {
    if (!S.token) renewGate().catch(() => {});
  }, 8 * 60 * 1000);
}

/** Fetch a fresh gate token (open servers only). Throws on network trouble. */
async function renewGate() {
  const j = await api('/api/gate', { method: 'POST', auth: false, body: {} });
  S.gateToken = j.gateToken;
  S.gateTs = Date.now();
  scheduleGateRenew();
}

// wake-from-sleep: the timer fires late, so renew on focus if the token went stale
window.addEventListener('focus', () => {
  if (!S.token && S.gateToken && canSilentlyRenewGate() && Date.now() - (S.gateTs || 0) > 8 * 60 * 1000) {
    renewGate().catch(() => {});
  }
});

/* --------------------------- error helper --------------------------- */

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', Boolean(msg));
  if (msg) {
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); // restart shake
  }
}

/* ============================ JOIN FLOW ============================ */

function stepDots(active, total = 4) {
  return `<div class="gate-steps">${Array.from({ length: total }, (_, i) =>
    `<span class="${i < active ? 'done' : i === active ? 'active' : ''}"></span>`).join('')}</div>`;
}

const appRoot = $('#app');

function gateCardShell({ title, sub, step, body }) {
  return `
  <div class="center-stage">
    <div class="gate-card">
      <div class="gate-head"><div class="logo">${logoImg()}</div><div>
        <div class="gate-title">${esc(title)}</div>
      </div></div>
      <div class="gate-sub">${sub}</div>
      ${stepDots(step)}
      ${body}
    </div>
  </div>`;
}

function swapTo(renderFn) {
  const card = $('.gate-card');
  if (!card) return renderFn();
  card.classList.add('swap-out');
  setTimeout(renderFn, 210);
}

/* -------------------------- step 1: server -------------------------- */

function showServerScreen(notice = '') {
  teardownApp();
  S.authDraft = null; // "start over" clears saved form input too
  const recent = store.recentServers;
  // The single-file build (__EFADRO_SINGLE_FILE__, set by `npm run build`) is
  // usually NOT hosted on the efadro server itself, so location.origin would be
  // the wrong guess there — suggest the default local port instead.
  const singleFile = Boolean(window.__EFADRO_SINGLE_FILE__);
  const defBase = localStorage.getItem('efadro:lastbase') ||
    (!singleFile && location.protocol.startsWith('http') ? location.origin : '') ||
    (singleFile ? 'http://localhost:3000' : '');
  S.base = defBase || S.base;

  appRoot.innerHTML = gateCardShell({
    title: 'efadro',
    sub: 'Self-hosted messaging. Enter the address of the server you want to join.',
    step: 0,
    body: `
      ${notice ? `<div class="form-error show">${esc(notice)}</div>` : ''}
      <div class="form-error" id="gate-err"></div>
      <div class="field">
        <label>Server address</label>
        <input class="input mono" id="server-url" placeholder="https://chat.example.com" value="${esc(defBase)}" autocomplete="off" spellcheck="false" />
      </div>
      <button class="btn btn-primary btn-block mt-2" id="connect-btn">${icons.globe}<span>Connect</span></button>
      ${recent.length ? `<div class="small faint mt-4 mb-2">Recent servers</div>
        <div class="recent-servers">${recent.map((r) => `<button class="server-chip" data-url="${esc(r.url)}"><span class="dot"></span>${esc(r.name || r.url)}</button>`).join('')}</div>` : ''}
      <div class="small faint mt-4" style="text-align:center">Don't have a server? Ask an admin for an invite address.</div>
    `,
  });

  const input = $('#server-url');
  const btn = $('#connect-btn');
  input.focus();
  input.select();
  $$('.server-chip').forEach((chip) => chip.addEventListener('click', () => {
    input.value = chip.dataset.url;
    btn.click();
  }));
  const go = () => startFlow(input.value);
  btn.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

async function startFlow(baseInput, { skipIfSession = true } = {}) {
  setErr('gate-err', '');
  const btn = $('#connect-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Connecting…</span>';
  try {
    S.base = normalizeBase(baseInput);
    S.info = null;
    const info = await (async () => {
      let res;
      try { res = await fetch(S.base + '/api/info'); } catch { throw new Error('Cannot reach that server. Check the address.'); }
      if (!res.ok) throw new Error('That address did not respond like an efadro server');
      const j = await res.json();
      if (j.product !== 'efadro') throw new Error('That address did not respond like an efadro server');
      return j;
    })();
    S.info = info;
    localStorage.setItem('efadro:lastbase', S.base);
    store.addRecentServer(S.base, info.name);

    // Quick-resume: a saved session for this server skips the whole gate.
    const sess = store.sessions[S.base];
    if (sess?.token && skipIfSession) {
      S.token = sess.token; S.user = sess.user;
      try {
        const me = await api('/api/auth/me');
        S.user = me.user;
        store.saveSession(S.base, { token: S.token, user: S.user });
        return enterApp();
      } catch (e) {
        store.clearSession(S.base);
        S.token = null; S.user = null;
        if (e?.data?.code === 'banned') return showServerScreen('Your account is banned on this server.');
      }
    }
    proceedToCaptcha();
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `${icons.globe}<span>Connect</span>`;
    setErr('gate-err', e.message);
  }
}

/* ------------------------- step 2: captcha -------------------------- */

function proceedToCaptcha() {
  if (!S.info?.turnstile?.enabled) return proceedToPassword();
  swapTo(() => {
    appRoot.innerHTML = gateCardShell({
      title: 'Human check',
      sub: `<b>${esc(S.info.name)}</b> is protected by Cloudflare Turnstile. Complete the check to continue.`,
      step: 1,
      body: `
        <div class="form-error" id="gate-err"></div>
        <div id="ts-container"></div>
        <button class="btn btn-primary btn-block" id="ts-next" disabled><span>Continue</span></button>
        <div class="captcha-note">Protected by Cloudflare Turnstile</div>
        <div class="row mt-3" style="justify-content:space-between">
          <button class="link" id="back-server">← different server</button>
          <span class="server-chip"><span class="dot"></span>${esc(S.info.name)}</span>
        </div>`,
    });
    mountTurnstile($('#ts-container')).catch(() => setErr('gate-err', 'Failed to load captcha — check your network'));
    $('#back-server').onclick = () => showServerScreen();
    const next = $('#ts-next');
    const poll = setInterval(() => {
      if (!document.body.contains(next)) return clearInterval(poll);
      next.disabled = !S.tsToken;
    }, 250);
    next.onclick = () => { clearInterval(poll); proceedToPassword(); };
  });
}

/* ----------------------- step 3: server password ----------------------- */

function proceedToPassword() {
  if (!S.info?.serverPasswordRequired) return submitGate('');
  swapTo(() => {
    appRoot.innerHTML = gateCardShell({
      title: 'Server password',
      sub: `<b>${esc(S.info.name)}</b> requires a password to join. Ask the server admin if you don't have it.`,
      step: 2,
      body: `
        <div class="form-error" id="gate-err"></div>
        <div class="field">
          <label>Server password</label>
          <div class="input-wrap">
            <input class="input" id="server-pass" type="password" placeholder="••••••••" autocomplete="off" />
            <button class="input-eye" id="toggle-pass" type="button">${icons.eye}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-block mt-2" id="pass-next">${icons.lock}<span>Unlock server</span></button>
        <div class="row mt-3"><button class="link" id="back-cap">← back</button></div>`,
    });
    const input = $('#server-pass');
    input.focus();
    $('#toggle-pass').onclick = (e) => {
      input.type = input.type === 'password' ? 'text' : 'password';
      e.currentTarget.innerHTML = input.type === 'password' ? icons.eye : icons.eyeOff;
    };
    const go = () => submitGate(input.value);
    $('#pass-next').onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#back-cap').onclick = () => (S.info.turnstile.enabled ? (resetTurnstile(), proceedToCaptcha()) : showServerScreen());
  });
}

async function submitGate(serverPassword) {
  setErr('gate-err', '');
  const btn = $('#pass-next') || $('#ts-next');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span>Verifying…</span>'; }
  try {
    const j = await api('/api/gate', {
      method: 'POST', auth: false,
      body: { serverPassword, turnstileToken: S.tsToken || '' },
    });
    S.gateToken = j.gateToken;
    S.gateTs = Date.now();
    scheduleGateRenew();
    showAuth('login', S.authDraft || {});
  } catch (e) {
    if (e?.data?.code === 'captcha' && S.info.turnstile.enabled) {
      resetTurnstile();
      return proceedToCaptcha(), setTimeout(() => setErr('gate-err', e.message), 260);
    }
    if (btn) { btn.disabled = false; btn.innerHTML = `${icons.lock}<span>Unlock server</span>`; }
    setErr('gate-err', e.message);
  }
}

/* ------------------------- step 4: login/signup ------------------------- */

function showAuth(mode = 'login', prefill = {}) {
  const regOn = S.info?.registrationEnabled;
  swapTo(() => {
    appRoot.innerHTML = gateCardShell({
      title: mode === 'login' ? 'Welcome back' : 'Create account',
      sub: `Signing in to <b>${esc(S.info.name)}</b>`,
      step: 3,
      body: `
        ${regOn ? `
        <div class="auth-tabs">
          <div class="tab-pill ${mode === 'register' ? 'right' : ''}"></div>
          <button class="${mode === 'login' ? 'active' : ''}" id="tab-login">Sign in</button>
          <button class="${mode === 'register' ? 'active' : ''}" id="tab-register">Sign up</button>
        </div>` : `<div class="small muted mb-3">Registration is closed on this server — sign in with an existing account.</div>`}
        <div class="form-error" id="gate-err"></div>
        ${mode === 'register' ? `
        <div class="field"><label>Display name</label>
          <input class="input" id="auth-display" maxlength="40" placeholder="How others will see you" value="${esc(prefill.displayName || '')}" /></div>` : ''}
        <div class="field"><label>Username</label>
          <input class="input mono" id="auth-user" maxlength="24" placeholder="username" value="${esc(prefill.username || '')}" autocomplete="username" spellcheck="false" /></div>
        <div class="field"><label>Password ${mode === 'register' ? '<span class="faint">(min. 8 chars)</span>' : ''}</label>
          <div class="input-wrap">
            <input class="input" id="auth-pass" type="password" placeholder="••••••••" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" />
            <button class="input-eye" id="toggle-auth-pass" type="button">${icons.eye}</button>
          </div></div>
        <button class="btn btn-primary btn-block mt-2" id="auth-go">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <div class="row mt-3" style="justify-content:space-between">
          <button class="link" id="auth-back">← start over</button>
          <span class="server-chip"><span class="dot"></span>${esc(S.info.name)}</span>
        </div>
        <div class="ver-line">client v${CLIENT_VERSION} · server v${esc(S.info.version || '?')}${S.info.version && S.info.version !== CLIENT_VERSION ? ' — versions differ, update both to the latest release' : ''}</div>`,
    });

    $('#tab-login')?.addEventListener('click', () => showAuth('login', collectAuth()));
    $('#tab-register')?.addEventListener('click', () => showAuth('register', collectAuth()));
    $('#auth-back').onclick = () => showServerScreen();
    const passEl = $('#auth-pass');
    $('#toggle-auth-pass').onclick = (e) => {
      passEl.type = passEl.type === 'password' ? 'text' : 'password';
      e.currentTarget.innerHTML = passEl.type === 'password' ? icons.eye : icons.eyeOff;
    };
    const userEl = $('#auth-user');
    (prefill.username ? passEl : userEl).focus();
    const submit = () => doAuth(mode);
    $('#auth-go').onclick = submit;
    [userEl, passEl, $('#auth-display')].forEach((el) => el?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  });
}

function collectAuth() {
  return {
    username: $('#auth-user')?.value || '',
    displayName: $('#auth-display')?.value || '',
  };
}

async function doAuth(mode, gateRetry = false) {
  setErr('gate-err', '');
  const btn = $('#auth-go');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>One moment…</span>';
  S.authDraft = collectAuth(); // survive any join-step re-do below
  try {
    const username = $('#auth-user').value.trim();
    const password = $('#auth-pass').value;
    const body = mode === 'register'
      ? { username, password, displayName: $('#auth-display')?.value.trim() }
      : { username, password };
    const j = await api(`/api/auth/${mode === 'register' ? 'signup' : 'login'}`, {
      method: 'POST', body, auth: false, gate: true,
    });
    if (mode === 'login' && j.twoFactor) {
      return showTwoFactor(j.pendingToken);
    }
    S.token = j.token;
    S.user = j.user;
    store.saveSession(S.base, { token: S.token, user: S.user });
    toast(`Welcome, ${j.user.displayName}!`, 'success');
    enterApp();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = mode === 'register' ? 'Create account' : 'Sign in';
    if (e?.data?.code === 'gate') {
      // The 10-minute join window expired (or the server restarted with a new
      // key). Recover in place — never bounce the user back to square one.
      if (canSilentlyRenewGate() && !gateRetry) {
        try {
          await renewGate();
          return doAuth(mode, true);
        } catch {
          // renewal itself failed — almost always a network hiccup; be honest
          return setErr('gate-err', 'Lost the connection while renewing your join session — check your network and press Sign in again.');
        }
      }
      // Gated server (password/captcha): redo only the missing step, keep the typed username
      toast('Your join window expired — one more step to continue', 'info', 4000);
      if (S.info?.turnstile?.enabled) {
        resetTurnstile();
        return proceedToCaptcha();
      }
      if (S.info?.serverPasswordRequired) return proceedToPassword();
      return showServerScreen('Your join window expired — please join again.');
    }
    setErr('gate-err', e.message);
  }
}

/* ------------------------- step 4b: two-factor ------------------------- */

function showTwoFactor(pendingToken) {
  swapTo(() => {
    appRoot.innerHTML = gateCardShell({
      title: 'Two-factor authentication',
      sub: `This account is protected. Enter the 6-digit code from your authenticator app — or one of your backup codes.`,
      step: 3,
      body: `
        <div class="form-error" id="gate-err"></div>
        <div class="field">
          <label>Verification code</label>
          <input class="input mono tfa-code" id="tf-code" inputmode="text" autocomplete="one-time-code"
                 maxlength="14" placeholder="123456" />
        </div>
        <button class="btn btn-primary btn-block" id="tf-go">${icons.shieldCheck}<span>Verify</span></button>
        <div class="row mt-3" style="justify-content:space-between">
          <button class="link" id="tf-back">← different account</button>
          <span class="server-chip"><span class="dot"></span>${esc(S.info?.name || '')}</span>
        </div>`,
    });
    const input = $('#tf-code');
    input.focus();
    $('#tf-back').onclick = () => showAuth('login');
    const go = async () => {
      const btn = $('#tf-go');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span><span>Verifying…</span>';
      try {
        const j = await api('/api/auth/login/2fa', {
          method: 'POST', body: { code: input.value.trim() }, auth: false, token: pendingToken,
        });
        S.token = j.token;
        S.user = j.user;
        store.saveSession(S.base, { token: S.token, user: S.user });
        if (j.usedBackupCode) {
          toast(`Signed in with a backup code — ${j.user.backupCodesLeft} left`, 'info', 5000);
        } else {
          toast(`Welcome back, ${j.user.displayName}!`, 'success');
        }
        enterApp();
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = `${icons.shieldCheck}<span>Verify</span>`;
        if (e?.data?.code === '2fa') {
          // the 5-minute pending token expired — restart the sign-in, keep the username
          toast('Your 2FA window expired — please sign in again', 'info', 4000);
          return showAuth('login', S.authDraft || {});
        }
        setErr('gate-err', e.message);
        input.select();
      }
    };
    $('#tf-go').onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

/* ============================== CHAT APP ============================== */

function avatarHtml(user, sizeClass = '', withPresence = false, group = false) {
  const bg = user?.avatarColor || '#1bd96a';
  const inner = user?.selfChat
    ? '🔖'
    : user?.avatarUrl
      ? `<img class="a-img" src="${S.base}${user.avatarUrl}?t=${encodeURIComponent(S.token || '')}&v=${S.avatarTs}" alt="" loading="lazy" />`
      : esc(initials(user?.displayName || user?.name));
  return `<div class="avatar ${sizeClass} ${group ? 'group' : ''}" style="background:${esc(bg)}" data-uid="${esc(user?.id || '')}">${inner}
    ${withPresence ? `<span class="presence ${S.online.has(user?.id) ? 'on' : ''}" data-pid="${esc(user?.id || '')}"></span>` : ''}
  </div>`;
}

const roleBadge = (role) => `<span class="role-badge role-${esc(role)}">${esc(role)}</span>`;

function chatTitle(chat) {
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find((m) => m.id !== S.user.id);
  return other ? other.displayName : 'Saved Messages';
}
function chatPeer(chat) {
  return chat.members.find((m) => m.id !== S.user.id) || null;
}
function chatAvatar(chat, sizeClass = '', withPresence = true) {
  if (chat.type === 'group') return avatarHtml({ displayName: chat.name, avatarColor: '#16a34a' }, sizeClass, false, true);
  const other = chatPeer(chat);
  if (!other) return avatarHtml({ selfChat: true, avatarColor: '#0ea5e9' }, sizeClass);
  return avatarHtml(other, sizeClass, withPresence);
}

function teardownApp() {
  // end an ongoing call before dropping the signaling channel
  if (S.call?.id) {
    const c = S.call;
    if (['active', 'connecting'].includes(c.state)) wsSend({ t: 'call:end', data: { callId: c.id, reason: 'hangup' } });
    else if (c.dir === 'out') wsSend({ t: 'call:cancel', data: { callId: c.id } });
    else wsSend({ t: 'call:decline', data: { callId: c.id } });
  }
  try { clearCall(''); } catch { /* ignore */ }
  S.wsManualClose = true;
  try { S.ws?.close(); } catch { /* ignore */ }
  try { stopRecording(false); } catch { /* ignore */ }
  S.ws = null; S.wsOpen = false;
  S.chats = [];
  S.activeChatId = null;
  S.msg = {};
  S.online = new Set();
  S.typing = new Map();
  S.editing = null;
  S.replyTo = null;
  S.search = null;
  S.panel = { open: false, tab: 'users', cache: {} };
  document.title = 'efadro';
}

function sessionExpired(reason) {
  if (!S.base) return;
  store.clearSession(S.base);
  S.token = null; S.user = null;
  if ($('.shell') || $('.panel-overlay')) {
    showServerScreen(reason || 'Session expired — please sign in again.');
  }
}

async function logout() {
  teardownApp();
  store.clearSession(S.base);
  S.token = null; S.user = null; S.gateToken = null;
  showServerScreen();
}

async function enterApp() {
  renderShell();
  await loadChats();
  connectWS();
  void bootE2EE();      // identity probe / transfer prompt (v1.5)
  processPendingInvite(); // auto-join via a shared invite link (v1.4)
}

function renderShell() {
  const isStaff = roleLevel(S.user.role) >= 1;
  appRoot.innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div class="side-top">
        <div class="logo logo-sm">${logoImg()}</div>
        <div class="titles grow">
          <div class="t1">${esc(S.info?.name || 'efadro')}</div>
          <div class="t2"><span class="conn-dot" id="conn-dot"></span><span id="conn-text">connecting…</span></div>
        </div>
      </div>
      <div class="side-actions">
        <div class="search-box">${icons.search}<input class="input" id="chat-filter" placeholder="Search chats" /></div>
        <button class="btn btn-icon" id="new-chat-btn" title="New chat">${icons.plus}</button>
      </div>
      <div class="chat-list" id="chat-list"></div>
      <div class="gs-results" id="gs-results" style="display:none"></div>
      <div id="e2ee-slot"></div>
      <div class="side-bottom">
        <div class="user-chip" id="me-chip">
          ${avatarHtml(S.user, 'sm')}
          <div class="grow" style="min-width:0">
            <div class="uc-name">${esc(S.user.displayName)}</div>
            <div class="uc-role">${esc(S.user.role)}</div>
          </div>
        </div>
        ${isStaff ? `<button class="btn btn-icon" id="panel-btn" title="Staff panel">${icons.shield}</button>` : ''}
        <button class="btn btn-icon" id="settings-btn" title="Settings">${icons.gear}</button>
        <button class="btn btn-icon" id="logout-btn" title="Sign out">${icons.logout}</button>
      </div>
    </aside>
    <main class="chat-pane" id="chat-pane">
      <div class="chat-empty">
        <div class="big-icon">${icons.chat}</div>
        <div>Select a chat to start messaging</div>
        <button class="btn btn-primary btn-sm" id="empty-new-chat">${icons.plus}<span>New chat</span></button>
      </div>
    </main>
  </div>`;

  $('#logout-btn').onclick = async () => { if (await confirmModal({ title: 'Sign out?', confirmText: 'Sign out' })) logout(); };
  $('#settings-btn').onclick = openSettings;
  $('#panel-btn')?.addEventListener('click', () => openPanel());
  $('#me-chip').onclick = openSettings;
  $('#new-chat-btn').onclick = openNewChat;
  $('#empty-new-chat')?.addEventListener('click', openNewChat);
  $('#chat-filter').addEventListener('input', handleSidebarInput);
  $('#chat-filter').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; handleSidebarInput(e); }
  });
  const chatListEl = $('#chat-list');
  chatListEl.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    e.preventDefault();
    openChatMenu(item.dataset.chatId, e.clientX, e.clientY);
  });
  let lpTimer = null;
  chatListEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    const t = e.touches[0];
    lpTimer = setTimeout(() => { lpTimer = null; openChatMenu(item.dataset.chatId, t.clientX, t.clientY); }, 550);
  }, { passive: true });
  chatListEl.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
  chatListEl.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
  renderChatList();
  setConn('wait', 'connecting…');
}

function setConn(state, text) {
  const dot = $('#conn-dot'), t = $('#conn-text');
  if (!dot || !t) return;
  dot.className = `conn-dot ${state === 'on' ? 'on' : state === 'wait' ? 'wait' : ''}`;
  t.textContent = text;
}

/* ------------------------------ chat list ------------------------------ */

async function loadChats() {
  const list = $('#chat-list');
  list.innerHTML = Array.from({ length: 4 }, () => `
    <div class="sk-item"><div class="sk sk-circle"></div>
      <div class="sk-lines"><div class="sk sk-line w60"></div><div class="sk sk-line w85"></div></div>
    </div>`).join('');
  try {
    const { chats } = await api('/api/chats');
    S.chats = chats;
    sortChats();
    renderChatList();
  } catch (e) {
    list.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
  }
}

function sortChats() {
  S.chats.sort((a, b) => {
    const ap = a.prefs?.pinned ? 1 : 0, bp = b.prefs?.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap; // pinned first, then by recency
    return ((b.lastMessage?.createdAt ?? b.createdAt) - (a.lastMessage?.createdAt ?? a.createdAt));
  });
}

function upsertChat(chat) {
  const i = S.chats.findIndex((c) => c.id === chat.id);
  if (i >= 0) S.chats[i] = chat; else S.chats.unshift(chat);
  sortChats();
}

const getChat = (id) => S.chats.find((c) => c.id === id);

const findLoadedMsg = (chatId, id) => S.msg[chatId]?.items.find((m) => String(m.id) === String(id)) || null;

/** Decrypted plaintext of a message; null = ciphertext this device can't unlock. */
function plainOf(msg) {
  if (!msg) return '';
  if (msg._pt != null) return msg._pt;
  if (msg.enc) return null;
  return msg.content || '';
}

const lockedLabel = (msg) => (E2EE.isReady()
  ? '🔒 Couldn’t decrypt this message — its key never reached this device'
  : (msg?.system ? '🔒 Set up encryption to read' : '🔒 Encrypted message — set up this device to read it'));

function chatItemHtml(c) {
  const lm = c.lastMessage;
  const author = lm && !lm.system ? (lm.author.id === S.user.id ? 'You' : (c.type === 'group' ? lm.author.displayName : '')) : '';
  let body = lm ? (lm.enc ? (plainOf(lm) ?? 'Encrypted message') : (lm.content || '')) : '';
  if (lm?.poll) body = `📊 ${lm.poll.question}`;
  if (lm?.file) {
      const label = lm.file.kind === 'voice' ? '🎤 Voice message'
        : lm.file.mime?.startsWith('image/') ? '📷 Photo'
        : lm.file.mime?.startsWith('video/') ? '🎬 Video'
        : lm.file.mime?.startsWith('audio/') ? '🎵 Audio'
        : `📎 ${lm.file.name || 'File'}`;
      body = body ? `${label} — ${body}` : label;
    }
  if (lm && !body && lm.fwdFrom) body = 'Forwarded message';
  const preview = lm ? `${lm.enc ? '🔒 ' : ''}${author ? author + ': ' : ''}${body || '…'}` : 'No messages yet';
  const time = lm ? fmtListTime(lm.createdAt) : '';
  const flags = `${c.prefs?.pinned ? `<span class="ci-flag" title="Pinned">${icons.pin}</span>` : ''}${c.prefs?.muted ? `<span class="ci-flag" title="Muted">${icons.bellOff}</span>` : ''}`;
  return `
    <div class="chat-item ${c.id === S.activeChatId ? 'active' : ''} ${c.prefs?.archived ? 'archived' : ''}" data-chat-id="${esc(c.id)}">
      ${chatAvatar(c, '', true)}
      <div class="ci-main">
        <div class="ci-title"><span class="ci-name">${esc(chatTitle(c))}</span>${flags}<span class="ci-time">${esc(time)}</span></div>
        <div class="ci-preview">${esc(preview)}</div>
      </div>
      ${c.unreadMentions > 0 ? `<span class="ci-badge ci-badge-me" title="Unread mentions">@${c.unreadMentions > 99 ? '99+' : c.unreadMentions}</span>` : ''}
      ${c.unread > 0 ? `<span class="ci-badge ${c.prefs?.muted ? 'ci-badge-muted' : ''}">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
    </div>`;
}

function renderChatList(filter = '') {
  const list = $('#chat-list');
  if (!list) return;
  const q = filter.trim().toLowerCase();
  const archived = S.chats.filter((c) => c.prefs?.archived);
  const chats = S.chats.filter((c) => !c.prefs?.archived)
    .filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
  const archUnread = archived.reduce((n, c) => n + (c.unread > 0 && !c.prefs?.muted ? 1 : 0), 0);
  list.innerHTML =
    (chats.length
      ? `<div class="list-label">Chats</div>` + chats.map(chatItemHtml).join('')
      : (archived.length ? '' : `<div class="empty-note">${q ? 'No chats match your search' : 'No chats yet — press + to start one'}</div>`))
    + (archived.length && !q
      ? `<button class="arch-toggle" id="arch-toggle">${icons.archive}<span>Archived</span>${archUnread ? `<span class="arch-dot" title="${archUnread} with unread"></span>` : ''}<span class="arch-count">${archived.length}</span><span class="arch-chev ${S.showArchived ? 'open' : ''}">${icons.down}</span></button>
         ${S.showArchived ? archived.map(chatItemHtml).join('') : ''}`
      : '');
  $('#arch-toggle')?.addEventListener('click', () => {
    S.showArchived = !S.showArchived;
    renderChatList($('#chat-filter')?.value || '');
  });
  updateTitle();
}

/* ---------------- per-chat prefs + chat context menu (v1.4) ---------------- */

async function setChatPref(chatId, key, value) {
  try {
    const { prefs } = await api(`/api/chats/${encodeURIComponent(chatId)}/prefs`, { method: 'PATCH', body: { [key]: value } });
    const chat = getChat(chatId);
    if (chat) {
      chat.prefs = prefs;
      sortChats();
      renderChatList($('#chat-filter')?.value || '');
    }
    toast(
      key === 'pinned' ? (prefs.pinned ? 'Chat pinned' : 'Chat unpinned')
        : key === 'muted' ? (prefs.muted ? 'Notifications muted 🔕' : 'Notifications unmuted')
        : (prefs.archived ? 'Chat archived' : 'Chat unarchived'),
      'success', 1800,
    );
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteChatForever(chat) {
  const isSelf = !chatPeer(chat);
  const body = isSelf
    ? 'Your Saved Messages history will be deleted permanently.'
    : 'The chat will disappear from your list. The other person keeps their copy.';
  if (await confirmModal({ title: 'Delete this chat?', body, confirmText: 'Delete', danger: true })) {
    try {
      await api(`/api/chats/${encodeURIComponent(chat.id)}/members/${encodeURIComponent(S.user.id)}`, { method: 'DELETE' });
    } catch (e) { toast(e.message, 'error'); }
  }
}

async function leaveGroupForever(chat) {
  if (await confirmModal({ title: `Leave “${chatTitle(chat)}”?`, confirmText: 'Leave', danger: true })) {
    try {
      await api(`/api/chats/${encodeURIComponent(chat.id)}/members/${encodeURIComponent(S.user.id)}`, { method: 'DELETE' });
    } catch (e) { toast(e.message, 'error'); }
  }
}

let chatMenuEl = null;
function closeChatMenu() {
  chatMenuEl?.remove();
  chatMenuEl = null;
}

function openChatMenu(chatId, x, y) {
  const chat = getChat(chatId);
  if (!chat) return;
  closeChatMenu();
  const items = chatMenuItems(chat);
  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.innerHTML = items.map((it) => it === '-'
    ? '<hr class="ctx-hr" />'
    : `<button class="ctx-item ${it.danger ? 'danger' : ''}" data-ci="${it.key}">${it.icon}<span>${it.label}</span>${it.on ? `<span class="ctx-on">${icons.check}</span>` : ''}</button>`).join('');
  document.body.appendChild(el);
  chatMenuEl = el;
  // keep the menu on screen
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 10))}px`;
  el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 10))}px`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ci]');
    if (!b) return;
    const it = items.find((i) => i !== '-' && i.key === b.dataset.ci);
    closeChatMenu();
    if (it) it.action();
  });
}

function chatMenuItems(chat) {
  const p = chat.prefs || {};
  const items = [
    { key: 'pin', icon: icons.pin, label: p.pinned ? 'Unpin chat' : 'Pin chat', on: p.pinned, action: () => setChatPref(chat.id, 'pinned', !p.pinned) },
    { key: 'mute', icon: icons.bellOff, label: p.muted ? 'Unmute notifications' : 'Mute notifications', on: p.muted, action: () => setChatPref(chat.id, 'muted', !p.muted) },
    { key: 'arch', icon: icons.archive, label: p.archived ? 'Unarchive chat' : 'Archive chat', action: () => setChatPref(chat.id, 'archived', !p.archived) },
    '-',
  ];
  if (chat.type === 'group') items.push({ key: 'leave', icon: icons.logout, label: 'Leave group', danger: true, action: () => leaveGroupForever(chat) });
  else items.push({ key: 'del', icon: icons.trash, label: 'Delete chat', danger: true, action: () => deleteChatForever(chat) });
  return items;
}

document.addEventListener('click', (e) => {
  if (chatMenuEl && !chatMenuEl.contains(e.target)) closeChatMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChatMenu(); });

/* --------------------- global message search (v1.4) --------------------- */

let gsTimer = null;
let gsSeq = 0;

function handleSidebarInput(e) {
  const q = e.target.value;
  renderChatList(q);
  if (gsTimer) clearTimeout(gsTimer);
  const needle = q.trim();
  if (needle.length < 2) { hideGlobalResults(); return; }
  gsTimer = setTimeout(() => runGlobalSearch(needle), 350);
}

function hideGlobalResults() {
  const el = $('#gs-results');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

async function runGlobalSearch(q) {
  const seq = ++gsSeq;
  try {
    const { results } = await api(`/api/chats/search/messages?q=${encodeURIComponent(q)}`);
    if (seq !== gsSeq) return; // a newer query replaced this one
    renderGlobalResults(q, results);
  } catch {
    if (seq === gsSeq) hideGlobalResults();
  }
}

function highlightNeedle(text, needle) {
  const safe = esc(text);
  const n = esc(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return safe.replace(new RegExp(`(${n})`, 'ig'), '<mark>$1</mark>');
}

function renderGlobalResults(q, results) {
  const el = $('#gs-results');
  if (!el) return;
  if (!results.length) { hideGlobalResults(); return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="list-label">Messages</div>` + results.map((r) => {
    const chat = getChat(r.chatId);
    const title = chat ? chatTitle(chat) : 'Chat';
    // window the snippet around the match so the <mark> is actually visible
    const idx = r.content.toLowerCase().indexOf(q.toLowerCase());
    const start = idx > 30 ? Math.max(0, idx - 25) : 0;
    const end = Math.min(r.content.length, start + 90);
    const snip = (start > 0 ? '…' : '') + r.content.slice(start, end) + (end < r.content.length ? '…' : '');
    return `
      <button class="gs-row" data-gs-chat="${esc(r.chatId)}" data-gs-msg="${r.id}">
        ${chat ? chatAvatar(chat, 'xs') : ''}
        <span class="gs-main">
          <span class="gs-top"><b>${esc(title)}</b><span class="gs-time">${fmtListTime(r.createdAt)}</span></span>
          <span class="gs-snip">${esc(r.authorName)}: ${highlightNeedle(snip, q)}</span>
        </span>
      </button>`;
  }).join('');
  $$('.gs-row', el).forEach((b) => b.addEventListener('click', async () => {
    const chatId = b.dataset.gsChat;
    const msgId = Number(b.dataset.gsMsg);
    await openChat(chatId);
    jumpToMessage(msgId, { loadHistory: true });
  }));
}

/* --------------------------- open / render chat --------------------------- */

async function openChat(chatId) {
  const chat = getChat(chatId);
  if (!chat) return;
  S.activeChatId = chatId;
  S.editing = null;
  S.replyTo = null;
  S.search = null;
  closeSuggest();
  $('#shell')?.classList.add('chat-open');
  renderChatList($('#chat-filter')?.value || '');
  if (chat.pinnedMessage?.enc) await E2EE.decryptInto(chatId, [chat.pinnedMessage]);
  renderChatPane(chat);
  const unreadBoundary = (chat.unread || 0) > 0 ? (chat.myLastRead || 0) : 0;
  // Resolve the jump-to-mention target BEFORE loading history (loading marks the chat read server-side)
  S.mentionJump = null;
  if ((chat.unreadMentions || 0) > 0) {
    try {
      const j = await api(`/api/chats/${encodeURIComponent(chatId)}/mention-jump`);
      if (j.messageId) S.mentionJump = { chatId, messageId: j.messageId };
    } catch { /* ignore — button just won't appear */ }
  }
  if (!S.msg[chatId]) {
    $('#messages').innerHTML = `<div class="empty-note"><span class="spinner"></span></div>`;
    await loadMessages(chatId, true);
  } else {
    renderMessages(chatId);
  }
  if (chat.unreadMentions) {
    chat.unreadMentions = 0; // server already cleared it during the history fetch
    renderChatList($('#chat-filter')?.value || '');
  }
  renderMentionJumpBtn();
  // Show a "New messages" divider above the first unread message and land on it
  if (unreadBoundary) {
    const box = $('#messages');
    const firstNew = box && $$('.msg-row', box).find((r) => /^\d+$/.test(r.dataset.msgId) && Number(r.dataset.msgId) > Number(unreadBoundary));
    if (firstNew) {
      const sep = document.createElement('div');
      sep.className = 'unread-sep';
      sep.textContent = 'New messages';
      firstNew.before(sep);
      sep.scrollIntoView({ block: 'center' });
    } else scrollMessages(true);
  } else scrollMessages(true);
  markRead(chatId);
  const ta = $('#composer-input');
  ta?.focus();
}

/** Floating "@" button that jumps to the first unread mention (Telegram-style). */
function renderMentionJumpBtn() {
  $('#mention-jump')?.remove();
  const pane = $('#chat-pane');
  if (!pane || !S.mentionJump || S.mentionJump.chatId !== S.activeChatId) return;
  const btn = document.createElement('button');
  btn.id = 'mention-jump';
  btn.className = 'mention-jump-btn';
  btn.title = 'Jump to your mention';
  btn.innerHTML = icons.at;
  btn.onclick = () => {
    const target = S.mentionJump?.messageId;
    S.mentionJump = null;
    renderMentionJumpBtn();
    if (target) jumpToMessage(target, { loadHistory: true });
  };
  pane.appendChild(btn);
}

function closeChat() {
  S.activeChatId = null;
  S.mentionJump = null;
  $('#shell')?.classList.remove('chat-open');
  renderChatList($('#chat-filter')?.value || '');
  $('#chat-pane').innerHTML = `
    <div class="chat-empty">
      <div class="big-icon">${icons.chat}</div>
      <div>Select a chat to start messaging</div>
    </div>`;
}

function renderChatPane(chat) {
  const pane = $('#chat-pane');
  const peer = chatPeer(chat);
  const sub = chat.type === 'group'
    ? `${chat.members.length} member${chat.members.length === 1 ? '' : 's'}`
    : peer
      ? (S.online.has(peer.id) ? '<span class="accent">online</span>' : esc(fmtLastSeen(peer.lastSeen)))
      : 'notes to yourself';

  pane.innerHTML = `
    <div class="chat-header">
      <button class="btn btn-icon back-btn" id="chat-back">${icons.back}</button>
      ${chatAvatar(chat, 'sm')}
      <div class="grow" style="min-width:0;cursor:pointer" id="chat-info-btn">
        <div class="ch-title">${esc(chatTitle(chat))}</div>
        <div class="ch-sub" id="chat-sub">${sub}</div>
      </div>
      <button class="btn btn-icon hdr-call" id="call-video-btn" title="Video call">${icons.video}</button>
      <button class="btn btn-icon hdr-call" id="call-audio-btn" title="Voice call">${icons.phone}</button>
      ${chat.type === 'dm' && chat.e2ee ? `<button class="btn btn-icon lock-chip" id="lock-chip" title="End-to-end encrypted">${icons.lock}</button>` : ''}
      <button class="btn btn-icon" id="search-btn" title="Search in this chat">${icons.search}</button>
      <button class="btn btn-icon" id="members-btn" title="Members">${chat.type === 'group' ? icons.users : icons.user}</button>
    </div>
    <div class="chat-search" id="chat-search" style="display:none"></div>
    <div class="pinned-bar" id="pinned-bar" style="display:none"></div>
    <div class="messages" id="messages"></div>
    <div class="typing-bar">
      <span id="typing-area"></span>
      <span class="read-status grow" id="read-status"></span>
    </div>
      <div id="mute-area"></div>
      <div id="block-area"></div>
    <div class="composer" id="composer-wrap">
      <div id="reply-banner"></div>
      <div id="edit-banner"></div>
      <div id="rec-slot"></div>
      <div class="fmt-bar" id="fmt-bar">
        <button data-fmt="**" title="Bold (Ctrl+B)">${icons.bold}</button>
        <button data-fmt="__" title="Italic (Ctrl+I)">${icons.italic}</button>
        <button data-fmt="~~" title="Strikethrough">${icons.strike}</button>
        <button data-fmt="\`" title="Inline code (Ctrl+E)">${icons.codeIc}</button>
        <button data-fmt="\`\`\`" data-block="1" title="Code block">${icons.preIc}</button>
        <button data-fmt="||" title="Spoiler">${icons.eyeOff}</button>
      </div>
      <div class="composer-inner" id="composer-inner">
        <input type="file" id="attach-input" style="display:none" />
        <button class="btn btn-ghost btn-icon tool-btn" id="attach-btn" title="Send file">${icons.paperclip}</button>
        <button class="btn btn-ghost btn-icon tool-btn" id="emoji-btn" title="Emoji">${icons.smile}</button>
        <textarea id="composer-input" rows="1" placeholder="${chat.type === 'dm' && chat.e2ee ? 'Message 🔒' : 'Message'}" maxlength="${S.info?.limits?.maxMessageLength || 4000}"></textarea>
        <button class="btn btn-ghost btn-icon tool-btn" id="mic-btn" title="Record voice message">${icons.mic}</button>
        <button class="btn btn-primary btn-icon send-btn" id="send-btn" title="Send">${icons.send}</button>
      </div>
    </div>
    <div class="drop-overlay" id="drop-overlay">
      <div class="drop-box">${icons.paperclip}<div>Drop a file to send it to <b>${esc(chatTitle(chat))}</b></div></div>
    </div>
    <button class="scroll-bottom-btn" id="scroll-bottom">${icons.down}</button>`;

  // Formatting toolbar: wrap the current selection in markup markers
  $$('#fmt-bar [data-fmt]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep the textarea selection alive
      wrapSelection($('#composer-input'), b.dataset.fmt, b.dataset.block === '1');
    });
  });

  $('#chat-back').onclick = closeChat;
  $('#lock-chip')?.addEventListener('click', () => showEncryptionInfo(chat));
  $('#call-audio-btn')?.addEventListener('click', () => startCall(chat.id, { video: false }));
  $('#call-video-btn')?.addEventListener('click', () => startCall(chat.id, { video: true }));
  $('#members-btn').onclick = () => openMembersDrawer(chat.id);
  $('#chat-info-btn').onclick = () => openMembersDrawer(chat.id);
  $('#scroll-bottom').onclick = () => scrollMessages(true);
  $('#mic-btn').onclick = startRecording;
  $('#search-btn').onclick = () => toggleChatSearch();
  renderPinnedBar(chat);
  suggestEl = null; // pane re-rendered — drop any stale :emoji popover

  const ta = $('#composer-input');
  ta.value = loadDraft(chat.id);
  if (ta.value) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  }
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
    saveDraft(chat.id, ta.value);
    sendTyping();
    emojiSuggest(ta);
  });
  ta.addEventListener('keydown', (e) => {
    if (suggestEl && (e.key === 'Enter' || e.key === 'Tab')) {
      const ch = $$('button', suggestEl).find((b) => b.classList.contains('active'))?.dataset.ch
        || $('button', suggestEl)?.dataset.ch;
      if (ch) { e.preventDefault(); completeSuggest(ta, ch); return; }
    }
    if (e.key === 'Escape' && suggestEl) { e.preventDefault(); closeSuggest(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && ['b', 'i', 'e'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      wrapSelection(ta, { b: '**', i: '__', e: '`' }[e.key.toLowerCase()]);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCurrentMessage();
    }
  });
  $('#send-btn').onclick = sendCurrentMessage;
  $('#emoji-btn').onclick = (e) => emojiPicker(e.currentTarget, (emo) => {
    const start = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + emo + ta.value.slice(ta.selectionEnd ?? start);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + emo.length;
  });

  // — file sending: picker, clipboard paste, drag & drop
  const attachInput = $('#attach-input');
  $('#attach-btn').onclick = (e) => {
    e.stopPropagation();
    openAttachMenu(e.currentTarget, () => attachInput.click(), openPollModal);
  };
  attachInput.addEventListener('change', () => {
    if (attachInput.files?.[0]) openUploadModal(attachInput.files[0]);
    attachInput.value = '';
  });
  ta.addEventListener('paste', (e) => {
    const f = e.clipboardData?.files?.[0];
    if (f) {
      e.preventDefault();
      openUploadModal(f);
    }
  });

  const overlay = $('#drop-overlay');
  let dragDepth = 0;
  pane.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add('show');
  });
  pane.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
  });
  pane.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove('show');
  });
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');
    const f = e.dataTransfer?.files?.[0];
    if (f) openUploadModal(f);
  });

  const msgs = $('#messages');
  msgs.addEventListener('scroll', () => {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 220;
    $('#scroll-bottom').classList.toggle('show', !nearBottom);
    if (msgs.scrollTop < 80) loadOlderMessages(chat.id);
    if (nearBottom) markReadSoon(chat.id);
  });

  renderMuteBanner();
  renderBlockBanner();
}

/* --------------------------- pinned message --------------------------- */
function renderPinnedBar(chat) {
  const bar = $('#pinned-bar');
  if (!bar) return;
  const p = chat?.pinnedMessage;
  if (!p) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  const snippet = p.file ? `📎 ${plainOf(p) || p.file.name || 'attachment'}` : (plainOf(p) ?? (p.enc ? '🔒 Encrypted message' : '…'));
  const canPin = chat.type === 'dm' || chat.createdBy === S.user.id || roleLevel(S.user.role) >= 1;
  bar.innerHTML = `
    <span class="pb-ic">${icons.pin}</span>
    <div class="pb-body">
      <div class="pb-title">Pinned message</div>
      <div class="pb-text">${esc(snippet.slice(0, 140))}</div>
    </div>
    ${canPin ? `<button class="btn btn-ghost btn-icon pb-unpin" id="pb-unpin" title="Unpin">${icons.x}</button>` : ''}`;
  bar.style.display = '';
  bar.onclick = (e) => { if (!e.target.closest('#pb-unpin')) jumpToMessage(p.id); };
  $('#pb-unpin', bar)?.addEventListener('click', async () => {
    try { await api(`/api/messages/${p.id}/pin`, { method: 'POST', body: { pin: false } }); }
    catch (e) { toast(e.message, 'error'); }
  });
}

async function jumpToMessage(id, { loadHistory = false } = {}) {
  const findRow = () => $(`#messages [data-msg-id="${CSS.escape(String(id))}"]`);
  let row = findRow();
  if (!row && loadHistory && S.activeChatId) {
    const st = S.msg[S.activeChatId];
    let pages = 0;
    while (st?.hasMore && pages < 12 && !st.items.some((m) => String(m.id) === String(id))) {
      // eslint-disable-next-line no-await-in-loop
      await loadOlderMessages(S.activeChatId);
      pages++;
    }
    row = findRow();
  }
  if (!row) return toast('That message is further back — scroll up to load older history', 'info', 3200);
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth; // restart the highlight animation
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1750);
}

/* ------------------------------ chat search ------------------------------ */

function toggleChatSearch(force = null) {
  const bar = $('#chat-search');
  if (!bar) return;
  const show = force ?? bar.style.display === 'none';
  if (!show) {
    bar.style.display = 'none';
    S.search = null;
    $('#composer-input')?.focus();
    return;
  }
  bar.style.display = '';
  bar.innerHTML = `
    <span class="cs-ic">${icons.search}</span>
    <input class="cs-input" id="cs-input" placeholder="Search in this chat…" autocomplete="off" />
    <span class="cs-count" id="cs-count"></span>
    <button class="btn btn-ghost btn-icon" id="cs-older" title="Older match">${icons.up}</button>
    <button class="btn btn-ghost btn-icon" id="cs-newer" title="Newer match">${icons.down}</button>
    <button class="btn btn-ghost btn-icon" id="cs-close" title="Close">${icons.x}</button>`;
  const input = $('#cs-input');
  input.focus();
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runChatSearch(input.value), 280);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runChatSearch(input.value); }
    if (e.key === 'Escape') { e.preventDefault(); toggleChatSearch(false); }
  });
  $('#cs-older').onclick = () => jumpToResult(1);
  $('#cs-newer').onclick = () => jumpToResult(-1);
  $('#cs-close').onclick = () => toggleChatSearch(false);
}

async function runChatSearch(q) {
  const chatId = S.activeChatId;
  S.search = { q, results: [], pos: -1 };
  const count = $('#cs-count');
  if (!q.trim()) { if (count) count.textContent = ''; return; }
  if (count) count.textContent = '…';
  try {
    const { results } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages/search?q=${encodeURIComponent(q.trim())}`);
    if (S.activeChatId !== chatId || !S.search || S.search.q !== q) return;
    S.search.results = results;
    S.search.pos = results.length ? 0 : -1;
    if (count) count.textContent = results.length ? `1 of ${results.length}` : 'No matches';
    if (results.length) jumpToResult(0);
  } catch {
    if (count) count.textContent = 'Search failed';
  }
}

function jumpToResult(dir) {
  const s = S.search;
  if (!s?.results?.length) return;
  s.pos = (s.pos + dir + s.results.length) % s.results.length;
  const count = $('#cs-count');
  if (count) count.textContent = `${s.pos + 1} of ${s.results.length}`;
  jumpToMessage(s.results[s.pos].id, { loadHistory: true });
}

/* ----------------------------- per-chat drafts ----------------------------- */

const draftKey = (chatId) => `efadro:draft:${S.base}:${chatId}`;
/** Wrap the textarea selection (or a placeholder word) in formatting markers. */
function wrapSelection(ta, marker, block = false) {
  if (!ta) return;
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || 'text';
  const ins = block ? `${marker}\n${sel}\n${marker}` : `${marker}${sel}${marker}`;
  ta.value = value.slice(0, s) + ins + value.slice(e);
  ta.focus();
  const inner = s + marker.length + (block ? 1 : 0);
  ta.selectionStart = inner;
  ta.selectionEnd = inner + sel.length;
  ta.dispatchEvent(new Event('input', { bubbles: true })); // resize + draft save
}

function saveDraft(chatId, text) {
  try {
    if (text) localStorage.setItem(draftKey(chatId), text);
    else localStorage.removeItem(draftKey(chatId));
  } catch { /* storage full/blocked */ }
}
function loadDraft(chatId) {
  try { return localStorage.getItem(draftKey(chatId)) || ''; } catch { return ''; }
}

/* --------------------------- :emoji: autocomplete --------------------------- */

let suggestEl = null;
function closeSuggest() { suggestEl?.remove(); suggestEl = null; }

function emojiSuggest(ta) {
  const caret = ta.selectionStart ?? ta.value.length;
  const upto = ta.value.slice(0, caret);
  const m = upto.match(/(^|[\s]):([a-z0-9_+\-]{2,})$/i);
  if (!m) return closeSuggest();
  const hits = searchEmoji(m[2]).slice(0, 8);
  if (!hits.length) return closeSuggest();
  if (!suggestEl) {
    suggestEl = document.createElement('div');
    suggestEl.className = 'suggest-pop';
    $('#composer-inner')?.appendChild(suggestEl);
    suggestEl.addEventListener('mousedown', (e) => {
      const b = e.target.closest('button[data-ch]');
      if (!b) return;
      e.preventDefault(); // keep composer focus
      completeSuggest(ta, b.dataset.ch);
    });
  }
  suggestEl.innerHTML = hits.map((ch, i) =>
    `<button data-ch="${ch}" class="${i === 0 ? 'active' : ''}">${emojiImg(ch, 'emoji sg-img')}<span class="sg-q">:${esc(m[2])}</span></button>`).join('');
}

function completeSuggest(ta, ch) {
  const caret = ta.selectionStart ?? ta.value.length;
  const upto = ta.value.slice(0, caret);
  const m = upto.match(/:([a-z0-9_+\-]{2,})$/i);
  if (!m || !ch) return closeSuggest();
  const start = caret - m[0].length;
  ta.value = upto.slice(0, start) + ch + ta.value.slice(caret);
  const pos = start + ch.length;
  ta.selectionStart = ta.selectionEnd = pos;
  pushRecentEmoji(ch);
  saveDraft(S.activeChatId, ta.value);
  closeSuggest();
  ta.focus();
}

/* --------------------------- desktop notifications --------------------------- */

function desktopNotify(message, chat) {
  if (!S.prefs.notify || !chat) return;
  if (document.hasFocus() || message.author.id === S.user.id) return;
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const plain = plainOf(message);
    const what = message.system ? message.content
      : message.enc && plain === null ? '🔒 Encrypted message'
      : plain
        ? plain
        : message.poll ? `📊 ${message.poll.question}`
        : message.file ? (message.file.kind === 'voice' ? '🎤 Voice message' : `📎 ${message.file.name}`) : '…';
    const n = new Notification(`${message.author.displayName} · ${chatTitle(chat)}`, {
      body: what.slice(0, 180),
      icon: NOTIFY_ICON,
      tag: `efadro-${chat.id}`, // one bubble per chat, replaces itself
    });
    n.onclick = () => {
      window.focus();
      openChat(chat.id);
      n.close();
    };
  } catch { /* notifications unavailable */ }
}

/* ------------------------------ quick switcher ------------------------------ */

function openQuickSwitcher() {
  openModal(`
    <div class="qs-box">
      <div class="qs-input-wrap">${icons.search}<input class="qs-input" id="qs-input" placeholder="Jump to a chat…  (Ctrl+K)" autocomplete="off" /></div>
      <div class="qs-list" id="qs-list"></div>
      <div class="qs-hint">↑↓ to move · Enter to open · Esc to close</div>
    </div>`, {
    onMount(root, close) {
      const input = $('#qs-input', root);
      const list = $('#qs-list', root);
      let idx = 0;
      let rows = [];
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        rows = S.chats.filter((c) => !q || chatTitle(c).toLowerCase().includes(q)).slice(0, 9);
        idx = Math.max(0, Math.min(idx, rows.length - 1));
        list.innerHTML = rows.length ? rows.map((c, i) => {
          const lm = c.lastMessage;
          const prev = lm ? (lm.content || (lm.file ? '📎 attachment' : '…')).slice(0, 60) : 'No messages yet';
          return `
          <div class="qs-row ${i === idx ? 'active' : ''}" data-cid="${esc(c.id)}">
            ${chatAvatar(c, 'sm', false)}
            <div class="grow" style="min-width:0">
              <div style="font-weight:650">${esc(chatTitle(c))}</div>
              <div class="small faint">${esc(prev)}</div>
            </div>
            ${c.unread > 0 ? `<span class="ci-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
          </div>`;
        }).join('') : '<div class="empty-note">No chats match</div>';
        $$('.qs-row', list).forEach((el) => el.addEventListener('click', () => pick(el.dataset.cid)));
      };
      const pick = (cid) => { close(); if (cid) openChat(cid); };
      input.addEventListener('input', () => { idx = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, rows.length - 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(rows[idx]?.id); }
      });
      draw();
      setTimeout(() => input.focus(), 40);
    },
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (S.user && $('.shell')) openQuickSwitcher();
  }
});

function renderMuteBanner() {
  const area = $('#mute-area');
  if (!area) return;
  const muted = (S.user.mutedUntil || 0) > Date.now();
  area.innerHTML = muted
    ? `<div class="mute-banner">${icons.warn}<span>You are muted until <b>${new Date(S.user.mutedUntil).toLocaleString()}</b>${S.user.muteReason ? ` — ${esc(S.user.muteReason)}` : ''}</span></div>`
    : '';
  updateComposerVisibility();
}

/** The composer hides while the user is muted or while they blocked the open DM peer. */
function updateComposerVisibility() {
  const wrap = $('#composer-wrap');
  if (!wrap) return;
  const muted = (S.user.mutedUntil || 0) > Date.now();
  const chat = getChat(S.activeChatId);
  const peer = chat?.type === 'dm' ? chatPeer(chat) : null;
  const blocked = Boolean(chat?.type === 'dm' && peer && chat.blocked);
  wrap.style.display = muted || blocked ? 'none' : '';
}

/** Banner over the composer when *I* blocked my DM peer (the composer is useless: the server rejects sends). */
function renderBlockBanner() {
  const area = $('#block-area');
  if (!area) return;
  const chat = getChat(S.activeChatId);
  const peer = chat?.type === 'dm' ? chatPeer(chat) : null;
  const blocked = Boolean(chat?.type === 'dm' && peer && chat.blocked);
  area.innerHTML = blocked
    ? `<div class="mute-banner block-banner">${icons.ban}
         <span>You blocked <b>@${esc(peer?.username || '')}</b> — their messages and calls silently never reach you (and they can’t tell).</span>
         <button class="btn btn-sm" id="block-unblock-btn">${icons.refresh}<span>Unblock</span></button>
       </div>`
    : '';
  updateComposerVisibility();
  $('#block-unblock-btn', area)?.addEventListener('click', async () => {
    if (!peer) return;
    try {
      await api(`/api/users/${encodeURIComponent(peer.id)}/block`, { method: 'DELETE' });
      applyBlockState(peer.id, false);
      toast(`Unblocked @${peer.username}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}

/** Update the local DM state after a block/unblock (WS pushes it too; this covers REST-only moments). */
function applyBlockState(peerId, blocked) {
  const chat = S.chats.find((c) => c.type === 'dm' && c.members?.some((m) => m.id === peerId) && c.members?.some((m) => m.id === S.user.id));
  if (chat) {
    chat.blocked = blocked;
    if (S.activeChatId === chat.id) renderBlockBanner();
    renderChatList($('#chat-filter')?.value || '');
  }
}

async function toggleBlockUser(peer, { ask = true } = {}) {
  if (!peer || peer.id === S.user.id) return false;
  const dm = S.chats.find((c) => c.type === 'dm' && c.members?.some((m) => m.id === peer.id));
  const currentlyBlocked = peer.blocked !== undefined ? Boolean(peer.blocked) : Boolean(dm?.blocked);
  if (!currentlyBlocked && ask) {
    const yes = await confirmModal({
      title: `Block @${peer.username}?`,
      body: 'Their new messages and calls will silently never reach you — from their side everything keeps looking normal (messages send, calls just ring out), so they can’t tell they were blocked. They are not notified. Shared group chats are unaffected.',
      confirmText: 'Block',
      danger: true,
    });
    if (!yes) return false;
  }
  try {
    await api(`/api/users/${encodeURIComponent(peer.id)}/block`, { method: currentlyBlocked ? 'DELETE' : 'POST' });
    applyBlockState(peer.id, !currentlyBlocked);
    toast(currentlyBlocked ? `Unblocked @${peer.username}` : `Blocked @${peer.username}`, 'success');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

/* ----------------------------- messages ------------------------------ */

async function loadMessages(chatId, initial = false) {
  const st = (S.msg[chatId] ||= { items: [], hasMore: true, loadingOlder: false });
  try {
    const { messages, hasMore } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages?limit=40`);
    await E2EE.decryptInto(chatId, messages);
    // Merge, don't clobber: messages sent/received while the fetch was in flight
    // (optimistic bubbles, WS echoes) are newer than the fetched page — keep them.
    const fetched = new Set(messages.map((m) => String(m.id)));
    const inflight = st.items.filter((m) => !fetched.has(String(m.id)));
    st.items = [...messages, ...inflight];
    st.hasMore = hasMore;
    if (initial || S.activeChatId === chatId) renderMessages(chatId);
  } catch (e) {
    if (S.activeChatId === chatId) $('#messages').innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
  }
}

async function loadOlderMessages(chatId) {
  const st = S.msg[chatId];
  if (!st || !st.hasMore || st.loadingOlder || !st.items.length) return;
  st.loadingOlder = true;
  const box = $('#messages');
  const prevHeight = box ? box.scrollHeight : 0;
  try {
    const before = st.items[0].id;
    const { messages, hasMore } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages?limit=40&before=${before}`);
    await E2EE.decryptInto(chatId, messages);
    st.items = [...messages, ...st.items];
    st.hasMore = hasMore;
    if (S.activeChatId === chatId) {
      renderMessages(chatId, { keepScroll: true });
      if (box) box.scrollTop = box.scrollHeight - prevHeight;
    }
  } catch { /* keep state, retry on next scroll */ }
  st.loadingOlder = false;
}

function roleColor(role) {
  return { owner: 'var(--warning)', admin: 'var(--danger)', moderator: 'var(--info)' }[role] || 'var(--accent-2)';
}

/* Telegram-style message markup, single pass over raw text:
   **bold**  __italic__  ~~strike~~  ||spoiler||  `code`  ```pre```  @mention  + links */
const FORMAT_RE = /(```[\s\S]+?```|`[^`\n]+`|\*\*[^\n*][^\n]*?\*\*|__[^\n_][^\n]*?__|~~[^\n~][^\n]*?~~|\|\|[^\n|][^\n]*?\|\||https?:\/\/[^\s"'<>()]+|@[A-Za-z0-9_]{2,24})/g;

function renderContent(raw, chat = null) {
  const scan = String(raw ?? '');
  const hits = [];
  let m;
  FORMAT_RE.lastIndex = 0;
  while ((m = FORMAT_RE.exec(scan))) hits.push(m);
  let out = '';
  let last = 0;
  for (const mm of hits) {
    out += esc(scan.slice(last, mm.index));
    const tok = mm[0];
    if (tok.startsWith('```')) {
      out += `<pre class="msg-pre">${esc(tok.slice(3, -3).replace(/^\n+|\n+$/g, ''))}</pre>`;
    } else if (tok.startsWith('`')) {
      out += `<code class="msg-code">${esc(tok.slice(1, -1))}</code>`;
    } else if (tok.startsWith('**')) {
      out += `<b>${esc(tok.slice(2, -2))}</b>`;
    } else if (tok.startsWith('__')) {
      out += `<i>${esc(tok.slice(2, -2))}</i>`;
    } else if (tok.startsWith('~~')) {
      out += `<s>${esc(tok.slice(2, -2))}</s>`;
    } else if (tok.startsWith('||')) {
      out += `<span class="spoiler" data-spoiler="1" title="Click to reveal">${esc(tok.slice(2, -2))}</span>`;
    } else if (tok.startsWith('@')) {
      const uname = tok.slice(1).toLowerCase();
      const member = chat?.members?.find((x) => String(x.username).toLowerCase() === uname);
      out += member
        ? `<span class="mention${member.id === S.user.id ? ' me' : ''}">${esc(tok)}</span>`
        : esc(tok);
    } else {
      let u = tok;
      const trail = (u.match(/[.,;:!?)\]]+$/) || [''])[0];
      u = u.slice(0, u.length - trail.length);
      const safe = esc(u);
      if (/\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i.test(u)) {
        out += `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a><br><img class="msg-img" loading="lazy" src="${safe}" alt="image" />`;
      } else {
        out += `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
      }
      out += esc(trail);
    }
    last = mm.index + tok.length;
  }
  out += esc(scan.slice(last));
  return renderEmojiText(out); // swap emoji chars for Telegram-style images
}

function fileUrl(f) {
  return `${S.base}/api/files/${f.id}?t=${encodeURIComponent(S.token)}`;
}

const fmtDur = (ms) => {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function fileHtml(f, own = false, msg = null) {
  if (!f) return '';
  if (f.enc) {
    const note = E2EE.isReady() ? 'Decrypting attachment…' : '🔒 Encrypted attachment — set up this device to open it';
    return `<div class="enc-file ${E2EE.isReady() ? '' : 'enc-failed'}" data-file-id="${esc(f.id)}" data-msg-id="${esc(String(msg?.id ?? ''))}">${E2EE.isReady() ? '<span class="spinner"></span>' : icons.lock}<span>${esc(note)}</span></div>`;
  }
  const url = fileUrl(f);
  if (f.mime.startsWith('image/')) {
    return `<img class="msg-img" loading="lazy" src="${url}" alt="${esc(f.name)}" />`;
  }
  if (f.mime.startsWith('video/')) {
    return `<video class="msg-video" controls preload="metadata" src="${url}"></video>`;
  }
  if (f.kind === 'voice' || f.mime.startsWith('audio/')) {
    return `
      <div class="voice-msg ${f.kind === 'voice' ? 'is-voice' : ''}">
        <span class="v-ic">${icons.mic}</span>
        <audio controls preload="metadata" src="${url}"></audio>
        <span class="v-dur">${f.duration ? fmtDur(f.duration) : ''}</span>
      </div>`;
  }
  return `
    <a class="file-card" href="${url}" download="${esc(f.name)}" target="_blank" rel="noopener noreferrer">
      <span class="f-ic">${icons.file}</span>
      <span class="f-meta"><span class="f-name">${esc(f.name)}</span><span class="f-size">${fmtSize(f.size)}</span></span>
      <span class="f-dl">${icons.download}</span>
    </a>`;
}

function replyQuoteHtml(replyTo) {
  if (!replyTo) return '';
  if (replyTo.deleted) {
    return `<div class="reply-quote deleted">${icons.trash}<span class="rq-text">Original message was deleted</span></div>`;
  }
  let snippet;
  if (replyTo.hasFile) snippet = `📎 ${replyTo.enc ? 'attachment' : (replyTo.snippet || 'attachment')}`;
  else if (replyTo.enc) {
    const orig = findLoadedMsg(replyTo.chatId ?? S.activeChatId, replyTo.id);
    snippet = (orig && plainOf(orig)) ?? '🔒 Encrypted message';
  } else snippet = replyTo.snippet || '…';
  return `
    <div class="reply-quote" data-jump="${replyTo.id}" role="button" tabindex="0">
      <div class="rq-body">
        <span class="rq-name">${esc(replyTo.authorName)}</span>
        <span class="rq-text">${esc(snippet.slice(0, 90))}</span>
      </div>
    </div>`;
}

function fileHtmlDecrypted(f, url) {
  if (f.mime.startsWith('image/')) return `<img class="msg-img" loading="lazy" src="${url}" alt="${esc(f.name)}" />`;
  if (f.mime.startsWith('video/')) return `<video class="msg-video" controls preload="metadata" src="${url}"></video>`;
  if (f.kind === 'voice' || f.mime.startsWith('audio/')) {
    return `<div class="voice-msg ${f.kind === 'voice' ? 'is-voice' : ''}">
      <span class="v-ic">${icons.mic}</span>
      <audio controls preload="metadata" src="${url}"></audio>
      <span class="v-dur">${f.duration ? fmtDur(f.duration) : ''}</span>
    </div>`;
  }
  return `<a class="file-card" href="${url}" download="${esc(f.name)}" target="_blank" rel="noopener noreferrer">
    <span class="f-ic">${icons.file}</span>
    <span class="f-meta"><span class="f-name">${esc(f.name)}</span><span class="f-size">${fmtSize(f.size)}</span></span>
    <span class="f-dl">${icons.download}</span>
  </a>`;
}

const encBlobCache = new Map(); // fileId -> blob: URL (bounded FIFO)
const encBlobInflight = new Map(); // fileId -> Promise

async function resolveEncFileSlot(slot, msg) {
  if (!slot?.isConnected || slot.dataset.done) return;
  slot.dataset.done = '1';
  try {
    let url = encBlobCache.get(msg.file.id);
    if (!url) {
      if (!encBlobInflight.has(msg.file.id)) {
        encBlobInflight.set(msg.file.id, (async () => {
          const res = await fetch(fileUrl(msg.file));
          if (!res.ok) throw new Error(`download failed (${res.status})`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const plain = await E2EE.decryptFile(msg, bytes);
          if (!plain) throw new Error('Cannot decrypt this attachment');
          const u = URL.createObjectURL(new Blob([plain], { type: msg.file.mime || 'application/octet-stream' }));
          if (encBlobCache.size > 200) {
            const oldest = encBlobCache.keys().next().value;
            URL.revokeObjectURL(encBlobCache.get(oldest));
            encBlobCache.delete(oldest);
          }
          encBlobCache.set(msg.file.id, u);
          encBlobInflight.delete(msg.file.id);
          return u;
        })());
      }
      url = await encBlobInflight.get(msg.file.id);
    }
    if (slot.isConnected) slot.outerHTML = fileHtmlDecrypted(msg.file, url);
  } catch (e) {
    if (slot.isConnected) {
      slot.classList.add('enc-failed');
      slot.innerHTML = `${icons.lock}<span>${esc(e.message || 'Couldn’t decrypt this attachment')}</span>`;
    }
    encBlobInflight.delete(msg.file.id);
  }
}

/** Scan rendered rows for encrypted-attachment placeholders and resolve them. */
function hydrateEncFiles(chatId) {
  if (!E2EE.isReady()) return;
  $$('.enc-file[data-msg-id]').forEach((slot) => {
    const msg = findLoadedMsg(chatId, slot.dataset.msgId);
    if (msg?.file?.enc) void resolveEncFileSlot(slot, msg);
  });
}

function reactionsHtml(msg) {
  if (!msg.reactions?.length) return '<div class="reactions"></div>';
  return `<div class="reactions">${msg.reactions.map((r) => `
    <button class="rx-chip ${r.me ? 'me' : ''}" data-emoji="${esc(r.emoji)}" title="${esc(r.emoji)} ×${r.count}">
      ${emojiImg(r.emoji, 'emoji rx-img')}<span class="rx-count">${r.count}</span>
    </button>`).join('')}</div>`;
}

function shouldGroup(prev, cur) {
  return prev && prev.author.id === cur.author.id && (cur.createdAt - prev.createdAt) < 5 * 60000;
}

function canPinMessage(msg) {
  const chat = getChat(msg.chatId);
  if (!chat) return false;
  return chat.type === 'dm' || chat.createdBy === S.user.id || roleLevel(S.user.role) >= 1;
}

function messageNode(msg, prevMsg) {
  if (msg.system) {
    const row = document.createElement('div');
    row.className = 'sys-msg-row';
    row.dataset.msgId = msg.id;
    row.innerHTML = `<div class="sys-msg">${esc(msg.content)}</div>`;
    return row;
  }
  const own = msg.author.id === S.user.id;
  const grouped = shouldGroup(prevMsg, msg);
  const row = document.createElement('div');
  row.className = `msg-row ${own ? 'out' : ''} ${grouped ? 'grouped' : ''} ${msg.pending ? 'pending' : ''}`;
  row.dataset.msgId = msg.id;
  row.dataset.authorId = msg.author.id;
  row.dataset.ts = msg.createdAt;
  const chat = getChat(msg.chatId);
  const plain = plainOf(msg);
  const locked = msg.enc && plain === null;
  const canDelete = own || roleLevel(S.user.role) > roleLevel(msg.author.role) || (chat?.createdBy === S.user.id && chat?.type === 'group');
  const canEdit = own;
  const pinned = chat?.pinnedMessage?.id === msg.id;
  row.innerHTML = `
    ${avatarHtml(msg.author, 'xs')}
    <div class="msg-bubble">
      <div class="msg-head">
        <span class="msg-author" style="color:${own ? 'rgba(255,255,255,.85)' : roleColor(msg.author.role)}">${esc(msg.author.displayName)}</span>
        <span class="msg-time">${msg.pending ? `<span class="msg-pending-ico" title="Sending…">${icons.clock}</span>` : fmtTime(msg.createdAt)}${pinned ? ` <span class="pin-mark">${icons.pin}</span>` : ''}</span>
      </div>
      ${msg.fwdFrom ? `<div class="fwd-label">${icons.forward} Forwarded from <b>${esc(msg.fwdFrom)}</b></div>` : ''}
      ${replyQuoteHtml(msg.replyTo)}
      ${fileHtml(msg.file, own, msg)}
      ${msg.poll ? pollHtml(msg) : ''}
      ${(plain !== null && plain !== '') ? `<div class="msg-text ${emojiOnly(plain) ? 'jumbo' : ''}">${renderContent(plain, chat)}${msg.editedAt ? '<span class="msg-edited">(edited)</span>' : ''}</div>` : locked ? `<div class="msg-text msg-locked">${esc(lockedLabel(msg))}</div>` : (msg.editedAt ? '<span class="msg-edited">(edited)</span>' : '')}
      ${reactionsHtml(msg)}
      <div class="msg-actions">
        <button data-act="react" title="React">${icons.smile}</button>
        <button data-act="reply" title="Reply">${icons.reply}</button>
        ${!msg.poll && !msg.enc ? `<button data-act="forward" title="Forward">${icons.forward}</button>` : ''}
        ${!msg.poll && canEdit && !locked ? `<button data-act="edit" title="Edit">${icons.pencil}</button>` : ''}
        ${canPinMessage(msg) ? `<button data-act="pin" title="${pinned ? 'Unpin' : 'Pin'} message">${icons.pin}</button>` : ''}
        <button data-act="copy" title="Copy">${icons.copy}</button>
        ${!own ? `<button data-act="report" title="Report">${icons.flag}</button>` : ''}
        ${canDelete ? `<button data-act="del" class="danger" title="Delete">${icons.trash}</button>` : ''}
      </div>
    </div>`;
  return row;
}

function renderMessages(chatId, { keepScroll = false } = {}) {
  const box = $('#messages');
  const st = S.msg[chatId];
  if (!box || !st) return;
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 250;
  box.innerHTML = '';
  if (st.hasMore && st.items.length) {
    const more = document.createElement('div');
    more.className = 'empty-note';
    more.textContent = 'Scroll up to load older messages';
    box.appendChild(more);
  }
  let prev = null;
  let lastDay = '';
  for (const m of st.items) {
    const day = fmtDay(m.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      const d = document.createElement('div');
      d.className = 'day-sep';
      d.textContent = day;
      box.appendChild(d);
      prev = null;
    }
    box.appendChild(messageNode(m, prev));
    prev = m.system ? null : m;
  }
  hydrateEncFiles(chatId);
  if (!st.items.length) {
    const e = document.createElement('div');
    e.className = 'empty-note';
    e.textContent = 'No messages yet — say hi! 👋';
    box.appendChild(e);
  }
  if (!keepScroll && wasNearBottom) scrollMessages(true);
  updateReadStatus();
}

function scrollMessages(instant = false) {
  const box = $('#messages');
  if (!box) return;
  if (instant) box.style.scrollBehavior = 'auto';
  box.scrollTop = box.scrollHeight;
  if (instant) box.style.scrollBehavior = '';
}

function appendMessageNode(msg) {
  const box = $('#messages');
  const st = S.msg[msg.chatId];
  if (!box || !st || S.activeChatId !== msg.chatId) return;
  let prev = st.items[st.items.length - 1] || null;
  if (prev?.system || msg.system) prev = null;
  const day = fmtDay(msg.createdAt);
  const lastSep = $$('.day-sep', box).pop();
  if (!lastSep || lastSep.textContent !== day) {
    const d = document.createElement('div');
    d.className = 'day-sep';
    d.textContent = day;
    box.appendChild(d);
    prev && (prev._groupBreak = true);
  }
  const empty = $('.empty-note', box);
  empty?.remove();
  box.appendChild(messageNode(msg, prev && !prev._groupBreak ? prev : null));
  if (msg.file?.enc) hydrateEncFiles(msg.chatId);
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 250;
  if (nearBottom || msg.author.id === S.user.id) scrollMessages();
  else $('#scroll-bottom')?.classList.add('show');
}

/* --------------------------- read receipts --------------------------- */

const readThrottle = new Map();
function markReadSoon(chatId) {
  if (readThrottle.has(chatId)) return;
  readThrottle.set(chatId, setTimeout(() => { readThrottle.delete(chatId); markRead(chatId); }, 600));
}

const readRetryTail = new Map(); // chatId -> optimistic tail id we already retried once

function markRead(chatId) {
  const chat = getChat(chatId);
  const st = S.msg[chatId];
  // only real (server-issued, numeric) ids may advance the read cursor —
  // an optimistic bubble's clientId must never poison last_read
  const last = st?.items ? [...st.items].reverse().find((m) => /^\d+$/.test(String(m.id))) : null;
  if (!chat || !last) {
    if (chat) {
      chat.unread = 0;
      renderChatList($('#chat-filter')?.value || '');
      // The tail may still be an optimistic bubble whose server echo hasn't
      // landed yet — retry once for that tail so the cursor can advance to a
      // real id as soon as the echo arrives (bounded: once per unique tail).
      const tail = st?.items?.at(-1);
      if (tail && !/^\d+$/.test(String(tail.id)) && readRetryTail.get(chatId) !== String(tail.id)) {
        readRetryTail.set(chatId, String(tail.id));
        setTimeout(() => markRead(chatId), 800);
      }
    }
    return;
  }
  readRetryTail.delete(chatId);
  if (chat.unread === 0 && chat.myLastRead >= last.id && !chat.unreadMentions) return;
  chat.unread = 0;
  chat.unreadMentions = 0;
  chat.myLastRead = last.id;
  renderChatList($('#chat-filter')?.value || '');
  wsSend({ t: 'read', data: { chatId, messageId: last.id } }) ||
    api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', body: { messageId: last.id } }).catch(() => {});
}

function updateReadStatus() {
  const el = $('#read-status');
  if (!el) return;
  const chat = getChat(S.activeChatId);
  if (!chat || chat.type !== 'dm') { el.innerHTML = ''; return; }
  const peer = chatPeer(chat);
  if (!peer) { el.innerHTML = ''; return; } // saved messages
  const st = S.msg[chat.id];
  const lastOwn = st?.items ? [...st.items].reverse().find((m) => m.author.id === S.user.id) : null;
  if (!lastOwn) { el.innerHTML = ''; return; }
  const peerMember = chat.members.find((m) => m.id === peer.id);
  const seen = (peerMember?.lastRead || 0) >= lastOwn.id;
  el.innerHTML = seen
    ? `<span class="seen">${icons.checks} Seen</span>`
    : `${icons.check} Sent`;
}

/* ============================ calls (v1.6) ============================
   1:1 voice & video over WebRTC (DTLS-SRTP, peer-to-peer — media never
   touches the server); signaling rides the existing WebSocket hub.
   States: requesting → outgoing ─┬→ connecting → active → (terminal)
              incoming (callee) ──┘ */

let callCfg = null;          // {enabled, ringTimeoutSec, iceServers} from /api/calls/config
let callCfgPromise = null;

function loadCallCfg() {
  if (!callCfgPromise) {
    callCfgPromise = api('/api/calls/config')
      .then((c) => { callCfg = c; return c; })
      .catch(() => { callCfg = { enabled: false, iceServers: [] }; return callCfg; });
  }
  return callCfgPromise;
}

/** v1.6.1: call buttons are ALWAYS rendered in the chat header (every chat
    type). startCall() explains with a toast when the open chat isn't callable
    (group, Saved Messages, insecure context, admin-disabled) — hiding the
    buttons made the feature undiscoverable. */

/* -------- local call state -------- */

function newCallState({ id = null, chatId, video, dir, peer }) {
  return {
    id, chatId, video, dir, peer,
    state: dir === 'out' ? 'requesting' : 'incoming',
    pc: null, localStream: null, remoteStream: null, remoteHasVideo: false,
    iceQueue: [], micMuted: false, camOff: false,
    startedAt: 0, timerInt: null, discTimer: null, watchdog: null,
  };
}

const callActive = () => Boolean(S.call);

function fmtCallDur(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/* -------- ringtone / ringback (WebAudio, no assets) -------- */

const ring = { int: null };
function ringStop() { if (ring.int) { clearInterval(ring.int); ring.int = null; } }
function ringTone(freqs, durMs) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.().catch(() => {});
    const t0 = audioCtx.currentTime;
    freqs.forEach(([f, at]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'sine';
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + at + 0.03);
      g.gain.setValueAtTime(0.07, t0 + at + durMs / 1000 - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + durMs / 1000);
      o.start(t0 + at); o.stop(t0 + at + durMs / 1000 + 0.02);
    });
  } catch { /* audio is best-effort */ }
}
/** kind: 'in' — classic two-burst ringtone; 'out' — long 425 Hz ringback. */
function ringStart(kind) {
  ringStop();
  const cycle = kind === 'in'
    ? () => { ringTone([[880, 0], [660, 0]], 350); ringTone([[880, 0.5], [660, 0.5]], 350); }
    : () => ringTone([[425, 0]], 1000);
  cycle();
  ring.int = setInterval(cycle, kind === 'in' ? 2000 : 3500);
}

/* -------- overlay UI -------- */

function removeCallOverlay() { $('#call-overlay')?.remove(); }

function renderCallUI() {
  const c = S.call;
  if (!c) { removeCallOverlay(); return; }
  const chat = getChat(c.chatId);
  const name = c.peer?.displayName || c.peer?.username || (chat ? chatTitle(chat) : 'Call');
  const isVideoLayout = c.video && c.remoteHasVideo && ['active', 'connecting'].includes(c.state);
  const kindLabel = `${c.video ? icons.video : icons.phone}<span>${c.video ? 'Video call' : 'Voice call'}</span>`;

  const statusText = {
    requesting: 'Calling…',
    outgoing: 'Ringing…',
    incoming: `Incoming ${c.video ? 'video' : 'voice'} call`,
    connecting: 'Connecting…',
    active: `<span class="call-timer" id="call-timer">${fmtCallDur(c.startedAt ? Math.floor((Date.now() - c.startedAt) / 1000) : 0)}</span>`,
    ending: '',
  }[c.state] || '';

  const controls = (() => {
    if (c.state === 'incoming') {
      return `
        <div class="call-ctl"><button class="call-btn hangup" id="call-decline" title="Decline">${icons.phoneOff}</button><span class="call-btn-label">Decline</span></div>
        <div class="call-ctl"><button class="call-btn accept" id="call-accept" title="Accept">${c.video ? icons.video : icons.phone}</button><span class="call-btn-label">Accept</span></div>`;
    }
    if (['requesting', 'outgoing', 'connecting'].includes(c.state)) {
      return `
        <div class="call-ctl"><button class="call-btn hangup" id="call-cancel" title="Cancel">${icons.phoneOff}</button><span class="call-btn-label">Cancel</span></div>`;
    }
    if (c.state === 'active') {
      return `
        <div class="call-ctl"><button class="call-btn ${c.micMuted ? 'toggled' : ''}" id="call-mute" title="${c.micMuted ? 'Unmute microphone' : 'Mute microphone'}">${c.micMuted ? icons.micOff : icons.mic}</button><span class="call-btn-label">${c.micMuted ? 'Unmute' : 'Mute'}</span></div>
        ${c.video ? `<div class="call-ctl"><button class="call-btn ${c.camOff ? 'toggled' : ''}" id="call-cam" title="${c.camOff ? 'Turn camera on' : 'Turn camera off'}">${c.camOff ? icons.videoOff : icons.video}</button><span class="call-btn-label">Camera</span></div>` : ''}
        <div class="call-ctl"><button class="call-btn hangup" id="call-hangup" title="Hang up">${icons.phoneOff}</button><span class="call-btn-label">End</span></div>`;
    }
    return '';
  })();

  const avatarRing = ['incoming', 'outgoing', 'requesting'].includes(c.state) ? 'ringing' : '';
  let overlay = $('#call-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'call-overlay';
    overlay.className = 'call-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="call-stage ${isVideoLayout ? 'has-remote-video' : ''}">
      <video class="call-remote ${c.video ? '' : 'hidden'}" id="call-remote-video" autoplay playsinline></video>
      <div class="call-top-chip">
        ${c.video ? icons.video : icons.phone}
        <b>${esc(name)}</b>
        <span class="call-timer" id="call-timer-chip">${c.state === 'active' && c.startedAt ? fmtCallDur(Math.floor((Date.now() - c.startedAt) / 1000)) : ''}</span>
      </div>
      <video class="call-local ${(c.video && !c.camOff && c.localStream) ? '' : 'hidden'}" id="call-local-video" autoplay playsinline muted></video>
      <audio id="call-remote-audio" autoplay></audio>
      <div class="call-center">
        <div class="call-avatar ${avatarRing}">${chat ? chatAvatar(chat, 'lg') : ''}</div>
        <div class="call-name">${esc(name)}</div>
        <div class="call-kind">${kindLabel}</div>
        <div class="call-status" id="call-status">${statusText}</div>
      </div>
      <div class="call-controls">${controls}</div>
    </div>`;

  $('#call-accept')?.addEventListener('click', () => void acceptCall());
  $('#call-decline')?.addEventListener('click', () => { declineCall(); });
  $('#call-cancel')?.addEventListener('click', () => { hangupCall('cancel'); });
  $('#call-hangup')?.addEventListener('click', () => { hangupCall('hangup'); });
  $('#call-mute')?.addEventListener('click', () => setCallMicMuted(!S.call?.micMuted));
  $('#call-cam')?.addEventListener('click', () => setCallCamOff(!S.call?.camOff));
  attachCallStreams();
}

/** Brief terminal state (auto-closes), then the overlay goes away. */
function renderCallEnded(statusText) {
  const overlay = $('#call-overlay');
  if (!overlay) return;
  const stage = overlay.querySelector('.call-stage');
  stage?.classList.remove('has-remote-video');
  const status = overlay.querySelector('#call-status');
  if (status) status.textContent = statusText;
  const controls = overlay.querySelector('.call-controls');
  if (controls) controls.innerHTML = '';
  setTimeout(() => overlay.classList.add('closing'), 500);
  setTimeout(removeCallOverlay, 950);
}

function attachCallStreams() {
  const c = S.call;
  if (!c) return;
  const rv = $('#call-remote-video');
  if (rv && c.remoteStream && rv.srcObject !== c.remoteStream) { rv.srcObject = c.remoteStream; rv.play?.().catch(() => {}); }
  const ra = $('#call-remote-audio');
  if (ra && c.remoteStream && ra.srcObject !== c.remoteStream) { ra.srcObject = c.remoteStream; ra.play?.().catch(() => {}); }
  const lv = $('#call-local-video');
  if (lv && c.localStream && lv.srcObject !== c.localStream) { lv.srcObject = c.localStream; lv.play?.().catch(() => {}); }
}

/* -------- media -------- */

async function getCallMedia(video) {
  const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  } catch (e) {
    if (video) {
      toast('Camera unavailable — continuing as an audio call', 'error', 4000);
      if (S.call) S.call.camOff = true;
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    }
    throw e;
  }
}

function mediaFail(c, e) {
  const msg = e?.name === 'NotAllowedError'
    ? 'Microphone permission denied — allow it in the browser and retry'
    : e?.name === 'NotFoundError' ? 'No microphone found on this device'
    : e?.name === 'NotReadableError' ? 'Microphone is busy in another app'
    : 'Could not access microphone/camera';
  toast(msg, 'error', 4500);
  hangupCall('failed');
}

/* -------- WebRTC peer -------- */

function buildCallPeer(c) {
  const pc = new RTCPeerConnection({ iceServers: callCfg?.iceServers || [] });
  c.pc = pc;
  if (c.localStream) for (const t of c.localStream.getTracks()) pc.addTrack(t, c.localStream);

  pc.onicecandidate = (e) => {
    if (e.candidate) wsSend({ t: 'call:signal', data: { callId: c.id, data: { kind: 'ice', candidate: e.candidate } } });
  };
  pc.ontrack = (e) => {
    if (!S.call || S.call !== c) return;
    c.remoteStream ||= new MediaStream();
    c.remoteStream.addTrack(e.track);
    if (e.track.kind === 'video') c.remoteHasVideo = true;
    attachCallStreams();
    if (isCallLayoutChanged(c)) renderCallUI();
  };
  pc.onconnectionstatechange = () => {
    if (!S.call || S.call !== c) return;
    const st = pc.connectionState;
    if (st === 'connected') {
      clearTimeout(c.discTimer); c.discTimer = null;
      if (c.state !== 'active') activateCall(c);
    } else if (st === 'disconnected' || st === 'failed') {
      clearTimeout(c.discTimer);
      c.discTimer = setTimeout(() => {
        if (S.call === c && ['disconnected', 'failed'].includes(c.pc?.connectionState)) {
          toast('Call connection lost', 'error');
          hangupCall('failed');
        }
      }, st === 'failed' ? 800 : 5000);
    }
  };
  // flush any signals that arrived before the peer existed
  const early = c.earlySignals;
  c.earlySignals = null;
  if (early?.length) setTimeout(() => { for (const d of early) void onCallSignal({ callId: c.id, data: d }); }, 0);
  return pc;
}

/** re-render only when the layout-relevant flags flipped */
let lastCallLayoutKey = '';
function isCallLayoutChanged(c) {
  const key = `${c.state}|${c.video && c.remoteHasVideo}|${c.camOff}`;
  if (key === lastCallLayoutKey) return false;
  lastCallLayoutKey = key;
  return true;
}

function flushCallIceQueue(c) {
  const q = c.iceQueue.splice(0);
  for (const cand of q) c.pc.addIceCandidate(cand).catch(() => {});
}

function startCallWatchdog(c) {
  clearTimeout(c.watchdog);
  c.watchdog = setTimeout(() => {
    if (S.call === c && c.state === 'connecting') {
      toast('Could not establish a peer connection', 'error');
      hangupCall('failed');
    }
  }, 25000);
}

async function prepareCalleePeer(c) {
  c.localStream = await getCallMedia(c.video);
  buildCallPeer(c);
  attachCallStreams();
}

/** Caller side, once the callee accepted. */
async function onCallAccepted() {
  const c = S.call;
  if (!c || c.dir !== 'out' || !['outgoing', 'requesting'].includes(c.state)) return;
  c.state = 'connecting';
  ringStop();
  renderCallUI();
  try {
    c.localStream = await getCallMedia(c.video);
    buildCallPeer(c);
    attachCallStreams();
    const offer = await c.pc.createOffer();
    await c.pc.setLocalDescription(offer);
    wsSend({ t: 'call:signal', data: { callId: c.id, data: { kind: 'sdp', description: c.pc.localDescription } } });
    startCallWatchdog(c);
  } catch (e) { mediaFail(c, e); }
}

async function onCallSignal({ callId, data }) {
  const c = S.call;
  if (!c || c.id !== callId || !data) return;
  if (!c.pc) {
    // peer not built yet (media still resolving) — never drop signaling,
    // buffer it and let buildCallPeer flush once the pc exists
    (c.earlySignals ||= []).push(data);
    return;
  }
  try {
    if (data.kind === 'sdp') {
      const desc = data.description;
      if (desc.type === 'offer') {
        await c.pc.setRemoteDescription(desc);
        flushCallIceQueue(c);
        const answer = await c.pc.createAnswer();
        await c.pc.setLocalDescription(answer);
        wsSend({ t: 'call:signal', data: { callId, data: { kind: 'sdp', description: c.pc.localDescription } } });
        startCallWatchdog(c);
      } else {
        await c.pc.setRemoteDescription(desc);
        flushCallIceQueue(c);
      }
    } else if (data.kind === 'ice' && data.candidate) {
      if (c.pc.remoteDescription) await c.pc.addIceCandidate(data.candidate).catch(() => {});
      else c.iceQueue.push(data.candidate);
    }
  } catch (e) {
    console.warn('[call] signal error:', e.message);
  }
}

function activateCall(c) {
  c.state = 'active';
  c.startedAt = Date.now();
  clearTimeout(c.watchdog); c.watchdog = null;
  ringStop();
  clearInterval(c.timerInt);
  c.timerInt = setInterval(() => {
    if (!S.call || S.call !== c) { clearInterval(c.timerInt); return; }
    const t = fmtCallDur(Math.floor((Date.now() - c.startedAt) / 1000));
    const el = $('#call-timer'); if (el) el.textContent = t;
    const chip = $('#call-timer-chip'); if (chip) chip.textContent = t;
  }, 1000);
  renderCallUI();
}

/* -------- call lifecycle actions -------- */

async function startCall(chatId, { video = false } = {}) {
  if (S.call) return toast('You are already in a call', 'error');
  const chat = getChat(chatId);
  if (!chat) return;
  // v1.6.1: header buttons are always visible — explain here when a chat
  // isn't callable instead of hiding the buttons (confused users).
  if (chat.type === 'group') return toast('Group calls are not supported yet — open a 1:1 chat to make a call', 'error', 4200);
  const peer = chatPeer(chat);
  if (!peer) return toast('Saved Messages can’t be called — open a 1:1 chat to make a call', 'error', 4200);
  if (chat.blocked) return toast('Unblock this user to call them', 'error', 4200);
  if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
    return toast('Calls need mic/camera access — open efadro via HTTPS (or localhost) so the browser allows it', 'error', 5000);
  }
  await loadCallCfg();
  if (!callCfg?.enabled) return toast('Calls are disabled on this server', 'error');
  S.call = newCallState({ chatId, video, dir: 'out', peer });
  lastCallLayoutKey = '';
  renderCallUI();
  if (!wsSend({ t: 'call:invite', data: { chatId, video } })) {
    clearCall('');
    toast('No connection to the server — try again in a moment', 'error');
  }
}

async function onIncomingCall(call) {
  if (S.call) return; // we somehow got a second ring — server already busy-guards
  let chat = getChat(call.chatId);
  if (!chat) {
    try { const { chat: c } = await api(`/api/chats/${encodeURIComponent(call.chatId)}`); upsertChat(c); chat = c; } catch { return; }
  }
  const peer = chat.members?.find((m) => m.id === call.from) || null;
  S.call = newCallState({ id: call.callId, chatId: call.chatId, video: Boolean(call.video), dir: 'in', peer });
  lastCallLayoutKey = '';
  ringStart('in');
  renderCallUI();
}

async function acceptCall() {
  const c = S.call;
  if (!c || c.dir !== 'in' || c.state !== 'incoming') return;
  ringStop();
  c.state = 'connecting';
  renderCallUI();
  await loadCallCfg();
  // media + peer FIRST — then accept. If the caller's offer arrives while we
  // have no RTCPeerConnection yet, the SDP would be dropped and the call
  // would deadlock in "Connecting…" (lost races on fast machines).
  try {
    await prepareCalleePeer(c);
  } catch (e) { mediaFail(c, e); return; }
  if (!wsSend({ t: 'call:accept', data: { callId: c.id } })) { clearCall('Connection lost'); return; }
}

function declineCall() {
  const c = S.call;
  if (!c) return;
  if (c.dir === 'in' && c.state === 'incoming') wsSend({ t: 'call:decline', data: { callId: c.id } });
  clearCall('');
}

/** Hang up / cancel from any active state. */
function hangupCall(reason = 'hangup') {
  const c = S.call;
  if (!c) return;
  if (['requesting', 'outgoing'].includes(c.state)) wsSend({ t: 'call:cancel', data: { callId: c.id } });
  else wsSend({ t: 'call:end', data: { callId: c.id, reason: reason === 'failed' ? 'failed' : 'hangup' } });
  clearCall('');
}

function setCallMicMuted(flag) {
  const c = S.call;
  if (!c) return;
  c.micMuted = Boolean(flag);
  c.localStream?.getAudioTracks().forEach((t) => { t.enabled = !c.micMuted; });
  renderCallUI();
}

function setCallCamOff(flag) {
  const c = S.call;
  if (!c) return;
  c.camOff = Boolean(flag);
  c.localStream?.getVideoTracks().forEach((t) => { t.enabled = !c.camOff; });
  renderCallUI();
}

/** Full local teardown; terminal events from the server also land here. */
function clearCall(statusText = '') {
  const c = S.call;
  S.call = null;
  ringStop();
  if (c) {
    clearInterval(c.timerInt);
    clearTimeout(c.watchdog);
    clearTimeout(c.discTimer);
    try { c.localStream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { c.pc?.close(); } catch { /* noop */ }
  }
  if (statusText) renderCallEnded(statusText);
  else if (c) removeCallOverlay();
}

function onCallTerminal(data, statusText) {
  const c = S.call;
  if (!c || (data.callId && c.id && c.id !== data.callId)) return;
  clearCall(statusText);
}

/* Don't leak media when the tab closes mid-call */
window.addEventListener('beforeunload', () => {
  const c = S.call;
  if (!c || !c.id) return;
  if (['active', 'connecting'].includes(c.state)) wsSend({ t: 'call:end', data: { callId: c.id, reason: 'hangup' } });
  else if (c.dir === 'out') wsSend({ t: 'call:cancel', data: { callId: c.id } });
  else wsSend({ t: 'call:decline', data: { callId: c.id } });
});

/* ----------------------------- composer ------------------------------ */

let typingSentAt = 0;

function sendTyping() {
  if (!S.activeChatId) return;
  const t = Date.now();
  if (t - typingSentAt < 1800) return;
  typingSentAt = t;
  wsSend({ t: 'typing', data: { chatId: S.activeChatId, typing: true } });
}

async function sendCurrentMessage() {
  const ta = $('#composer-input');
  if (!ta || !S.activeChatId) return;
  const chat0 = getChat(S.activeChatId);
  if (chat0?.type === 'dm' && chat0.blocked) {
    return toast('You blocked this user — unblock them to send messages', 'error', 4200);
  }
  const content = ta.value.trim();
  if (!content) return;

  // Editing existing message
  if (S.editing) {
    const editing = S.editing;
    cancelEdit();
    try {
      const chat0 = getChat(editing.chatId ?? S.activeChatId);
      const orig = (chat0 && findLoadedMsg(chat0.id, editing.id)) || editing;
      let body = { content };
      if (orig?.enc) {
        if (!E2EE.isReady()) { toast('Locked: set up encryption on this device to edit this message', 'error', 4200); return; }
        body = await E2EE.encryptEdit(chat0, orig, content);
      }
      await api(`/api/messages/${editing.id}`, { method: 'PATCH', body });
    } catch (e) { toast(e.message, 'error'); }
    return;
  }

  const replyTo = S.replyTo && !String(S.replyTo.id).startsWith('c') ? S.replyTo.id : null;
  const replyMsg = S.replyTo;
  cancelReply();
  closeSuggest();

  ta.value = '';
  ta.style.height = 'auto';
  ta.focus();
  const chatId = S.activeChatId;
  saveDraft(chatId, ''); // message sent, draft consumed
  const clientId = 'c' + Date.now() + Math.random().toString(36).slice(2, 7);

  // Optimistic bubble
  const st = (S.msg[chatId] ||= { items: [], hasMore: false });
  const tempMsg = {
    id: clientId, chatId, content, createdAt: Date.now(), editedAt: null,
    pending: true,
    author: { ...S.user },
    replyTo: replyTo && replyMsg ? {
      id: replyTo, authorName: replyMsg.author?.displayName || 'Unknown',
      snippet: replyMsg.content || '', hasFile: Boolean(replyMsg.file),
    } : null,
  };
  st.items.push(tempMsg);
  appendMessageNode(tempMsg);
  const chat = getChat(chatId);
  if (chat) {
    chat.lastMessage = tempMsg;
    sortChats();
    renderChatList($('#chat-filter')?.value || '');
  }

  // E2EE: DMs auto-key on first send; an already-encrypted chat never downgrades to plaintext
  const chatNow = getChat(chatId);
  let wire = { chatId, content, clientId, replyTo };
  if (chatNow?.type === 'dm') {
    if (chatNow.e2ee && !E2EE.isReady()) {
      st.items = st.items.filter((m) => String(m.id) !== String(clientId));
      renderMessages(chatId);
      toast('This chat is encrypted — finish the encryption setup on this device first', 'error', 4500);
      showE2EESetup();
      return;
    }
    if (E2EE.isReady()) {
      try {
        const enc = await E2EE.encryptOutgoing(chatNow, content);
        if (enc) wire = { chatId, clientId, replyTo, ...enc };
        else if (chatNow.e2ee) throw new Error('Encryption keys are unavailable for this chat');
      } catch (e) {
        st.items = st.items.filter((m) => String(m.id) !== String(clientId));
        renderMessages(chatId);
        toast(e.message, 'error', 4500);
        return;
      }
    }
  }
  const sent = wsSend({ t: 'msg:send', data: wire });
  if (!sent) {
    try {
      const j = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, { method: 'POST', body: wire });
      if (j.message) onNewMessage(j.message, clientId); // replace the optimistic bubble
    } catch (e) {
      toast(e.message, 'error');
      // Mark the bubble as failed — clicking it pulls the text back into the composer
      const row = $(`.msg-row[data-msg-id="${CSS.escape(clientId)}"]`);
      row?.classList.add('failed');
    }
  }
}

function startEdit(msg) {
  cancelReply();
  S.editing = msg;
  const banner = $('#edit-banner');
  const ta = $('#composer-input');
  banner.innerHTML = `
    <div class="mute-banner" style="background:color-mix(in srgb, var(--info) 10%, transparent);border-color:color-mix(in srgb, var(--info) 28%, transparent);color:var(--info)">
      ${icons.pencil}<span class="grow">Editing message</span>
      <button class="btn btn-ghost btn-sm" id="cancel-edit">Cancel</button>
    </div>`;
  ta.value = plainOf(msg) ?? '';
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  $('#cancel-edit').onclick = cancelEdit;
}

function cancelEdit() {
  const was = S.editing;
  S.editing = null;
  const ta = $('#composer-input');
  if (ta && was) { ta.value = ''; ta.style.height = 'auto'; }
  const b = $('#edit-banner');
  if (b) b.innerHTML = '';
}

function startReply(msg) {
  cancelEdit();
  S.replyTo = msg;
  const banner = $('#reply-banner');
  if (banner) {
    const snippet = msg.content || (msg.file ? `📎 ${msg.file.name || 'attachment'}` : '');
    banner.innerHTML = `
      <div class="mute-banner" style="background:color-mix(in srgb, var(--accent) 10%, transparent);border-color:color-mix(in srgb, var(--accent) 28%, transparent);color:var(--accent-2)">
        ${icons.reply}<span class="grow reply-banner-text">Reply to <b>${esc(msg.author.displayName)}</b>${snippet ? `: ${esc(snippet.slice(0, 90))}` : ''}</span>
        <button class="btn btn-ghost btn-sm" id="cancel-reply">Cancel</button>
      </div>`;
    $('#cancel-reply').onclick = cancelReply;
  }
  $('#composer-input')?.focus();
}

function cancelReply() {
  S.replyTo = null;
  const b = $('#reply-banner');
  if (b) b.innerHTML = '';
}

/* ----------------------------- file upload ----------------------------- */

function openUploadModal(file) {
  if (!S.activeChatId) return toast('Open a chat first', 'error');
  const maxMb = S.info?.limits?.maxFileSizeMb ?? 25;
  if (file.size > maxMb * 1024 * 1024) {
    return toast(`File is too large — max ${maxMb} MB on this server`, 'error', 4500);
  }
  const isImg = (file.type || '').startsWith('image/');
  const objUrl = isImg ? URL.createObjectURL(file) : null;
  const shownName = file.name || `pasted-image-${Date.now()}.png`;

  openModal(`
    <div class="modal-head"><div class="modal-title">Send file</div></div>
    <div class="upload-preview">
      ${isImg
        ? `<img src="${objUrl}" alt="" />`
        : `<div class="up-icon">${icons.file}</div>`}
    </div>
    <div class="row mb-3">
      <div class="grow" style="min-width:0">
        <div style="font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(shownName)}</div>
        <div class="small faint">${esc(file.type || 'unknown type')} · ${fmtSize(file.size)}</div>
      </div>
    </div>
    <div class="field"><label>Caption (optional)</label>
      <input class="input" id="up-caption" maxlength="${S.info?.limits?.maxMessageLength || 4000}" placeholder="Add a caption…" /></div>
    <div class="progress" id="up-progress" style="display:none"><div class="bar" id="up-bar"></div><span class="pct" id="up-pct">0%</span></div>
    <div class="row mt-3" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="cancel">Cancel</button>
      <button class="btn btn-primary" data-x="send">${icons.send}<span>Send</span></button>
    </div>`, {
    onMount(root, close) {
      $('[data-x="cancel"]', root).onclick = close;
      const captionEl = $('#up-caption', root);
      captionEl.focus();
      const doSend = async () => {
        const sendBtn = $('[data-x="send"]', root);
        sendBtn.disabled = true;
        $('[data-x="cancel"]', root).disabled = true;
        $('#up-progress', root).style.display = 'flex';

        const fd = await buildUploadFormData(getChat(S.activeChatId), file, { caption: captionEl.value.trim(), name: shownName });
        if (!fd) {
          sendBtn.disabled = false;
          $('[data-x="cancel"]', root).disabled = false;
          $('#up-progress', root).style.display = 'none';
          return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${S.base}/api/chats/${encodeURIComponent(S.activeChatId)}/files`);
        xhr.setRequestHeader('Authorization', `Bearer ${S.token}`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          $('#up-bar', root).style.width = pct + '%';
          $('#up-pct', root).textContent = pct + '%';
        };
        xhr.onload = () => {
          let j = {};
          try { j = JSON.parse(xhr.responseText); } catch { /* ignore */ }
          if (xhr.status >= 200 && xhr.status < 300) {
            close();
            if (j.message) onNewMessage(j.message); // instant local insert (WS echo also dedupes)
          } else {
            toast(j.error || `Upload failed (${xhr.status})`, 'error', 4500);
            sendBtn.disabled = false;
            $('[data-x="cancel"]', root).disabled = false;
            $('#up-progress', root).style.display = 'none';
          }
        };
        xhr.onerror = () => {
          toast('Upload failed — network error', 'error');
          sendBtn.disabled = false;
          $('[data-x="cancel"]', root).disabled = false;
          $('#up-progress', root).style.display = 'none';
        };
        xhr.send(fd);
      };
      $('[data-x="send"]', root).onclick = doSend;
      captionEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
    },
  });
}

/**
 * Build the multipart body for an upload, sealing bytes + caption first when the
 * chat is end-to-end encrypted. Returns null when sending must abort.
 */
async function buildUploadFormData(chat, blob, { caption, kind, duration, name }) {
  const base = { caption: caption ?? '', kind: kind ?? 'file', duration: duration ?? 0 };
  if (chat?.type === 'dm') {
    if (chat.e2ee && !E2EE.isReady()) {
      toast('This chat is encrypted — set up encryption on this device to send files', 'error', 4500);
      showE2EESetup();
      return null;
    }
    if (E2EE.isReady()) {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const enc = await E2EE.encryptFile(chat, bytes, base.caption);
        if (enc) {
          const fd = new FormData();
          fd.append('caption', '');
          fd.append('enc', '1');
          fd.append('kid', String(enc.kid));
          fd.append('fiv', enc.fiv);
          fd.append('civ', enc.civ);
          fd.append('cct', enc.cct);
          fd.append('csig', enc.csig);
          fd.append('kind', base.kind);
          fd.append('duration', String(base.duration));
          fd.append('mime', blob.type || 'application/octet-stream');
          fd.append('file', new Blob([enc.ctBytes]), name);
          return fd;
        }
      } catch (e) { toast(e.message, 'error', 4500); return null; }
    }
  }
  const fd = new FormData();
  fd.append('caption', base.caption);
  fd.append('kind', base.kind);
  fd.append('duration', String(base.duration));
  fd.append('file', blob, name);
  return fd;
}

/* ------------------------------ reactions ------------------------------ */

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

/** Re-render just the reaction chips of one message row. */
function updateReactionRow(msg) {
  const row = $(`.msg-row[data-msg-id="${CSS.escape(String(msg.id))}"]`);
  if (!row) return;
  const box = $('.reactions', row);
  if (!box) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = reactionsHtml(msg);
  box.replaceWith(fresh.firstElementChild);
}

/* -------------------------------- polls (v1.4) -------------------------------- */

function pollHtml(msg) {
  const p = msg.poll;
  const total = p.totalVoters || 0;
  return `<div class="poll" data-poll-msg="${msg.id}">
    <div class="poll-head">${icons.chart}<span class="poll-q">${esc(p.question)}</span></div>
    <div class="poll-opts">
      ${p.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return `<button class="poll-opt ${p.myVote === o.id ? 'mine' : ''}" data-vote="${o.id}">
          <span class="poll-fill ${p.myVote === o.id ? 'mine' : ''}" style="width:${pct}%"></span>
          <span class="poll-line">
            <span class="poll-text">${esc(o.text)}</span>
            <span class="poll-meta">${p.myVote === o.id ? `<span class="poll-check">${icons.check}</span>` : ''}${o.votes ? `<span class="poll-pct">${pct}%</span>` : ''}</span>
          </span>
        </button>`;
      }).join('')}
    </div>
    <div class="poll-foot">${total} vote${total === 1 ? '' : 's'}${p.myVote ? ` · <button class="linklike poll-retract">retract vote</button>` : ''}</div>
  </div>`;
}

function updatePollRow(msg) {
  const row = $(`.msg-row[data-msg-id="${CSS.escape(String(msg.id))}"]`);
  if (!row) return;
  const box = $('.poll', row);
  if (!box) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = pollHtml(msg);
  box.replaceWith(fresh.firstElementChild);
}

async function castVote(msg, optionId) {
  try {
    const { poll } = await api(`/api/messages/${msg.id}/vote`, { method: 'POST', body: { optionId } });
    msg.poll = poll; // server also broadcasts to refresh everyone else
    updatePollRow(msg);
  } catch (e) { toast(e.message, 'error'); }
}

let attachMenuEl = null;
function closeAttachMenu() { attachMenuEl?.remove(); attachMenuEl = null; }

/** Small popover above the paperclip: [File or media · Poll]. */
function openAttachMenu(anchor, onFile, onPoll) {
  closeAttachMenu();
  const el = document.createElement('div');
  el.className = 'attach-menu';
  el.innerHTML = `
    <button class="ctx-item" data-am="file">${icons.paperclip}<span>File or media</span></button>
    <button class="ctx-item" data-am="poll">${icons.chart}<span>Create poll</span></button>`;
  document.body.appendChild(el);
  attachMenuEl = el;
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, r.left - 8)}px`;
  el.style.bottom = `${innerHeight - r.top + 8}px`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-am]');
    if (!b) return;
    closeAttachMenu();
    if (b.dataset.am === 'file') onFile();
    else onPoll();
  });
}
document.addEventListener('click', (e) => {
  if (attachMenuEl && !attachMenuEl.contains(e.target) && e.target.id !== 'attach-btn') closeAttachMenu();
});

function openPollModal() {
  const chatId = S.activeChatId;
  if (!chatId) return;
  const close = openModal(`
    <div class="modal-head"><div class="modal-title">${icons.chart} New poll</div></div>
    <div class="field"><label>Question</label><input class="input" id="poll-q" maxlength="300" placeholder="Ask something…" /></div>
    <div class="field"><label>Options <span class="muted">(2–10)</span></label>
      <div id="poll-opts" class="poll-edit-opts"></div>
      <button class="btn btn-ghost btn-sm" id="poll-add">${icons.plus}<span>Add option</span></button>
    </div>
    <div class="row mt-4" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="cancel">Cancel</button>
      <button class="btn btn-primary" id="poll-create">Create poll</button>
    </div>`, {
    onMount(root, c) {
      const optsEl = $('#poll-opts', root);
      const addRow = (val = '') => {
        if ($$('.poll-opt-row', optsEl).length >= 10) return toast('Maximum 10 options', 'error');
        const row = document.createElement('div');
        row.className = 'poll-opt-row';
        row.innerHTML = `<input class="input" maxlength="100" placeholder="Option ${$$('.poll-opt-row', optsEl).length + 1}" value="${esc(val)}" />
          <button class="btn btn-ghost btn-icon btn-sm" title="Remove">${icons.x}</button>`;
        $('button', row).onclick = () => {
          if ($$('.poll-opt-row', optsEl).length <= 2) return toast('A poll needs at least 2 options', 'error');
          row.remove();
        };
        optsEl.appendChild(row);
      };
      addRow(); addRow();
      $('#poll-add', root).onclick = () => addRow();
      $('[data-x="cancel"]', root).onclick = c;
      $('#poll-create', root).onclick = async () => {
        const question = $('#poll-q', root).value.trim();
        const options = $$('.poll-opt-row input', optsEl).map((i) => i.value.trim()).filter(Boolean);
        if (!question) return toast('Add a question first', 'error');
        if (options.length < 2) return toast('A poll needs at least 2 options', 'error');
        try {
          await api(`/api/chats/${encodeURIComponent(chatId)}/polls`, { method: 'POST', body: { question, options } });
          c(); // bubble arrives over the socket
        } catch (e) { toast(e.message, 'error'); }
      };
      $('#poll-q', root).focus();
    },
  });
  void close;
}

/** Toggle a reaction with instant local feedback, then reconcile with the server. */
async function toggleReaction(msg, emoji) {
  const prev = msg.reactions || [];
  pushRecentEmoji(emoji);
  const next = [];
  let found = false;
  for (const r of prev) {
    if (r.emoji === emoji) {
      found = true;
      if (r.me) {
        if (r.count > 1) next.push({ ...r, count: r.count - 1, me: false });
      } else {
        next.push({ ...r, count: r.count + 1, me: true });
      }
    } else next.push({ ...r });
  }
  if (!found) next.push({ emoji, count: 1, me: true });
  msg.reactions = next;
  updateReactionRow(msg);
  try {
    const { reactions } = await api(`/api/messages/${msg.id}/reactions`, { method: 'POST', body: { emoji } });
    msg.reactions = reactions;
    updateReactionRow(msg);
  } catch (e) {
    msg.reactions = prev;
    updateReactionRow(msg);
    toast(e.message, 'error');
  }
}

/** Telegram-style reaction strip above the message (6 quick picks + full picker). */
function quickReactMenu(anchorBtn, msg) {
  ctxClose?.();
  const pop = document.createElement('div');
  pop.className = 'quick-react';
  pop.innerHTML = QUICK_REACTIONS.map((ch) => `<button data-ch="${ch}" title="${ch}">${emojiImg(ch, 'emoji qr-img')}</button>`).join('') +
    `<button data-more="1" title="More reactions">${icons.plus}</button>`;
  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left - 46, innerWidth - pop.offsetWidth - 10))}px`;
  pop.style.top = `${Math.max(10, r.top - pop.offsetHeight - 8)}px`;
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more) {
      close();
      emojiPicker(anchorBtn, (emo) => toggleReaction(msg, emo));
      return;
    }
    close();
    toggleReaction(msg, b.dataset.ch);
  });
  const close = () => { pop.remove(); document.removeEventListener('mousedown', onDoc); };
  const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchorBtn) close(); };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
}

/* ------------------------------ forwarding ------------------------------ */

function openForwardModal(msg) {
  openModal(`
    <div class="modal-head"><div class="modal-title">Forward message</div></div>
    <div class="field"><label>Choose a chat</label><input class="input" id="fw-search" placeholder="Search your chats…" autocomplete="off" /></div>
    <div class="new-chat-list" id="fw-list"></div>
  `, {
    onMount(root, close) {
      const input = $('#fw-search', root);
      const list = $('#fw-list', root);
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const chats = S.chats.filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
        if (!chats.length) { list.innerHTML = '<div class="empty-note">No chats found</div>'; return; }
        list.innerHTML = chats.map((c) => `
          <div class="pick-row" data-cid="${esc(c.id)}">
            ${chatAvatar(c, 'sm', false)}
            <div class="grow" style="min-width:0">
              <div style="font-weight:650">${esc(chatTitle(c))}</div>
              <div class="small faint">${c.type === 'group' ? `${c.members.length} members` : 'Direct message'}</div>
            </div>
          </div>`).join('');
        $$('.pick-row', list).forEach((rowEl) => rowEl.addEventListener('click', async () => {
          const cid = rowEl.dataset.cid;
          rowEl.style.opacity = '0.5';
          try {
            await api(`/api/messages/${msg.id}/forward`, { method: 'POST', body: { chatId: cid } });
            close();
            const target = getChat(cid);
            toast(`Forwarded to “${target ? chatTitle(target) : 'chat'}”`, 'success');
          } catch (e) {
            rowEl.style.opacity = '';
            toast(e.message, 'error');
          }
        }));
      };
      input.addEventListener('input', draw);
      draw();
      input.focus();
    },
  });
}

/* ---------------------------- voice messages ---------------------------- */

const VOICE_MIME = (() => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return '';
})();

async function startRecording() {
  if (S.rec || !S.activeChatId) return;
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return toast('Voice messages are not supported in this browser', 'error');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return toast('Microphone access denied — allow it in the browser to send voice messages', 'error', 4500);
  }
  let recorder;
  try {
    recorder = new MediaRecorder(stream, VOICE_MIME ? { mimeType: VOICE_MIME } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    return toast('Could not start the audio recorder', 'error');
  }
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  S.rec = { recorder, stream, chunks, startedAt: Date.now(), timer: null, raf: 0 };
  showRecordingUi();
  recorder.start(250);
}

function showRecordingUi() {
  const slot = $('#rec-slot');
  const inner = $('#composer-inner');
  if (!slot || !inner || !S.rec) return;
  inner.style.display = 'none';
  slot.innerHTML = `
    <div class="rec-bar">
      <span class="rec-dot"></span>
      <span class="rec-time" id="rec-time">0:00</span>
      <div class="rec-wave" id="rec-wave">${'<i></i>'.repeat(26)}</div>
      <span class="rec-hint">Recording…</span>
      <button class="btn btn-ghost btn-icon rec-btn" id="rec-cancel" title="Discard">${icons.trash}</button>
      <button class="btn btn-primary btn-icon rec-btn" id="rec-send" title="Send voice message">${icons.send}</button>
    </div>`;
  $('#rec-cancel').onclick = () => stopRecording(false);
  $('#rec-send').onclick = () => stopRecording(true);

  // Live level meter driven by the microphone
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(S.rec.stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const items = $$('#rec-wave i');
    const step = Math.max(1, Math.floor(data.length / items.length));
    const tick = () => {
      if (!S.rec) return;
      analyser.getByteFrequencyData(data);
      items.forEach((el, i) => {
        el.style.height = `${Math.max(8, Math.round((data[i * step] / 255) * 30))}px`;
      });
      S.rec.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* level meter is decorative */ }

  const t0 = S.rec.startedAt;
  S.rec.timer = setInterval(() => {
    const el = $('#rec-time');
    if (el) el.textContent = fmtDur(Date.now() - t0);
  }, 250);
}

function stopRecording(send) {
  const rec = S.rec;
  if (!rec) return;
  S.rec = null;
  clearInterval(rec.timer);
  cancelAnimationFrame(rec.raf);
  const duration = Date.now() - rec.startedAt;
  const slot = $('#rec-slot');
  const inner = $('#composer-inner');
  if (slot) slot.innerHTML = '';
  if (inner) inner.style.display = '';
  if (!send || duration < 400) {
    try { rec.recorder.onstop = null; rec.recorder.stop(); } catch { /* ignore */ }
    rec.stream.getTracks().forEach((t) => t.stop());
    if (send && duration < 400) toast('Voice message too short', 'error');
    $('#composer-input')?.focus();
    return;
  }
  rec.recorder.onstop = () => {
    rec.stream.getTracks().forEach((t) => t.stop());
    const mime = rec.recorder.mimeType || VOICE_MIME || 'audio/webm';
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    sendVoice(new Blob(rec.chunks, { type: mime }), duration, ext);
  };
  try { rec.recorder.stop(); } catch { /* ignore */ }
  $('#composer-input')?.focus();
}

async function sendVoice(blob, duration, ext) {
  const chatId = S.activeChatId;
  if (!chatId) return;
  const maxMb = S.info?.limits?.maxFileSizeMb ?? 25;
  if (blob.size > maxMb * 1024 * 1024) return toast(`Voice message exceeds the ${maxMb} MB limit`, 'error');
  const fd = await buildUploadFormData(getChat(chatId), blob, { caption: '', kind: 'voice', duration, name: `voice-message.${ext}` });
  if (!fd) return;
  try {
    const res = await fetch(`${S.base}/api/chats/${encodeURIComponent(chatId)}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${S.token}` },
      body: fd,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Upload failed (${res.status})`);
    if (j.message) onNewMessage(j.message);
  } catch (e) {
    toast(e.message, 'error', 4500);
  }
}

/* ------------------------- message item actions ------------------------- */

document.addEventListener('click', async (e) => {
  // Reaction chips toggle inline
  const chip = e.target.closest('.rx-chip');
  if (chip) {
    const row = chip.closest('.msg-row');
    const st = S.msg[S.activeChatId];
    const msg = st?.items.find((m) => String(m.id) === String(row?.dataset.msgId));
    if (msg && !String(msg.id).startsWith('c')) toggleReaction(msg, chip.dataset.emoji);
    return;
  }
  // Poll votes & retractions (v1.4)
  const voteBtn = e.target.closest('.poll-opt[data-vote], .poll-retract');
  if (voteBtn) {
    const row = voteBtn.closest('.msg-row');
    const st = S.msg[S.activeChatId];
    const msg = st?.items.find((m) => String(m.id) === String(row?.dataset.msgId));
    if (msg?.poll && !String(msg.id).startsWith('c')) {
      castVote(msg, voteBtn.classList.contains('poll-retract') ? null : Number(voteBtn.dataset.vote));
    }
    return;
  }
  // Failed optimistic bubble → pull the text back into the composer
  const failedRow = e.target.closest('.msg-row.failed');
  if (failedRow) {
    const st = S.msg[S.activeChatId];
    const idx = st?.items.findIndex((m) => String(m.id) === String(failedRow.dataset.msgId));
    if (idx >= 0) {
      const content = st.items[idx].content;
      st.items.splice(idx, 1);
      renderMessages(S.activeChatId, { keepScroll: true });
      const ta = $('#composer-input');
      if (ta) { ta.value = content; ta.focus(); ta.dispatchEvent(new Event('input')); }
    }
    return;
  }
  const actBtn = e.target.closest('.msg-actions button');
  if (!actBtn) return;
  const row = actBtn.closest('.msg-row');
  const msgId = row?.dataset.msgId;
  const chat = getChat(S.activeChatId);
  const st = chat && S.msg[chat.id];
  const msg = st?.items.find((m) => String(m.id) === String(msgId));
  if (!msg) return;
  const act = actBtn.dataset.act;
  const pending = String(msg.id).startsWith('c'); // optimistic bubble not on server yet
  if (act === 'copy') {
    const plainTxt = plainOf(msg);
    if (plainTxt === null) return toast('This message is still locked on this device', 'info', 2500);
    try { await navigator.clipboard.writeText(plainTxt); toast('Copied to clipboard', 'success', 1500); } catch { toast('Copy failed', 'error'); }
  } else if (act === 'edit') {
    startEdit(msg);
  } else if (act === 'react') {
    if (!pending) quickReactMenu(actBtn, msg);
  } else if (act === 'reply') {
    startReply(msg);
  } else if (act === 'forward') {
    if (!pending) openForwardModal(msg);
  } else if (act === 'pin') {
    if (pending) return;
    const pinned = chat?.pinnedMessage?.id === msg.id;
    try {
      await api(`/api/messages/${msg.id}/pin`, { method: 'POST', body: { pin: !pinned } });
      toast(pinned ? 'Message unpinned' : 'Message pinned 📌', 'success', 1800);
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'del') {
    if (await confirmModal({ title: 'Delete message?', body: 'This cannot be undone.', confirmText: 'Delete', danger: true })) {
      try { await api(`/api/messages/${msg.id}`, { method: 'DELETE' }); } catch (err) { toast(err.message, 'error'); }
    }
  } else if (act === 'report') {
    const vals = await formModal({
      title: 'Report message',
      note: 'Moderators will review this report.',
      fields: [{ key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'What is wrong with this message?' }],
      submitText: 'Send report',
    });
    if (vals) {
      try {
        await api(`/api/messages/${msg.id}/report`, { method: 'POST', body: { reason: vals.reason } });
        toast('Report sent to moderators', 'success');
      } catch (err) { toast(err.message, 'error'); }
    }
  }
});

/* ------------------------------ websocket ------------------------------ */

function connectWS() {
  if (S.ws) { try { S.ws.close(); } catch { /* ignore */ } }
  S.wsManualClose = false;
  const url = S.base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(S.token);
  setConn('wait', 'connecting…');
  const ws = new WebSocket(url);
  S.ws = ws;

  ws.onopen = () => {
    S.wsOpen = true;
    S.wsRetry = 0;
    setConn('on', 'connected');
  };

  ws.onmessage = (ev) => {
    let frame;
    try { frame = JSON.parse(ev.data); } catch { return; }
    handleWsEvent(frame);
  };

  ws.onclose = (ev) => {
    S.wsOpen = false;
    if (S.wsManualClose) return;
    setConn('', 'offline — reconnecting…');
    if (ev.code === 4001) return; // force_logout handled separately
    // signaling channel died — the server ends the call for the peer; clean up locally
    if (S.call) { clearCall('Connection lost — call ended'); }
    const delay = Math.min(15000, 900 * Math.pow(2, S.wsRetry++));
    setTimeout(() => { if (!S.wsManualClose && S.token) connectWS(); }, delay);
  };

  ws.onerror = () => { /* onclose follows */ };
}

function wsSend(obj) {
  if (S.ws && S.wsOpen && S.ws.readyState === WebSocket.OPEN) {
    try { S.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }
  return false;
}

/** Shared "new message" pipeline — used by WS events and by the file-upload response. */
async function onNewMessage(message, clientId = null) {
  await E2EE.decryptInto(message.chatId, [message]);
  // Replace optimistic echo
  const st = (S.msg[message.chatId] ||= { items: [], hasMore: true });
  const tempIdx = clientId ? st.items.findIndex((m) => String(m.id) === String(clientId)) : -1;
  if (tempIdx >= 0) {
    st.items[tempIdx] = message;
    const row = $(`.msg-row[data-msg-id="${CSS.escape(String(clientId))}"]`);
    if (row) {
      // Rebuild the bubble in place: pending clock → real time, real id, full extras
      const prevMsg = st.items[tempIdx - 1] && !String(st.items[tempIdx - 1].id).startsWith('c') ? st.items[tempIdx - 1] : null;
      row.replaceWith(messageNode(message, prevMsg));
      if (message.file?.enc) hydrateEncFiles(message.chatId);
    }
  } else if (!st.items.some((m) => m.id === message.id)) {
    st.items.push(message);
    appendMessageNode(message);
  }
  const chat = getChat(message.chatId);
  if (chat) {
    chat.lastMessage = message;
    const own = message.author.id === S.user.id;
    const isActive = S.activeChatId === chat.id && document.hasFocus();
    const mentionHit = !own && chat.type === 'group' && !message.system
      && new RegExp(`@${S.user.username}(?![A-Za-z0-9_])`, 'i').test(message.content || '');
    if (!own) {
      if (isActive) markReadSoon(chat.id);
      else chat.unread = (chat.unread || 0) + 1;
      if (mentionHit && !isActive) chat.unreadMentions = (chat.unreadMentions || 0) + 1;
    } else if (isActive) {
      // Our own message confirmed while we're viewing it (echo of an optimistic
      // bubble, or sent from another of our devices) — the cursor follows our tail
      // so a later "New messages" divider has a real boundary to anchor to.
      markReadSoon(chat.id);
    }
    sortChats();
    renderChatList($('#chat-filter')?.value || '');
    const muted = chat.prefs?.muted && !mentionHit; // mentions break through mute, Telegram-style
    if (!own && !isActive && !muted) { blip(); }
    if (!own && !muted) desktopNotify(message, chat);
  } else {
    api(`/api/chats/${encodeURIComponent(message.chatId)}`).then(({ chat: c }) => {
      upsertChat(c);
      renderChatList($('#chat-filter')?.value || '');
    }).catch(() => {});
  }
  const tm = S.typing.get(message.chatId);
  if (tm?.has(message.author.id)) {
    clearTimeout(tm.get(message.author.id).timer);
    tm.delete(message.author.id);
    renderTypingBar();
  }
  updateReadStatus();
}

function handleWsEvent({ t, data = {} }) {
  switch (t) {
    case 'ready': {
      S.user = { ...S.user, ...data.user };
      S.online = new Set(data.online || []);
      store.saveSession(S.base, { token: S.token, user: S.user });
      renderMuteBanner();
      refreshPresenceDots();
      break;
    }

    case 'msg:new': {
      void onNewMessage(data.message, data.clientId);
      break;
    }

    case 'chat:e2ee': {
      if (data.chat) {
        upsertChat(data.chat);
        renderChatList($('#chat-filter')?.value || '');
        if (S.activeChatId === data.chat.id) ensureLockChip(data.chat);
      }
      break;
    }

    case 'user:e2ee': {
      if (data.user) E2EE.invalidateUser(data.user);
      break;
    }

    case 'e2ee:transfer_request': {
      if (data.request) void maybeTransferPrompt(data.request);
      break;
    }

    /* ------------------------- calls (v1.6) ------------------------- */

    case 'call:ringing': { // I'm the caller — the server registered the call
      const c = S.call;
      if (c && c.dir === 'out' && !c.id && data.call) {
        c.id = data.call.callId;
        c.video = Boolean(data.call.video);
        c.state = 'outgoing';
        ringStart('out');
        renderCallUI();
      }
      break;
    }

    case 'call:ring': {
      if (data.call) void onIncomingCall(data.call);
      break;
    }

    case 'call:accepted': {
      const c = S.call;
      if (!c || c.id !== data.callId) break;
      if (c.dir === 'in') {
        // accepted on another of my devices — stop ringing here
        if (c.state === 'incoming') clearCall('Answered on another device');
      } else {
        void onCallAccepted();
      }
      break;
    }

    case 'call:busy': {
      toast('They’re in another call right now', 'error', 3500);
      onCallTerminal(data, 'Busy');
      break;
    }

    case 'call:declined': {
      onCallTerminal(data, 'Declined');
      break;
    }

    case 'call:cancelled': {
      const labels = { missed: 'No answer', cancelled: 'Call cancelled', offline: 'Unreachable', 'answered-elsewhere': '' };
      onCallTerminal(data, labels[data.reason] ?? 'Call cancelled');
      break;
    }

    case 'call:ended': {
      const labels = { lost: 'Connection lost', failed: 'Call failed' };
      onCallTerminal(data, labels[data.reason] ?? 'Call ended');
      break;
    }

    case 'call:signal': {
      void onCallSignal(data);
      break;
    }

    case 'call:error': {
      toast(data.message || 'Call failed', 'error');
      if (S.call && ['requesting'].includes(S.call.state)) clearCall('');
      break;
    }

    case 'msg:edited': {
      const { message } = data;
      void E2EE.decryptInto(message.chatId, [message]).then(() => {
        const st = S.msg[message.chatId];
        const i = st?.items.findIndex((m) => m.id === message.id) ?? -1;
        if (i >= 0) st.items[i] = message;
        const row = $(`.msg-row[data-msg-id="${message.id}"]`);
        const mt = row && $('.msg-text', row);
        const plain2 = plainOf(message);
        if (mt) {
          mt.innerHTML = (plain2 !== null
            ? renderContent(plain2, getChat(message.chatId))
            : esc(lockedLabel(message))) + (message.editedAt ? '<span class="msg-edited">(edited)</span>' : '');
        }
        const c = getChat(message.chatId);
        if (c?.lastMessage?.id === message.id) { c.lastMessage = message; renderChatList($('#chat-filter')?.value || ''); }
      });
      break;
    }

    case 'msg:deleted': {
      const { chatId, messageId, byMod } = data;
      const st = S.msg[chatId];
      if (st) {
        const i = st.items.findIndex((m) => String(m.id) === String(messageId));
        if (i >= 0) st.items.splice(i, 1);
      }
      const row = $(`.msg-row[data-msg-id="${messageId}"]`);
      row?.remove();
      if (String(S.user.id) !== '' && byMod) toast('A message was removed by staff', 'info', 2200);
      break;
    }

    case 'msg:reaction': {
      const { chatId, messageId, reactions } = data;
      const st = S.msg[chatId];
      const msg = st?.items.find((m) => String(m.id) === String(messageId));
      if (msg) {
        msg.reactions = reactions;
        if (S.activeChatId === chatId) updateReactionRow(msg);
      }
      break;
    }

    case 'poll:update': {
      const { chatId, messageId, poll } = data;
      const st = S.msg[chatId];
      const msg = st?.items.find((m) => String(m.id) === String(messageId));
      if (msg) {
        msg.poll = poll;
        updatePollRow(msg);
      }
      // keep the sidebar preview's poll question fresh
      const c = getChat(chatId);
      if (c?.lastMessage && String(c.lastMessage.id) === String(messageId)) {
        c.lastMessage.poll = poll;
        renderChatList($('#chat-filter')?.value || '');
      }
      break;
    }

    case 'chat:prefs': {
      const c = getChat(data.chatId);
      if (c) {
        c.prefs = data.prefs;
        sortChats();
        renderChatList($('#chat-filter')?.value || '');
      }
      break;
    }

    case 'chat:new':
    case 'chat:updated': {
      upsertChat(data.chat);
      renderChatList($('#chat-filter')?.value || '');
      if (S.activeChatId === data.chat.id && t === 'chat:updated') {
        // Refresh header/pins/messages in place — never clobber the composer's draft
        const c = getChat(data.chat.id);
        const tEl = $('.ch-title');
        if (tEl && c) tEl.textContent = chatTitle(c);
        updateChatSub();
        renderPinnedBar(c);
        renderMuteBanner();
        renderBlockBanner();
        renderMessages(data.chat.id, { keepScroll: true });
      }
      if (t === 'chat:new') toast(`You were added to “${chatTitle(data.chat)}”`, 'info', 2600);
      break;
    }

    case 'chat:removed': {
      const i = S.chats.findIndex((c) => c.id === data.chatId);
      const was = i >= 0 ? S.chats[i] : null;
      if (i >= 0) S.chats.splice(i, 1);
      delete S.msg[data.chatId];
      renderChatList($('#chat-filter')?.value || '');
      if (S.activeChatId === data.chatId) closeChat();
      if (was) toast(`Removed from “${chatTitle(was)}”`, 'info');
      break;
    }

    case 'presence': {
      if (data.online) S.online.add(data.userId);
      else S.online.delete(data.userId);
      refreshPresenceDots();
      updateChatSub();
      break;
    }

    case 'typing': {
      const { chatId, user, typing } = data;
      if (user.id === S.user.id) break;
      let tm = S.typing.get(chatId);
      if (!tm) { tm = new Map(); S.typing.set(chatId, tm); }
      if (typing) {
        clearTimeout(tm.get(user.id)?.timer);
        tm.set(user.id, {
          user,
          timer: setTimeout(() => { tm.delete(user.id); renderTypingBar(); }, 3500),
        });
      } else tm.delete(user.id);
      renderTypingBar();
      break;
    }

    case 'read': {
      const { chatId, userId, messageId } = data;
      const chat = getChat(chatId);
      const member = chat?.members.find((m) => m.id === userId);
      if (member) member.lastRead = Math.max(member.lastRead || 0, messageId);
      if (userId === S.user.id && chat) {
        chat.unread = 0;
        renderChatList($('#chat-filter')?.value || '');
      }
      updateReadStatus();
      break;
    }

    case 'user:self': {
      S.user = { ...S.user, ...data.user };
      store.saveSession(S.base, { token: S.token, user: S.user });
      syncSelfUi();
      break;
    }

    case 'user:updated': {
      const u = data.user;
      if (u.id === S.user.id) {
        S.user = { ...S.user, ...u };
        store.saveSession(S.base, { token: S.token, user: S.user });
        syncSelfUi();
      }
      for (const c of S.chats) {
        const m = c.members.find((x) => x.id === u.id);
        if (m) Object.assign(m, u);
      }
      renderChatList($('#chat-filter')?.value || '');
      break;
    }

    case 'server:updated': {
      S.info = data.info;
      const t1 = $('.side-top .t1');
      if (t1) t1.textContent = data.info.name;
      toast(`Server settings updated`, 'info', 2200);
      break;
    }

    case 'force_logout': {
      if (S.selfRotate) break; // our own password change — reconnect already underway
      const reason = data.reason || 'You were signed out';
      S.wsManualClose = true;
      store.clearSession(S.base);
      S.token = null; S.user = null;
      showServerScreen(reason);
      break;
    }

    case 'error': {
      if (data.message) toast(data.message, 'error');
      // A failed send (blocked, muted, kicked…) — flip the optimistic bubble to "failed"
      if (data.clientId && data.chatId) {
        const st = S.msg[data.chatId];
        const msg = st?.items.find((m) => String(m.id) === String(data.clientId));
        if (msg) msg.failed = true;
        $(`.msg-row[data-msg-id="${CSS.escape(data.clientId)}"]`)?.classList.add('failed');
      }
      break;
    }
  }
}

function refreshPresenceDots() {
  $$('.presence[data-pid]').forEach((el) => {
    el.classList.toggle('on', S.online.has(el.dataset.pid));
  });
}

function updateChatSub() {
  const chat = getChat(S.activeChatId);
  const el = $('#chat-sub');
  if (!chat || !el) return;
  if (chat.type === 'group') {
    el.textContent = `${chat.members.length} member${chat.members.length === 1 ? '' : 's'} · ${chat.members.filter((m) => S.online.has(m.id)).length} online`;
  } else {
    const peer = chatPeer(chat);
    el.innerHTML = peer
      ? (S.online.has(peer.id) ? '<span class="accent">online</span>' : esc(fmtLastSeen(peer.lastSeen)))
      : 'notes to yourself';
  }
}

function renderTypingBar() {
  const el = $('#typing-area');
  if (!el) return;
  const tm = S.typing.get(S.activeChatId);
  if (!tm || !tm.size) { el.innerHTML = ''; return; }
  const names = [...tm.values()].map((x) => x.user.displayName).slice(0, 3);
  const label = names.length === 1 ? `${names[0]} is typing` : names.join(', ') + ' are typing';
  el.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span> ${esc(label)}`;
  setTimeout(updateReadStatus, 0);
}

function syncSelfUi() {
  const chip = $('#me-chip');
  if (chip) {
    chip.innerHTML = `${avatarHtml(S.user, 'sm')}
      <div class="grow" style="min-width:0">
        <div class="uc-name">${esc(S.user.displayName)}</div>
        <div class="uc-role">${esc(S.user.role)}</div>
      </div>`;
  }
  const isStaff = roleLevel(S.user.role) >= 1;
  const panelBtn = $('#panel-btn');
  if (isStaff && !panelBtn) {
    const b = document.createElement('button');
    b.className = 'btn btn-icon';
    b.id = 'panel-btn';
    b.title = 'Staff panel';
    b.innerHTML = icons.shield;
    b.onclick = () => openPanel();
    $('#settings-btn')?.before(b);
  } else if (!isStaff && panelBtn) {
    panelBtn.remove();
    if (S.panel.open) closePanel();
  }
  renderMuteBanner();
}

/* -------------------------- members drawer -------------------------- */

let drawerState = { chatId: null };

/* ------------------------- invite links (v1.4) ------------------------- */

const inviteUrl = (token) => {
  const u = new URL(S.base || location.origin, location.href);
  u.hash = `invite=${token}`;
  return u.href;
};

async function loadInviteSlot(chat) {
  const slot = $('#invite-slot');
  if (!slot) return;
  const render = (invite) => {
    if (!invite) {
      slot.innerHTML = `<button class="btn btn-sm btn-block" id="inv-create">${icons.link}<span>Create invite link</span></button>`;
      $('#inv-create', slot).onclick = async () => {
        try {
          const { invite } = await api(`/api/chats/${encodeURIComponent(chat.id)}/invite`, { method: 'POST' });
          render(invite);
          toast('Invite link created', 'success');
        } catch (e) { toast(e.message, 'error'); }
      };
      return;
    }
    slot.innerHTML = `
      <div class="invite-row">
        <input class="input" id="inv-url" readonly value="${esc(inviteUrl(invite.token))}" />
        <button class="btn btn-primary btn-icon" id="inv-copy" title="Copy link">${icons.copy}</button>
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn btn-ghost btn-sm grow" id="inv-regen">${icons.refresh}<span>Rotate</span></button>
        <button class="btn btn-ghost btn-sm grow danger-text" id="inv-revoke">${icons.trash}<span>Revoke</span></button>
      </div>`;
    $('#inv-url', slot).onclick = (e) => e.target.select();
    $('#inv-copy', slot).onclick = async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl(invite.token));
        toast('Invite link copied', 'success', 1600);
      } catch {
        $('#inv-url', slot).select();
        toast('Press Ctrl+C to copy', 'info');
      }
    };
    $('#inv-regen', slot).onclick = async () => {
      if (!await confirmModal({ title: 'Rotate invite link?', body: 'The current link stops working immediately.', confirmText: 'Rotate' })) return;
      try {
        const { invite } = await api(`/api/chats/${encodeURIComponent(chat.id)}/invite`, { method: 'POST' });
        render(invite);
        toast('New invite link ready', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    $('#inv-revoke', slot).onclick = async () => {
      if (!await confirmModal({ title: 'Revoke invite link?', body: 'Nobody will be able to join with it anymore.', confirmText: 'Revoke', danger: true })) return;
      try {
        await api(`/api/chats/${encodeURIComponent(chat.id)}/invite`, { method: 'DELETE' });
        render(null);
        toast('Invite link revoked', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
  };
  try {
    const { invite } = await api(`/api/chats/${encodeURIComponent(chat.id)}/invite`);
    render(invite);
  } catch { slot.innerHTML = '<span class="muted small">Invite links unavailable</span>'; }
}

/** Stash an #invite=TOKEN deep link before the gate so it survives login. */
function captureInviteFromHash() {
  const m = location.hash.match(/invite=([A-Za-z0-9_-]{4,64})/);
  if (m) {
    sessionStorage.setItem('efadro:pendingInvite', m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  }
}

/** After entering the app: auto-join the group behind a pending invite link. */
async function processPendingInvite() {
  const token = sessionStorage.getItem('efadro:pendingInvite');
  if (!token) return;
  sessionStorage.removeItem('efadro:pendingInvite');
  try {
    const { chat, alreadyMember } = await api(`/api/invites/${encodeURIComponent(token)}/join`, { method: 'POST' });
    upsertChat(chat);
    sortChats();
    renderChatList($('#chat-filter')?.value || '');
    toast(alreadyMember ? `You're already in “${chatTitle(chat)}”` : `You joined “${chatTitle(chat)}” 🎉`, 'success', 3500);
    openChat(chat.id);
  } catch (e) {
    toast(e.message, 'error', 4500);
  }
}

function openMembersDrawer(chatId) {
  const chat = getChat(chatId);
  if (!chat) return;
  drawerState.chatId = chatId;

  let backdrop = $('.drawer-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', closeDrawer);
  }
  let drawer = $('.drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'drawer';
    document.body.appendChild(drawer);
  }

  const isCreator = chat.createdBy === S.user.id;
  const peer = chatPeer(chat);
  const rows = chat.members.map((m) => `
    <div class="member-row" data-member="${esc(m.id)}">
      ${avatarHtml(m, 'sm', chat.type === 'group')}
      <div class="grow" style="min-width:0">
        <div class="m-name">${esc(m.displayName)} ${roleBadge(m.role)}</div>
        <div class="m-status ${S.online.has(m.id) ? 'online' : ''}">@${esc(m.username)} · ${S.online.has(m.id) ? 'online' : esc(fmtLastSeen(m.lastSeen))}</div>
      </div>
      ${chat.type === 'group' && m.id !== S.user.id && (isCreator || roleLevel(S.user.role) >= 1) && m.id !== chat.createdBy
        ? `<button class="btn btn-ghost btn-icon" data-kick-member="${esc(m.id)}" title="Remove from group">${icons.x}</button>` : ''}
    </div>`).join('');

  drawer.innerHTML = `
    <div class="drawer-head">
      ${chatAvatar(chat, 'sm', false)}
      <div class="grow" style="min-width:0">
        <div style="font-weight:750">${esc(chatTitle(chat))}</div>
        <div class="small faint">${chat.type === 'group' ? `${chat.members.length} members` : peer ? '@' + esc(peer.username) : 'Your private space'}</div>
      </div>
      <button class="btn btn-ghost btn-icon" id="drawer-close">${icons.x}</button>
    </div>
    <div class="drawer-body">
      ${chat.type === 'group' ? `
        <div class="row mb-3">
          <button class="btn btn-sm grow" id="drawer-add">${icons.plus}<span>Add members</span></button>
          <button class="btn btn-sm grow" id="drawer-rename">${icons.pencil}<span>Rename</span></button>
        </div>` : peer ? `
        <div class="row mb-3">
          <button class="btn btn-sm grow" id="drawer-view-user">${icons.user}<span>View profile</span></button>
          <button class="btn btn-sm grow ${chat.blocked ? '' : 'btn-danger'}" id="drawer-block">${icons.ban}<span>${chat.blocked ? 'Unblock' : 'Block'}</span></button>
        </div>` : ''}
      ${chat.type === 'group' && (isCreator || roleLevel(S.user.role) >= 1) ? `
        <div class="list-label" style="padding:4px 4px 8px">Invite link</div>
        <div id="invite-slot" class="invite-slot"><span class="muted small">Loading…</span></div>` : ''}
      <div class="list-label" style="padding:4px 4px 8px">Members</div>
      ${rows}
      ${chat.type === 'group'
        ? `<button class="btn btn-danger btn-block mt-4" id="drawer-leave">${icons.logout}<span>Leave group</span></button>`
        : `<button class="btn btn-danger btn-block mt-4" id="drawer-delete">${icons.trash}<span>Delete chat</span></button>`}
    </div>`;

  $('#drawer-close', drawer).onclick = closeDrawer;
  if ($('#invite-slot', drawer)) loadInviteSlot(chat);
  $('#drawer-add', drawer)?.addEventListener('click', () => openAddMembers(chatId));
  $('#drawer-rename', drawer)?.addEventListener('click', async () => {
    const vals = await formModal({
      title: 'Rename group',
      fields: [{ key: 'name', label: 'Group name', value: chat.name }],
    });
    if (vals?.name?.trim()) {
      try {
        await api(`/api/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: { name: vals.name.trim() } });
        toast('Group renamed', 'success');
      } catch (e) { toast(e.message, 'error'); }
    }
  });
  $('#drawer-leave', drawer)?.addEventListener('click', async () => {
    if (await confirmModal({ title: 'Leave group?', confirmText: 'Leave', danger: true })) {
      try {
        await api(`/api/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(S.user.id)}`, { method: 'DELETE' });
        closeDrawer();
      } catch (e) { toast(e.message, 'error'); }
    }
  });
  $('#drawer-delete', drawer)?.addEventListener('click', async () => {
    const isSelf = !chatPeer(chat);
    const body = isSelf
      ? 'Your Saved Messages history will be deleted permanently.'
      : 'The chat will disappear from your list. The other person keeps their copy.';
    if (await confirmModal({ title: 'Delete this chat?', body, confirmText: 'Delete', danger: true })) {
      try {
        await api(`/api/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(S.user.id)}`, { method: 'DELETE' });
        closeDrawer();
      } catch (e) { toast(e.message, 'error'); }
    }
  });
  $$('#drawer-view-user', drawer).forEach((b) => b.addEventListener('click', () => {
    if (peer) openProfile(peer.id);
  }));
  $('#drawer-block', drawer)?.addEventListener('click', async () => {
    if (!peer) return;
    const done = await toggleBlockUser(peer, { ask: !chat.blocked });
    if (done) openMembersDrawer(chatId); // re-render the drawer with fresh state
  });
  $$('[data-kick-member]', drawer).forEach((b) => b.addEventListener('click', async () => {
    const uid = b.dataset.kickMember;
    const m = chat.members.find((x) => x.id === uid);
    if (await confirmModal({ title: `Remove ${m?.displayName}?`, confirmText: 'Remove', danger: true })) {
      try {
        await api(`/api/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      } catch (e) { toast(e.message, 'error'); }
    }
  }));

  requestAnimationFrame(() => { backdrop.classList.add('open'); drawer.classList.add('open'); });
}

function closeDrawer() {
  $('.drawer-backdrop')?.classList.remove('open');
  $('.drawer')?.classList.remove('open');
  drawerState.chatId = null;
}

/* ------------------------------ user profile ------------------------------ */

async function openProfile(userId) {
  if (!userId) return;
  let data;
  try { data = await api(`/api/users/${encodeURIComponent(userId)}/profile`); }
  catch (e) { return toast(e.message, 'error'); }
  const u = data.user;
  const isSelf = u.id === S.user.id;
  const joined = u.createdAt
    ? new Date(u.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const canModerate = !isSelf && roleLevel(S.user.role) >= 1 && roleLevel(S.user.role) > roleLevel(u.role);
  closeDrawer();
  openModal(`
    <div class="profile-head">
      ${avatarHtml(u)}
      <div class="profile-name">${esc(u.displayName)}</div>
      <div>${roleBadge(u.role)}</div>
      <div class="profile-presence ${u.online ? 'online' : ''}">${u.online ? 'online' : esc(fmtLastSeen(u.lastSeen))}</div>
    </div>
    <div class="profile-rows">
      <div class="profile-row">${icons.user}<span class="grow"><span class="pr-label">username</span>@${esc(u.username)}</span></div>
      ${joined ? `<div class="profile-row">${icons.activity}<span class="grow"><span class="pr-label">member since</span>${esc(joined)}</span></div>` : ''}
    </div>
    <div class="row" style="justify-content:center">
      ${isSelf
        ? `<button class="btn" id="pf-edit">${icons.pencil}<span>Edit profile</span></button>`
        : `<button class="btn btn-primary" id="pf-msg">${icons.send}<span>Message</span></button>`}
      ${!isSelf ? `<button class="btn btn-ghost" id="pf-block">${icons.ban}<span>${u.blocked ? 'Unblock' : 'Block'}</span></button>` : ''}
      ${canModerate ? `<button class="btn btn-ghost" id="pf-mod">${icons.shield}<span>Moderate</span></button>` : ''}
    </div>
  `, {
    onMount(root, close) {
      $('#pf-block', root)?.addEventListener('click', async () => {
        const done = await toggleBlockUser(u, { ask: !u.blocked });
        if (done) { close(); openProfile(u.id); } // re-render with the new state
      });
      $('#pf-msg', root)?.addEventListener('click', async () => {
        try {
          const { chat } = await api('/api/chats/dm', { method: 'POST', body: { userId: u.id } });
          upsertChat(chat);
          renderChatList($('#chat-filter')?.value || '');
          close();
          openChat(chat.id);
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#pf-edit', root)?.addEventListener('click', () => { close(); openSettings(); });
      $('#pf-mod', root)?.addEventListener('click', async (ev) => {
        try {
          const { users } = await api(`/api/admin/users?q=${encodeURIComponent(u.username)}`);
          const full = users.find((x) => x.id === u.id);
          if (!full) throw new Error('User not found');
          const rect = ev.currentTarget.getBoundingClientRect();
          userAdminMenu(rect.left - 150, rect.bottom + 6, full, () => {});
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

/* ---------------------------- avatar helpers ---------------------------- */

/** Center-crop an image file to a square canvas, max `size` px, as JPEG blob. */
function cropToSquare(file, size = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      cv.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image'))), 'image/jpeg', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

function applyAvatarUpdate(user) {
  S.user = user;
  S.avatarTs = Date.now();
  store.saveSession(S.base, { token: S.token, user: S.user });
  syncSelfUi();
  renderChatList($('#chat-filter')?.value || '');
}

async function uploadAvatarFile(file, onDone) {
  if (!file.type.startsWith('image/')) return toast('Please pick an image file', 'error');
  if (file.size > 5 * 1024 * 1024) return toast('Profile photo must be smaller than 5 MB', 'error');
  try {
    const blob = await cropToSquare(file, 512);
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    const j = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${S.base}/api/avatars`);
      xhr.setRequestHeader('Authorization', `Bearer ${S.token}`);
      xhr.onload = () => {
        let d = {};
        try { d = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else reject(new Error(d.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed — network error'));
      xhr.send(fd);
    });
    applyAvatarUpdate(j.user);
    toast('Profile photo updated', 'success');
    onDone?.();
  } catch (e) { toast(e.message, 'error', 4200); }
}

/* ------------------------- new chat / add members ------------------------- */

async function searchPickList(container, { multi = false, onPick = null, selected = new Set() } = {}) {
  const input = $('.input', container);
  const list = $('.new-chat-list', container);
  let timer = null;
  const run = async () => {
    const q = input.value.trim();
    if (!q) { list.innerHTML = '<div class="empty-note">Type to search for users</div>'; return; }
    try {
      const { users } = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!users.length) { list.innerHTML = '<div class="empty-note">No users found</div>'; return; }
      list.innerHTML = users.map((u) => `
        <div class="pick-row ${selected.has(u.id) ? 'selected' : ''}" data-uid="${esc(u.id)}" data-uname="${esc(u.displayName)}" data-color="${esc(u.avatarColor)}">
          ${avatarHtml(u, 'sm', true)}
          <div class="grow" style="min-width:0">
            <div style="font-weight:650">${esc(u.displayName)}</div>
            <div class="small faint">@${esc(u.username)} ${roleLevel(u.role) >= 1 ? '· ' + esc(u.role) : ''}</div>
          </div>
          ${selected.has(u.id) ? `<span style="color:var(--success)">${icons.check}</span>` : ''}
        </div>`).join('');
      $$('.pick-row', list).forEach((row) => row.addEventListener('click', () => {
        if (multi) {
          const id = row.dataset.uid;
          if (selected.has(id)) selected.delete(id);
          else selected.set(id, { id, displayName: row.dataset.uname, avatarColor: row.dataset.color });
          row.classList.toggle('selected', selected.has(id));
          run();
        } else onPick?.(row.dataset.uid);
      }));
    } catch (e) { list.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`; }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 280); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  input.value = '';
  await run();
}

function openNewChat() {
  let mode = 'dm';
  const selected = new Map();
  openModal(`
    <div class="modal-head"><div class="modal-title">New chat</div></div>
    <div class="auth-tabs">
      <div class="tab-pill" id="nc-pill"></div>
      <button class="active" id="nc-dm">Direct</button>
      <button id="nc-group">Group</button>
    </div>
    <div id="nc-body"></div>
  `, {
    onMount: async (root, close) => {
      const body = $('#nc-body', root);
      const pill = $('#nc-pill', root);

      const mountDm = async () => {
        body.innerHTML = `
          <div class="field"><label>Find a user</label><input class="input" placeholder="Search by username…" /></div>
          <div class="new-chat-list"></div>`;
        await searchPickList(body, {
          onPick: async (uid) => {
            try {
              const { chat } = await api('/api/chats/dm', { method: 'POST', body: { userId: uid } });
              upsertChat(chat);
              renderChatList($('#chat-filter')?.value || '');
              close();
              openChat(chat.id);
            } catch (e) { toast(e.message, 'error'); }
          },
        });
      };

      const mountGroup = async () => {
        body.innerHTML = `
          <div class="field"><label>Group name</label><input class="input" id="g-name" placeholder="My awesome group" maxlength="64" /></div>
          <div class="field"><label>Add members</label><input class="input" id="g-search" placeholder="Search by username…" /></div>
          <div class="new-chat-list"></div>
          <button class="btn btn-primary btn-block mt-3" id="g-create">${icons.users}<span>Create group</span></button>`;
        await searchPickList(body, { multi: true, selected });
        $('#g-create', body).onclick = async () => {
          const name = $('#g-name', body).value.trim();
          if (!name) return toast('Give the group a name', 'error');
          try {
            const { chat } = await api('/api/chats/group', {
              method: 'POST', body: { name, memberIds: [...selected.keys()] },
            });
            upsertChat(chat);
            renderChatList($('#chat-filter')?.value || '');
            close();
            openChat(chat.id);
          } catch (e) { toast(e.message, 'error'); }
        };
      };

      $('#nc-dm', root).onclick = () => {
        mode = 'dm';
        pill.classList.remove('right');
        $('#nc-dm', root).classList.add('active');
        $('#nc-group', root).classList.remove('active');
        mountDm();
      };
      $('#nc-group', root).onclick = () => {
        mode = 'group';
        pill.classList.add('right');
        $('#nc-group', root).classList.add('active');
        $('#nc-dm', root).classList.remove('active');
        mountGroup();
      };
      void mode;
      mountDm();
    },
  });
}

function openAddMembers(chatId) {
  const selected = new Map();
  const chat = getChat(chatId);
  openModal(`
    <div class="modal-head"><div class="modal-title">Add members</div></div>
    <div class="field"><label>Find users</label><input class="input" placeholder="Search by username…" /></div>
    <div class="new-chat-list"></div>
    <button class="btn btn-primary btn-block mt-3" id="add-go">${icons.plus}<span>Add selected</span></button>
  `, {
    onMount: async (root, close) => {
      await searchPickList(root, { multi: true, selected });
      $('#add-go', root).onclick = async () => {
        if (!selected.size) return close();
        try {
          const existing = new Set((chat?.members || []).map((m) => m.id));
          const ids = [...selected.keys()].filter((id) => !existing.has(id));
          if (ids.length) await api(`/api/chats/${encodeURIComponent(chatId)}/members`, { method: 'POST', body: { userIds: ids } });
          toast('Members added', 'success');
          close();
        } catch (e) { toast(e.message, 'error'); }
      };
    },
  });
}

/* ------------------------------ settings ------------------------------ */

/** Settings → Privacy: everyone I've blocked, with one-tap unblock. */
function loadBlockedUsersCard(root) {
  const slot = $('#set-blocks', root);
  if (!slot) return;
  api('/api/users/blocks').then(({ users }) => {
    if (!slot.isConnected) return;
    const empty = `<div class="small faint">You haven’t blocked anyone.</div>`;
    if (!users.length) { slot.innerHTML = empty; return; }
    slot.innerHTML = users.map((u) => `
      <div class="member-row">
        ${avatarHtml(u, 'sm', false)}
        <div class="grow" style="min-width:0">
          <div class="m-name">${esc(u.displayName)}</div>
          <div class="m-status">@${esc(u.username)}</div>
        </div>
        <button class="btn btn-sm" data-unblock="${esc(u.id)}">${icons.refresh}<span>Unblock</span></button>
      </div>`).join('');
    $$('[data-unblock]', slot).forEach((b) => b.addEventListener('click', async () => {
      const uid = b.dataset.unblock;
      try {
        await api(`/api/users/${encodeURIComponent(uid)}/block`, { method: 'DELETE' });
        b.closest('.member-row')?.remove();
        if (!$$('.member-row', slot).length) slot.innerHTML = empty;
        applyBlockState(uid, false);
        toast('Unblocked', 'success', 1500);
      } catch (e) { toast(e.message, 'error'); }
    }));
  }).catch((e) => {
    if (slot.isConnected) slot.innerHTML = `<div class="small faint">${esc(e.message)}</div>`;
  });
}

function openSettings() {
  const accents = ['#1bd96a', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
  openModal(`
    <div class="modal-head"><div class="modal-title">Settings</div></div>

    <div class="card">
      <h3>Profile</h3>
      <div class="row mb-3 set-avatar-row">
        <span id="set-avatar">${avatarHtml(S.user, '')}</span>
        <div class="grow" style="min-width:0"><div style="font-weight:700">${esc(S.user.displayName)}</div>
        <div class="small faint">@${esc(S.user.username)} · ${roleBadge(S.user.role)}</div></div>
        <input type="file" id="set-avatar-input" accept="image/*" style="display:none" />
        <button class="btn btn-sm" id="set-avatar-btn">${icons.user}<span>Photo</span></button>
        ${S.user.avatarUrl ? `<button class="btn btn-sm btn-ghost" id="set-avatar-del" title="Remove photo">${icons.trash}</button>` : ''}
      </div>
      <div class="field"><label>Display name</label><input class="input" id="set-name" maxlength="40" value="${esc(S.user.displayName)}" /></div>
      <button class="btn btn-primary btn-sm" id="set-save-name">Save name</button>
    </div>

    <div class="card">
      <h3>Appearance</h3>
      <div class="row between mb-3"><span class="small">Theme</span>
        <button class="btn btn-sm" id="set-theme">${S.prefs.theme === 'dark' ? icons.moon + '<span>Dark</span>' : icons.sun + '<span>Light</span>'}</button>
      </div>
      <div class="row between"><span class="small">Accent color</span>
        <div class="seg">${accents.map((a) => `<div class="swatch ${S.prefs.accent === a ? 'active' : ''}" data-accent="${a}" style="background:${a}"></div>`).join('')}</div>
      </div>
      <div class="row between mt-3"><span class="small">Message sound</span>
        <label class="toggle"><input type="checkbox" id="set-sound" ${S.prefs.sound ? 'checked' : ''} /><span class="track"></span></label>
      </div>
      <div class="row between mt-3">
        <div><div class="small" style="font-weight:650">Desktop notifications</div>
        <div class="small faint">Notify about new messages when this tab is in the background</div></div>
        <label class="toggle"><input type="checkbox" id="set-notify" ${S.prefs.notify ? 'checked' : ''} /><span class="track"></span></label>
      </div>
    </div>

    <div class="card">
      <h3>Password</h3>
      <div class="field"><label>Current password</label><input class="input" id="set-cur" type="password" autocomplete="current-password" /></div>
      <div class="field"><label>New password (min. 8 chars)</label><input class="input" id="set-new" type="password" autocomplete="new-password" /></div>
      <div class="row">
        <button class="btn btn-sm" id="set-pass">${icons.key}<span>Change password</span></button>
        <button class="btn btn-sm btn-ghost" id="set-saved">${'🔖'}<span>Saved messages</span></button>
      </div>
    </div>

    <div class="card">
      <h3>Privacy</h3>
      <div class="small faint mb-3">Messages and calls from people you block silently never reach you — everything keeps looking normal on their side, so they can’t tell they were blocked. Shared group chats are unaffected.</div>
      <div class="list-label" style="padding:4px 4px 8px">Blocked users</div>
      <div id="set-blocks"><span class="spinner"></span></div>
    </div>

    <div class="card">
      <h3>Two-factor authentication ${S.user.totpEnabled ? '<span class="pill ok">enabled</span>' : '<span class="pill warn">off</span>'}</h3>
      ${S.user.totpEnabled ? `
        <div class="small faint mb-3">Your account asks for an authenticator-app code at sign-in.
          <b>${S.user.backupCodesLeft}</b> backup code${S.user.backupCodesLeft === 1 ? '' : 's'} left.</div>
        <div class="row">
          <button class="btn btn-sm" id="set-2fa-regen">${icons.refresh}<span>New backup codes</span></button>
          <button class="btn btn-sm btn-danger" id="set-2fa-off">${icons.shield}<span>Disable 2FA</span></button>
        </div>` : `
        <div class="small faint mb-3">Add a second layer of security: after your password, sign-in will also ask for a code from an authenticator app (Google Authenticator, Aegis, 1Password…).</div>
        <button class="btn btn-sm btn-primary" id="set-2fa-on">${icons.shieldCheck}<span>Enable 2FA</span></button>`}
    </div>

    ${e2eeCardHtml()}

    <div class="small faint" style="text-align:center;padding-bottom:6px">efadro · client v${CLIENT_VERSION} · server v${esc(S.info?.version || '?')} — ${esc(S.base)}</div>
    ${S.info?.version && S.info.version !== CLIENT_VERSION ? `
      <div class="ver-mismatch">⚠ This client (v${CLIENT_VERSION}) is newer than the server (v${esc(S.info.version)}).
        Update the server to the latest release and restart it, then hard-refresh this page (Ctrl+Shift+R) — otherwise new features (like call buttons) may be missing.</div>` : ''}
  `, {
    onMount(root, close) {
      bindE2EECard(root);
      loadBlockedUsersCard(root);
      const avInput = $('#set-avatar-input', root);
      $('#set-avatar-btn', root).onclick = () => avInput.click();
      avInput.onchange = () => {
        const f = avInput.files?.[0];
        avInput.value = '';
        if (f) uploadAvatarFile(f, () => { close(); openSettings(); });
      };
      $('#set-avatar-del', root)?.addEventListener('click', async () => {
        try {
          const j = await api('/api/avatars', { method: 'DELETE' });
          applyAvatarUpdate(j.user);
          toast('Profile photo removed', 'success');
          close();
          openSettings();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#set-save-name', root).onclick = async () => {
        try {
          const { user } = await api('/api/auth/me', { method: 'PATCH', body: { displayName: $('#set-name', root).value.trim() } });
          S.user = user;
          store.saveSession(S.base, { token: S.token, user: S.user });
          syncSelfUi();
          renderChatList($('#chat-filter')?.value || '');
          toast('Display name updated', 'success');
        } catch (e) { toast(e.message, 'error'); }
      };
      $('#set-theme', root).onclick = (e) => {
        S.prefs.theme = S.prefs.theme === 'dark' ? 'light' : 'dark';
        store.savePrefs(S.prefs);
        applyPrefs();
        e.currentTarget.innerHTML = S.prefs.theme === 'dark' ? icons.moon + '<span>Dark</span>' : icons.sun + '<span>Light</span>';
      };
      $$('.swatch', root).forEach((sw) => sw.addEventListener('click', () => {
        S.prefs.accent = sw.dataset.accent;
        store.savePrefs(S.prefs);
        applyPrefs();
        $$('.swatch', root).forEach((x) => x.classList.toggle('active', x === sw));
      }));
      $('#set-sound', root).onchange = (e) => {
        S.prefs.sound = e.target.checked;
        store.savePrefs(S.prefs);
      };
      $('#set-notify', root).onchange = async (e) => {
        if (!e.target.checked) {
          S.prefs.notify = false;
          store.savePrefs(S.prefs);
          return;
        }
        if (typeof Notification === 'undefined') {
          e.target.checked = false;
          return toast('This browser does not support notifications', 'error');
        }
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission().catch(() => 'denied');
        if (perm !== 'granted') {
          e.target.checked = false;
          return toast('Notifications are blocked for this site — allow them in browser settings', 'error', 4500);
        }
        S.prefs.notify = true;
        store.savePrefs(S.prefs);
        toast('Desktop notifications enabled', 'success');
      };
      $('#set-pass', root).onclick = async () => {
        const cur = $('#set-cur', root).value;
        const next = $('#set-new', root).value;
        if (!cur || next.length < 8) return toast('New password must be at least 8 characters', 'error');
        try {
          S.selfRotate = true; // server kicks our own socket on password change — expect it
          const j = await api('/api/auth/change-password', { method: 'POST', body: { current: cur, next } });
          S.token = j.token;
          store.saveSession(S.base, { token: S.token, user: S.user });
          close();
          toast('Password changed — other sessions were signed out', 'success');
          S.wsManualClose = true;
          try { S.ws?.close(); } catch { /* ignore */ }
          connectWS(); // reconnect with the fresh token
          setTimeout(() => { S.selfRotate = false; }, 1500);
        } catch (e) { S.selfRotate = false; toast(e.message, 'error'); }
      };
      $('#set-saved', root).onclick = async () => {
        try {
          const { chat } = await api('/api/chats/dm', { method: 'POST', body: { userId: S.user.id } });
          upsertChat(chat);
          renderChatList($('#chat-filter')?.value || '');
          close();
          openChat(chat.id);
        } catch (e) { toast(e.message, 'error'); }
      };
      $('#set-2fa-on', root)?.addEventListener('click', () => { close(); open2faWizard(); });
      $('#set-2fa-off', root)?.addEventListener('click', async () => {
        const vals = await formModal({
          title: 'Disable two-factor authentication',
          note: 'Confirm with your password and a current authenticator code.',
          fields: [
            { key: 'password', label: 'Password', type: 'password' },
            { key: 'code', label: 'Authenticator code', placeholder: '123456' },
          ],
          submitText: 'Disable 2FA', danger: true,
        });
        if (!vals) return;
        try {
          const j = await api('/api/auth/2fa/disable', { method: 'POST', body: vals });
          S.user = j.user;
          store.saveSession(S.base, { token: S.token, user: S.user });
          toast('Two-factor authentication disabled', 'success');
          close();
          openSettings();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#set-2fa-regen', root)?.addEventListener('click', async () => {
        const vals = await formModal({
          title: 'Regenerate backup codes',
          note: 'Old backup codes stop working immediately.',
          fields: [{ key: 'code', label: 'Authenticator code', placeholder: '123456' }],
          submitText: 'Regenerate',
        });
        if (!vals) return;
        try {
          const j = await api('/api/auth/2fa/backup-codes', { method: 'POST', body: vals });
          S.user = j.user;
          store.saveSession(S.base, { token: S.token, user: S.user });
          close();
          showBackupCodes(j.backupCodes);
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}

/* ------------------------- 2FA setup wizard ------------------------- */

function showBackupCodes(codes) {
  openModal(`
    <div class="modal-head"><div class="modal-title">${icons.shieldCheck} Backup codes</div></div>
    <p class="small muted" style="margin-top:-8px;line-height:1.5">
      Save these one-time codes somewhere safe. Each lets you sign in if you lose your authenticator —
      <b>they are shown only once</b>.</p>
    <div class="codes-grid">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="row mt-3" style="justify-content:flex-end">
      <button class="btn btn-sm" id="bc-copy">${icons.copy}<span>Copy</span></button>
      <button class="btn btn-sm" id="bc-dl">${icons.download}<span>Download .txt</span></button>
      <button class="btn btn-primary btn-sm" id="bc-done">Done</button>
    </div>`, {
    onMount(root, close) {
      $('#bc-copy', root).onclick = async () => {
        try { await navigator.clipboard.writeText(codes.join('\n')); toast('Backup codes copied', 'success'); }
        catch { toast('Copy failed', 'error'); }
      };
      $('#bc-dl', root).onclick = () => {
        const blob = new Blob([`efadro backup codes (account @${S.user.username})\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'efadro-backup-codes.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      };
      $('#bc-done', root).onclick = close;
    },
  });
}

async function open2faWizard() {
  let setup;
  try {
    setup = await api('/api/auth/2fa/setup', { method: 'POST', body: {} });
  } catch (e) { return toast(e.message, 'error'); }

  openModal(`
    <div class="modal-head"><div class="modal-title">Enable two-factor authentication</div></div>
    <div class="tfa-step" data-step="1">
      <p class="small muted" style="margin-top:-4px;line-height:1.55">
        <b>Step 1.</b> Scan this QR code with your authenticator app
        (Google Authenticator, Aegis, 1Password…) — or enter the key manually.</p>
      <div class="qr-box"><img src="${setup.qr}" alt="TOTP QR code" /></div>
      <div class="secret-row"><code class="mono grow">${esc(setup.secret)}</code>
        <button class="btn btn-sm btn-ghost" id="tfa-copy">${icons.copy}</button></div>
      <div class="row mt-4" style="justify-content:flex-end">
        <button class="btn btn-ghost" id="tfa-cancel">Cancel</button>
        <button class="btn btn-primary" id="tfa-next">Continue</button>
      </div>
    </div>
    <div class="tfa-step" data-step="2" style="display:none">
      <p class="small muted" style="margin-top:-4px;line-height:1.55">
        <b>Step 2.</b> Enter the 6-digit code shown in your app to confirm everything works.</p>
      <div class="form-error" id="tfa-err"></div>
      <div class="field"><label>Verification code</label>
        <input class="input mono tfa-code" id="tfa-code" maxlength="7" placeholder="123456" inputmode="numeric" autocomplete="one-time-code" /></div>
      <div class="row mt-4" style="justify-content:space-between">
        <button class="btn btn-ghost" id="tfa-back-w">← back</button>
        <button class="btn btn-primary" id="tfa-verify">${icons.shieldCheck}<span>Verify & enable</span></button>
      </div>
    </div>`, {
    onMount(root, close) {
      $('#tfa-copy', root).onclick = async () => {
        try { await navigator.clipboard.writeText(setup.secret); toast('Key copied', 'success'); } catch { toast('Copy failed', 'error'); }
      };
      $('#tfa-cancel', root).onclick = close;
      $('#tfa-next', root).onclick = () => {
        $('[data-step="1"]', root).style.display = 'none';
        $('[data-step="2"]', root).style.display = '';
        $('#tfa-code', root).focus();
      };
      $('#tfa-back-w', root).onclick = () => {
        $('[data-step="2"]', root).style.display = 'none';
        $('[data-step="1"]', root).style.display = '';
      };
      const verify = async () => {
        const btn = $('#tfa-verify', root);
        btn.disabled = true;
        try {
          const j = await api('/api/auth/2fa/enable', { method: 'POST', body: { code: $('#tfa-code', root).value.trim() } });
          S.user = j.user;
          store.saveSession(S.base, { token: S.token, user: S.user });
          close();
          toast('Two-factor authentication enabled 🎉', 'success');
          showBackupCodes(j.backupCodes);
        } catch (e) {
          btn.disabled = false;
          setErr('tfa-err', e.message);
          $('#tfa-code', root).select();
        }
      };
      $('#tfa-verify', root).onclick = verify;
      $('#tfa-code', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
    },
  });
}

/* ============================ STAFF PANEL ============================ */

function openPanel() {
  if (roleLevel(S.user.role) < 1) return;
  S.panel.open = true;
  const me = roleLevel(S.user.role);
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  overlay.id = 'panel-overlay';
  overlay.innerHTML = `
    <div class="panel-top">
      <div class="logo logo-sm" style="width:34px;height:34px;border-radius:10px">${logoImg()}</div>
      <div>
        <div class="panel-title">Staff panel</div>
        <div class="small faint">You are signed in as ${esc(S.user.role)}</div>
      </div>
      <div class="panel-nav">
        <button data-tab="users" class="active">${icons.user} Users</button>
        <button data-tab="reports">${icons.flag} Reports <span id="rep-count"></span></button>
        ${me >= 2 ? `<button data-tab="audit">${icons.activity} Audit log</button>` : ''}
        ${me >= 3 ? `<button data-tab="server">${icons.gear} Server</button>` : ''}
      </div>
      <div class="grow"></div>
      <button class="btn btn-icon" id="panel-close" title="Close">${icons.x}</button>
    </div>
    <div class="panel-body"><div class="panel-inner" id="panel-content"></div></div>`;
  document.body.appendChild(overlay);
  $('#panel-close', overlay).onclick = closePanel;
  $$('.panel-nav button', overlay).forEach((b) => b.addEventListener('click', () => {
    $$('.panel-nav button', overlay).forEach((x) => x.classList.toggle('active', x === b));
    S.panel.tab = b.dataset.tab;
    renderPanelTab();
  }));
  document.addEventListener('keydown', panelEsc);
  renderPanelTab();
}

function panelEsc(e) { if (e.key === 'Escape' && S.panel.open && !modalRoot.hasChildNodes()) closePanel(); }

function closePanel() {
  S.panel.open = false;
  $('#panel-overlay')?.remove();
  document.removeEventListener('keydown', panelEsc);
}

async function renderPanelTab() {
  const el = $('#panel-content');
  if (!el) return;
  const tab = S.panel.tab;
  el.innerHTML = '<div class="empty-note"><span class="spinner"></span></div>';
  try {
    if (tab === 'users') return renderPanelUsers(el);
    if (tab === 'reports') return renderPanelReports(el);
    if (tab === 'audit') return renderPanelAudit(el);
    if (tab === 'server') return renderPanelServer(el);
  } catch (e) {
    el.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
  }
}

async function panelStats(el) {
  const { stats } = await api('/api/admin/stats');
  const items = [
    [stats.online, 'Online now'], [stats.users, 'Total users'], [stats.chats, 'Chats'],
    [stats.messages, 'Messages'], [stats.banned, 'Banned'], [stats.openReports, 'Open reports'],
  ];
  el.insertAdjacentHTML('afterbegin', `<div class="stat-grid">${items.map(([n, l], i) =>
    `<div class="stat-card" style="animation-delay:${i * 45}ms"><div class="s-num">${n}</div><div class="s-label">${esc(l)}</div></div>`).join('')}</div>`);
  const rc = $('#rep-count');
  if (rc) rc.textContent = stats.openReports ? `(${stats.openReports})` : '';
}

/* ----------------------------- panel: users ----------------------------- */

async function renderPanelUsers(el, q = '') {
  const { users } = await api(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  el.innerHTML = `
    <div class="row mb-3">
      <div class="search-box grow">${icons.search}<input class="input" id="pu-search" placeholder="Search users…" value="${esc(q)}" /></div>
    </div>
    <div class="card" style="padding:6px 14px">
      <table class="utable">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
          <tr data-uid="${esc(u.id)}">
            <td><div class="u-cell">${avatarHtml(u, 'xs')}
              <div><div style="font-weight:650">${esc(u.displayName)} ${u.isBootstrapOwner ? '<span title="Bootstrap owner">👑</span>' : ''}</div>
              <div class="small faint">@${esc(u.username)}${u.online ? ' · <span style="color:var(--success)">online</span>' : ''}</div></div>
            </div></td>
            <td>${roleBadge(u.role)}</td>
            <td>${u.banned ? `<span class="pill bad">banned</span>`
              : (u.mutedUntil > Date.now() ? `<span class="pill warn">muted</span>` : '<span class="pill ok">active</span>')}</td>
            <td class="faint small">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td style="text-align:right">${u.id !== S.user.id ? `<button class="btn btn-ghost btn-icon pu-actions" data-uid="${esc(u.id)}">${icons.dots}</button>` : '<span class="faint small">you</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${!users.length ? '<div class="empty-note">No users found</div>' : ''}
    </div>`;

  await panelStats(el);

  let timer = null;
  $('#pu-search', el).addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => renderPanelUsers(el, e.target.value.trim()), 300);
  });

  $$('.pu-actions', el).forEach((btn) => btn.addEventListener('click', (e) => {
    const u = users.find((x) => x.id === btn.dataset.uid);
    if (!u) return;
    const rect = e.currentTarget.getBoundingClientRect();
    userAdminMenu(rect.left - 170, rect.bottom + 6, u, () => renderPanelUsers(el, q));
  }));
}

function userAdminMenu(x, y, u, refresh) {
  const me = roleLevel(S.user.role);
  const target = roleLevel(u.role);
  const canManage = me > target;
  const muted = u.mutedUntil > Date.now();
  const items = [];

  // Role changes (admin+)
  if (me >= 2 && canManage && !u.isBootstrapOwner) {
    const roles = [];
    if (u.role !== 'moderator') roles.push('moderator');
    roles.push('user');
    if (me >= 3 && u.role !== 'admin') roles.push('admin');
    if (me >= 3 && u.role !== 'owner') roles.push('owner');
    for (const r of roles) {
      items.push({
        label: `Make ${r}`, icon: icons.shield,
        onClick: () => adminAct(`/api/admin/users/${u.id}/role`, { role: r }, `Role updated`, refresh),
      });
    }
    items.push({ sep: true });
  }

  // Mute (moderator+) — the bootstrap owner is protected server-side too
  if (canManage && !u.isBootstrapOwner) {
    if (muted) items.push({ label: 'Unmute', icon: icons.mute, onClick: () => adminAct(`/api/admin/users/${u.id}/unmute`, {}, 'Unmuted', refresh) });
    else items.push({
      label: 'Mute…', icon: icons.mute,
      onClick: async () => {
        const vals = await formModal({
          title: `Mute ${u.displayName}`,
          fields: [
            { key: 'minutes', label: 'Duration', type: 'select', value: '60', options: [
              { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' },
              { value: '60', label: '1 hour' }, { value: '1440', label: '1 day' },
              { value: '10080', label: '1 week' }, { value: '43200', label: '30 days' },
            ] },
            { key: 'reason', label: 'Reason (optional)', placeholder: 'Spam, harassment…' },
          ],
          submitText: 'Mute', danger: true,
        });
        if (vals) adminAct(`/api/admin/users/${u.id}/mute`, { minutes: Number(vals.minutes), reason: vals.reason }, 'Muted', refresh);
      },
    });
    items.push({
      label: 'Kick (sign out)', icon: icons.kick,
      onClick: async () => {
        if (await confirmModal({ title: `Sign out ${u.displayName}?`, body: 'All their sessions will be terminated.', confirmText: 'Kick', danger: true })) {
          adminAct(`/api/admin/users/${u.id}/kick`, {}, 'Kicked', refresh);
        }
      },
    });
  }

  // Ban (admin+)
  if (me >= 2 && canManage && !u.isBootstrapOwner) {
    if (u.banned) items.push({ label: 'Unban', icon: icons.check, onClick: () => adminAct(`/api/admin/users/${u.id}/unban`, {}, 'Unbanned', refresh) });
    else items.push({
      label: 'Ban…', icon: icons.ban, danger: true,
      onClick: async () => {
        const vals = await formModal({
          title: `Ban ${u.displayName}`,
          note: 'They will be signed out immediately and cannot sign in again until unbanned.',
          fields: [{ key: 'reason', label: 'Reason (optional)', placeholder: 'Rule violation…' }],
          submitText: 'Ban user', danger: true,
        });
        if (vals) adminAct(`/api/admin/users/${u.id}/ban`, { reason: vals.reason }, 'Banned', refresh);
      },
    });
  }

  if (!items.length) items.push({ label: 'No actions available', disabled: true });
  ctxMenu(x, y, items);
}

async function adminAct(url, body, okMsg, refresh) {
  try {
    await api(url, { method: url.includes('/role') ? 'PATCH' : 'POST', body });
    toast(okMsg, 'success');
    refresh?.();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------------------- panel: reports ---------------------------- */

async function renderPanelReports(el) {
  const { reports } = await api('/api/admin/reports');
  el.innerHTML = `
    <div class="small muted mb-3">Reports from users. Deleting a message also resolves its report.</div>
    ${reports.length ? reports.map((r) => `
      <div class="card report-card" data-rid="${r.id}" data-mid="${r.message.id}">
        <div class="report-msg">${esc(r.message.content)}</div>
        <div class="report-meta">
          <span>Author: <b>${esc(r.author.displayName)}</b> (@${esc(r.author.username)})</span>
          <span>Reported by: ${esc(r.reporter.displayName)}</span>
          <span>${timeAgo(r.createdAt)}</span>
        </div>
        ${r.reason ? `<div class="small" style="color:var(--warning)">“${esc(r.reason)}”</div>` : ''}
        <div class="row mt-2">
          <button class="btn btn-sm btn-danger" data-act="del">${icons.trash}<span>Delete message</span></button>
          <button class="btn btn-sm" data-act="mute">${icons.mute}<span>Mute author</span></button>
          <div class="grow"></div>
          <button class="btn btn-sm btn-ghost" data-act="dismiss">Dismiss</button>
        </div>
      </div>`).join('') : '<div class="empty-note">No open reports — all clear ✨</div>'}`;

  await panelStats(el);

  $$('.report-card', el).forEach((card) => {
    const rid = card.dataset.rid;
    const mid = card.dataset.mid;
    card.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      try {
        if (act === 'del') {
          await api(`/api/messages/${mid}`, { method: 'DELETE' });
          await api(`/api/admin/reports/${rid}/resolve`, { method: 'POST', body: {} });
          toast('Message deleted & report resolved', 'success');
          renderPanelTab();
        } else if (act === 'dismiss') {
          await api(`/api/admin/reports/${rid}/resolve`, { method: 'POST', body: {} });
          renderPanelTab();
        } else if (act === 'mute') {
          const authorId = reports.find((x) => String(x.id) === String(rid))?.author?.id;
          const vals = await formModal({
            title: 'Mute author',
            fields: [
              { key: 'minutes', label: 'Duration', type: 'select', value: '60', options: [
                { value: '15', label: '15 minutes' }, { value: '60', label: '1 hour' },
                { value: '1440', label: '1 day' }, { value: '10080', label: '1 week' },
              ] },
              { key: 'reason', label: 'Reason (optional)' },
            ],
            submitText: 'Mute', danger: true,
          });
          if (vals && authorId) {
            await api(`/api/admin/users/${authorId}/mute`, { method: 'POST', body: { minutes: Number(vals.minutes), reason: vals.reason } });
            await api(`/api/admin/reports/${rid}/resolve`, { method: 'POST', body: {} });
            toast('Author muted & report resolved', 'success');
            renderPanelTab();
          }
        }
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

/* ----------------------------- panel: audit ----------------------------- */

const AUDIT_LABELS = {
  ban: 'banned', unban: 'unbanned', mute: 'muted', unmute: 'unmuted', kick: 'kicked',
  role_change: 'changed role of', message_delete: 'deleted a message by', report_resolve: 'resolved a report on',
  config_update: 'updated server config', secret_rotate: 'rotated server keys', signup: 'joined the server', password_change: 'changed password',
};

async function renderPanelAudit(el) {
  const { entries } = await api('/api/admin/audit');
  el.innerHTML = `
    <div class="card">
      <h3>Audit log</h3>
      ${entries.length ? entries.map((a) => `
        <div class="audit-row">
          <span class="audit-action">${esc(a.action)}</span>
          <span class="grow">${esc(a.actor?.displayName || '?')} ${esc(AUDIT_LABELS[a.action] || '')} ${a.target ? `<b>${esc(a.target.displayName)}</b>` : ''}
            ${a.meta && Object.keys(a.meta).length ? `<span class="faint"> ${esc(JSON.stringify(a.meta))}</span>` : ''}</span>
          <span class="audit-time">${timeAgo(a.createdAt)}</span>
        </div>`).join('') : '<div class="empty-note">No activity yet</div>'}
    </div>`;
  await panelStats(el);
}

/* ----------------------------- panel: server ----------------------------- */

async function renderPanelServer(el) {
  const { config: c } = await api('/api/admin/server/config');
  el.innerHTML = `
    <div class="card">
      <h3>General</h3>
      <div class="field"><label>Server name</label><input class="input" id="sc-name" maxlength="80" value="${esc(c.serverName)}" /></div>
      <div class="row between">
        <div><div class="small" style="font-weight:650">Open registration</div>
        <div class="small faint">Allow new accounts to sign up</div></div>
        <label class="toggle"><input type="checkbox" id="sc-reg" ${c.registrationEnabled ? 'checked' : ''} /><span class="track"></span></label>
      </div>
    </div>

    <div class="card">
      <h3>Server password</h3>
      <div class="small faint mb-3">New members must enter this password before they can register or sign in. Leave empty to disable. ${c.serverPasswordSet ? '<span class="pill ok">enabled</span>' : '<span class="pill warn">disabled</span>'}</div>
      <div class="field"><label>Server password</label><input class="input" id="sc-pass" type="text" placeholder="Enter a new password…" autocomplete="off" /></div>
      <div class="small faint">Saving replaces the current password; saving with an empty field disables it.</div>
    </div>

    <div class="card">
      <h3>Cloudflare Turnstile</h3>
      <div class="row between mb-3">
        <div><div class="small" style="font-weight:650">Require captcha on join</div>
        <div class="small faint">Visitors must solve a Turnstile challenge first</div></div>
        <label class="toggle"><input type="checkbox" id="sc-ts" ${c.turnstile.enabled ? 'checked' : ''} /><span class="track"></span></label>
      </div>
      <div class="field"><label>Site key</label><input class="input mono" id="sc-ts-site" value="${esc(c.turnstile.siteKey)}" placeholder="0x4AAAAAAA…" /></div>
      <div class="field"><label>Secret key ${c.turnstile.secretKeySet ? `<span class="faint">(currently ${esc(c.turnstile.secretKeyMasked)})</span>` : ''}</label>
        <input class="input mono" id="sc-ts-secret" value="" placeholder="${c.turnstile.secretKeySet ? 'Leave empty to keep current' : '0x4AAAAAAA…'}" autocomplete="off" /></div>
    </div>

    <div class="card">
      <h3>Sessions</h3>
      <div class="field"><label>Session length (days)</label><input class="input" id="sc-days" type="number" min="1" max="90" value="${c.tokenExpiryDays}" /></div>
    </div>

    <button class="btn btn-primary" id="sc-save">${icons.check}<span>Save settings</span></button>

    <div class="card mt-4" style="border-color:color-mix(in srgb, var(--danger) 30%, transparent)">
      <h3 style="color:var(--danger)">Danger zone</h3>
      <div class="small faint mb-3">Rotating the JWT secret signs out <b>everyone</b> (including you) and invalidates all sessions. Current secret: <code>${esc(c.jwtSecretMasked)}</code></div>
      <button class="btn btn-danger" id="sc-rotate">${icons.refresh}<span>Rotate JWT secret</span></button>
    </div>`;

  $('#sc-save', el).onclick = async () => {
    const body = {
      serverName: $('#sc-name', el).value.trim(),
      registrationEnabled: $('#sc-reg', el).checked,
      serverPassword: $('#sc-pass', el).value,
      turnstileEnabled: $('#sc-ts', el).checked,
      turnstileSiteKey: $('#sc-ts-site', el).value.trim(),
      tokenExpiryDays: Number($('#sc-days', el).value) || 7,
    };
    const secret = $('#sc-ts-secret', el).value.trim();
    if (secret) body.turnstileSecretKey = secret;
    try {
      await api('/api/admin/server/config', { method: 'PATCH', body });
      toast('Server settings saved', 'success');
      renderPanelServer(el);
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#sc-rotate', el).onclick = async () => {
    if (await confirmModal({ title: 'Rotate JWT secret?', body: 'Every user will be signed out immediately, including you.', confirmText: 'Rotate', danger: true })) {
      try { await api('/api/admin/server/regenerate-secret', { method: 'POST', body: {} }); } catch { /* session dies immediately */ }
    }
  };

  await panelStats(el);
}

/* ------------------------------- events ------------------------------- */

// Chat list open
document.addEventListener('click', (e) => {
  const item = e.target.closest('.chat-item[data-chat-id]');
  if (item) openChat(item.dataset.chatId);
});

// Image lightbox
document.addEventListener('click', (e) => {
  const img = e.target.closest('.msg-img');
  if (!img) return;
  openModal(`<img src="${esc(img.src)}" style="max-width:100%;border-radius:14px;display:block" alt="" />`, {
    onMount(root) { root.firstElementChild.style.width = 'min(720px, 94vw)'; },
  });
});

// Reply-quote / pinned jumps
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-jump]');
  if (q) jumpToMessage(q.dataset.jump);
});

// Spoiler reveal
document.addEventListener('click', (e) => {
  const sp = e.target.closest('[data-spoiler]');
  if (sp) sp.classList.toggle('revealed');
});

// Open user profiles from messages, member rows
document.addEventListener('click', (e) => {
  if (e.target.closest('.msg-actions, .rx-chip, [data-jump]')) return;
  const author = e.target.closest('.msg-author');
  if (author) {
    const row = author.closest('.msg-row');
    if (row?.dataset.authorId) openProfile(row.dataset.authorId);
    return;
  }
  const av = e.target.closest('.msg-row > .avatar, .reply-quote .avatar');
  if (av?.dataset?.uid) { openProfile(av.dataset.uid); return; }
  const mr = e.target.closest('.member-row[data-member]');
  if (mr && !e.target.closest('[data-kick-member]')) openProfile(mr.dataset.member);
});

// Mark read when window regains focus
window.addEventListener('focus', () => { if (S.activeChatId) markRead(S.activeChatId); });

/* -------------------------------- boot -------------------------------- */

(function boot() {
  captureInviteFromHash(); // an #invite=TOKEN deep link must survive the join flow
  S.prefs = { theme: 'dark', accent: '#1bd96a', sound: true, notify: false, ...store.prefs };
  // v1.9 migration: the pre-1.9 default accent was indigo — bring old installs onto the new brand green
  if (S.prefs.accent === '#6366f1') S.prefs.accent = '#1bd96a';
  applyPrefs();
  showServerScreen();
})();

/* ============================================================
   E2EE UI (v1.5): setup banner, device transfer flows, verify screen
   ============================================================ */

let e2eeSetupOpen = false;
let transferWaiter = null; // active outbound transfer request UI state

/** Probe identity + react to the result. Called once after the shell boots. */
async function bootE2EE() {
  let st = 'off';
  try { st = await E2EE.init({ api, base: S.base, userId: S.user.id }); } catch { st = 'off'; }
  if (S.user) S.user.e2ee = st;
  if (st === 'locked') {
    showE2EEBanner();
    // surface any request created moments before we came online
    try {
      const { transfers } = await E2EE.pendingTransfers();
      if (transfers.length) void maybeTransferPrompt(transfers[0]);
    } catch { /* fine */ }
  }
}

function showE2EEBanner() {
  const slot = $('#e2ee-slot');
  if (!slot || $('#e2ee-banner')) return;
  const b = document.createElement('div');
  b.className = 'e2ee-banner';
  b.id = 'e2ee-banner';
  b.innerHTML = `${icons.lock}<span class="grow">Encrypted chats are locked on this device</span>
    <button class="btn btn-sm btn-primary" id="e2ee-setup-btn">Set up</button>`;
  slot.appendChild(b);
  $('#e2ee-setup-btn', b).onclick = () => showE2EESetup();
}

function hideE2EEBanner() { $('#e2ee-banner')?.remove(); }

/** Modal for a device that lacks the keys (fresh browser / reinstalled app). */
function showE2EESetup() {
  if (e2eeSetupOpen || $('.modal')) return;
  e2eeSetupOpen = true;
  openModal(`
    <div class="modal-head"><div class="modal-title">${icons.lock} Set up encryption</div></div>
    <p class="muted" style="line-height:1.55">This account has end-to-end encrypted chats, but this device
      doesn’t hold your keys yet. Bring them over from a device that’s already set up — it takes a few seconds.</p>
    <div class="e2ee-steps">
      <div class="e2ee-step"><b>1</b><span>Request keys from this device</span></div>
      <div class="e2ee-step"><b>2</b><span>Approve on your other device — compare the code</span></div>
      <div class="e2ee-step"><b>3</b><span>Keys fly over, sealed so the server can’t read them</span></div>
    </div>
    <div id="e2ee-setup-body" class="mt-3">
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="btn btn-ghost" data-x="later">Not now</button>
        <button class="btn btn-primary" data-x="go">${icons.key}<span>Request my keys</span></button>
      </div>
    </div>`, {
    onMount(root, c) {
      $('[data-x="later"]', root).onclick = c;
      $('[data-x="go"]', root).onclick = () => beginTransferFlow(root, c);
    },
  });
  // when the modal leaves the DOM (X / backdrop / our own closes), setup is closed again
  const modalEl = $('.modal');
  const t = setInterval(() => {
    if (!modalEl || !document.body.contains(modalEl)) { e2eeSetupOpen = false; clearInterval(t); }
  }, 700);
}

/** Requester (new device) side: SAS code + waiting state until the old device answers. */
async function beginTransferFlow(root, closeModal) {
  const body = $('#e2ee-setup-body', root);
  body.innerHTML = `<div class="empty-note"><span class="spinner"></span> Contacting your other device…</div>`;
  let req;
  try {
    req = await E2EE.transferRequest({
      onAnswered: () => {
        closeModal();
        e2eeSetupOpen = false;
        hideE2EEBanner();
        toast('Keys imported — your encrypted chats are unlocked 🔓', 'success', 4200);
        // re-decrypt whatever is on screen
        loadChats().then(() => renderChatList($('#chat-filter')?.value || ''));
        if (S.activeChatId) { delete S.msg[S.activeChatId]; loadMessages(S.activeChatId, true); }
      },
      onDeclined: () => {
        e2eeSetupOpen = false;
        body.innerHTML = `<div class="empty-note">The request was declined on your other device.</div>
          <div class="row mt-3" style="justify-content:flex-end"><button class="btn btn-ghost" data-x="ok">OK</button></div>`;
        $('[data-x="ok"]', body).onclick = closeModal;
      },
    });
  } catch (e) {
    e2eeSetupOpen = false;
    body.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
    return;
  }
  transferWaiter = { id: req.id };
  body.innerHTML = `
    <div class="sas-box">
      <div class="small faint mb-2">COMPARE THIS CODE WITH YOUR OTHER DEVICE</div>
      <div class="sas-code" id="sas-new">${esc(req.code)}</div>
      <div class="transfer-wait"><span class="spinner"></span> Waiting for approval on your other device…</div>
      <div class="small faint mt-2">If the codes don’t match, cancel — someone may be intercepting the transfer.</div>
    </div>
    <div class="row mt-3" style="justify-content:flex-end"><button class="btn btn-ghost" data-x="cancel">Cancel</button></div>`;
  $('[data-x="cancel"]', body).onclick = () => { req.abort(); closeModal(); e2eeSetupOpen = false; };
}

/** Approver (old device) side: confirm + compare code + seal the bundle. */
async function maybeTransferPrompt(request) {
  if (!E2EE.isReady()) return;           // locked devices can't approve anything
  if (transferWaiter?.id === request.id) return; // that's our own outbound request
  if ($('.modal')) return;               // don't stack modals; the bell/poll will re-show it
  const code = await E2EE.core.sasCode(request.ephPub);
  openModal(`
    <div class="modal-head"><div class="modal-title">${icons.key} Share keys with a new device?</div></div>
    <p class="muted" style="line-height:1.55">A device just signed in to your account and is asking for your
      end-to-end encryption keys. Only approve if that was <b>you</b>.</p>
    <div class="sas-box">
      <div class="small faint mb-2">COMPARE WITH THE CODE ON THE NEW DEVICE</div>
      <div class="sas-code" id="sas-old">${esc(code)}</div>
      <div class="small faint mt-2">Identical code = safe channel. Different codes = abort!</div>
    </div>
    <div class="row mt-4" style="justify-content:flex-end;gap:8px">
      <button class="btn btn-ghost danger-text" data-x="deny">${icons.trash}<span>Deny</span></button>
      <button class="btn btn-primary" data-x="ok">${icons.shieldCheck}<span>Approve &amp; send keys</span></button>
    </div>`, {
    onMount(root, c) {
      $('[data-x="deny"]', root).onclick = async () => {
        c();
        try { await E2EE.transferDecline(request.id); } catch {}
      };
      $('[data-x="ok"]', root).onclick = async () => {
        const b = $('[data-x="ok"]', root);
        b.disabled = true;
        b.innerHTML = `<span class="spinner"></span><span>Sealing keys…</span>`;
        try {
          await E2EE.transferApprove(request);
          c();
          toast('Keys sent to your new device ✅', 'success', 3000);
        } catch (e) {
          b.disabled = false;
          b.innerHTML = `${icons.shieldCheck}<span>Approve &amp; send keys</span>`;
          toast(e.message, 'error');
        }
      };
    },
  });
}

/** Inject the header lock chip (+ composer hint) when a chat flips to E2EE live. */
function ensureLockChip(chat) {
  if (!chat?.e2ee || chat.type !== 'dm') return;
  const anchor = $('#search-btn');
  if (anchor && !$('#lock-chip')) {
    const b = document.createElement('button');
    b.className = 'btn btn-icon lock-chip';
    b.id = 'lock-chip';
    b.title = 'End-to-end encrypted';
    b.innerHTML = icons.lock;
    b.onclick = () => showEncryptionInfo(chat);
    anchor.before(b);
  }
  const ta = $('#composer-input');
  if (ta) ta.placeholder = 'Message 🔒';
}

/** Lock-chip dialog: fingerprints of both parties for out-of-band verification. */
async function showEncryptionInfo(chat) {
  const peer = chatPeer(chat);
  const body = `<div class="empty-note"><span class="spinner"></span></div>`;
  let root;
  openModal(`
    <div class="modal-head"><div class="modal-title">${icons.lock} Encryption info</div></div>
    <p class="muted" style="line-height:1.55;margin-top:-4px">Messages in this chat are end-to-end encrypted:
      the server only ever sees ciphertext. Compare fingerprints in person or over a trusted channel to
      be certain nobody is in the middle.</p>
    <div id="e2ee-fp-body">${body}</div>`, {
    onMount(r) { root = r; },
  });
  try {
    const mine = await E2EE.myFingerprint();
    const theirs = peer ? await E2EE.fingerprintOf(peer.id) : null;
    $('#e2ee-fp-body', root).innerHTML = `
      <div class="fp-row"><span class="fp-who">You</span><code class="fp-code">${esc(mine || '—')}</code></div>
      <div class="fp-row"><span class="fp-who">${esc(peer ? peer.displayName : 'Peer')}</span><code class="fp-code">${esc(theirs || 'no identity yet')}</code></div>
      <div class="small faint mt-3">Fingerprints identify the <i>identity keys</i>, not individual devices — they are
        the same on every device where the account is set up.</div>`;
  } catch { $('#e2ee-fp-body', root).innerHTML = '<div class="empty-note">Could not load fingerprints</div>'; }
}

/** Settings → Encryption card (status + fingerprint + transfer/reset actions). */
function e2eeCardHtml() {
  const st = S.user?.e2ee ?? (E2EE.isReady() ? 'ready' : 'locked');
  const pill = st === 'ready' ? '<span class="pill ok">active</span>' : st === 'locked' ? '<span class="pill warn">locked here</span>' : '<span class="pill warn">off</span>';
  return `
    <div class="card" id="e2ee-card">
      <h3>End-to-end encryption ${pill}</h3>
      <div class="small faint mb-3">Direct chats are encrypted on your devices; the server stores only ciphertext.</div>
      <div id="e2ee-card-fp" class="small mb-3"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${st === 'locked' ? `<button class="btn btn-sm btn-primary" id="e2ee-card-setup">${icons.lock}<span>Set up this device</span></button>` : ''}
        <button class="btn btn-sm btn-ghost" id="e2ee-card-requests">${icons.key}<span>Device requests</span></button>
        <button class="btn btn-sm btn-ghost danger-text" id="e2ee-card-reset">${icons.trash}<span>Reset identity</span></button>
      </div>
    </div>`;
}

function bindE2EECard(root) {
  const fpEl = $('#e2ee-card-fp', root);
  if (fpEl) {
    E2EE.myFingerprint().then((fp) => {
      fpEl.innerHTML = fp ? `Your fingerprint: <code class="fp-code">${esc(fp)}</code>` : '';
    }).catch(() => {});
  }
  $('#e2ee-card-setup', root)?.addEventListener('click', showE2EESetup);
  $('#e2ee-card-requests', root)?.addEventListener('click', openDeviceRequestsModal);
  $('#e2ee-card-reset', root)?.addEventListener('click', async () => {
    const sure = await confirmModal({
      title: 'Reset encryption identity?',
      body: 'All devices using this account will need to set up again. Old messages stay readable on devices that already decrypted them, but new keys will be issued everywhere.',
      confirmText: 'Reset identity', danger: true,
    });
    if (!sure) return;
    try {
      await api('/api/e2ee/identity', { method: 'DELETE' });
      await E2EE.rekeyIdentity();
      toast('Identity reset — keys were re-generated on this device', 'success', 4000);
    } catch (e) { toast(e.message, 'error'); }
  });
}

/** List pending incoming key-transfer requests with approve/deny (manual entry point). */
async function openDeviceRequestsModal() {
  let transfers = [];
  try { transfers = (await E2EE.pendingTransfers()).transfers; } catch (e) { return toast(e.message, 'error'); }
  if (!transfers.length) {
    openModal(`
      <div class="modal-head"><div class="modal-title">${icons.key} Device requests</div></div>
      <div class="empty-note">No device is waiting for keys right now.<br/>Requests appear here automatically as push prompts too.</div>`);
    return;
  }
  const rows = await Promise.all(transfers.map(async (t) => `
    <div class="transfer-row" data-tid="${esc(t.id)}">
      <div class="grow"><div class="small faint">REQUESTED ${esc(new Date(t.createdAt).toLocaleTimeString())}</div>
      <div class="sas-code">${esc(await E2EE.core.sasCode(t.ephPub))}</div></div>
      <button class="btn btn-sm btn-ghost danger-text" data-deny="${esc(t.id)}">Deny</button>
      <button class="btn btn-sm btn-primary" data-ok="${esc(t.id)}">Approve</button>
    </div>`));
  openModal(`
    <div class="modal-head"><div class="modal-title">${icons.key} Device requests</div></div>
    <p class="muted small" style="line-height:1.5;margin-top:-4px">Approve only devices you recognize —
      always compare the code shown on the requesting device.</p>
    ${rows.join('')}`, {
    onMount(root, c) {
      root.addEventListener('click', async (e) => {
        const deny = e.target.closest('[data-deny]');
        const okB = e.target.closest('[data-ok]');
        try {
          if (deny) { await E2EE.transferDecline(deny.dataset.deny); deny.closest('.transfer-row').remove(); }
          if (okB) {
            okB.disabled = true;
            const t = transfers.find((x) => x.id === okB.dataset.ok);
            await E2EE.transferApprove(t);
            okB.closest('.transfer-row').remove();
            toast('Keys sent ✅', 'success');
          }
          if (!root.querySelector('.transfer-row')) c();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}
