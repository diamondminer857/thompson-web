/**
 * Drum & bass demo tracks and sampler one-shots for /macicek, synthesized
 * sample by sample (no audio files, no Web Audio nodes — a node graph renders
 * far too slowly). Every track has the same DJ-friendly layout:
 *
 *   intro 16 (drums) → build 8 (roll + riser) → drop 32 → breakdown 16
 *   (no drums) → drop 16 → outro 16 (drums)  = 104 bars
 *
 * Bar 0 beat 0 is at t = 0 and every hit sits exactly on the grid: kick on
 * 1 and 3, snare on 2 and 4. Noise comes from a seeded PRNG, so a
 * track renders identically every time.
 */

export type TrackSpec = {
  title: string;
  style: string;
  bpm: number;
  key: string;
  semis: number; // key root, 0 = C … 11 = B
  render: () => AudioBuffer; // mono, 44.1 kHz
};

const SR = 44100;
const TAU = 2 * Math.PI;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

// mulberry32
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// TPT state-variable filter (0 = lowpass, 1 = bandpass, 2 = highpass). Stable
// under per-sample cutoff modulation; coefficients only recomputed on change.
function svf() {
  let ic1 = 0, ic2 = 0, lf = -1, lq = -1, k = 1, a1 = 0, a2 = 0, a3 = 0;
  return (x: number, fc: number, q: number, mode: 0 | 1 | 2) => {
    if (fc !== lf || q !== lq) {
      lf = fc;
      lq = q;
      const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
      k = 1 / q;
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return mode === 0 ? v2 : mode === 1 ? v1 : x - k * v1 - v2;
  };
}

// PolyBLEP residual: smooths the jump of a saw/square at phase `p` (0–1), `dt` = phase step per sample.
function blep(p: number, dt: number) {
  if (p < dt) {
    p /= dt;
    return p + p - p * p - 1;
  }
  if (p > 1 - dt) {
    p = (p - 1) / dt;
    return p * p + p + p + 1;
  }
  return 0;
}

type Voice = {
  wave?: 'saw' | 'sq' | 'sine' | 'tri';
  det?: number[]; // oscillator frequency ratios (detune)
  cut?: number | ((s: number) => number); // lowpass Hz, or a function of time since note on
  q?: number;
  a?: number; // attack, s
  d?: number; // decay time constant, s (default: none)
  sus?: number; // level the decay settles to
  r?: number; // release at note end, s
  drive?: number;
  rev?: number; // reverb send, 0–1
  bend?: number; // start pitch offset in semitones, glides to 0
  bendT?: number;
  key?: string; // cache key when `cut` is a function
};

function studio(seconds: number, seed: number) {
  const len = Math.ceil(seconds * SR);
  const out = new Float32Array(len); // drums + fx
  const mus = new Float32Array(len); // bass + pads, ducked by the kick
  const wet = new Float32Array(len); // reverb send
  const kicks: number[] = [];
  const rnd = prng(seed);
  const noise = () => rnd() * 2 - 1;

  const add = (t: number, dur: number, fn: (s: number) => number, dst = out) => {
    const i0 = Math.round(t * SR);
    for (let i = 0, n = Math.min(Math.round(dur * SR), len - i0); i < n; i++) dst[i0 + i] += fn(i / SR);
  };
  const fade = (s: number, dur: number, r = 0.01) => Math.min(1, (dur - s) / r);

  // Identical hits/notes are synthesized once and mixed as copies — that is
  // what keeps a 2.5-minute render well under a second.
  const cache = new Map<string, Float32Array>();
  const hit = (t: number, amp: number, key: string, dur: number, make: () => (s: number) => number, dst = out, rev = 0) => {
    let b = cache.get(key);
    if (!b) {
      b = new Float32Array(Math.round(dur * SR));
      const fn = make();
      for (let i = 0; i < b.length; i++) b[i] = fn(i / SR);
      cache.set(key, b);
    }
    const i0 = Math.round(t * SR);
    for (let i = 0, n = Math.min(b.length, len - i0); i < n; i++) dst[i0 + i] += b[i] * amp;
    if (rev) for (let i = 0, n = Math.min(b.length, len - i0); i < n; i++) wet[i0 + i] += b[i] * amp * rev;
  };

  const kick = (t: number, amp = 1, f0 = 48) => {
    kicks.push(Math.round(t * SR));
    hit(t, amp, `k${f0}`, 0.5, () => {
      let ph = 0;
      return (s) => {
        ph += (TAU * (f0 + 170 * Math.exp(-s * 30))) / SR;
        const click = s < 0.003 ? noise() * (1 - s / 0.003) * 0.5 : 0;
        return (Math.tanh(Math.sin(ph) * 2) * Math.exp(-s * 13) * Math.min(1, s / 0.001) + click) * fade(s, 0.5);
      };
    });
  };
  const snare = (t: number, amp = 1, tone = 200, dec = 0.13) => {
    const dur = dec * 4.5;
    hit(t, amp, `s${tone}|${dec}`, dur, () => {
      const bp = svf(), hp = svf();
      let p1 = 0, p2 = 0;
      return (s) => {
        const f = tone * (1 + 0.5 * Math.exp(-s * 60));
        p1 += (TAU * f) / SR;
        p2 += (TAU * f * 1.62) / SR;
        const body = (Math.sin(p1) + 0.35 * Math.sin(p2)) * Math.exp(-s * 24);
        const n = noise();
        const nz = (bp(n, 1800, 0.8, 1) * 2.2 + hp(n, 3500, 0.7, 2) * 0.8) * Math.exp(-s / dec);
        return Math.tanh((body + nz) * 1.4) * fade(s, dur);
      };
    }, out, 0.25);
  };
  const hat = (t: number, amp: number, d = 0.018) =>
    hit(t, amp, `h${d}`, d * 6, () => {
      const f = svf();
      return (s) => f(noise(), 8000, 0.8, 2) * Math.exp(-s / d) * 0.8;
    });
  const ride = (t: number, amp: number) =>
    hit(t, amp, 'ride', 0.8, () => {
      const f = svf();
      let a = 0, b = 0, c = 0;
      return (s) => {
        a += 3150 / SR; b += 4730 / SR; c += 6110 / SR;
        const metal = ((a % 1 < 0.5 ? 1 : -1) + (b % 1 < 0.5 ? 1 : -1) + (c % 1 < 0.5 ? 1 : -1)) / 3;
        return f(noise() * 0.6 + metal * 0.4, 5000, 0.9, 2) * (0.5 * Math.exp(-s / 0.03) + 0.5 * Math.exp(-s / 0.3)) * fade(s, 0.8);
      };
    });
  const crash = (t: number, amp: number, dur = 3) =>
    hit(t, amp, `c${dur}`, dur, () => {
      const f = svf();
      return (s) => f(noise(), 4000, 0.7, 2) * Math.exp(-s / 0.8) * Math.min(1, s / 0.002) * fade(s, dur, 0.1);
    });
  // Noise sweep rising into a drop; ends hard on the downbeat.
  const riser = (t: number, dur: number, amp: number) =>
    hit(t, amp, `r${dur}`, dur, () => {
      const f = svf();
      return (s) => {
        const x = s / dur;
        return f(noise(), 300 * 30 ** x, 1.8, 1) * x * x * fade(s, dur, 0.005);
      };
    });

  // Subtractive synth voice. Cached by its parameters; a voice whose cutoff is
  // a function must carry a `key` naming that function's shape, or it is
  // rendered fresh every time.
  const voice = (t: number, dur: number, f: number, amp: number, o: Voice = {}) => {
    const { cut, q = 0.8, a = 0.004, d = Infinity, sus = 0, r = 0.02, drive = 0, bend = 0, bendT = 0.05, key, rev = 0 } = o;
    const make = () => {
      const det = o.det ?? [1];
      const n = det.length;
      const ph = new Float64Array(n);
      if (n > 1) for (let j = 0; j < n; j++) ph[j] = rnd();
      const w = o.wave === 'sq' ? 1 : o.wave === 'sine' ? 2 : o.wave === 'tri' ? 3 : 0;
      const flt = svf();
      return (s: number) => {
        const fr = bend ? f * 2 ** ((bend * Math.exp(-s / bendT)) / 12) : f;
        let x = 0;
        for (let j = 0; j < n; j++) {
          const dt = (fr * det[j]) / SR;
          let p = ph[j] + dt;
          if (p >= 1) p -= 1;
          ph[j] = p;
          // Saw and square are band-limited (PolyBLEP) — naive ones alias into a harsh digital fizz.
          x +=
            w === 0 ? 2 * p - 1 - blep(p, dt)
            : w === 1 ? (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt)
            : w === 2 ? Math.sin(TAU * p)
            : 1 - 4 * Math.abs(p - 0.5);
        }
        x /= n;
        if (cut !== undefined) x = flt(x, typeof cut === 'number' ? cut : cut(s), q, 0);
        if (drive) x = Math.tanh(x * drive);
        return x * (s < a ? s / a : 1) * (sus + (1 - sus) * Math.exp(-s / d)) * fade(s, dur, r);
      };
    };
    if (typeof cut === 'function' && !key) {
      const fn = make();
      add(t, dur, (s) => {
        const v = fn(s) * amp;
        wet[Math.round((t + s) * SR)] += v * rev;
        return v;
      }, mus);
    } else hit(t, amp, `v${f}|${dur}|${key ?? ''}|${JSON.stringify(o)}`, dur, make, mus, rev);
  };
  const pad = (t: number, dur: number, notes: number[], amp: number, cut = 2400) => {
    for (const m of notes) voice(t, dur, mtof(m), amp, { det: [0.995, 1.005], cut, q: 0.7, a: 0.5, r: 0.8, rev: 0.5 });
  };

  // In-place feedback delay over the fx bus (sampler one-shots).
  const echo = (delay: number, fb: number) => {
    const D = Math.round(delay * SR);
    for (let i = D; i < len; i++) out[i] += out[i - D] * fb;
  };

  // Sum the buses (kick ducks the music), soft-clip, normalise.
  // Small mono room (Schroeder: 4 damped combs → 2 allpasses) on the send, mixed into the drums bus.
  const reverb = (mix: number) => {
    const combs = [1557, 1617, 1491, 1422].map((n) => ({ b: new Float32Array(n), i: 0, lp: 0 }));
    const aps = [556, 225].map((n) => ({ b: new Float32Array(n), i: 0 }));
    for (let i = 0; i < len; i++) {
      let y = 0;
      for (const c of combs) {
        const o = c.b[c.i];
        c.lp = o * 0.7 + c.lp * 0.3;
        c.b[c.i] = wet[i] + c.lp * 0.78;
        c.i = (c.i + 1) % c.b.length;
        y += o;
      }
      y *= 0.25;
      for (const a of aps) {
        const o = a.b[a.i];
        a.b[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.b.length;
        y = o - y * 0.5;
      }
      out[i] += y * mix;
    }
  };

  const finish = (peakTo: number, drive: number, duck = 0.45) => {
    reverb(0.6);
    kicks.sort((x, y) => x - y);
    const env = new Float32Array(Math.round(0.5 * SR)); // duck gain vs samples since the last kick
    for (let i = 0; i < env.length; i++) env[i] = 1 - duck * Math.exp(-i / (0.07 * SR));
    let k = 0, last = -1e9, peak = 0;
    for (let i = 0; i < len; i++) {
      while (k < kicks.length && kicks[k] <= i) last = kicks[k++];
      const g = i - last < env.length ? env[i - last] : 1;
      let x = (out[i] + mus[i] * g) * drive;
      x = x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x); // tanh, rational approx
      const v = (out[i] = x);
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const gain = peak ? peakTo / peak : 0;
    for (let i = 0; i < len; i++) out[i] *= gain;
    const buf = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 });
    buf.copyToChannel(out, 0);
    return buf;
  };

  return { out, mus, len, noise, add, fade, kick, snare, hat, ride, crash, riser, voice, pad, echo, finish };
}
type Studio = ReturnType<typeof studio>;

