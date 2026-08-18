/**
 * The page-wide anime.js hub: the intro beat, the hero entrance, scroll
 * reveals, nav scramble-text, magnetic buttons, the custom cursor, and
 * scroll-parallax all live here so they can be sequenced against each other
 * (the hero waits on the intro; nothing else waits on anything). Two other
 * places use anime.js locally instead of through this file — `Footer.astro`'s
 * theme-wipe and `GalleryLightbox.astro`'s open/close transition — because
 * both are essential interactions (flip the theme, view the photo) that have
 * to keep working exactly as before if this file fails to load; they own a
 * plain, non-animated fallback locally rather than depending on a hub they
 * can't see.
 *
 * Every target in this file is fully visible in `global.css` (`.reveal
 * { opacity: 1; transform: none; }`, `.intro`/`.cursor` hidden only via a
 * class this file adds), so a script that fails to load, errors, or never
 * runs simply leaves a static page, never a blank one.
 *
 * `prefers-reduced-motion` is handled here explicitly: the global CSS rule in
 * `global.css` only freezes CSS `animation`/`transition`, and anime.js writes
 * inline styles that CSS can't touch, so the bail-out has to happen in JS.
 * Everything below is skipped outright when it's set — nothing here is a
 * "reduce it slightly" effect, they're all off/on.
 */
import { animate } from 'animejs/animation';
import { onScroll } from 'animejs/events';
import { stagger } from 'animejs/utils';
import { splitText, scrambleText } from 'animejs/text';
import { createTimeline } from 'animejs/timeline';
import { steps } from 'animejs/easings/steps';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The branded first-screen beat: a quick pop, a strobe flicker, then the
 * whole overlay lifts off like a curtain to reveal the hero already sitting
 * underneath it. Runs once per browser session — see the pre-paint script in
 * `Base.astro`, which is the only thing that can set `data-intro="pending"`
 * before this ever runs, and which this function is responsible for
 * clearing either way (played or skipped) so a later page in the same
 * session never re-arms it.
 */
function playIntro(): Promise<void> {
  const root = document.documentElement;

  const finish = () => {
    delete root.dataset.intro;
    document.body.style.overflow = '';
    try {
      sessionStorage.setItem('introSeen', '1');
    } catch {}
  };

  if (root.dataset.intro !== 'pending') return Promise.resolve();

  const overlay = document.querySelector<HTMLElement>('.intro');
  const mark = overlay?.querySelector('svg');
  if (!overlay || !mark) {
    finish();
    return Promise.resolve();
  }

  document.body.style.overflow = 'hidden';

  return new Promise((resolve) => {
    createTimeline({
      onComplete: () => {
        overlay.style.display = 'none';
        finish();
        resolve();
      },
    })
      .add(mark, { opacity: [0, 1], scale: [0.8, 1], duration: 320, ease: 'outBack' })
      .add(mark, { opacity: [1, 0.15, 1, 0.15, 1], duration: 360, ease: steps(5) })
      .add(overlay, { translateY: ['0%', '-100%'], duration: 620, ease: 'inOutExpo' }, '>=+120');
  });
}

/**
 * One choreographed timeline rather than parallel-fired animations: mark,
 * then headline (word by word, masked so it reads as a reveal rather than
 * text flying up from off-screen), then the rule/signature/ticker as a
 * closing beat. Each stage overlaps the tail of the previous one instead of
 * waiting for it to finish, which is what makes it read as one directed
 * gesture instead of three unrelated fade-ins.
 */
function animateHero() {
  const headline = document.querySelector<HTMLElement>('.hero h1');
  if (!headline) return;

  const mark = document.querySelector<HTMLElement>('.hero > svg');
  const rule = document.querySelector<HTMLElement>('.hero hr');
  const signature = document.querySelector<HTMLElement>('.hero .signature');
  const ticker = document.querySelector<HTMLElement>('.hero .ticker');
  const tail = [rule, signature, ticker].filter((el): el is HTMLElement => el !== null);

  const { words } = splitText(headline, { words: { wrap: 'clip' } });

  const timeline = createTimeline({ defaults: { ease: 'outExpo' } });

  if (mark) timeline.add(mark, { opacity: [0, 1], y: [16, 0], duration: 650 });

  timeline.add(
    words,
    { y: ['100%', '0%'], opacity: [0, 1], duration: 650, delay: stagger(40) },
    mark ? '-=460' : 0,
  );

  if (tail.length) {
    timeline.add(tail, { opacity: [0, 1], y: [12, 0], duration: 550, delay: stagger(80) }, '-=380');
  }
}

/**
 * Per-section reveal recipes rather than one uniform fade-up everywhere —
 * enough variation that no two sections move identically.
 *
 * `gallery` is opacity-only, deliberately: its tiles carry their own
 * always-on CSS `transform` (the fan layout — see `Gallery.astro`), and an
 * anime.js-animated `scale`/`y` here would write an inline `transform` that
 * replaces that whole calc() stack instead of blending with it.
 */
const RECIPES: Record<string, { opacity: [number, number]; y?: [number, number]; scale?: [number, number] }> = {
  gallery: { opacity: [0, 1] },
  haven: { opacity: [0, 1], scale: [0.97, 1], y: [8, 0] },
};
const DEFAULT_RECIPE: { opacity: [number, number]; y: [number, number] } = { opacity: [0, 1], y: [18, 0] };

