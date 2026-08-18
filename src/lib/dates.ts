/** Shared with the hero ticker, the featured show, and every compact row —
 * one place formatting the venue's own time, not the visitor's. */

const zone = 'Europe/Prague';

const part = (at: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...options }).format(at);

/** "Saturday 29 August 2026 • 14:00" */
export function formatWhen(iso: string) {
  const at = new Date(iso);
  const day = part(at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = part(at, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} • ${time}`;
}

/** "29 Aug" — compact rows and the hero ticker. */
export function formatShort(iso: string) {
  const at = new Date(iso);
  return part(at, { day: 'numeric', month: 'short' });
}
