/**
 * The two practice rigs on /macicek, drawn top-down in millimetres from the
 * real units' footprints. Positions are a faithful-enough schematic, not a
 * CAD trace — nudge any `x`/`y` here and `Gear.astro` redraws it.
 *
 * k: btn (rect button) · rbtn (round button) · pad · knob · fader · jog ·
 *    screen · meter
 * t: what's printed on the panel · n/d: tooltip title and description
 *
 * Descriptions are short and assume the reader knows DJ basics. `\n` starts
 * a new paragraph.
 */
export type Item = {
  k: 'btn' | 'rbtn' | 'pad' | 'knob' | 'fader' | 'jog' | 'screen' | 'meter';
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  len?: number;
  /** Fader cap position, 0 = top/left. */
  v?: number;
  t?: string;
  n: string;
  d: string;
  /** LED colour when lit. */
  c?: string;
  toggle?: boolean;
  /** Radio group within one deck — lighting one clears the rest. */
  grp?: string;
  on?: boolean;
  /** What it does in the audio engine (scripts/dj.ts), plus its channel / argument. */
  fn?: string;
  ch?: number;
  arg?: string | number;
  dir?: 'h';
  wave?: boolean;
  /** Rotary encoder: turns forever instead of stopping at ±150°. */
  endless?: boolean;
};
export type Part = { deck?: number; items: Item[] };
export type Unit = { name: string; x: number; y: number; w: number; h: number; z: number; parts: Part[] };
export type Rig = { id: string; label: string; w: number; h: number; units: Unit[] };

const ORANGE = '#ff9a2e';
const GREEN = '#3ee07a';
const RED = '#ff4d4d';
const CYAN = '#5be3ff';
const PADS = ['#3ee07a', '#ff4d7a', '#ff9a2e', '#ffd84d', '#4db8ff', '#b47bff', '#ff5fc0', '#5be3ff'];

const shift = (items: Item[], ox: number) => items.map((i) => ({ ...i, x: i.x + ox }));

/* Shared texts — the same idea shows up on all three units. */
const T = {
  loopIn: 'Začátek smyčky. Při běžící smyčce: doladění začátku jogem, dalším IN potvrdíš.',
  loopOut: 'Konec smyčky, smyčka se hned spustí. Při běžící smyčce: doladění konce jogem.',
  reloop: 'Smyčka běží: vypne ji. Neběží: vrátí se do poslední smyčky.',
  sync: 'Srovná tempo a beatgrid s druhým deckem.',
  tempo: 'Tempo. Nahoru pomaleji, dolů rychleji.',
  cue: 'Stojí: uloží cue. Hraje: skočí na cue a zastaví. Držení: hraje od cue, pustíš = zpět.',
  play: 'Play / pauza.',
  hotCue: 'Prázdný: uloží hot cue. Plný: skočí na něj. Když deck stojí, hraje jen při držení.',
  trim: 'Gain kanálu. Meter drž v oranžové.',
  hi: 'Výšky.',
  mid: 'Středy.',
  low: 'Basy.',
  meter: 'Úroveň kanálu. Červená = clip.',
  chFader: 'Hlasitost kanálu.',
  headCue: 'Kanál do sluchátek. Na webu přepni poslech na 🎧 Sluchátka.',
  master: 'Celková hlasitost.',
  fxLevel: 'Dry/wet efektu.',
  fxOn: 'Zapne / vypne Beat FX.',
  crossfader: 'Prolínání mezi stranami A a B.',
  phones: 'Hlasitost sluchátek.',
  phonesMix: 'Doleva CUE, doprava master.',
};

/* ---------------- DDJ-FLX4 ---------------- */

