#!/usr/bin/env node
/**
 * Generates a 16:9 YouTube thumbnail JPEG matching the site's own palette,
 * type, logo mark and a photo (see template.html) — for the video of a
 * Haven episode upload. Needs network access once per run, to pull
 * Unbounded/Space Grotesk from Google Fonts (same faces the site itself
 * loads).
 *
 * Usage:
 *   npm run youtube:thumb -- 004 --photo ~/Desktop/haven-004-photo.jpg
 *   npm run youtube:thumb -- 004 --photo path/to/your.jpg --position "center 20%" --label Haven --style solid --out ./thumb-004.jpg
 *
 * Same conventions as scripts/haven-art (see that script's own comment for
 * the reasoning):
 * `--photo` is any local .jpg/.png/.webp (not HEIC), placed plainly (cover +
 * a top fade, nothing else) — grade it by hand in Lightroom first, this
 * script applies no colour treatment of its own.
 * `--position` is a CSS `background-position` value (default `center 8%`).
 * `--style` is `solid` (default) or `outline` — solid is the safe default;
 * a thumbnail renders far smaller than even the Mixcloud artwork does, so a
 * thin stroke is even more likely to disappear.
 * Everything else — logo, label, numeral, wordmark/strapline, colours — is
 * fixed regardless of `--photo`.
 */
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function parseArgs(argv) {
  const [numberArg, ...rest] = argv;
  if (!numberArg || numberArg.startsWith('--')) {
    console.error(
      'Usage: npm run youtube:thumb -- <episode number> [--label "Haven"] [--style solid|outline] [--photo path] [--position "center 65%"] [--out path]',
    );
    process.exit(1);
  }

  const number = String(numberArg).padStart(3, '0');
  let label = 'Haven';
  let style = 'solid';
  let photo = path.join(REPO_ROOT, 'public', 'head-poster.jpg');
  let position = null;
  let out = null;

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--label') label = rest[++i];
    else if (rest[i] === '--style') style = rest[++i];
    else if (rest[i] === '--photo') photo = path.resolve(REPO_ROOT, rest[++i]);
    else if (rest[i] === '--position') position = rest[++i];
    else if (rest[i] === '--out') out = rest[++i];
  }

  if (style !== 'solid' && style !== 'outline') {
    console.error(`--style must be "solid" or "outline", got "${style}"`);
    process.exit(1);
  }

  return { number, label, style, photo, position, out: out ?? path.join(__dirname, 'output', `thumb-${number}.jpg`) };
}

const { number, label, style, photo, position, out } = parseArgs(process.argv.slice(2));

const ext = path.extname(photo).toLowerCase();
const mime = MIME_TYPES[ext];
if (!mime) {
  console.error(`Unsupported photo type "${ext}" — use a .jpg, .png, or .webp (not HEIC; convert it first).`);
  process.exit(1);
}
const photoDataUri = `url(data:${mime};base64,${(await readFile(photo)).toString('base64')})`;

const template = await readFile(path.join(__dirname, 'template.html'), 'utf8');
let html = template
  .replaceAll('{{NUMBER}}', number)
  .replaceAll('{{LABEL}}', label)
  .replaceAll('{{STYLE}}', style)
  .replace('var(--photo-url)', photoDataUri);
if (position) {
  html = html.replace('background-position: center 8%;', `background-position: ${position};`);
}

await mkdir(path.dirname(out), { recursive: true });

// 1280x720 CSS viewport at 2x device scale — 2560x1440px output. YouTube's
// minimum required thumbnail size is 1280x720; this stays at the exact 16:9
// ratio just rendered crisper, the same over-resolve haven-art does for its
// artwork, and comfortably under YouTube's 2MB thumbnail file-size cap.
const WIDTH = 1280;
const HEIGHT = 720;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, type: 'jpeg', quality: 95 });
await browser.close();

console.log(`Wrote ${out} (${WIDTH * 2}x${HEIGHT * 2}px, style: ${style})`);