/* ---------------- arrangement ---------------- */

const BARS = 104;
type Part = 'intro' | 'build' | 'drop' | 'break' | 'drop2' | 'outro';
const partOf = (b: number): Part =>
  b < 16 ? 'intro' : b < 24 ? 'build' : b < 56 ? 'drop' : b < 72 ? 'break' : b < 88 ? 'drop2' : 'outro';

type Parts = {
  // lite = first half of the intro / second half of the outro (kick + hats only)
  drums: (b: number, at: (s: number) => number, part: Part, lite: boolean) => void;
  music: (b: number, at: (s: number) => number, part: Part) => void;
};

function song(bpm: number, seed: number, body: (st: Studio, step: number) => Parts): AudioBuffer {
  const step = 60 / bpm / 4;
  const st = studio(BARS * 16 * step + 1.5, seed);
  const { drums, music } = body(st, step);
  for (let b = 0; b < BARS; b++) {
    const t0 = b * 16 * step;
    const at = (s: number) => t0 + s * step;
    const part = partOf(b);
    if (part === 'intro' || part === 'drop' || part === 'drop2' || part === 'outro') drums(b, at, part, b < 8 || b >= 96);
    if (part === 'build' || part === 'drop' || part === 'break' || part === 'drop2') music(b, at, part);

    // Build: snare roll accelerating 1/4 → 1/8 → 1/16, rising in pitch and level.
    if (part === 'build') {
      const k = b - 16;
      const div = k < 4 ? 4 : k < 6 ? 2 : 1;
      if (k < 4) st.kick(at(0), 0.8);
      for (let s = 0; s < 16; s += div) {
        const x = (k * 16 + s) / 128;
        st.snare(at(s), 0.25 + 0.6 * x, 190 + 20 * k, 0.08); // pitch steps per bar (one cached hit each)
      }
    }
    if (b === 16) st.riser(t0, 8 * 16 * step, 0.5);
    if (b === 70) st.riser(t0, 2 * 16 * step, 0.45);
    if (b === 71) for (let s = 8; s < 16; s++) st.snare(at(s), 0.3 + 0.05 * (s - 8), 220, 0.08);
    if (b === 24 || b === 40 || b === 72) st.crash(t0, 0.35);
  }
  return st.finish(0.9, 1);
}

