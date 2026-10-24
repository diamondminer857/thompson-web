/**
 * The two practice rigs on /macicek, drawn top-down in millimetres from the
 * real units' footprints. Positions are a faithful-enough schematic, not a
 * CAD trace — nudge any `x`/`y` here and `Gear.astro` redraws it.
 *
 * k: btn (rect button) · rbtn (round button) · pad · knob · fader · jog ·
 *    screen · meter
 * t: what's printed on the panel · n/d: tooltip title and description
 *
 * Descriptions are written for someone who has never touched a DJ setup —
 * every term gets explained in plain words. `\n` starts a new paragraph.
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
  loopIn:
    'Loop = smyčka, kousek písničky, který se pořád dokola opakuje (třeba 4 údery bubnu).\nTímhle tlačítkem řekneš „smyčka začíná TADY“ (na waveformu se objeví oranžová čárka). Písnička hraje dál – pak zmáčkneš OUT a kousek mezi IN a OUT se začne opakovat.\nKdyž už smyčka běží: IN přepne na doladění začátku – točením jogu ho posouváš, dalším IN potvrdíš.',
  loopOut:
    'Řekne „smyčka končí TADY“ – a smyčka se hned začne opakovat od IN.\nKdyž už smyčka běží: OUT přepne na doladění konce – točením jogu ho posouváš, dalším OUT potvrdíš.',
  reloop:
    'Když se smyčka opakuje: vypne ji a písnička normálně pokračuje dál.\nKdyž se nic neopakuje: skočí zpátky do poslední smyčky a pustí ji znovu.',
  sync:
    'BPM = rychlost písničky (kolik úderů bubnu za minutu, třeba 128).\nSYNC automaticky nastaví tuhle písničku na stejnou rychlost jako ta druhá a srovná údery bubnu tak, aby padly přesně na sebe. Bez toho by dvě písničky hrály „vedle sebe“ a znělo by to jako když padá nádobí ze skříně.\nTip: na začátek super pomocník, ale časem se to vyplatí umět i ručně tempo sliderem.',
  tempo:
    'Posuvník rychlosti. Nahoru = písnička hraje pomaleji, dolů = rychleji.\nPoužívá se, aby obě písničky šly stejně rychle a bubny šly „v jednom“ – tomu se říká beatmatching. Bez SYNC se to dělá právě tímhle.',
  cue:
    'Cue = startovní bod, místo v písničce, odkud ji chceš pustit (většinou první úder bubnu).\nKdyž písnička stojí: zmáčknutím si to místo uložíš.\nKdyž hraje: skočí zpátky na to místo a zastaví.\nKdyž ho podržíš: hraje od toho místa, pustíš – skočí zpátky. Tak si ve sluchátkách zkoušíš, jestli to sedí.',
  play: 'Pustí nebo zastaví písničku (jako play na mobilu).\nZkus kliknout – kolo se roztočí.',
  hotCue:
    'Hot cue = záložka v písničce. Uložíš si třeba místo, kde začíná refrén nebo drop (moment, kdy „to bouchne“).\nZmáčkneš → písnička okamžitě skočí na to místo. Když je tlačítko prázdné, zmáčknutím tam záložku uložíš.\nKdyž písnička stojí: drž = hraje, pustíš = vrátí se zpátky.',
  trim:
    'Kanál = jedna „cesta“ zvuku v mixeru. Každý přehrávač má svůj kanál (deck 1 → kanál 1…).\nTRIM je základní hlasitost kanálu. Každá písnička je nahraná jinak nahlas, takže tímhle je srovnáš, aby jedna nebyla řvoucí a druhá potichu.\nTip: koukej na svítící sloupeček vedle – měl by skákat kolem oranžové, ne do červené.',
  hi: 'EQ = ekvalizér, něco jako „basy/výšky“ na rádiu, jen rozdělené do tří knobů.\nHI = výšky: činely, „cvakání“ hi-hatů, ostré zvuky. Doleva ubereš, doprava přidáš, uprostřed = beze změny.',
  mid: 'MID = středy: zpěv, melodie, synťáky – „tělo“ písničky.\nTip: když se při přechodu perou dva zpěvy nebo melodie, ubrat středy jedné z nich.',
  low:
    'LOW = basy: kopák (velký buben „bum bum“) a basová linka.\nZlaté pravidlo: dvě basy naplno přes sebe zní jako bláto. Při přechodu jedné písničce basy stáhni doleva a pak je prohoď.',
  meter:
    'Svítící sloupeček = ukazatel hlasitosti. Čím víc svítí, tím je to hlasitější.\nZelená = v pohodě, oranžová = ideální, červená = moc nahlas, zvuk se začne kazit (chrčet). Pak ubrat TRIM.',
  chFader:
    'Fader = posuvník hlasitosti.\nNahoře = kanál hraje naplno, dole = ticho. Hlavní nástroj DJe: další písničku pomalu „vytáhneš“ nahoru, tu starou stáhneš dolů – a to je přechod.',
  headCue:
    'Cue ve sluchátkách: pošle tenhle kanál jen do tvých sluchátek, lidi to neslyší.\nTakhle si poslechneš a připravíš další písničku dřív, než ji pustíš do reproduktorů.\nNa webu: nahoře přepni poslech na 🎧 Sluchátka a uslyšíš to.',
  master: 'Master = to, co jde do reproduktorů a co slyší lidi.\nTenhle knob je celková hlasitost všeho.',
  beatLen:
    'Beat FX se řídí podle úderů bubnu (dob). Tlačítka mění délku efektu: 1/2 doby, 1 doba, 2 doby… Efekt tak „jede v rytmu“ s hudbou.',
  fxLevel: 'Síla efektu. Doleva = skoro neslyšíš, doprava = hodně efektu, původní zvuk je slabší.',
  fxOn:
    'Zapne nebo vypne efekt.\nTip na konec písničky: zapni Reverb (dozvuk), nech ho chvilku doznít a stáhni fader – písnička se „rozplyne do prostoru“ místo toho, aby useknutě skončila.',
  crossfader:
    'Crossfader = posuvník do stran, „prolínačka“ mezi dvěma písničkami.\nÚplně vlevo hraje jen levá strana, úplně vpravo jen pravá, uprostřed obě.\nTip: hodně DJů ho nechává uprostřed a přechody dělá jen svislými fadery.',
  phones: 'Hlasitost sluchátek. Šetři uši – radši méně, v klubu je reproduktorů dost.',
  phonesMix:
    'Co slyšíš ve sluchátkách. Doleva = jen písnička, kterou máš na CUE (ta, co připravuješ). Doprava = jen to, co hraje lidem. Uprostřed = obojí najednou.',
};

/* ---------------- DDJ-FLX4 ---------------- */

