/* ============================================================
   Zafar — document list page
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
            '<h3 class="item-title">' + title + "</h3>" +
            '<span class="item-cat">' + Zafar.escapeHTML(doc.category || t("list.document")) + "</span>" +
          "</div>" +
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

  function init(cfg, shell) {
    var t = ZafarI18n.t;
    var root = shell.content;
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
      limit: shell.quota || null,
      limitText: shell.quota ? shell.quota.querySelector("[data-quota-text]") : null,
    };

    var params = new URLSearchParams(location.search);
    var state = {
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
      // On the Favorites page, un-saving should drop the card from view.
      if (cfg.favoritesOnly && !on) setTimeout(load, 300);
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

    // One download, from the request to the file landing in the phone.
    function startDownload(btn) {
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
        btn.dataset.pending = "false";
        btn.removeAttribute("aria-disabled");
        btn.disabled = false;
        btn.classList.remove("is-loading", "is-done");
        btn.innerHTML = original;
      }

      function markSaved() {
        btn.classList.remove("is-loading");
        btn.classList.add("is-done");
        btn.innerHTML =
          svg("check", 15) + '<span class="btn-label">' + t("list.saved") + "</span>";
        setTimeout(restore, 1800);
      }

      // The card knows which section its document came from; Favorites has no
      // section of its own, so without it a saved note would be charged to
      // papers.
      var section = btn.dataset.section || cfg.section;
      Zafar.authPostJSON(
        "/drive/download/" + encodeURIComponent(id) + "?section=" + encodeURIComponent(section)
      )
        .then(function (data) {
          // The download answer carries all four buckets, so it can replace
          // every number the page holds, not just this section's.
          if (cfg.quotaKey && data.quota) {
            applyQuota(data.quota, true);
          }
          var card = btn.closest(".item");
          Zafar.recordDownload({
            id: id,
            name: card ? card.querySelector(".item-title").textContent : btn.dataset.filename,
            category: card ? card.querySelector(".item-cat").textContent : "",
          });

          if (!data.url) {
            restore();
            shell.showToast(t("list.downloadFailed"), "alert");
            return;
          }

          shell.showToast(t("list.downloadStarted"), "download");
          return fetch(data.url)
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
              URL.revokeObjectURL(url);
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
            shell.showToast((err && err.message) || t("list.downloadStartFailed"), "alert");
          }
        });
    }

    /* ---------- Category chips ---------- */
    function renderCatChips() {
      if (!el.catChips) return;
      el.catChips.innerHTML = catChipsHTML(cfg.categories || [], state.category);
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
    function load() {
      renderChips();
      renderCatChips();
      syncURL();

      // Fresh view: nothing rendered yet.
      renderedCount = 0;
      show("loading");
      shell.count.textContent = t("list.loading");

      // Favorites span every section, so that page passes a list of sections
      // and the results are merged into one grid. Each section is answered on
      // its own: one section the worker has never seen must not hide the
      // documents the others can still show.
      var sections = cfg.sections || [cfg.section];
      var requests = sections.map(function (section) {
        var query = new URLSearchParams();
        query.set("section", section);
        if (state.category) query.set("category", state.category);
        if (state.q) query.set("q", state.q);
        var path = "/drive/papers?" + query.toString();
        return Zafar.authGet(path).then(
          function (rows) { return { rows: rows || [] }; },
          function (error) { return { error: error }; }
        );
      });

      Promise.all(requests)
        .then(function (results) {
          var failures = results.filter(function (result) { return result.error; });

          // Tag each doc with the section it came from, so the
          // Favorites page can group by section without the
          // backend having to send one.
          var docs = [];
          results.forEach(function (result, i) {
            (result.rows || []).forEach(function (d) {
              d._section = sections[i];
              docs.push(d);
            });
          });

          // Nothing came back from anywhere.
          if (!docs.length && failures.length) {
            if (!navigator.onLine) {
              shell.count.textContent = t("list.offline");
              show("offline");
            } else {
              shell.count.textContent = "—";
              show("error");
              shell.showToast(
                (failures[0].error && failures[0].error.message) || t("list.couldntLoad", cfg.itemLabel),
                "alert"
              );
            }
            return;
          }

          if (cfg.favoritesOnly) {
            var saved = Zafar.getBookmarks();
            docs = docs.filter(function (d) { return saved.indexOf(d.id) !== -1; });
          }
          docs = docs.slice().sort(SORTS[state.sort] || SORTS["name-asc"]);
          renderedCount = docs.length;

          var label = cfg.favoritesOnly
            ? t("list.savedCount", docs.length)
            : t("list.results", docs.length);
          shell.count.textContent = label;

          if (!docs.length) {
            var p = el.empty.querySelector("p");
            var h = el.empty.querySelector("h3");
            if (failures.length) {
              // Part of the answer never arrived. "Nothing here" is a claim we
              // cannot make when a section we asked about did not answer — and
              // on Favorites that section may be where the saved documents are.
              h.textContent = t("list.partialTitle");
              p.textContent = t("list.partialBody");
              show("empty");
              shell.showToast(t("list.partialResults"), "offline");
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
            return;
          }

          if (cfg.favoritesOnly) {
            el.grid.classList.add("grouped");
            el.grid.innerHTML = groupedBySection(docs);
          } else {
            el.grid.classList.remove("grouped");
            el.grid.innerHTML = docs.map(function (d) {
              return cardHTML(d, cfg.section);
            }).join("");
          }
          show("grid");

          // Some sections answered and some did not: the list is real, but it
          // is not the whole list.
          if (failures.length) shell.showToast(t("list.partialResults"), "offline");
        });
    }

    root.querySelector("[data-retry]").addEventListener("click", load);
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

    load();
  }

  return { init: init, cardHTML: cardHTML, skeletonHTML: skeletonHTML };
})();