// Straight 16th hats, offbeat 8ths accented.
function hats16(st: Studio, at: (s: number) => number, amp: number) {
  for (let s = 0; s < 16; s++) st.hat(at(s), s % 4 === 2 ? amp : amp * 0.5);
}

/* ---------------- tracks ---------------- */

// F minor, 174: straight hats, warm pads, rolling bass, pluck lead.
const liquid = () =>
  song(174, 11, (st, step) => {
    const r = 29; // F1
    const prog = [
      { root: 0, pad: [56, 60, 63, 67] }, // Fm9
      { root: 8, pad: [56, 60, 63, 65] }, // Db
      { root: 5, pad: [56, 60, 61, 65] }, // Bbm9
      { root: 7, pad: [55, 58, 60, 63] }, // Cm7
    ];
    const roll: [number, number][] = [[0, 0], [3, 12], [6, 0], [8, 12], [11, 0], [14, 12]];
    const subs: [number, number][] = [[0, 6], [6, 4], [10, 6]];
    const mel: [number, number][] = [[0, 84], [3, 80], [6, 77], [10, 80], [12, 82], [16, 84], [19, 87], [22, 84], [26, 80], [28, 77]];
    return {
      drums(b, at, part, lite) {
        st.kick(at(0));
        st.kick(at(8));
        if (!lite) {
          st.snare(at(4), 1, 200, 0.15);
          st.snare(at(12), 1, 200, 0.15);
          st.snare(at(b % 2 ? 9 : 7), 0.14, 230, 0.06);
          st.snare(at(14), 0.1, 230, 0.06);
        }
        if (lite) for (let s = 2; s < 16; s += 4) st.hat(at(s), 0.11);
        else hats16(st, at, 0.11);
        if (part === 'drop2') for (let s = 0; s < 16; s += 4) st.ride(at(s), 0.06);
      },
      music(b, at, part) {
        const ch = prog[(b >> 1) % 4];
        const first = b % 2 === 0;
        if (part === 'build') {
          if (first) st.pad(at(0), 32 * step, ch.pad, 0.02 + 0.004 * (b - 16), 600 + 150 * (b - 16));
          return;
        }
        if (first) st.pad(at(0), 32 * step, ch.pad, part === 'break' ? 0.06 : 0.045, part === 'break' ? 1800 : 1500);
        if ((part === 'break' && b >= 64) || part === 'drop2') {
          if (first)
            for (const [s, m] of mel)
              for (let e = 0; e < 3; e++)
                st.voice(at(s + 3 * e), 6 * step, mtof(m), 0.16 * 0.4 ** e, {
                  key: 'lead', wave: 'tri', det: [1, 2.001], cut: (x) => 600 + 3500 * Math.exp(-x * 12), d: 0.18, r: 0.04, rev: 0.4,
                });
        }
        if (part === 'break') return;
        for (const [s, o] of roll)
          st.voice(at(s), 2.5 * step, mtof(r + 12 + ch.root + o), 0.32, {
            key: 'roll', det: [1, 1.004], cut: (x) => 400 + 3200 * Math.exp(-x * 14), q: 1.4, d: 0.1, sus: 0.3,
          });
        for (const [s, l] of subs) st.voice(at(s), l * step * 0.95, mtof(r + ch.root), 0.3, { wave: 'sine', a: 0.004, r: 0.02 });
      },
    };
  });

