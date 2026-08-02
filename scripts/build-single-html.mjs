/* Build the whole web client into ONE standalone HTML file:
   dist/efadro-client.html — CSS, the full JS bundle (app + e2ee + emoji) and
   the logo are inlined; nothing except the optional emoji-image CDN and the
   efadro server you connect to is fetched from the network.

   Usage:  npm run build          (esbuild is a devDependency)

   The file works from file:// or any static host. Open it, enter your efadro
   server address (e.g. http://localhost:3000 or https://chat.example.com) and
   the normal join flow follows. For E2EE the page needs a secure context —
   file://, localhost or https are fine; plain http on a LAN IP is not. */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'efadro-client.html');

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/* ---- 1. logo → data URI (used for favicon, splash img and the CSS tile) ---- */
const logoSvg = fs.readFileSync(path.join(PUB, 'img', 'logo.svg'));
const logoUri = `data:image/svg+xml;base64,${logoSvg.toString('base64')}`;

/* ---- 2. CSS — inline and point the .logo-slot background at the data URI ---- */
let css = fs.readFileSync(path.join(PUB, 'css', 'style.css'), 'utf8');
css = css.replace(/\/img\/logo\.svg\?v=[\w.-]+/g, logoUri).replace(/\/img\/logo\.svg/g, logoUri);
if (css.includes('</style')) throw new Error('style.css unexpectedly contains "</style"');
if (/url\(\s*['"]?\//.test(css)) throw new Error('style.css still references an absolute asset — inline it first');

/* ---- 3. JS bundle — app.js + its local imports, cache-bust queries stripped ---- */
const stripVersionQuery = {
  name: 'strip-version-query',
  setup(build) {
    build.onResolve({ filter: /\?v=/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.split('?')[0]),
    }));
  },
};
const bundled = await esbuild.build({
  entryPoints: [path.join(PUB, 'js', 'app.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [stripVersionQuery],
});
let js = bundled.outputFiles[0].text;
// "</script>" inside the inline script would end the element early — escape it
// (safe in strings, template literals and regexes alike: \/ ≡ /).
js = js.replace(/<\/script/gi, '<\\/script');

/* ---- 4. HTML shell — everything external replaced with inline content ---- */
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
// NOTE: replacement functions (not strings) — the minified JS may contain `$&`
// or `` $` `` sequences that String.replace would otherwise interpret specially.
html = html
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/svg+xml" href="${logoUri}" />`)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/\/img\/logo\.svg\?v=[\w.-]+/g, () => logoUri)
  .replace(/<script type="module" src="[^"]*"><\/script>/,
    () => `<script>window.__EFADRO_SINGLE_FILE__ = true;</script>\n<script>\n${js}\n</script>`);
html = html.replace('<meta name="description"',
  `<meta name="efadro-build" content="single-file v${version}" />\n  <meta name="description"`);

/* ---- 5. sanity: no absolute-path asset references may survive ---- */
const leftovers = html.match(/(?:src|href)="\/[^"]*"|url\(\s*['"]?\//g);
if (leftovers) {
  throw new Error(`absolute asset reference(s) left in the output: ${[...new Set(leftovers)].join(', ')}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`[build] ${path.relative(ROOT, OUT)} written — ${kb} KB (efadro v${version}, css ${(css.length / 1024).toFixed(0)} KB + js ${(js.length / 1024).toFixed(0)} KB inlined)`);
console.log('[build] open it anywhere (double-click or any static host) and enter your efadro server address to connect');
