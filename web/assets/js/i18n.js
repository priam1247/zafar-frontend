/* ============================================================
   Zafar — i18n for the signed-in app
   auth.js already built an EN/Chichewa table + a `zafar_lang` localStorage
   key for the sign-in screen. This module reuses that same key so a
   language choice made anywhere in the app persists everywhere in it.
   Strings are looked up with a dot path, e.g. ZafarI18n.t("nav.dashboard").
   A function value is called with any extra args: t("list.results", 3).
   ============================================================ */

var ZafarI18n = (function () {
  var LANG_KEY = "zafar_lang";

  var T = {
    en: {
      langCode: "EN",
      nav: {
        overview: "Overview", dashboard: "Dashboard", pastPapers: "Past Papers",
        books: "Books", notes: "Notes", markingKeys: "Marking Keys",
        yours: "Yours", favorites: "Favorites", support: "Support", help: "Help & FAQ",
        studyLibrary: "Study library", darkMode: "Dark mode", logOut: "Log out",
      },
      pages: {
        home:      { title: "Dashboard", crumb: "Overview" },
        papers:    { title: "Past Papers", crumb: "Library", itemLabel: "paper", searchPlaceholder: "Search past papers by subject or year…" },
        books:     { title: "Books", crumb: "Library", itemLabel: "book", searchPlaceholder: "Search textbooks by title or form…" },
        notes:     { title: "Notes", crumb: "Library", itemLabel: "note", searchPlaceholder: "Search notes by subject…" },
        keys:      { title: "Marking Keys", crumb: "Library", itemLabel: "marking key", searchPlaceholder: "Search marking keys by subject or year…" },
        favorites: { title: "Favorites", crumb: "Yours", itemLabel: "favorite", searchPlaceholder: "Search your favorites…" },
        help:      { title: "Help & FAQ", crumb: "Support" },
      },
      list: {
        allCategories: "All categories",
        sortNameAsc: "Name A–Z", sortNameDesc: "Name Z–A",
        sortSizeDesc: "Largest first", sortSizeAsc: "Smallest first",
        checkingLimit: "Checking today's limit…",
        downloadsLeft: function (left, cap) { return left + " of " + cap + " downloads left today"; },
        limitReached: "Daily download limit reached",
        limitUnavailable: "Download limit unavailable",
        demoData: "Demo data",
        clearAll: "Clear all",
        clearCategory: "Clear category filter",
        clearSearch: "Clear search",
        couldntLoad: function (item) { return "Couldn't load " + item + "s"; },
        loadError: "Something went wrong reaching the library.",
        tryAgain: "Try again",
        offlineTitle: "You're offline",
        offlineBody: "Check your connection and try again — saved favorites still work.",
        noMatchesTitle: "No matches",
        noMatchesBody: "Nothing matches these filters — try clearing the search or category.",
        emptySectionTitle: "Nothing here yet",
        emptySectionBody: function (item) { return "No " + item + "s have been published to this section."; },
        noFavoritesTitle: "No favorites yet",
        noFavoritesBody: "Tap the heart on any document to keep it here for quick access.",
        results: function (n) { return n + " result" + (n === 1 ? "" : "s"); },
        savedCount: function (n) { return n + " saved"; },
        loading: "Loading…",
        offline: "Offline",
        savedToFavorites: "Saved to favorites",
        removedFromFavorites: "Removed from favorites",
        noInternet: "No internet connection",
        backOnline: "Back online",
        downloadStarted: "Download started",
        downloadFailed: "Could not download the file — try again",
        downloadStartFailed: "Could not start download",
        demoNoFile: "Demo mode — no file to download",
        preparing: "Preparing…",
        download: "Download",
        document: "Document",
        pdfDocument: "PDF document",
      },
      home: {
        morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening",
        heroLede: "Every MANEB past paper, textbook, note and marking key in one place. Pick up where you left off, or jump straight into a subject.",
        browsePapers: "Browse past papers",
        yourFavorites: "Your favorites",
        commandPlaceholder: "Search papers, books, notes…",
        papersLeft: "Paper downloads left", booksLeft: "Book downloads left",
        downloadedToday: "Downloaded today", savedFavorites: "Saved favorites",
        resetsMidnight: "Resets at midnight",
        onThisDevice: "On this device", acrossSections: "Across all sections",
        perDay: function (cap) { return "of " + cap + " per day"; },
        limitReachedFoot: "Limit reached — resets at midnight",
        shelvesTitle: "Jump back in",
        shelvesSubtitle: "Shortcuts to the sections students open most.",
        shortcuts: [
          { icon: "file",  title: "MSCE past papers", text: "MANEB senior papers by subject and year", href: "dashboard.html?category=MSCE%20Maneb", section: "papers", category: "MSCE Maneb" },
          { icon: "file",  title: "JCE past papers",  text: "Junior certificate papers and mocks",      href: "dashboard.html?category=JCE%20Maneb", section: "papers", category: "JCE Maneb" },
          { icon: "book",  title: "Textbooks",        text: "Senior and junior secondary textbooks",    href: "books.html", section: "books", category: null },
          { icon: "notes", title: "Summary notes",    text: "Condensed revision notes per subject",     href: "notes.html", section: "notes", category: null },
          { icon: "check", title: "Marking keys",     text: "Check your answers against the scheme",    href: "marking-keys.html", section: "marking-keys", category: null },
          { icon: "heart", title: "Your favorites",   text: "Everything you saved for later",           href: "favorites.html", section: null, category: null },
        ],
        recentTitle: "Recent downloads",
        recentSubtitle: "Kept on this device so you can find a file again fast.",
        activityTitle: "Recent activity",
        documentFallback: "Document",
        noDownloadsTitle: "No downloads yet",
        noDownloadsBody: "Files you download will show up here for quick re-access.",
        findPaper: "Find a past paper",
        overview: "Overview",
      },
      help: {
        heroTitle: "How can we help?",
        heroBody: "Short answers to the questions students ask most. Still stuck? Reach the admin on WhatsApp and include the email on your account.",
        backToPapers: "Back to papers",
        dailyLimitLabel: "Daily limit", dailyLimitFoot: "papers and books, each per day",
        limitResetsLabel: "Limit resets", limitResetsFoot: "every night, automatically",
        sectionsLabel: "Sections", sectionsFoot: "papers, books, notes, marking keys",
        faqTitle: "Frequently asked",
        shortcutsTitle: "Keyboard shortcuts",
        shortcutSlash: "Focus the search box on any list page",
        shortcutEsc: "Close the navigation drawer on mobile",
        answers: function (n) { return n + " answers"; },
        qa: [
          { id: "limits", q: "Why is there a daily download limit?",
            a: "<p>Every account gets 10 paper downloads and 10 book downloads per day. The cap keeps one " +
               "heavy user from slowing the library down for everyone else, and it resets automatically at midnight.</p>" +
               "<p>Notes and marking keys draw from the same paper allowance server-side, so keep an eye on the " +
               "badge at the top of each section.</p>" },
          { id: "download", q: "A download didn't start — what now?",
            a: "<p>Downloads are prepared on demand: the app asks the server for a short-lived signed link, then " +
               "fetches the file and hands it to your browser. If that link expires before the file finishes, just " +
               "press <b>Download</b> again — an unfinished download doesn't count against your daily limit.</p>" },
          { id: "favorites", q: "Where are my favorites stored?",
            a: "<p>Favorites are saved against your account name in this browser, so two people sharing a device " +
               "never see each other's list. Clearing your browser storage clears them.</p>" },
          { id: "password", q: "I forgot my password.",
            a: "<p>Self-service reset is coming — the sign-in screen already has the flow, but the server side " +
               "isn't live yet. In the meantime, message the ZAFAR admin from the email address on your account " +
               "and a new password will be set for you.</p>" },
          { id: "missing", q: "A paper or subject is missing.",
            a: "<p>The library mirrors what's been published to the Zafar Drive folders. If a subject or year isn't " +
               "there yet, it hasn't been uploaded — send the request through and it usually appears within a few days.</p>" },
          { id: "offline", q: "Can I use Zafar offline?",
            a: "<p>Browsing needs a connection, because the catalogue lives on the server. Files you've already " +
               "downloaded stay on your device and open without internet.</p>" },
        ],
      },
    },

    ny: {
      langCode: "CH",
      nav: {
        overview: "Chidziwitso", dashboard: "Chiyambi", pastPapers: "Mapepala Akale",
        books: "Mabuku", notes: "Zolemba", markingKeys: "Mayankho",
        yours: "Zanu", favorites: "Zosungidwa", support: "Thandizo", help: "Thandizo & Mafunso",
        studyLibrary: "Laibulale yophunzirira", darkMode: "Njira yamdima", logOut: "Tulukani",
      },
      pages: {
        home:      { title: "Chiyambi", crumb: "Chidziwitso" },
        papers:    { title: "Mapepala Akale", crumb: "Laibulale", itemLabel: "pepala", searchPlaceholder: "Sakani mapepala akale ndi phunziro kapena chaka…" },
        books:     { title: "Mabuku", crumb: "Laibulale", itemLabel: "buku", searchPlaceholder: "Sakani mabuku ndi mutu kapena gawo…" },
        notes:     { title: "Zolemba", crumb: "Laibulale", itemLabel: "cholemba", searchPlaceholder: "Sakani zolemba ndi phunziro…" },
        keys:      { title: "Mayankho", crumb: "Laibulale", itemLabel: "yankho", searchPlaceholder: "Sakani mayankho ndi phunziro kapena chaka…" },
        favorites: { title: "Zosungidwa", crumb: "Zanu", itemLabel: "chosungidwa", searchPlaceholder: "Sakani zosungidwa zanu…" },
        help:      { title: "Thandizo & Mafunso", crumb: "Thandizo" },
      },
      list: {
        allCategories: "Magawo onse",
        sortNameAsc: "Dzina A–Z", sortNameDesc: "Dzina Z–A",
        sortSizeDesc: "Zazikulu poyamba", sortSizeAsc: "Zazing'ono poyamba",
        checkingLimit: "Tikuyang'ana malire a lero…",
        downloadsLeft: function (left, cap) { return left + " pa " + cap + " zotsala lero"; },
        limitReached: "Mwafika pa malire a lero",
        limitUnavailable: "Malire a kutsitsa sikupezeka",
        demoData: "Zachitsanzo",
        clearAll: "Chotsani zonse",
        clearCategory: "Chotsani gawo losefera",
        clearSearch: "Chotsani kufufuza",
        couldntLoad: function (item) { return "Sizinathe kutsegula " + item; },
        loadError: "Chinachake chalakwika polumikizana ndi laibulale.",
        tryAgain: "Yesaninso",
        offlineTitle: "Simuli pa intaneti",
        offlineBody: "Onani kulumikizana kwanu ndikuyesanso — zosungidwa zimagwirabe ntchito.",
        noMatchesTitle: "Palibe zogwirizana",
        noMatchesBody: "Palibe chogwirizana ndi zosefera izi — yesani kuchotsa kufufuza kapena gawo.",
        emptySectionTitle: "Palibe pano panobe",
        emptySectionBody: function (item) { return "Palibe " + item + " zomwe zasindikizidwa pa gawo ili."; },
        noFavoritesTitle: "Palibe zosungidwa panobe",
        noFavoritesBody: "Dinani mtima pa chikalata chilichonse kuti muchisunge pano.",
        results: function (n) { return n + " zotsatira"; },
        savedCount: function (n) { return n + " zosungidwa"; },
        loading: "Tikutsegula…",
        offline: "Kunja kwa intaneti",
        savedToFavorites: "Zasungidwa",
        removedFromFavorites: "Zachotsedwa",
        noInternet: "Palibe intaneti",
        backOnline: "Mwalumikizananso",
        downloadStarted: "Kutsitsa kwayamba",
        downloadFailed: "Sizinathe kutsitsa fayilo — yesaninso",
        downloadStartFailed: "Sizinathe kuyambitsa kutsitsa",
        demoNoFile: "Njira yachitsanzo — palibe fayilo yotsitsa",
        preparing: "Tikukonzekera…",
        download: "Tsitsani",
        document: "Chikalata",
        pdfDocument: "Chikalata cha PDF",
      },
      home: {
        morning: "Mwadzuka bwanji", afternoon: "Muli bwanji masana", evening: "Muli bwanji madzulo",
        heroLede: "Mapepala akale onse a MANEB, mabuku, zolemba ndi mayankho pamalo amodzi. Pitirizani pamene munasiya, kapena lowani mwachindunji ku phunziro.",
        browsePapers: "Onani mapepala akale",
        yourFavorites: "Zosungidwa zanu",
        commandPlaceholder: "Sakani mapepala, mabuku, zolemba…",
        papersLeft: "Mapepala otsala lero", booksLeft: "Mabuku otsala lero",
        downloadedToday: "Zatsitsidwa lero", savedFavorites: "Zosungidwa",
        resetsMidnight: "Zimayambiranso pakati pa usiku",
        onThisDevice: "Pa chida ichi", acrossSections: "Magawo onse",
        perDay: function (cap) { return "pa " + cap + " tsiku lililonse"; },
        limitReachedFoot: "Mwafika pamalire — zimayambiranso pakati pa usiku",
        shelvesTitle: "Pitirizani pomwe munasiya",
        shelvesSubtitle: "Njira zofulumira kupita kumagawo amene ophunzira amagwiritsa ntchito kwambiri.",
        shortcuts: [
          { icon: "file",  title: "Mapepala a MSCE", text: "Mapepala a MANEB a sekondale ndi phunziro ndi chaka", href: "dashboard.html?category=MSCE%20Maneb", section: "papers", category: "MSCE Maneb" },
          { icon: "file",  title: "Mapepala a JCE",  text: "Mapepala a JCE ndi mayeso oyesera",                    href: "dashboard.html?category=JCE%20Maneb", section: "papers", category: "JCE Maneb" },
          { icon: "book",  title: "Mabuku",          text: "Mabuku a sekondale ndi ophunzira aang'ono",            href: "books.html", section: "books", category: null },
          { icon: "notes", title: "Zolemba",         text: "Zolemba zochepetsedwa za phunziro lililonse",         href: "notes.html", section: "notes", category: null },
          { icon: "check", title: "Mayankho",        text: "Onetsetsani mayankho anu ndi mayankho enieni",        href: "marking-keys.html", section: "marking-keys", category: null },
          { icon: "heart", title: "Zosungidwa zanu", text: "Zonse zomwe munasunga kuti muone pambuyo pake",       href: "favorites.html", section: null, category: null },
        ],
        recentTitle: "Zatsitsidwa posachedwa",
        recentSubtitle: "Zasungidwa pa chida ichi kuti mupeze fayilo mofulumira.",
        activityTitle: "Zochita posachedwa",
        documentFallback: "Chikalata",
        noDownloadsTitle: "Palibe zotsitsidwa panobe",
        noDownloadsBody: "Mafayilo omwe mwatsitsa adzaonekera pano kuti muwapeze mofulumira.",
        findPaper: "Funani pepala lakale",
        overview: "Chidziwitso",
      },
      help: {
        heroTitle: "Tingakuthandizeni bwanji?",
        heroBody: "Mayankho achidule ku mafunso amene ophunzira amafunsa kwambiri. Mukanalibe yankho? Fikirani admin pa WhatsApp ndikuphatikiza imelo ya akaunti yanu.",
        backToPapers: "Bwererani ku mapepala",
        dailyLimitLabel: "Malire a tsiku", dailyLimitFoot: "mapepala ndi mabuku, tsiku lililonse",
        limitResetsLabel: "Malire amayambiranso", limitResetsFoot: "usiku uliwonse, mwakudzichitira",
        sectionsLabel: "Magawo", sectionsFoot: "mapepala, mabuku, zolemba, mayankho",
        faqTitle: "Mafunso wamba",
        shortcutsTitle: "Njira zofulumira za kiyibodi",
        shortcutSlash: "Ikani cholozera pa bokosi lofufuzira pa tsamba lililonse la mndandanda",
        shortcutEsc: "Tsekani menyu pa foni",
        answers: function (n) { return n + " mayankho"; },
        qa: [
          { id: "limits", q: "Chifukwa chiyani pali malire a kutsitsa tsiku lililonse?",
            a: "<p>Akaunti iliyonse imalandira mapepala 10 ndi mabuku 10 kuti atsitse tsiku lililonse. Malire amenewa " +
               "amateteza kuti munthu mmodzi asachedwetse laibulale kwa ena onse, ndipo amayambiranso okha pakati pa usiku.</p>" +
               "<p>Zolemba ndi mayankho zimagwiritsa ntchito malire omwewo a mapepala, choncho onani chizindikiro " +
               "pamwamba pa gawo lililonse.</p>" },
          { id: "download", q: "Kutsitsa sikunayambe — ndichite chiyani?",
            a: "<p>Kutsitsa kumakonzedwa pamene mwafunsa: app imapempha seva ulalo wachidule wotsimikizika, kenaka " +
               "kutsitsa fayilo ndi kuyipereka ku bulawuza yanu. Ulalo ukatha isanamalize, dinani <b>Tsitsani</b> " +
               "nanso — kutsitsa kosamalizidwa sikuwerengedwa pa malire anu a tsiku.</p>" },
          { id: "favorites", q: "Kodi zosungidwa zanga zili kuti?",
            a: "<p>Zosungidwa zimasungidwa pa dzina la akaunti yanu mu bulawuza iyi, choncho anthu awiri ogwiritsa " +
               "ntchito chida chimodzi sadzaona mndandanda wa wina. Kuchotsa zosungidwa za bulawuza kumachotsanso izi.</p>" },
          { id: "password", q: "Ndaiwala mawu achinsinsi anga.",
            a: "<p>Njira yodzisinthira nokha ikubwera — chophimba cholowera chili ndi njira imeneyi, koma seva " +
               "sichinayambe. Pakadali pano, tumizani uthenga kwa admin wa ZAFAR kuchokera ku imelo ya akaunti yanu " +
               "kuti akupatseni mawu achinsinsi atsopano.</p>" },
          { id: "missing", q: "Pepala kapena phunziro likusowa.",
            a: "<p>Laibulale imasonyeza zomwe zasindikizidwa mu Zafar Drive. Ngati phunziro kapena chaka sichinaikidwe " +
               "pano, sichinatumizidwebe — tumizani pempho ndipo nthawi zambiri limaonekera pasanathe masiku angapo.</p>" },
          { id: "offline", q: "Kodi ndingagwiritse ntchito Zafar popanda intaneti?",
            a: "<p>Kufufuza kumafuna kulumikizana, chifukwa mndandanda uli pa seva. Mafayilo omwe mwatsitsa kale " +
               "amakhalabe pa chida chanu ndipo amatsegulika popanda intaneti.</p>" },
        ],
      },
    },
  };

  var lang = "en";
  try {
    var stored = localStorage.getItem(LANG_KEY);
    if (T[stored]) lang = stored;
  } catch (e) {}

  function t(path) {
    var args = Array.prototype.slice.call(arguments, 1);
    var node = T[lang];
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (node == null) break;
      node = node[parts[i]];
    }
    if (typeof node === "function") return node.apply(null, args);
    return node == null ? path : node;
  }

  function getLang() { return lang; }
  function otherLang() { return lang === "ny" ? "en" : "ny"; }
  function setLang(next) {
    lang = T[next] ? next : "en";
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    // The shell, list and home screens build their markup as plain
    // template strings rather than a reactive framework, so a reload is
    // the simplest way to guarantee every piece of chrome on the page
    // (sidebar, topbar, content) re-renders in the new language together.
    location.reload();
  }

  return { t: t, getLang: getLang, otherLang: otherLang, setLang: setLang, LANG_KEY: LANG_KEY };
})();
