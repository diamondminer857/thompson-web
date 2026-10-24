/**
 * The audio side of /macicek: library, two decks, a four-channel mixer
 * (trim, EQ/isolator, color FX, curves, crossfader assign), two headphone
 * buses, a mic channel and one Beat FX unit. Both rigs drive this one
 * engine — `index.ts` maps the controls onto it.
 */
import { SAMPLES, TRACKS, type TrackSpec } from './tracks';
import { loadShifter, shifter } from './shifter';

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const db = (d: number) => 10 ** (d / 20);

export let ctx: AudioContext | undefined;
const now = () => ctx!.currentTime;
const set = (p: AudioParam | undefined, v: number, at = now(), tc = 0.012) => p?.setTargetAtTime(v, at, tc);

/* ---------------- library ---------------- */

export const BIN = 1 / 50; // waveform resolution, seconds

export type Lib = {
  spec: TrackSpec;
  i: number;
  buf?: AudioBuffer;
  rev?: AudioBuffer;
  peaks?: Float32Array;
  cue: number;
  hot: (number | undefined)[];
  mem: number[];
};
export const library: Lib[] = TRACKS.map((spec, i) => ({ spec, i, cue: 0, hot: Array(8).fill(undefined), mem: [] }));
export const tags = new Set<number>();

// Loudness (RMS) per bin, not raw peaks — peaks of a limited track are a
// solid bar; RMS shows kicks, snares and the breakdown.
function rms(d: Float32Array, sr: number) {
  const per = Math.floor(sr * BIN);
  const out = new Float32Array(Math.ceil(d.length / per));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i * per, e = Math.min(d.length, j + per); j < e; j += 2, n++) sum += d[j] * d[j];
    out[i] = Math.min(1, Math.sqrt(sum / Math.max(n, 1)) * 2);
  }
  return out;
}

export function render(t: Lib) {
  if (t.buf) return t;
  const buf = t.spec.render();
  const d = buf.getChannelData(0);
  const rev = new AudioBuffer({ length: buf.length, sampleRate: buf.sampleRate, numberOfChannels: 1 });
  rev.copyToChannel(d.slice().reverse(), 0);
  return Object.assign(t, { buf, rev, peaks: rms(d, buf.sampleRate) });
}

let samples: AudioBuffer[] | undefined;

/* ---------------- mixer graph ---------------- */

export type Chan = {
  entry: GainNode; // input selector
  pitch?: AudioWorkletNode;
  trim: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  hi: BiquadFilterNode;
  padFilter: BiquadFilterNode;
  filter: BiquadFilterNode;
  crusher: WaveShaperNode;
  gate: GainNode;
  sweepDepth: GainNode;
  padGate: GainNode;
  transDepth: GainNode;
  noise: GainNode;
  noiseFilter: BiquadFilterNode;
  post: GainNode;
  cueA: GainNode;
  cueB: GainNode;
  fader: GainNode;
  xf: GainNode;
  out: GainNode;
  dry: GainNode;
  ana: AnalyserNode;
  fxSend: GainNode;
  space: GainNode;
  dub: GainNode;
  padEcho: GainNode;
  padRev: GainNode;
  extraLow: number; // dB, from SMART FADER
};

export const mix = {
  eqKill: -60, // ISO; EQ mode is -26
  chCurve: 1,
  xfCurve: 1,
  xfPos: 0.5,
  assign: ['THRU', 'THRU', 'THRU', 'THRU'] as ('A' | 'THRU' | 'B')[],
  colorType: 'FILTER' as string | null,
  colorParam: 0,
  smartCfx: false,
  smartFader: false,
  centerLock: false,
  fader: [0, 0, 0, 0],
  knobs: {} as Record<string, number>, // last value per `${fn}:${ch}`, to re-apply
  input: [true, true, true, true],
  listen: 'master' as 'master' | 'A' | 'B',
};

export const hp = {
  A: { cue: [false, false, false, false], master: false, mono: false, mix: 0, level: 0, link: false },
  B: { cue: [false, false, false, false], master: false, mono: false, mix: 0, level: 0, link: false },
};

export const mic = { on: false, level: 0, hi: 0, low: 0, talkover: false, fx: '' as string, fxParam: 0, reverb: false, revParam: 0, stream: undefined as MediaStream | undefined };

type G = {
  chans: Chan[];
  bus: GainNode;
  masterDry: GainNode;
  mix2: GainNode;
  duck: GainNode;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  masterAna: AnalyserNode;
  masterSend: GainNode;
  outMaster: GainNode;
  hp: Record<'A' | 'B', { bus: GainNode; cueSt: GainNode; mstSt: GainNode; cueSp: GainNode; mstSp: GainNode; mstIn: GainNode; level: GainNode; out: GainNode }>;
  spaceRev: ConvolverNode;
  dubDelay: DelayNode;
  dubFb: GainNode;
  sweepLfo: OscillatorNode;
  noiseSrc: AudioBufferSourceNode;
  sampler: GainNode;
  mic: { level: GainNode; low: BiquadFilterNode; hi: BiquadFilterNode; dry: GainNode; echo: GainNode; echoDelay: DelayNode; pitchIn: GainNode; pitch?: AudioWorkletNode; mega: GainNode; rev: GainNode; on: GainNode; ana: AnalyserNode; send: GainNode; src?: MediaStreamAudioSourceNode };
  fx: FxNodes;
};
export let g: G | undefined;

function noiseBuffer(c: BaseAudioContext, secs: number) {
  const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
  b.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  return b;
}

function impulse(c: BaseAudioContext, secs: number) {
  const n = Math.floor(secs * c.sampleRate);
  const ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) ir.getChannelData(ch).forEach((_, i, d) => (d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3));
  return ir;
}

