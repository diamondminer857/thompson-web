#!/usr/bin/env node
/**
 * Renders template.html — nine club-laser fixtures plus a drifting
 * cyan/magenta/violet haze, no text, no logo, no footage — to a real
 * alpha-channel video. A companion to haven-intro's overlay: the same
 * light-fixture language as the site's own Hero.astro (`.laser`,
 * `aura-drift`), rebuilt as a standalone clip meant to sit on its own
 * track — Screen or Add blended — above your own footage in an editor,
 * alongside (not instead of) the haven-intro overlay.
 *
 * How it works: unlike haven-intro, this template has no anime.js
 * timeline to seek — it's driven entirely by CSS `@keyframes`. So this
 * script pauses every animation Chromium is running
 * (`document.getAnimations()`) right after load, then before each frame
 * sets each one's `currentTime` directly and screenshots with a
 * transparent background — the same "step time deterministically, capture,
 * repeat" approach, just aimed at the Web Animations API instead of
 * anime.js. Every animation in the template shares 12s as a common
 * multiple of its own period (beams 6s, flicker 2s, haze drift 12s), so
 * the render loops seamlessly at every 12s mark no matter how long you
 * actually render — loop it further in your editor past the default
 * length instead of re-rendering for more.
 *
 * Same ProRes-4444-only decision as haven-intro: a VP9-in-WebM pass was
 * tried and its alpha didn't survive ffmpeg's decode reliably, so it was
 * dropped rather than shipped quietly broken.
 *
 * Usage:
 *   npm run fx:video
 *   npm run fx:video -- --duration 24 --fps 30 --out ./my-fx.mov
 *
 * `--duration` (seconds) defaults to 12 — one full loop. `--fps` defaults
 * to 30. `--out` defaults to scripts/haven-fx/output/haven-fx.mov.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let duration = 12;
  let fps = 30;
  let out = path.join(__dirname, 'output', 'haven-fx.mov');

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--duration') duration = Number(argv[++i]);
    else if (argv[i] === '--fps') fps = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    console.error(`--duration must be a positive number of seconds, got "${duration}"`);
    process.exit(1);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    console.error(`--fps must be a positive number, got "${fps}"`);
    process.exit(1);
  }

  return { duration, fps, out };
}

const { duration, fps, out } = parseArgs(process.argv.slice(2));

const framesDir = path.join(__dirname, 'frames');
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(path.dirname(out), { recursive: true });

const html = await readFile(path.join(__dirname, 'template.html'), 'utf8');

const WIDTH = 1920;
const HEIGHT = 1080;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'networkidle' });

// Freeze every running CSS animation where it stands so it can be driven
// frame-by-frame below, same role autoplay:false + .seek() plays for
// haven-intro's anime.js timeline.
await page.evaluate(() => {
  document.getAnimations().forEach((a) => a.pause());
});

const totalFrames = Math.ceil(duration * fps);
console.log(`Rendering ${totalFrames} frames at ${fps}fps (${duration}s)...`);

for (let i = 0; i < totalFrames; i++) {
  const t = (i * 1000) / fps;
  await page.evaluate((ms) => {
    document.getAnimations().forEach((a) => {
      a.currentTime = ms;
    });
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

await rm(framesDir, { recursive: true, force: true });

console.log(`Wrote ${out} (ProRes 4444 + alpha)`);
