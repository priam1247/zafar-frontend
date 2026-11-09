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
      papers:    { title: "Past Papers", crumb: "Library", itemLabel: "paper",
                   desc: "MSCE and JCE papers, mocks and more.",
                   searchPlaceholder: "Search past papers by subject or year…" },
      books:     { title: "Books", crumb: "Library", itemLabel: "book",
                   desc: "Textbooks for senior and junior secondary.",
                   searchPlaceholder: "Search textbooks by title or form…" },
      notes:     { title: "Notes", crumb: "Library", itemLabel: "note",
                   desc: "Condensed notes — counted against your papers.",
                   searchPlaceholder: "Search notes by subject…" },
      keys:      { title: "Marking Keys", crumb: "Library", itemLabel: "marking key",
                   desc: "Official schemes — counted against your papers.",
                   searchPlaceholder: "Search marking keys by subject or year…" },
      favorites: { title: "Favorites", crumb: "Yours", itemLabel: "favorite",
                   desc: "Everything you've saved, in one list.",
                   searchPlaceholder: "Search your favorites…" },
      help:      { title: "Help & FAQ", crumb: "Support",
                   desc: "Limits, downloads and account answers." },
    },
    list: {
      allCategories: "All categories",
      sortNameAsc: "Name A–Z", sortNameDesc: "Name Z–A",
      sortSizeDesc: "Largest first", sortSizeAsc: "Smallest first",
      checkingLimit: "Checking today's limit…",
      downloadsLeft: function (left, cap) { return left + " of " + cap + " left"; },
      // Two independent allowances, so the notice names the one that ran out
      // and says what is still there. Nothing says "tomorrow": the refill is
      // 00:00 UTC, which is 02:00 in Malawi — a student who hits the limit at
      // 01:00 gets it back the same local day.
      // Nothing here claims the allowance is gone for good: an interrupted
      // download's place frees itself after a few minutes, so 02:00 is the
      // daily refill, not the only way back.
      notice: {
        papersTitle: "You're out of paper downloads for now",
        papersWhy: "Notes and marking keys are charged to the same allowance, so those are spent too.",
        booksTitle: "You're out of book downloads for now",
        booksWhy: "Textbooks have their own allowance, separate from papers.",
        spareBooks: function (n) {
          return "You still have " + n + " book download" + (n === 1 ? "" : "s") + " today.";
        },
        sparePapers: function (n) {
          return "You still have " + n + " paper download" + (n === 1 ? "" : "s") +
            " today — notes and marking keys share them.";
        },
        recovery: "An unfinished download holds its place for only a few minutes, so try again shortly — " +
          "the allowance itself refills at 02:00 in Malawi (00:00 UTC). ZAFAR is free for every " +
          "Malawian student, and these limits are what keep it that way.",
      },
      openFavorites: "Open Favorites",
      downloadsLeftLabel: function (left, cap) { return left + " of " + cap + " downloads left today"; },
      sharedBucket: ", shared with notes and marking keys",
      limitReached: "No downloads left",
      limitUnavailable: "Limit unavailable",
      // The check itself failed: say that, rather than report a refusal the
      // server never gave.
      limitCheckFailed: "Couldn't check your allowance — try again in a moment",
      partialResults: "Some sections couldn't load",
      sortLabel: "Sort",
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
      // The list came from the copy the service worker keeps.
      offlineResults: function (n) {
        return n + (n === 1 ? " result" : " results") + " · offline";
      },
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
      heroBody: "ZAFAR is free for every Malawian student, and the daily limits are what keep it that " +
        "way. Short answers to the questions students ask most — still stuck, message the admin on " +
        "WhatsApp and include the email on your account.",
      backToPapers: "Back to papers",
      paperLimitLabel: "Papers, notes & keys", paperLimitFoot: "one shared allowance",
      bookLimitLabel: "Books", bookLimitFoot: "their own allowance",
      limitResetsLabel: "Limit resets", limitResetsFoot: "Malawi time (00:00 UTC)",
      faqTitle: "Frequently asked",
      shortcutsTitle: "Keyboard shortcuts",
      shortcutSlash: "Focus the search box on any list page",
      answers: function (n) { return n + " answer" + (n === 1 ? "" : "s"); },
      searchPlaceholder: "Search questions…",
      noMatchesTitle: "No matching questions",
      noMatchesBody: "Try a different word, or scroll to see every question.",
      contactTitle: "Still stuck?",
      contactBody: "Message the admin on WhatsApp and include the email on your account.",
      contactCta: "Open WhatsApp",
      qa: [
        { id: "limits", q: "Why is there a daily download limit?",
          a: "<p>ZAFAR is free for every Malawian student. To keep it free, and fair, every account " +
             "gets the same number of downloads each day: 10 papers and 3 books. Notes and marking keys " +
             "use the same 10 as your papers, so one allowance covers all three.</p>" +
             "<p>If you reach the limit, tap the heart on what you need to save it to Favorites and come " +
             "back later. The allowance refills at <b>02:00 in Malawi</b> (00:00 UTC), and the chip in the " +
             "header always shows what is left — of the papers, or of the books, whichever page you are on.</p>" },
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
          a: "<p>Partly, and deliberately. ZAFAR keeps its own pages on your phone, so the app opens with no " +
             "signal, and the last list you loaded on each page is still there — marked <b>offline</b> so you " +
             "know it is a copy. Favourites work either way, because they live on your device.</p>" +
             "<p>Downloading needs a connection, since the file comes from the server. Add the app to your home " +
             "screen and it opens like any other app, offline shell and all.</p>" },
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