function filter(c: AudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function gain(c: AudioContext, v = 1) {
  const n = c.createGain();
  n.gain.value = v;
  return n;
}

function chain<T extends AudioNode | AudioParam>(...nodes: [...AudioNode[], T]): T {
  for (let i = 0; i < nodes.length - 1; i++) (nodes[i] as AudioNode).connect(nodes[i + 1] as AudioNode);
  return nodes[nodes.length - 1] as T;
}

function build(c: AudioContext): G {
  const bus = gain(c);
  const masterDry = gain(c);
  const mix2 = gain(c);
  const duck = gain(c);
  const master = gain(c);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  const masterAna = c.createAnalyser();
  masterAna.fftSize = 512;
  const outMaster = gain(c);
  chain(bus, masterDry, mix2, duck, master, limiter, outMaster, c.destination);
  limiter.connect(masterAna);
  const masterSend = gain(c, 0);
  bus.connect(masterSend);

  const spaceRev = c.createConvolver();
  spaceRev.buffer = impulse(c, 3.2);
  spaceRev.connect(bus);
  const dubDelay = c.createDelay(4);
  const dubFb = gain(c, 0.55);
  const dubTone = filter(c, 'bandpass', 1200, 0.8);
  chain(dubDelay, dubTone, dubFb, dubDelay);
  dubTone.connect(bus);

  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = noiseBuffer(c, 2);
  noiseSrc.loop = true;
  noiseSrc.start();
  const sweepLfo = c.createOscillator();
  sweepLfo.type = 'square';
  sweepLfo.start();

  const sampler = gain(c, 0.8);
  sampler.connect(bus);

  const hpBus = (k: 'A' | 'B') => {
    const b = gain(c);
    const cueSt = gain(c);
    const mstSt = gain(c, 0);
    const cueSp = gain(c, 0);
    const mstSp = gain(c, 0);
    const mstIn = gain(c, 0);
    const level = gain(c, 0.7);
    const out = gain(c, 0);
    const merger = c.createChannelMerger(2);
    b.connect(cueSt).connect(level);
    b.connect(cueSp).connect(merger, 0, 0);
    limiter.connect(mstIn);
    mstIn.connect(mstSt).connect(level);
    mstIn.connect(mstSp).connect(merger, 0, 1);
    merger.connect(level);
    level.connect(out).connect(c.destination);
    void k;
    return { bus: b, cueSt, mstSt, cueSp, mstSp, mstIn, level, out };
  };
  const hps = { A: hpBus('A'), B: hpBus('B') };

  const fx = buildFx(c, mix2);

  const chans = [0, 1, 2, 3].map((): Chan => {
    const ch: Chan = {
      entry: gain(c),
      trim: gain(c),
      low: filter(c, 'lowshelf', 250),
      mid: filter(c, 'peaking', 1200, 0.8),
      hi: filter(c, 'highshelf', 3500),
      padFilter: filter(c, 'highpass', 10),
      filter: filter(c, 'lowpass', 22000),
      crusher: c.createWaveShaper(),
      gate: gain(c),
      sweepDepth: gain(c, 0),
      padGate: gain(c),
      transDepth: gain(c, 0),
      noise: gain(c, 0),
      noiseFilter: filter(c, 'bandpass', 2000, 0.7),
      post: gain(c),
      cueA: gain(c, 0),
      cueB: gain(c, 0),
      fader: gain(c),
      xf: gain(c),
      out: gain(c),
      dry: gain(c),
      ana: c.createAnalyser(),
      fxSend: gain(c, 0),
      space: gain(c, 0),
      dub: gain(c, 0),
      padEcho: gain(c, 0),
      padRev: gain(c, 0),
      extraLow: 0,
    };
    ch.ana.fftSize = 512;
    chain(ch.entry, ch.trim, ch.low, ch.mid, ch.hi, ch.padFilter, ch.filter, ch.crusher, ch.gate, ch.padGate, ch.post, ch.fader, ch.xf, ch.out, ch.dry, bus);
    noiseSrc.connect(ch.noise).connect(ch.noiseFilter).connect(ch.gate);
    sweepLfo.connect(ch.sweepDepth).connect(ch.gate.gain);
    ch.post.connect(ch.cueA).connect(hps.A.bus);
    ch.post.connect(ch.cueB).connect(hps.B.bus);
    ch.out.connect(ch.ana);
    ch.out.connect(ch.fxSend).connect(fx.input);
    ch.out.connect(ch.space).connect(spaceRev);
    ch.out.connect(ch.dub).connect(dubDelay);
    ch.out.connect(ch.padRev).connect(spaceRev);
    ch.out.connect(ch.padEcho); // its delay line is made on first use
    return ch;
  });
  masterSend.connect(fx.input);

  // Mic: level → EQ → (dry | echo | pitch | megaphone) → on → after the duck.
  const m = {
    level: gain(c, 1),
    low: filter(c, 'lowshelf', 200),
    hi: filter(c, 'highshelf', 4000),
    dry: gain(c),
    echo: gain(c, 0),
    echoDelay: c.createDelay(2),
    pitchIn: gain(c, 0),
    mega: gain(c, 0),
    rev: gain(c, 0),
    on: gain(c, 0),
    ana: c.createAnalyser(),
    send: gain(c, 0),
  };
  chain(m.level, m.low, m.hi, m.dry, m.on);
  const echoFb = gain(c, 0.45);
  chain(m.hi, m.echo, m.echoDelay, echoFb, m.echoDelay);
  m.echoDelay.connect(m.on);
  m.hi.connect(m.pitchIn);
  const megaShape = c.createWaveShaper();
  megaShape.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(((i / 1023) * 2 - 1) * 6));
  chain(m.hi, m.mega, filter(c, 'bandpass', 1600, 1.6), megaShape, gain(c, 0.5), m.on);
  m.hi.connect(m.rev).connect(spaceRev);
  m.on.connect(master);
  m.on.connect(m.send).connect(fx.input);
  m.level.connect(m.ana);

  return { chans, bus, masterDry, mix2, duck, master, limiter, masterAna, masterSend, outMaster, hp: hps, spaceRev, dubDelay, dubFb, sweepLfo, noiseSrc, sampler, mic: m, fx };
}

/* ---------------- Beat FX ---------------- */

export const FX_TYPES = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'HELIX', 'REVERB', 'FLANGER', 'PHASER', 'FILTER', 'TRIPLET FILTER', 'TRANS', 'ROLL', 'TRIPLET ROLL', 'MOBIUS'] as const;
const SEND_FX = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'HELIX', 'REVERB'];
export const FX_BEATS = [1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16];
export const FX_BEAT_LABEL = ['1/8', '1/4', '1/2', '3/4', '1', '2', '4', '8', '16'];

