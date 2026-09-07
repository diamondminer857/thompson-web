/** Czech strings. Genre/scene terms (the strapline, "Haven", the mix-card
 * label) are deliberately left out of this dictionary and stay English on
 * both language versions — see `site.strapline` / `site.headline` in
 * `../site.ts`, which are locale-neutral for that reason. Any key missing
 * here falls back to `./en.ts`. */
export default {
  'nav.shows': 'Termíny',
  'nav.haven': 'Haven',
  'nav.about': 'Bio',
  'nav.press': 'Press',
  'nav.book': 'Booking',
  'nav.section': 'Sekce',
  'nav.backToTop': 'Zpět nahoru',
  'nav.menu': 'Menu',
  'nav.switchLang': 'Switch to English',

  'meta.description': 'Haven — měsíční mixová série. Booking otevřený.',

  'site.base': 'Krnov, ČR',

  'bio.short': 'Trance a Melodic Techno z Krnova, pro sály, které chtějí vzlétnout.',
  'bio.long':
    'Tomáš Holinka nahrává a hraje jako THOMPSON — Trance a Melodic Techno z Krnova. S DJingem začal v červenci 2025, kdy si pořídil Pioneer DDJ-FLX4 po celoživotním poslechu elektronické hudby. Studium v Nizozemsku ho přivedlo k trance a odtud se jeho zvuk začal formovat. Haven, jeho měsíční mixová série, je místo, kde zní naplno, a vlastní produkce se právě rodí. Booking je otevřený pro kluby, festivaly i soukromé akce.',

  // 'band.line' deliberately omitted — falls back to the English string in
  // `./en.ts`. Kept English on the Czech page too, same call as `headline`
  // in `../site.ts`: it's the printed poster line, not generic prose.
  'band.ariaLabel': '{line} — THOMPSON naživo',

  'hero.next': 'Nejblíž:',
  'hero.scrollDown': 'Posunout dolů',

  'marquee.next': 'Příště: {date} • {place}',
  'marquee.bookingsOpen': 'Booking otevřený',
  'marquee.havenMonthly': 'Haven — nový mix každý měsíc',

  'shows.label': 'Termíny',
  'shows.allShows': 'Všechny termíny ({count})',
  'shows.empty': 'Zatím nic domluveného — další termín se tu objeví, jakmile bude potvrzený.',
  'shows.eventDetails': 'Detaily akce',
  'shows.soldOut': 'Vyprodáno',
  'shows.details': 'Detaily',
  'shows.addToCalendar': 'Přidat do kalendáře',

  'showsPage.title': 'Termíny — {name}',
  'showsPage.description': 'Všechny nadcházející akce {name}.',
  'showsPage.backHome': '← Domů',
  'showsPage.backHomeAria': 'Zpět na hlavní stránku',
  'showsPage.allShows': 'Všechny termíny',
  'showsPage.empty': 'Zatím nic domluveného — mrkni sem znovu později.',

  'haven.label': '{name} — mixová série',
  'haven.everyMonth': 'Každý měsíc.',
  'haven.fullSeriesOn': 'Celá série na',
  'haven.and': 'a',
  'haven.mixcloudLabel': 'Mixcloudu',
  'haven.allEpisodes': 'Všechny epizody ({count})',

  'havenPage.title': 'Haven — {name}',
  'havenPage.description': 'Všechny epizody Haven od {name} na jednom místě.',
  'havenPage.backHome': '← Domů',
  'havenPage.backHomeAria': 'Zpět na hlavní stránku',
  'havenPage.allEpisodes': 'Všechny epizody',
  'havenPage.empty': 'Zatím nic nahráno — mrkni sem znovu později.',

  'mixcard.listenOnMixcloud': 'Poslechnout na Mixcloudu',
  'mixcard.playerSuffix': ' přehrávač',
  'mixcard.watchOnYouTube': 'Sledovat na YouTube',

  'about.label': 'Bio',

  'gallery.label': 'Galerie',
  'gallery.open': 'Otevřít {alt}',
  'gallery.rotateLeft': 'Otočit galerii doleva',
  'gallery.rotateRight': 'Otočit galerii doprava',

  'lightbox.galleryImage': 'Obrázek galerie',
  'lightbox.close': 'Zavřít',
  'lightbox.previous': 'Předchozí obrázek',
  'lightbox.next': 'Další obrázek',

  'press.label': 'Press',
  'press.kit': 'Press kit (PDF)',
  'press.logoPack': 'Logo pack',
  'press.photoPack': 'Fotky',
  'press.rider': 'Technický rider',
  'press.onRequest': 'na vyžádání',

  'booking.label': 'Booking',

  'footer.lightMode': 'Světlý režim',

  'placeholder.default': 'placeholder',
  'placeholder.notYetAdded': '{label} — zatím nenahráno',

  'media.portrait': 'THOMPSON, portrét',
  'media.portraitAlt': 'Ruce na mixpultu, uprostřed setu',
  'media.gallery1': 'THOMPSON za pulty',
  'media.gallery2': 'THOMPSON s rukama nad davem',
  'media.gallery3': 'Ruce ve tvaru srdce, festivalová světla',
  'media.gallery4': '„Live Love Thompson“ nad davem',
  'media.gallery5': 'THOMPSON u kontroleru, barevné světlo',
  'media.gallery6': 'THOMPSON u kontroleru, denní set',
  'media.bandStill': 'Sál, uprostřed setu',
  'media.haven001': 'Artwork Haven 001',
  'media.haven002': 'Artwork Haven 002',
  'media.haven003': 'Artwork Haven 003',
  'media.haven004': 'Artwork Haven 004',
} as const;
