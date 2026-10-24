/**
 * Glue between the pult drawings (`components/Gear.astro`, controls tagged
 * with `data-fn` / `data-ch` / `data-arg` in `lib/gear.ts`) and the audio
 * engine. Lights and screens are always redrawn from engine state, so both
 * rigs show the same truth.
 */
import * as E from './engine';
import { clamp, decks, fx, hp, library, mic, mix, tags, type Deck, type Lib } from './engine';

let rig: HTMLElement | undefined;
let libSel = 0;

const ALT: Record<string, string> = { hot: 'keyboard', fx: 'fx2', jump: 'beatloop', sampler: 'keyshift' };
const PAD_FX: Record<string, [string, number][]> = {
  fx: [['echo', 0.5], ['echo', 0.75], ['roll', 0.25], ['roll', 0.125], ['trans', 0.25], ['hpf', 1], ['reverb', 1], ['brake', 1]],
  fx2: [['echo', 1], ['echo', 0.25], ['roll', 0.0625], ['roll', 0.5], ['trans', 0.125], ['lpf', 1], ['reverb', 1], ['spin', 1]],
};
const KEYBOARD = [-5, -3, -1, 0, 2, 4, 5, 7];
const KEYSHIFT = [1, 2, 3, 4, -1, -2, -3, 0];
const BEATLOOP = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
// rekordbox's default BEAT JUMP pads: ◀4▶ ◀8▶ / ◀16▶ ◀32▶ (left pad of each
// pair back, right pad forward), in beats.
const JUMPS = [4, 4, 8, 8, 16, 16, 32, 32];

/** Short message on the deck's screen ("JUMP +4 takty"), so every jump is visible. */
const notes = new Map<Deck, { text: string; until: number }>();
const note = (d: Deck, text: string) => notes.set(d, { text, until: performance.now() + 1200 });

const beatsLabel = (n: number) =>
  n < 1 ? `1/${Math.round(1 / n)} úderu` : n === 1 ? '1 úder' : n < 5 ? `${n} údery` : `${n} úderů`;
const loopLabel = (d: Deck) => (d.loop?.on ? `LOOP ${beatsLabel(+((d.loop.b - d.loop.a) / d.beatLen).toFixed(2))}` : 'EXIT');

// Memory cues: saved points you can CALL back to later.
function memAdd(d: Deck) {
  const t = d.lib!;
  const p = d.loop?.on ? d.loop.a : d.playing ? d.snap(d.now()) : t.cue;
  if (!t.mem.some((m) => Math.abs(m - p) < 0.05)) t.mem.push(p);
}
function memDelete(d: Deck) {
  const t = d.lib!;
  const p = d.playing ? d.now() : t.cue;
  let best = -1;
  t.mem.forEach((m, i) => (best < 0 || Math.abs(m - p) < Math.abs(t.mem[best] - p)) && (best = i));
  if (best >= 0) t.mem.splice(best, 1);
}