const flxDeck = (ox: number, no: number): Part => ({
  deck: no - 1,
  items: shift(
    [
      { k: 'btn', x: 10, y: 28, w: 22, h: 9, t: 'IN', fn: 'loop-in', n: 'LOOP IN', d: T.loopIn },
      { k: 'btn', x: 35, y: 28, w: 22, h: 9, t: 'OUT', n: 'LOOP OUT', fn: 'loop-out', d: T.loopOut },
      { k: 'btn', x: 60, y: 28, w: 26, h: 9, t: '4 BEAT/EXIT', n: '4 BEAT / EXIT', fn: 'loop-4exit', d: 'Spustí 4beat smyčku, při běžící smyčce ji ukončí. SHIFT: reloop.' },
      { k: 'btn', x: 92, y: 28, w: 16, h: 9, t: '◁ ½X', n: 'CUE/LOOP CALL ◁ (1/2X)', fn: 'loop-call', arg: -1, d: 'Bez smyčky: předchozí memory cue. Smyčka: půlka. SHIFT: smaže memory cue.' },
      { k: 'btn', x: 111, y: 28, w: 16, h: 9, t: '2X ▷', n: 'CUE/LOOP CALL ▷ (2X)', fn: 'loop-call', arg: 1, d: 'Bez smyčky: další memory cue. Smyčka: dvojnásobek. SHIFT: uloží memory cue.' },
      { k: 'btn', x: 136, y: 28, w: 26, h: 9, t: 'SYNC', n: 'BEAT SYNC', fn: 'sync', d: `${T.sync}\nSHIFT: tempo range.`, toggle: true, c: ORANGE },
      { k: 'fader', x: 149, y: 50, len: 100, v: 0.5, t: 'TEMPO', n: 'TEMPO slider', fn: 'tempo', d: T.tempo },
      { k: 'jog', x: 70, y: 104, r: 50, n: `JOG wheel (deck ${no})`, fn: 'jog', d: 'Bok = pitch bend, vršek = scratch.\nNa webu: vnější okraj = bend, vnitřek = scratch.' },
      { k: 'btn', x: 8, y: 168, w: 28, h: 8, t: 'SHIFT', n: 'SHIFT', fn: 'shift', d: 'Druhé funkce tlačítek. Na webu klikni na SHIFT a pak na tlačítko.' },
      { k: 'rbtn', x: 22, y: 196, r: 11, t: 'CUE', n: 'CUE', d: T.cue, fn: 'cue', c: ORANGE },
      { k: 'rbtn', x: 22, y: 232, r: 11, t: '▶❚❚', n: 'PLAY / PAUSE', d: T.play, fn: 'play', c: GREEN },
      { k: 'btn', x: 44, y: 168, w: 28, h: 8, t: 'HOT CUE', n: 'HOT CUE', fn: 'padmode', arg: 'hot', d: 'Pady = hot cues.', grp: 'mode', on: true, c: CYAN },
      { k: 'btn', x: 75, y: 168, w: 28, h: 8, t: 'PAD FX', n: 'PAD FX', fn: 'padmode', arg: 'fx', d: 'Pady = efekty, hrají při držení. SHIFT: druhá sada.', grp: 'mode', c: CYAN },
      { k: 'btn', x: 106, y: 168, w: 28, h: 8, t: 'BEAT JUMP', n: 'BEAT JUMP', fn: 'padmode', arg: 'jump', d: 'Pady = beat jump ◀4▶ ◀8▶ / ◀16▶ ◀32▶. SHIFT: BEAT LOOP.', grp: 'mode', c: CYAN },
      { k: 'btn', x: 137, y: 168, w: 28, h: 8, t: 'SAMPLER', n: 'SAMPLER', fn: 'padmode', arg: 'sampler', d: 'Pady = sampler. SHIFT: KEY SHIFT.', grp: 'mode', c: CYAN },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(
        (i): Item => ({
          k: 'pad',
          x: 44 + (i % 4) * 31,
          y: i < 4 ? 180 : 204,
          w: 28,
          h: 21,
          n: `PAD ${i + 1}`,
          fn: 'pad',
          arg: i,
          d: 'HOT CUE: uloží / skočí, SHIFT smaže.\nPAD FX: ECHO 1/2, 3/4, ROLL 1/4, 1/8, TRANS, HPF, REVERB, BRAKE. SHIFT: ECHO 1, 1/4, ROLL 1/16, 1/2, TRANS 1/8, LPF, REVERB, SPIN.\nBEAT JUMP: ◀▶ 4, 8, 16, 32 dob. SHIFT: BEAT LOOP 1/4–32.\nSAMPLER: air horn, siren, rewind… SHIFT: KEY SHIFT +1…+4 / −1…−3 / reset.\nSHIFT + HOT CUE: KEYBOARD.',
          c: PADS[i],
        }),
      ),
    ],
    ox,
  ),
});

