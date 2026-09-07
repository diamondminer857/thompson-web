// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://thompsondj.com',

  build: {
    format: 'directory',
    // Now a real multi-section page with its own component-scoped CSS per
    // section, so inlining everything into every one of the five prerendered
    // routes costs more than the extra round trip saves. Let Astro decide
    // per-page instead.
    inlineStylesheets: 'auto',
  },

  // Self-hosted at build time — no Google Fonts <link>, no third-party RTT.
  // latin-ext carries the diacritics in "Tomáš Holinka".
  //
  // Two faces, not one: a characterful display face reserved for the handful
  // of "big moments" (the headline, the episode number, a show title), and a
  // plainer workhorse grotesk for everything that has to stay legible small
  // — labels, buttons, body copy. One face doing both jobs is what makes a
  // page read as a generic template — see the component-level
  // `font-family: var(--font-display)` overrides for where the split face
  // is used.
  //
  // The technical/rave-poster pairing: Unbounded's blocky, wide-set geometry
  // holds its character even in uppercase (verified by rendering it against
  // the previous Poppins bold side by side before committing — unlike a
  // humanist face, its personality isn't lowercase-only), which matters
  // because every display moment on this page is set in caps.
  fonts: [
    {
      name: 'Unbounded',
      cssVariable: '--font-display',
      provider: fontProviders.google(),
      // 800 is the hero headline only; 700 covers every other display
      // moment (episode number, show title, email, 404).
      weights: [700, 800],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
      optimizedFallbacks: true,
      display: 'swap',
    },
    {
      name: 'Space Grotesk',
      cssVariable: '--font-body',
      provider: fontProviders.google(),
      // 400 body default, 600 for buttons/labels/nav (a firmer UI weight
      // than plain body text — 500 read as "nobody chose this" at small
      // tracked sizes), 700 for the wordmark and compact row titles.
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
      optimizedFallbacks: true,
      display: 'swap',
    },
  ],
});
