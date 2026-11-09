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

  function cardHTML(doc) {
    var t = ZafarI18n.t;
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
            '" data-filename="' + Zafar.escapeHTML(filename) + '" aria-label="' + t("list.download") + '">' +
            svg("download", 14) + '<span class="btn-label">' + t("list.download") + "</span></button>" +
        "</div>" +
      "</article>"
    );
  }

  function init(cfg, shell) {
    var t = ZafarI18n.t;
    var root = shell.content;
    root.innerHTML = layout(cfg);

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
          '<div class="grid">' + groups[key].map(cardHTML).join("") + "</div>";
      }).join("");
    }

    /* ---------- Daily allowance — shown in the header, not the sheet ----------
       The server keeps two buckets today: papers (which notes and marking keys
       are charged against as well) and books. QUOTA_SECTION maps this page to
       the bucket it is really spending, so Notes and Marking Keys show the
       paper count instead of advertising an allowance of their own. */
    var bucket = QUOTA_SECTION[cfg.quotaKey] || cfg.quotaKey;
    // The two allowances are independent, so this page also tracks the other
    // one: "you've run out of papers" is only half the story when there are
    // still books to download.
    var otherBucket = bucket === "books" ? "papers" : "books";
    var cap = DAILY_LIMITS[bucket] || null;
    var otherCap = DAILY_LIMITS[otherBucket] || null;
    var left = null;        // this page's allowance, as the server last said
    var otherLeft = null;   // the other one, when the server said
    // A download can land while the initial GET is still in flight. Its
    // numbers are the newer ones, so the GET must not overwrite them.
    var quotaDirty = false;

    // A "no" is about a moment, not forever. A refusal can be caused by a
    // reservation that ages out after the signed link's five minutes, and the
    // allowance refills at 00:00 UTC. Past either, the zero is a guess and has
    // to be re-checked before it is repeated to a student as "tomorrow".
    var REFUSAL_TTL = 5 * 60 * 1000;
    var refusedAt = 0;
    var refusedDay = "";

    function utcDay() {
      return new Date().toISOString().slice(0, 10);
    }

    function refusalExpired() {
      if (left === null || left > 0 || !refusedAt) return false;
      return Date.now() - refusedAt > REFUSAL_TTL || utcDay() !== refusedDay;
    }

    function pick(q, key, suffix) {
      var field = key + "_" + suffix;
      return q && typeof q[field] === "number" ? q[field] : null;
    }

    // One bucket spent is not "today's downloads" spent: say which allowance
    // ran out, and what is still available.
    function noticeCopy() {
      var isBooks = bucket === "books";
      var lines = [
        isBooks ? t("list.notice.booksWhy") : t("list.notice.papersWhy"),
      ];
      if (otherLeft > 0) {
        lines.push(isBooks ? t("list.notice.sparePapers", otherLeft) : t("list.notice.spareBooks", otherLeft));
      }
      lines.push(t("list.notice.reset"));
      return {
        title: isBooks ? t("list.notice.booksTitle") : t("list.notice.papersTitle"),
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
      if (left === null) {
        el.limit.hidden = true;
        return;
      }

      var allowed = left > 0;
      el.limit.hidden = false;
      el.limit.classList.toggle("is-warn", !allowed);
      el.limitText.textContent = allowed
        ? t("list.downloadsLeft", left, cap)
        : t("list.limitReached");

      var shared = bucket === "papers" && cfg.quotaKey !== "papers"
        ? t("list.sharedBucket")
        : "";
      el.limit.setAttribute(
        "aria-label",
        (allowed ? t("list.downloadsLeftLabel", left, cap) : t("list.limitReached")) + shared
      );
    }

    function revealNotice() {
      if (!el.notice) return;
      el.notice.hidden = false;
      if (el.notice.scrollIntoView) el.notice.scrollIntoView({ block: "nearest" });
    }

    // The single place a server answer becomes state. A zero is stamped with
    // the moment it arrived, which is what lets it expire.
    function applyQuota(q, fromTap) {
      var reported = pick(q, bucket, "limit");
      if (reported > 0) cap = reported;
      var otherReported = pick(q, otherBucket, "limit");
      if (otherReported > 0) otherCap = otherReported;

      left = pick(q, bucket, "left");
      otherLeft = pick(q, otherBucket, "left");
      refusedAt = left === 0 ? Date.now() : 0;
      refusedDay = left === 0 ? utcDay() : "";
      if (fromTap) quotaDirty = true;
      renderLimit();
      return left;
    }

    function refreshQuota() {
      return Zafar.authGet("/auth/quota")
        .then(function (q) { applyQuota(q, true); })
        .catch(function () { /* stays as it was; the guard will not block on a guess */ });
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
        if (!refusalExpired()) {
          revealNotice();
          return shell.showToast(t("list.limitReached"), "alert");
        }
        // Holding an old no. Ask again before repeating it — a reservation
        // from five minutes ago, or yesterday's allowance, may be gone.
        if (btn.dataset.pending === "true") return;
        btn.dataset.pending = "true";
        refreshQuota().then(function () {
          btn.dataset.pending = "false";
          if (left !== null && left > 0) return startDownload(btn);
          revealNotice();
          shell.showToast(t("list.limitReached"), "alert");
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

      Zafar.authPostJSON(
        "/drive/download/" + encodeURIComponent(id) + "?section=" + encodeURIComponent(cfg.section)
      )
        .then(function (data) {
          if (cfg.quotaKey && data.quota) {
            var fresh = pick(data.quota, bucket, "left");
            var freshOther = pick(data.quota, otherBucket, "left");
            if (freshOther !== null) otherLeft = freshOther;
            if (fresh !== null) {
              quotaDirty = true;
              left = fresh;
              refusedAt = fresh === 0 ? Date.now() : 0;
              refusedDay = fresh === 0 ? utcDay() : "";
              renderLimit();
            }
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
            // The server just spoke, so this zero is fresh — and the moment
            // matters, because that is what expires. Favorites has no
            // allowance of its own: it gets the toast and nothing else.
            if (cfg.quotaKey) {
              quotaDirty = true;
              left = 0;
              refusedAt = Date.now();
              refusedDay = utcDay();
              renderLimit();
              revealNotice();
            }
            shell.showToast(t("list.limitReached"), "alert");
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

      // Offline is no longer decided here. The service worker may still be
      // holding the last answer for this view, and a cached list is worth more
      // than a warning — the catch below reports "no answer at all".
      show("loading");
      shell.count.textContent = t("list.loading");

      // Favorites span every section, so that page passes a list of
      // sections and the results are merged into one grid.
      var sections = cfg.sections || [cfg.section];
      var requests = sections.map(function (section) {
        var query = new URLSearchParams();
        query.set("section", section);
        if (state.category) query.set("category", state.category);
        if (state.q) query.set("q", state.q);
        return Zafar.authGet("/drive/papers?" + query.toString());
      });

      Promise.all(requests)
        .then(function (results) {
          // Tag each doc with the section it came from, so the
          // Favorites page can group by section without the
          // backend having to send one.
          var docs = [];
          results.forEach(function (rows, i) {
            (rows || []).forEach(function (d) {
              d._section = sections[i];
              docs.push(d);
            });
          });
          if (cfg.favoritesOnly) {
            var saved = Zafar.getBookmarks();
            docs = docs.filter(function (d) { return saved.indexOf(d.id) !== -1; });
          }
          docs = docs.slice().sort(SORTS[state.sort] || SORTS["name-asc"]);

          var label = cfg.favoritesOnly
            ? t("list.savedCount", docs.length)
            : t("list.results", docs.length);
          if (!navigator.onLine) label = t("list.offlineResults", docs.length);
          shell.count.textContent = label;

          if (!docs.length) {
            var p = el.empty.querySelector("p");
            var h = el.empty.querySelector("h3");
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
            el.grid.innerHTML = docs.map(cardHTML).join("");
          }
          show("grid");
        })
        .catch(function (err) {
          // Nothing from the network and nothing stored for this view.
          if (!navigator.onLine) {
            shell.count.textContent = t("list.offline");
            show("offline");
            return;
          }
          shell.count.textContent = "—";
          show("error");
          shell.showToast((err && err.message) || t("list.couldntLoad", cfg.itemLabel), "alert");
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
      // A list already on screen is still readable, so keep it and mark it
      // rather than replacing a usable page with a warning.
      var shown = el.grid.querySelectorAll(".item").length;
      if (shown) shell.count.textContent = t("list.offlineResults", shown);
      else show("offline");
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
