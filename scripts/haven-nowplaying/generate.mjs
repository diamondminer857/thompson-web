#!/usr/bin/env node
/**
 * Renders the Haven "Now Playing" lower third (template.html) to a real
 * alpha-channel 4K video — a transparent overlay carrying the track title,
 * artist, label and the Thompson mark, meant to sit on its own track above
 * the episode footage in a video editor. It carries no footage, no audio and
 * no colour grade of its own; drop it in wherever the track changes, and the
 * card animates itself in, holds, and animates itself back out over the
 * clip's full length (15s by default).
 *
 * Track, artist and label are always given on the command line — there is no
 * default for any of them, since a wrong one is worse than a missing one:
 *
 *   npm run nowplaying:video -- --track "Time Traveler" --artist "Ruben De Ronde" --label "Statement!"
 *
 * Options:
 *   --duration 15   seconds on screen (entrance ~2s + exit ~1.1s are fixed,
 *                   so this really only lengthens the hold in the middle).
 *   --fps 30        frame rate. 60 is worth it if your timeline is 60.
 *   --ratio 16:9    frame shape. 16:9 (default) renders 3840x2160; 9:16
 *           9:16    renders 2160x3840 for Shorts / Reels / TikTok; 3:4
 *           3:4     renders 2160x2880 for feed posts. `--vertical` is kept as
 *                   an alias for `--ratio 9:16`. Both portrait cuts use the
 *                   same card re-proportioned for a narrow frame and lifted
 *                   clear of the UI those apps paint over the bottom of the
 *                   screen; the filename gains a -vertical or -3x4 suffix.
 *
 *                   Note that "4K" is only defined for 16:9, so the portrait
 *                   sizes are a choice, not a standard: both keep the 2160
 *                   width, which is what makes type render at the same
 *                   on-screen size across all three cuts (a phone displays
 *                   the frame at device width whatever its ratio), and which
 *                   is 2x Instagram's 1080-wide ceiling. If your sequence
 *                   instead defines 4K by the long edge, 3:4 would want to be
 *                   2880x3840 — change its entry in RATIOS below.
 *   --hd            render at half resolution — a quarter of the pixels and
 *                   roughly a quarter of the file, for 1080p timelines or a
 *                   quick look before committing to a 4K pass.
 *   --out path.mov  defaults to output/now-playing-<slug of track>.mov
 *   --keep-frames   also keep the raw PNG sequence next to the .mov.
 *
 * How it works — same approach as scripts/haven-intro, and for the same
 * reasons (see that script's comment): the anime.js timeline in
 * template.html never actually plays (`autoplay: false`). This script steps
 * it frame-by-frame via `timeline.seek(ms)` and screenshots each frame with a
 * transparent background, so every frame is exact regardless of how fast any
 * given frame happens to render on this machine. The equaliser bars and the
 * chip's pulsing dot are CSS `@keyframes` rather than timeline tracks, so —
 * exactly as in scripts/haven-fx — every running animation is paused at load
 * and has its `currentTime` set per frame too. Both clocks are driven off the
 * same `t`.
 *
 * The layout is authored at half the delivery resolution in CSS space and
 * captured at deviceScaleFactor 2, which is what makes it 4K: type, the logo
 * mark and every gradient are vector all the way down, so they rasterise
 * natively at full size rather than being upscaled. Both orientations share
 * one template.html — the frame size, a body class and the title auto-fit
 * numbers are injected — so the timeline and its choreography have exactly
 * one implementation rather than two that drift.
 *
 * The PNG sequence is then ffmpeg-encoded to ProRes 4444 (.mov) — the one
 * alpha codec that actually round-tripped correctly here; a VP9-in-WebM pass
 * was tried first and its alpha came back fully opaque on decode every time.
 * Expect a large file (this is a mezzanine, not a delivery codec — 15s at 4K
 * runs to a couple of GB even though most of the frame is transparent); that
 * is normal for anything meant to survive re-editing. ProRes 4444 imports
 * natively into Premiere, Final Cut and DaVinci Resolve. `--keep-frames` is
 * the fallback for editors that mis-decode its alpha anyway (Premiere has
 * been seen doing this): import frame-00000.png with "image sequence"
 * checked.
 *
 * Needs network access once per run, to pull Unbounded/Space Grotesk *and*
 * anime.js itself from their CDNs (this script has no build step of its own,
 * so nothing here goes through npm's copy of animejs).
 */