// D minor, 174: reese with a moving lowpass, dark stabs.
const neuro = () =>
  song(174, 23, (st, step) => {
    const r = 38; // D2
    const line: [number, number, number][] = [[0, 0, 12], [12, 3, 4], [16, 0, 12], [28, -2, 4], [32, 0, 12], [44, 5, 4], [48, 1, 16]];
    // Filter LFO cycles every `cyc` steps, kept on the grid via the start offset `off` (steps).
    const reese = (t: number, dur: number, m: number, amp: number, lo: number, hi: number, cyc: number, off: number) =>
      st.voice(t, dur, mtof(m), amp, {
        det: [0.991, 1, 1.009], q: 3, drive: 2.5, a: 0.01, r: 0.03, key: `reese${lo},${hi},${cyc},${off}`,
        cut: (s) => lo + hi * (0.5 - 0.5 * Math.cos((TAU * (s + off * step)) / (cyc * step))),
      });
    return {
      drums(b, at, _part, lite) {
        st.kick(at(0));
        st.kick(at(8));
        if (!lite) {
          st.snare(at(4), 1, 215, 0.11);
          st.snare(at(12), 1, 215, 0.11);
          st.snare(at(7), 0.12, 240, 0.05);
          st.snare(at(15), 0.1, 240, 0.05);
          if (b % 2) st.hat(at(14), 0.1, 0.07);
        }
        for (let s = 0; s < 16; s++) if (!lite || s % 2 === 0) st.hat(at(s), s % 4 === 2 ? 0.1 : 0.045);
      },
      music(b, at, part) {
        if (part === 'build' || part === 'break') {
          if (b % 2 === 0) st.pad(at(0), 32 * step, [50, 53, 57, 60], part === 'break' ? 0.05 : 0.03, 900);
          if (part === 'break' && b % 4 === 0) reese(at(0), 60 * step, r, 0.1, 150, 450, 32, 0);
          return;
        }
        if (b % 4 === 0)
          for (const [s, n, l] of line) {
            reese(at(s), l * step * 0.92, r + n, 0.34, 220, 1700, 8, s % 8);
            st.voice(at(s), l * step * 0.92, mtof(r + n), 0.2, { wave: 'sine', a: 0.005, r: 0.02 });
          }
        const stab = (s: number) => {
          for (const m of [62, 65, 68]) st.voice(at(s), 2 * step, mtof(m), 0.09, { wave: 'sq', det: [1, 1.01], cut: 2500, d: 0.06, rev: 0.4 });
        };
        if (b % 2) stab(14);
        if (b % 4 === 3) stab(6);
      },
    };
  });

