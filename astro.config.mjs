// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://thompsondj.com',

  build: {
    format: 'directory',
    // The whole site is one screen of CSS. A separate stylesheet would cost a
    // render-blocking round trip for less than it saves.
    inlineStylesheets: 'always',
  },

  // Self-hosted at build time — no Google Fonts <link>, no third-party RTT.
  // latin-ext carries the diacritics in "Tomáš Holinka".
  fonts: [
    {
      name: 'Poppins',
      cssVariable: '--font-display',
      provider: fontProviders.google(),
      // 700 for the headline, 300 for the letter-spaced straplines.
      weights: [300, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
      optimizedFallbacks: true,
      display: 'swap',
    },
  ],
});
