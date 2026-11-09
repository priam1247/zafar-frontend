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
                   desc: "Condensed notes, with a daily allowance of their own.",
                   searchPlaceholder: "Search notes by subject…" },
      keys:      { title: "Marking Keys", crumb: "Library", itemLabel: "marking key",
                   desc: "Official marking schemes, with a daily allowance of their own.",
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
      // Four independent allowances — papers, books, notes, marking keys — so
      // the notice names the one that ran out and says what is still there in
      // the others. Nothing says "tomorrow": the refill is 00:00 UTC, which is
      // 02:00 in Malawi, so a student who hits the limit at 01:00 gets it back
      // the same local day. Nothing claims an allowance is gone for good
      // either: an interrupted download's place frees itself after a few
      // minutes, so 02:00 is the daily refill, not the only way back.
      notice: {
        title: {
          papers: "You're out of paper downloads for now",
          books: "You're out of book downloads for now",
          notes: "You're out of note downloads for now",
          "marking-keys": "You're out of marking key downloads for now",
        },
        why: {
          papers: "Papers have their own daily allowance — books, notes and marking keys are counted separately.",
          books: "Books have their own daily allowance, separate from papers, notes and marking keys.",
          notes: "Notes have their own daily allowance, separate from papers, books and marking keys.",
          "marking-keys": "Marking keys have their own daily allowance, separate from papers, books and notes.",
        },
        spare: function (list) { return "Still available today: " + list + "."; },
        spareNone: "Every other allowance is spent for today too.",
        recovery: "An unfinished download holds its place for only a few minutes, so try again shortly — " +
          "the allowance itself refills at 02:00 in Malawi (00:00 UTC). ZAFAR is free for every " +
          "Malawian student, and these limits are what keep it that way.",
      },
      sectionName: {
        papers: "papers",
        books: "books",
        notes: "notes",
        "marking-keys": "marking keys",
      },
      openFavorites: "Open Favorites",
      downloadsLeftLabel: function (left, cap) { return left + " of " + cap + " downloads left today"; },
      limitReached: "No downloads left",
      limitUnavailable: "Limit unavailable",
      // The check itself failed: say that, rather than report a refusal the
      // server never gave.
      limitCheckFailed: "Couldn't check your allowance — try again in a moment",
      partialResults: "Some sections couldn't load",
      partialTitle: "Some sections didn't load",
      partialBody: "Part of the library couldn't be reached, so this list may be missing " +
        "documents — including saved ones. Try again in a moment.",
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
      limitsTitle: "Daily downloads",
      limitRow: {
        papers: "Papers",
        books: "Books",
        notes: "Notes",
        "marking-keys": "Marking keys",
      },
      limitsNote: "Each section counts separately. Every allowance refills at 02:00 in Malawi " +
        "(00:00 UTC), and the chip in the header shows what is left of the page you are on.",
      limitsNoteDefaults: "Your current allowances could not be read just now, so these are the " +
        "published defaults — your account may be set differently. Each section counts separately, " +
        "and every allowance refills at 02:00 in Malawi (00:00 UTC).",
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
          // No figures in here: the table above this answer is filled from the
          // server, so a number repeated in prose would be a second source of
          // truth that goes stale the day an allowance is retuned.
          a: "<p>ZAFAR is free for every Malawian student. To keep it free, and fair, every account gets " +
             "the same number of downloads each day, counted <b>separately for each section</b> — " +
             "the <b>Daily downloads</b> table above lists them. Downloading a " +
             "paper never costs you a book, and a note never costs you a paper.</p>" +
             "<p>If a section runs out, tap the heart on what you need to save it to Favorites and come " +
             "back later — the other sections still have their own allowance. Every allowance refills at " +
             "<b>02:00 in Malawi</b> (00:00 UTC), and the chip in the header shows what is left of the page " +
             "you are on.</p>" },
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
