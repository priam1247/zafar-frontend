/* ============================================================
   Zafar — UI strings
   The app is English-only. This module is a plain string table
   looked up by dot path, e.g. ZafarI18n.t("nav.pastPapers").
   A function value is called with any extra args: t("list.results", 3).
   (The Chichewa table and the EN/CH toggle were removed.)
   ============================================================ */

var ZafarI18n = (function () {
  var T = {
    nav: {
      library: "Library", pastPapers: "Past Papers",
      books: "Books", notes: "Notes", markingKeys: "Marking Keys",
      yours: "Yours", favorites: "Favorites", support: "Support", help: "Help & FAQ",
      studyLibrary: "Study library", logOut: "Log out",
    },
    pages: {
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
      saved: "Saved",
      preparing: "Preparing…",
      download: "Download",
      document: "Document",
      pdfDocument: "PDF document",
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
      answers: function (n) { return n + " answer" + (n === 1 ? "" : "s"); },
      searchPlaceholder: "Search questions…",
      noMatchesTitle: "No matching questions",
      noMatchesBody: "Try a different word, or scroll to see every question.",
      contactTitle: "Still stuck?",
      contactBody: "Message the admin on WhatsApp and include the email on your account.",
      contactCta: "Open WhatsApp",
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
  };

  function t(path) {
    var args = Array.prototype.slice.call(arguments, 1);
    var node = T;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (node == null) break;
      node = node[parts[i]];
    }
    if (typeof node === "function") return node.apply(null, args);
    return node == null ? path : node;
  }

  return { t: t };
})();
