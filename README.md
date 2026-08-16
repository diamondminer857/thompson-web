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
| Links, email, latest mix, next gig, headline | `src/site.ts` |
| Calendar file for the next gig | `src/pages/event.ics.ts` |
| The mark | `src/components/Logo.astro` |
| Page content and styling | `src/components/Site.astro` |
| `<head>`, palette, fonts | `src/layouts/Base.astro` |
| Poster variant pages | `src/pages/[variant].astro` |

Changing the mix each month is one line: `latestMix` in `src/site.ts`.

## The next gig

`nextEvent` in `src/site.ts` drives both the block on the page and `/event.ics`,
so the two cannot drift apart. Set it to `null` and the block disappears; a build
that runs after the event's end time drops it as well, so a stale date can only
survive until the next deploy — which on a static site means someone has to push.

Times carry an explicit UTC offset (`+02:00` in summer, `+01:00` in winter) so
the calendar entry lands on the right hour abroad. "Add to calendar" links to the
`.ics` **without** a `download` attribute on purpose: iOS opens a `text/calendar`
response straight in Calendar, rather than dropping a file into Files for the
visitor to go and find.

## Design notes

The poster is black ink on white paper, so the page is too — someone arriving
from a QR code should recognise the place instantly. White here is the identity
and the mood, not a "light mode": trance is lift, so the page is bright and
airy rather than another dark club site.

That means **`prefers-color-scheme` is deliberately ignored**. Everyone gets
white, including visitors whose system is set to dark. The only way to the
negative is the quiet toggle at the very bottom of the page, which stores the
choice in `localStorage`; an inline script in `<head>` re-applies it before
first paint so there is no flash. Because the identity is strictly black and
white, that negative is a true inversion rather than a second palette —
`--paper` and `--ink` swap and everything, the mark included, follows.

The mark is a single `<path>` with `fill-rule="evenodd"`. The face is a hole
rather than a white shape, which is what lets it invert for free.

The hero carries two things that are purely atmosphere: a slow updraft of light
behind the mark (a few percent of ink, so it reads as air rather than as a
gradient), and the scroll cue — something weightless holding itself off the
ground and shedding halos upward. Its shadow tightens as it rises, which is
what makes it read as levitation instead of movement. Both respect
`prefers-reduced-motion`; the cue falls back to a still composition.

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

- `contact@thompsondj.com` is on the page but does not exist yet: add a
  Cloudflare Email Routing rule for it, or mail to it will bounce.
- Regenerate the poster QR codes against `https://thompsondj.com/p1` etc.
- `nextEvent.end` for Festival na Rychtě is a placeholder (22:00) — the listing
  gives no finish time. Correct it so the calendar entry is honest.