// G minor, 174: wobble bass answered by a hoover-ish glide.
const jumpUp = () =>
  song(174, 37, (st, step) => {
    const r = 31; // G1
    const wobble = (s: number, len: number, rate: number, at: (s: number) => number) => {
      st.voice(at(s), len * step, mtof(r + 12), 0.32, {
        det: [0.995, 1.005], q: 4, drive: 3.5, a: 0.003, r: 0.02, key: `wob${rate}`, // notes start on whole LFO cycles
        cut: (x) => 120 + 2600 * (0.5 - 0.5 * Math.cos((TAU * x) / (rate * step))),
      });
      st.voice(at(s), len * step, mtof(r), 0.28, { wave: 'sine', a: 0.004, r: 0.02 });
    };
    const hoovers: [number, number, number][][] = [
      [[0, 3, 6], [6, 1, 4], [10, 0, 6]],
      [[0, 5, 4], [4, 3, 4], [8, 0, 8]],
    ];
    return {
      drums(_b, at, _part, lite) {
        st.kick(at(0), 1.05);
        st.kick(at(8), 1.05);
        if (!lite) {
          st.snare(at(4), 1.05, 190, 0.15);
          st.snare(at(12), 1.05, 190, 0.15);
          st.snare(at(14), 0.12, 220, 0.05);
          st.hat(at(14), 0.08, 0.08);
          for (let s = 1; s < 16; s += 2) st.hat(at(s), 0.04);
        }
        for (let s = 2; s < 16; s += 4) st.hat(at(s), 0.12);
      },
      music(b, at, part) {
        if (part === 'build' || part === 'break') {
          if (b % 2 === 0) st.pad(at(0), 32 * step, [55, 58, 62, 67], part === 'break' ? 0.05 : 0.03, 1200);
          return;
        }
        if (b % 2 === 0) {
          wobble(0, 8, 2, at);
          wobble(8, 4, 1, at);
          wobble(12, 4, 4, at);
          return;
        }
        for (const [s, n, l] of hoovers[(b >> 1) % 2]) {
          st.voice(at(s), l * step * 0.95, mtof(r + 24 + n), 0.24, {
            det: [0.985, 0.997, 1, 1.004, 1.016], cut: 2800, q: 0.9, bend: -5, bendT: 0.06, drive: 1.5, a: 0.005,
          });
          st.voice(at(s), l * step * 0.95, mtof(r + n), 0.28, { wave: 'sine', a: 0.004, r: 0.02 });
        }
      },
    };
  });

