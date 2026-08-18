/** Everything that is likely to change lives here, so the pages stay dumb. */
import type { ImageMetadata } from 'astro';

import portraitPhoto from './assets/photos/portrait.jpg';
import portraitAltPhoto from './assets/photos/portrait-alt.jpg';
import gallery01 from './assets/photos/gallery-01.jpg';
import gallery02 from './assets/photos/gallery-02.jpg';
import gallery03 from './assets/photos/gallery-03.jpg';
import gallery04 from './assets/photos/gallery-04.jpg';
import gallery05 from './assets/photos/gallery-05.jpg';
import gallery06 from './assets/photos/gallery-06.jpg';
import haven003Artwork from './assets/photos/haven-003.jpg';

export const site = {
  name: 'THOMPSON',
  realName: 'Tomáš Holinka',
  base: 'Krnov, CZ',
  strapline: 'Trance & Melodic Techno',

  /** The one line on the landing screen. */
  headline: 'Find your haven.',

  instagram: 'https://instagram.com/thompson__dj',
  mixcloud: 'https://www.mixcloud.com/Thompson111/',

  /** Needs a Cloudflare Email Routing rule on the domain to actually deliver. */
  bookingEmail: 'contact@thompsondj.com',
} as const;

export const bio = {
  short: 'Trance and melodic techno from Krnov, built for rooms that want to lift.',
  long: [
    'Tomáš Holinka records and plays as THOMPSON — trance and melodic techno out of',
    'Krnov, Czechia. Haven, his monthly mix series, is where the sound is laid out',
    'in full; club sets pull the same palette into a shorter, harder arc for the',
    'floor. Booking is open for clubs, festivals and private events.',
  ].join(' '),
} as const;

/**
 * One shape for every image slot on the page, real or not. `src: null`
 * renders a designed placeholder plate (`Placeholder.astro`) at the real
 * aspect ratio instead of a broken image or a layout shift; a real slot is a
 * static `import` from `src/assets/photos/` (see the imports above), passed
 * straight through to `astro:assets`'s `<Image>` in `MediaFrame.astro` for
 * build-time resizing/compression — never a plain string path, and never
 * anything from `public/`, which skips that pipeline entirely. `path` is
 * shown only in dev on the still-empty slots, as a hint of where the file
 * should land; `tone` picks which accent an empty slot's wash and corner
 * ticks borrow, so a grid of empty slots still reads as designed rather than
 * as N copies of the same box.
 */
export interface Media {
  src: ImageMetadata | null;
  alt: string;
  ratio: `${number} / ${number}`;
  path: string;
  tone?: 'cyan' | 'magenta' | 'violet';
}

interface Event {
  title: string;
  /** ISO 8601 with offset. CEST is +02:00, CET is +01:00, so the `.ics` lands
   * on the right hour for someone booking from another country. */
  start: string;
  end: string;
  place: string;
  address: string;
  url: string;
  soldOut?: boolean;
  /** Optional flyer/poster art for the featured row. A show without one
   * just renders as type — see `Shows.astro`. */
  poster?: Media;
}

/**
 * Every announced show, in any order — the page and `/event.ics` both sort
 * and filter this at build time. An event whose `end` has already passed
 * drops out of both on the next build, so a stale date can only survive
 * until someone pushes; there is nothing to remember to clean up by hand.
 */
export const events: Event[] = [
  {
    title: 'Festival na Rychtě',
    start: '2026-08-29T14:00:00+02:00',
    // The listing gives no finish time; this is a placeholder so the calendar
    // entry has a sensible length. Correct it when the running order is out.
    end: '2026-08-29T22:00:00+02:00',
    place: 'Úvalno',
    address: 'Úvalno 793 91, Czechia',
    url: 'https://fb.me/e/4ZW9aWe4w',
    poster: { src: null, alt: 'Festival na Rychtě flyer', ratio: '2 / 3', path: 'src/assets/photos/show-rychta.jpg', tone: 'cyan' },
  },
];

/** The soonest show that hasn't ended yet, or `null` — drives the hero
 * ticker, the featured row in Shows, and `/event.ics`, so none of the three
 * can ever disagree with the other two. */
export const nextEvent: Event | null =
  events
    .filter((event) => new Date(event.end) > new Date())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;