const flxDeck = (ox: number, no: number): Part => ({
  deck: no - 1,
  items: shift(
    [
      { k: 'btn', x: 10, y: 28, w: 22, h: 9, t: 'IN', fn: 'loop-in', n: 'LOOP IN', d: T.loopIn },
      { k: 'btn', x: 35, y: 28, w: 22, h: 9, t: 'OUT', n: 'LOOP OUT', fn: 'loop-out', d: T.loopOut },
      { k: 'btn', x: 60, y: 28, w: 26, h: 9, t: '4 BEAT/EXIT', n: '4 BEAT / EXIT', fn: 'loop-4exit', d: 'Když nic nesmyčkuje: hned spustí smyčku dlouhou 4 údery (1 takt) – nejrychlejší cesta ke smyčce.\nKdyž smyčka běží: ukončí ji (EXIT) a písnička hraje dál.\nSHIFT + tohle: znovu zapne poslední smyčku.' },
      { k: 'btn', x: 92, y: 28, w: 16, h: 9, t: '◁ ½X', n: 'CUE/LOOP CALL ◁ (1/2X)', fn: 'loop-call', arg: -1, d: 'Bez smyčky: skočí na předchozí uložený bod nebo smyčku (memory cue).\nKdyž smyčka běží: zkrátí ji na polovinu (8 úderů → 4 → 2 → 1). Rychle za sebou to zní jako napětí před dropem.\nSHIFT: smaže uložený bod.' },
      { k: 'btn', x: 111, y: 28, w: 16, h: 9, t: '2X ▷', n: 'CUE/LOOP CALL ▷ (2X)', fn: 'loop-call', arg: 1, d: 'Bez smyčky: skočí na další uložený bod nebo smyčku.\nKdyž smyčka běží: prodlouží ji na dvojnásobek.\nSHIFT: uloží aktuální bod (nebo smyčku) jako memory cue.' },
      { k: 'btn', x: 136, y: 28, w: 26, h: 9, t: 'SYNC', n: 'BEAT SYNC', fn: 'sync', d: `${T.sync}\nSe SHIFT: mění, jak moc jde tempo posuvníkem změnit.`, toggle: true, c: ORANGE },
      { k: 'fader', x: 149, y: 50, len: 100, v: 0.5, t: 'TEMPO', n: 'TEMPO slider', fn: 'tempo', d: T.tempo },
      { k: 'jog', x: 70, y: 104, r: 50, n: `JOG wheel (deck ${no})`, fn: 'jog', d: `Deck = jeden „přehrávač“. Pult má dva – levý a pravý – a na každém hraje jedna písnička.\nJog = velké kolo, něco jako gramofonová deska.\nZa bok: písničku na chvilku zrychlíš/zpomalíš – tak doladíš, aby bubny obou písniček šly přesně spolu.\nShora (položíš ruku): „chytíš desku“ – můžeš scratchovat nebo posunout písničku.\nNa webu: táhni myší za vnější okraj kola = postrčení, za vnitřek = scratch.` },
      { k: 'btn', x: 8, y: 168, w: 28, h: 8, t: 'SHIFT', n: 'SHIFT', fn: 'shift', d: 'Jako Shift na klávesnici. Podržíš ho a zmáčkneš jiné tlačítko → udělá jeho druhou funkci (ta je na pultu napsaná menším písmem).\nNa webu: klikni na SHIFT (rozsvítí se) a pak na tlačítko.' },
      { k: 'rbtn', x: 22, y: 196, r: 11, t: 'CUE', n: 'CUE', d: T.cue, fn: 'cue', c: ORANGE },
      { k: 'rbtn', x: 22, y: 232, r: 11, t: '▶❚❚', n: 'PLAY / PAUSE', d: T.play, fn: 'play', c: GREEN },
      { k: 'btn', x: 44, y: 168, w: 28, h: 8, t: 'HOT CUE', n: 'HOT CUE', fn: 'padmode', arg: 'hot', d: `Přepne barevné čtverce pod tím (pady) na záložky.\n${T.hotCue}`, grp: 'mode', on: true, c: CYAN },
      { k: 'btn', x: 75, y: 168, w: 28, h: 8, t: 'PAD FX', n: 'PAD FX', fn: 'padmode', arg: 'fx', d: 'Přepne pady na efekty. Držíš pad = efekt hraje, pustíš = konec. Každý pad má jiný efekt (ozvěna, sekání, zkreslení…).\nSe SHIFT: druhá sada efektů.', grp: 'mode', c: CYAN },
      { k: 'btn', x: 106, y: 168, w: 28, h: 8, t: 'BEAT JUMP', n: 'BEAT JUMP', fn: 'padmode', arg: 'jump', d: 'Přepne pady na skákání. Pad skočí v písničce dopředu nebo dozadu o pár úderů, ale rytmus zůstane sedět – lidi skok skoro nepoznají.\nPady jako v rekordboxu: ◀4▶ ◀8▶ nahoře, ◀16▶ ◀32▶ dole (v úderech). Levý pad z dvojice skočí dozadu, pravý dopředu.\nSe SHIFT: BEAT LOOP – pad rovnou zapne smyčku dané délky.', grp: 'mode', c: CYAN },
      { k: 'btn', x: 137, y: 168, w: 28, h: 8, t: 'SAMPLER', n: 'SAMPLER', fn: 'padmode', arg: 'sampler', d: 'Přepne pady na krátké zvuky – třeba siréna, „hey!“, bubínek. Zmáčkneš pad a zvuk zahraje přes písničku.\nSe SHIFT: KEY SHIFT – pady mění tóninu (jak vysoko písnička zní).', grp: 'mode', c: CYAN },
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
          d: 'Pad = gumový čtverec na mačkání. Co udělá, záleží na režimu nad pady:\nHOT CUE = záložka: prázdný pad ji uloží, plný na ni skočí (SHIFT + pad ji smaže). Když písnička stojí, hraje jen dokud držíš.\nPAD FX = drž pad: ozvěna 1/2 a 3/4, roll 1/4 a 1/8, trans (sekání), filtr nahoru, reverb, brzda. SHIFT + PAD FX = druhá sada (delay, roll 1/16 a 1/2, filtr dolů, back spin…).\nBEAT JUMP = jako v rekordboxu: dvojice ◀ ▶ po 1, 2, 4 a 8 taktech (4 / 8 / 16 / 32 úderů) – levý pad z dvojice dozadu, pravý dopředu. SHIFT + BEAT JUMP = BEAT LOOP: smyčka 1/4 až 32 úderů.\nSAMPLER = krátké zvuky (air horn, siréna, rewind…). SHIFT + SAMPLER = KEY SHIFT: horní řada +1 až +4 půltóny, spodní −1 až −3, poslední pad vrátí tóninu.\nSHIFT + HOT CUE = KEYBOARD: záložka A zahraje v různých tóninách.',
          c: PADS[i],
        }),
      ),
    ],
    ox,
  ),
});