export const fx = {
  type: 'REVERB' as (typeof FX_TYPES)[number],
  beat: 4,
  time: 0, // TIME knob, ±1 = ×½ … ×2
  level: 0.5,
  on: false,
  xpad: false,
  target: 'M' as string, // '0'…'3', 'MIC', 'CF.A', 'CF.B', 'M', '' (none)
  bands: { LOW: true, MID: true, HI: true } as Record<string, boolean>,
  auto: true,
  tapBpm: 174,
  taps: [] as number[],
  quantize: true,
  revLen: 0,
};

type FxNodes = ReturnType<typeof buildFx>;

function buildFx(c: AudioContext, out: AudioNode) {
  const input = gain(c);
  const core = gain(c);
  // FX FREQUENCY: the input split in three bands; unselected bands skip the
  // effect (and, for inserts, pass straight through).
  const sel: Record<string, GainNode> = {};
  const unsel: Record<string, GainNode> = {};
  const bandOut: Record<string, AudioNode> = {
    LOW: chain(input, filter(c, 'lowpass', 250)),
    MID: chain(input, filter(c, 'highpass', 250), filter(c, 'lowpass', 4000)),
    HI: chain(input, filter(c, 'highpass', 4000)),
  };
  for (const b of ['LOW', 'MID', 'HI']) {
    sel[b] = gain(c, 1);
    unsel[b] = gain(c, 0);
    bandOut[b].connect(sel[b]).connect(core);
    bandOut[b].connect(unsel[b]).connect(out);
  }

  const wet = gain(c, 0.5);
  wet.connect(out);

  // Delay family: two delay lines that can feed themselves or each other.
  const dIn = gain(c, 0);
  const dA = c.createDelay(8);
  const dB = c.createDelay(8);
  const loopTone = filter(c, 'lowpass', 20000);
  const fbSelf = gain(c, 0);
  const fbAB = gain(c, 0);
  const fbBA = gain(c, 0);
  const panA = c.createStereoPanner();
  const panB = c.createStereoPanner();
  chain(core, dIn, dA);
  chain(dA, loopTone, fbSelf, dA);
  chain(dA, fbAB, dB);
  chain(dB, fbBA, dA);
  chain(dA, panA, wet);
  const bOut = gain(c, 0);
  chain(dB, bOut, panB, wet);

  const revIn = gain(c, 0);
  const rev = c.createConvolver();
  chain(core, revIn, rev, wet);

  // Insert effects: processed copy replaces the (killed) dry signal.
  const insWet = gain(c, 0);
  const insDry = gain(c, 0);
  insWet.connect(out);
  core.connect(insDry).connect(out);
  const lfo = c.createOscillator();
  lfo.start();

  const flIn = gain(c, 0);
  const flDelay = c.createDelay(0.05);
  flDelay.delayTime.value = 0.004;
  const flFb = gain(c, 0.5);
  const flMod = gain(c, 0);
  chain(core, flIn, flDelay, insWet);
  chain(flDelay, flFb, flDelay);
  flIn.connect(insWet);
  chain(lfo, flMod, flDelay.delayTime);

  const phIn = gain(c, 0);
  const aps = [0, 1, 2, 3].map(() => filter(c, 'allpass', 800, 0.6));
  const phMod = gain(c, 0);
  chain(core, phIn, ...aps, insWet);
  phIn.connect(insWet);
  aps.forEach((a) => phMod.connect(a.frequency));
  lfo.connect(phMod);

  const fiIn = gain(c, 0);
  const fiFilter = filter(c, 'bandpass', 1000, 2);
  const fiMod = gain(c, 0);
  chain(core, fiIn, fiFilter, insWet);
  chain(lfo, fiMod, fiFilter.frequency);

  const trIn = gain(c, 0);
  const trVca = gain(c, 0.5);
  const trMod = gain(c, 0);
  chain(core, trIn, trVca, insWet);
  chain(lfo, trMod, trVca.gain);

  const roIn = gain(c, 0);
  const roDelay = c.createDelay(8);
  const roFb = gain(c, 0);
  chain(core, roIn, roDelay, insWet);
  chain(roDelay, roFb, roDelay);

  return { input, core, sel, unsel, wet, dIn, dA, dB, loopTone, fbSelf, fbAB, fbBA, panA, panB, bOut, revIn, rev, insWet, insDry, lfo, flIn, flMod, flFb, phIn, phMod, fiIn, fiFilter, fiMod, trIn, trVca, trMod, roIn, roDelay, roFb };
}

export function fxBeatSec() {
  if (!fx.auto) return 60 / fx.tapBpm;
  const d = decks[masterIdx].playing ? decks[masterIdx] : decks.find((x) => x.playing) ?? decks[masterIdx];
  return d.lib ? d.beatLen / Math.max(d.cur, 0.05) : 60 / 174;
}

export const fxBpm = () => 60 / fxBeatSec();

let fxWasActive = false;
let lastKey = '';

