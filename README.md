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
| Links, email, bio, shows, mixes, gallery, press, headline | `src/site.ts` |
| Calendar file for the next gig | `src/pages/event.ics.ts` |
| The mark | `src/components/Logo.astro` |
| Page composition | `src/components/Site.astro` |
| Sticky nav + scrollspy | `src/components/Nav.astro` |
| One section each | `src/components/sections/*.astro` |
| Show row, mix card, media placeholder | `src/components/{EventRow,MixCard,MediaFrame,Placeholder}.astro` |
| Shared tokens and section chrome | `src/styles/global.css` |
| Scroll reveals and the hero entrance | `src/scripts/motion.ts` |
| `<head>`, fonts | `src/layouts/Base.astro` |
| Poster variant pages | `src/pages/[variant].astro` |

Changing the mix each month is one line: add an entry to the front of `mixes` in
`src/site.ts`.

## Shows

`events` in `src/site.ts` is the full list, in any order — the page and
`/event.ics` both sort it and drop anything whose `end` has already passed, so a
stale date can only survive until the next deploy (a static site means someone
has to push). The soonest one is "featured" on the page and drives both the hero
ticker and the calendar file; add more and they appear underneath.

Times carry an explicit UTC offset (`+02:00` in summer, `+01:00` in winter) so
the calendar entry lands on the right hour abroad. "Add to calendar" links to the
`.ics` **without** a `download` attribute on purpose: iOS opens a `text/calendar`
response straight in Calendar, rather than dropping a file into Files for the
visitor to go and find.

## Media placeholders

Nothing in `src/assets/` or `public/media/` yet — every photo in `gallery`, the
`about` portrait, and `heroVideo` are placeholders (`src: null` / `null`) that
render as a hatched box captioned with the exact path to drop the real file at.
Swapping one in is a one-line edit in `src/site.ts`; the box is already sized at
the real aspect ratio, so nothing reflows when the file lands.

## Design notes

Dark is the identity now: the site moved from the poster's black-ink-on-white to
a full-bleed dark ground, because that's where photography and video actually
read, and because a booker's first stop is now a page with real media on it
rather than a single screen of type. It costs the original poster→page
recognition — the printed series is still black ink on white paper — which is
why the inversion toggle in the footer survived the flip, relabelled **Light
mode**: anyone who wants the page that matches their poster can still have it.

**`prefers-color-scheme` is still deliberately ignored.** Everyone gets the same
default regardless of system setting; the only way to the other palette is that
footer toggle, which stores the choice in `localStorage`. An inline script in
`<head>` re-applies it before first paint so there is no flash. The palette is
still strictly two colours — `--paper` and `--ink`, swapped wholesale by
`data-theme` — so the negative stays a true inversion rather than a second
palette, mark included; the only additions are `--paper-raised` and `--hairline`,
both derived from `--ink` via `color-mix()`, for surfaces that need to sit a
shade off the base without introducing a third hue.

One section opts out of the inversion on purpose: the hero's colours are
hardcoded rather than token-driven, because its background is real footage (or
the aura standing in for it) and video can't invert. It stays a dark band with
white type even in Light mode — every other section still follows the toggle.

The mark is a single `<path>` with `fill-rule="evenodd"`. The face is a hole
rather than a white shape, which is what lets it invert for free — and which
means it can never sit directly over footage without the video showing through
the eyes and mouth, so the hero always gives it a scrim or a solid band.

The hero's levitation cue — something weightless holding itself off the ground,
shedding halos upward, its shadow tightening as it climbs — is unchanged from
the original page: it's the best thing on it, it's pure CSS, and it already
handled `prefers-reduced-motion` correctly. The hero backdrop is real footage
when `heroVideo` is set, and the same "slow updraft of light" atmosphere the
whole page used to run on, scaled up to full-bleed, when it isn't.

Beyond the cue, motion is `animejs` (`src/scripts/motion.ts`): a split-text hero
entrance, and a scroll reveal for anything marked `.reveal`. Every reveal target
is fully visible by default in `global.css` — the script sets its own hidden
state at runtime — so a failed or blocked script leaves a static page, never a
blank one, and `prefers-reduced-motion` is checked explicitly in the script
itself, since CSS's blanket animation-freeze can't reach anime.js's inline
styles.

The Mixcloud player is a third-party iframe that sets cookies and costs a few
hundred kB, so it loads on click, per card. Nothing third-party runs for a
visitor who never asks for a mix, and there is nothing to put a cookie banner in
front of.

## Poster tracking

Each poster's QR points at its own path — `/p1`, `/p2`, … — listed in
`posterVariants` in `src/site.ts`. They are real pages with near-identical
content, not redirects, because a 302 is invisible to a client-side analytics
beacon. They carry `noindex` and a canonical to `/`, so search engines see one
page. The one difference: each poster's `note` — the line actually printed on
that poster — is echoed back as the hero headline, so the page a scan lands on
matches the paper it came from.

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
- Real media: `gallery`, `heroVideo` and `press` in `src/site.ts` are all
  placeholders — see "Media placeholders" above for how to swap them in. `bio`
  is drafted text, not a placeholder marker — read it over and edit to taste.
- `public/apple-touch-icon.png` still shows the old light mark; regenerate it
  to match the new dark favicon once real brand assets exist.