const flxMixer: Part = {
  items: [
    { k: 'btn', x: 178, y: 12, w: 24, h: 9, t: 'LOAD', n: 'LOAD (deck 1)', fn: 'load', arg: 0, d: 'Nahraje písničku, kterou máš vybranou v počítači (v rekordboxu), do levého přehrávače.\nDvakrát rychle = zkopíruje sem písničku z pravého přehrávače.' },
    { k: 'knob', x: 241, y: 16.5, r: 9, t: 'BROWSE', n: 'BROWSE', fn: 'browse', endless: true, d: 'Točením jezdíš nahoru/dolů v seznamu písniček v počítači (jako kolečko myši). Zmáčknutím otevřeš složku.\nSe SHIFT: přepínání mezi seznamy.' },
    { k: 'btn', x: 280, y: 12, w: 24, h: 9, t: 'LOAD', n: 'LOAD (deck 2)', fn: 'load', arg: 1, d: 'Nahraje vybranou písničku do pravého přehrávače.' },
    ...[203, 279].flatMap((c, i): Item[] => [
      { k: 'knob', x: c, y: 44, r: 7, t: 'TRIM', n: `TRIM (kanál ${i + 1})`, fn: 'trim', ch: i, d: T.trim },
      { k: 'knob', x: c, y: 66, r: 7, t: 'HI', n: `EQ HI (kanál ${i + 1})`, fn: 'hi', ch: i, d: T.hi },
      { k: 'knob', x: c, y: 88, r: 7, t: 'MID', n: `EQ MID (kanál ${i + 1})`, fn: 'mid', ch: i, d: T.mid },
      { k: 'knob', x: c, y: 110, r: 7, t: 'LOW', n: `EQ LOW (kanál ${i + 1})`, fn: 'low', ch: i, d: T.low },
      { k: 'knob', x: c, y: 133, r: 8, t: 'CFX', n: `CFX (kanál ${i + 1})`, fn: 'filter', ch: i, d: 'Jeden knob = jeden efekt, většinou filtr.\nDoleva: zvuk zní jako „přes zeď“ nebo zpod vody (ubírá výšky). Doprava: zvuk je tenký jako z telefonu (ubírá basy). Uprostřed = vypnuto.\nTip: pomalé točení je super na plynulé přechody mezi písničkami.' },
      { k: 'btn', x: c - 11, y: 152, w: 22, h: 8, t: 'CUE', n: `CUE do sluchátek (kanál ${i + 1})`, fn: 'hp-cue', ch: i, d: T.headCue, toggle: true, c: ORANGE },
      { k: 'meter', x: i ? c - 15 : c + 11, y: 170, h: 56, n: `Ukazatel hlasitosti (kanál ${i + 1})`, fn: 'meter', ch: i, d: T.meter },
      { k: 'fader', x: c, y: 170, len: 56, v: i ? 1 : 0.15, t: `CH ${i + 1}`, n: `Fader (kanál ${i + 1})`, fn: 'fader', ch: i, d: T.chFader },
    ]),
    { k: 'knob', x: 241, y: 44, r: 7, t: 'MASTER', n: 'MASTER LEVEL', fn: 'master', d: T.master },
    { k: 'btn', x: 230, y: 60, w: 22, h: 8, t: 'M.CUE', n: 'MASTER CUE', fn: 'hp-master', d: 'Pošle do sluchátek i to, co zrovna slyší lidi. Hodí se, když nemáš odposlech (repro u pultu).', toggle: true, c: ORANGE },
    { k: 'knob', x: 241, y: 84, r: 7, t: 'HP MIX', n: 'HEADPHONES MIX', fn: 'hp-mix', d: T.phonesMix },
    { k: 'knob', x: 241, y: 106, r: 7, t: 'HP LEVEL', n: 'HEADPHONES LEVEL', fn: 'hp-level', d: T.phones },
    { k: 'btn', x: 227, y: 126, w: 28, h: 8, t: 'SMART CFX', n: 'SMART CFX', fn: 'smart-cfx', d: 'Z CFX knobů udělá „chytřejší“ efekty – jedním knobem pak ovládáš víc věcí naráz (třeba filtr + ozvěnu).', toggle: true, c: CYAN },
    { k: 'btn', x: 227, y: 140, w: 28, h: 8, t: 'SMART FADER', n: 'SMART FADER', fn: 'smart-fader', d: 'Pomocník pro úplné začátečníky: když posuneš crossfader, pult sám srovná rychlost písniček a ubere basy, aby přechod zněl hezky.', toggle: true, c: CYAN },
    { k: 'fader', x: 211, y: 250, len: 60, v: 0.5, dir: 'h', t: 'CROSSFADER', n: 'CROSSFADER', fn: 'xfader', d: T.crossfader },
    // Beat FX strip, top right
    { k: 'btn', x: 322, y: 9, w: 16, h: 9, t: '◀', n: 'BEAT ◀', fn: 'fx-beat', arg: -1, d: `${T.beatLen}\nTohle tlačítko efekt zkrátí.` },
    { k: 'btn', x: 341, y: 9, w: 16, h: 9, t: '▶', n: 'BEAT ▶', fn: 'fx-beat', arg: 1, d: `${T.beatLen}\nTohle tlačítko efekt prodlouží.` },
    { k: 'btn', x: 360, y: 9, w: 26, h: 9, t: 'FX SEL', n: 'FX SELECT', fn: 'fx-next', d: 'Beat FX = efekty, které jdou do rytmu písničky.\nTímhle vybíráš který: Reverb (dozvuk jako v kostele), Echo (ozvěna), Flanger (zvuk „letí“), Roll (rychlé opakování)… Název vidíš v počítači.' },
    { k: 'btn', x: 390, y: 9, w: 30, h: 9, t: 'FX → M', n: 'FX CH SELECT', fn: 'fx-ch-cycle', d: 'Páčka: na co se efekt pustí – jen na levou písničku (1), jen na pravou (2), nebo na všechno, co slyší lidi (M = master).' },
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
    { k: 'screen', x: 12, y: 8, w: 24, h: 8, t: 'USB', n: 'USB', d: 'CDJ = samostatný přehrávač, žádný počítač. Hudbu do něj dáš na flashce.\nSem se strčí flashka s písničkami, které sis předem připravil v programu rekordbox (i se záložkami a smyčkami).\nNa webu je „flashka“ už zastrčená – písničky najdeš přes BROWSE.' },
    { k: 'btn', x: 40, y: 8, w: 22, h: 8, t: 'USB STOP', n: 'USB STOP', fn: 'eject', d: 'Bezpečné odpojení flashky. Podrž, dokud nezhasne, a až pak ji vytáhni – jinak se může poškodit.' },
    { k: 'screen', x: 66, y: 9.5, w: 30, h: 5, t: 'SD', n: 'SD karta', d: 'Místo na SD kartu (jako z foťáku). Funguje stejně jako flashka.\n(Tady na webu nic nedělá – žádná karta tu není.)' },
    { k: 'btn', x: 232, y: 8, w: 28, h: 9, t: 'SLIP', n: 'SLIP', fn: 'slip', d: 'Když svítí, písnička na pozadí „tajně“ hraje dál, i když scratchuješ, děláš smyčku nebo skáčeš. Jakmile přestaneš, pokračuje přesně tam, kde by normálně byla – lidi nepoznají, že jsi z rytmu vyskočil.', toggle: true, c: RED },
    { k: 'btn', x: 264, y: 8, w: 32, h: 9, t: 'QUANTIZE', fn: 'quantize', n: 'QUANTIZE', d: 'Pomocník: když zmáčkneš záložku nebo smyčku trochu vedle, přehrávač to sám posune přesně na úder bubnu.\nTip: nech zapnuté.', toggle: true, on: true, c: RED },
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
        d: [
          'Odkud brát hudbu: flashka, SD karta, nebo flashka v druhém přehrávači (CDJčka jsou propojená kabelem a vidí si navzájem do flashek).',
          'Otevře na displeji seznam všech písniček.',
          'Tag list = „odkladiště“. Písničky, které tě napadne zahrát za chvíli, si sem hodíš, ať je pak nemusíš hledat.',
          'Playlisty – seznamy písniček, které sis připravil doma v rekordboxu.',
          'Hledání písničky podle názvu – na displeji vyskočí klávesnice.',
          'Nastavení přehrávače (podržením).\n(Tady na webu nic nedělá – nastavení tu nejsou.)',
        ][i],
      }),
    ),
    { k: 'screen', x: 60, y: 28, w: 208, h: 117, n: 'Displej (dotykový)', d: 'Velký dotykový displej jako na mobilu.\nUkazuje waveform – „obrázek“ písničky: vysoké špičky = hlasité údery, rovné úseky = klidné části. Takže vidíš dopředu, kdy přijde drop nebo pauza.\nDál tu je rychlost (BPM), čas do konce a seznam písniček.', wave: true },
    { k: 'knob', x: 297, y: 44, r: 13, t: 'ROTARY', n: 'Otočný ovladač', fn: 'rotary', endless: true, d: 'Točením jezdíš v seznamu písniček, zmáčknutím vybereš / nahraješ písničku do přehrávače.\nNa webu: táhni nahoru/dolů = výběr, klikni = nahrát (nebo otevřít seznam).' },
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
        d: [
          'Zpátky (o krok zpět v seznamu), jako šipka zpět v prohlížeči.',
          'Hodí vybranou písničku do Tag listu (odkladiště na později).',
          'Filtr: ukáže jen písničky, které se hodí k té, co zrovna hraje (podobná rychlost, tónina…).',
          'Zkratky na oblíbená místa v seznamu písniček.',
          'Přepne čas na displeji: kolik už hraje / kolik zbývá do konce.\nTip: „zbývá“ je lepší – víš, kdy připravit další písničku.',
        ][i],
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
    { k: 'btn', x: 10, y: 172, w: 30, h: 10, t: 'IN', n: 'LOOP IN / CUE', fn: 'loop-in', d: `${T.loopIn}\nPodržíš 1 sekundu = rovnou smyčka 4 údery. Když písnička stojí, uloží místo toho cue bod.` },
    { k: 'btn', x: 44, y: 172, w: 30, h: 10, t: 'OUT', n: 'LOOP OUT', fn: 'loop-out', d: T.loopOut },
    { k: 'btn', x: 78, y: 172, w: 34, h: 10, t: 'RELOOP', n: 'RELOOP / EXIT', fn: 'reloop', d: T.reloop },
    { k: 'btn', x: 120, y: 172, w: 22, h: 10, t: '◀ JUMP', n: 'BEAT JUMP ◀', fn: 'jump', arg: -16, d: 'Skočí v písničce o 4 takty (16 úderů) dozadu. Rytmus zůstane sedět, takže to nikdo nepozná – hodí se, když potřebuješ písničku „natáhnout“.' },
    { k: 'btn', x: 146, y: 172, w: 22, h: 10, t: 'JUMP ▶', n: 'BEAT JUMP ▶', fn: 'jump', arg: 16, d: 'Skočí o 4 takty (16 úderů) dopředu – třeba přeskočíš nudný kus.' },
    { k: 'btn', x: 176, y: 172, w: 20, h: 10, t: '◀ CALL', n: 'CUE/LOOP CALL ◀', fn: 'call', arg: -1, d: 'Bez smyčky: skočí na předchozí uložený bod (memory cue) nebo smyčku.\nKdyž smyčka běží: zkrátí ji na polovinu.' },
    { k: 'btn', x: 198, y: 172, w: 20, h: 10, t: 'CALL ▶', n: 'CUE/LOOP CALL ▶', fn: 'call', arg: 1, d: 'Bez smyčky: skočí na další uložený bod nebo smyčku.\nKdyž smyčka běží: prodlouží ji na dvojnásobek.' },
    { k: 'btn', x: 78, y: 186, w: 16, h: 8, t: '4 BEAT', n: '4 BEAT / LOOP CUTTER', fn: 'loop-auto', arg: 4, d: 'Bez smyčky: hned spustí smyčku dlouhou 4 údery (1 takt).\nKdyž smyčka běží: zkrátí ji na polovinu (LOOP CUTTER).' },
    { k: 'btn', x: 96, y: 186, w: 16, h: 8, t: '8 BEAT', n: '8 BEAT / LOOP DOUBLE', fn: 'loop-auto', arg: 8, d: 'Bez smyčky: hned spustí smyčku dlouhou 8 úderů (2 takty).\nKdyž smyčka běží: prodlouží ji na dvojnásobek.' },
    { k: 'btn', x: 220, y: 172, w: 30, h: 10, t: 'DELETE', n: 'DELETE', fn: 'mem-delete', d: 'Smaže uložený bod, na kterém zrovna jsi.' },
    { k: 'btn', x: 254, y: 172, w: 34, h: 10, t: 'MEMORY', n: 'MEMORY', fn: 'mem-add', d: 'Uloží aktuální startovní bod nebo smyčku natrvalo na flashku – příště už tam bude.' },
    { k: 'jog', x: 158, y: 300, r: 96, n: `JOG wheel (CDJ ${no})`, fn: 'jog', d: 'Jog = velké kolo, chová se jako gramofonová deska. Uprostřed má displej s obalem písničky.\nShora (položíš ruku): „chytíš desku“ – můžeš scratchovat nebo písničku posunout.\nZa bok: písničku na chvilku zrychlíš/zpomalíš, tak doladíš, aby bubny obou písniček šly přesně spolu.\nNa webu: táhni myší za vnější okraj kola = postrčení, za vnitřek = scratch (ve VINYL).' },
    { k: 'btn', x: 8, y: 196, w: 44, h: 10, t: 'REV · FWD', n: 'DIRECTION', fn: 'reverse', d: 'Páčka: písnička hraje normálně dopředu, nebo pozpátku. Pozpátku = efekt, ne na celou písničku 🙂', toggle: true, c: RED },
    { k: 'btn', x: 8, y: 212, w: 44, h: 10, t: 'VINYL', n: 'JOG MODE', fn: 'jog-mode', d: 'Jak se chová kolo.\nVINYL: sáhneš shora = zastavíš písničku jako desku (scratch).\nCDJ: shora se jen jemně dolaďuje rychlost.', toggle: true, on: true, c: CYAN },
    { k: 'knob', x: 20, y: 238, r: 8, t: 'TOUCH', n: 'VINYL SPEED ADJUST', fn: 'vinyl-speed', d: 'Jak rychle se písnička rozjede a zastaví, když dáš play/pauzu nebo sáhneš na kolo. Pomalu = jako starý gramofon, který se „dobržďuje“ (wuuuu).' },
    { k: 'knob', x: 44, y: 238, r: 8, t: 'JOG ADJ', n: 'JOG ADJUST', fn: 'jog-adjust', d: 'Jak ztuha se kolo točí – lehce nebo těžce, podle toho, co ti sedí do ruky.' },
    { k: 'btn', x: 8, y: 262, w: 20, h: 10, t: '|◀◀', n: 'TRACK SEARCH ◀◀', fn: 'start', d: 'Na začátek písničky / předchozí písnička (jako na přehrávači).' },
    { k: 'btn', x: 32, y: 262, w: 20, h: 10, t: '▶▶|', n: 'TRACK SEARCH ▶▶', fn: 'next-track', d: 'Další písnička.' },
    { k: 'btn', x: 8, y: 278, w: 20, h: 10, t: '◀◀', n: 'SEARCH ◀◀', fn: 'search', arg: -1, d: 'Podržíš = rychle přetáčí dozadu.' },
    { k: 'btn', x: 32, y: 278, w: 20, h: 10, t: '▶▶', n: 'SEARCH ▶▶', fn: 'search', arg: 1, d: 'Podržíš = rychle přetáčí dopředu.' },
    { k: 'rbtn', x: 32, y: 352, r: 15, t: 'CUE', n: 'CUE', d: T.cue, fn: 'cue', c: ORANGE },
    { k: 'rbtn', x: 32, y: 400, r: 15, t: '▶❚❚', n: 'PLAY / PAUSE', d: T.play, fn: 'play', c: GREEN },
    { k: 'btn', x: 266, y: 196, w: 54, h: 10, t: 'BEAT SYNC', n: 'BEAT SYNC', fn: 'sync', d: T.sync, toggle: true, c: ORANGE },
    { k: 'btn', x: 266, y: 212, w: 26, h: 10, t: 'MASTER', n: 'MASTER', fn: 'tempo-master', d: 'Řekne „tenhle přehrávač je šéf“. Ostatní, které mají zapnutý SYNC, se pak přizpůsobí jeho rychlosti.', toggle: true, c: ORANGE },
    { k: 'btn', x: 294, y: 212, w: 26, h: 10, t: 'KEY SYNC', n: 'KEY SYNC', fn: 'key-sync', d: 'Tónina = jak „vysoko“ písnička zní. Dvě písničky v jiné tónině můžou spolu znít falešně.\nKEY SYNC posune tuhle písničku tak, aby k té druhé ladila.', toggle: true, c: ORANGE },
    { k: 'btn', x: 266, y: 228, w: 26, h: 10, t: '±10%', n: 'TEMPO RANGE', fn: 'tempo-range', d: 'Jak moc jde tempo posuvníkem změnit: ±6 % (jemně, nejpřesnější), ±10 %, ±16 %, nebo úplně volně.' },
    { k: 'btn', x: 294, y: 228, w: 26, h: 10, t: 'M.TEMPO', n: 'MASTER TEMPO', fn: 'keylock', d: 'Když písničku zrychlíš, normálně začne znít vysoko (jako Chipmunkové). S tímhle zapnutým zní pořád stejně, jen je rychlejší.\nTip: nech zapnuté.', toggle: true, on: true, c: RED },
    { k: 'fader', x: 300, y: 250, len: 120, v: 0.5, t: 'TEMPO', n: 'TEMPO slider', fn: 'tempo', d: T.tempo },
    { k: 'btn', x: 266, y: 386, w: 54, h: 9, t: 'TEMPO RESET', n: 'TEMPO RESET', fn: 'tempo-reset', d: 'Vrátí písničku na její původní rychlost, ať je posuvník kdekoliv.', toggle: true, c: GREEN },
  ],
});

