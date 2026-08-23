import en from './en';
import cs from './cs';

/** English at the root, Czech at `/cs/*`. No auto-detect: a visitor always
 * lands on the default language and switches by hand via the nav toggle —
 * see `alternatePath` below. */
export const defaultLang = 'en' as const;

export const languages = { en, cs } as const;
export type Lang = keyof typeof languages;

type Dict = typeof en;
export type Key = keyof Dict;

/** `/cs/…` → `'cs'`, everything else → `'en'`. Poster pages (`/p1`…) have no
 * `/cs` counterpart and are never reached through this prefix, so they
 * always resolve to English, which is what they should print anyway. */
export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  return first === 'cs' ? 'cs' : defaultLang;
}

/** `t(key, params?)` for the given language. Falls back to the English
 * string (then to the bare key) if a translation is missing, so a partial
 * `cs.ts` never renders a blank. */
export function useTranslations(lang: Lang) {
  return function t(key: Key, params?: Record<string, string | number>): string {
    // `cs.ts` can omit a key on purpose (see `band.line`) to fall through to
    // the English string below, so the lookup has to allow a miss.
    const dict: Partial<Record<Key, string>> = languages[lang];
    const template = dict[key] ?? en[key] ?? key;
    if (!params) return template;
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template as string,
    );
  };
}

/** Prefix an already-current-language-relative path with `/cs` when needed —
 * for a link that should stay in whatever language the visitor is on
 * (e.g. Shows' "All shows" link, `/event.ics`). */
export function withLang(path: string, lang: Lang): string {
  return lang === 'cs' ? `/cs${path}` : path;
}

/** Swap the `/cs` prefix on or off a pathname — for the language toggle and
 * for `hreflang` alternates, where the target is "this same page, the other
 * language" rather than a fixed path. */
export function alternatePath(pathname: string, lang: Lang): string {
  const stripped = pathname.startsWith('/cs') ? pathname.slice(3) || '/' : pathname;
  return withLang(stripped, lang);
}

/** The one country-name swap needed in the Czech build — see `events[].address`
 * in `../site.ts`, which also feeds `/event.ics`. A single event doesn't
 * justify splitting the address into locale-neutral parts + a per-locale
 * country field, so this is a targeted replace instead. */
export function localizeCountry(text: string, lang: Lang): string {
  return lang === 'cs' ? text.replace('Czechia', 'Česko') : text;
}
