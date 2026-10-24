#!/usr/bin/env node
/**
 * 1 x 1 m banner for SC FIDOR Opava: follow on IG, play a Haven mix, vote
 * Fans' Favorite. Read from 5 m+, so three big steps and one QR (Instagram,
 * where the voting happens too).
 *
 *   output/thompson-banner-fidor.pdf   1060 x 1060 mm = 1000 mm trim + 30 mm bleed
 *   output/thompson-banner-fidor.png   preview (not for print)
 *
 * The photo is portrait.jpg (1836 x 2295), ~70 dpi at its 640 mm width: fine from 2 m+.
 *
 * Needs network: Google Fonts, qrcode-generator and the simple-icons IG glyph from jsDelivr.
 *
 * Usage: npm run banner:fidor
 */
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'output');
const TRIM = 1000;
const BLEED = 30;

const logo = await readFile(path.join(REPO_ROOT, 'src', 'components', 'Logo.astro'), 'utf8');
const MARK_PATH = logo
  .slice(logo.indexOf('const PATH = ['), logo.indexOf('].join'))
  .match(/'M[^']+'/g)
  .map((s) => s.slice(1, -1))
  .join('');
const MARK = `<svg viewBox="0 0 1000 1000" fill="#fff" fill-rule="evenodd"><path d="${MARK_PATH}"/></svg>`;

const siteTs = await readFile(path.join(REPO_ROOT, 'src', 'site.ts'), 'utf8');
const field = (name) => siteTs.match(new RegExp(`${name}: '([^']+)'`))[1];
const IG_URL = field('instagram');
const IG_HANDLE = '@' + IG_URL.split('/').pop();

const icon = async (name) =>
  (await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/${name}.svg`)).text()).replace(
    /<title>.*?<\/title>/,
    '',
  );
const IG = await icon('instagram');

const step = (n, title, sub) =>
  `<div class="step"><div class="n">${n}</div><div><div class="t">${title}</div><div class="s">${sub}</div></div></div>`;

const STEPS = [
  step(1, 'SLEDUJ', `${IG} <b>${IG_HANDLE}</b>`),
  step(2, 'POSLOUCHEJ', `mixy Haven na <b>Mixcloudu</b> a <b>YouTube</b>`),
  step(3, 'HLASUJ', `<span><b>Fans' Favorite</b> – tvůj track se vrátí v příštím díle</span>`),
];

const photo = await readFile(path.join(REPO_ROOT, 'src', 'assets', 'photos', 'portrait.jpg'));
const template = (await readFile(path.join(__dirname, 'template.html'), 'utf8'))
  .replaceAll('{{PAGE}}', TRIM + 2 * BLEED)
  .replaceAll('{{BLEED}}', BLEED)
  .replace('{{MARK}}', MARK)
  .replace('{{STRAP}}', field('strapline'))
  .replace('{{EMAIL}}', field('bookingEmail'))
  .replace('{{IG}}', IG)
  .replace('{{STEPS}}', STEPS.join(''))
  .replace('{{PHOTO}}', `data:image/jpeg;base64,${photo.toString('base64')}`);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const px = (mm) => Math.round((mm * 96) / 25.4);

const page = await browser.newPage({ viewport: { width: px(TRIM + 2 * BLEED), height: px(TRIM + 2 * BLEED) }, deviceScaleFactor: 0.5 });
await page.setContent(template, { waitUntil: 'networkidle' });
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js' });
await page.evaluate((url) => {
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  document.querySelector('.qr').innerHTML =
    `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}, IG_URL);
await page.evaluate(() => document.fonts.ready);

// One title size for all three steps: the largest that lets the longest fit.
const overflow = await page.evaluate(() => {
  const col = document.querySelector('.steps-col');
  const ts = [...document.querySelectorAll('.t')];
  const widest = Math.max(...ts.map((t) => t.scrollWidth));
  const size = Math.min(54, (54 * (col.clientWidth - (78 + 18) * (96 / 25.4))) / widest);
  document.documentElement.style.setProperty('--t', `${size}mm`);
  const trim = document.querySelector('.trim');
  return trim.scrollHeight - trim.clientHeight;
});
if (overflow > 1) console.warn(`Content overflows the safe area by ${overflow}px`);

const base = path.join(OUT, 'thompson-banner-fidor');
const size = `${TRIM + 2 * BLEED}mm`;
await page.pdf({ path: `${base}.pdf`, width: size, height: size, printBackground: true, preferCSSPageSize: true });
await page.screenshot({ path: `${base}.png` });
console.log(`wrote ${path.relative(REPO_ROOT, base)}.pdf / .png`);
await browser.close();
