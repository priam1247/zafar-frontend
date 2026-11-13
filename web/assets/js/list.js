/* ============================================================
   StudyMW — document list page
   Shared by Past Papers, Books, Notes, Marking Keys and Favorites.
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
      // Favorites has no allowance of its own, so it gets no notice: there is
      // nothing to explain there that isn't a link back to the page you are on.
      (cfg.quotaKey
        ? '<div class="notice" data-notice hidden>' +
            '<span class="notice-glyph">' + svg("alert", 17) + "</span>" +
            '<div class="notice-text">' +
              '<h2 class="notice-title" data-notice-title></h2>' +
              "<p data-notice-body></p>" +
              '<a class="btn btn-ghost btn-sm notice-cta" href="favorites.html">' +
                t("list.openFavorites") + "</a>" +
            "</div>" +
          "</div>"
        : "") +

      // A level inside one section, not a sixth tab: the tab bar is for
      // sections, and Primary is a shelf inside Past Papers.
      (cfg.sectionChoices && cfg.sectionChoices.length
        ? '<div class="section-switch" data-switch role="group" aria-label="' +
            Zafar.escapeHTML(t("list.chooseLevel")) + '"></div>'
        : "") +

      '<div class="toolbar">' +
        '<label class="search">' + svg("search", 18) +
          '<input type="search" data-search placeholder="' +
          Zafar.escapeHTML(cfg.searchPlaceholder || t("list.allCategories")) + '" aria-label="Search">' +
        "</label>" +
        '<div class="view-toggle" role="group" aria-label="View">' +
          '<button type="button" class="view-btn" data-view="grid" aria-label="Grid view" aria-pressed="true">' + svg("grid", 16) + "</button>" +
          '<button type="button" class="view-btn" data-view="list" aria-label="List view" aria-pressed="false">' + svg("list", 16) + "</button>" +
        "</div>" +
      "</div>" +

      (cfg.categories && cfg.categories.length
        ? '<div class="cat-chips" data-cat-chips></div>'
        : "") +

      '<div class="chips" data-chips style="display:none"></div>' +

      '<div class="sort-row">' +
        '<span class="sort-label">' + t("list.sortLabel") + "</span>" +
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

  function skeletonHTML(n) {
    var one =
      '<div class="sk-card"><div class="sk sk-badge"></div>' +
      '<div class="sk sk-title"></div><div class="sk sk-title2"></div>' +
      '<div class="sk-foot"><div class="sk sk-glyph"></div><div class="sk sk-meta"></div>' +
      '<div class="sk sk-btn"></div></div></div>';
    return new Array(n).fill(one).join("");
  }

  function catChipsHTML(categories, activeCat) {
    var chips = [
      '<button type="button" class="cat-chip' + (activeCat ? "" : " active") + '" data-cat="" aria-pressed="' + (!activeCat) + '">' +
        ZafarI18n.t("list.allCategories") + "</button>",
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

  // pageSection is the fallback for a list that came from one section: on
  // Favorites the documents arrive from several, and each one carries the
  // section it came from, so a saved note spends the notes allowance rather
  // than the papers one it happened to be listed under.
  function cardHTML(doc, pageSection) {
    var t = ZafarI18n.t;
    var section = doc._section || pageSection || "";
    var title = Zafar.escapeHTML(doc.name.replace(/\.pdf$/i, ""));
    var filename = /\.pdf$/i.test(doc.name) ? doc.name : doc.name + ".pdf";
    var saved = Zafar.getBookmarks().indexOf(doc.id) !== -1;
    return (
      '<article class="item" data-id="' + Zafar.escapeHTML(doc.id) + '">' +
        '<div class="item-top">' +
          '<span class="glyph-tile">' + svg("file", 19) + "</span>" +
          '<div class="item-head">' +
            '<h3 class="item-title">' + title +
              (featured.indexOf(doc.id) !== -1 ? '<span class="item-featured">Featured</span>' : "") + "</h3>" +
            '<span class="item-cat">' + Zafar.escapeHTML(doc.category || t("list.document")) + "</span>" +
          "</div>" +
          // Reports start here, not on the Help page: a report has to carry the
          // id of a real file, and this card is the only place that knows it.
          '<button class="fav-btn report-btn" data-report="' + Zafar.escapeHTML(doc.id) + '"' +
            ' data-name="' + Zafar.escapeHTML(doc.name) + '"' +
            ' aria-label="' + Zafar.escapeHTML(t("support.reportOpen") + ": " + doc.name) + '"' +
            ' aria-haspopup="dialog">' + svg("alert", 17) + "</button>" +
          '<button class="fav-btn' + (saved ? " on" : "") + '" data-fav="' + Zafar.escapeHTML(doc.id) +
            '" aria-pressed="' + saved + '" aria-label="' +
            (saved ? "Remove from favorites" : "Save to favorites") + '">' + svg("heart", 17) + "</button>" +
        "</div>" +
        '<div class="item-foot">' +
          '<div class="file-meta">' +
            '<span class="lines"><span class="size">' + Zafar.formatSize(doc.size_bytes) +
            '</span><span class="type">' + t("list.pdfDocument") + "</span></span>" +
          "</div>" +
          '<button class="btn btn-primary btn-sm" data-download="' + Zafar.escapeHTML(doc.id) +
            '" data-filename="' + Zafar.escapeHTML(filename) +
            (section ? '" data-section="' + Zafar.escapeHTML(section) : "") +
            '" aria-label="' + t("list.download") + '">' +
            svg("download", 14) + '<span class="btn-label">' + t("list.download") + "</span></button>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Reporting a broken file ----------
     POST /reports takes {file_id, reason, note?} with the bearer token. The
     API looks the file up in the live library and takes the name from there,
     so this dialog never sends a name or an email: a client that could supply
     either could lie about both.

     It is a dialog and not a page because the report starts on the card, and
     leaving the catalogue to file it would lose the list — and the scroll
     position — of someone who only meant to flag one file. */
  function mountReportDialog(shell) {
    var t = ZafarI18n.t;
    var existing = document.querySelector("[data-report-modal]");
    if (existing) existing.remove();

    var wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.setAttribute("data-report-modal", "");
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="modal-scrim" data-report-close></div>' +
      '<div class="modal-card" role="dialog" aria-modal="true" ' +
          'aria-labelledby="report-heading" aria-describedby="report-file">' +
        '<h2 id="report-heading">' + t("support.reportTitle") + "</h2>" +
        '<p class="file-being-reported" id="report-file" data-report-file></p>' +
        '<form data-report-form novalidate>' +
          '<div class="form-field">' +
            '<label for="report-reason">' + t("support.reportReason") + "</label>" +
            '<select class="form-select" id="report-reason">' +
              t("support.reportReasons").map(function (reason) {
                return '<option value="' + Zafar.escapeHTML(reason) + '">' + Zafar.escapeHTML(reason) + "</option>";
              }).join("") +
            "</select>" +
          "</div>" +
          '<div class="form-field">' +
            '<label for="report-note">' + t("support.reportNote") +
              ' <span class="form-optional">' + t("support.requestOptional") + "</span></label>" +
            '<textarea class="form-textarea" id="report-note" rows="2" maxlength="2000" placeholder="' +
              Zafar.escapeHTML(t("support.reportNotePh")) + '"></textarea>' +
          "</div>" +
          '<p class="form-error" role="alert" data-report-error hidden></p>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit" data-report-send>' + t("support.reportSend") + "</button>" +
            '<button class="btn btn-ghost" type="button" data-report-close>' + t("support.reportCancel") + "</button>" +
          "</div>" +
        "</form>" +
        '<div class="form-done" data-report-done hidden>' +
          '<span class="done-glyph">' + svg("check", 18) + "</span>" +
          "<h3>" + t("support.reportDoneTitle") + "</h3>" +
          "<p>" + t("support.reportDone") + "</p>" +
          '<button class="btn btn-ghost" type="button" data-report-close>' + t("support.reportClose") + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);

    var card = wrap.querySelector(".modal-card");
    var form = wrap.querySelector("[data-report-form]");
    var done = wrap.querySelector("[data-report-done]");
    var fileLine = wrap.querySelector("[data-report-file]");
    var errorLine = wrap.querySelector("[data-report-error]");
    var select = wrap.querySelector("#report-reason");
    var note = wrap.querySelector("#report-note");
    var send = wrap.querySelector("[data-report-send]");
    var current = null;   // { id, name, trigger }
    var sending = false;

    function focusables() {
      return Array.prototype.slice
        .call(card.querySelectorAll("button, select, textarea, [href]"))
        .filter(function (node) {
          return !node.disabled && !node.hidden && node.closest("[hidden]") === null;
        });
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside the dialog: behind it is a live catalogue, and a
      // keyboard user who lands there has no way to tell what is on top.
      var nodes = focusables();
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // The page behind a fixed sheet still scrolls on a phone, which reads as
    // the dialog sliding around. Freeze it while the sheet is up, and put back
    // whatever was there before rather than assuming it was empty.
    var bodyOverflow = null;

    function open(button) {
      current = {
        id: button.getAttribute("data-report"),
        name: button.getAttribute("data-name") || "",
        trigger: button,
      };
      // The file's own name, carried on the button. The API takes the name
      // from the library, not from here; this is only so the person can see
      // which file they are about to report.
      fileLine.textContent = current.name ? current.name + ". " + t("support.reportBody") : t("support.reportBody");

      form.hidden = false;
      done.hidden = true;
      errorLine.hidden = true;
      errorLine.textContent = "";
      select.value = t("support.reportReasons")[0];
      note.value = "";
      send.disabled = false;
      send.textContent = t("support.reportSend");
      sending = false;

      wrap.hidden = false;
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
      select.focus();
    }

    function close() {
      wrap.hidden = true;
      if (bodyOverflow !== null) {
        document.body.style.overflow = bodyOverflow;
        bodyOverflow = null;
      }
      document.removeEventListener("keydown", onKey);
      var trigger = current && current.trigger;
      current = null;
      if (trigger && trigger.focus) trigger.focus();
    }

    wrap.addEventListener("click", function (e) {
      if (e.target.closest("[data-report-close]")) close();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending || !current) return;

      var reason = select.value;
      var detail = (note.value || "").trim();
      if (!reason) {
        errorLine.textContent = t("support.errFill");
        errorLine.hidden = false;
        select.focus();
        return;
      }
      // "Something else" with no detail is a row an editor cannot act on.
      if (reason === t("support.reportOther") && !detail) {
        errorLine.textContent = t("support.errReportDetail");
        errorLine.hidden = false;
        note.focus();
        return;
      }

      sending = true;
      send.disabled = true;
      send.textContent = t("support.reportSending");
      errorLine.hidden = true;

      Zafar.submitReport(current.id, reason, detail).then(
        function () {
          sending = false;
          form.hidden = true;
          done.hidden = false;
          var again = done.querySelector("button");
          if (again) again.focus();
        },
        function (err) {
          // The 401 case never arrives here: authPostJSON sends the person to
          // sign in instead, because a report needs an account to belong to.
          sending = false;
          send.disabled = false;
          send.textContent = t("support.reportSend");
          errorLine.textContent = Zafar.submitMessage(err);
          errorLine.hidden = false;
        }
      );
    });

    return { open: open, close: close };
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

    // Pages without a list (Help) leave this hidden.
    if (shell.meta) shell.meta.hidden = false;

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
      search: root.querySelector("[data-search]"),
      sort: root.querySelector("[data-sort]"),
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

    /* ---------- View: grid / list ---------- */
    var view = "grid";
    try { view = localStorage.getItem("zafar_view") === "list" ? "list" : "grid"; } catch (e) {}
    function applyView() {
      el.grid.classList.toggle("list-view", view === "list");
      root.querySelectorAll("[data-view]").forEach(function (b) {
        var on = b.dataset.view === view;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
    root.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        view = b.dataset.view;
        try { localStorage.setItem("zafar_view", view); } catch (e) {}
        applyView();
      });
    });
    applyView();

    /* ---------- Favorites: group by section ---------- */
    var SECTION_LABELS = {
      papers: "Past Papers",
      primary: "Primary",
      books: "Books",
      notes: "Notes",
      "marking-keys": "Marking Keys",
    };
    function groupedBySection(docs) {
      var groups = {};
      docs.forEach(function (d) {
        var key = d._section || "other";
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
      var keys = Object.keys(SECTION_LABELS).filter(function (k) { return groups[k]; });
      Object.keys(groups).forEach(function (k) {
        if (!SECTION_LABELS[k]) keys.push(k);
      });
      return keys.map(function (key) {
        var label = SECTION_LABELS[key] || key;
        return '<h3 class="group-title">' + Zafar.escapeHTML(label) +
          '<span class="group-count">' + groups[key].length + "</span></h3>" +
          '<div class="grid">' + groups[key].map(function (d) {
            return cardHTML(d, key);
          }).join("") + "</div>";
      }).join("");
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
      // allowance we cannot measure.
      if (left === null || !(cap > 0)) {
        el.limit.hidden = true;
        return;
      }

      var allowed = left > 0;
      el.limit.hidden = false;
      el.limit.classList.toggle("is-warn", !allowed);
      el.limitText.textContent = allowed
        ? t("list.downloadsLeft", left, cap)
        : t("list.limitReached", cfg.quotaKey);
      el.limit.setAttribute(
        "aria-label",
        allowed
          ? t("list.downloadsLeftLabel", left, cfg.quotaKey)
          : t("list.limitReached", cfg.quotaKey)
      );
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
          el.limit.classList.add("is-warn");
          el.limitText.textContent = t("list.limitUnavailable");
        });
    }

    /* ---------- Favorites ---------- */
    // Take one card out of the grid and keep the rest of the page honest: the
    // count, the group heading if that group is now empty, and the empty state
    // if nothing is left.
    function dropCard(card) {
      if (!card) return;
      var group = card.closest(".grid");
      card.remove();
      renderedCount = Math.max(0, renderedCount - 1);
      updateCount(renderedCount);
      if (group && !group.querySelector(".item")) {
        var heading = group.previousElementSibling;
        if (heading && heading.classList.contains("group-title")) heading.remove();
        group.remove();
      }
      if (!renderedCount) {
        el.empty.querySelector("h3").textContent = t("list.noFavoritesTitle");
        el.empty.querySelector("p").innerHTML = t("list.noFavoritesBody");
        show("empty");
      }
    }

    /* ---------- Reporting: the card button opens the dialog ---------- */
    var reportDialog = mountReportDialog(shell);
    el.grid.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-report]");
      if (!btn) return;
      reportDialog.open(btn);
    });

    el.grid.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-fav]");
      if (!btn) return;
      var id = btn.dataset.fav;
      var list = Zafar.getBookmarks();
      var on = btn.classList.toggle("on");
      btn.setAttribute("aria-pressed", String(on));
      if (on) {
        if (list.indexOf(id) === -1) list.push(id);
      } else {
        list = list.filter(function (b) { return b !== id; });
      }
      Zafar.setBookmarks(list);
      btn.classList.add("bounce");
      setTimeout(function () { btn.classList.remove("bounce"); }, 320);
      shell.showToast(on ? t("list.savedToFavorites") : t("list.removedFromFavorites"), "heart");
      // On the Favorites page, un-saving drops the card from view here rather
      // than reloading: the answer is already on screen, and a reload would
      // ask the server for all four sections again just to hide one card.
      if (cfg.favoritesOnly && !on) dropCard(btn.closest(".item"));
    });

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
            el.limit.classList.add("is-warn");
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
        '<span class="btn-label">' + t("list.preparing") + "</span>";

      function restore() {
        downloadBusy = false;
        btn.dataset.pending = "false";
        btn.removeAttribute("aria-disabled");
        btn.disabled = false;
        btn.classList.remove("is-loading", "is-done");
        btn.innerHTML = original;
      }

      function markSaved() {
        // The file is on the phone: the next one may start even while this
        // button is still showing "Saved".
        downloadBusy = false;
        btn.classList.remove("is-loading");
        btn.classList.add("is-done");
        btn.innerHTML =
          svg("check", 15) + '<span class="btn-label">' + t("list.saved") + "</span>";
        setTimeout(restore, 1800);
      }

      // The card knows which section its document came from; Favorites has no
      // section of its own, so without it a saved note would be charged to
      // papers.
      var section = btn.dataset.section || state.section;
      var card = btn.closest(".item");
      // Remembered only once the file is actually on the phone — a reservation
      // that never delivered anything is not a download.
      var file = {
        id: id,
        name: card ? card.querySelector(".item-title").textContent : btn.dataset.filename,
        category: card ? card.querySelector(".item-cat").textContent : "",
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
            // bucket until the next tap re-checks it. Favorites has no
            // allowance of its own: it gets the toast and nothing else.
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
      el.grid.style.display = which === "grid" ? (cfg.favoritesOnly ? "" : "grid") : "none";
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
    // reported one. Favorites reads five sections, and one missing number
    // cannot be added to the others.
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
      if (cfg.favoritesOnly) {
        // The saved list itself lives on the phone, so its size is known
        // exactly — no page has to arrive for it. With a filter on, the answer
        // is "saved documents that match", which can only be counted as pages
        // of each section are read, so that one may say "+".
        if (!state.q && !state.category) {
          shell.count.textContent = t("list.savedCount", Zafar.getBookmarks().length);
          return;
        }
        shell.count.textContent = done
          ? t("list.savedCount", n)
          : t("list.savedAtLeast", n);
        return;
      }
      var total = totalAcross();
      if (total !== null) {
        shell.count.textContent = t("list.results", groupCount(total));
      } else if (done) {
        shell.count.textContent = t("list.results", groupCount(n));
      } else {
        shell.count.textContent = t("list.resultsAtLeast", groupCount(n));
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
        if (shell.count) shell.count.textContent = t("list.loadingSlow");
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
            // So Favorites can group a document and charge its download to the
            // right section without the backend sending one.
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
      shell.count.textContent = t("list.loading");
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

    // One more page for every section that still has one. Favorites asks five
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
          shell.count.textContent = t("list.offline");
          show("offline");
        } else {
          shell.count.textContent = "\u2014";
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
      // make when a section we asked about did not answer — and on Favorites
      // that section may be where the saved documents are.
      var partial = !!failure;

      if (cfg.favoritesOnly) {
        var saved = Zafar.getBookmarks();
        docs = docs.filter(function (d) { return saved.indexOf(d.id) !== -1; });
      }
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
        if (cfg.favoritesOnly && !state.q && !state.category) {
          h.textContent = t("list.noFavoritesTitle");
          p.innerHTML = t("list.noFavoritesBody");
        } else if (state.category || state.q) {
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

      if (cfg.favoritesOnly) {
        el.grid.classList.add("grouped");
        el.grid.innerHTML = groupedBySection(docs);
      } else {
        el.grid.classList.remove("grouped");
        el.grid.innerHTML = docs.map(function (d) {
          return cardHTML(d, state.section);
        }).join("");
      }
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

  return { init: init, cardHTML: cardHTML, skeletonHTML: skeletonHTML };
})();
