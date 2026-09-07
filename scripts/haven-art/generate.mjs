#!/usr/bin/env node
/**
 * Generates a 1:1 Haven mix-artwork JPEG matching the site's own palette,
 * type, logo mark and a faded crop of a real photo (see template.html) —
 * for uploading to Mixcloud when a new episode goes up. Needs network access
 * once per run, to pull Unbounded/Space Grotesk from Google Fonts (same
 * faces the site itself loads).
 *
 * Usage:
 *   npm run haven:art -- 004 --photo ~/Desktop/haven-004-photo.jpg
 *   npm run haven:art -- 004 --photo path/to/your.jpg --position "center 20%" --label Haven --style solid --out ./haven-004.jpg
 *
 * `--photo` is any local .jpg/.png/.webp (not HEIC — convert it first),
 * absolute or relative to the repo root — drop in whatever photo you want
 * for that episode, no per-photo setup needed. It's placed plainly (cover +
 * a top fade, nothing else — see template.html): grading (grayscale,
 * contrast, the cyan/magenta split tone, vignette) is done by hand in
 * Lightroom before the file ever reaches this script, not applied here, so
 * export already-graded JPEGs/PNGs.
 * `--position` is a CSS `background-position` value (default `center 8%`,
 * i.e. anchored toward the top of the source) for reframing a photo where
 * the default crop doesn't land on the right spot.
 * `--style` is `solid` (default) or `outline` — see the comment on
 * `.numeral.outline` in template.html for why solid is the safer default.
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
      'Usage: npm run haven:art -- <episode number> [--label "Haven"] [--style solid|outline] [--photo path] [--position "center 65%"] [--out path]',
    );
    process.exit(1);
  }

  const number = String(numberArg).padStart(3, '0');
  let label = 'Haven';
  let style = 'solid';
  let photo = path.join(REPO_ROOT, 'src', 'assets', 'photos', 'gallery-01.jpg');
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

  return { number, label, style, photo, position, out: out ?? path.join(__dirname, 'output', `haven-${number}.jpg`) };
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

// 1400px CSS viewport at 2x device scale — 2800x2800px output, well past
// Mixcloud's recommended minimum (1000x1000) with room to spare.
const SIZE = 1400;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, type: 'jpeg', quality: 95 });
await browser.close();

console.log(`Wrote ${out} (${SIZE * 2}x${SIZE * 2}px, style: ${style})`);