export function fxUpdate() {
  if (!g || !ctx) return;
  const f = g.fx;
  const active = fx.on || fx.xpad;
  // QUANTIZE: switching on/off waits for the next beat.
  let at = now();
  if (active !== fxWasActive && fx.quantize) at = nextBeat();
  fxWasActive = active;
  const isSend = SEND_FX.includes(fx.type);
  const t = fx.type;
  const beat = fxBeatSec();
  const len = FX_BEATS[fx.beat] * beat * 2 ** fx.time;

  // Who goes into the unit, and (for inserts) whose dry signal gets replaced.
  const targets = new Set<number | 'M' | 'MIC'>();
  if (fx.target === 'M') targets.add('M');
  else if (fx.target === 'MIC') targets.add('MIC');
  else if (fx.target === 'CF.A' || fx.target === 'CF.B') mix.assign.forEach((a, i) => a === fx.target.slice(-1) && targets.add(i));
  else if (fx.target !== '') targets.add(+fx.target);
  g.chans.forEach((c, i) => {
    set(c.fxSend.gain, active && targets.has(i) ? 1 : 0, at);
    set(c.dry.gain, active && !isSend && targets.has(i) ? 0 : 1, at);
  });
  set(g.masterSend.gain, active && targets.has('M') ? 1 : 0, at);
  set(g.masterDry.gain, active && !isSend && targets.has('M') ? 0 : 1, at);
  set(g.mic.send.gain, active && targets.has('MIC') ? 1 : 0, at);
  set(g.mic.on.gain, mic.on && !(active && !isSend && targets.has('MIC')) ? 1 : 0, at);
  for (const b of ['LOW', 'MID', 'HI']) {
    set(f.sel[b].gain, fx.bands[b] ? 1 : 0, at);
    set(f.unsel[b].gain, active && !isSend && !fx.bands[b] ? 1 : 0, at);
  }

  // Captures (HELIX, ROLL) only restart when the effect itself changes, not
  // on every LEVEL tweak.
  const key = `${active}|${t}|${fx.beat}|${fx.target}`;
  const fresh = key !== lastKey;
  lastKey = key;
  const delayFam = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'HELIX'].includes(t);
  if (fresh) set(f.dIn.gain, active && delayFam ? 1 : 0, at, 0.005);
  if (fresh && t === 'HELIX' && active) set(f.dIn.gain, 0, at + len, 0.005); // capture one slice, then loop it
  set(f.dA.delayTime, Math.min(len, 7.9), now(), 0.05);
  set(f.dB.delayTime, Math.min(len, 7.9), now(), 0.05);
  set(f.fbSelf.gain, t === 'ECHO' ? 0.5 : t === 'SPIRAL' ? 0.72 : t === 'HELIX' ? (active ? 1 : 0.4) : 0);
  set(f.fbAB.gain, t === 'PING PONG' ? 0.6 : 0);
  set(f.fbBA.gain, t === 'PING PONG' ? 0.6 : 0);
  set(f.bOut.gain, t === 'PING PONG' ? 1 : 0);
  f.panA.pan.value = t === 'PING PONG' ? -0.9 : 0;
  f.panB.pan.value = 0.9;
  set(f.loopTone.frequency, t === 'SPIRAL' ? 3500 : 20000);
  f.loopTone.type = t === 'SPIRAL' ? 'bandpass' : 'lowpass';

  set(f.revIn.gain, active && t === 'REVERB' ? 1 : 0, at, 0.005);
  const revLen = clamp(len * 3, 1, 8);
  if (t === 'REVERB' && Math.abs(revLen - fx.revLen) > 0.2) {
    fx.revLen = revLen;
    f.rev.buffer = impulse(ctx, revLen);
  }
  set(f.wet.gain, fx.level * 1.3);

  const ins = active && !isSend;
  set(f.insWet.gain, ins ? (t === 'TRANS' || t.includes('ROLL') ? 1 : fx.level) : 0, at, 0.005);
  set(f.insDry.gain, ins ? (t === 'TRANS' || t.includes('ROLL') ? 1 - fx.level : 1 - fx.level) : 0, at, 0.005);
  set(f.flIn.gain, ins && t === 'FLANGER' ? 1 : 0, at);
  set(f.phIn.gain, ins && (t === 'PHASER' || t === 'MOBIUS') ? 1 : 0, at);
  set(f.fiIn.gain, ins && t.includes('FILTER') ? 1 : 0, at);
  set(f.trIn.gain, ins && t === 'TRANS' ? 1 : 0, at);
  const roll = t === 'ROLL' || t === 'TRIPLET ROLL';
  const rollLen = roll ? (t === 'TRIPLET ROLL' ? (len * 2) / 3 : len) : len;
  if (ins && roll) {
    if (fresh) {
      set(f.roDelay.delayTime, Math.min(rollLen, 7.9), at, 0.001);
      set(f.roIn.gain, 1, at, 0.002);
      set(f.roIn.gain, 0, at + rollLen, 0.002);
      set(f.roFb.gain, 1, at + rollLen * 0.9, 0.002);
    }
  } else {
    set(f.roIn.gain, 0, at, 0.005);
    set(f.roFb.gain, 0, at, 0.005);
  }

  // One LFO serves whichever insert is running, tied to the beat.
  const period = t === 'TRIPLET FILTER' ? (len * 2) / 3 : t === 'TRANS' ? len : len * 2;
  f.lfo.type = t === 'TRANS' ? 'square' : t === 'MOBIUS' ? 'sawtooth' : 'triangle';
  set(f.lfo.frequency, 1 / Math.max(period, 0.02));
  set(f.flMod.gain, t === 'FLANGER' ? 0.003 : 0);
  set(f.phMod.gain, t === 'PHASER' || t === 'MOBIUS' ? 700 : 0);
  set(f.fiMod.gain, t.includes('FILTER') ? 1800 : 0);
  f.fiFilter.frequency.value = 2000;
  set(f.trMod.gain, t === 'TRANS' ? 0.5 : 0);
}

function nextBeat() {
  const d = decks[masterIdx].playing ? decks[masterIdx] : decks.find((x) => x.playing);
  if (!d?.lib) return now();
  const bl = d.beatLen;
  const p = d.now();
  return now() + ((Math.ceil(p / bl - 0.02) * bl - p) / Math.max(d.cur, 0.05));
}

export function tap() {
  const t = performance.now();
  fx.taps = [...fx.taps.filter((x) => t - x < 2000), t].slice(-5);
  if (fx.taps.length > 1) fx.tapBpm = Math.round((60000 * (fx.taps.length - 1)) / (t - fx.taps[0]));
}

/* ---------------- decks ---------------- */

export const RANGES = [0.06, 0.1, 0.16, 1];
export let masterIdx = 0;

export class Deck {
  lib?: Lib;
  pos = 0;
  t0 = 0;
  cur = 1;
  dir = 1;
  playing = false;
  running = false;
  src?: AudioBufferSourceNode;
  slider = 1;
  range = 0.1;
  synced = false;
  reset = false;
  bend = 0;
  bendTimer = 0;
  quantize = true;
  loop?: { a: number; b: number; on: boolean };
  pendingIn?: number;
  adjust?: 'in' | 'out';
  holdTimer = 0;
  padMode = 'hot';
  shift = false;
  keylock = true;
  key = 0;
  keySync = false;
  reverse = false;
  slip = false;
  shadow?: { pos: number; t: number; r: number };
  vinyl = true;
  brakeT = 0;
  jogSens = 1;
  scratch?: { speed: number; dir: number; was: boolean; timer: number };
  held?: { at: number; from: 'cue' | 'hot' };
  searchTimer = 0;
  view: 'wave' | 'browse' | 'tags' = 'wave';
  sel = 0;
  remain = true;
  filterList = false;
  lastLoad = 0;
  padFx?: { kind: string; arg: number };
  transLfo?: OscillatorNode;
  echo?: { delay: DelayNode; fb: GainNode };