/* ---------------- DJM-A9 ---------------- */
// Traced from the "Part names → Top panel" diagram in the DJM-A9 manual.

const djm: Part = {
  items: [
    // USB
    { k: 'screen', x: 10, y: 10, w: 38, h: 22, t: 'USB A', n: 'USB A', d: 'Mixer = „střed“ celé sestavy. Do něj jde zvuk z obou CDJček a z něj do reproduktorů.\nSem jde kabel z notebooku, kdyby někdo hrál z počítače místo z flashky.\n(Tady na webu nic nedělá – notebook tu není zapojený.)' },
    { k: 'screen', x: 55, y: 10, w: 34, h: 22, t: 'USB B', n: 'USB B', d: 'Druhé místo pro notebook – když se střídají dva DJové, druhý si zapojí svůj a nevznikne ticho.\n(Tady na webu nic nedělá – notebook tu není zapojený.)' },
    // MIC
    { k: 'knob', x: 25, y: 66, r: 7, t: 'LEVEL 1', n: 'MIC LEVEL 1', fn: 'mic-level', d: 'Hlasitost mikrofonu 1 (do mikrofonu se dá mluvit nebo zpívat přes hudbu).' },
    { k: 'knob', x: 25, y: 92, r: 7, t: 'LEVEL 2', n: 'MIC LEVEL 2', d: 'Hlasitost mikrofonu 2.\n(Tady na webu nic nedělá – na webu je jen jeden mikrofon, ovládá ho LEVEL 1.)' },
    { k: 'knob', x: 25, y: 118, r: 7, t: 'HI', n: 'MIC – výšky', fn: 'mic-hi', d: 'Výšky mikrofonu. Ubrat, když hlas „syčí“ (sssss).' },
    { k: 'knob', x: 25, y: 141, r: 7, t: 'LOW', n: 'MIC – basy', fn: 'mic-low', d: 'Basy mikrofonu. Ubrat, když hlas duní a není mu rozumět.' },
    { k: 'rbtn', x: 25, y: 166, r: 4.5, n: 'TALKOVER', fn: 'talkover', d: 'Když mluvíš do mikrofonu, hudba se sama ztiší, aby ti bylo rozumět.', toggle: true, c: ORANGE },
    ...['ECHO', 'PITCH', 'MEGAPHONE'].map(
      (t, i): Item => ({
        k: 'btn',
        x: 17,
        y: 185 + i * 21,
        w: 17,
        h: 10,
        t: t === 'MEGAPHONE' ? 'MEGA' : t,
        n: `Efekt na mikrofon – ${t}`,
        fn: 'mic-fx',
        arg: t,
        d: ['Ozvěna na hlas (hej… hej… hej…).', 'Změní výšku hlasu – hlubší nebo vyšší.', 'Hlas zní jako přes megafon / tlampač.'][i],
        grp: 'micfx',
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 25, y: 260, r: 9, t: 'PARAMETER', n: 'Síla efektu na mikrofon', fn: 'mic-fx-param', d: 'Jak moc je efekt na mikrofonu (ECHO / PITCH / MEGA) slyšet.' },
    { k: 'btn', x: 17, y: 288, w: 17, h: 9, t: 'REVERB', n: 'MIC REVERB', fn: 'mic-reverb', d: 'Dozvuk na hlas – zní to, jako bys mluvil ve velké hale.', toggle: true, c: ORANGE },
    { k: 'knob', x: 25, y: 318, r: 9, t: 'PARAMETER', n: 'Síla dozvuku', fn: 'mic-reverb-param', d: 'Kolik dozvuku je na mikrofonu.' },
    { k: 'rbtn', x: 25, y: 385, r: 6, t: 'ON', n: 'MIC ON', fn: 'mic-on', d: 'Zapne / vypne mikrofon.\nKdyž ho podržíš, mikrofon je zapnutý jen po dobu držení (jako vysílačka).\nNa webu: prohlížeč se zeptá na mikrofon. Vezmi si sluchátka, jinak to bude pískat.', toggle: true, c: RED },
    // +48V / Bluetooth / MIDI
    { k: 'btn', x: 67, y: 52, w: 15, h: 9, t: '+48V', n: '+48V', d: 'Napájení pro speciální studiové mikrofony. Na běžný mikrofon to není potřeba.\nTip: nech vypnuté, pokud nevíš, že ho potřebuješ.\n(Tady na webu nic nedělá – žádný studiový mikrofon tu není.)', toggle: true, c: RED },
    { k: 'btn', x: 67, y: 77, w: 15, h: 9, t: 'BT', n: 'BLUETOOTH', d: 'Spáruje mixer s mobilem přes Bluetooth – pak z mobilu můžeš pustit hudbu do mixeru (třeba do pauzy).\n(Tady na webu nic nedělá – prohlížeč se k mixeru přes Bluetooth nepřipojí.)', toggle: true, c: '#4db8ff' },
    { k: 'btn', x: 67, y: 102, w: 15, h: 9, t: 'MIDI', n: 'MIDI', d: 'Pro pokročilé: mixer posílá do počítače informaci o rytmu, aby s ním šly synchronizovat třeba světla nebo jiný program. Neřeš.\n(Tady na webu nic nedělá – nic tu není připojené.)', toggle: true, c: ORANGE },
    { k: 'btn', x: 67, y: 120, w: 15, h: 9, t: '▶/■', n: 'MIDI START/STOP', d: 'Pro pokročilé: spustí / zastaví připojený program nebo bicí automat v rytmu. Neřeš.\n(Tady na webu nic nedělá – nic tu není připojené.)', toggle: true, c: ORANGE },
    // Sound Color FX
    { k: 'btn', x: 66, y: 155, w: 18, h: 8, t: 'C.LOCK', n: 'CENTER LOCK', fn: 'center-lock', d: 'Pomocník: když vracíš COLOR knob doprostřed, „cvakne“ přesně do středu (= efekt úplně vypnutý). Žádné nechtěné zbytky efektu.', toggle: true, c: ORANGE },
    ...['SPACE', 'DUB ECHO', 'CRUSH', 'SWEEP', 'NOISE', 'FILTER'].map(
      (t, i): Item => ({
        k: 'btn',
        x: i % 2 ? 77.5 : 58,
        y: 172 + Math.floor(i / 2) * 22,
        w: 14,
        h: 10,
        t: t === 'DUB ECHO' ? 'DUB' : t,
        n: `COLOR efekt – ${t}`,
        fn: 'color-type',
        arg: t,
        on: t === 'FILTER',
        d:
          'Tady vybíráš, co budou dělat velké COLOR knoby na kanálech (vybraný bliká).\n' +
          {
            SPACE: 'SPACE = dozvuk, zvuk zní jako ve velké hale a „rozplývá se“.\nTip: skvělý na konec písničky – zatočíš, necháš doznít a stáhneš fader.',
            'DUB ECHO': 'DUB ECHO = ozvěna, která se opakuje a pomalu mizí.',
            CRUSH: 'CRUSH = zvuk se „rozbije“ a zní jako ze staré herní konzole.',
            SWEEP: 'SWEEP = zvuk začne rytmicky „pulzovat“ a sekat se.',
            NOISE: 'NOISE = přidá šum (ššššš). Používá se na napětí před dropem.',
            FILTER: 'FILTER = nejpoužívanější. Doleva: zvuk zní jako přes zeď / pod vodou. Doprava: tenký jako z telefonu.',
          }[t]!,
        grp: 'color',
        c: CYAN,
      }),
    ),
    { k: 'knob', x: 75, y: 258, r: 8, t: 'PARAMETER', n: 'Nastavení COLOR efektu', fn: 'color-param', d: 'Doladí vybraný COLOR efekt – třeba jak moc filtr „píská“ nebo jak dlouhá je ozvěna.' },
    // Headphones A
    { k: 'btn', x: 58, y: 288, w: 13, h: 9, t: 'LINK', n: 'LINK CUE (sluchátka A)', fn: 'link-cue', d: 'Poslechneš si do sluchátek písničku přímo ze seznamu na CDJ, aniž bys ji musel nahrát do přehrávače. Rychlé „ochutnání“, jestli se hodí.\nNa webu: pustí písničku vybranou v BROWSE (přepni poslech na 🎧 Sluchátka A).', toggle: true, c: ORANGE },
    { k: 'btn', x: 78.5, y: 288, w: 13, h: 9, t: 'MONO', n: 'MONO SPLIT (sluchátka A)', fn: 'mono-split', d: 'Rozdělí sluchátka: do levého ucha jde písnička, kterou připravuješ, do pravého to, co slyší lidi. Někomu se tak líp srovnávají bubny.\nZhasnuté = normálně obě uši stejně.', toggle: true, c: ORANGE },
    { k: 'knob', x: 75, y: 318, r: 8, t: 'MIX', n: 'Sluchátka A – MIX', fn: 'hp-mix', d: T.phonesMix },
    { k: 'knob', x: 75, y: 348, r: 8, t: 'LEVEL', n: 'Sluchátka A – hlasitost', fn: 'hp-level', d: T.phones },
    { k: 'screen', x: 70.5, y: 370, w: 9, h: 36, n: 'Zdířka na sluchátka A', d: 'Sem se zapojují sluchátka. A9 má dva páry (A a B), takže dva DJové u pultu můžou poslouchat každý něco jiného. Sluchátka B se zapojují zepředu.\n(Tady na webu nic nedělá – poslech přepínáš nahoře nad pultem.)' },
    // Channels
    ...[124, 168, 212, 256].flatMap((c, i): Item[] => [
      { k: 'knob', x: c, y: 38, r: 7, t: 'INPUT', n: `Odkud hraje kanál ${i + 1}`, fn: 'input', ch: i, d: 'Vybírá, odkud do kanálu jde zvuk: z CDJčka (DIGITAL), z notebooku (USB), z gramofonu (PHONO), z mobilu (Bluetooth)…\nTip: když z CDJ nic nehraje, často je to tímhle.' },
      { k: 'knob', x: c, y: 66, r: 7, t: 'TRIM', n: `TRIM (kanál ${i + 1})`, fn: 'trim', ch: i, d: T.trim },
      { k: 'knob', x: c, y: 98, r: 9, t: 'HI', n: `EQ HI (kanál ${i + 1})`, fn: 'hi', ch: i, d: T.hi },
      { k: 'knob', x: c, y: 130, r: 9, t: 'MID', n: `EQ MID (kanál ${i + 1})`, fn: 'mid', ch: i, d: T.mid },
      { k: 'knob', x: c, y: 163, r: 9, t: 'LOW', n: `EQ LOW (kanál ${i + 1})`, fn: 'low', ch: i, d: T.low },
      { k: 'meter', x: c - 21, y: 60, h: 98, n: `Ukazatel hlasitosti (kanál ${i + 1})`, fn: 'meter', ch: i, d: T.meter },
      { k: 'knob', x: c, y: 208, r: 11, t: 'COLOR', n: `COLOR (kanál ${i + 1})`, fn: 'color', ch: i, d: 'Velký knob na efekt. Co dělá, vybíráš tlačítky vlevo (FILTER, SPACE, NOISE…).\nUprostřed = vypnuto. Točíš doleva nebo doprava = efekt.\nTip: s FILTER pomalu točit při přechodu mezi písničkami.' },
      { k: 'btn', x: c - 16, y: 245, w: 16, h: 9, t: 'CUE A', n: `CUE A (kanál ${i + 1})`, fn: 'hp-cue', ch: i, d: `${T.headCue}\nA = do sluchátek A.`, toggle: true, c: ORANGE },
      { k: 'btn', x: c + 5, y: 245, w: 12, h: 9, t: 'B', n: `CUE B (kanál ${i + 1})`, fn: 'hp-cue-b', ch: i, d: 'To samé, ale do sluchátek B – pro druhého DJe, když hrajete spolu (b2b = „back to back“, střídáte se).', toggle: true, c: CYAN },
      { k: 'fader', x: c, y: 284, len: 56, v: i === 1 ? 1 : 0.15, t: `${i + 1}`, n: `Fader (kanál ${i + 1})`, fn: 'fader', ch: i, d: T.chFader },
      { k: 'btn', x: c - 10, y: 360, w: 20, h: 9, t: 'A·THRU·B', n: `Přiřazení ke crossfaderu (kanál ${i + 1})`, fn: 'xf-assign', ch: i, d: 'Páčka: jestli kanál ovládá crossfader (vodorovný posuvník dole) – na stranu A, B, nebo vůbec (THRU).\nTip: nech na THRU a mixuj svislými fadery, je to jednodušší.' },
    ]),
    { k: 'fader', x: 163, y: 408, len: 55, v: 0.5, dir: 'h', t: 'CROSSFADER', n: 'CROSSFADER', fn: 'xfader', d: `${T.crossfader}\nNa A9 funguje jen na kanály, které mají páčku nad ním na A nebo B.` },
    // Master + booth
    { k: 'knob', x: 304, y: 33, r: 9, t: 'MASTER', n: 'MASTER LEVEL', fn: 'master', d: `${T.master}\nTip: koukej na dva sloupečky pod ním – do červené ne, to pak reproduktory chrčí.` },
    { k: 'meter', x: 294, y: 60, h: 98, n: 'Hlasitost všeho (levý)', fn: 'meter', ch: -1, d: 'Ukazatel celkové hlasitosti – toho, co jde do reproduktorů. Drž se v oranžové, do červené ne.' },
    { k: 'meter', x: 311, y: 60, h: 98, n: 'Hlasitost všeho (pravý)', fn: 'meter', ch: -1, d: 'To samé pro pravý reproduktor.' },
    { k: 'knob', x: 304, y: 175, r: 6, t: 'HI', n: 'Booth – výšky', d: 'Booth = reproduktor přímo u DJe (odposlech), abys slyšel, co hraje. Tohle jsou jeho výšky.\n(Tady na webu nic nedělá – odposlech tu není, posloucháš master nebo sluchátka.)' },
    { k: 'knob', x: 304, y: 196, r: 6, t: 'LOW', n: 'Booth – basy', d: 'Basy v reproduktoru u DJe.\n(Tady na webu nic nedělá – odposlech tu není.)' },
    { k: 'knob', x: 304, y: 222, r: 8, t: 'BOOTH', n: 'BOOTH LEVEL', d: 'Hlasitost reproduktoru přímo u DJe (odposlechu). Na hlasitost pro lidi nemá vliv.\n(Tady na webu nic nedělá – odposlech tu není.)' },
    { k: 'btn', x: 288, y: 245, w: 14, h: 9, t: 'CUE A', n: 'MASTER CUE A', fn: 'hp-master', d: 'Pošle do sluchátek A to, co zrovna slyší lidi.', toggle: true, c: ORANGE },
    { k: 'btn', x: 309, y: 245, w: 12, h: 9, t: 'B', n: 'MASTER CUE B', fn: 'hp-master-b', d: 'Pošle do sluchátek B to, co zrovna slyší lidi.', toggle: true, c: CYAN },
    // Headphones B
    { k: 'btn', x: 287, y: 282, w: 13, h: 9, t: 'LINK', n: 'LINK CUE (sluchátka B)', fn: 'link-cue-b', d: 'Poslech písničky přímo ze seznamu na CDJ do sluchátek B, bez nahrání do přehrávače.', toggle: true, c: ORANGE },
    { k: 'btn', x: 309, y: 282, w: 13, h: 9, t: 'MONO', n: 'MONO SPLIT (sluchátka B)', fn: 'mono-split-b', d: 'Sluchátka B: levé ucho = písnička, kterou připravuješ, pravé = co slyší lidi.', toggle: true, c: ORANGE },
    { k: 'knob', x: 304, y: 309, r: 7, t: 'MIX', n: 'Sluchátka B – MIX', fn: 'hp-mix-b', d: T.phonesMix },
    { k: 'knob', x: 304, y: 334, r: 7, t: 'LEVEL', n: 'Sluchátka B – hlasitost', fn: 'hp-level-b', d: `${T.phones}\nSluchátka B se zapojují zepředu mixeru.` },
    { k: 'btn', x: 296, y: 352, w: 16, h: 8, t: 'ISO · EQ', n: 'EQ CURVE', fn: 'eq-curve', d: 'Jak silně fungují knoby HI/MID/LOW.\nISO: úplně doleva = to pásmo úplně zmizí (třeba basy úplně pryč).\nEQ: jen ubírají, nikdy úplně nevypnou.\nTip: ISO je fajn na přechody.', toggle: true, c: ORANGE },
    { k: 'btn', x: 296, y: 373, w: 16, h: 8, t: 'CH CURVE', n: 'Chování faderů', fn: 'ch-curve', d: 'Jak rychle přibývá hlasitost, když posouváš svislé fadery – plynule, nebo skoro hned naplno. Nastaví se jednou a neřeší se.' },
    { k: 'btn', x: 296, y: 393, w: 16, h: 8, t: 'XF CURVE', n: 'Chování crossfaderu', fn: 'xf-curve', d: 'Jak se chová crossfader: pomalé prolínání, nebo ostrý střih (pro scratchování). Nastaví se jednou a neřeší se.' },
    // MULTI I/O
    { k: 'knob', x: 341, y: 36, r: 8, t: 'SEND CH', n: 'SEND CH', d: 'Pro pokročilé: posílání zvuku do externí krabičky s efekty nebo do appky v mobilu. Tímhle vybereš, který kanál tam pošleš.\n(Tady na webu nic nedělá – žádná krabička s efekty tu není.)' },
    { k: 'btn', x: 362, y: 31, w: 13, h: 10, t: 'RET/USB', n: 'INSERT SOURCE', d: 'Pro pokročilé: odkud se zvuk s efektem vrací – z krabičky s efekty, nebo z mobilu.\n(Tady na webu nic nedělá – žádná krabička s efekty tu není.)' },
    { k: 'screen', x: 381, y: 20, w: 17, h: 22, t: 'USB', n: 'USB pro mobil', d: 'Sem se dá zapojit mobil nebo tablet – třeba appka s efekty. Taky ho tím nabiješ.\n(Tady na webu nic nedělá – žádný mobil tu není.)' },
    { k: 'knob', x: 341, y: 63, r: 8, t: 'SEND LEVEL', n: 'SEND LEVEL', d: 'Pro pokročilé: kolik zvuku posíláš do externího efektu.\n(Tady na webu nic nedělá – žádná krabička s efekty tu není.)' },
    { k: 'rbtn', x: 368, y: 63, r: 6, n: 'INSERT', d: 'Pro pokročilé: zapne externí efekt.\n(Tady na webu nic nedělá – žádná krabička s efekty tu není.)', toggle: true, c: ORANGE },
    // Beat FX
    { k: 'screen', x: 338, y: 92, w: 60, h: 46, t: 'REVERB · 1/2', n: 'Displej efektů', fn: 'fx-display', d: 'Beat FX = efekty, které jdou do rytmu písničky (ozvěna, dozvuk, sekání…).\nDisplej ukazuje, jaký efekt máš vybraný, jak je dlouhý a rychlost písničky.' },
    { k: 'screen', x: 334, y: 153, w: 69, h: 12, t: 'X-PAD', n: 'X-PAD', fn: 'xpad', d: 'Dotykový proužek. Položíš prst = efekt hraje, zvedneš = konec. Když prstem posuneš do strany, změníš délku efektu.\nNejrychlejší způsob, jak efekt krátce „ťuknout“.\nNa webu: podrž myš na proužku a táhni do stran.' },
    { k: 'btn', x: 343, y: 178, w: 17, h: 8.5, t: '◀', n: 'BEAT ◀', fn: 'fx-beat', arg: -1, d: `${T.beatLen}\nTohle tlačítko efekt zkrátí.` },
    { k: 'btn', x: 378, y: 178, w: 17, h: 8.5, t: '▶', n: 'BEAT ▶', fn: 'fx-beat', arg: 1, d: `${T.beatLen}\nTohle tlačítko efekt prodlouží.` },
    { k: 'rbtn', x: 343, y: 202, r: 4, n: 'AUTO / TAP', fn: 'fx-auto', d: 'Aby efekty šly do rytmu, mixer musí znát rychlost písničky. AUTO = pozná ji sám. TAP = vyťukáš ji ručně tlačítkem TAP.\nTip: nech AUTO.' },
    { k: 'rbtn', x: 368, y: 200, r: 8, t: 'TAP', n: 'TAP', fn: 'tap', d: 'Ťukáš do rytmu (jako když ťukáš nohou) a mixer si podle toho nastaví rychlost.' },
    { k: 'rbtn', x: 388, y: 202, r: 4, n: 'QUANTIZE', fn: 'fx-quantize', d: 'Pomocník: efekt se zapne přesně na úder bubnu, i když zmáčkneš trochu vedle.\nPodržením se otevře nastavení mixeru.', toggle: true, c: RED },
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
        d: 'Na kterou část zvuku efekt působí: LOW = basy, MID = středy (zpěv), HI = výšky (činely).\nTip: vypni LOW a reverb bude jen na zpěvu a činelech – basy zůstanou čisté a nebude to „bahno“.',
        toggle: true,
        on: true,
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 368, y: 254, r: 9, t: 'BEAT FX', n: 'Výběr efektu', fn: 'fx-type', d: 'Otočením vybereš efekt. Nejpoužívanější:\nREVERB = dozvuk jako v kostele, krásné „rozplynutí“.\nDELAY / ECHO = ozvěna.\nFLANGER / PHASER = zvuk „letí“ jako tryskáč.\nROLL = rychlé opakování kousku (ta-ta-ta-ta).\nFILTER = zvuk se „zavírá“ a „otevírá“.' },
    ...['1', '2', '3', '4', 'MIC', 'CF.A', 'CF.B', 'MST'].map(
      (t, i): Item => ({
        k: 'btn',
        x: [338.5, 353.5, 368.5, 385.5][i % 4],
        y: i < 4 ? 278 : 297,
        w: 12,
        h: 8,
        t,
        n: `Efekt na – ${t}`,
        fn: 'fx-ch',
        arg: t,
        d: 'Na co se efekt pustí: 1–4 = jen na jeden kanál (jednu písničku), MIC = na mikrofon, CF.A/CF.B = na stranu crossfaderu, MST = na všechno, co slyší lidi.\nTip: na konec písničky vyber jen její kanál, ať efekt nejde i na tu novou.',
        grp: 'fxch',
        on: t === 'MST',
        c: ORANGE,
      }),
    ),
    { k: 'knob', x: 368, y: 328, r: 8, t: 'TIME', n: 'TIME', fn: 'fx-time', d: 'Jemně doladí délku efektu (třeba jak dlouho dozvuk doznívá). Taky se s ním jezdí v nastavení na displeji.' },
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
