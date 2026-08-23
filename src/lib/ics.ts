import { nextEvent, site } from '../site';
import { localizeCountry, type Lang } from '../i18n';

/**
 * The "Add to calendar" target, shared by `/event.ics` and `/cs/event.ics` —
 * built from `nextEvent` at build time so the page and the calendar entry
 * can never disagree, and from a single function so the two routes can't
 * drift out of sync with each other either.
 *
 * Deliberately served without a `download` attribute on the link: iOS opens a
 * `text/calendar` response straight in Calendar, which is nicer than dropping a
 * file into Files and making the visitor find it.
 */

/** RFC 5545 §3.3.11 — backslash, semicolon, comma and newline are special. */
const esc = (value: string) =>
  value.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');

/** RFC 5545 §3.3.5 — UTC, basic format, no punctuation. */
const stamp = (value: Date) => value.toISOString().replace(/[-:]|\.\d{3}/g, '');

/**
 * RFC 5545 §3.1 — no content line may exceed 75 octets. Diacritics in "Rychtě"
 * and "Úvalno" cost two bytes each, so fold on encoded length, not characters.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let octets = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines are prefixed with a space that counts toward the 75.
    const limit = parts.length === 0 ? 75 : 74;

    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }

    current += char;
    octets += size;
  }

  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcsResponse(lang: Lang) {
  // RFC 5545 §3.7.3 language token — the same event described in another
  // language, not a different event, so the UID below stays identical
  // across both: an app that already has the English entry should update
  // it, not create a second one.
  const langTag = lang === 'cs' ? 'CS' : 'EN';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${site.name}//thompsondj.com//${langTag}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  if (nextEvent) {
    const start = new Date(nextEvent.start);

    lines.push(
      'BEGIN:VEVENT',
      // Stable across rebuilds and across languages, so re-adding (in
      // either language) updates the entry instead of creating a second one.
      `UID:${stamp(start)}-${site.name.toLowerCase()}@thompsondj.com`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(nextEvent.end))}`,
      `SUMMARY:${esc(`${site.name} — ${nextEvent.title}`)}`,
      `LOCATION:${esc(localizeCountry(nextEvent.address, lang))}`,
      `DESCRIPTION:${esc(`${site.strapline}. ${nextEvent.url}`)}`,
      `URL:${esc(nextEvent.url)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="thompson-next.ics"',
    },
  });
}
