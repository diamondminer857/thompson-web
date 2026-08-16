# thompsondj.com

Landing page for **THOMPSON** (Tomáš Holinka) — trance & melodic techno DJ/producer.
It is the destination for the QR code on the poster series, so the job of the page
is: confirm you're in the right place, play the latest *Haven* mix, and make a
booking enquiry one tap away.

Astro, static output, served from Cloudflare Workers static assets.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run preview
npm run deploy   # build + wrangler deploy
```

## Where things are

| What | Where |
| --- | --- |
| Links, email, latest mix, headline | `src/site.ts` |
| The mark | `src/components/Logo.astro` |
| Page content and styling | `src/components/Site.astro` |
| `<head>`, palette, fonts | `src/layouts/Base.astro` |
| Poster variant pages | `src/pages/[variant].astro` |

Changing the mix each month is one line: `latestMix` in `src/site.ts`.

## Design notes

The poster is black ink on white paper, so the page is too — someone arriving
from a QR code should recognise the place instantly. Because the identity is
strictly black and white, dark mode is a true negative rather than a second
palette; `--paper` and `--ink` swap and everything, the mark included, follows.

The mark is a single `<path>` with `fill-rule="evenodd"`. The face is a hole
rather than a white shape, which is what lets it invert for free.

The Mixcloud player is a third-party iframe that sets cookies and costs a few
hundred kB, so it loads on click. Nothing third-party runs for a visitor who
never asks for the mix, and there is nothing to put a cookie banner in front of.

## Poster tracking

Each poster's QR points at its own path — `/p1`, `/p2`, … — listed in
`posterVariants` in `src/site.ts`. They are real pages with identical content,
not redirects, because a 302 is invisible to a client-side analytics beacon.
They carry `noindex` and a canonical to `/`, so search engines see one page.

Cloudflare Web Analytics then shows which line actually gets scanned.

## Analytics

Set `PUBLIC_CF_BEACON_TOKEN` (see `.env.example`) locally and in the Cloudflare
build settings. Unset, no beacon is emitted.

## Still to do

- Point the booking address at `booking@thompsondj.com` once it exists —
  currently `max@maxbabic.dev` (`bookingEmail` in `src/site.ts`).
- Regenerate the poster QR codes against `https://thompsondj.com/p1` etc.