function beatJump(d: Deck, beats: number) {
  d.seek(d.now() + beats * d.beatLen);
  const n = Math.abs(beats);
  const size = n < 4 ? `${n} úder` : n === 4 ? '1 takt' : `${n / 4} takty`.replace(/^8 takty/, '8 taktů');
  note(d, `JUMP ${beats > 0 ? '▶ +' : '◀ −'}${size}`);
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

const deckOf = (el: Element): Deck | undefined => {
  const d = el.closest<HTMLElement>('[data-deck]')?.dataset.deck;
  return d === undefined ? undefined : decks[+d];
};
const txt = (el: Element | null | undefined, s: string) => el && el.textContent !== s && (el.textContent = s);
const label = (el: Element, s: string) => txt(el.querySelector('.in'), s);

function listFor(d: Deck): Lib[] {
  if (d.view === 'tags') return library.filter((t) => tags.has(t.i));
  if (!d.filterList || !d.other.lib) return library;
  const bpm = d.other.lib.spec.bpm * d.other.rate();
  return library.filter((t) => Math.abs(t.spec.bpm - bpm) <= 2.5);
}

/* ---------------- continuous controls ---------------- */

/** COLOR knobs snap to the centre with CENTER LOCK on. */
export function adjust(el: SVGElement, v: number) {
  return el.dataset.fn === 'color' && mix.centerLock && Math.abs(v) < 0.12 ? 0 : v;
}

export function control(el: SVGElement) {
  const { fn } = el.dataset;
  const v = +(el.dataset.v ?? 0);
  const ch = +(el.dataset.ch ?? -1);
  const d = deckOf(el);
  switch (fn) {
    case 'trim':
    case 'hi':
    case 'mid':
    case 'low':
    case 'filter':
    case 'color':
    case 'fader':
      mix.knobs[`${fn}:${ch}`] = v;
      if (fn === 'fader') mix.fader[ch] = v;
      E.applyChannel(ch);
      break;
    case 'input':
      mix.input[ch] = Math.abs(v) < 0.25;
      E.applyChannel(ch);
      break;
    case 'xfader':
      mix.xfPos = v;
      E.applyXf();
      break;
    case 'master':
      E.applyMaster(v);
      break;
    case 'tempo':
      d!.slider = 1 + (v - 0.5) * 2 * d!.range;
      decks.forEach((x) => x.retune());
      break;
    case 'hp-mix':
    case 'hp-mix-b':
      hp[fn.endsWith('-b') ? 'B' : 'A'].mix = v;
      E.applyHp();
      break;
    case 'hp-level':
    case 'hp-level-b':
      hp[fn.endsWith('-b') ? 'B' : 'A'].level = v;
      E.applyHp();
      break;
    case 'color-param':
      mix.colorParam = v;
      [0, 1, 2, 3].forEach(E.applyColor);
      break;
    case 'fx-level':
      fx.level = (v + 1) / 2;
      break;
    case 'fx-type':
      fx.type = E.FX_TYPES[clamp(Math.round(v < 0 ? 5 + v * 5 : 5 + v * 8), 0, 13)];
      break;
    case 'fx-time':
      fx.time = v;
      break;
    case 'mic-level':
      mic.level = v;
      E.applyMic();
      break;
    case 'mic-hi':
    case 'mic-low':
      mic[fn === 'mic-hi' ? 'hi' : 'low'] = v;
      E.applyMic();
      break;
    case 'mic-fx-param':
      mic.fxParam = v;
      E.applyMic();
      break;
    case 'mic-reverb-param':
      mic.revParam = v;
      E.applyMic();
      break;
    case 'vinyl-speed':
      d!.brakeT = Math.max(0, v) * 1.5;
      break;
    case 'jog-adjust':
      d!.jogSens = 2 ** v;
      break;
    case 'browse':
      libSel = mod(Math.round(v / 0.25), library.length);
      break;
    case 'rotary': {
      const list = listFor(d!);
      d!.sel = mod(Math.round(v / 0.25), Math.max(1, list.length));
      if (list[d!.sel]) libSel = list[d!.sel].i; // LINK CUE previews this one
      break;
    }
    default:
      return;
  }
  E.fxUpdate();
  ui();
}

/** Knob clicked without turning — the push of a rotary encoder. */
export function click(el: SVGElement) {
  const d = deckOf(el);
  if (el.dataset.fn === 'rotary' && d) {
    if (d.view === 'wave') d.view = 'browse';
    else {
      const t = listFor(d)[d.sel];
      if (t) d.load(t);
    }
  }
  ui();
}

function loadInto(d: Deck, t = library[libSel]) {
  const x = performance.now();
  // Pressing LOAD twice quickly = INSTANT DOUBLES: copy the other deck.
  if (x - d.lastLoad < 400 && d.other.lib) {
    const o = d.other;
    d.load(o.lib!);
    d.pos = o.now();
    if (o.playing) d.play();
  } else d.load(t);
  d.lastLoad = x;
}

/* ---------------- buttons ---------------- */

export function press(el: SVGElement, frac = 0) {
  const { fn = '' } = el.dataset;
  const arg = el.dataset.arg ?? '';
  const ch = +(el.dataset.ch ?? -1);
  const d = deckOf(el);
  const shift = !!d?.shift && fn !== 'shift';
  if (d && fn !== 'shift') d.shift = false;
  if (d && !d.lib && !['eject', 'browse-open', 'tag-list', 'browse-back', 'shift'].includes(fn)) return ui();

  switch (fn) {
    // --- deck ---
    case 'play':
      if (d!.playing) d!.pause();
      else d!.play();
      break;
    case 'cue':
      if (shift) d!.seek(0); // SHIFT + CUE = back to the track start
      else d!.cueDown();
      break;
    case 'shift':
      d!.shift = !d!.shift;
      break;
    case 'sync':
      if (shift) {
        cycleRange(d!, el); // SHIFT + SYNC = tempo range
        break;
      }
      d!.synced = !d!.synced;
      decks.forEach((x) => x.retune());
      if (d!.synced && d!.playing && d!.follows() && d!.other.playing) d!.seek(d!.aligned(d!.now()));
      break;
    case 'tempo-master':
      E.setMaster(d!.i);
      break;
    case 'key-sync':
      d!.keySync = !d!.keySync;
      if (!d!.keySync) d!.key = 0;
      d!.pitch();
      break;
    case 'keylock':
      d!.keylock = !d!.keylock;
      d!.pitch();
      break;
    case 'tempo-reset':
      d!.reset = !d!.reset;
      decks.forEach((x) => x.retune());
      break;
    case 'tempo-range':
      cycleRange(d!, el);
      break;
    case 'quantize':
      d!.quantize = !d!.quantize;
      break;
    case 'slip':
      d!.slip = !d!.slip;
      if (!d!.slip) d!.shadow = undefined;
      break;
    case 'reverse':
      d!.reverse = !d!.reverse;
      if (d!.reverse) {
        d!.slipStart();
        d!.retune();
      } else if (!d!.slipEnd()) d!.retune();
      break;
    case 'jog-mode':
      d!.vinyl = !d!.vinyl;
      break;
    // --- loops: rekordbox's FLX4 mapping and the CDJ-3000's buttons ---
    case 'loop-in': {
      const x = d!;
      if (!x.playing && !x.loop?.on && el.closest('#cdj')) {
        x.lib!.cue = x.snap(x.pos); // CDJ: LOOP IN/CUE while paused sets the cue
        note(x, 'CUE');
        break;
      }
      x.loopIn();
      note(x, x.adjust === 'in' ? 'LOOP IN – doladění jogem' : x.loop?.on ? 'LOOP IN ✓' : 'LOOP IN – teď dej OUT');
      // CDJ: hold LOOP IN for a second = 4-beat auto loop.
      if (el.closest('#cdj') && !x.loop?.on) {
        clearTimeout(x.holdTimer);
        x.holdTimer = window.setTimeout(() => {
          const a = x.pendingIn;
          if (a === undefined) x.beatLoop(4);
          else x.setLoop(a, a + 4 * x.beatLen); // from where IN was pressed
          note(x, 'LOOP 4 údery');
          ui();
        }, 1000);
      }
      break;
    }
    case 'loop-out':
      d!.loopOut();
      note(d!, d!.adjust === 'out' ? 'LOOP OUT – doladění jogem' : d!.loop?.on ? loopLabel(d!) : d!.pendingIn === undefined ? 'Nejdřív IN' : 'OUT musí být za IN');
      break;
    case 'reloop':
      d!.reloop();
      note(d!, d!.loop?.on ? `RELOOP ${loopLabel(d!)}` : 'EXIT');
      break;
    case 'loop-4exit':
      if (shift) d!.reloop();
      else if (d!.loop?.on) d!.exitLoop();
      else d!.beatLoop(4);
      note(d!, d!.loop?.on ? loopLabel(d!) : 'EXIT');
      break;
    case 'loop-auto':
      if (d!.loop?.on) d!.resize(+arg === 4 ? 0.5 : 2);
      else d!.beatLoop(+arg);
      note(d!, loopLabel(d!));
      break;
    case 'loop-call':
      if (d!.loop?.on) {
        d!.resize(+arg < 0 ? 0.5 : 2);
        note(d!, loopLabel(d!));
      } else if (shift) {
        if (+arg < 0) memDelete(d!);
        else memAdd(d!);
        note(d!, +arg < 0 ? 'CUE/LOOP smazán' : 'CUE/LOOP uložen');
      } else d!.call(+arg);
      break;
    case 'jump':
      beatJump(d!, +arg);
      break;
    case 'search':
      d!.seek(d!.now() + +arg * d!.beatLen);
      clearInterval(d!.searchTimer);
      d!.searchTimer = window.setInterval(() => d!.seek(d!.now() + +arg * d!.beatLen * 0.5), 60);
      break;
    case 'start':
      if (d!.now() < 1) d!.load(library[mod(d!.lib!.i - 1, library.length)]);
      else d!.seek(0);
      break;
    case 'next-track':
      d!.load(library[mod(d!.lib!.i + 1, library.length)]);
      break;
    case 'call':
      // CDJ CUE/LOOP CALL: during a loop it sets the loop size instead.
      if (d!.loop?.on) {
        d!.resize(+arg < 0 ? 0.5 : 2);
        note(d!, loopLabel(d!));
      } else d!.call(+arg);
      break;
    case 'mem-add':
      memAdd(d!);
      note(d!, 'MEMORY uloženo');
      break;
    case 'mem-delete':
      memDelete(d!);
      note(d!, 'DELETE');
      break;
    case 'padmode':
      d!.padMode = shift ? ALT[arg] : arg;
      break;
    case 'pad':
      padDown(d!, +arg, shift);
      break;
    case 'hotcue':
      d!.hotDown(+arg);
      break;
    case 'eject':
      d!.pause(0);
      d!.lib = undefined;
      break;
    case 'browse-open':
      d!.view = d!.view === 'browse' ? 'wave' : 'browse';
      d!.sel = 0;
      break;
    case 'tag-list':
      d!.view = d!.view === 'tags' ? 'wave' : 'tags';
      d!.sel = 0;
      break;
    case 'browse-back':
      d!.view = 'wave';
      break;
    case 'tag': {
      const t = d!.view !== 'wave' ? listFor(d!)[d!.sel] : d!.lib;
      if (t) tags.has(t.i) ? tags.delete(t.i) : tags.add(t.i);
      break;
    }
    case 'filter-list':
      d!.filterList = !d!.filterList;
      d!.sel = 0;
      break;
    case 'time-mode':
      d!.remain = !d!.remain;
      break;

    // --- mixer ---
    case 'load':
      loadInto(decks[+arg]);
      break;
    case 'hp-cue':
    case 'hp-cue-b': {
      const h = hp[fn.endsWith('-b') ? 'B' : 'A'];
      h.cue[ch] = !h.cue[ch];
      E.applyHp();
      break;
    }
    case 'hp-master':
    case 'hp-master-b':
      hp[fn.endsWith('-b') ? 'B' : 'A'].master = !hp[fn.endsWith('-b') ? 'B' : 'A'].master;
      E.applyHp();
      break;
    case 'mono-split':
    case 'mono-split-b':
      hp[fn.endsWith('-b') ? 'B' : 'A'].mono = !hp[fn.endsWith('-b') ? 'B' : 'A'].mono;
      E.applyHp();
      break;
    case 'link-cue':
    case 'link-cue-b': {
      const k = fn.endsWith('-b') ? 'B' : 'A';
      E.linkCue(k, !hp[k].link, library[libSel]);
      break;
    }
    case 'smart-cfx':
      mix.smartCfx = !mix.smartCfx;
      [0, 1].forEach(E.applyColor);
      break;
    case 'smart-fader':
      mix.smartFader = !mix.smartFader;
      if (mix.smartFader) decks.forEach((x) => (x.synced = true));
      decks.forEach((x) => x.retune());
      E.applyXf();
      break;
    case 'color-type':
      mix.colorType = mix.colorType === arg ? null : arg;
      [0, 1, 2, 3].forEach(E.applyColor);
      break;
    case 'center-lock':
      mix.centerLock = !mix.centerLock;
      break;
    case 'eq-curve':
      mix.eqKill = mix.eqKill === -60 ? -26 : -60;
      [0, 1, 2, 3].forEach(E.applyChannel);
      break;
    case 'ch-curve':
      mix.chCurve = (mix.chCurve + 1) % 3;
      [0, 1, 2, 3].forEach(E.applyChannel);
      break;
    case 'xf-curve':
      mix.xfCurve = (mix.xfCurve + 1) % 3;
      E.applyXf();
      break;
    case 'xf-assign': {
      const order = ['THRU', 'A', 'B'] as const;
      mix.assign[ch] = order[(order.indexOf(mix.assign[ch]) + 1) % 3];
      el.dataset.state = mix.assign[ch];
      E.applyXf();
      break;
    }

    // --- Beat FX ---
    case 'fx-on':
      fx.on = !fx.on;
      break;
    case 'fx-next':
      fx.type = E.FX_TYPES[(E.FX_TYPES.indexOf(fx.type) + 1) % E.FX_TYPES.length];
      break;
    case 'fx-beat':
      fx.beat = clamp(fx.beat + +arg, 0, E.FX_BEATS.length - 1);
      break;
    case 'fx-ch-cycle': {
      const order = ['0', '1', 'M'];
      fx.target = order[(order.indexOf(fx.target) + 1) % 3];
      break;
    }
    case 'fx-ch': {
      const t = arg === 'MST' ? 'M' : /^\d$/.test(arg) ? String(+arg - 1) : arg;
      fx.target = fx.target === t ? '' : t;
      break;
    }
    case 'fx-auto':
      fx.auto = !fx.auto;
      break;
    case 'tap':
      E.tap();
      break;
    case 'fx-quantize':
      fx.quantize = !fx.quantize;
      break;
    case 'fx-band':
      fx.bands[arg] = !fx.bands[arg];
      break;
    case 'xpad':
      fx.xpad = true;
      fx.beat = Math.round(clamp(frac, 0, 1) * (E.FX_BEATS.length - 1));
      break;

    // --- mic ---
    case 'mic-on':
      void E.micOn(!mic.on).then(ui);
      break;
    case 'talkover':
      mic.talkover = !mic.talkover;
      break;
    case 'mic-fx':
      mic.fx = mic.fx === arg ? '' : arg;
      E.applyMic();
      break;
    case 'mic-reverb':
      mic.reverb = !mic.reverb;
      E.applyMic();
      break;
    default:
      return ui();
  }
  E.fxUpdate();
  ui();
}

function cycleRange(d: Deck, el: Element) {
  d.range = E.RANGES[(E.RANGES.indexOf(d.range) + 1) % E.RANGES.length];
  const tempo = el.parentElement!.querySelector<SVGElement>('[data-fn="tempo"]');
  if (tempo) control(tempo);
}

function padDown(d: Deck, i: number, shift: boolean) {
  const m = d.padMode;
  if (m === 'hot') d.hotDown(i, shift);
  else if (m === 'keyboard') {
    // Hot cue A played at different pitches, like a keyboard.
    d.key = KEYBOARD[i];
    d.pitch();
    if (d.lib!.hot[0] === undefined) d.lib!.hot[0] = d.lib!.cue;
    d.hotDown(0);
  } else if (m === 'jump') beatJump(d, (i % 2 ? 1 : -1) * JUMPS[i]);
  else if (m === 'beatloop') d.beatLoop(BEATLOOP[i]);
  else if (m === 'fx' || m === 'fx2') d.padFxDown(...PAD_FX[m][i]);
  else if (m === 'sampler') E.playSample(i);
  else if (m === 'keyshift') {
    d.key = KEYSHIFT[i];
    d.pitch();
  }
}

/** Pointer released — the end of every "hold" action. */
export function release(el: SVGElement) {
  const { fn } = el.dataset;
  const d = deckOf(el);
  if (fn === 'cue' || fn === 'hotcue') d?.heldUp();
  else if (fn === 'loop-in' && d) clearTimeout(d.holdTimer);
  else if (fn === 'pad' && d) {
    if (d.padMode === 'hot' || d.padMode === 'keyboard') d.heldUp();
    else d.padFxUp();
  } else if (fn === 'search' && d) clearInterval(d.searchTimer);
  else if (fn === 'xpad') {
    fx.xpad = false;
    E.fxUpdate();
  } else return;
  ui();
}

/** X-PAD finger moved: position along the strip = effect length. */
export function slide(el: SVGElement, frac: number) {
  if (el.dataset.fn !== 'xpad') return;
  const b = Math.round(clamp(frac, 0, 1) * (E.FX_BEATS.length - 1));
  if (b === fx.beat) return;
  fx.beat = b;
  E.fxUpdate();
  ui();
}

/* ---------------- jog ---------------- */

/** `inner` = grabbed on the platter (scratch), not the side ring (nudge). */
export function jogStart(el: SVGElement, inner: boolean) {
  const d = deckOf(el);
  // In loop adjust mode the jog moves the loop edge instead of the music.
  if (d && inner && d.vinyl && !d.adjust) d.scratchStart();
}
export function jog(el: SVGElement, deg: number, dt: number) {
  const d = deckOf(el);
  if (!d) return;
  if (d.adjust) d.adjustBy(deg);
  else if (d.scratch) d.scratchMove(deg * d.jogSens, dt);
  else d.nudge(deg);
}
export function jogEnd(el: SVGElement) {
  deckOf(el)?.scratchEnd();
  ui();
}

/* ---------------- listening + library ---------------- */

export function listen(mode: 'master' | 'A' | 'B') {
  mix.listen = mode;
  E.applyHp();
}

export function select(i: number) {
  libSel = i;
  ui();
}

/* ---------------- rigs ---------------- */

/** The visible rig changed — make the sound follow its knobs and faders. */
export function show(r: HTMLElement) {
  rig = r;
  syncAll();
  ui();
}

function syncAll() {
  if (!rig || !E.g) return;
  mix.knobs = {};
  mix.input = [true, true, true, true];
  const flx = rig.id === 'flx4';
  mix.assign = flx ? ['A', 'B', 'THRU', 'THRU'] : ['THRU', 'THRU', 'THRU', 'THRU'];
  rig.querySelectorAll<SVGElement>('[data-fn="xf-assign"]').forEach((el) => (mix.assign[+el.dataset.ch!] = (el.dataset.state as 'A') ?? 'THRU'));
  rig.querySelectorAll<SVGElement>('.knob[data-fn], .fader[data-fn]').forEach((el) => {
    if (el.dataset.fn !== 'browse' && el.dataset.fn !== 'rotary') control(el);
  });
  [0, 1, 2, 3].forEach(E.applyChannel);
  E.applyHp();
}

export async function unlock() {
  const first = !E.ctx;
  const ready = E.start(); // builds the graph synchronously, then loads the pitch shifter
  if (first) {
    syncAll();
    E.applyMic();
    E.fxUpdate();
    ui();
  }
  await ready;
}

/* ---------------- lights ---------------- */

function lit(el: SVGElement, d?: Deck): boolean | undefined {
  const { fn = '' } = el.dataset;
  const arg = el.dataset.arg ?? '';
  const ch = +(el.dataset.ch ?? -1);
  if (d) {
    const t = d.lib;
    switch (fn) {
      case 'play':
        return d.playing;
      case 'cue':
        return !!t && !d.playing;
      case 'loop-in':
        return !!d.loop?.on || d.pendingIn !== undefined;
      case 'loop-out':
      case 'loop-4exit':
        return !!d.loop?.on;
      case 'loop-auto':
        return !!d.loop?.on && Math.abs(d.loop.b - d.loop.a - +arg * d.beatLen) < 0.01;
      case 'reloop':
        return !!d.loop?.b && !d.loop.on;
      case 'sync':
        return d.synced;
      case 'tempo-master':
        return E.masterIdx === d.i;
      case 'key-sync':
        return d.keySync;
      case 'keylock':
        return d.keylock;
      case 'tempo-reset':
        return d.reset;
      case 'quantize':
        return d.quantize;
      case 'slip':
        return d.slip;
      case 'reverse':
        return d.reverse;
      case 'jog-mode':
        return d.vinyl;
      case 'shift':
        return d.shift;
      case 'time-mode':
        return !d.remain;
      case 'filter-list':
        return d.filterList;
      case 'padmode':
        return d.padMode === arg || d.padMode === ALT[arg];
      case 'pad':
        return d.padMode === 'hot' ? t?.hot[+arg] !== undefined : !!d.padMode;
      case 'hotcue':
        return t?.hot[+arg] !== undefined;
      case 'browse-open':
        return d.view === 'browse';
      case 'tag-list':
        return d.view === 'tags';
    }
  }
  const k = fn.endsWith('-b') ? 'B' : 'A';
  switch (fn) {
    case 'hp-cue':
    case 'hp-cue-b':
      return hp[k].cue[ch];
    case 'hp-master':
    case 'hp-master-b':
      return hp[k].master;
    case 'mono-split':
    case 'mono-split-b':
      return hp[k].mono;
    case 'link-cue':
    case 'link-cue-b':
      return hp[k].link;
    case 'smart-cfx':
      return mix.smartCfx;
    case 'smart-fader':
      return mix.smartFader;
    case 'color-type':
      return mix.colorType === arg;
    case 'center-lock':
      return mix.centerLock;
    case 'eq-curve':
      return mix.eqKill === -26;
    case 'fx-on':
      return fx.on || fx.xpad;
    case 'fx-ch': {
      const t = arg === 'MST' ? 'M' : /^\d$/.test(arg) ? String(+arg - 1) : arg;
      return fx.target === t;
    }
    case 'fx-auto':
      return !fx.auto;
    case 'fx-quantize':
      return fx.quantize;
    case 'fx-band':
      return fx.bands[arg];
    case 'mic-on':
      return mic.on;
    case 'talkover':
      return mic.talkover;
    case 'mic-fx':
      return mic.fx === arg;
    case 'mic-reverb':
      return mic.reverb;
  }
  return undefined;
}

export function ui() {
  if (!rig) return;
  rig.querySelectorAll<SVGElement>('.ctl[data-fn]').forEach((el) => {
    const d = deckOf(el);
    const l = lit(el, d);
    if (l !== undefined) el.classList.toggle('on', l);
    // IN / OUT blink while their loop edge is being adjusted with the jog.
    if (d && (el.dataset.fn === 'loop-in' || el.dataset.fn === 'loop-out')) el.classList.toggle('blink', d.adjust === el.dataset.fn.slice(5));
    const { fn } = el.dataset;
    if (fn === 'tempo-range' && d) label(el, d.range === 1 ? 'WIDE' : `±${d.range * 100}%`);
    else if (fn === 'xf-assign') label(el, mix.assign[+el.dataset.ch!]);
    else if (fn === 'ch-curve') label(el, `CH ${['⌐', '/', '⌒'][mix.chCurve]}`);
    else if (fn === 'xf-curve') label(el, `XF ${['⌒', '/', '⊓'][mix.xfCurve]}`);
    else if (fn === 'eq-curve') label(el, mix.eqKill === -60 ? 'ISO' : 'EQ');
    else if (fn === 'fx-ch-cycle') label(el, `FX → ${fx.target === 'M' ? 'M' : +fx.target + 1}`);
    else if (fn === 'fx-display') txt(el.querySelector('.scr'), `${fx.on || fx.xpad ? '● ' : ''}${fx.type} ${E.FX_BEAT_LABEL[fx.beat]} · ${Math.round(E.fxBpm())}${fx.auto ? '' : ' TAP'}`);
  });
  rig.querySelectorAll<HTMLElement>('[data-deck]').forEach((gr) => {
    const d = decks[+gr.dataset.deck!];
    gr.toggleAttribute('data-playing', d.running && !d.scratch);
    gr.toggleAttribute('data-reverse', d.dir < 0);
  });
  const target = fx.target === 'M' ? 'MASTER' : fx.target === '' ? '–' : fx.target === 'MIC' || fx.target.startsWith('CF') ? fx.target : `CH ${+fx.target + 1}`;
  document.querySelectorAll('.fxline').forEach((e) => txt(e, `Beat FX: ${fx.type} · ${E.FX_BEAT_LABEL[fx.beat]} beat · ${target}${fx.on ? ' · ON' : ''}`));
  libList();
}

function libList() {
  const ol = document.querySelector<HTMLElement>('.lib');
  if (!ol) return;
  const html = library
    .map((t) => {
      const on = decks.map((d, i) => (d.lib === t ? `<b>D${i + 1}</b>` : '')).join('');
      return `<li data-i="${t.i}" class="${t.i === libSel ? 'sel' : ''}">${tags.has(t.i) ? '★ ' : ''}${t.spec.title}<span>${t.spec.style} · ${t.spec.bpm} BPM · ${t.spec.key}${on}</span></li>`;
    })
    .join('');
  if (ol.dataset.html !== html) {
    ol.innerHTML = html;
    ol.dataset.html = html;
  }
}

/* ---------------- screens ---------------- */

type View = { g: SVGGElement; deck: Deck; x: number; y: number; w: number; h: number; els: Record<string, SVGElement>; ov?: Lib; list?: string };
let views: View[] = [];

function mount(gr: SVGGElement): View {
  const [x, y, w, h] = gr.dataset.box!.split(' ').map(Number);
  const fs = h * 0.085;
  const zy = y + h * 0.16;
  const zh = h * 0.5;
  const oy = y + h * 0.72;
  gr.innerHTML = `
    <g class="wv-main">
      <rect class="wv-bg" x="${x}" y="${zy}" width="${w}" height="${zh}"/>
      <path class="wv-loop"/><path class="wv-wave"/><path class="wv-grid"/><path class="wv-bar"/><g class="wv-marks"></g>
      <line class="wv-head" x1="${x + w / 2}" x2="${x + w / 2}" y1="${zy}" y2="${zy + zh}"/>
      <rect class="wv-bg" x="${x}" y="${oy}" width="${w}" height="${h * 0.14}"/>
      <path class="wv-ov"/><line class="wv-ovhead" y1="${oy}" y2="${oy + h * 0.14}"/>
      <text class="wv-t wv-big" x="${x + 1}" y="${y + h - 1}" font-size="${fs * 1.3}"></text>
      <text class="wv-t wv-r" x="${x + w - 1}" y="${y + h - 1}" font-size="${fs}"></text>
    </g>
    <g class="wv-list" display="none"></g>
    <text class="wv-t" x="${x + 1}" y="${y + fs}" font-size="${fs}">Načítám…</text>
    <text class="wv-t wv-r" x="${x + w - 1}" y="${y + fs}" font-size="${fs}"></text>`;
  const q = (s: string) => gr.querySelector<SVGElement>(s)!;
  const t = gr.querySelectorAll<SVGElement>('text');
  return {
    g: gr,
    deck: decks[+gr.closest<HTMLElement>('[data-deck]')!.dataset.deck!],
    x,
    y,
    w,
    h,
    els: { main: q('.wv-main'), list: q('.wv-list'), loop: q('.wv-loop'), wave: q('.wv-wave'), grid: q('.wv-grid'), bar: q('.wv-bar'), marks: q('.wv-marks'), ov: q('.wv-ov'), ovhead: q('.wv-ovhead'), time: t[0], tempo: t[1], title: t[2], bpm: t[3] },
  };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const COLORS = ['#3ee07a', '#ff4d7a', '#ff9a2e', '#ffd84d', '#4db8ff', '#b47bff', '#ff5fc0', '#5be3ff'];

function draw(v: View) {
  const { deck: d, x, y, w, h, els } = v;
  const t = d.lib;
  const listMode = d.view !== 'wave';
  els.main.setAttribute('display', listMode || !t?.peaks ? 'none' : 'inline');
  els.list.setAttribute('display', listMode ? 'inline' : 'none');
  if (listMode) return drawList(v);
  if (!t?.peaks) {
    txt(els.title, t ? 'Načítám…' : 'Žádná skladba – BROWSE / LOAD');
    txt(els.bpm, '');
    return;
  }
  const peaks = t.peaks;
  const zy = y + h * 0.16;
  const zh = h * 0.5;
  const zc = zy + zh / 2;
  const span = 6;
  const p = d.now();
  const left = p - span / 2;
  const X = (s: number) => x + ((s - left) / span) * w;

  if (v.ov !== t) {
    // Overview: the whole track squeezed into the strip, built once per track.
    v.ov = t;
    const oy = y + h * 0.79;
    const cols = Math.floor(w);
    const per = peaks.length / cols;
    let top = '';
    let bottom = '';
    for (let c = 0; c < cols; c++) {
      let m = 0;
      for (let i = Math.floor(c * per); i < (c + 1) * per; i++) m = Math.max(m, peaks[i] ?? 0);
      top += `${c ? 'L' : 'M'}${(x + c).toFixed(1)},${(oy - m * h * 0.07).toFixed(2)}`;
      bottom = `L${(x + c).toFixed(1)},${(oy + m * h * 0.07).toFixed(2)}` + bottom;
    }
    els.ov.setAttribute('d', `${top}${bottom}Z`);
  }
  const msg = notes.get(d);
  const showMsg = !!msg && msg.until > performance.now();
  txt(els.title, showMsg ? msg!.text : t.spec.title);
  els.title.classList.toggle('wv-note', showMsg);

  let top = '';
  let bottom = '';
  const i0 = Math.max(0, Math.floor(left / E.BIN));
  const i1 = Math.min(peaks.length - 1, Math.ceil((left + span) / E.BIN));
  for (let i = i0; i <= i1; i++) {
    const px = X(i * E.BIN).toFixed(2);
    const a = peaks[i] * zh * 0.48;
    top += `${i === i0 ? 'M' : 'L'}${px},${(zc - a).toFixed(2)}`;
    bottom = `L${px},${(zc + a).toFixed(2)}` + bottom;
  }
  els.wave.setAttribute('d', i1 > i0 ? `${top}${bottom}Z` : '');

  let grid = '';
  let bars = '';
  const bl = d.beatLen;
  for (let k = Math.max(0, Math.ceil(left / bl)); k * bl <= left + span; k++) {
    const seg = `M${X(k * bl).toFixed(2)},${zy}V${zy + zh}`;
    if (k % 4) grid += seg;
    else bars += seg;
  }
  els.grid.setAttribute('d', grid);
  els.bar.setAttribute('d', bars);

  const l = d.loop;
  els.loop.setAttribute('d', l?.b ? `M${X(l.a)},${zy}H${X(l.b)}V${zy + zh}H${X(l.a)}Z` : '');
  els.loop.classList.toggle('on', !!l?.on);
  const tri = (s: number, c: string, up = false) => `<path d="M${X(s) - w / 120},${up ? zy + zh : zy}h${w / 60}l${-w / 120},${up ? -w / 80 : w / 80}z" fill="${c}"/>`;
  els.marks.innerHTML =
    tri(t.cue, '#ff9a2e') +
    (d.pendingIn === undefined ? '' : `<path d="M${X(d.pendingIn)},${zy}V${zy + zh}" stroke="#ff9a2e" stroke-width="${w / 250}" stroke-dasharray="${w / 200}"/>`) +
    t.mem.map((m) => tri(m, '#ff4d4d', true)).join('') +
    t.hot.map((hc, i) => (hc === undefined ? '' : `<path d="M${X(hc)},${zy}V${zy + zh}" stroke="${COLORS[i]}" stroke-width="${w / 300}"/>`)).join('');

  const ox = x + (p / d.dur) * w;
  els.ovhead.setAttribute('x1', String(ox));
  els.ovhead.setAttribute('x2', String(ox));
  const bpm = t.spec.bpm * d.rate();
  const key = d.keySync || d.key ? ` · ${d.key > 0 ? '+' : ''}${d.key}` : '';
  txt(els.bpm, `${bpm.toFixed(1)} BPM · ${t.spec.key}${key}${E.masterIdx === d.i ? ' · M' : ''}`);
  txt(els.time, d.remain ? `-${fmt(d.dur - p)}` : fmt(p));
  const pct = (d.rate() - 1) * 100;
  txt(els.tempo, `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%${d.follows() ? ' SYNC' : ''}${d.keylock ? ' MT' : ''}${d.slip ? ' SLIP' : ''}`);
}

function drawList(v: View) {
  const { deck: d, x, y, w, h, els } = v;
  const items = listFor(d);
  txt(els.title, d.view === 'tags' ? 'TAG LIST' : d.filterList ? 'BROWSE · TRACK FILTER' : 'BROWSE · USB');
  txt(els.bpm, 'ROTARY = vybrat, klik = LOAD');
  const fs = h * 0.085;
  const rowH = h * 0.18;
  const html =
    items
      .map((t, i) => {
        const ry = y + h * 0.16 + i * rowH;
        const sel = i === d.sel;
        return `<rect x="${x}" y="${ry}" width="${w}" height="${rowH - 1}" fill="${sel ? '#1d4fa8' : '#0a0c12'}"/>
          <text class="wv-t" x="${x + 2}" y="${ry + rowH * 0.66}" font-size="${fs}">${tags.has(t.i) ? '★ ' : ''}${t.spec.title}</text>
          <text class="wv-t wv-r" x="${x + w - 2}" y="${ry + rowH * 0.66}" font-size="${fs}">${t.spec.bpm} · ${t.spec.key}</text>`;
      })
      .join('') || `<text class="wv-t" x="${x + 2}" y="${y + h * 0.3}" font-size="${fs}">Prázdné – TAG TRACK přidá skladbu</text>`;
  if (v.list !== html) {
    els.list.innerHTML = html;
    v.list = html;
  }
}

/* ---------------- meters + loop ---------------- */

const levels: Record<string, number> = {};
function meters() {
  if (!rig || !E.g) return;
  rig.querySelectorAll<SVGElement>('[data-fn="meter"]').forEach((m) => {
    const ch = +m.dataset.ch!;
    const peak = E.level(ch < 0 ? E.g!.masterAna : E.g!.chans[ch]?.ana);
    const k = m.dataset.ch!;
    levels[k] = Math.max(clamp((20 * Math.log10(peak + 1e-6) + 36) / 36, 0, 1), (levels[k] ?? 0) * 0.94);
    const leds = m.querySelectorAll<SVGElement>('.led');
    const on = Math.round(levels[k] * leds.length);
    leds.forEach((led, i) => (led.style.opacity = leds.length - i <= on ? '1' : '0.18'));
  });
}

let frameN = 0;
function frame() {
  views.forEach((v) => {
    if (!v.g.closest('[hidden]')) draw(v);
  });
  meters();
  E.tick();
  if (++frameN % 15 === 0) ui();
  requestAnimationFrame(frame);
}

/** Mount the screens, then render the library (first two tracks first). */
export async function init(r: HTMLElement) {
  rig = r;
  E.onStateChange(ui);
  views = [...document.querySelectorAll<SVGGElement>('g.wv')].map(mount);
  document.querySelector('.lib')?.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[data-i]');
    if (li) select(+li.dataset.i!);
  });
  requestAnimationFrame(frame);
  for (const t of library) {
    await new Promise((res) => setTimeout(res, 30)); // let the page paint between tracks
    E.render(t);
    if (t.i < 2) decks[t.i].load(t);
    ui();
  }
}
