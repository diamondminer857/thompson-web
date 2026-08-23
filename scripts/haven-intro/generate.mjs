#!/usr/bin/env node
/**
 * Renders the Haven episode intro (template.html) to a real alpha-channel
 * video — a transparent overlay of the logo, two narration lines, and a
 * closing branding card, meant to sit on its own track above your own
 * background footage in a video editor. It carries no footage, no audio,
 * and no colour grade of its own — see template.html for the storyboard
 * (the exact ms each beat starts/ends) and the conversation this shipped
 * in for the recommended cut point in your footage underneath it.
 *
 * How it works: the timeline in template.html never actually plays in real
 * time (`autoplay: false`) — this script steps it frame-by-frame via
 * `timeline.seek(ms)` and screenshots each frame with a transparent
 * background, so every frame is exact regardless of how fast any given
 * frame happens to render on this machine. The PNG sequence is then
 * ffmpeg-encoded to ProRes 4444 (.mov) — the one alpha codec that actually
 * round-tripped correctly here. A VP9-in-WebM version was tried first
 * (smaller files, more web-native) but its alpha silently came back fully
 * opaque on decode every time, verified pixel-by-pixel — a known rough edge
 * in how ffmpeg's CLI handles WebM's side-channel alpha for VP9, not
 * something worth shipping quietly broken. ProRes 4444 imports natively
 * into Premiere, Final Cut, and DaVinci Resolve; if your editor genuinely
 * can't take it, ask and I'll set up a PNG-sequence export instead — the
 * frames themselves are already proven correct, it's only this particular
 * encode step that wasn't.
 * Needs network access once per run, to pull Unbounded/Space Grotesk *and*
 * anime.js itself from their CDNs (this script has no build step of its
 * own, so nothing here goes through npm's copy of animejs).
 *
 * Usage:
 *   npm run intro:video -- 004
 *   npm run intro:video -- 004 --fps 30 --out ./my-intro.mov
 *   npm run intro:video -- 004 --keep-frames
 *
 * `--fps` defaults to 30. `--out` defaults to
 * scripts/haven-intro/output/haven-intro-<number>.mov — note this is a
 * ProRes 4444 *mezzanine* file, not a delivery codec: expect it to be
 * large (hundreds of MB for 20s at 1080p) even though most of the frame is
 * transparent. That's normal for anything meant to survive re-editing.
 *
 * `--keep-frames` additionally saves the raw PNG sequence to
 * scripts/haven-intro/output/haven-intro-<number>-frames/ instead of
 * discarding it after encoding — a fallback for editors that mis-decode
 * this file's alpha (seen in Premiere Pro even though the same file
 * round-trips correctly through ffmpeg) since a PNG sequence has no codec
 * ambiguity to get wrong. Import frame-00000.png with "image sequence"
 * checked.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, rm, readdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const [numberArg, ...rest] = argv;
  if (!numberArg || numberArg.startsWith('--')) {
    console.error('Usage: npm run intro:video -- <episode number> [--fps 30] [--out ./path-without-extension]');
    process.exit(1);
  }

  const number = String(numberArg).padStart(3, '0');
  let fps = 30;
  let out = path.join(__dirname, 'output', `haven-intro-${number}.mov`);
  let keepFrames = false;

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--fps') fps = Number(rest[++i]);
    else if (rest[i] === '--out') out = rest[++i];
    else if (rest[i] === '--keep-frames') keepFrames = true;
  }

  if (!Number.isFinite(fps) || fps <= 0) {
    console.error(`--fps must be a positive number, got "${fps}"`);
    process.exit(1);
  }

  return { number, fps, out, keepFrames };
}

const { number, fps, out, keepFrames } = parseArgs(process.argv.slice(2));

const framesDir = path.join(__dirname, 'frames', number);
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(path.dirname(out), { recursive: true });

const template = await readFile(path.join(__dirname, 'template.html'), 'utf8');
const html = template.replaceAll('{{NUMBER}}', number);

const WIDTH = 1920;
const HEIGHT = 1080;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'networkidle' });
// Belt-and-braces on top of networkidle: the font *files* being fetched
// doesn't guarantee the browser has finished swapping them in for layout,
// and a frame painted with the fallback face would be a visible glitch in
// the first captured frame or two.
await page.evaluate(() => document.fonts.ready);

const durationMs = await page.evaluate(() => window.__duration);
const totalFrames = Math.ceil((durationMs / 1000) * fps);
console.log(`Rendering ${totalFrames} frames at ${fps}fps (${(durationMs / 1000).toFixed(1)}s)...`);

for (let i = 0; i < totalFrames; i++) {
  const t = (i * 1000) / fps;
  // The block body (not a bare arrow expression) matters: `.seek()` returns
  // the timeline instance itself for chaining, and an implicit-return arrow
  // here would hand that whole object back to Playwright to serialise
  // across the protocol boundary — which, for an object graph with DOM
  // references and closures, hangs rather than erroring.
  await page.evaluate((ms) => {
    window.__timeline.seek(ms);
  }, t);
  await page.screenshot({
    path: path.join(framesDir, `frame-${String(i).padStart(5, '0')}.png`),
    omitBackground: true,
  });
  if (i % 60 === 0 || i === totalFrames - 1) console.log(`  frame ${i + 1}/${totalFrames}`);
}

await browser.close();

console.log('Encoding...');

const framePattern = path.join(framesDir, 'frame-%05d.png');

await execFileAsync('ffmpeg', [
  '-y',
  '-framerate', String(fps),
  '-i', framePattern,
  '-c:v', 'prores_ks',
  '-profile:v', '4',
  '-pix_fmt', 'yuva444p10le',
  out,
]);

if (keepFrames) {
  // Fallback for editors (Premiere has been seen doing this) that mis-decode
  // this ProRes 4444 file's alpha despite it round-tripping correctly
  // through ffmpeg itself — a native PNG-sequence import sidesteps codec
  // interpretation entirely. Import frame-00000.png in the editor with
  // "image sequence" checked; frame-%05d.png is already zero-padded to sort
  // correctly.
  const sequenceDir = path.join(path.dirname(out), `haven-intro-${number}-frames`);
  await rm(sequenceDir, { recursive: true, force: true });
  await cp(framesDir, sequenceDir, { recursive: true });
  console.log(`Kept PNG sequence at ${sequenceDir}`);
}

await rm(framesDir, { recursive: true, force: true });
// The per-episode frames/ parent can end up empty once its last episode's
// subfolder is cleaned up — tidy that up too rather than leaving a stray
// empty directory behind.
const remaining = await readdir(path.join(__dirname, 'frames')).catch(() => []);
if (remaining.length === 0) await rm(path.join(__dirname, 'frames'), { recursive: true, force: true });

console.log(`Wrote ${out} (ProRes 4444 + alpha)`);
