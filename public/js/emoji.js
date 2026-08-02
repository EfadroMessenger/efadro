/* ============================================================
   efadro — emoji module
   Telegram-style emoji: categorized picker data + replacement of
   emoji characters with Apple-style images (like Telegram uses),
   with graceful fallbacks (…-fe0f variant → stripped → native).
   ============================================================ */

const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64';

const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Candidate CDN file names for an emoji sequence (with/without -fe0f). */
export function emojiImgCandidates(seq) {
  const cps = [...seq].map((c) => c.codePointAt(0).toString(16));
  const withV = cps.join('-');
  const without = cps.filter((c) => c !== 'fe0f').join('-');
  if (withV === without) return [withV];
  // The Apple set is inconsistent about -fe0f, so try the likeliest first.
  return cps.includes('fe0f') ? [withV, without] : [without, withV];
}

/** <img> HTML for one emoji sequence; the delegated error handler swaps candidates. */
export function emojiImg(seq, cls = 'emoji') {
  const [a, b] = emojiImgCandidates(seq);
  return `<img class="${cls}" draggable="false" loading="lazy" data-e="${escAttr(seq)}" ` +
    `src="${CDN}/${a}.png"${b ? ` data-alt="${CDN}/${b}.png"` : ''} alt="${escAttr(seq)}" />`;
}

/** Matches emoji incl. ZWJ sequences, skin tones, flags, keycaps. */
const EMOJI_RE = /(\u{1F1E6}-\u{1F1FF}){2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}])?)*\uFE0F?/gu;

/** Replace emoji in already-HTML-escaped text with image tags (emoji are unaffected by escaping). */
export function renderEmojiText(escapedText) {
  return String(escapedText).replace(EMOJI_RE, (m) => emojiImg(m));
}

/** If the message is only emoji+whitespace (≤ 11), it renders jumbo-sized like Telegram. */
export function emojiOnly(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return false;
  const matches = trimmed.match(EMOJI_RE) || [];
  if (!matches.length || matches.length > 11) return false;
  const stripped = trimmed.replace(EMOJI_RE, '').trim();
  return stripped === '';
}

/* ------------------------- picker data ------------------------- */

const rows = (s) => s.trim().split(/\s+/);

export const EMOJI_CATEGORIES = [
  {
    id: 'smileys', name: 'Smileys', icon: '😀',
    emojis: rows(`😀 😁 😂 🤣 😃 😄 😅 😆 😉 😊 😋 😎 🥸 🤓 😍 😘 🥰 😗 😙 😚 ☺️ 🙂 🤗 🤩 🤔 🤨 😐 😑 😶 🫡 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😌 😛 😜 😝 🤤 😒 😓 😔 😕 🙃 🫠 🤑 😲 ☹️ 🙁 😖 😞 😟 😤 😢 😭 😦 😧 😨 😩 🤯 😬 😰 😱 🥵 🥶 😳 🤪 😵 😡 😠 🤬 😷 🤒 🤕 🤢 🤮 🥴 😇 🥳 🥺 🤠 🤡 🤥 🤫 🤭 🫢 🫣 🧐 🤷 🤷‍♂️ 🤷‍♀️ 🤦 🤦‍♂️ 🤦‍♀️ 🙍 🙍‍♂️ 🙍‍♀️ 🙎 🙎‍♂️ 🙎‍♀️ 💆 💆‍♂️ 💆‍♀️ 💁 💁‍♂️ 💁‍♀️`),
  },
  {
    id: 'people', name: 'People & Gestures', icon: '👋',
    emojis: rows(`👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 💪 🦾 🖊️ ✍️ 🤳 💅 🦶 🦵 🦿 🦴 👂 🦻 👃 🧠 🫀 🫁 🦷 👀 👁️ 👅 👄 💋 🩸 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 👶 🧍 🧍‍♂️ 🧍‍♀️ 🧎 🧎‍♂️ 🧎‍♀️ 🏃 🏃‍♂️ 🏃‍♀️ 🚶 🚶‍♂️ 🚶‍♀️ 🕺 💃 🕴️ 👯 🧖 🧖‍♂️ 🧗 🧗‍♂️ 🤺 🏌️ 🏌️‍♂️ 🏇 ⛷️ 🏂 🏋️ 🏋️‍♂️ 🤸 🤸‍♂️ ⛹️ ⛹️‍♂️ 🤾 🤾‍♂️ 🏊 🏊‍♂️ 🚣 🧘 🧘‍♂️`),
  },
  {
    id: 'nature', name: 'Animals & Nature', icon: '🐱',
    emojis: rows(`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🦔 🐾 🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🍃 🍂 🍁 🌾 🌺 🌻 🌹 🥀 🌷 🌼 🌸 💐 🍄 🌰 🌍 🌙 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ ⛄ 🌊 💧 💦 ☔`),
  },
  {
    id: 'food', name: 'Food & Drink', icon: '🍕',
    emojis: rows(`🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥛 🍼 ☕ 🫖 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊`),
  },
  {
    id: 'activity', name: 'Activity', icon: '⚽',
    emojis: rows(`⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🤹‍♂️ 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩`),
  },
  {
    id: 'travel', name: 'Travel & Places', icon: '🚀',
    emojis: rows(`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🪝 ⛽ 🚧 🚦 🚥 🚏 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🛖 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉 🌌 🎑 🌠`),
  },
  {
    id: 'objects', name: 'Objects', icon: '💡',
    emojis: rows(`⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 🗜️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 🪬 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🛀 🧼 🪥 🪒 🧽 🪣 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🪆 🖼️ 🪞 🪟 🛍️ 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 🪧 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓`),
  },
  {
    id: 'symbols', name: 'Symbols', icon: '❤️',
    emojis: rows(`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧️ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ 🟰 ♾️ 💲 💱 ™️ ©️ ®️ 👁️‍🗨️ 🔚 🔙 🔛 🔝 🔜 〰️ ➰ ➿ ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️`),
  },
];

