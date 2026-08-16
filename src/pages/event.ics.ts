import { nextEvent, site } from '../site';

/**
 * The "Add to calendar" target. Generated from `nextEvent` at build time so the
 * page and the calendar entry can never disagree.
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

export function GET() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${site.name}//thompsondj.com//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  if (nextEvent) {
    const start = new Date(nextEvent.start);

    lines.push(
      'BEGIN:VEVENT',
      // Stable across rebuilds, so re-adding updates the entry instead of
      // creating a second one.
      `UID:${stamp(start)}-${site.name.toLowerCase()}@thompsondj.com`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(nextEvent.end))}`,
      `SUMMARY:${esc(`${site.name} — ${nextEvent.title}`)}`,
      `LOCATION:${esc(nextEvent.address)}`,
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
