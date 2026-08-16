/** Everything that is likely to change lives here, so the pages stay dumb. */

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

  /** Latest Haven episode. Path as Mixcloud writes it, with both slashes. */
  latestMix: {
    label: 'Haven',
    number: '003',
    feed: '/Thompson111/thompson-haven-mix-003/',
    url: 'https://www.mixcloud.com/Thompson111/thompson-haven-mix-003/',
  },
} as const;

/**
 * The next gig, or `null` when there isn't one — the page drops the whole
 * block rather than showing an empty slot. A build that happens after the
 * event has ended drops it too, so a stale date can only survive until the
 * next deploy.
 *
 * Times carry an explicit offset (CEST is +02:00, CET is +01:00) so the `.ics`
 * lands on the right hour for someone in another country.
 */
export const nextEvent: {
  title: string;
  /** ISO 8601 with offset. */
  start: string;
  end: string;
  place: string;
  address: string;
  url: string;
} | null = {
  title: 'Festival na Rychtě',
  start: '2026-08-29T14:00:00+02:00',
  // The listing gives no finish time; this is a placeholder so the calendar
  // entry has a sensible length. Correct it when the running order is out.
  end: '2026-08-29T22:00:00+02:00',
  place: 'Úvalno',
  address: 'Úvalno 793 91, Czechia',
  url: 'https://fb.me/e/4ZW9aWe4w',
};

/**
 * Poster variants. Each gets its own real page (not a redirect) so Cloudflare
 * Web Analytics can attribute scans to a poster — a 302 would be invisible to a
 * client-side beacon.
 */
export const posterVariants = [
  { slug: 'p1', note: 'God is looking when Thompson is cooking.' },
  { slug: 'p2', note: 'Find your haven.' },
  { slug: 'p3', note: 'We don’t drop. We lift.' },
  { slug: 'p4', note: 'Krnov has a sound now.' },
] as const;