const flxMixer: Part = {
  items: [
    { k: 'btn', x: 178, y: 12, w: 24, h: 9, t: 'LOAD', n: 'LOAD (deck 1)', fn: 'load', arg: 0, d: 'Nahraje vybraný track do decku 1. Dvojklik: instant doubles.' },
    { k: 'knob', x: 241, y: 16.5, r: 9, t: 'BROWSE', n: 'BROWSE', fn: 'browse', endless: true, d: 'Pohyb v knihovně, stisk otevře složku. SHIFT: přepínání seznamů.' },
    { k: 'btn', x: 280, y: 12, w: 24, h: 9, t: 'LOAD', n: 'LOAD (deck 2)', fn: 'load', arg: 1, d: 'Nahraje vybraný track do decku 2. Dvojklik: instant doubles.' },
    ...[203, 279].flatMap((c, i): Item[] => [
      { k: 'knob', x: c, y: 44, r: 7, t: 'TRIM', n: `TRIM (CH ${i + 1})`, fn: 'trim', ch: i, d: T.trim },
      { k: 'knob', x: c, y: 66, r: 7, t: 'HI', n: `EQ HI (CH ${i + 1})`, fn: 'hi', ch: i, d: T.hi },
      { k: 'knob', x: c, y: 88, r: 7, t: 'MID', n: `EQ MID (CH ${i + 1})`, fn: 'mid', ch: i, d: T.mid },
      { k: 'knob', x: c, y: 110, r: 7, t: 'LOW', n: `EQ LOW (CH ${i + 1})`, fn: 'low', ch: i, d: T.low },
      { k: 'knob', x: c, y: 133, r: 8, t: 'CFX', n: `CFX (CH ${i + 1})`, fn: 'filter', ch: i, d: 'Color FX. Doleva LPF, doprava HPF, střed = vypnuto.' },
      { k: 'btn', x: c - 11, y: 152, w: 22, h: 8, t: 'CUE', n: `HEADPHONES CUE (CH ${i + 1})`, fn: 'hp-cue', ch: i, d: T.headCue, toggle: true, c: ORANGE },
      { k: 'meter', x: i ? c - 15 : c + 11, y: 170, h: 56, n: `CH LEVEL INDICATOR (CH ${i + 1})`, fn: 'meter', ch: i, d: T.meter },
      { k: 'fader', x: c, y: 170, len: 56, v: i ? 1 : 0.15, t: `CH ${i + 1}`, n: `CHANNEL FADER (CH ${i + 1})`, fn: 'fader', ch: i, d: T.chFader },
    ]),
    { k: 'knob', x: 241, y: 44, r: 7, t: 'MASTER', n: 'MASTER LEVEL', fn: 'master', d: T.master },
    { k: 'btn', x: 230, y: 60, w: 22, h: 8, t: 'M.CUE', n: 'MASTER CUE', fn: 'hp-master', d: 'Master do sluchátek.', toggle: true, c: ORANGE },
    { k: 'knob', x: 241, y: 84, r: 7, t: 'HP MIX', n: 'HEADPHONES MIX', fn: 'hp-mix', d: T.phonesMix },
    { k: 'knob', x: 241, y: 106, r: 7, t: 'HP LEVEL', n: 'HEADPHONES LEVEL', fn: 'hp-level', d: T.phones },
    { k: 'btn', x: 227, y: 126, w: 28, h: 8, t: 'SMART CFX', n: 'SMART CFX', fn: 'smart-cfx', d: 'CFX knoby ovládají kombinované efekty.', toggle: true, c: CYAN },
    { k: 'btn', x: 227, y: 140, w: 28, h: 8, t: 'SMART FADER', n: 'SMART FADER', fn: 'smart-fader', d: 'Crossfader sám srovná tempo a stáhne basy.', toggle: true, c: CYAN },
    { k: 'fader', x: 211, y: 250, len: 60, v: 0.5, dir: 'h', t: 'CROSSFADER', n: 'CROSSFADER', fn: 'xfader', d: T.crossfader },
    // Beat FX strip, top right
    { k: 'btn', x: 322, y: 9, w: 16, h: 9, t: '◀', n: 'BEAT ◀', fn: 'fx-beat', arg: -1, d: 'Kratší efekt (v dobách).' },
    { k: 'btn', x: 341, y: 9, w: 16, h: 9, t: '▶', n: 'BEAT ▶', fn: 'fx-beat', arg: 1, d: 'Delší efekt (v dobách).' },
    { k: 'btn', x: 360, y: 9, w: 26, h: 9, t: 'FX SEL', n: 'FX SELECT', fn: 'fx-next', d: 'Výběr Beat FX (název je v rekordboxu).' },
    { k: 'btn', x: 390, y: 9, w: 30, h: 9, t: 'FX → M', n: 'FX CH SELECT', fn: 'fx-ch-cycle', d: 'Kam jde Beat FX: kanál 1, 2, nebo master.' },
    { k: 'knob', x: 430, y: 13.5, r: 6, t: 'LEVEL', n: 'LEVEL / DEPTH', fn: 'fx-level', d: T.fxLevel },
    { k: 'btn', x: 444, y: 9, w: 30, h: 9, t: 'ON/OFF', n: 'BEAT FX ON/OFF', fn: 'fx-on', d: T.fxOn, toggle: true, c: RED },
  ],
};

const flx4: Rig = {
  id: 'flx4',
  label: 'DDJ-FLX4',
  w: 482,
  h: 272,
  units: [{ name: 'DDJ-FLX4', x: 0, y: 0, w: 482, h: 272, z: 59, parts: [flxDeck(0, 1), flxMixer, flxDeck(312, 2)] }],
};

/* ---------------- CDJ-3000 ---------------- */

