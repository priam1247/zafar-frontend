/* ============================================================
   StudyMW — UI strings
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
favorites: "Favorites", support: "Support", help: "Help & FAQ",
      studyLibrary: "Study library", logOut: "Log out",
    },
    pages: {
      papers:    { title: "Past Papers", crumb: "Library", itemLabel: "paper",
                   // One section, two shelves. Both spend the papers allowance.
                   levels: [
                     { key: "papers", label: "Secondary" },
                     { key: "primary", label: "Primary" },
                   ],
                   searchPlaceholder: "Search past papers by subject or year…" },
      books:     { title: "Books", crumb: "Library", itemLabel: "book",
                   searchPlaceholder: "Search textbooks by title or form…" },
      notes:     { title: "Notes", crumb: "Library", itemLabel: "note",
                   searchPlaceholder: "Search notes by subject…" },
      keys:      { title: "Marking Keys", crumb: "Library", itemLabel: "marking key",
                   searchPlaceholder: "Search marking keys by subject or year…" },
      favorites: { title: "Favorites", crumb: "Yours", itemLabel: "favorite",
                   searchPlaceholder: "Search your favorites…" },
      help:      { title: "Help & FAQ", crumb: "Support" },
    },
    list: {
      allCategories: "All categories",
      chooseLevel: "Choose a level",
      loadMore: "Load more",
      loadingMore: "Loading…",
      loadMoreFailed: "Couldn't load more just now. Try again.",
      oneAtATime: "One file at a time. The first one is still coming.",
      // The server sends Retry-After; the page says the wait in everyday words.
      tooManyRequests: function (wait) {
        return wait
          ? "Too many requests just now. Try again in " + wait + "."
          : "Too many requests just now. Try again in a moment.";
      },
      sortNameAsc: "Name A–Z", sortNameDesc: "Name Z–A",
      sortSizeDesc: "Largest first", sortSizeAsc: "Smallest first",
      downloadsLeft: function (left, cap) { return left + " of " + cap + " left"; },
      // Four independent allowances — papers, books, notes, marking keys — so
      // the notice names the one that ran out and says what is still there in
      // the others. Nothing says "tomorrow": the refill is 00:00 UTC, which is
      // 02:00 in Malawi, so a student who hits the limit at 01:00 gets it back
      // the same local day. Nothing claims an allowance is gone for good
      // either: an interrupted download's place frees itself after a few
      // minutes, so 02:00 is the daily refill, not the only way back.
      notice: {
        // The hero notice. Plain words and short sentences on purpose: it is
        // read on a phone, in a second language, at the moment nothing can be
        // downloaded.
        title: function (section) {
          var one = T.list.sectionOne[section];
          return one ? "No " + one + " downloads left" : "No downloads left";
        },
        why: function (section) {
          var name = T.list.sectionName[section] || "This section";
          return name.charAt(0).toUpperCase() + name.slice(1) + " have their own daily limit.";
        },
        spare: function (list) { return "You can still download " + list + "."; },
        spareNone: "Nothing else is left today.",
        recovery: function (section) {
          return "Your " + (T.list.sectionName[section] || "downloads") +
            " come back at 02:00 in Malawi (00:00 UTC). " +
            "If a download failed, try again in a few minutes.";
        },
      },
      // "papers" / "books" / "notes" / "marking keys" for counts, and the
      // singular of each, so a list can read "1 book and 3 notes".
      sectionName: {
        papers: "papers",
        books: "books",
        notes: "notes",
        "marking-keys": "marking keys",
      },
      sectionOne: {
        papers: "paper",
        books: "book",
        notes: "note",
        "marking-keys": "marking key",
      },
      openFavorites: "Open Favorites",
      // The chip is narrow: name the section, but in three or four words.
      limitReached: function (section) {
        var name = T.list.sectionName[section];
        return name ? "No " + name + " left" : "No downloads left";
      },
      downloadsLeftLabel: function (left, section) {
        var name = left === 1 ? T.list.sectionOne[section] : T.list.sectionName[section];
        return "You can download " + left + " more " + (name || "files") + " today.";
      },
      limitUnavailable: "Limit unavailable",
      // The check itself failed: say that, rather than report a refusal the
      // server never gave.
      limitCheckFailed: "Couldn't check your downloads — try again in a moment",
      partialResults: "Some sections couldn't load",
      partialTitle: "Some sections didn't load",
      partialBody: "Part of the library couldn't be reached, so this list may be missing " +
        "documents — including saved ones. Try again in a moment.",
      sortLabel: "Sort",
      clearAll: "Clear all",
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
      results: function (n) { return n + " result" + (Number(n) === 1 ? "" : "s"); },
      savedCount: function (n) { return n + " saved"; },
      // Until the server sends the size of the whole answer, the page can only
      // say how many it has: "50+" is a floor, "50 results" would be a lie.
      resultsAtLeast: function (n) { return n + "+ result" + (Number(n) === 1 ? "" : "s"); },
      savedAtLeast: function (n) { return n + "+ saved"; },
      loading: "Loading…",
      // Shown when the catalogue is being retried: a first visit can start a
      // full scan of the library on the server, and silence for that long
      // reads as a broken page.
      loadingSlow: "Still loading — the first visit takes a moment.",
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
      heroBody: "StudyMW is free for every Malawian student, and the daily limits are what keep it that " +
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
      limitsNote: "Each section has its own limit. Every limit starts again at 02:00 in Malawi " +
        "(00:00 UTC). The number at the top of a page shows what is left there.",
      limitsNoteDefaults: "We could not read your own limits just now, so these are the usual ones. " +
        "Yours may be different. Each section has its own limit, and every limit starts again at " +
        "02:00 in Malawi (00:00 UTC).",
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
          a: "<p>StudyMW is free for every Malawian student. To keep it free, every account gets a " +
             "few downloads each day, counted <b>separately for each section</b> — the " +
             "<b>Daily downloads</b> table above shows the numbers. Downloading a paper never uses " +
             "up a book, and a note never uses up a paper.</p>" +
             "<p>If one section is finished, tap the heart to save what you need in Favorites, then " +
             "come back later. The other sections still have their own downloads. Every limit starts " +
             "again at <b>02:00 in Malawi</b> (00:00 UTC).</p>" },
        { id: "download", q: "A download didn't start — what now?",
          a: "<p>Downloads are prepared on demand: the app asks the server for a short-lived signed link, then " +
             "fetches the file and hands it to your browser. If that link expires before the file finishes, just " +
             "press <b>Download</b> again — an unfinished download doesn't count against your daily limit.</p>" },
        { id: "favorites", q: "Where are my favorites stored?",
          a: "<p>Favorites are saved against your account name in this browser, so two people sharing a device " +
             "never see each other's list. Clearing your browser storage clears them.</p>" },
        { id: "password", q: "I forgot my password.",
          a: "<p>Self-service reset is coming — the sign-in screen already has the flow, but the server side " +
             "isn't live yet. In the meantime, message the StudyMW admin from the email address on your account " +
             "and a new password will be set for you.</p>" },
        { id: "missing", q: "A paper or subject is missing.",
          a: "<p>The library mirrors what's been published to the StudyMW Drive folders. If a subject or year isn't " +
             "there yet, it hasn't been uploaded — <a href=\"#request\">send the request through</a> and it " +
             "usually appears within a few days.</p>" },
      ],
    },

    /* ---------- What a student can send us ----------
       Two different things, deliberately two forms: asking for a file that is
       not here yet, and telling us one that is here does not work. The second
       one starts from the file's own card, because a report has to carry the
       id of a real file — a typed-in name could be anything. */
    support: {
      requestTitle: "Request a paper, book or notes",
      requestBody:
        "If what you need is not in the library, ask for it here. An editor reads these, and the file " +
        "usually appears within a few days.",
      requestSection: "Where it belongs",
      // The library's own folder keys. A request that names a folder an editor
      // can open is one they can act on; a free-typed one is a guess.
      sections: {
        papers: "Past Papers",
        primary: "Primary",
        books: "Books",
        notes: "Notes",
        "marking-keys": "Marking Keys",
      },
      requestWhat: "What you need",
      requestWhatPh: "e.g. MSCE Geography Paper 1 2019",
      requestNote: "Anything else",
      requestOptional: "(optional)",
      requestNotePh: "e.g. the year, or the school it came from",
      requestSend: "Send request",
      requestSending: "Sending\u2026",
      requestDoneTitle: "Request sent",
      requestDone: "An editor will see it in the queue. You do not have to do anything else.",
      requestAgain: "Send another request",

      reportOpen: "Report a problem with this file",
      reportTitle: "Report a problem",
      reportBody: "Tell us what is wrong and an editor will check this file.",
      reportReason: "What is wrong?",
      // The last one cannot stand on its own: an editor needs the note when the
      // reason is "something else", so the form asks for it before sending.
      reportOther: "Something else",
      reportReasons: [
        "The download does not work",
        "The file will not open",
        "This is the wrong file",
        "Pages are missing or blank",
        "Something else",
      ],
      reportNote: "More detail",
      reportNotePh: "e.g. page 4 is blank, or the link stops halfway",
      reportSend: "Send report",
      reportSending: "Sending\u2026",
      reportDoneTitle: "Report sent",
      reportDone: "Thank you \u2014 an editor will check this file.",
      reportClose: "Close",
      reportCancel: "Cancel",

      // What can go wrong sending either of the two. The API's own sentence
      // never goes on screen: it is written for whoever reads the logs.
      errFill: "Fill in what is asked for first.",
      errReportDetail: "Say what is wrong in the detail box, then send.",
      errTooMany: function (wait) {
        return wait
          ? "That is a lot of requests just now. Try again in " + wait + "."
          : "That is a lot of requests just now. Try again in a minute.";
      },
      errOffline: "You are offline. Connect to the internet and try again.",
      errUnverified: "Verify your email address first \u2014 the code was sent when you registered.",
      errSuspended: "This account is suspended, so it cannot send anything.",
      errForbidden: "This account cannot send that at the moment.",
      errRefused: "The library would not accept that. Check what you wrote and try again.",
      errServer: "That did not reach the library. Try again in a moment.",
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