import { chromium } from 'playwright';
import { readFile, mkdir, rm, rmdir, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USAGE =
  'Usage: npm run nowplaying:video -- --track "Time Traveler" --artist "Ruben De Ronde" --label "Statement!" [--duration 15] [--fps 30] [--ratio 16:9|9:16|3:4] [--hd] [--out path.mov] [--keep-frames]';

// Each entry is the CSS-space frame (half the delivery size — see the header
// note on deviceScaleFactor), the body class the template hangs its per-shape
// rules off, the filename suffix, and the title auto-fit bounds.
//
// The two portrait shapes are authored at the same 1080 CSS width and so
// share one type scale; only their height and the card's distance from the
// bottom differ. They deliver at 2160x3840 and 2160x2880 — see the note on
// --ratio above for why the width, rather than the long edge, is what stays
// at the 4K figure.
const RATIOS = {
  '16:9': {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    suffix: '',
    fit: { maxWidth: 1560, start: 76, wrapAt: 56, floor: 40, maxLines: 2 },
  },
  '9:16': {
    width: 1080,
    height: 1920,
    orientation: 'vertical vertical-916',
    suffix: '-vertical',
    fit: { maxWidth: 920, start: 62, wrapAt: 48, floor: 34, maxLines: 3 },
  },
  '3:4': {
    width: 1080,
    height: 1440,
    orientation: 'vertical vertical-34',
    suffix: '-3x4',
    fit: { maxWidth: 920, start: 62, wrapAt: 48, floor: 34, maxLines: 3 },
  },
};

function slugify(value) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'track'
  );
}

function parseArgs(argv) {
  let track = null;
  let artist = null;
  let label = null;
  let duration = 15;
  let fps = 30;
  let hd = false;
  let ratio = '16:9';
  let out = null;
  let keepFrames = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--track') track = argv[++i];
    else if (argv[i] === '--artist') artist = argv[++i];
    else if (argv[i] === '--label') label = argv[++i];
    else if (argv[i] === '--duration') duration = Number(argv[++i]);
    else if (argv[i] === '--fps') fps = Number(argv[++i]);
    else if (argv[i] === '--hd') hd = true;
    else if (argv[i] === '--ratio') ratio = argv[++i];
    else if (argv[i] === '--vertical') ratio = '9:16';
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--keep-frames') keepFrames = true;
    else {
      console.error(`Unknown argument "${argv[i]}"\n${USAGE}`);
      process.exit(1);
    }
  }

  // All three are required rather than defaulted: this card's entire job is
  // to state who made the record, and a silently-wrong credit that ships in
  // an episode is worse than a run that refuses to start.
  const missing = [
    ['--track', track],
    ['--artist', artist],
    ['--label', label],
  ]
    .filter(([, value]) => !value || !String(value).trim())
    .map(([flag]) => flag);

  if (missing.length) {
    console.error(`Missing required ${missing.length === 1 ? 'argument' : 'arguments'}: ${missing.join(', ')}\n${USAGE}`);
    process.exit(1);
  }

  // The entrance and exit together own ~3.1s; below about 4s the hold
  // disappears and the card becomes unreadable rather than merely quick.
  if (!Number.isFinite(duration) || duration < 4) {
    console.error(`--duration must be at least 4 seconds, got "${duration}"`);
    process.exit(1);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    console.error(`--fps must be a positive number, got "${fps}"`);
    process.exit(1);
  }
  if (!RATIOS[ratio]) {
    console.error(`--ratio must be one of ${Object.keys(RATIOS).join(', ')}, got "${ratio}"`);
    process.exit(1);
  }

  return {
    track: track.trim(),
    artist: artist.trim(),
    label: label.trim(),
    duration,
    fps,
    hd,
    ratio,
    out:
      out ?? path.join(__dirname, 'output', `now-playing-${slugify(track)}${RATIOS[ratio].suffix}.mov`),
    keepFrames,
  };
}

const { track, artist, label, duration, fps, hd, ratio, out, keepFrames } = parseArgs(process.argv.slice(2));

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Per-run scratch directory, namespaced by track *and* pid. It is normal to
// render a whole tracklist by launching several of these at once, and a
// single shared frames/ (which is what haven-fx uses, safely, because it only
// ever runs one at a time) makes that quietly produce wrong videos rather
// than failing: every run writes the same frame-%05d.png names, so parallel
// runs overwrite each other's frames and the first one to finish deletes the
// directory out from under the others. The symptom is a clip that encodes
// happily at the wrong length, with frames belonging to a different track.
const framesDir = path.join(__dirname, 'frames', `${slugify(track)}-${process.pid}`);
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(path.dirname(out), { recursive: true });