const cdj = (no: number): Part => ({
  deck: no - 1,
  items: [
    { k: 'screen', x: 12, y: 8, w: 24, h: 8, t: 'USB', n: 'USB', d: 'USB s rekordbox exportem. Na webu už zasunutá.' },
    { k: 'btn', x: 40, y: 8, w: 22, h: 8, t: 'USB STOP', n: 'USB STOP', fn: 'eject', d: 'Bezpečné odpojení USB.' },
    { k: 'screen', x: 66, y: 9.5, w: 30, h: 5, t: 'SD', n: 'SD', d: 'SD slot. Na webu nefunguje.' },
    { k: 'btn', x: 232, y: 8, w: 28, h: 9, t: 'SLIP', n: 'SLIP', fn: 'slip', d: 'Track běží na pozadí dál, po scratchi nebo smyčce pokračuje tam, kde by byl.', toggle: true, c: RED },
    { k: 'btn', x: 264, y: 8, w: 32, h: 9, t: 'QUANTIZE', fn: 'quantize', n: 'QUANTIZE', d: 'Cue, smyčky a skoky se zarovnají na beat.', toggle: true, on: true, c: RED },
    ...['SOURCE', 'BROWSE', 'TAG LIST', 'PLAYLIST', 'SEARCH', 'MENU'].map(
      (t, i): Item => ({
        k: 'btn',
        x: 10,
        y: 30 + i * 16,
        w: 42,
        h: 11,
        t,
        n: t,
        fn: t === 'TAG LIST' ? 'tag-list' : t === 'MENU' ? undefined : 'browse-open',
        d: ['Zdroj: USB, SD, nebo Link z druhého CDJ.', 'Knihovna.', 'Tag list.', 'Playlisty.', 'Hledání.', 'Nastavení. Na webu nefunguje.'][i],
      }),
    ),
    { k: 'screen', x: 60, y: 28, w: 208, h: 117, n: 'TOUCH DISPLAY', d: 'Waveform, BPM, čas, knihovna.', wave: true },
    { k: 'knob', x: 297, y: 44, r: 13, t: 'ROTARY', n: 'ROTARY SELECTOR', fn: 'rotary', endless: true, d: 'Pohyb v seznamu, stisk = výběr / load.\nNa webu: táhni nahoru/dolů, klik = load.' },
    ...['BACK', 'TAG TRACK', 'TRACK FILTER', 'SHORTCUT', 'TIME MODE'].map(
      (t, i): Item => ({
        k: 'btn',
        x: 274,
        y: 64 + i * 14,
        w: 46,
        h: 10,
        t,
        n: t,
        fn: ['browse-back', 'tag', 'filter-list', 'browse-open', 'time-mode'][i],
        d: ['Zpět.', 'Přidá track do Tag listu.', 'Filtr podle tempa a tóniny aktuálního tracku.', 'Zkratky v knihovně.', 'Elapsed / remain.'][i],
      }),
    ),
    ...'ABCDEFGH'.split('').map(
      (t, i): Item => ({
        k: 'pad',
        x: 61 + i * 26.6,
        y: 151,
        w: 22,
        h: 12,
        t,
        n: `HOT CUE ${t}`,
        fn: 'hotcue',
        arg: i,
        d: T.hotCue,
        c: PADS[i],
      }),
    ),
    { k: 'btn', x: 10, y: 172, w: 30, h: 10, t: 'IN', n: 'LOOP IN / CUE', fn: 'loop-in', d: `${T.loopIn}\nDržení 1 s = 4beat smyčka. Deck stojí = uloží cue.` },
    { k: 'btn', x: 44, y: 172, w: 30, h: 10, t: 'OUT', n: 'LOOP OUT', fn: 'loop-out', d: T.loopOut },
    { k: 'btn', x: 78, y: 172, w: 34, h: 10, t: 'RELOOP', n: 'RELOOP / EXIT', fn: 'reloop', d: T.reloop },
    { k: 'btn', x: 120, y: 172, w: 22, h: 10, t: '◀ JUMP', n: 'BEAT JUMP ◀', fn: 'jump', arg: -16, d: 'Skok o 16 dob zpět.' },
    { k: 'btn', x: 146, y: 172, w: 22, h: 10, t: 'JUMP ▶', n: 'BEAT JUMP ▶', fn: 'jump', arg: 16, d: 'Skok o 16 dob vpřed.' },
    { k: 'btn', x: 176, y: 172, w: 20, h: 10, t: '◀ CALL', n: 'CUE/LOOP CALL ◀', fn: 'call', arg: -1, d: 'Bez smyčky: předchozí memory cue. Smyčka: půlka.' },
    { k: 'btn', x: 198, y: 172, w: 20, h: 10, t: 'CALL ▶', n: 'CUE/LOOP CALL ▶', fn: 'call', arg: 1, d: 'Bez smyčky: další memory cue. Smyčka: dvojnásobek.' },
    { k: 'btn', x: 78, y: 186, w: 16, h: 8, t: '4 BEAT', n: '4 BEAT / LOOP CUTTER', fn: 'loop-auto', arg: 4, d: 'Bez smyčky: 4beat smyčka. Smyčka: půlka.' },
    { k: 'btn', x: 96, y: 186, w: 16, h: 8, t: '8 BEAT', n: '8 BEAT / LOOP DOUBLE', fn: 'loop-auto', arg: 8, d: 'Bez smyčky: 8beat smyčka. Smyčka: dvojnásobek.' },
    { k: 'btn', x: 220, y: 172, w: 30, h: 10, t: 'DELETE', n: 'DELETE', fn: 'mem-delete', d: 'Smaže aktuální memory cue.' },
    { k: 'btn', x: 254, y: 172, w: 34, h: 10, t: 'MEMORY', n: 'MEMORY', fn: 'mem-add', d: 'Uloží cue nebo smyčku jako memory cue.' },
    { k: 'jog', x: 158, y: 300, r: 96, n: `JOG wheel (CDJ ${no})`, fn: 'jog', d: 'Vršek = scratch (ve VINYL), bok = pitch bend.\nNa webu: vnější okraj = bend, vnitřek = scratch.' },
    { k: 'btn', x: 8, y: 196, w: 44, h: 10, t: 'REV · FWD', n: 'DIRECTION', fn: 'reverse', d: 'Reverse.', toggle: true, c: RED },
    { k: 'btn', x: 8, y: 212, w: 44, h: 10, t: 'VINYL', n: 'JOG MODE', fn: 'jog-mode', d: 'VINYL: vršek scratchuje. CDJ: vršek jen dolaďuje tempo.', toggle: true, on: true, c: CYAN },
    { k: 'knob', x: 20, y: 238, r: 8, t: 'TOUCH', n: 'VINYL SPEED ADJUST', fn: 'vinyl-speed', d: 'Rychlost rozjezdu a brzdy při play/pauze a doteku jogu.' },
    { k: 'knob', x: 44, y: 238, r: 8, t: 'JOG ADJ', n: 'JOG ADJUST', fn: 'jog-adjust', d: 'Tuhost jogu.' },
    { k: 'btn', x: 8, y: 262, w: 20, h: 10, t: '|◀◀', n: 'TRACK SEARCH ◀◀', fn: 'start', d: 'Začátek tracku / předchozí track.' },
    { k: 'btn', x: 32, y: 262, w: 20, h: 10, t: '▶▶|', n: 'TRACK SEARCH ▶▶', fn: 'next-track', d: 'Další track.' },
    { k: 'btn', x: 8, y: 278, w: 20, h: 10, t: '◀◀', n: 'SEARCH ◀◀', fn: 'search', arg: -1, d: 'Přetáčení zpět.' },
    { k: 'btn', x: 32, y: 278, w: 20, h: 10, t: '▶▶', n: 'SEARCH ▶▶', fn: 'search', arg: 1, d: 'Přetáčení vpřed.' },
    { k: 'rbtn', x: 32, y: 352, r: 15, t: 'CUE', n: 'CUE', d: T.cue, fn: 'cue', c: ORANGE },
    { k: 'rbtn', x: 32, y: 400, r: 15, t: '▶❚❚', n: 'PLAY / PAUSE', d: T.play, fn: 'play', c: GREEN },
    { k: 'btn', x: 266, y: 196, w: 54, h: 10, t: 'BEAT SYNC', n: 'BEAT SYNC', fn: 'sync', d: T.sync, toggle: true, c: ORANGE },
    { k: 'btn', x: 266, y: 212, w: 26, h: 10, t: 'MASTER', n: 'MASTER', fn: 'tempo-master', d: 'Tenhle deck je tempo master pro SYNC.', toggle: true, c: ORANGE },
    { k: 'btn', x: 294, y: 212, w: 26, h: 10, t: 'KEY SYNC', n: 'KEY SYNC', fn: 'key-sync', d: 'Přeladí track do tóniny druhého decku.', toggle: true, c: ORANGE },
    { k: 'btn', x: 266, y: 228, w: 26, h: 10, t: '±10%', n: 'TEMPO RANGE', fn: 'tempo-range', d: '±6 / 10 / 16 % / WIDE.' },
    { k: 'btn', x: 294, y: 228, w: 26, h: 10, t: 'M.TEMPO', n: 'MASTER TEMPO', fn: 'keylock', d: 'Keylock: změna tempa nemění výšku.', toggle: true, on: true, c: RED },
    { k: 'fader', x: 300, y: 250, len: 120, v: 0.5, t: 'TEMPO', n: 'TEMPO slider', fn: 'tempo', d: T.tempo },
    { k: 'btn', x: 266, y: 386, w: 54, h: 9, t: 'TEMPO RESET', n: 'TEMPO RESET', fn: 'tempo-reset', d: 'Vrátí původní tempo bez ohledu na slider.', toggle: true, c: GREEN },
  ],
});