  constructor(public i: number) {}

  get ch() {
    return g?.chans[this.i];
  }
  get other() {
    return decks[1 - this.i];
  }
  get beatLen() {
    return 60 / (this.lib?.spec.bpm ?? 174);
  }
  get dur() {
    return this.lib?.buf?.duration ?? 0;
  }

  follows(): boolean {
    return this.synced && masterIdx !== this.i && !!this.other.lib;
  }
  rate(): number {
    if (this.follows()) return (this.other.lib!.spec.bpm * this.other.rate()) / this.lib!.spec.bpm;
    return this.reset ? 1 : this.slider;
  }
  speed() {
    return this.scratch ? this.scratch.speed : this.rate() * (1 + this.bend);
  }
  direction() {
    return this.scratch ? this.scratch.dir : this.reverse ? -1 : 1;
  }
  now() {
    if (!this.running || !ctx) return this.pos;
    const el = Math.max(0, ctx.currentTime - this.t0);
    let p = this.pos + this.dir * el * this.cur;
    const l = this.loop;
    if (this.dir > 0 && l?.on && p >= l.b) p = l.a + ((p - l.a) % (l.b - l.a));
    return clamp(p, 0, this.dur);
  }
  startSrc(at: number, ramp = 0) {
    this.stopSrc();
    const sp = this.speed();
    const d = this.direction();
    const s = ctx!.createBufferSource();
    s.buffer = d > 0 ? this.lib!.buf! : this.lib!.rev!;
    s.connect(this.ch!.entry);
    s.playbackRate.value = sp;
    if (d > 0 && this.loop?.on) Object.assign(s, { loop: true, loopStart: this.loop.a, loopEnd: this.loop.b });
    s.onended = () => {
      if (this.src !== s) return;
      this.src = undefined;
      this.running = this.playing = false;
      this.pos = this.dir > 0 ? this.dur : 0;
      onChange();
    };
    s.start(0, clamp(d > 0 ? at : this.dur - at, 0, this.dur - 0.001));
    if (ramp > 0) {
      s.playbackRate.setValueAtTime(0.0001, now());
      s.playbackRate.linearRampToValueAtTime(sp, now() + ramp);
    }
    Object.assign(this, { src: s, pos: at, t0: now() + ramp / 2, cur: sp, dir: d, running: true });
    this.pitch();
  }
  stopSrc() {
    const s = this.src;
    this.src = undefined;
    this.running = false;
    s?.stop();
  }
  retune() {
    if (!this.lib?.buf || !ctx) return;
    const d = this.direction();
    if (this.running && d !== this.dir) {
      this.startSrc(this.now());
      return;
    }
    this.pos = this.now();
    this.t0 = now();
    this.cur = this.speed();
    this.src?.playbackRate.cancelScheduledValues(now());
    this.src?.playbackRate.setValueAtTime(this.cur, now());
    this.pitch();
  }
  // MASTER TEMPO cancels the pitch change of the tempo; KEY SHIFT/SYNC add one.
  pitch() {
    const p = this.ch?.pitch?.parameters.get('ratio');
    if (!p) return;
    let key = this.key;
    if (this.keySync && this.other.lib && this.lib) {
      const diff = (((this.other.lib.spec.semis + this.other.key - this.lib.spec.semis) % 12) + 12) % 12;
      key = diff > 6 ? diff - 12 : diff;
    }
    const comp = this.keylock && !this.scratch && this.cur > 0.05 ? 1 / this.cur : 1;
    p.setValueAtTime(clamp(2 ** (key / 12) * comp, 0.5, 2), now());
  }
  seek(p: number) {
    if (!this.lib?.buf) return;
    p = clamp(p, 0, this.dur - 0.05);
    if (this.running) this.startSrc(p);
    else this.pos = p;
  }
  play() {
    if (!this.lib?.buf || !ctx) return;
    if (!decks[masterIdx].playing || !decks[masterIdx].lib) setMaster(this.i);
    const p = this.follows() && this.other.playing ? this.aligned(this.pos) : this.pos;
    this.playing = true;
    this.startSrc(p, this.brakeT * 0.6);
  }
  pause(brake = this.brakeT) {
    this.playing = false;
    if (!this.running) return;
    if (brake > 0 && this.src) {
      const s = this.src;
      const p = this.now();
      s.playbackRate.cancelScheduledValues(now());
      s.playbackRate.setValueAtTime(this.cur, now());
      s.playbackRate.linearRampToValueAtTime(0.0001, now() + brake);
      s.stop(now() + brake);
      this.src = undefined;
      this.running = false;
      this.pos = clamp(p + (this.dir * this.cur * brake) / 2, 0, this.dur);
    } else {
      this.pos = this.now();
      this.stopSrc();
    }
  }
  // Shift p so its bar phase matches the other deck's — downbeats on downbeats.
  aligned(p: number) {
    const bar = 4 * this.beatLen;
    const want = (this.other.now() / (4 * this.other.beatLen)) % 1;
    let d = want - ((p / bar) % 1);
    d -= Math.round(d);
    const q = p + d * bar;
    return q < 0 ? q + bar : q;
  }
  snap(p: number, unit = 1) {
    const b = this.beatLen * unit;
    return this.quantize ? Math.round(p / b) * b : p;
  }

  slipStart(force = false) {
    if ((this.slip || force) && !this.shadow && this.running) this.shadow = { pos: this.now(), t: now(), r: this.rate() };
  }
  slipEnd(): boolean {
    const s = this.shadow;
    this.shadow = undefined;
    if (!s || !ctx) return false;
    this.seek(s.pos + (now() - s.t) * s.r);
    return true;
  }

