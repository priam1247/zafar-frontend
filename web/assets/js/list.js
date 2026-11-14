/* ============================================================
   StudyMW — document list page
   Shared by Books, Past Papers, Notes and Marking Keys.
   Each page script just calls ZafarList.init({...}) with its section and
   (if downloads count against a daily limit) which quota field to read.
   ============================================================ */

var ZafarList = (function () {
  var svg = ZafarShell.svg;

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  var SORTS = {
    "name-asc":  function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); },
    "name-desc": function (a, b) { return b.name.localeCompare(a.name, undefined, { numeric: true }); },
    "size-desc": function (a, b) { return (b.size_bytes || 0) - (a.size_bytes || 0); },
    "size-asc":  function (a, b) { return (a.size_bytes || 0) - (b.size_bytes || 0); },
  };

  function layout(cfg) {
    var t = ZafarI18n.t;
    var activeCat = (new URLSearchParams(location.search).get("category")) || "";
    return (
      // A slim note, once, on the shelf a university student would try first.
      // Dismissing it is remembered on this phone; it never comes back.
      (cfg.note
        ? '<div class="note" data-note hidden>' +
            '<span class="note-text" data-note-text></span>' +
            '<button type="button" class="note-x" data-note-close aria-label="' +
              Zafar.escapeHTML(t("list.dismiss")) + '">&times;</button>' +
          "</div>"
        : "") +

      // The explanation of a spent allowance, in the page, where a student
      // who has scrolled past the pill will still meet it. No other page to
      // send them to: the allowance is this section's, and the pill above
      // already says how much is left.
      (cfg.quotaKey
        ? '<div class="notice" data-notice hidden>' +
            '<span class="notice-glyph">' + svg("alert", 17) + "</span>" +
            '<div class="notice-text">' +
              '<h2 class="notice-title" data-notice-title></h2>' +
              "<p data-notice-body></p>" +
            "</div>" +
          "</div>"
        : "") +

      // A level inside one section, not a sixth tab: the tab bar is for
      // sections, and Primary is a shelf inside Past Papers.
      (cfg.sectionChoices && cfg.sectionChoices.length
        ? '<div class="section-switch" data-switch role="group" aria-label="' +
            Zafar.escapeHTML(t("list.chooseLevel")) + '"></div>'
        : "") +

      // Row A — one search field, full width. There is one layout for the
      // list, so there is nothing to switch between.
      '<label class="search">' + svg("search", 18) +
        '<input type="search" data-search placeholder="' +
        Zafar.escapeHTML(cfg.searchPlaceholder || t("list.searchPlaceholder")) +
        '" aria-label="' + Zafar.escapeHTML(t("list.searchPlaceholderAria")) + '" enterkeyhint="search">' +
      "</label>" +

      // Row B — the categories, in one scrolling line with a fade at the edge.
      (cfg.categories && cfg.categories.length
        ? '<div class="cat-chips" data-cat-chips></div>'
        : "") +

      '<div class="chips" data-chips style="display:none"></div>' +

      // Row C — how many, and in what order. Plain words on the left, the one
      // control on the right.
      '<div class="results-row">' +
        '<span class="count" data-count>' + t("list.loading") + "</span>" +
        '<select class="select" data-sort aria-label="Sort results">' +
          '<option value="name-asc">' + t("list.sortNameAsc") + "</option>" +
          '<option value="name-desc">' + t("list.sortNameDesc") + "</option>" +
          '<option value="size-desc">' + t("list.sortSizeDesc") + "</option>" +
          '<option value="size-asc">' + t("list.sortSizeAsc") + "</option>" +
        "</select>" +
      "</div>" +

      '<div class="skeleton" data-skeleton>' + skeletonHTML(5) + "</div>" +
      '<div class="grid" data-grid style="display:none"></div>' +

      // The end of what is on screen. A page is fetched when the student gets
      // here, not before: the first request has to come back before anyone is
      // told how big the library is.
      '<div class="load-more" data-more hidden>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-more-btn></button>' +
      "</div>" +
      '<div class="load-sentinel" data-sentinel aria-hidden="true"></div>' +

      '<div class="state" data-empty>' + svg("empty", 38) +
        "<h3>" + t("list.emptySectionTitle") + "</h3><p></p></div>" +

      '<div class="state danger" data-error>' + svg("alert", 38) +
        "<h3>" + t("list.couldntLoad", cfg.itemLabel) + "</h3>" +
        "<p>" + t("list.loadError") + "</p>" +
        '<button class="btn btn-ghost btn-sm" data-retry>' + t("list.tryAgain") + "</button></div>" +

      '<div class="state" data-offline>' + svg("offline", 38) +
        "<h3>" + t("list.offlineTitle") + "</h3><p>" + t("list.offlineBody") + "</p></div>"
    );
  }

  // Same shape and height as a real card, so the list does not jump when the
  // answer arrives: tile, two lines of text, one button.
  function skeletonHTML(n) {
    var one =
      '<div class="sk-card"><div class="sk sk-tile"></div>' +
      '<div class="sk-lines"><div class="sk sk-title"></div><div class="sk sk-meta"></div></div>' +
      '<div class="sk sk-btn"></div></div>';
    return new Array(n).fill(one).join("");
  }

  function catChipsHTML(categories, activeCat) {
    var chips = [
      '<button type="button" class="cat-chip' + (activeCat ? "" : " active") + '" data-cat="" aria-pressed="' + (!activeCat) + '">' +
        ZafarI18n.t("list.all") + "</button>",
    ];
    categories.forEach(function (c) {
      chips.push(
        '<button type="button" class="cat-chip' + (activeCat === c ? " active" : "") + '" data-cat="' +
        Zafar.escapeHTML(c) + '" aria-pressed="' + (activeCat === c) + '">' + Zafar.escapeHTML(c) + "</button>"
      );
    });
    return chips.join("");
  }

  // Ids the owner has featured in the admin portal (GET /site-config). They are
  // marked on the card that carries them; a dedicated "featured" shelf would
  // need an API that returns those files directly, and inventing one here would
  // mean inventing file names, so this shows the truth: "this one is featured".
  var featured = [];

  // What is already on this phone, by id. The list of downloads as a page is
  // gone; the one thing worth keeping from it is the badge on the card.
  var downloaded = {};

  function loadDownloaded() {
    downloaded = {};
    Zafar.getRecentDownloads().forEach(function (row) {
      if (row && row.id) downloaded[String(row.id)] = true;
    });
  }

  // pageSection is the shelf the card is on. A download is charged to that
  // shelf's allowance, so the card carries it into the request.
  //
  // Two zones. The top says what the file is: a tile, the title (two lines,
  // wrapping rather than truncating a long name) and a chip only when the
  // library names something worth knowing — Junior, JCE, a subject. A
  // hairline, then the facts and the one action: "15.4 MB · PDF" on the left,
  // Download on the right.
  function cardHTML(doc, pageSection) {
    var t = ZafarI18n.t;
    var section = doc._section || pageSection || "";
    var title = Zafar.escapeHTML(doc.name.replace(/\.pdf$/i, ""));
    var filename = /\.pdf$/i.test(doc.name) ? doc.name : doc.name + ".pdf";
    var category = (doc.category || "").trim();
    var saved = !!downloaded[String(doc.id)];
    var tags = (category ? '<span class="item-cat">' + Zafar.escapeHTML(category) + "</span>" : "") +
      (saved ? '<span class="item-dl">' + t("list.downloaded") + "</span>" : "");
    return (
      '<article class="item" data-id="' + Zafar.escapeHTML(doc.id) + '">' +
        '<div class="item-top">' +
          '<span class="glyph-tile">' + svg("file", 20) + "</span>" +
          '<div class="item-body">' +
            '<h3 class="item-title">' + title +
              (featured.indexOf(doc.id) !== -1 ? '<span class="item-featured">Featured</span>' : "") + "</h3>" +
            (tags ? '<p class="item-tags">' + tags + "</p>" : "") +
          "</div>" +
        "</div>" +
        '<div class="item-foot">' +
          '<span class="item-meta">' + Zafar.escapeHTML(Zafar.formatSize(doc.size_bytes)) + " \u00b7 PDF</span>" +
          '<button class="btn btn-primary" data-download="' + Zafar.escapeHTML(doc.id) +
            '" data-filename="' + Zafar.escapeHTML(filename) +
            (section ? '" data-section="' + Zafar.escapeHTML(section) : "") +
            '" aria-label="' + t("list.download") + " " + Zafar.escapeHTML(filename) + '">' +
            svg("download", 16) + '<span class="btn-label">' + t("list.download") + "</span>" +
            '<span class="btn-progress" aria-hidden="true"></span></button>' +
        "</div>" +
      "</article>"
    );
  }

  // The card a download just landed on says so, without waiting for a repaint.
  function markDownloaded(card, id) {
    downloaded[String(id)] = true;
    if (!card || card.querySelector(".item-dl")) return;
    var body = card.querySelector(".item-body");
    if (!body) return;
    var tags = body.querySelector(".item-tags");
    if (!tags) {
      tags = document.createElement("p");
      tags.className = "item-tags";
      body.appendChild(tags);
    }
    var badge = document.createElement("span");
    badge.className = "item-dl";
    badge.textContent = t("list.downloaded");
    tags.appendChild(badge);
  }

  function init(cfg, shell) {
    var t = ZafarI18n.t;
    var root = shell.content;

    // Fetched beside the catalogue, not before it: the badge is a decoration,
    // and a decoration must never delay the list.
    var config = shell.config || Zafar.siteConfig();
    if (config && typeof config.then === "function") {
      config.then(function (site) {
        if (!site || !Array.isArray(site.featured) || !site.featured.length) return;
        featured = site.featured.map(String);
        // Whatever is already on screen gets its badge without a second
        // request: repaint with the rows we hold.
        if (typeof paint === "function") paint(loadSeq);
      }).catch(function () {});
    }
    root.innerHTML = layout(cfg);

    // What is on screen right now (loading / grid / empty / error / offline),
    // so a signal drop can tell whether there is a list worth keeping.
    var current = "loading";
    var renderedCount = 0;

    loadDownloaded();

    var el = {
      grid: root.querySelector("[data-grid]"),
      skeleton: root.querySelector("[data-skeleton]"),
      empty: root.querySelector("[data-empty]"),
      error: root.querySelector("[data-error]"),
      offline: root.querySelector("[data-offline]"),
      chips: root.querySelector("[data-chips]"),
      catChips: root.querySelector("[data-cat-chips]"),
      notice: root.querySelector("[data-notice]"),
      noticeTitle: root.querySelector("[data-notice-title]"),
      noticeBody: root.querySelector("[data-notice-body]"),
      count: root.querySelector("[data-count]"),
      search: root.querySelector("[data-search]"),
      sort: root.querySelector("[data-sort]"),
      note: root.querySelector("[data-note]"),
      noteText: root.querySelector("[data-note-text]"),
      noteClose: root.querySelector("[data-note-close]"),
      switch: root.querySelector("[data-switch]"),
      more: root.querySelector("[data-more]"),
      moreBtn: root.querySelector("[data-more-btn]"),
      sentinel: root.querySelector("[data-sentinel]"),
      limit: shell.quota || null,
      limitText: shell.quota ? shell.quota.querySelector("[data-quota-text]") : null,
    };

    var params = new URLSearchParams(location.search);

    // The section on screen. Pages that pass `sectionChoices` (Past Papers:
    // Secondary / Primary) can switch it; everything else keeps `cfg.section`.
    // The quota key never moves — Primary spends the papers allowance.
    var choiceKeys = (cfg.sectionChoices || []).map(function (c) { return c.key; });
    var wanted = params.get("section");
    var state = {
      section: choiceKeys.indexOf(wanted) !== -1 ? wanted : cfg.section,
      category: params.get("category") || "",
      q: params.get("q") || "",
      sort: "name-asc",
    };
    if (state.q) el.search.value = state.q;

    /* ---------- The one note on this page ----------
       Shown until it is read and dismissed, then never again on this phone.
       localStorage, not sessionStorage: a note that returns on every visit is
       not dismissible, it is a nag. */
    if (el.note && el.noteClose) {
      var noteKey = "zafar_note_" + cfg.section;
      var seen = false;
      try { seen = localStorage.getItem(noteKey) === "1"; } catch (e) {}
      if (seen) {
        el.note.hidden = true;
      } else {
        el.noteText.textContent = t(cfg.note);
        el.note.hidden = false;
      }
      el.noteClose.addEventListener("click", function () {
        el.note.hidden = true;
        try { localStorage.setItem(noteKey, "1"); } catch (e) {}
      });
    }

    /* ---------- Daily allowances — one per section ----------------------------
       The server keeps four buckets, each on its own UTC day: papers 10, books
       3, notes 3, marking keys 10 by default. QUOTA_FIELD maps this page's
       section to the field prefix its numbers live under in /auth/quota —
       "marking-keys" the section, "marking_keys" the fields. */
    var bucket = QUOTA_FIELD[cfg.quotaKey] || cfg.quotaKey;
    // The limit is a server setting (DAILY_*_LIMIT), so it is never guessed
    // from the copy in config.js: no reported limit means no chip, exactly
    // like no reported count.
    var cap = null;
    var left = null;        // this page's allowance, as the server last said
    // The others, from the same answer: "you're out of notes" is only half the
    // story when there are still papers to download. null means "not known",
    // and the notice then quotes no number at all.
    var others = null;

    // A download can land while the initial GET is still in flight. Its
    // numbers are the newer ones, so the GET must not overwrite them.
    var quotaDirty = false;

    // A remembered zero is a hint, never a verdict. The backend expires an
    // unconfirmed reservation five minutes after the *download request*, not
    // five minutes after we happen to hear about it, so no local timer can
    // know when the answer changed. The only safe move when the count says
    // zero is to ask the server again — one GET, only when the page is spent.
    var quotaChecking = false;

    function pick(q, field, suffix) {
      var name = field + "_" + suffix;
      return q && typeof q[name] === "number" ? q[name] : null;
    }

    // Which other sections still have downloads today, as one short phrase:
    // "3 books, 2 notes and 10 marking keys".
    function spareLine() {
      if (!others) return "";
      var spare = [];
      QUOTA_SECTIONS.forEach(function (section) {
        if (section === cfg.quotaKey) return;
        var field = QUOTA_FIELD[section];
        var count = others[field] ? others[field].left : null;
        if (!(count > 0)) return;
        var name = count === 1
          ? t("list.sectionOne." + section)
          : t("list.sectionName." + section);
        spare.push(count + " " + name);
      });
      if (!spare.length) return t("list.notice.spareNone");
      var last = spare.length > 1 ? spare.pop() : null;
      return t("list.notice.spare", last ? spare.join(", ") + " and " + last : spare[0]);
    }

    // One bucket spent is not "today's downloads" spent: name the allowance
    // that ran out, and say what is still available in the others.
    function noticeCopy() {
      var lines = [t("list.notice.why", cfg.quotaKey)];
      var spare = spareLine();
      if (spare) lines.push(spare);
      lines.push(t("list.notice.recovery", cfg.quotaKey));
      return {
        title: t("list.notice.title", cfg.quotaKey),
        body: lines.join(" "),
      };
    }

    // What one unit of this allowance is called: "1 book", "2 books", "1
    // marking key". Singular and plural come from the same table, so the
    // sentence stays grammatical when only one is left.
    function noun(count) {
      var key = count === 1 ? "list.unitOne." : "list.unit.";
      return t(key + cfg.quotaKey);
    }

    // "3 left" is a counter. "3 books left today" is an answer — what the
    // thing is, how many, and when it comes back. The number is always the
    // server's; nothing here knows what the limit should be.
    function pillCopy(count) {
      if (count === 0) return t("list.noneLeft", cfg.quotaKey);
      return t("list.leftToday", count, cfg.quotaKey);
    }

    // The sheet behind the pill: the whole rule, in two sentences.
    function quotaSheetCopy() {
      return {
        body: t("shell.quotaBody", left, cap, noun(left)),
        reset: t("shell.quotaReset"),
      };
    }

    // The pill is asked for on Books only. Every section still has its own
    // allowance and still shows the plain-English notice when it runs out, and
    // its buttons still stop at zero — the counter is the only part that is
    // Books-only.
    var SHOW_PILL = cfg.quotaKey === "books";

    function renderLimit() {
      if (!el.limit) return;

      // The explanation appears exactly when it is true.
      if (el.notice) {
        el.notice.hidden = left !== 0;
        if (left === 0) {
          var copy = noticeCopy();
          if (el.noticeTitle) el.noticeTitle.textContent = copy.title;
          if (el.noticeBody) el.noticeBody.textContent = copy.body;
        }
      }

      // Nothing reported for this bucket: say nothing rather than imply an
      // allowance we cannot measure — and leave the buttons alone.
      var known = left !== null && cap > 0;
      if (!known) {
        el.limit.hidden = true;
        setDownloadsEnabled(true);
        return;
      }

      var allowed = left > 0;

      // A section without the pill still stops at zero; it just says so in the
      // notice and on the buttons.
      if (!SHOW_PILL) {
        el.limit.hidden = true;
        setDownloadsEnabled(allowed);
        return;
      }

      el.limit.hidden = false;
      // Teal while comfortable, amber at one, muted red at none.
      el.limit.classList.toggle("is-low", left === 1);
      el.limit.classList.toggle("is-out", left === 0);
      el.limitText.textContent = pillCopy(left);
      el.limit.setAttribute("aria-label", pillCopy(left) + ". " + t("shell.quotaReset"));
      if (shell.setQuotaSheet) shell.setQuotaSheet(quotaSheetCopy());

      // At zero every Download button on the page stops accepting taps, but
      // keeps its place and its size: hiding them would move the page under a
      // thumb that was already reaching for one.
      setDownloadsEnabled(allowed);
    }

    // "Limit reached" replaces the label, once, on every card. `aria-disabled`
    // rather than `disabled`: a disabled button is skipped by a screen reader
    // and refuses the tap that would explain why.
    function setDownloadsEnabled(enabled) {
      if (!cfg.quotaKey) return;
      el.grid.querySelectorAll("[data-download]").forEach(function (btn) {
        if (btn.dataset.pending === "true") return;
        btn.setAttribute("aria-disabled", String(!enabled));
        var label = btn.querySelector(".btn-label");
        if (label) {
          label.textContent = enabled ? t("list.download") : t("list.limitReached");
        }
        if (!enabled) btn.setAttribute("title", t("list.limitReached"));
        else btn.removeAttribute("title");
      });
    }

    function revealNotice() {
      if (!el.notice) return;
      el.notice.hidden = false;
      if (el.notice.scrollIntoView) el.notice.scrollIntoView({ block: "nearest" });
    }

    // The single place a server answer becomes state. A zero is not stamped
    // and does not expire on a timer: it is re-checked against /auth/quota on
    // the next tap, because only the server knows when a place freed up.
    function applyQuota(q, fromTap) {
      var reported = pick(q, bucket, "limit");
      if (reported > 0) cap = reported;

      left = pick(q, bucket, "left");
      others = {};
      QUOTA_SECTIONS.forEach(function (section) {
        var field = QUOTA_FIELD[section];
        others[field] = { left: pick(q, field, "left"), limit: pick(q, field, "limit") };
      });

      if (fromTap) quotaDirty = true;
      renderLimit();
      return left;
    }

    // Resolves to "ok" when the server actually spoke, "failed" when it did
    // not. The caller must keep those apart: "I could not check" is not "you
    // have none", and a student should never be told the second when the first
    // is what happened.
    function refreshQuota() {
      return Zafar.authGet("/auth/quota")
        .then(function (q) {
          applyQuota(q, true);
          return "ok";
        })
        .catch(function () {
          return "failed";
        });
    }

    if (cfg.quotaKey && el.limit) {
      Zafar.authGet("/auth/quota")
        .then(function (q) {
          // A download already reported newer numbers than this.
          if (quotaDirty) return;
          applyQuota(q);
        })
        .catch(function () {
          if (!el.limit || quotaDirty) return;
          el.limit.hidden = false;
          el.limit.classList.remove("is-low", "is-out");
          el.limitText.textContent = t("list.limitUnavailable");
        });
    }

    /* ---------- Downloads ---------- */
    /* The list response never carries a download URL — a permanent link
       there would let the daily quota be bypassed straight from the
       network tab. Every click first calls POST /drive/download/{id},
       which enforces + logs the quota and returns a short-lived signed
       URL; only then is the file fetched and handed to the browser as a
       same-origin blob (the `download` attribute is ignored on
       cross-origin URLs, which is what caused the old blank-tab flash). */
    el.grid.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-download]");
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.pending === "true") return;
      if (!navigator.onLine) return shell.showToast(t("list.noInternet"), "offline");

      // A card that came up in "Limit reached" is still a way to ask why. It
      // opens the same sheet the pill does, so the answer is where the
      // question was, and one re-check happens inside it.
      if (btn.getAttribute("aria-disabled") === "true") {
        if (shell.quota) shell.quota.click();
        if (!quotaChecking) {
          quotaChecking = true;
          refreshQuota().then(function () { quotaChecking = false; });
        }
        return;
      }

      if (cfg.quotaKey && left !== null && left <= 0) {
        // Whatever the stored zero says, the server has the last word: an
        // unconfirmed reservation or the daily refill can have freed a place
        // since it arrived.
        if (quotaChecking) return;
        quotaChecking = true;
        btn.dataset.pending = "true";
        refreshQuota().then(function (state) {
          quotaChecking = false;
          btn.dataset.pending = "false";

          if (state === "ok" && left > 0) return startDownload(btn);
          if (state === "ok") {
            revealNotice();
            return shell.showToast(t("list.notice.title", cfg.quotaKey), "alert");
          }

          // The check failed. Report that, and do not dress it up as a limit
          // the server never confirmed — including for a screen reader, and
          // including the notice already on screen.
          if (el.limit) {
            el.limit.hidden = false;
            el.limit.classList.remove("is-low", "is-out");
            el.limitText.textContent = t("list.limitUnavailable");
            el.limit.setAttribute("aria-label", t("list.limitUnavailable"));
          }
          if (el.notice) el.notice.hidden = true;
          shell.showToast(t("list.limitCheckFailed"), "alert");
        });
        return;
      }

      startDownload(btn);
    });

    // One file at a time. Two taps in quick succession are two reservations,
    // and the quota is checked between them on the server — a check the phone
    // can make cheaply by simply not sending the second one yet.
    var downloadBusy = false;

    // One download, from the request to the file landing in the phone.
    function startDownload(btn) {
      if (downloadBusy) return shell.showToast(t("list.oneAtATime"), "download");
      downloadBusy = true;
      var id = btn.dataset.download;
      var original = btn.innerHTML;
      btn.dataset.pending = "true";
      btn.setAttribute("aria-disabled", "true");
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.innerHTML =
        '<span class="btn-spinner" aria-hidden="true"></span>' +
        '<span class="btn-label">' + t("list.preparing") + "</span>" +
        '<span class="btn-progress" aria-hidden="true"></span>';

      var bar = btn.querySelector(".btn-progress");
      var label = btn.querySelector(".btn-label");
      var progressTimer = null;
      var share = 0.15;

      function stopProgress() {
        if (progressTimer) clearInterval(progressTimer);
        progressTimer = null;
      }

      // The two halves of a download are different waits: asking the server
      // for a signed link (quick, or a refusal), then pulling the file (as
      // slow as the connection is). The bar fills for both, and says which
      // half it is in, because "Preparing" for thirty seconds reads as stuck.
      function setProgress(value, text) {
        share = value;
        if (bar) bar.style.width = Math.round(value * 100) + "%";
        if (text && label) label.textContent = text;
        btn.setAttribute("aria-label", text || t("list.preparing"));
      }

      function restore() {
        stopProgress();
        downloadBusy = false;
        btn.dataset.pending = "false";
        btn.removeAttribute("aria-disabled");
        btn.disabled = false;
        btn.classList.remove("is-loading", "is-done");
        btn.innerHTML = original;
        // The page may have run out of allowance while this one was in flight.
        if (cfg.quotaKey && left !== null && left <= 0) setDownloadsEnabled(false);
      }

      function markSaved() {
        stopProgress();
        // The file is on the phone: the next one may start even while this
        // button is still showing "Saved".
        downloadBusy = false;
        btn.classList.remove("is-loading");
        btn.classList.add("is-done");
        btn.innerHTML =
          svg("check", 16) + '<span class="btn-label">' + t("list.saved") + "</span>";
        btn.setAttribute("aria-label", t("list.saved"));
        setTimeout(restore, 1800);
      }

      // The card knows which shelf its document came from, and the download
      // is charged to that shelf's allowance.
      var section = btn.dataset.section || state.section;
      var card = btn.closest(".item");
      var catNode = card ? card.querySelector(".item-cat") : null;
      // Remembered only once the file is actually on the phone — a reservation
      // that never delivered anything is not a download. The id is what puts
      // the badge back on this card the next time the list is drawn.
      var file = {
        id: id,
        name: btn.dataset.filename || (card ? card.querySelector(".item-title").textContent : ""),
        category: catNode ? catNode.textContent : "",
        section: section,
      };
      Zafar.authPostJSON(
        "/drive/download/" + encodeURIComponent(id) + "?section=" + encodeURIComponent(section)
      )
        .then(function (data) {
          // The download answer carries all four buckets, so it can replace
          // every number the page holds, not just this section's.
          if (cfg.quotaKey && data.quota) {
            applyQuota(data.quota, true);
          }
          if (!data.url) {
            restore();
            shell.showToast(t("list.downloadFailed"), "alert");
            return;
          }

          shell.showToast(t("list.downloadStarted"), "download");
          // 15% for the signed link, then a bar that creeps while the bytes
          // come. It is deliberately not a percentage of the file: the
          // download rides on a signed URL whose length this page has not been
          // told, and a made-up percentage that stalls at 99 is worse than an
          // honest "working". Every path out of here stops the timer.
          setProgress(0.15, t("list.downloading"));
          progressTimer = setInterval(function () {
            share += (0.85 - share) * 0.12;
            setProgress(share, t("list.downloading"));
          }, 400);
          return Zafar._fetch(data.url, {}, Zafar.FILE_TIMEOUT_MS)
            .then(function (resp) {
              if (!resp.ok) throw new Error("Download failed (" + resp.status + ")");
              return resp.blob();
            })
            .then(function (blob) {
              var url = URL.createObjectURL(blob);
              var a = document.createElement("a");
              a.href = url;
              a.download = btn.dataset.filename || "";
              document.body.appendChild(a);
              a.click();
              a.remove();
              // Safari cancels a save whose blob is revoked in the same tick as
              // the click. A minute is long enough for the browser to take it.
              setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
              Zafar.recordDownload(file);
              markDownloaded(card, id);
              markSaved();
              // Tell the backend the bytes actually arrived, so this counts
              // permanently against today's quota. A reservation that never
              // gets confirmed (network drop, tab closed mid-fetch) ages out
              // on its own instead of burning the allowance for nothing.
              Zafar.authPostJSON("/drive/confirm/" + data.download_id).catch(function () {});
            })
            .catch(function () {
              restore();
              shell.showToast(t("list.downloadFailed"), "alert");
            });
        })
        .catch(function (err) {
          restore();
          if (err && err.status === 429) {
            // The server just refused, so zero is the honest count for this
            // bucket until the next tap re-checks it.
            if (cfg.quotaKey) {
              quotaDirty = true;
              left = 0;
              // The refusal names this section's bucket; the notice quotes
              // exact numbers for the others, so quote none until a fresh
              // answer arrives — and keep quoting none if the refresh cannot
              // complete.
              others = null;
              renderLimit();
              revealNotice();
              refreshQuota();
            }
            shell.showToast(t("list.notice.title", section), "alert");
          } else {
            // safeMessage keeps internal 5xx text (folder ids, project names)
            // off the screen and shows it only for a 4xx the person can fix.
            shell.showToast(Zafar.safeMessage(err, t("list.downloadFailed")), "alert");
          }
        });
    }

    /* ---------- Category chips ---------- */
    // The folders belong to the library, not to this file: ask the server,
    // again whenever the section changes, and keep the page's static list only
    // until (or unless) it answers. A chip whose folder has been renamed or
    // removed would otherwise filter to nothing and look like broken search.
    var catList = [];
    function renderCatChips() {
      if (!el.catChips) return;
      el.catChips.innerHTML = catChipsHTML(catList, state.category);
    }
    function loadCategories() {
      if (!el.catChips) return;
      var wanted = state.section;
      // Until the server answers: this section's own list. Primary has no
      // static list — its folders are whatever the library has.
      catList = wanted === cfg.section ? (cfg.categories || []).slice() : [];
      if (state.category && catList.indexOf(state.category) === -1) {
        catList = [state.category].concat(catList);
      }
      renderCatChips();

      Zafar.authGet("/drive/categories?section=" + encodeURIComponent(wanted), catalogueOpts())
        .then(function (names) {
          // The student switched again while this was in the air.
          if (wanted !== state.section) return;
          if (!Array.isArray(names) || !names.length) return;
          catList = names.slice();
          // A category that arrived in the URL but is no longer a folder keeps
          // its chip, so the page never claims a filter it is not applying.
          if (state.category && catList.indexOf(state.category) === -1) {
            catList = [state.category].concat(catList);
          }
          renderCatChips();
        })
        .catch(function () {
          // The fallback list stays. Chips are a convenience, not an answer.
        });
    }

    /* ---------- Primary / Secondary ---------- */
    // Inside the page, not in the tab bar: Primary is a level within Past
    // Papers, and it spends the same papers allowance. Switching changes the
    // section that is asked for, not the bucket that is charged.
    function renderSwitch() {
      if (!el.switch) return;
      el.switch.innerHTML = (cfg.sectionChoices || []).map(function (choice) {
        var on = choice.key === state.section;
        return '<button type="button" class="switch-btn' + (on ? " active" : "") +
          '" data-level="' + Zafar.escapeHTML(choice.key) + '" aria-pressed="' + on + '">' +
          Zafar.escapeHTML(choice.label) + "</button>";
      }).join("");
    }
    if (el.switch) {
      el.switch.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-level]");
        if (!btn || btn.dataset.level === state.section) return;
        state.section = btn.dataset.level;
        // Folder names differ between the two shelves: the old category would
        // filter the new section to nothing.
        state.category = "";
        renderSwitch();
        loadCategories();
        load();
      });
    }
    if (el.catChips) {
      el.catChips.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-cat]");
        if (!chip) return;
        state.category = chip.dataset.cat;
        load();
      });
    }

    /* ---------- Active-filter chips (search only; category lives in
       its own chip row above) ---------- */
    function renderChips() {
      var chips = [];
      if (state.q) {
        chips.push('<span class="chip" data-chip="q">“' + Zafar.escapeHTML(state.q) +
          '<button aria-label="' + t("list.clearSearch") + '">✕</button></span>');
      }
      if (chips.length) chips.push('<span class="chip clear" data-chip-clear>' + t("list.clearAll") + "</span>");
      el.chips.innerHTML = chips.join("");
      el.chips.style.display = chips.length ? "flex" : "none";
    }

    el.chips.addEventListener("click", function (e) {
      if (e.target.closest("[data-chip-clear]")) {
        state.category = "";
        state.q = "";
        el.search.value = "";
        return load();
      }
      var chip = e.target.closest("[data-chip]");
      if (!chip || e.target.tagName !== "BUTTON") return;
      if (chip.dataset.chip === "q") {
        state.q = "";
        el.search.value = "";
      }
      load();
    });

    function syncURL() {
      var url = new URL(location.href);
      if (state.section && state.section !== cfg.section) url.searchParams.set("section", state.section);
      else url.searchParams.delete("section");
      if (state.category) url.searchParams.set("category", state.category);
      else url.searchParams.delete("category");
      if (state.q) url.searchParams.set("q", state.q);
      else url.searchParams.delete("q");
      history.replaceState({}, "", url);
    }

    function show(which) {
      current = which;
      el.skeleton.style.display = which === "loading" ? "grid" : "none";
      el.grid.style.display = which === "grid" ? "grid" : "none";
      el.empty.classList.toggle("show", which === "empty");
      el.error.classList.toggle("show", which === "error");
      el.offline.classList.toggle("show", which === "offline");
    }

    /* ---------- Load ---------- */
    // The server says how long to wait in Retry-After; say the same thing in
    // words instead of guessing at "a moment".
    // One implementation, in config.js: the request and report forms need the
    // same words, and two copies would drift.
    var waitPhrase = function (seconds) { return Zafar.waitPhrase(seconds); };

    // The list is read one page at a time: 50 documents, the size the backend
    // defaults to. A page is fetched when the page needs it — once to put
    // something on screen, then again only when the student reaches the end.
    // Reading the whole library before drawing the first card is what made the
    // old version slow on a phone in Lilongwe.
    //
    // Two other rules stay. A page is reused for a minute, keyed by the exact
    // query that produced it, so starring a favourite or coming back to the
    // same search costs nothing. And every view takes a ticket, so a slow
    // answer cannot overwrite a newer one.
    var CACHE_TTL_MS = 60000;
    var PAGE_SIZE = 50;
    var pages = {};        // "section|category|q" -> { rows, nextOffset, done, at, loading, ids }
    var loadSeq = 0;
    var failure = null;
    var observer = null;

    function sectionList() { return cfg.sections || [state.section]; }

    function pageKey(section) { return [section, state.category, state.q].join("|"); }

    function freshEntry(section) {
      var entry = pages[pageKey(section)];
      return entry && entry.at && Date.now() - entry.at < CACHE_TTL_MS ? entry : null;
    }

    // A new query starts with nothing in hand. The old entry is replaced, not
    // emptied: a request still in flight for the previous view writes into the
    // object it closed over, and nobody reads that one again.
    function resetEntry(section) {
      var entry = {
        rows: [], nextOffset: 0, done: false, at: 0, loading: false, ids: {},
        total: null,
      };
      pages[pageKey(section)] = entry;
      return entry;
    }

    function pageURL(section, offset) {
      var query = new URLSearchParams();
      query.set("section", section);
      if (state.category) query.set("category", state.category);
      if (state.q) query.set("q", state.q);
      query.set("limit", String(PAGE_SIZE));
      query.set("offset", String(offset));
      return "/drive/papers?" + query.toString();
    }

    // How big the answer is. With the server's own count every view knows it
    // from the first page; without it, the number can only grow as pages
    // arrive, so the page says "50+" and never pretends the list ends at fifty.
    function groupCount(n) {
      try { return Number(n).toLocaleString("en-GB"); } catch (e) { return String(n); }
    }

    // The whole answer's size, but only if every section this view reads has
    // reported one. A view that reads two shelves cannot add a number it does
    // not have to the one it does.
    function totalAcross() {
      var sum = 0;
      var every = sectionList().every(function (section) {
        var entry = pages[pageKey(section)];
        if (!entry || entry.total === null || entry.total === undefined) return false;
        sum += entry.total;
        return true;
      });
      return every ? sum : null;
    }

    // Written from three places — the first paint, every later page, and
    // removing a favourite — so they can never disagree.
    function updateCount(n) {
      var done = !failure && !hasMore();
      var total = totalAcross();
      if (total !== null) {
        el.count.textContent = t("list.results", groupCount(total));
      } else if (done) {
        el.count.textContent = t("list.results", groupCount(n));
      } else {
        el.count.textContent = t("list.resultsAtLeast", groupCount(n));
      }
    }

    // Catalogue requests get their own patience: the server may be building
    // its Drive tree for the first time (each Drive call is allowed twenty
    // seconds on its own), so fifteen seconds — the app's normal deadline —
    // could abort a scan that was about to answer. One retry then covers the
    // interrupted scan, which is quick the second time round.
    function catalogueOpts(onRetry) {
      return {
        timeout: Zafar.LIST_TIMEOUT_MS,
        attempts: 2,
        onRetry: onRetry,
      };
    }

    function hasMore() {
      return sectionList().some(function (section) {
        var entry = pages[pageKey(section)];
        return entry && !entry.done;
      });
    }

    function busy() {
      return sectionList().some(function (section) {
        var entry = pages[pageKey(section)];
        return entry && entry.loading;
      });
    }

    // The next page of one section. `finished` is called exactly once, with an
    // error or with null, so the caller can wait on every section it asked.
    function fetchPage(section, mine, finished) {
      var entry = pages[pageKey(section)];
      if (!entry || entry.done || entry.loading) return finished(null);

      entry.loading = true;
      syncMore();

      Zafar.authGetMeta(pageURL(section, entry.nextOffset), catalogueOpts(function () {
        // A second attempt is about to start. Say so rather than leave a
        // still skeleton looking like a dead page — the first visit can start a
        // full Drive scan on the server.
        if (el.count) el.count.textContent = t("list.loadingSlow");
      })).then(
        function (answer) {
          entry.loading = false;
          if (mine !== loadSeq) return finished(null);

          var batch = answer.data;
          var rows = Array.isArray(batch) ? batch : [];
          // How many documents the whole answer holds, not how many came back
          // in this page. Null until the server sends it.
          if (answer.total !== null && answer.total !== undefined) entry.total = answer.total;
          var fresh = 0;
          rows.forEach(function (doc) {
            if (!doc || !doc.id || entry.ids[doc.id]) return;
            entry.ids[doc.id] = true;
            // The list response is a page of documents, not of shelves, so the
            // shelf is written on each one here: it is what the card's download
            // is charged to.
            doc._section = section;
            entry.rows.push(doc);
            fresh += 1;
          });

          entry.nextOffset += rows.length;
          entry.at = Date.now();
          // Three ways to know the section has ended: the page was short, the
          // page brought nothing new (a backend ignoring `offset`), or the
          // server's own count says every document has now been read. The
          // third is why a shelf of exactly 250 does not need an empty sixth
          // page to announce itself.
          entry.done =
            rows.length < PAGE_SIZE ||
            fresh === 0 ||
            (entry.total !== null && entry.nextOffset >= entry.total);
          finished(null);
        },
        function (error) {
          entry.loading = false;
          if (mine !== loadSeq) return finished(null);
          finished(error);
        }
      );
    }

    function load(force) {
      var mine = ++loadSeq;
      renderChips();
      renderCatChips();
      renderSwitch();
      syncURL();

      // A fresh view: nothing rendered, nothing promised.
      renderedCount = 0;
      failure = null;
      show("loading");
      el.count.textContent = t("list.loading");
      // Nothing to continue until something is on screen.
      if (el.more) el.more.hidden = true;
      watchTail(false);

      var list = sectionList();
      var reuse = !force && list.every(function (section) { return freshEntry(section); });
      list.forEach(function (section) {
        if (!freshEntry(section)) resetEntry(section);
      });
      if (reuse) return paint(mine);

      var pending = list.length;
      var firstError = null;
      list.forEach(function (section) {
        fetchPage(section, mine, function (error) {
          if (error && !firstError) firstError = error;
          pending -= 1;
          if (pending === 0 && mine === loadSeq) {
            failure = firstError;
            paint(mine);
          }
        });
      });
    }

    // One more page for every section that still has one. A view may read more
    // sections, so this waits for all of them before repainting once.
    function loadMore() {
      if (busy()) return;
      var mine = loadSeq;
      var list = sectionList().filter(function (section) {
        var entry = pages[pageKey(section)];
        return entry && !entry.done;
      });
      if (!list.length) return;

      var pending = list.length;
      var anyError = null;
      list.forEach(function (section) {
        fetchPage(section, mine, function (error) {
          if (error && !anyError) anyError = error;
          pending -= 1;
          if (pending === 0 && mine === loadSeq) {
            if (anyError) {
              shell.showToast(Zafar.safeMessage(anyError, t("list.loadMoreFailed")), "alert");
            }
            paint(mine);
          }
        });
      });
    }

    function paint(mine) {
      if (mine !== loadSeq) return;

      var list = sectionList();
      var docs = [];
      list.forEach(function (section) {
        var entry = pages[pageKey(section)];
        if (entry) docs = docs.concat(entry.rows);
      });

      // Nothing came back, and something went wrong getting it.
      if (!docs.length && failure) {
        if (!navigator.onLine) {
          el.count.textContent = t("list.offline");
          show("offline");
        } else {
          el.count.textContent = "\u2014";
          show("error");
          shell.showToast(
            failure.status === 429
              ? t("list.tooManyRequests", waitPhrase(failure.retryAfter))
              : Zafar.safeMessage(failure, t("list.loadError")),
            "alert"
          );
        }
        if (el.more) el.more.hidden = true;
        return;
      }

      // Part of the answer never arrived. "Nothing here" is a claim we cannot
      // make when a section we asked about did not answer: that section may be
      // where the rest of the list is.
      var partial = !!failure;

      docs = docs.slice().sort(SORTS[state.sort] || SORTS["name-asc"]);
      renderedCount = docs.length;

      updateCount(docs.length);

      if (!docs.length) {
        // Nothing on this shelf: the cards from the last view must not linger
        // behind the empty state.
        el.grid.innerHTML = "";
        var p = el.empty.querySelector("p");
        var h = el.empty.querySelector("h3");
        if (partial) {
          h.textContent = t("list.partialTitle");
          p.textContent = t("list.partialBody");
          show("empty");
          shell.showToast(t("list.partialResults"), "offline");
          if (el.more) el.more.hidden = true;
          return;
        }
        if (state.category || state.q) {
          h.textContent = t("list.noMatchesTitle");
          p.textContent = t("list.noMatchesBody");
        } else {
          h.textContent = t("list.emptySectionTitle");
          p.textContent = t("list.emptySectionBody", cfg.itemLabel);
        }
        show("empty");
        if (el.more) el.more.hidden = true;
        return;
      }

      el.grid.innerHTML = docs.map(function (d) {
        return cardHTML(d, state.section);
      }).join("");
      // A page can arrive while the allowance is spent: its new buttons must
      // come up already in their "Limit reached" state.
      if (cfg.quotaKey && left !== null && left <= 0) setDownloadsEnabled(false);
      show("grid");
      syncMore();

      if (partial) shell.showToast(t("list.partialResults"), "offline");
    }

    function syncMore() {
      if (!el.more) return;
      var more = hasMore() && current === "grid";
      el.more.hidden = !more;
      if (el.moreBtn) {
        el.moreBtn.disabled = busy();
        el.moreBtn.textContent = busy() ? t("list.loadingMore") : t("list.loadMore");
      }
      watchTail(more);
    }

    // A phone scrolls faster than it taps, so the next page starts arriving as
    // the end of the list comes into view. The button stays for browsers
    // without IntersectionObserver, and for anyone who would rather ask.
    function watchTail(on) {
      if (!el.sentinel || typeof IntersectionObserver !== "function") return;
      if (!observer) {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || busy() || !hasMore()) return;
            loadMore();
          });
        }, { rootMargin: "240px" });
      }
      if (on) observer.observe(el.sentinel);
      else observer.unobserve(el.sentinel);
    }

    if (el.moreBtn) {
      el.moreBtn.addEventListener("click", loadMore);
    }

    root.querySelector("[data-retry]").addEventListener("click", function () { load(true); });
    el.search.addEventListener("input", debounce(function () {
      state.q = (el.search.value || "").trim();
      load();
    }, 320));
    el.sort.addEventListener("change", function () {
      state.sort = el.sort.value;
      load();
    });

    window.addEventListener("offline", function () {
      // There is no stored copy any more: if a list is on screen it stays
      // readable, but it is the last answer the server gave — nothing else can
      // be fetched. With nothing rendered, say plainly that the phone is offline
      // rather than leaving an empty page.
      if (!(current === "grid" && renderedCount)) show("offline");
      shell.showToast(t("list.offlineTitle"), "offline");
    });
    window.addEventListener("online", function () {
      shell.showToast(t("list.backOnline"), "bolt");
      load();
    });

    // "/" focuses search, the way every good library UI does.
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== el.search) {
        e.preventDefault();
        el.search.focus();
      }
    });

    loadCategories();
    load();
  }

  return { init: init };
})();