// A minor, 174: ride and ghost snares, gliding sub, offbeat skank stabs.
const jungle = () =>
  song(174, 51, (st, step) => {
    const r = 33; // A1
    const pats = [
      { k: [0, 8], s: [4, 12], g: [7, 15] },
      { k: [0, 8], s: [4, 12], g: [7, 14] },
      { k: [0, 8], s: [4, 12], g: [7, 15] },
      { k: [0, 8], s: [4, 12], g: [7, 13, 14, 15] }, // fill
    ];
    const subs: [number, number, number][] = [[0, 0, 6], [6, 0, 4], [10, 3, 6], [16, -2, 6], [22, -2, 4], [26, -5, 6]];
    const chords = [[57, 60, 64], [55, 59, 62]]; // Am, G
    return {
      drums(b, at, _part, lite) {
        const p = pats[b % 4];
        for (const s of p.k) st.kick(at(s), 0.95);
        if (!lite) {
          for (const s of p.s) st.snare(at(s), 1, 240, 0.09);
          for (const s of p.g) st.snare(at(s), b % 4 === 3 && s > 12 ? 0.45 : 0.17, 250, 0.06);
        }
        for (let s = 0; s < 16; s += 2) st.ride(at(s), s % 4 ? 0.05 : 0.08);
        if (!lite) for (let s = 1; s < 16; s += 2) st.hat(at(s), 0.035);
      },
      music(b, at, part) {
        const ch = chords[b % 2];
        if (part === 'build' || part === 'break') {
          if (b % 2 === 0) st.pad(at(0), 32 * step, [57, 60, 64, 69], part === 'break' ? 0.055 : 0.03, 1400);
          if (part === 'break')
            for (let e = 0; e < 4; e++)
              for (const m of ch) st.voice(at(6 + 3 * e), 1.5 * step, mtof(m), 0.045 * 0.5 ** e, { wave: 'sq', det: [1, 1.006], cut: 1800, d: 0.05 });
          return;
        }
        for (let s = 2; s < 16; s += 4)
          for (const m of ch) st.voice(at(s), 1.5 * step, mtof(m), 0.08, { wave: 'sq', det: [1, 1.006], cut: 2400, d: 0.05, rev: 0.4 });
        if (b % 2 === 0) {
          let prev = 0;
          for (const [s, n, l] of subs) {
            st.voice(at(s), l * step * 0.95, mtof(r + n), 0.3, { wave: 'sine', a: 0.004, r: 0.02, drive: 1.2, bend: prev - n, bendT: 0.025 });
            prev = n;
          }
        }
      },
    };
  });

export const TRACKS: TrackSpec[] = [
  { title: 'Liquid Sunrise', style: 'liquid', bpm: 174, key: 'Fm', semis: 5, render: liquid },
  { title: 'Black Circuit', style: 'neuro', bpm: 174, key: 'Dm', semis: 2, render: neuro },
  { title: 'Bounce Factory', style: 'jump up', bpm: 174, key: 'Gm', semis: 7, render: jumpUp },
  { title: 'Rinse Out 94', style: 'jungle', bpm: 174, key: 'Am', semis: 9, render: jungle },
];

/* ---------------- sampler one-shots ---------------- */

const oneShot = (seconds: number, seed: number, fn: (st: Studio) => void, drive = 1) => () => {
  const st = studio(seconds, seed);
  fn(st);
  return st.finish(0.8, drive, 0);
};