  // --- loops (rekordbox / CDJ behaviour) ---
  // IN marks a pending start; OUT closes the loop and it plays at once.
  // While a loop runs, IN / OUT toggle adjust mode: the jog moves that edge.
  setLoop(a: number, b: number) {
    const p = this.now();
    this.slipStart();
    this.loop = { a, b, on: true };
    this.pendingIn = undefined;
    this.adjust = undefined;
    this.fitLoop(p);
  }
  // Keep the audio and our playhead maths in agreement when the loop region
  // changes under the playhead (new OUT behind it, a halved loop…).
  fitLoop(p = this.now()) {
    const l = this.loop;
    if (!l || !this.src) return;
    if (l.on && this.dir > 0 && p >= l.b) return this.startSrc(l.a + ((p - l.a) % (l.b - l.a)));
    this.pos = p;
    this.t0 = now();
    Object.assign(this.src, { loop: l.on && this.dir > 0, loopStart: l.a, loopEnd: l.b });
  }
  applyLoop() {
    this.fitLoop();
  }
  exitLoop() {
    if (!this.loop?.on) return;
    const p = this.now();
    this.loop.on = false;
    this.adjust = undefined;
    this.fitLoop(p);
    this.slipEnd();
  }
  reloop() {
    const l = this.loop;
    if (l?.on) return this.exitLoop();
    if (!l?.b) return;
    this.setLoop(l.a, l.b);
    this.seek(l.a);
  }
  /** Auto loop of n beats from the beat you're in. */
  beatLoop(beats: number) {
    if (this.loop?.on && Math.abs(this.loop.b - this.loop.a - beats * this.beatLen) < 0.001) return this.exitLoop();
    const unit = Math.min(1, beats) * this.beatLen;
    const a = this.loop?.on ? this.loop.a : this.quantize ? Math.floor(this.now() / unit + 0.001) * unit : this.now();
    this.setLoop(a, a + beats * this.beatLen);
  }
  resize(f: number) {
    const l = this.loop;
    if (!l?.on) return;
    l.b = l.a + clamp((l.b - l.a) * f, this.beatLen / 8, 64 * this.beatLen);
    this.fitLoop();
  }
  loopIn() {
    if (this.loop?.on) this.adjust = this.adjust === 'in' ? undefined : 'in';
    else this.pendingIn = this.snap(this.now());
  }
  loopOut() {
    if (this.loop?.on) {
      this.adjust = this.adjust === 'out' ? undefined : 'out';
      return;
    }
    const a = this.pendingIn;
    const b = this.snap(this.now());
    if (a !== undefined && b > a + 0.05) this.setLoop(a, b);
  }
  /** Jog in adjust mode: one turn = one beat. */
  adjustBy(deg: number) {
    const l = this.loop;
    if (!l?.on || !this.adjust) return;
    const d = (deg / 360) * this.beatLen;
    if (this.adjust === 'in') l.a = clamp(l.a + d, 0, l.b - 0.03);
    else l.b = clamp(l.b + d, l.a + 0.03, this.dur);
    this.fitLoop();
  }

  hotDown(i: number, del = false) {
    const t = this.lib!;
    if (del) t.hot[i] = undefined;
    else if (t.hot[i] === undefined) t.hot[i] = this.snap(this.now());
    else if (this.playing) {
      this.slipStart();
      this.seek(t.hot[i]!);
    } else {
      // Paused: plays while held, back to the hot cue on release.
      this.pos = t.hot[i]!;
      this.held = { at: t.hot[i]!, from: 'hot' };
      this.play();
    }
  }
  cueDown() {
    const t = this.lib!;
    if (this.playing) {
      this.pause(0);
      this.pos = t.cue;
      this.loop = this.loop?.on ? { ...this.loop, on: false } : this.loop;
    } else if (Math.abs(this.pos - t.cue) < 0.02) {
      this.held = { at: t.cue, from: 'cue' };
      this.play();
    } else t.cue = this.snap(this.pos);
  }
  heldUp() {
    if (!this.held) return;
    const h = this.held;
    this.held = undefined;
    if (!this.playing) return;
    this.pause(0);
    this.pos = h.at;
  }

  load(t: Lib) {
    render(t);
    this.pause(0);
    Object.assign(this, { lib: t, pos: t.cue, loop: undefined, pendingIn: undefined, adjust: undefined, key: 0, shadow: undefined, view: 'wave' });
    this.retune();
  }

  call(dir: number) {
    const t = this.lib!;
    const pts = [...t.mem, ...t.hot.filter((h): h is number => h !== undefined)].sort((a, b) => a - b);
    const p = this.now();
    const next = dir > 0 ? pts.find((x) => x > p + 0.05) : [...pts].reverse().find((x) => x < p - 0.05);
    if (next === undefined) return;
    t.cue = next;
    if (this.playing) this.seek(next);
    else this.pos = next;
  }

  // --- pad FX, per deck ---
  padFxDown(kind: string, arg: number) {
    const ch = this.ch;
    if (!ch || !this.running) return;
    this.padFx = { kind, arg };
    const len = arg * this.beatLen;
    if (kind === 'echo') {
      if (!this.echo) {
        const delay = ctx!.createDelay(4);
        const fb = gain(ctx!, 0.5);
        chain(ch.padEcho, delay, fb, delay);
        delay.connect(g!.bus);
        this.echo = { delay, fb };
      }
      set(this.echo.delay.delayTime, len / this.cur);
      set(this.echo.fb.gain, arg >= 1 ? 0 : 0.5);
      set(ch.padEcho.gain, 1);
    } else if (kind === 'roll') {
      this.slipStart(true);
      const a = this.snap(this.now(), Math.min(arg, 1));
      this.loop = { a, b: a + len, on: true };
      this.applyLoop();
    } else if (kind === 'trans') {
      if (!this.transLfo) {
        this.transLfo = ctx!.createOscillator();
        this.transLfo.type = 'square';
        this.transLfo.connect(ch.transDepth).connect(ch.padGate.gain);
        this.transLfo.start();
      }
      set(this.transLfo.frequency, this.cur / len);
      set(ch.padGate.gain, 0.5);
      set(ch.transDepth.gain, 0.5);
    } else if (kind === 'hpf' || kind === 'lpf') {
      ch.padFilter.type = kind === 'hpf' ? 'highpass' : 'lowpass';
      ch.padFilter.frequency.setValueAtTime(kind === 'hpf' ? 30 : 18000, now());
      ch.padFilter.frequency.exponentialRampToValueAtTime(kind === 'hpf' ? 4000 : 300, now() + (len * 2) / this.cur);
      ch.padFilter.Q.value = 4;
    } else if (kind === 'reverb') set(ch.padRev.gain, 1);
    else if (kind === 'brake') {
      this.slipStart(true);
      this.pause(len / this.cur);
      this.playing = true; // still "playing" — release brings it back
    } else if (kind === 'spin') {
      this.slipStart(true);
      this.scratch = { speed: 3, dir: -1, was: true, timer: 0 };
      this.retune();
    }
  }
  padFxUp() {
    const p = this.padFx;
    const ch = this.ch;
    this.padFx = undefined;
    if (!p || !ch) return;
    if (p.kind === 'echo') set(ch.padEcho.gain, 0);
    else if (p.kind === 'roll') {
      if (this.loop) this.loop.on = false;
      this.applyLoop();
      this.slipEnd();
    } else if (p.kind === 'trans') {
      set(ch.padGate.gain, 1);
      set(ch.transDepth.gain, 0);
    } else if (p.kind === 'hpf' || p.kind === 'lpf') {
      ch.padFilter.frequency.cancelScheduledValues(now());
      ch.padFilter.type = 'highpass';
      ch.padFilter.frequency.setValueAtTime(10, now());
      ch.padFilter.Q.value = 0.7;
    } else if (p.kind === 'reverb') set(ch.padRev.gain, 0);
    else if (p.kind === 'brake') {
      const s = this.shadow;
      this.shadow = undefined;
      if (s) {
        this.pos = clamp(s.pos + (now() - s.t) * s.r, 0, this.dur);
        this.startSrc(this.pos);
      }
    } else if (p.kind === 'spin') {
      this.scratch = undefined;
      this.retune();
      this.slipEnd();
    }
  }

