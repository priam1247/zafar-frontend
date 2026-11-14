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
      pastPapers: "Past Papers",
      books: "Books", notes: "Notes", markingKeys: "Marking Keys",
      settings: "Settings", admin: "Admin portal",
      help: "Help & FAQ",
    },

    settings: {
      subtitle: "Your account",
      account: "Account",
      name: "Name",
      email: "Signed in as",
      emailUnknown: "Not known on this phone",
      accountNote: "Your name and address come from how you signed in. To use a different account, log out and sign in again.",
      data: "Kept on this phone",
      history: "Download history",
      dataNote: "StudyMW keeps no library pages offline. The only thing stored here is the list of files you have downloaded on this phone, which is what puts \u201cDownloaded\u201d on a card you already have.",
      clearHistory: "Clear history",
      cleared: "History cleared",
      password: "Password",
      passwordNote: "Send yourself a reset link from the sign-in page. It arrives by email and works for fifteen minutes.",
      resetPassword: "Reset my password",
      about: "About StudyMW",
      aboutNote: "MSCE and JCE past papers, marking keys, textbooks and notes for Malawi secondary school learners.",
    },

    /* ---------- The frame around every page ---------- */
    shell: {
      greeting: function (name) { return "Hi, " + name; },
      greetingNobody: "Hi there",
      student: "Student",
      noEmail: "Signed in",
      menu: "Menu",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      sections: "Sections",
      logOut: "Log out",
      logOutTitle: "Log out?",
      logOutBody: "You will need your password, and the code from your authenticator if you have one, to sign back in.",
      cancel: "Cancel",
      gotIt: "Got it",
      // The allowance pill and the sheet behind it. The numbers and the noun
      // are filled in per section by the list page, from /auth/quota.
      quotaTitle: "Your daily allowance",
      quotaReset: "Every allowance starts again at 02:00 in Malawi (00:00 UTC).",
      quotaBody: function (left, cap, noun) {
        if (left === 0) {
          return "You get " + cap + " " + noun + " a day, and today's are used up.";
        }
        return "You get " + cap + " " + noun + " a day. Today you have " + left + " left. " +
          "A download uses one, and an interrupted one gives it back within a few minutes.";
      },
    },
    pages: {
      papers:    { title: "Past Papers", itemLabel: "paper",
                   // One section, two shelves. Both spend the papers allowance.
                   levels: [
                     { key: "papers", label: "Secondary" },
                     { key: "primary", label: "Primary" },
                   ],
                   // The library is MSCE and JCE. Said once, on the shelf a
                   // university student would look in first, and dismissible:
                   // after the first read it is a line in the way.
                   note: "We do not have university papers yet \u2014 the library covers MSCE and JCE." },
      books:     { title: "Books", itemLabel: "book" },
      notes:     { title: "Notes", itemLabel: "note" },
      keys:      { title: "Marking Keys", itemLabel: "marking key" },
      settings:  { title: "Settings" },
      help:      { title: "Help & FAQ" },
    },
    list: {
      all: "All",
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
      // The pill in the bar and the sentence it shortens. "3 books left
      // today" answers what, how many and when — "3 of 3 left" answers none of
      // those. The noun comes from the section's own table.
      leftToday: function (count, section) {
        var name = count === 1 ? T.list.unitOne[section] : T.list.unit[section];
        return count + " " + (name || "downloads") + " left today";
      },
      noneLeft: function (section) {
        var name = T.list.unit[section];
        return "0" + " " + (name || "downloads") + " left · resets at midnight";
      },
      // Singular and plural of one downloaded thing, per section.
      unit: {
        papers: "papers",
        books: "books",
        notes: "notes",
        "marking-keys": "marking keys",
      },
      unitOne: {
        papers: "paper",
        books: "book",
        notes: "note",
        "marking-keys": "marking key",
      },
      searchPlaceholder: "Search…",
      searchPlaceholderAria: "Search the library",
      downloading: "Downloading…",
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
      // The button's label once the allowance is spent. Short enough for a
      // 104px button, plain enough to be understood without the pill.
      limitReached: "Limit reached",
      limitUnavailable: "Limit unavailable",
      // The check itself failed: say that, rather than report a refusal the
      // server never gave.
      limitCheckFailed: "Couldn't check your downloads — try again in a moment",
      partialResults: "Some sections couldn't load",
      partialTitle: "Some sections didn't load",
      partialBody: "Part of the library couldn't be reached, so this list may be missing " +
        "documents. Try again in a moment.",
      clearAll: "Clear all",
      clearSearch: "Clear search",
      couldntLoad: function (item) { return "Couldn't load " + item + "s"; },
      loadError: "Something went wrong reaching the library.",
      tryAgain: "Try again",
      offlineTitle: "You're offline",
      offlineBody: "Check your connection and try again.",
      noMatchesTitle: "No matches",
      noMatchesBody: "Nothing matches these filters — try clearing the search or category.",
      emptySectionTitle: "Nothing here yet",
      emptySectionBody: function (item) { return "No " + item + "s have been published to this section."; },
      results: function (n) { return n + " result" + (Number(n) === 1 ? "" : "s"); },
      // Until the server sends the size of the whole answer, the page can only
      // say how many it has: "50+" is a floor, "50 results" would be a lie.
      resultsAtLeast: function (n) { return n + "+ result" + (Number(n) === 1 ? "" : "s"); },
      loading: "Loading…",
      // Shown when the catalogue is being retried: a first visit can start a
      // full scan of the library on the server, and silence for that long
      // reads as a broken page.
      loadingSlow: "Still loading — the first visit takes a moment.",
      offline: "Offline",
      noInternet: "No internet connection",
      backOnline: "Back online",
      downloadStarted: "Download started",
      // The bytes did not arrive.
      downloadFailed: "Could not download the file — try again",
      // The ticket did not arrive, so the file was never even asked for. The
      // difference matters: a saved file must never be called a failure, and a
      // download that never started must never be called saved.
      downloadNotStarted: "Could not start the download — try again",
      saved: "Saved",
      preparing: "Preparing…",
      download: "Download",
      // On a card whose file is already on this phone. The list that used to
      // show them is gone; the fact that one is yours is still worth saying.
      downloaded: "Downloaded \u2713",
      dismiss: "Dismiss",
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
        "(00:00 UTC). The pill at the top of each page shows how many are left there today.",
      // The table could not be filled. It says so instead of quoting numbers.
      limitsNoteUnavailable: "We could not read your limits just now. Each section has its own " +
        "limit \u2014 open one and its pill shows what the server says is left. Every limit starts " +
        "again at 02:00 in Malawi (00:00 UTC).",
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
             "<p>When one section is finished, the pill at the top of that page says how many are " +
             "left, and tapping it explains when they come back. The other sections still have their " +
             "own downloads. Every limit starts again at <b>02:00 in Malawi</b> (00:00 UTC).</p>" },
        { id: "download", q: "A download didn't start — what now?",
          a: "<p>Downloads are prepared on demand: the app asks the server for a short-lived signed link, then " +
             "fetches the file and hands it to your browser. If that link expires before the file finishes, just " +
             "press <b>Download</b> again — an unfinished download doesn't count against your daily limit.</p>" },
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
       One form: asking for a file that is not here yet, POST /requests, from
       the Help page. */
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

      // What can go wrong sending it. The API's own sentence never goes on
      // screen: it is written for whoever reads the logs.
      errFill: "Fill in what is asked for first.",
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