// Layout is authored at half size and captured at 2x for the 4K deliverable —
// see the header comment. --hd captures 1:1 instead.
const SHAPE = RATIOS[ratio];
const WIDTH = SHAPE.width;
const HEIGHT = SHAPE.height;
const scale = hd ? 1 : 2;

const template = await readFile(path.join(__dirname, 'template.html'), 'utf8');
const html = template
  .replaceAll('{{TRACK}}', escapeHtml(track))
  .replaceAll('{{ARTIST}}', escapeHtml(artist))
  .replaceAll('{{LABEL}}', escapeHtml(label))
  .replaceAll('{{DURATION_MS}}', String(Math.round(duration * 1000)))
  .replaceAll('{{FRAME_W}}', String(WIDTH))
  .replaceAll('{{FRAME_H}}', String(HEIGHT))
  .replaceAll('{{ORIENTATION}}', SHAPE.orientation)
  .replaceAll('{{FIT_JSON}}', JSON.stringify(SHAPE.fit));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: scale,
});
await page.setContent(html, { waitUntil: 'networkidle' });
// The template's own module awaits document.fonts.ready before it measures
// and fits the title (the font *files* arriving is not the same as the
// browser having swapped them in for layout, and a fit measured against the
// fallback face would be a visibly wrong type size for the whole clip).
// Waiting on __timeline — which that module publishes last — is what
// guarantees we're past that point; awaiting our own copy of fonts.ready
// here would be a race against the page's.
//
// `Boolean(...)`, not the object itself: handing the timeline back across
// the protocol boundary hangs rather than errors (same object graph of DOM
// references and closures that the .seek() note below is about).
await page.waitForFunction(() => Boolean(window.__timeline));

// Freeze the CSS-keyframe animations (equaliser, rail drift, chip dot) where
// they stand so they can be driven off the same clock as the timeline below.
await page.evaluate(() => {
  document.getAnimations().forEach((a) => a.pause());
});

const durationMs = await page.evaluate(() => window.__duration);
const totalFrames = Math.ceil((durationMs / 1000) * fps);
console.log(`"${track}" — ${artist} [${label}]`);
console.log(
  `Rendering ${totalFrames} frames at ${fps}fps (${(durationMs / 1000).toFixed(1)}s, ${WIDTH * scale}x${HEIGHT * scale})...`,
);

for (let i = 0; i < totalFrames; i++) {
  const t = (i * 1000) / fps;
  // The block body (not a bare arrow expression) matters: `.seek()` returns
  // the timeline instance for chaining, and an implicit-return arrow would
  // hand that whole object back to Playwright to serialise across the
  // protocol boundary — which, for an object graph with DOM references and
  // closures, hangs rather than erroring.
  await page.evaluate((ms) => {
    window.__timeline.seek(ms);
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

// A short PNG sequence would encode into a short clip without ffmpeg ever
// complaining, so the count is checked here rather than discovered later in
// an editor.
const written = (await readdir(framesDir)).filter((f) => f.endsWith('.png')).length;
if (written !== totalFrames) {
  console.error(`Expected ${totalFrames} frames in ${framesDir}, found ${written} — refusing to encode.`);
  process.exit(1);
}

console.log('Encoding...');

await execFileAsync('ffmpeg', [
  '-y',
  '-framerate', String(fps),
  '-i', path.join(framesDir, 'frame-%05d.png'),
  '-c:v', 'prores_ks',
  '-profile:v', '4',
  '-pix_fmt', 'yuva444p10le',
  out,
]);

if (keepFrames) {
  const sequenceDir = out.replace(/\.mov$/i, '') + '-frames';
  await rm(sequenceDir, { recursive: true, force: true });
  await cp(framesDir, sequenceDir, { recursive: true });
  console.log(`Kept PNG sequence at ${sequenceDir}`);
}

await rm(framesDir, { recursive: true, force: true });
// The frames/ parent is left behind empty once the last concurrent run has
// cleaned up its own subdirectory; tidy it away. rmdir, not rm: it fails
// with ENOTEMPTY while another run still has a subdirectory in there, which
// is exactly the wanted behaviour — whoever finishes last removes it. (`rm`
// without `recursive: true` refuses directories outright, so it could never
// have removed this one.)
await rmdir(path.join(__dirname, 'frames')).catch(() => {});

console.log(`Wrote ${out} (ProRes 4444 + alpha, ${WIDTH * scale}x${HEIGHT * scale})`);