  // --- jog ---
  scratchStart() {
    if (!this.lib?.buf || this.scratch) return;
    this.slipStart();
    this.scratch = { speed: 0, dir: 1, was: this.playing, timer: 0 };
    if (!this.running) this.startSrc(this.pos);
    else this.retune();
  }
  scratchMove(deg: number, dt: number) {
    const s = this.scratch;
    if (!s) return;
    const v = ((deg / 360) * 1.8) / Math.max(dt, 0.008);
    s.speed = Math.min(4, Math.abs(v));
    if (Math.abs(v) > 0.01) s.dir = v < 0 ? -1 : 1;
    this.retune();
    clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      if (this.scratch !== s) return;
      s.speed = 0;
      this.retune();
    }, 50);
  }
  scratchEnd() {
    const s = this.scratch;
    if (!s) return;
    clearTimeout(s.timer);
    this.scratch = undefined;
    if (s.was) {
      if (!this.slipEnd()) this.retune();
    } else {
      this.pos = this.now();
      this.stopSrc();
    }
  }
  nudge(deg: number) {
    if (!this.lib?.buf) return;
    if (!this.running) return this.seek(this.pos + (deg / 360) * 1.8 * this.jogSens);
    this.bend = clamp((deg / 60) * this.jogSens, -0.12, 0.12);
    this.retune();
    clearTimeout(this.bendTimer);
    this.bendTimer = window.setTimeout(() => {
      this.bend = 0;
      this.retune();
    }, 120);
  }
}

export const decks = [new Deck(0), new Deck(1)];

export function setMaster(i: number) {
  const d = decks[i];
  if (d.follows() && d.lib) d.slider = d.rate();
  masterIdx = i;
  decks.forEach((x) => x.retune());
}

/* ---------------- mixer controls ---------------- */

const curveGain = (v: number, k: number) => (1 - v) ** [3, 2, 0.6][k];

export function applyChannel(i: number) {
  const c = g?.chans[i];
  if (!c) return;
  const k = mix.knobs;
  const v = (fn: string) => k[`${fn}:${i}`] ?? 0;
  set(c.entry.gain, mix.input[i] ? 1 : 0);
  const t = v('trim');
  set(c.trim.gain, db(t < 0 ? t * 30 : t * 9));
  for (const b of ['hi', 'mid', 'low'] as const) {
    const x = v(b);
    set(c[b].gain, (x < 0 ? -x * mix.eqKill : x * 6) + (b === 'low' ? c.extraLow : 0));
  }
  // fader: v = 0 at the top
  set(c.fader.gain, curveGain(k[`fader:${i}`] ?? 0.15, mix.chCurve));
  applyXf();
  applyColor(i);
}

export function applyXf() {
  if (!g) return;
  const v = mix.xfPos;
  const side = (s: 'A' | 'B') => {
    const x = s === 'A' ? v : 1 - v; // 0 = fully this side
    return mix.xfCurve === 0 ? Math.cos((x * Math.PI) / 2) : mix.xfCurve === 1 ? Math.min(1, 2 * (1 - x)) : x > 0.97 ? (1 - x) * 33 : 1;
  };
  g.chans.forEach((c, i) => set(c.xf.gain, mix.assign[i] === 'THRU' ? 1 : side(mix.assign[i] as 'A')));
  if (mix.smartFader) {
    // Fading over also pulls the outgoing track's bass.
    g.chans[0].extraLow = -40 * clamp((v - 0.5) * 2, 0, 1);
    g.chans[1].extraLow = -40 * clamp((0.5 - v) * 2, 0, 1);
  } else g.chans.forEach((c) => (c.extraLow = 0));
  for (const i of [0, 1]) {
    const x = mix.knobs[`low:${i}`] ?? 0;
    set(g.chans[i].low.gain, (x < 0 ? -x * mix.eqKill : x * 6) + g.chans[i].extraLow);
  }
}

function crushCurve(levels: number) {
  return Float32Array.from({ length: 2048 }, (_, i) => Math.round(((i / 2047) * 2 - 1) * levels) / levels);
}