function animateReveals() {
  // Group by container so siblings in the same section (show rows, gallery
  // tiles) stagger together instead of each firing its own independent
  // onScroll trigger — the latter looks like a flicker, not a reveal.
  const groups = new Map<HTMLElement, HTMLElement[]>();

  document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
    if (el.closest('.hero')) return; // handled by animateHero() instead.

    const group = el.closest<HTMLElement>('section') ?? el.parentElement ?? el;
    const targets = groups.get(group) ?? [];
    targets.push(el);
    groups.set(group, targets);
  });

  groups.forEach((targets, group) => {
    const recipe = RECIPES[group.id] ?? DEFAULT_RECIPE;

    animate(targets, {
      ...recipe,
      duration: 600,
      ease: 'outExpo',
      delay: stagger(65, { from: group.id === 'gallery' ? 'center' : 'first' }),
      autoplay: onScroll({ target: group }),
    });
  });
}

/**
 * A glitch-decode read on nav labels: the label scrambles back to itself on
 * hover rather than a plain underline or opacity shift. Short, all-caps
 * words (SHOWS, HAVEN, ABOUT…) are exactly the case this effect reads best
 * on — it'd be noise on a full sentence.
 */
function animateNavScramble() {
  // Not `.nav a` — that also matches `.mark`, the logo-wrapping link, whose
  // innerHTML is an <svg>, not text. Scope to the actual text labels.
  document.querySelectorAll<HTMLElement>('.nav .links a, .nav .disclosure a').forEach((link) => {
    link.addEventListener('mouseenter', () => {
      animate(link, { innerHTML: scrambleText({ chars: 'uppercase', duration: 420 }) });
    });
  });
}

/**
 * Buttons and the hero's scroll cue pull toward the cursor while hovered
 * and snap back on release, plus a quick compress-and-spring "punch" on
 * press — the single most recognisable "someone actually designed this"
 * tell on agency sites, and cheap to add once for every target that wants
 * it.
 */
function animateMagnetic() {
  document.querySelectorAll<HTMLElement>('.btn, .play, .cue').forEach((el) => {
    const strength = el.classList.contains('cue') ? 0.5 : 0.25;

    el.addEventListener('mousemove', (event) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * strength;
      const y = (event.clientY - rect.top - rect.height / 2) * strength;
      animate(el, { x, y, duration: 350, ease: 'outQuad' });
    });

    el.addEventListener('mouseleave', () => {
      animate(el, { x: 0, y: 0, duration: 500, ease: 'outElastic' });
    });

    el.addEventListener('mousedown', () => animate(el, { scale: 0.92, duration: 120, ease: 'outQuad' }));
    el.addEventListener('mouseup', () => animate(el, { scale: 1, duration: 260, ease: 'outElastic' }));
  });
}

/**
 * A trailing ring plus a tight dot, both `mix-blend-mode: difference` (see
 * `Cursor.astro`) so they invert against dark and light sections alike for
 * free. Fine-pointer only — `matchMedia('(hover: hover) and (pointer:
 * fine)')` is the same test used to decide whether hover states make sense
 * at all, so a touch visitor never gets a half-working replacement cursor.
 */
function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot = document.querySelector<HTMLElement>('.cursor-dot');
  const ring = document.querySelector<HTMLElement>('.cursor-ring');
  if (!dot || !ring) return;

  document.documentElement.classList.add('has-cursor');

  let tracking = false;

  document.addEventListener('mousemove', (event) => {
    const { clientX: left, clientY: top } = event;
    // The dot tracks near-instantly; the ring trails behind it — that gap is
    // what reads as "following" rather than "glued to the pointer". The
    // very first move snaps both in place instead of flying in from (0, 0).
    animate(dot, { left, top, duration: tracking ? 90 : 0, ease: 'outQuad' });
    animate(ring, { left, top, duration: tracking ? 380 : 0, ease: 'outQuad' });
    tracking = true;
  });

  document.querySelectorAll<HTMLElement>('a, button, summary, .mix-card').forEach((el) => {
    el.addEventListener('mouseenter', () => animate(ring, { scale: 1.8, duration: 300, ease: 'outQuad' }));
    el.addEventListener('mouseleave', () => animate(ring, { scale: 1, duration: 300, ease: 'outQuad' }));
  });
}

/**
 * Depth on scroll: the hero's darkening scrim drifts slower than the page
 * scrolls past it.
 *
 * Targets `.scrim`, not `.backdrop`: `.backdrop` already runs its own
 * always-on CSS `aura-drift` keyframe animation when there's no video, and a
 * running CSS animation on `transform` overrides any inline `transform`
 * anime.js would write to the same element — the parallax would be silently
 * discarded. The scrim has no competing animation, so it's a clean target
 * for the same visual effect.
 *
 * Gallery tiles don't get this treatment (they used to): they now carry
 * their own always-on CSS `transform` — the fan layout in `Gallery.astro` —
 * and a continuous scroll-driven `translateY` here would fight it the same
 * way `.backdrop`'s CSS animation would.
 */
function animateParallax() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const scrim = hero?.querySelector<HTMLElement>('.scrim');
  if (!hero || !scrim) return;

  animate(scrim, {
    translateY: [0, 140],
    // `enter` has to be pinned to the hero's own top edge, not left at the
    // default ('end start' — target's top crossing the *container's*
    // bottom, i.e. entering from below): that default assumes the target
    // starts below the fold and scrolls up into view, which the hero never
    // does — it fills the viewport from first paint, so the default
    // condition is already true at scroll position 0. The scrim then starts
    // partway into its drift instead of at 0, leaving its top ~105px
    // undarkened — visible as a hard seam against the aura underneath.
    autoplay: onScroll({ target: hero, sync: true, enter: 'start start' }),
  });
}

// Every const/function above must be declared before this runs — it calls
// straight into them.
if (!reduceMotion) {
  playIntro().then(animateHero);
  animateReveals();
  animateNavScramble();
  animateMagnetic();
  initCursor();
  animateParallax();
}
