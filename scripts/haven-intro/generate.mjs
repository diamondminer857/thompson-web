#!/usr/bin/env node
/**
 * Cuts the Haven intro: your own studio footage, edited to the beat of
 * "Haven Intro.wav", one colour grade over all of it, a 2.39:1 letterbox,
 * kinetic narration and the HAVEN title card (template.html) on the drop.
 * No episode number, so one render serves every episode.
 *
 * The picture follows the music: a blurred cold open racks into focus as
 * the beat arrives, every cut sits on the beat grid, each kick pulses
 * exposure and punches the zoom, the snare roll adds faster, growing
 * pulses, each narration word slams in on its beat, and the drop is a
 * flash, an RGB split and a camera shake under the title. Bloom, halation
 * and drifting light leaks give the phone footage some glow.
 *
 * Usage:
 *   npm run intro:video
 *   npm run intro:video -- --src ~/Downloads --out ./haven-intro.mp4
 *
 * `--src` is the folder holding the clips named in CUTS and the WAV
 * (default ~/Downloads). Needs ffmpeg and network access once, for the
 * text layer's Google Fonts.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let src = path.join(os.homedir(), 'Downloads');
let out = path.join(__dirname, 'output', 'haven-intro.mp4');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src') src = args[++i];
  else if (args[i] === '--out') out = args[++i];
}

const AUDIO = 'Haven Intro.wav';
const FPS = 30;
const END = 20.6;

// Beat grid measured from the WAV's onsets: beats every 0.4487 s
// (≈133.7 BPM) from 4.465 s, a 16th-note snare roll from 6.148 s
// (beat 3.75) swelling until the drop on beat 20 (13.439 s), then a decay
// to silence. Shifted half a frame early so each hit lands on the frame
// nearest it.
const beat = (n) => 4.465 + n * 0.4487 - 0.5 / FPS;
const DROP = beat(20);

// `at` is the timeline position, `from` the in-point inside the clip,
// `speed` < 1 is slow motion (only on the 60 fps clips, so it stays
// smooth), `rack` blurs the shot and pulls it into focus by the first beat.
const CUTS = [
  { at: 0, clip: 'IMG_0267.MOV', from: 15.0, speed: 0.5, rack: true },
  { at: beat(4), clip: 'IMG_0281.MOV', from: 2.5, speed: 0.5 },
  { at: beat(8), clip: 'IMG_0265.MOV', from: 0.5 },
  { at: beat(12), clip: 'IMG_0278.MOV', from: 4.0 },
  { at: beat(16), clip: 'IMG_0282.MOV', from: 9.0 },
  { at: beat(17), clip: 'IMG_0267.MOV', from: 2.0, speed: 0.5 },
  { at: beat(18), clip: 'IMG_0281.MOV', from: 5.0, speed: 0.5 },
  { at: beat(19), clip: 'IMG_0267.MOV', from: 19.0, speed: 0.5 },
  { at: DROP, clip: 'IMG_0271.MOV', from: 6.0 },
];

// Narration, one word per beat; each line blurs out on `until`.
const LINES = [
  { words: ['Embark', 'on', 'a', 'trance', 'journey'], from: 0, until: beat(8) },
  { words: ['Are', 'you', 'ready', 'to', 'find', 'your', 'haven?'], from: 8, until: DROP },
];

const frame = (s) => Math.round(s * FPS);
const f3 = (n) => n.toFixed(3);

// Pulse envelopes: [time, strength, decay] per hit. Beats drive the zoom
// and text glow; the snare roll's 65 sixteenths drive the exposure flicker,
// swelling the way the roll's measured loudness does (flat after ~11.5 s).
const hits = [];
for (let n = 0; n < 20; n++) hits.push([beat(n), 1, 10]);
const snares = [];
for (let k = 0; k <= 64; k++) snares.push([beat(3.75 + k / 4), 0.1 + 0.9 * Math.min(1, k / 56), 18]);
const env = (T, list = hits) =>
  list.map(([t, a, k]) => `${a}*exp(-(${T}-${f3(t)})*${k})*gte(${T},${f3(t)})`).join('+');
const decay = (T, at, k) => `exp(-(${T}-${f3(at)})*${k})*gte(${T},${f3(at)})`;
const push = (T) => `max(0,${T}-${f3(DROP)})/${f3(END - DROP)}`;

await mkdir(path.dirname(out), { recursive: true });
const work = path.join(__dirname, 'frames');
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

// Text layer → transparent PNG per frame.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(await readFile(path.join(__dirname, 'template.html'), 'utf8'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate((cfg) => window.setup(cfg), {
  lines: LINES.map((l) => ({ ...l, starts: l.words.map((_, i) => beat(l.from + i)) })),
  hits,
  drop: DROP,
  titleOut: 18.0,
});
const totalFrames = frame(END);
console.log(`Rendering ${totalFrames} text frames...`);
for (let i = 0; i < totalFrames; i++) {
  await page.evaluate((s) => {
    window.render(s);
  }, i / FPS);
  await page.screenshot({ path: path.join(work, `text-${String(i).padStart(5, '0')}.png`), omitBackground: true });
}
await browser.close();

const inputs = [];
const chains = [];
CUTS.forEach((cut, i) => {
  const next = CUTS[i + 1]?.at ?? END;
  const frames = frame(next) - frame(cut.at);
  const speed = cut.speed ?? 1;
  inputs.push('-ss', String(cut.from), '-t', String((frames / FPS) * speed + 0.5), '-i', path.join(src, cut.clip));
  // iPhone footage is HLG/BT.2020; HLG reads acceptably as SDR gamma, so
  // only the primaries are converted to BT.709 (no zscale in this ffmpeg).
  let chain =
    `[${i}:v]colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:format=yuv420p,` +
    `setpts=(PTS-STARTPTS)/${speed},fps=${FPS},` +
    `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,` +
    `trim=end_frame=${frames},setpts=PTS-STARTPTS`;
  if (cut.rack) {
    // Rack focus: a heavily blurred copy on top fades away as the beat
    // approaches, so the shot resolves out of bokeh by the first kick.
    const focus = beat(0) - cut.at;
    chain +=
      `,split[r${i}a][r${i}b];[r${i}b]gblur=sigma=45,format=yuva420p,` +
      `fade=out:st=${f3(focus * 0.45)}:d=${f3(focus * 0.5)}:alpha=1[r${i}c];[r${i}a][r${i}c]overlay`;
  }
  chains.push(`${chain}[v${i}]`);
});

const t = CUTS.length;
inputs.push('-framerate', String(FPS), '-i', path.join(work, 'text-%05d.png'));
inputs.push('-i', path.join(src, AUDIO));

// Light-leak strength over time: a glow through the cold open, a bloom on
// the section cuts, a big one on the drop that lingers.
const leak =
  `0.45*min(T/1.5,1)*if(lt(T,${f3(beat(0))}),1,exp(-(T-${f3(beat(0))})*2))` +
  [beat(0), beat(8), beat(16)].map((b) => `+0.6*${decay('T', b, 2.5)}`).join('') +
  `+0.9*${decay('T', DROP, 1.2)}+0.3*gte(T,${f3(DROP)})`;
// Two soft blobs drifting across the frame: one warm amber, one magenta.
const blob1 = `exp(-(pow(X/W-(0.25+0.5*(0.5+0.5*sin(T*0.5))),2)+2.5*pow(Y/H-(0.3+0.15*sin(T*0.8)),2))/0.05)`;
const blob2 = `exp(-(pow(X/W-(0.75-0.5*(0.5+0.5*sin(T*0.37+1))),2)+2.5*pow(Y/H-(0.72+0.12*cos(T*0.6)),2))/0.05)`;
const ch = (a, b) => `'min(255,255*(${leak})*(${a}*${blob1}+${b}*${blob2}))'`;

// zoompan's clock: output frame number (d=1, so one out per in).
const Z = `on/${FPS}`;
const shake = (freq) => `26*sin(${Z}*${freq})*${decay(Z, DROP, 6)}`;
const bar = 138; // (1080 − 1920 / 2.39) / 2
const split = (from, to, px) => `rgbashift=rh=-${px}:bh=${px}:enable='between(t,${f3(DROP + from)},${f3(DROP + to)})'`;

const graph = [
  ...chains,
  `${CUTS.map((_, i) => `[v${i}]`).join('')}concat=n=${t}:v=1:a=0,` +
    // Zoom: a punch on every hit, a bigger one on the drop that settles,
    // then a slow push-in through the decay; plus a shake on the drop.
    `zoompan=z='1+0.03*(${env(Z)})+0.08*${decay(Z, DROP, 3)}+0.05*${push(Z)}':` +
    `x='iw/2-iw/zoom/2+${shake(71)}':y='ih/2-ih/zoom/2+${shake(53)}':d=1:s=1920x1080:fps=${FPS},` +
    // Grade: crushed blacks, rolled-off highlights, a touch of magenta in
    // the highlights to pull it toward the site's palette.
    `curves=master='0/0 0.12/0.05 0.5/0.48 0.9/0.86 1/0.93',` +
    `eq=saturation=0.92:contrast=1.04,` +
    `colorbalance=rh=0.04:bh=0.02:gh=-0.02:bs=0.03,` +
    // Exposure: a soft lift on each beat plus a flicker on every snare of
    // the roll; the drop is a near-white flash.
    `eq=eval=frame:brightness='0.06*(${env('t')})+0.12*(${env('t', snares)})+0.55*${decay('t', DROP, 5)}',` +
    `format=gbrp,split=3[m][b1][b2]`,
  // Bloom (wide, soft) and halation (tight, red) from the highlights only.
  `[b1]curves=master='0/0 0.55/0 1/1',gblur=sigma=40[bloom]`,
  `[b2]curves=master='0/0 0.7/0 1/1',gblur=sigma=7,colorchannelmixer=rr=1:gg=0.3:bb=0.2[hal]`,
  `color=c=black:s=192x108:r=${FPS}:d=${END},format=gbrp,` +
    `geq=r=${ch(1, 1)}:g=${ch(0.55, 0.2)}:b=${ch(0.18, 0.75)},` +
    `scale=1920:1080:flags=bicubic,gblur=sigma=30[leak]`,
  `[m][bloom]blend=all_mode=screen:all_opacity=0.5[mb]`,
  `[mb][hal]blend=all_mode=screen:all_opacity=0.45[mh]`,
  `[mh][leak]blend=all_mode=screen,` +
    `${split(0, 0.1, 24)},${split(0.1, 0.22, 12)},${split(0.22, 0.4, 5)},` +
    `vignette=angle=PI/4.5,noise=alls=7:allf=t,` +
    `drawbox=y=0:w=iw:h=${bar}:c=black:t=fill,drawbox=y=ih-${bar}:w=iw:h=${bar}:c=black:t=fill,` +
    `fade=in:st=0:d=1.0,fade=out:st=17.2:d=3.2[base]`,
  `[base][${t}:v]overlay=format=auto,format=yuv420p[v]`,
].join(';');

console.log('Encoding...');
await execFileAsync(
  'ffmpeg',
  [
    '-y',
    ...inputs,
    '-filter_complex', graph,
    '-map', '[v]',
    '-map', `${t + 1}:a`,
    '-t', String(END),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '320k',
    '-movflags', '+faststart',
    out,
  ],
  { maxBuffer: 1 << 26 },
);
await rm(work, { recursive: true, force: true });
console.log(`Wrote ${out}`);