export function applyColor(i: number) {
  const c = g?.chans[i];
  if (!c) return;
  const v = mix.knobs[`color:${i}`] ?? mix.knobs[`filter:${i}`] ?? 0;
  const p = mix.colorParam;
  const type = mix.knobs[`color:${i}`] !== undefined ? mix.colorType : mix.smartCfx ? 'SMART' : 'FILTER';
  const on = Math.abs(v) > 0.04;
  // Neutral first, then the one selected effect.
  c.filter.type = 'lowpass';
  set(c.filter.frequency, 22000);
  c.filter.Q.value = 0.7;
  c.crusher.curve = null;
  set(c.sweepDepth.gain, 0);
  set(c.gate.gain, 1);
  set(c.noise.gain, 0);
  set(c.space.gain, 0);
  set(c.dub.gain, 0);
  if (!on) return;
  if (type === 'FILTER' || type === 'SMART') {
    c.filter.type = v < 0 ? 'lowpass' : 'highpass';
    set(c.filter.frequency, v < 0 ? 20000 * 0.01 ** -v : 20 * 250 ** v);
    c.filter.Q.value = 1 + (p + 1) * 4;
    if (type === 'SMART') set(c.space.gain, Math.abs(v) * 0.6);
  } else if (type === 'SPACE') set(c.space.gain, Math.abs(v) * (1 + p * 0.5));
  else if (type === 'DUB ECHO') {
    set(c.dub.gain, Math.abs(v));
    set(g!.dubFb.gain, 0.45 + (p + 1) * 0.15);
    set(g!.dubDelay.delayTime, 0.75 * fxBeatSec());
  } else if (type === 'CRUSH') c.crusher.curve = crushCurve(Math.round(2 ** (7 - Math.abs(v) * 5.5)));
  else if (type === 'SWEEP') {
    set(c.gate.gain, 1 - Math.abs(v) / 2);
    set(c.sweepDepth.gain, Math.abs(v) / 2);
    set(g!.sweepLfo.frequency, (4 + (p + 1) * 2) / fxBeatSec());
  } else if (type === 'NOISE') {
    set(c.noise.gain, Math.abs(v) * 0.25);
    c.noiseFilter.type = v < 0 ? 'lowpass' : 'highpass';
    set(c.noiseFilter.frequency, v < 0 ? 300 + 9000 * (1 + v) : 200 + 9000 * v);
  }
}

export function applyMaster(v: number) {
  set(g?.master.gain, db(v < 0 ? v * 40 : v * 6));
}

export function applyHp() {
  if (!g) return;
  for (const k of ['A', 'B'] as const) {
    const h = hp[k];
    const n = g.hp[k];
    g.chans.forEach((c, i) => set(c[k === 'A' ? 'cueA' : 'cueB'].gain, h.cue[i] ? 1 : 0));
    const cue = Math.min(1, 1 - h.mix);
    const mst = Math.min(1, 1 + h.mix);
    set(n.mstIn.gain, 1);
    set(n.cueSt.gain, h.mono ? 0 : cue);
    set(n.mstSt.gain, h.mono ? 0 : mst + (h.master ? 1 : 0) * cue);
    set(n.cueSp.gain, h.mono ? cue : 0);
    set(n.mstSp.gain, h.mono ? mst : 0);
    set(n.level.gain, db(h.level < 0 ? h.level * 40 : h.level * 6));
    set(n.out.gain, mix.listen === k ? 1 : 0);
  }
  set(g.outMaster.gain, mix.listen === 'master' ? 1 : 0);
}

let preview: { src: AudioBufferSourceNode; k: 'A' | 'B' } | undefined;
export function linkCue(k: 'A' | 'B', on: boolean, t?: Lib) {
  hp[k].link = on;
  if (preview?.k === k) {
    preview.src.stop();
    preview = undefined;
  }
  if (!on || !t || !g || !ctx) return;
  render(t);
  const s = ctx.createBufferSource();
  s.buffer = t.buf!;
  s.connect(g.hp[k].bus);
  // Skip the intro: preview from the first drop-ish quarter.
  s.start(0, t.buf!.duration * 0.3);
  preview = { src: s, k };
}

export async function micOn(on: boolean) {
  mic.on = on;
  if (on && g && ctx && !g.mic.src) {
    try {
      mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
      g.mic.src = ctx.createMediaStreamSource(mic.stream);
      g.mic.src.connect(g.mic.level);
    } catch {
      mic.on = false;
    }
  }
  applyMic();
  fxUpdate();
}

export function applyMic() {
  if (!g || !ctx) return;
  const m = g.mic;
  set(m.level.gain, db(mic.level < 0 ? mic.level * 40 : mic.level * 12));
  set(m.hi.gain, mic.hi * 12);
  set(m.low.gain, mic.low * 12);
  set(m.on.gain, mic.on ? 1 : 0);
  const p = mic.fxParam;
  set(m.dry.gain, mic.fx === 'PITCH' || mic.fx === 'MEGAPHONE' ? 0 : 1);
  set(m.echo.gain, mic.fx === 'ECHO' ? 0.4 + (p + 1) * 0.3 : 0);
  m.echoDelay.delayTime.value = fxBeatSec() / 2;
  set(m.pitchIn.gain, mic.fx === 'PITCH' ? 1 : 0);
  m.pitch?.parameters.get('ratio')!.setValueAtTime(2 ** ((p * 12) / 12), now());
  set(m.mega.gain, mic.fx === 'MEGAPHONE' ? 0.6 + (p + 1) * 0.6 : 0);
  set(m.rev.gain, mic.reverb ? 0.3 + (mic.revParam + 1) * 0.35 : 0);
}

export function playSample(i: number) {
  if (!g || !ctx) return;
  samples ??= SAMPLES.map((s) => s.render());
  const s = ctx.createBufferSource();
  s.buffer = samples[i];
  s.connect(g.sampler);
  s.start();
}

/* ---------------- per-frame ---------------- */

const tmp = new Float32Array(512);
export function level(a?: AnalyserNode) {
  if (!a) return 0;
  a.getFloatTimeDomainData(tmp);
  let p = 0;
  for (const s of tmp) p = Math.max(p, Math.abs(s));
  return p;
}

let duckOn = false;
export function tick() {
  if (!g || !ctx) return;
  // TALKOVER: music drops while someone speaks.
  const speaking = mic.on && mic.talkover && level(g.mic.ana) > 0.06;
  if (speaking !== duckOn) {
    duckOn = speaking;
    set(g.duck.gain, speaking ? db(-14) : 1, now(), speaking ? 0.02 : 0.3);
  }
}

/* ---------------- start ---------------- */

let onChange = () => {};
export function onStateChange(f: () => void) {
  onChange = f;
}

export async function start() {
  if (ctx) return void ctx.resume();
  ctx = new AudioContext({ latencyHint: 'interactive' });
  g = build(ctx);
  try {
    await loadShifter(ctx);
    for (const i of [0, 1]) {
      const c = g.chans[i];
      const p = shifter(ctx);
      c.entry.disconnect();
      c.entry.connect(p).connect(c.trim);
      c.pitch = p;
    }
    g.mic.pitch = shifter(ctx);
    g.mic.pitchIn.connect(g.mic.pitch).connect(g.mic.on);
  } catch {
    // No AudioWorklet (very old browser): everything but keylock still works.
  }
  decks.forEach((d) => d.retune());
}