/* Search index: keyword → emoji list (subset, fast lookups). */
export const SEARCH_INDEX = [
  ['smile happy grin', '😀 😃 😄 😁 😊 🙂'],
  ['laugh lol rofl haha', '😂 🤣 😆 😅'],
  ['love heart eyes adore crush', '😍 🥰 ❤️ 💕 💖 💘 💗 💓'],
  ['kiss', '😘 😗 😙 😚 💋'],
  ['wink', '😉'],
  ['cool sunglasses', '😎'],
  ['think hmm', '🤔 🧐 🤨'],
  ['cry sad tear', '😢 😭 🥺 😿'],
  ['angry mad rage', '😡 😠 🤬 👿'],
  ['sick ill', '😷 🤒 🤕 🤢 🤮'],
  ['sleep tired zzz', '😴 😪 🥱 💤'],
  ['party celebrate birthday', '🥳 🎉 🎊 🎂 🍾 🎈'],
  ['thumbs up yes agree like', '👍 ✔️ ✅'],
  ['thumbs down no disagree dislike', '👎 ❌'],
  ['ok okay fine', '👌 🆗'],
  ['clap applause bravo', '👏'],
  ['pray please thanks hope', '🙏'],
  ['muscle strong flex', '💪'],
  ['wave hello hi bye', '👋'],
  ['fire hot lit', '🔥 🥵'],
  ['star shine sparkle', '⭐ 🌟 ✨ 💫'],
  ['rainbow pride', '🌈 🏳️‍🌈'],
  ['sun sunny day', '☀️ 🌞'],
  ['moon night', '🌙 🌝 😴'],
  ['snow cold winter', '❄️ ⛄ ☃️'],
  ['pizza food', '🍕 🍔 🍟 🌮'],
  ['burger fastfood', '🍔 🍟 🌭'],
  ['coffee tea drink morning', '☕ 🍵 🫖'],
  ['beer drink cheers', '🍺 🍻 🥂 🍷'],
  ['cake dessert sweet', '🎂 🍰 🧁 🍩 🍪 🍫 🍬'],
  ['cat pet kitten', '🐱 🐈 😺 😸 😻'],
  ['dog pet puppy', '🐶 🐕 🦮'],
  ['unicorn magic', '🦄 ✨'],
  ['phone call mobile', '📱 📞 ☎️'],
  ['computer laptop code work', '💻 ⌨️ 🖥️'],
  ['game play gaming', '🎮 🎲 ♟️ 🎯'],
  ['music song note', '🎵 🎶 🎧 🎤 🎸'],
  ['gift present', '🎁 🎀'],
  ['money cash dollar rich', '💰 💵 💸 🤑 💳'],
  ['car drive', '🚗 🚕 🏎️'],
  ['plane fly travel', '✈️ 🛫 🛬'],
  ['rocket launch space', '🚀 🛸 🌌'],
  ['house home', '🏠 🏡'],
  ['lock secure private', '🔒 🔐 🔏 🗝️'],
  ['key password', '🔑 🗝️'],
  ['warning alert danger', '⚠️ 🚨 ❗ ‼️'],
  ['check done yes correct', '✅ ✔️ ☑️'],
  ['cross wrong no', '❌ ❎ ✖️'],
  ['question what', '❓ ❔ 🤔'],
  ['hundred hundred percent perfect', '💯'],
  ['eyes look see watching', '👀 👁️'],
  ['skull dead dying', '💀 ☠️ 🪦'],
  ['ghost spooky', '👻 🎃'],
  ['poop shit', '💩'],
  ['alien ufo', '👽 🛸'],
  ['robot bot', '🤖 🦾'],
  ['clown joker', '🤡 🎪'],
  ['broken heart', '💔 💔'],
  ['red heart', '❤️'],
  ['blue heart', '💙'],
  ['green heart', '💚'],
  ['purple heart', '💜'],
  ['black heart', '🖤'],
  ['white heart', '🤍'],
  ['flag', '🏁 🚩 🏳️ 🏴'],
  ['trophy win winner champion', '🏆 🥇 🏅'],
  ['medal award', '🏅 🎖️ 🥇'],
  ['ball soccer football', '⚽ 🏈 🏀 🎾 ⚾ 🏐'],
  ['new', '🆕 ✨ 🌟'],
  ['free', '🆓 🕊️ 💸'],
  ['zombie walking dead', '🧟'],
  ['brain smart think', '🧠 🤯'],
  ['middle finger rude', '🖕'],
  ['peace victory', '✌️ ☮️ 🕊️'],
  ['shush quiet secret', '🤫 🤐'],
  ['facepalm', '🤦 🤦‍♂️ 🤦‍♀️'],
  ['shrug dunno whatever', '🤷 🤷‍♂️ 🤷‍♀️'],
  ['salute respect', '🫡'],
  ['point you finger', '🫵 👉 👈 👆 👇 ☝️'],
];