interface Mix {
  label: string;
  number: string;
  /** Path as Mixcloud writes it, with both slashes. */
  feed: string;
  url: string;
  artwork: Media;
}

/** Haven episodes, newest first. */
export const mixes: Mix[] = [
  {
    label: 'Haven',
    number: '003',
    feed: '/Thompson111/thompson-haven-mix-003/',
    url: 'https://www.mixcloud.com/Thompson111/thompson-haven-mix-003/',
    artwork: { src: haven003Artwork, alt: 'Haven 003 artwork', ratio: '1 / 1', path: 'src/assets/photos/haven-003.jpg', tone: 'magenta' },
  },
];

/** The About section's portrait, plus a second smaller frame that overlaps
 * it — a contact-sheet pair rather than one lonely box. */
export const portrait: Media = {
  src: portraitPhoto,
  alt: 'THOMPSON, portrait',
  ratio: '4 / 5',
  path: 'src/assets/photos/portrait.jpg',
  tone: 'violet',
};
export const portraitAlt: Media = {
  src: portraitAltPhoto,
  alt: 'Hands on the mixer, mid-set',
  ratio: '1 / 1',
  path: 'src/assets/photos/portrait-alt.jpg',
  tone: 'cyan',
};

/** Live/press imagery for the gallery wheel. */
export const gallery: Media[] = [
  { src: gallery01, alt: 'THOMPSON at the decks', ratio: '3 / 4', path: 'src/assets/photos/gallery-01.jpg', tone: 'cyan' },
  { src: gallery02, alt: 'THOMPSON, arms up over the crowd', ratio: '3 / 4', path: 'src/assets/photos/gallery-02.jpg', tone: 'magenta' },
  { src: gallery03, alt: 'Hands forming a heart, festival lights', ratio: '3 / 4', path: 'src/assets/photos/gallery-03.jpg', tone: 'violet' },
  { src: gallery04, alt: '"Live Love Thompson", held up in the crowd', ratio: '3 / 4', path: 'src/assets/photos/gallery-04.jpg', tone: 'cyan' },
  { src: gallery05, alt: 'THOMPSON at the controller, colour-lit', ratio: '3 / 4', path: 'src/assets/photos/gallery-05.jpg', tone: 'magenta' },
  { src: gallery06, alt: 'THOMPSON at the controller, daylight set', ratio: '3 / 4', path: 'src/assets/photos/gallery-06.jpg', tone: 'violet' },
];

/** EPK downloads. `null` renders as "on request" and points at the booking
 * email instead of a dead link. */
export const press: {
  kit: string | null;
  logoPack: string | null;
  photoPack: string | null;
  rider: string | null;
} = {
  kit: null,
  logoPack: null,
  photoPack: null,
  rider: null,
};

/** The hero's background footage. `null` until real capture exists — the
 * hero then falls back to the same drifting-aura treatment the page has
 * always used, which also doubles as the permanent `prefers-reduced-motion`
 * and save-data fallback once real footage lands. */
export const heroVideo: { mp4: string; webm: string; poster: string } | null = {
  mp4: '/head.mp4',
  webm: '/head.webm',
  poster: '/head-poster.jpg',
};

/** The full-bleed textural band between Shows and Haven — see `Band.astro`.
 * Deliberately reuses `heroVideo`'s own URLs rather than a second asset: the
 * browser already has them cached from the hero, so the band costs one more
 * `<video>` element and zero more bytes. `still` is the fallback plate if
 * `video` is ever unset. */
export const band = {
  video: heroVideo,
  line: 'We don’t drop. We lift.',
  still: { src: null, alt: 'Room, mid-set', ratio: '21 / 9', path: 'src/assets/photos/band.jpg', tone: 'violet' } satisfies Media,
};

/**
 * Poster variants. Each gets its own real page (not a redirect) so Cloudflare
 * Web Analytics can attribute scans to a poster — a 302 would be invisible to a
 * client-side beacon. `note` is the line printed on that specific poster; the
 * page echoes it back as the hero headline so the scan matches the paper.
 */
export const posterVariants = [
  { slug: 'p1', note: 'God is looking when Thompson is cooking.' },
  { slug: 'p2', note: 'Find your haven.' },
  { slug: 'p3', note: 'We don’t drop. We lift.' },
  { slug: 'p4', note: 'Krnov has a sound now.' },
] as const;
