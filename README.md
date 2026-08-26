![efadro](https://img.shields.io/badge/efadro-self--hosted%20messenger-6366f1)

# Efadro

!!!WARNING!!! Efadro is still in development and in alpha testing!

EFADRO BETA TEST STARTS AUG 20

## ✨ Features

**Join flow (exactly as designed)**
1. User enters the **server URL**
2. Completes the **Cloudflare Turnstile captcha** *(only if enabled on the server)*
3. Enters the **server password** *(step is skipped when it’s empty in config)*
4. **Signs in / creates an account**
5. Lands in the **chat**

**Messaging**
- Direct messages + “Saved Messages” self-chat
- Group chats: create, rename, add/remove members, leave
- Real-time messages over WebSocket (with REST fallback), edit & delete
- Typing indicators, online presence, unread badges
- Read receipts (✓ Sent / ✓✓ Seen in DMs)
- **File sending**: paperclip picker, drag & drop onto the chat, clipboard paste — with upload progress. Images, video & audio embed inline; everything else becomes a clean download card (access-controlled downloads, inline-safe types only)
- **Telegram-style emoji**: big categorized panel with search & “Frequently used”, and emoji inside messages are rendered as Apple-style images (the Telegram look), including jumbo emoji-only messages
- **Reactions**: quick-react strip (👍❤️😂🔥😮😢) + full emoji picker, live per-viewer chips (toggle on/off, max 3 kinds per user), synced over WebSocket
- **Reply-to**: quote banner in the composer, in-bubble quote with author + snippet, click a quote to jump & highlight the original (works with deleted originals too)
- **Forwards**: forward any message (text *or* file) to any of your chats with a “Forwarded from …” label — attachments are re-linked without extra disk usage
- **Voice messages**: one-click mic recording with a live level meter + timer, discard/send controls, voice bubbles with duration (`audio/webm`, falls back to `m4a`/`ogg`)
- **Pinned messages**: bar under the chat header, jump-to-message on click, unpin from the bar. In DMs either member can pin; in groups the creator & staff
- **User profiles**: click any name/avatar → profile card with photo, role, online status & member-since date; “Message” shortcut; staff get a moderation shortcut
- **Custom avatars**: upload a profile photo from Settings (auto center-crop to 512×512), shown in chats, messages, member lists & profiles; synced live to everyone
- **Text formatting**: `**bold**`, `__italic__`, `~~strikethrough~~`, `` `inline code` ``, ```` ```code blocks``` ```` and `||spoilers||` (click to reveal) — Telegram-style, single-pass and injection-safe
- **@mentions**: `@username` is highlighted for everyone and glows for the mentioned member
- **In-chat search**: magnifier in the chat header → full-text search with result counter, jump between matches and auto-loading of older history until the match is on screen
- **“New messages” divider**: opening a chat with unread messages lands on a divider above the first unread instead of the bottom
- **Desktop notifications**: optional (Settings toggle, permission-aware) — fires when the tab is in the background, one self-replacing notification per chat, click to jump straight into the chat
- **Per-chat drafts**: unfinished messages survive switching chats and full reloads; cleared when sent
- **System messages**: group events (create / rename / member added, removed or left) are recorded as centered system rows, visible to everyone and excluded from search
- **`:emoji:` shortcodes**: type `:fir` + Enter/Tab → `:fire:` autocompletes from a suggestion popover (also feeds “Frequently used”)
- **Delete / leave direct chats**: chat drawer → “Delete chat” removes it from your list only (the other side keeps their copy; writing again re-opens the same history); Saved Messages can be wiped permanently
- **Ctrl+K quick switcher**: fuzzy jump dialog over all chats with full keyboard navigation
- **Global message search**: typing 2+ characters in the sidebar search also scans *message contents* across all your chats (membership-scoped on the server) with highlighted `<mark>` snippets — click a hit to jump straight to the message
- **Formatting toolbar**: B / I / S / code / pre / spoiler buttons above the composer wrap the current selection (selection-preserving), plus **Ctrl+B / Ctrl+I / Ctrl+E** shortcuts
- **Pin / mute / archive chats**: right-click (or long-press) any chat → context menu; pinned chats float to the top, muted chats dim their unread badge (mentions still break through), archived chats fold into a collapsible “Archived” section. All three are per-user and synced live
- **Unread @mention badges**: a blue `@N` pill on the chat row counts unread mentions of *you*; a floating **@** button inside the chat jumps to the first one, and reading the chat clears it (group chats only — DMs don’t badge)
- **Polls**: paperclip → “Create poll” (question + 2–10 options), vote/change/retract with animated live tallies pushed over WebSocket to every member, viewer-scoped “my vote” markers
- **Group invite links**: group creator & staff can create / copy / rotate / revoke an invite link from the members drawer; opening it (even logged out — it survives registration) joins the group instantly with a system message. Rotating or revoking kills old links immediately
- **Sending state**: outgoing bubbles show an optimistic “sending…” clock and flip to the real timestamp on server confirm; failures mark the bubble and clicking it restores the text to the composer
- **Voice & video calls (1:1)**: 📞/📹 buttons in any DM header — real WebRTC calls (peer-to-peer, encrypted with DTLS-SRTP; media never passes through the server). Full in-app call UI: outgoing/incoming ringing with tones, live timer, **mute microphone**, **toggle camera** (video calls), remote full-view + mirrored local PiP, hang up. Missed/declined/cancelled/completed calls drop a log row into the chat (e.g. `📞 Voice call · 04:12`, `📞 Missed call`), busy detection, ring timeout, calls survive neither party going offline (server ends them cleanly), and they work from the single-file client too. STUN is preconfigured; add your own TURN server in `config.json → calls.iceServers` for strict NATs
- Link previews-in-text, image URL embedding
- Message reporting → lands in the moderators’ queue
- Sounds, desktop-style toasts, unread counter in the page title

**End-to-end encryption (v1.5.0)**
- **DMs encrypt themselves**: once both members of a direct chat hold encryption keys, the chat upgrades to E2EE on the first send — a 🔒 chip appears in the header, the composer placeholder switches to “Message 🔒” and a centered system row records the moment
- **Real crypto, not a flag**: per-chat random **AES-GCM-256** keys, wrapped per member with **ECDH P-256 → HKDF-SHA256**, every envelope **ECDSA P-256 signed and verified on the server** (a malicious/non-key-holding client can’t inject forged ciphertext); private keys live in the browser’s IndexedDB and never leave the device unsealed
- **Encrypted attachments**: in encrypted chats the file bytes *and* the caption are encrypted before upload; recipients decrypt in-browser to blob URLs (server sees ciphertext + sizes only)
- **New-device key transfer**: a fresh browser shows an “Encrypted chats are locked on this device” banner → *Set up* → sends a key request; every already-set-up device gets a live prompt, both sides display the same **safety code** (`XXXX-XXXX-XXXX-XXXX`) to compare out-of-band, and on approval the identity keys + all chat keys fly over **sealed with an ephemeral ECDH handshake** — the server only ferries ciphertext it can’t read (requests expire after 10 minutes, one pending request at a time, deny supported)
- **Fingerprint check**: the 🔒 chip in any encrypted chat opens “Encryption info” with your and your peer’s fingerprints to compare in person (TOFU, Signal-style)
- **Reset & re-key**: Settings → *Reset identity* wipes your published key; peers automatically issue a fresh chat key (new epoch) on their next send, while old messages stay readable for whoever already had the keys
- **Honest trade-offs** (v1.5.0, by design): group chats remain plaintext; server-side global search & @mention detection skip encrypted content (in-chat search still works locally); forwarding out of encrypted chats is disabled; the server still sees metadata (who talks to whom, when, sizes)

**Security extras**
- **Two-factor authentication (TOTP)**: QR-code setup with any authenticator app (Google Authenticator, Aegis, 1Password…), 8 one-time backup codes, regenerate/disable flows — login becomes a two-step process with a short-lived pending token
- **Blocking users — undetectable by design (v1.7.0, stealth since v1.8.0)**: block anyone from their profile card, the DM drawer or a message — a red “You blocked @user” banner takes over the composer with a one-tap *Unblock*, and Settings → **Privacy** lists everyone you’ve blocked. To the blocked person **nothing changes, on purpose**: their messages are accepted and stored as *ghost* messages that only they ever see (delivered with a normal 201 + WS echo, visible in their own history and chat preview) but are permanently invisible to you — never fanned out, never in your unread count, chat preview, history or search, and they stay invisible even after you unblock. Their calls ring out and log a “Missed call” *on their side only*; the chat re-opens, user search, profiles and presence all behave exactly as before; typing indicators and read receipts simply go quiet (indistinguishable from being ignored). The only side that ever sees an error is *you* (privately: “You blocked this user — unblock them to chat”), so blocking is impossible to confirm from the blocked side. Shared group chats are unaffected, unblocking is instant, and ghost messages can still be edited/deleted/reacted to by their author — every transport (REST, WebSocket, file & voice uploads, polls, forwards, E2EE) is covered server-side. Honest trade-offs: the blocker’s own presence/last-seen stays visible (hiding it would itself be a tell), and if a blocked person upgrades a never-encrypted DM to E2EE the 🔒 chip may appear on the blocker’s side after a reload

**Roles & moderation (server-enforced hierarchy)**
| Role | Level | Powers |
|---|---|---|
| 👑 **Owner** | full control | everything + manage any role, edit server settings from the panel (writes `config.json`), rotate JWT secret |
| 🛡 **Admin** | medium | ban/unban, mute, kick, promote users ↔ moderator, audit log, resolve reports |
| 🔨 **Moderator** | low | mute/unmute, kick (force sign-out), delete messages of regular users, reports queue |
| 👤 **User** | none | normal chat |

Staff panel tabs: **Users** · **Reports** · **Audit log** · **Server settings** (owner only) — with live stats (online, users, chats, messages, bans).

**Misc**
- **Modrinth-inspired UI** (v1.9): brand green `#1bd96a`, flat dark/light themes, pill buttons, underline tabs — plus animated aurora accents & spring-motion micro-animations throughout
- Real `efadro` logo image — a styled transparent lowercase “e” (`public/img/logo.svg`, vector, no background tile) — favicon, join screen, sidebar & staff panel
- Sane caching: HTML served `no-cache`, JS/CSS/images version-busted (`?v=`) with long `max-age`, so updates always reach clients
- Fully responsive (mobile layout with collapsible sidebar)
- Recent-servers list + per-server sessions on the client
- The owner can change server name, server password, registration toggle and Turnstile keys **live from the UI** — they’re persisted back into `config.json`

---

## 🚀 Quick start

```bash
cd efadro
npm install
npm start
```

Then open **http://localhost:3000** — the web client is served by the same process.

> **SQLite driver:** efadro prefers the native [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
> package (listed as an *optional* dependency). If it can't be installed or built on your machine,
> the server automatically falls back to the built-in `node:sqlite` driver (**Node.js ≥ 22.5**).
> No configuration needed — the same SQLite file format is used either way.
> (Node 18–22.4 requires a working `better-sqlite3` build.)

All run/build commands:

| Command | What it does |
|---|---|
| `npm start` | full server: built-in web client + REST API + WebSocket |
| `npm run start:server` | **server-only**: REST API + WebSocket, no built-in web client |
| `npm run build` | **bundle the whole frontend into one file**: `dist/efadro-client.html` |
| `npm run dev` | like `npm start`, with auto-restart on server file changes |
| `npm test` | boot an isolated server and run the end-to-end API suite |

On first start:
- `config.json` is created (a random `jwtSecret` is generated automatically)
- the **owner account** is created from `config.json` → default **`owner` / `efadro-owner`** — change it!
- the database goes to `./data/efadro.db`

> Sign in as `owner`, open the shield (**Staff panel**) → **Server** tab to set a server password, Turnstile keys, or close registration — no restart needed.

### Updating

Replace the old folder with the new release (keep your `config.json` and `data/`), run `npm ci`, **restart the server process**, then hard-refresh the browser (**Ctrl+Shift+R**).
The sign-in screen and Settings show `client vX · server vY` — if they differ, you're running a stale mix and new features (like the call buttons) will be missing.

---

## ⚙️ `config.json` reference

```jsonc
{
  "serverName": "Efadro Server",     // shown in the UI
  "host": "0.0.0.0",                 // bind address
  "port": 3000,                      // HTTP port
  "serverPassword": "",              // join gate password; empty = no password step
  "jwtSecret": "…",                  // HMAC secret for tokens (auto-generated, keep private!)
  "tokenExpiryDays": 7,              // session lifetime

  "owner": {
    "username": "owner",             // bootstrap owner account
    "password": "efadro-owner",      // change this!
    "forceReset": false              // true → re-apply the password above on every boot
  },

  "turnstile": {
    "enabled": false,                // master switch
    "siteKey": "",                   // Cloudflare Turnstile site key (public)
    "secretKey": ""                  // Cloudflare Turnstile secret key (private)
  },

  "registration": { "enabled": true },

  "client": { "serve": true },            // false → server-only mode (no built-in web app)

  "calls": {
    "enabled": true,                      // master switch for 1:1 calls
    "ringTimeoutSec": 45,                 // unanswered rings expire after this (5–120 s)
    "iceServers": [                       // handed to WebRTC clients (auth required)
      { "urls": ["stun:stun.l.google.com:19302"] }
      // for strict NATs add your coturn:
      // { "urls": ["turn:turn.example.com:3478"], "username": "efadro", "credential": "secret" }
    ]
  },

  "uploads": { "maxFileSizeMb": 25 },   // max size of one file attachment

  "limits": {
    "maxMessageLength": 4000,
    "maxGroupNameLength": 64,
    "maxDisplayNameLength": 40,
    "maxGroupSize": 100
  },

  "rateLimit": {
    "enabled": true,
    "windowMs": 60000,
    "authPerMinute": 20,             // gate/login/signup attempts per IP
    "messagePerMinute": 120,         // messages per user
    "apiPerMinute": 600
  },

  "corsOrigins": ["*"]               // API CORS; restrict to your frontend origin if you like
}
```

Notes:
- Only changed keys need to be present — missing keys fall back to defaults and are filled in on boot.
- **Recovering access:** delete `data/` to start fresh, or set `owner.forceReset: true` with a new `owner.password` and restart.
- Environment overrides: `EFADRO_CONFIG=/path/config.json`, `EFADRO_DATA=/path/data-dir`, `EFADRO_TRUST_PROXY=1` (when behind nginx/Cloudflare, so rate limits use real IPs).

### Cloudflare Turnstile setup

1. Cloudflare dashboard → **Turnstile** → *Add site* → get your **site key** + **secret key**.
2. Put them in `config.json` under `turnstile` (or paste them in **Staff panel → Server** and flip the switch).
3. The captcha step now appears during the join flow.

For local development you can use Cloudflare’s always-pass test keys:
`siteKey: 1x00000000000000000000AA`, `secretKey: 1x0000000000000000000000000000000AA`.

---

## 🧩 Server-only mode & the single-file client

**Run just the backend.** Any of these switches it on:

```bash
npm run start:server                  # = node server/index.js --server-only
EFADRO_NO_CLIENT=1 node server/index.js
# or permanently:  "client": { "serve": false }  in config.json
```

In server-only mode the built-in web app is not mounted at all: `GET /` answers a small JSON landing page (`{ product: "efadro", version, mode: "server", hint }`), any other non-API path returns a JSON 404, and everything under `/api/*` plus the `/ws` WebSocket works exactly as before. The boot banner prints the active mode. Use it when the client is hosted separately (below), or when efadro runs as a headless chat backend for your own client. CORS is open by default so a client on any origin can connect — restrict it with `corsOrigins` if you don’t want that.

**Build the whole frontend into one HTML file.**

```bash
npm run build        # uses esbuild (devDependency)
```

→ **`dist/efadro-client.html`** (~263 KB): the stylesheet, the complete JS bundle
(chat app + E2EE + emoji) and the logo are inlined; after that single download
the only network requests are to the efadro server you choose (and the emoji
image CDN). Open it by double-clicking (`file://`) or host it on **any** static
server — GitHub Pages, nginx, S3, a USB stick — then enter your server’s address
in the first screen (`http://localhost:3000` is pre-filled) and the usual join
flow follows.

Notes:
- Sessions (tokens) live in the localStorage of whichever origin hosts the file — each hosting origin keeps its own recent-servers list.
- **E2EE needs a secure context** for WebCrypto: `file://`, `localhost`/`127.0.0.1` and `https://` are fine; plain `http://` on a LAN IP is not (messaging still works, encryption just can’t initialize there).
- The two modes compose: run the backend with `npm run start:server` on a VPS and give everyone the single-file client — nothing else to deploy.

---

## 📞 Calls (v1.6.0)

**How they work.** Calls are 1:1 WebRTC sessions: the two browsers negotiate directly via the `/ws` hub (invite/accept/decline/cancel/end + SDP/ICE relay), then media flows **peer-to-peer** — the server never sees or touches it. Media is encrypted end-to-end by WebRTC itself (DTLS-SRTP), independent of the E2EE layer used for messages. Chat history gets honest log rows: `📞 Voice call · 03:41`, `📹 Video call · …`, `📞 Missed call` / `Declined call`.

**Call UI.** 📞 voice / 📹 video buttons live in **every** chat header (accent-colored) — DMs start a call right away; groups, Saved Messages, insecure (plain-HTTP) contexts, and servers with calls disabled show a short explanation of why that chat isn't callable. The callee rings on **all** their devices — answering on one stops the rest. A caller whose peer is busy gets an instant busy signal; unanswered rings expire (`calls.ringTimeoutSec`) and log a missed call.

**NAT traversal.** The default config uses Google's public STUN. For servers behind symmetric NATs/firewalls you need a TURN relay — run [coturn](https://github.com/coturn/coturn) and put it in `config.json`:

```jsonc
"calls": {
  "enabled": true,
  "iceServers": [
    { "urls": ["stun:turn.example.com:3478"] },
    { "urls": ["turn:turn.example.com:3478"], "username": "efadro", "credential": "long-secret" }
  ]
}
```

ICE servers are only handed to **authenticated** users (`GET /api/calls/config`).

**Notes.** Requires microphone/camera permission and a secure context (`https`, `localhost`, or `file://` — same rule as E2EE). Group calls are not in this version (DMs only). Turning calls off (`"calls": { "enabled": false }`) hides the buttons and rejects invites server-side with a clear message.

---

## 🔐 Security

- Passwords hashed with **bcrypt** (cost 12)
- **TOTP 2FA** (RFC 6238): secrets per-user, 5-minute pending tokens for the second step, single-use SHA-256-hashed backup codes, disabling 2FA requires password **and** a current code
- File downloads require membership of the chat and are served with `nosniff`, inline only for safe media types (random on-disk names, never user paths)
- **JWT** sessions bound to a per-user token version — bans, kicks, password changes and secret rotation invalidate sessions instantly (connected sockets are dropped live)
- Join **gate tokens** (10 min TTL) are required before login/signup, so login brute-force can’t even start without captcha + server password
- Server-side **Turnstile verification** (siteverify API, with timeout)
- **Role hierarchy enforced on the server** for every moderation action; the bootstrap owner (from `config.json`) cannot be banned/demoted via the API
- Rate limiting on auth, messages and API; timing-safe server-password comparison
- Strict **CSP/security headers** (helmet) with Turnstile domains allow-listed
- All user content is HTML-escaped on render; links get `rel="noopener noreferrer"`; only `http(s)` URLs are linkified
- SQLite with parameterized queries everywhere; foreign keys + cascading deletes
- Secrets are never exposed via the API (masked in the owner panel), `config.json` written with `0600` permissions, atomic writes
- **E2EE (DMs)**: private identity keys (ECDH/ECDSA P-256) are generated and kept in the client’s IndexedDB — the server only ever sees public keys and **ciphertext**; message envelopes are **ECDSA-signed and verified server-side**, key epochs can only move forward, and key wraps must cover every member of the chat
- **Key transfer is encrypted end-to-end too**: the new device’s private keys never touch the server — the bundle is sealed with an ephemeral ECDH handshake + HKDF and compared via an out-of-band safety code; pending requests expire in 10 minutes and are rate-limited
- **Calls**: media is peer-to-peer encrypted (DTLS-SRTP) — the server only relays SDP/ICE signaling between the two parties; ICE/TURN credentials are served to authenticated users only, one active call per user is enforced server-side, and unanswered rings expire

**Recommendation:** put the server behind HTTPS (nginx/Caddy/reverse proxy or Cloudflare) — the client automatically upgrades to `wss://`. Web tokens are stored in `localStorage` of the client origin.

---

## 🔒 End-to-end encryption & multi-device (v1.5.0)

**Identity.** Every account gets an on-device identity: **ECDH P-256** (key agreement) + **ECDSA P-256** (signing). The public halves are published to the server; the private halves live in the browser’s IndexedDB (`efadro-e2ee`) and never leave the device unsealed.

**Chat keys.** When both members of a DM have published identity keys, the first sender generates a random **AES-GCM-256** chat key and wraps it independently for each member: `wrap = AES-GCM(chatKey, HKDF(ECDH(myPriv, peerPub), salt = efadro|sortedUserIds|chatId|epoch, info = efadro-wrap:v1))`. Wraps are stored server-side per member + epoch — readable by the server, useless to it.

**Messages & files.** Plaintext is AES-GCM encrypted with AAD `m:{chatId}:{epoch}` (files use `f:{chatId}:{epoch}`; captions get their own envelope). Each envelope carries an **ECDSA signature** over `efadro-msg:v1\n…` which the **server verifies** — ciphertext from a client that doesn’t hold the identity is rejected, and the server stores only `{enc:1, kid, iv, ct, sig}`. Decryption happens at render time in the client; undecryptable rows show an honest 🔒 placeholder instead of garbage.

**Epochs & reset.** Deleting your identity drops all your key wraps. The next time a peer sends you a message and finds your wrap missing, they mint a **new epoch** with a **fresh chat key** covering everyone — old epochs stay readable for devices that already hold them.

**Device-to-device transfer.**

1. **New device**: banner “Encrypted chats are locked on this device” → *Set up* (or Settings → Encryption → *Set up this device*). It generates an ephemeral ECDH P-256 key and shows a **safety code** derived from `sha256(ephemeralPub)` as `XXXX-XXXX-XXXX-XXXX`, then waits.
2. **Old device(s)**: get a live push prompt (and Settings → *Device requests* lists it) showing the **same safety code** — compare them over a call or in person, then *Approve & send keys* (or *Deny*).
3. The bundle (identity private keys + every DM chat key) is sealed with `HKDF(ECDH(oldPriv, ephemeralPub), info = efadro-device:v1)` and sent **through** the server — the server stores/ferries only ciphertext (`key_transfers` rows expire after 10 minutes; one pending request per user).
4. The new device unseals the bundle into its IndexedDB and history unlocks instantly; on approval the new device publishes its public identity so peers start wrapping epochs for it.

**What the server can and cannot see.** Can: metadata (who talks to whom, when, how big), plaintext of group chats, anything users report. Cannot: contents and attachments of encrypted DMs, private identity keys, transferred key material. If **every** device of yours loses its keys and you reset, your old encrypted history is gone for you (peers keep their own readable copy) — that’s the point of E2EE.

---

## 🗂 Project structure

```
efadro/
├── config.json            # ← all server settings live here
├── package.json
├── server/
│   ├── index.js           # entry: express + helmet + static + ws wiring
│   ├── config.js          # config loading/creation/atomic saving
│   ├── db.js              # SQLite schema (+ reactions, replies, pins, avatars,
│   │                      #   auto-migrations) + native→node:sqlite driver fallback
│   ├── sqlite-shim.js     # better-sqlite3-compatible adapter over node:sqlite
│   │                      #   polls, invite links, per-chat prefs, E2EE tables;
│   │                      #   auto-migrations)
│   ├── store.js           # data-access layer
│   ├── services.js        # shared chat logic + realtime fan-out (reactions, forwards,
│   │                      #   pins, polls, invites, mention counters, E2EE envelopes
│   │                      #   & signature verification, key epochs, transfers)
│   ├── auth.js            # JWT, gate tokens, auth middleware
│   ├── ws.js              # WebSocket hub (presence, typing, events, call signaling)
│   └── routes/
│       ├── public.js      # /api/info, /api/gate
│       ├── auth.js        # signup, login (+2FA), me, change-password
│       ├── chats.js       # chats + messages + reports + reactions/pin/forward,
│       │                  #   prefs/polls/invites/global search/mention jump
│       ├── e2ee.js        # identity publish/reset, wrapped chat keys, key transfers
│       ├── calls.js       # call capability flags + ICE server directory for clients
│       ├── invites.js     # join a group via an invite-link token
│       ├── files.js       # attachments, voice uploads, avatar upload/serve
│       ├── users.js       # user search + public profile cards
│       └── admin.js       # moderation: users/reports/audit/server config
├── public/
│   ├── index.html
│   ├── css/style.css      # Modrinth-inspired UI, dark/light themes
│   ├── img/logo.svg       # the efadro logo (styled transparent “e”, no background)
│   ├── js/e2ee-core.js    # isomorphic WebCrypto primitives (browser + Node ≥19)
│   ├── js/e2ee.js         # keystore (IndexedDB), chat-key epochs, encrypt/decrypt,
│   │                      #   encrypted files, device-transfer protocol
│   └── js/emoji.js        # Telegram-style emoji set (picker + image rendering)
│   └── js/app.js          # SPA: join flow, chat, staff panels, 2FA wizard, E2EE UX,
│                          #   WebRTC call engine (UI, signaling, ring tones)
└── scripts/
    ├── smoke.mjs          # 241 end-to-end API assertions: `npm test`
    ├── build-single-html.mjs  # `npm run build` → dist/efadro-client.html
    ├── ui-test.mjs        # optional browser screenshots (needs playwright)
    ├── ui-test-2.mjs      # optional: files & 2FA browser checks
    ├── ui-test-3.mjs      # optional: reactions/reply/pin/voice/profile/avatar checks
    ├── ui-test-4.mjs      # optional: formatting/drafts/shortcodes/switcher checks
    ├── ui-test-5.mjs      # optional: chat menu/mentions/global search/polls/invites
    ├── ui-test-6.mjs      # optional: E2EE & device-transfer browser checks
    ├── ui-test-7.mjs      # optional: server-only mode + single-file client checks
    ├── ui-test-8.mjs      # optional: real WebRTC calls in the browser (fake media)
    ├── flow-test.mjs      # optional full gate-flow test (needs playwright)
    └── gen_logo.py        # regenerates the logo SVGs from the bundled Poppins font
```

## 🧪 Testing

```bash
npm test            # boots an isolated server and runs 291 end-to-end assertions
```

The suite covers the gate flow, auth, DMs/groups, WebSocket events, the full
moderation hierarchy, reports/audit, live server-config changes, secret
rotation, file upload/download (access control, size limits), the complete
2FA lifecycle (setup, login step, backup codes, disable), reactions
(toggle/limits/live WS), replies & forwards (validation, file forwarding),
pinned messages (permissions, live updates), voice uploads (kind + duration),
avatars/profile cards (upload, access control, removal), in-chat & global
message search (validation, membership scoping), system messages (group
events, excluded from search), deleting direct chats (list removal, re-open
keeps history), per-chat prefs (pin/mute/archive, per-user isolation),
polls (create/vote/change/retract, live WS tallies, viewer scoping, forward
blocking), unread mention counters (bump, jump target, read reset), group
invite links (create/rotate/revoke, join, re-join no-op, dead-link checks),
E2EE (identity publish/directory/reset, auto-key DMs, signed envelope
accept/reject — including forged signatures and tampered ciphertext —, key
epoch rotation & full-member coverage, encrypted uploads, and the full
device-transfer lifecycle: request, safety code, approve/decline, sealed
payload unwrapping, one-pending & 10-minute-TTL rules), server-only mode
(JSON landing page, web client not mounted, gate/signup/messaging over REST)
and calls (config endpoint & auth, invite→ring→accept→SDP/ICE relay→hangup
with a duration row, decline/cancel flows, busy detection, disabled mode
rejection, ring-timeout expiry with a missed-call row), and user blocking
(stealth lifecycle: block/unblock, ghost sends accepted 201 yet invisible to
the blocker across REST and WS, untouched unread/preview, normal-looking
sender view, private blocker-only errors, ghost calls that ring out with a
caller-only missed-call row, search/profile indistinguishability, typing/
read-receipt suppression, ghost permanence after unblocking).

There are also interactive Playwright suites that drive the real UI in a
browser (used during development, not part of `npm test`):
`scripts/ui-test.mjs`, `ui-test-2.mjs`, `ui-test-3.mjs` (reactions, replies,
forwards, pins, voice, profiles, avatars), `scripts/ui-test-4.mjs`
(formatting, unread divider, drafts, search, shortcodes, mentions, system
messages, quick switcher, notification setting, chat deletion),
`scripts/ui-test-5.mjs` (chat context menu pin/mute/archive, mention badges &
jump-to-mention, global search, formatting toolbar & shortcuts, sending
state, polls end-to-end, invite links incl. join-by-link registration) and
`scripts/ui-test-6.mjs` (29 checks across three browser profiles: auto identity
setup, auto-keyed DMs with lock chip + 🔒 previews, server-blind REST
cross-checks, fingerprint modal, live encrypted edit, encrypted PNG
attachments in both directions, and a full new-device transfer — safety-code
match, approve, history unlock, and encrypted replies from the new device) and
`scripts/ui-test-7.mjs` (11 checks: `npm run build` output, server-only JSON
landing & 404s, and the single-file client driven from a *different* origin —
cross-origin connect, signup, E2EE identity auto-publish, and a DM round-trip
verified through the API) and `scripts/ui-test-8.mjs` (26 checks: two browser
profiles with fake media devices place a **real WebRTC call over loopback** —
button visibility in DMs & groups (with the 1:1-only explanation toast),
outgoing & incoming UI, accepted call with running
timers on both sides, remote audio track presence, mute on/off, hang-up with a
chat log row, decline logging, and a full video call with remote `videoWidth`
on both sides, PiP preview, camera toggle and the 📹 log row).

## 🌐 API overview

```
GET  /api/info                      public server info (what gates are required)
POST /api/gate                      captcha + server password → gate token (10 min)
POST /api/auth/signup|login         (requires gate token) → access token + user
GET|PATCH /api/auth/me              profile
POST /api/auth/change-password      (keeps current device, kills others)

GET  /api/chats                     my chats w/ unread, mentions, prefs + last message
POST /api/chats/dm                  open/find DM (userId = me → Saved Messages)
POST /api/chats/group               create group
GET|PATCH /api/chats/:id            payload / rename
POST|DELETE /api/chats/:id/members… add/remove members (DM: delete self = delete chat)
PATCH /api/chats/:id/prefs          per-user chat prefs {pinned, muted, archived}
GET  /api/chats/search/messages?q=  search message contents across all my chats
GET  /api/chats/:id/messages/search?q=   full-text search inside a chat (member-only)
GET  /api/chats/:id/mention-jump    id of my first unread @mention in this chat
GET|POST /api/chats/:id/messages    history (paginated via ?before=) / send (+ replyTo)
POST /api/chats/:id/polls           create a poll {question, options[2..10]}
POST /api/chats/:id/files           upload a file (multipart; kind=voice + duration for voice)
GET  /api/files/:id                 download (Bearer header or ?t= token, member-only)
POST /api/chats/:id/read            read receipts (also clears mention counter)
PATCH|DELETE /api/messages/:id      edit (author) / delete (author or staff)
POST /api/messages/:id/report       report to moderators
POST /api/messages/:id/reactions    toggle an emoji reaction (max 3 kinds/user)
POST /api/messages/:id/forward      copy the message into another chat {chatId}
POST /api/messages/:id/pin          pin/unpin {pin} — DM members; groups: creator/staff
POST /api/messages/:id/vote         vote {optionId} / change / retract {optionId:null}
GET|POST|DELETE /api/chats/:id/invite   read / create-or-rotate / revoke the group
                                    invite link (creator or staff)
POST /api/invites/:token/join       join a group via an invite-link token

GET  /api/users/search?q=           find users (hides people who blocked you)
GET  /api/users/:id/profile         public profile (+ my block state for them)
GET  /api/users/blocks              everyone I blocked (Settings → Privacy)
POST /api/users/:id/block           block (cuts the DM off in both directions)
DELETE /api/users/:id/block         unblock — messages and calls flow again

GET  /api/e2ee/identity/me          my published public identity bundle
GET  /api/e2ee/identity?ids=a,b,c   public identity directory (batch, ≤100)
PUT  /api/e2ee/identity             publish/rotate my public identity {dhPub, sigPub}
DELETE /api/e2ee/identity           reset my identity (drops all my key wraps)
GET  /api/e2ee/chats/:id/keys       my wrapped chat keys + member identity hashes
POST /api/e2ee/chats/:id/keys       register a new epoch {epoch, wraps:[{userId,wrap}]}
                                    (first epoch flips the DM into E2EE mode)
GET  /api/e2ee/transfers            pending key-transfer requests for my account
POST /api/e2ee/transfers            new device: announce {ephPub}, await approval
GET  /api/e2ee/transfers/:id        poll a request's status / sealed payload
POST /api/e2ee/transfers/:id/answer old device: approve {payload, piv} (sealed bundle)
POST /api/e2ee/transfers/:id/decline decline / abort a pending request

GET  /api/calls/config              call flags + my ICE servers (STUN/TURN)

GET  /api/users/:id/profile         public profile card + online status
POST|DELETE /api/avatars            set/remove my profile photo (image ≤ 5 MB)
GET  /api/avatars/:userId           profile photo (auth via header or ?t=)

POST /api/auth/login/2fa            second login step (TOTP or backup code)
POST /api/auth/2fa/setup            → TOTP secret + QR code
POST /api/auth/2fa/enable           confirm code → enables 2FA, returns backup codes
POST /api/auth/2fa/disable          password + code → disables 2FA
POST /api/auth/2fa/backup-codes     code → regenerate backup codes

GET  /api/users/search?q=           find users

GET  /api/admin/stats|users|reports|audit           moderator+ (audit: admin+)
POST /api/admin/users/:id/mute|unmute|kick           moderator+, hierarchy-checked
POST /api/admin/users/:id/ban|unban · PATCH …/role   admin+, hierarchy-checked
GET|PATCH /api/admin/server/config                   owner (persists config.json)
POST /api/admin/server/regenerate-secret             owner (signs everyone out)

WS   /ws?token=…                    frames: msg:send(+replyTo,+enc fields)/typing/
                                    read/ping → msg:new (+ system messages),
                                    msg:edited, msg:deleted, msg:reaction,
                                    msg:pinned, poll:update (tallies, viewer-
                                    scoped), chat:* (incl. chat:removed,
                                    chat:prefs, chat:e2ee), presence, typing,
                                    read, user:self, user:updated, user:e2ee,
                                    e2ee:transfer_request / _answer / _declined,
                                    server:updated, force_logout
WS call signaling (client → server): call:invite {chatId, video}, call:accept,
                                    call:decline, call:cancel, call:end
                                    {callId, reason?}, call:signal {callId, data}
                                    → server: call:ringing / call:ring /
                                    call:accepted / call:declined /
                                    call:cancelled / call:ended / call:busy /
                                    call:signal / call:error

Note: message content may include Telegram-style markup (**bold**, __italic__,
~~strike~~, ||spoiler||, `code`, ```pre```) — clients render it; the server
stores it verbatim (escaping happens at render time, never before storage).

Encrypted messages (in E2EE DMs) carry `enc:1` + `kid` (key epoch), `iv`,
base64 ciphertext as `content`, and a server-verified ECDSA signature `sig`;
the plaintext never crosses the wire. Encrypted attachments similarly carry
`enc`/`fiv` on the file record.

Deep link: `https://your.host/#invite=TOKEN` opens the client and joins the
group after sign-in/registration.
```

## License

MIT