export const SAMPLES: { name: string; render: () => AudioBuffer }[] = [
  {
    name: 'Air horn',
    render: oneShot(1.5, 1, (st) => {
      for (const [t, d] of [[0, 0.11], [0.14, 0.11], [0.28, 1.1]])
        st.voice(t, d, 466, 0.5, { det: [0.993, 1, 1.009, 1.498], cut: 3200, q: 1.2, a: 0.006, r: 0.03, bend: 0.8, bendT: 0.04, drive: 4 });
    }),
  },
  {
    name: 'Siren',
    render: oneShot(3, 2, (st) => {
      const f = svf();
      let ph = 0;
      st.add(0, 1.2, (s) => {
        ph = (ph + (420 * 2 ** (1.2 * ((s * 3) % 1))) / SR) % 1;
        return f(ph < 0.5 ? 1 : -1, 2600, 0.7, 0) * 0.5 * Math.min(1, s / 0.01) * st.fade(s, 1.2, 0.03);
      });
      st.echo(0.33, 0.45);
    }),
  },
  {
    name: 'Laser',
    render: oneShot(2, 3, (st) => {
      let ph = 0;
      st.add(0, 0.35, (s) => {
        ph = (ph + (2800 * Math.exp(-s * 12) + 180) / SR) % 1;
        return (ph < 0.5 ? 0.5 : -0.5) * Math.exp(-s * 6) * st.fade(s, 0.35);
      });
      st.echo(0.18, 0.45);
    }),
  },
  {
    name: 'Sub drop',
    render: oneShot(2.6, 4, (st) => {
      let ph = 0;
      st.add(0, 2.6, (s) => {
        ph += (TAU * (28 + 100 * Math.exp(-s * 1.8))) / SR;
        return Math.sin(ph) * Math.min(1, s / 0.005) * Math.exp(-s * 1.1) * st.fade(s, 2.6, 0.1);
      });
    }, 1.5),
  },
  { name: 'Crash', render: oneShot(3, 5, (st) => st.crash(0, 1)) },
  {
    name: 'Riser',
    render: oneShot(2.5, 6, (st) => {
      st.riser(0, 2.4, 1);
      let ph = 0;
      st.add(0, 2.4, (s) => {
        ph += (TAU * 200 * 8 ** (s / 2.4)) / SR;
        return Math.sin(ph) * 0.15 * (s / 2.4) * st.fade(s, 2.4, 0.005);
      });
    }),
  },
  {
    name: 'Rewind',
    render: oneShot(3.2, 7, (st) => {
      // A bar of beat to spin back…
      const step = 60 / 174 / 4;
      for (let s = 0; s < 32; s += 4) {
        st.kick(s * step, s % 16 === 10 ? 0.8 : 1);
        if (s % 8 === 4) st.snare(s * step, 0.9);
      }
      for (let s = 0; s < 32; s += 8)
        for (const m of [57, 60, 64]) st.voice(s * step, 6 * step, mtof(m), 0.12, { det: [1, 1.005], cut: 2000 });
      const src = new Float32Array(st.len);
      for (let i = 0; i < st.len; i++) src[i] = st.out[i] + st.mus[i];
      // …then read it backwards, speeding up and slowing down like a hand on the platter.
      st.out.fill(0);
      st.mus.fill(0);
      let pos = st.len - 2;
      const D = 1.4;
      st.add(0, D, (s) => {
        pos -= 0.5 + 3 * Math.sin((Math.PI * s) / D);
        if (pos < 1) return 0;
        const i = Math.floor(pos);
        return (src[i] + (src[i + 1] - src[i]) * (pos - i)) * Math.min(1, s / 0.01) * st.fade(s, D, 0.1);
      });
    }),
  },
  {
    name: 'Boom',
    render: oneShot(2.5, 8, (st) => {
      const lp = svf();
      let ph = 0;
      st.add(0, 2.5, (s) => {
        ph += (TAU * (32 + 50 * Math.exp(-s * 8))) / SR;
        const body = Math.sin(ph) * Math.exp(-s * 1.5);
        const hit = lp(st.noise(), 400, 0.7, 0) * Math.exp(-s * 6) * 2;
        return (body + hit) * Math.min(1, s / 0.002) * st.fade(s, 2.5, 0.1);
      });
    }, 1.8),
  },
];