/* ---------------- DJM-A9 ---------------- */
// Traced from the "Part names → Top panel" diagram in the DJM-A9 manual.

const djm: Part = {
  items: [
    // USB
    { k: 'screen', x: 10, y: 10, w: 38, h: 22, t: 'USB A', n: 'USB A', d: 'USB pro notebook. Na webu nefunguje.' },
    { k: 'screen', x: 55, y: 10, w: 34, h: 22, t: 'USB B', n: 'USB B', d: 'USB pro druhý notebook. Na webu nefunguje.' },
    // MIC
    { k: 'knob', x: 25, y: 66, r: 7, t: 'LEVEL 1', n: 'MIC LEVEL 1', fn: 'mic-level', d: 'Hlasitost mikrofonu.' },
    { k: 'knob', x: 25, y: 92, r: 7, t: 'LEVEL 2', n: 'MIC LEVEL 2', d: 'Hlasitost MIC 2. Na webu nefunguje.' },
    { k: 'knob', x: 25, y: 118, r: 7, t: 'HI', n: 'MIC EQ HI', fn: 'mic-hi', d: 'Výšky mikrofonu.' },
    { k: 'knob', x: 25, y: 141, r: 7, t: 'LOW', n: 'MIC EQ LOW', fn: 'mic-low', d: 'Basy mikrofonu.' },
    { k: 'rbtn', x: 25, y: 166, r: 4.5, n: 'TALKOVER', fn: 'talkover', d: 'Při mluvení ztlumí hudbu.', toggle: true, c: ORANGE },
    ...['ECHO', 'PITCH', 'MEGAPHONE'].map(
      (t, i): Item => ({
        k: 'btn',
        x: 17,
        y: 185 + i * 21,
        w: 17,
        h: 10,
        t: t === 'MEGAPHONE' ? 'MEGA' : t,
        n: `MIC FX ${t}`,
        fn: 'mic-fx',
        arg: t,
        d: ['Echo na hlas.', 'Výška hlasu.', 'Megafon.'][i],
        grp: 'micfx',
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 25, y: 260, r: 9, t: 'PARAMETER', n: 'MIC FX PARAMETER', fn: 'mic-fx-param', d: 'Množství MIC FX.' },
    { k: 'btn', x: 17, y: 288, w: 17, h: 9, t: 'REVERB', n: 'MIC REVERB', fn: 'mic-reverb', d: 'Reverb na mikrofon.', toggle: true, c: ORANGE },
    { k: 'knob', x: 25, y: 318, r: 9, t: 'PARAMETER', n: 'MIC REVERB PARAMETER', fn: 'mic-reverb-param', d: 'Množství reverbu.' },
    { k: 'rbtn', x: 25, y: 385, r: 6, t: 'ON', n: 'MIC ON', fn: 'mic-on', d: 'Zapne mikrofon. Držení = zapnutý jen po dobu držení.\nNa webu: prohlížeč chce přístup k mikrofonu, vezmi sluchátka.', toggle: true, c: RED },
    // +48V / Bluetooth / MIDI
    { k: 'btn', x: 67, y: 52, w: 15, h: 9, t: '+48V', n: '+48V', d: 'Phantom napájení. Na webu nefunguje.', toggle: true, c: RED },
    { k: 'btn', x: 67, y: 77, w: 15, h: 9, t: 'BT', n: 'BLUETOOTH', d: 'Bluetooth vstup. Na webu nefunguje.', toggle: true, c: '#4db8ff' },
    { k: 'btn', x: 67, y: 102, w: 15, h: 9, t: 'MIDI', n: 'MIDI', d: 'MIDI clock. Na webu nefunguje.', toggle: true, c: ORANGE },
    { k: 'btn', x: 67, y: 120, w: 15, h: 9, t: '▶/■', n: 'MIDI START/STOP', d: 'Na webu nefunguje.', toggle: true, c: ORANGE },
    // Sound Color FX
    { k: 'btn', x: 66, y: 155, w: 18, h: 8, t: 'C.LOCK', n: 'CENTER LOCK', fn: 'center-lock', d: 'COLOR knob ve středu zaklapne na nulu.', toggle: true, c: ORANGE },
    ...['SPACE', 'DUB ECHO', 'CRUSH', 'SWEEP', 'NOISE', 'FILTER'].map(
      (t, i): Item => ({
        k: 'btn',
        x: i % 2 ? 77.5 : 58,
        y: 172 + Math.floor(i / 2) * 22,
        w: 14,
        h: 10,
        t: t === 'DUB ECHO' ? 'DUB' : t,
        n: `SOUND COLOR FX ${t}`,
        fn: 'color-type',
        arg: t,
        on: t === 'FILTER',
        d: {
            SPACE: 'Reverb.',
            'DUB ECHO': 'Echo.',
            CRUSH: 'Bitcrusher.',
            SWEEP: 'Gate / sweep.',
            NOISE: 'Šum.',
            FILTER: 'Doleva LPF, doprava HPF.',
          }[t]!,
        grp: 'color',
        c: CYAN,
      }),
    ),
    { k: 'knob', x: 75, y: 258, r: 8, t: 'PARAMETER', n: 'SOUND COLOR FX PARAMETER', fn: 'color-param', d: 'Parametr COLOR efektu (rezonance, délka…).' },
    // Headphones A
    { k: 'btn', x: 58, y: 288, w: 13, h: 9, t: 'LINK', n: 'LINK CUE A', fn: 'link-cue', d: 'Poslech tracku z knihovny bez loadu. Na webu: track vybraný v BROWSE do sluchátek A.', toggle: true, c: ORANGE },
    { k: 'btn', x: 78.5, y: 288, w: 13, h: 9, t: 'MONO', n: 'MONO SPLIT A', fn: 'mono-split', d: 'Levé ucho CUE, pravé master.', toggle: true, c: ORANGE },
    { k: 'knob', x: 75, y: 318, r: 8, t: 'MIX', n: 'HEADPHONES A MIX', fn: 'hp-mix', d: T.phonesMix },
    { k: 'knob', x: 75, y: 348, r: 8, t: 'LEVEL', n: 'HEADPHONES A LEVEL', fn: 'hp-level', d: T.phones },
    { k: 'screen', x: 70.5, y: 370, w: 9, h: 36, n: 'PHONES A', d: 'Jack pro sluchátka A. Na webu přepínáš poslech nad pultem.' },
    // Channels
    ...[124, 168, 212, 256].flatMap((c, i): Item[] => [
      { k: 'knob', x: c, y: 38, r: 7, t: 'INPUT', n: `INPUT SELECT (CH ${i + 1})`, fn: 'input', ch: i, d: 'Zdroj kanálu: DIGITAL, USB, PHONO, BT…' },
      { k: 'knob', x: c, y: 66, r: 7, t: 'TRIM', n: `TRIM (CH ${i + 1})`, fn: 'trim', ch: i, d: T.trim },
      { k: 'knob', x: c, y: 98, r: 9, t: 'HI', n: `EQ HI (CH ${i + 1})`, fn: 'hi', ch: i, d: T.hi },
      { k: 'knob', x: c, y: 130, r: 9, t: 'MID', n: `EQ MID (CH ${i + 1})`, fn: 'mid', ch: i, d: T.mid },
      { k: 'knob', x: c, y: 163, r: 9, t: 'LOW', n: `EQ LOW (CH ${i + 1})`, fn: 'low', ch: i, d: T.low },
      { k: 'meter', x: c - 21, y: 60, h: 98, n: `CH LEVEL INDICATOR (CH ${i + 1})`, fn: 'meter', ch: i, d: T.meter },
      { k: 'knob', x: c, y: 208, r: 11, t: 'COLOR', n: `COLOR (CH ${i + 1})`, fn: 'color', ch: i, d: 'Sound Color FX vybraný vlevo. Střed = vypnuto.' },
      { k: 'btn', x: c - 16, y: 245, w: 16, h: 9, t: 'CUE A', n: `CUE A (CH ${i + 1})`, fn: 'hp-cue', ch: i, d: T.headCue, toggle: true, c: ORANGE },
      { k: 'btn', x: c + 5, y: 245, w: 12, h: 9, t: 'B', n: `CUE B (CH ${i + 1})`, fn: 'hp-cue-b', ch: i, d: 'Kanál do sluchátek B.', toggle: true, c: CYAN },
      { k: 'fader', x: c, y: 284, len: 56, v: i === 1 ? 1 : 0.15, t: `${i + 1}`, n: `CHANNEL FADER (CH ${i + 1})`, fn: 'fader', ch: i, d: T.chFader },
      { k: 'btn', x: c - 10, y: 360, w: 20, h: 9, t: 'A·THRU·B', n: `CROSSFADER ASSIGN (CH ${i + 1})`, fn: 'xf-assign', ch: i, d: 'Strana crossfaderu: A, B, nebo THRU.' },
    ]),
    { k: 'fader', x: 163, y: 408, len: 55, v: 0.5, dir: 'h', t: 'CROSSFADER', n: 'CROSSFADER', fn: 'xfader', d: `${T.crossfader}\nJen kanály přiřazené na A nebo B.` },
    // Master + booth
    { k: 'knob', x: 304, y: 33, r: 9, t: 'MASTER', n: 'MASTER LEVEL', fn: 'master', d: T.master },
    { k: 'meter', x: 294, y: 60, h: 98, n: 'MASTER LEVEL INDICATOR (L)', fn: 'meter', ch: -1, d: 'Úroveň masteru L.' },
    { k: 'meter', x: 311, y: 60, h: 98, n: 'MASTER LEVEL INDICATOR (R)', fn: 'meter', ch: -1, d: 'Úroveň masteru R.' },
    { k: 'knob', x: 304, y: 175, r: 6, t: 'HI', n: 'BOOTH EQ HI', d: 'Výšky boothu. Na webu nefunguje.' },
    { k: 'knob', x: 304, y: 196, r: 6, t: 'LOW', n: 'BOOTH EQ LOW', d: 'Basy boothu. Na webu nefunguje.' },
    { k: 'knob', x: 304, y: 222, r: 8, t: 'BOOTH', n: 'BOOTH LEVEL', d: 'Hlasitost boothu. Na webu nefunguje.' },
    { k: 'btn', x: 288, y: 245, w: 14, h: 9, t: 'CUE A', n: 'MASTER CUE A', fn: 'hp-master', d: 'Master do sluchátek A.', toggle: true, c: ORANGE },
    { k: 'btn', x: 309, y: 245, w: 12, h: 9, t: 'B', n: 'MASTER CUE B', fn: 'hp-master-b', d: 'Master do sluchátek B.', toggle: true, c: CYAN },
    // Headphones B
    { k: 'btn', x: 287, y: 282, w: 13, h: 9, t: 'LINK', n: 'LINK CUE B', fn: 'link-cue-b', d: 'Link cue do sluchátek B.', toggle: true, c: ORANGE },
    { k: 'btn', x: 309, y: 282, w: 13, h: 9, t: 'MONO', n: 'MONO SPLIT B', fn: 'mono-split-b', d: 'Levé ucho CUE, pravé master.', toggle: true, c: ORANGE },
    { k: 'knob', x: 304, y: 309, r: 7, t: 'MIX', n: 'HEADPHONES B MIX', fn: 'hp-mix-b', d: T.phonesMix },
    { k: 'knob', x: 304, y: 334, r: 7, t: 'LEVEL', n: 'HEADPHONES B LEVEL', fn: 'hp-level-b', d: T.phones },
    { k: 'btn', x: 296, y: 352, w: 16, h: 8, t: 'ISO · EQ', n: 'EQ CURVE', fn: 'eq-curve', d: 'ISO: knob úplně vlevo pásmo zabije. EQ: jen ubírá.', toggle: true, c: ORANGE },
    { k: 'btn', x: 296, y: 373, w: 16, h: 8, t: 'CH CURVE', n: 'CH FADER CURVE', fn: 'ch-curve', d: 'Křivka channel faderů.' },
    { k: 'btn', x: 296, y: 393, w: 16, h: 8, t: 'XF CURVE', n: 'CROSSFADER CURVE', fn: 'xf-curve', d: 'Křivka crossfaderu.' },
    // MULTI I/O
    { k: 'knob', x: 341, y: 36, r: 8, t: 'SEND CH', n: 'SEND CH', d: 'Multi I/O. Na webu nefunguje.' },
    { k: 'btn', x: 362, y: 31, w: 13, h: 10, t: 'RET/USB', n: 'INSERT SOURCE', d: 'Multi I/O. Na webu nefunguje.' },
    { k: 'screen', x: 381, y: 20, w: 17, h: 22, t: 'USB', n: 'USB (MULTI I/O)', d: 'Multi I/O. Na webu nefunguje.' },
    { k: 'knob', x: 341, y: 63, r: 8, t: 'SEND LEVEL', n: 'SEND LEVEL', d: 'Multi I/O. Na webu nefunguje.' },
    { k: 'rbtn', x: 368, y: 63, r: 6, n: 'INSERT', d: 'Multi I/O. Na webu nefunguje.', toggle: true, c: ORANGE },
    // Beat FX
    { k: 'screen', x: 338, y: 92, w: 60, h: 46, t: 'REVERB · 1/2', n: 'BEAT FX DISPLAY', fn: 'fx-display', d: 'Efekt, délka, BPM.' },
    { k: 'screen', x: 334, y: 153, w: 69, h: 12, t: 'X-PAD', n: 'X-PAD', fn: 'xpad', d: 'Držení = efekt, pozice = délka.\nNa webu: drž myš a táhni.' },
    { k: 'btn', x: 343, y: 178, w: 17, h: 8.5, t: '◀', n: 'BEAT ◀', fn: 'fx-beat', arg: -1, d: 'Kratší efekt (v dobách).' },
    { k: 'btn', x: 378, y: 178, w: 17, h: 8.5, t: '▶', n: 'BEAT ▶', fn: 'fx-beat', arg: 1, d: 'Delší efekt (v dobách).' },
    { k: 'rbtn', x: 343, y: 202, r: 4, n: 'AUTO / TAP', fn: 'fx-auto', d: 'BPM pro efekty: AUTO, nebo TAP.' },
    { k: 'rbtn', x: 368, y: 200, r: 8, t: 'TAP', n: 'TAP', fn: 'tap', d: 'Vyťukání BPM.' },
    { k: 'rbtn', x: 388, y: 202, r: 4, n: 'QUANTIZE', fn: 'fx-quantize', d: 'Efekt naskočí na beat. Držení: nastavení.', toggle: true, c: RED },
    ...['LOW', 'MID', 'HI'].map(
      (t, i): Item => ({
        k: 'btn',
        x: [336.5, 361.5, 381.5][i],
        y: 220.5,
        w: 13,
        h: 9,
        t,
        n: `FX FREQUENCY ${t}`,
        fn: 'fx-band',
        arg: t,
        d: 'Pásma, na která efekt působí.',
        toggle: true,
        on: true,
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 368, y: 254, r: 9, t: 'BEAT FX', n: 'BEAT FX SELECT', fn: 'fx-type', d: 'Výběr efektu.' },
    ...['1', '2', '3', '4', 'MIC', 'CF.A', 'CF.B', 'MST'].map(
      (t, i): Item => ({
        k: 'btn',
        x: [338.5, 353.5, 368.5, 385.5][i % 4],
        y: i < 4 ? 278 : 297,
        w: 12,
        h: 8,
        t,
        n: `FX CH SELECT ${t}`,
        fn: 'fx-ch',
        arg: t,
        d: 'Kam jde efekt: kanál 1–4, MIC, strana crossfaderu, master.',
        grp: 'fxch',
        on: t === 'MST',
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 368, y: 328, r: 8, t: 'TIME', n: 'TIME', fn: 'fx-time', d: 'Doladění délky efektu.' },
    { k: 'knob', x: 368, y: 362, r: 9, t: 'LEVEL/DEPTH', n: 'LEVEL / DEPTH', fn: 'fx-level', d: T.fxLevel },
    { k: 'rbtn', x: 368, y: 400, r: 11, t: 'ON/OFF', n: 'BEAT FX ON/OFF', fn: 'fx-on', d: T.fxOn, toggle: true, c: RED },
  ],
};

const cdjRig: Rig = {
  id: 'cdj',
  label: '2× CDJ-3000 + DJM-A9',
  w: 1091,
  h: 460,
  units: [
    { name: 'CDJ-3000', x: 0, y: 7, w: 329, h: 453, z: 118, parts: [cdj(1)] },
    { name: 'DJM-A9', x: 339, y: 28, w: 413, h: 432, z: 108, parts: [djm] },
    { name: 'CDJ-3000', x: 762, y: 7, w: 329, h: 453, z: 118, parts: [cdj(2)] },
  ],
};

export const rigs = [flx4, cdjRig];
