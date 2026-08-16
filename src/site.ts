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

  /** Placeholder until booking@thompsondj.com exists. */
  bookingEmail: 'max@maxbabic.dev',

  /** Latest Haven episode. Path as Mixcloud writes it, with both slashes. */
  latestMix: {
    label: 'Haven',
    number: '003',
    feed: '/Thompson111/thompson-haven-mix-003/',
    url: 'https://www.mixcloud.com/Thompson111/thompson-haven-mix-003/',
  },
} as const;

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
