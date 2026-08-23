/** Shared with the hero ticker, the featured show, and every compact row —
 * one place formatting the venue's own time, not the visitor's. */
import type { Lang } from '../i18n';

const zone = 'Europe/Prague';

/** BCP 47 tag per site language — `Intl` locale, not the site's own `Lang`
 * union, so this is the one place that mapping lives. */
const locales: Record<Lang, string> = { en: 'en-GB', cs: 'cs-CZ' };

const part = (at: Date, lang: Lang, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locales[lang], { timeZone: zone, ...options }).format(at);

/** "Saturday 29 August 2026 • 14:00" ("sobota 29. srpna 2026 • 14:00" in cs) */
export function formatWhen(iso: string, lang: Lang) {
  const at = new Date(iso);
  const day = part(at, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = part(at, lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} • ${time}`;
}

/** "29 Aug" ("29. 8." in cs) — compact rows and the hero ticker. */
export function formatShort(iso: string, lang: Lang) {
  const at = new Date(iso);
  return part(at, lang, { day: 'numeric', month: 'short' });
}
