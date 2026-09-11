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
    var cats = (cfg.categories || []).map(function (c) {
      return '<option value="' + Zafar.escapeHTML(c) + '">' + Zafar.escapeHTML(c) + "</option>";
    }).join("");

    return (
      (cfg.quotaKey
        ? '<div class="row"><span class="badge badge-ok" data-limit>' + svg("bolt", 14) +
          '<span data-limit-text>' + t("list.checkingLimit") + "</span></span>" +
          '<span class="badge badge-warn" data-demo-tag style="display:none">' + t("list.demoData") + "</span></div>"
        : '<div class="row"><span class="badge badge-warn" data-demo-tag style="display:none">' + t("list.demoData") + "</span></div>") +

      '<div class="toolbar">' +
        '<label class="search">' + svg("search", 18) +
          '<input type="search" data-search placeholder="' +
          Zafar.escapeHTML(cfg.searchPlaceholder || t("list.allCategories")) + '" aria-label="Search">' +
        "</label>" +
        (cats
          ? '<select class="select" data-category aria-label="Filter by category">' +
            '<option value="">' + t("list.allCategories") + "</option>" + cats + "</select>"
          : "") +
        '<select class="select" data-sort aria-label="Sort results">' +
          '<option value="name-asc">' + t("list.sortNameAsc") + "</option>" +
          '<option value="name-desc">' + t("list.sortNameDesc") + "</option>" +
          '<option value="size-desc">' + t("list.sortSizeDesc") + "</option>" +
          '<option value="size-asc">' + t("list.sortSizeAsc") + "</option>" +
        "</select>" +
      "</div>" +

      '<div class="chips" data-chips style="display:none"></div>' +

      '<div class="skeleton" data-skeleton>' + skeletonHTML(6) + "</div>" +
      '<div class="grid" data-grid style="display:none"></div>' +

      '<div class="state" data-empty>' + svg("empty", 40) +
        "<h3>" + t("list.emptySectionTitle") + "</h3><p></p></div>" +

      '<div class="state danger" data-error>' + svg("alert", 40) +
        "<h3>" + t("list.couldntLoad", cfg.itemLabel) + "</h3>" +
        "<p>" + t("list.loadError") + "</p>" +
        '<button class="btn btn-ghost btn-sm" data-retry>' + t("list.tryAgain") + "</button></div>" +

      '<div class="state" data-offline>' + svg("offline", 40) +
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

  function cardHTML(doc) {
    var t = ZafarI18n.t;
    var title = Zafar.escapeHTML(doc.name.replace(/\.pdf$/i, ""));
    var filename = /\.pdf$/i.test(doc.name) ? doc.name : doc.name + ".pdf";
    var saved = Zafar.getBookmarks().indexOf(doc.id) !== -1;
    return (
      '<article class="doc" data-id="' + Zafar.escapeHTML(doc.id) + '">' +
        '<div class="doc-top">' +
          '<span class="badge">' + Zafar.escapeHTML(doc.category || t("list.document")) + "</span>" +
          '<button class="fav-btn' + (saved ? " on" : "") + '" data-fav="' + Zafar.escapeHTML(doc.id) +
            '" aria-pressed="' + saved + '" aria-label="' +
            (saved ? "Remove from favorites" : "Save to favorites") + '">' + svg("heart", 17) + "</button>" +
        "</div>" +
        '<h3 class="doc-title">' + title + "</h3>" +
        '<div class="doc-foot">' +
          '<div class="file-meta">' +
            '<span class="file-glyph">' + svg("file", 18) + "</span>" +
            '<span class="lines"><span class="size">' + Zafar.formatSize(doc.size_bytes) +
            '</span><br><span class="type">' + t("list.pdfDocument") + "</span></span>" +
          "</div>" +
          '<button class="btn btn-primary btn-sm" data-download="' + Zafar.escapeHTML(doc.id) +
            '" data-filename="' + Zafar.escapeHTML(filename) + '">' + svg("download", 15) + t("list.download") + "</button>" +
        "</div>" +
      "</article>"
    );
  }

  function init(cfg, shell) {
    var t = ZafarI18n.t;
    var root = shell.content;
    root.innerHTML = layout(cfg);
    if (Zafar.isDemo()) ZafarShell.markDemo();

    var el = {
      grid: root.querySelector("[data-grid]"),
      skeleton: root.querySelector("[data-skeleton]"),
      empty: root.querySelector("[data-empty]"),
      error: root.querySelector("[data-error]"),
      offline: root.querySelector("[data-offline]"),
      chips: root.querySelector("[data-chips]"),
      search: root.querySelector("[data-search]"),
      category: root.querySelector("[data-category]"),
      sort: root.querySelector("[data-sort]"),
      limit: root.querySelector("[data-limit]"),
      limitText: root.querySelector("[data-limit-text]"),
    };

    var params = new URLSearchParams(location.search);
    var state = {
      category: params.get("category") || "",
      q: params.get("q") || "",
      sort: "name-asc",
    };
    if (el.category) el.category.value = state.category;
    if (state.q) el.search.value = state.q;

    /* ---------- Quota badge ---------- */
    var left = null;
    function renderLimit() {
      if (!el.limit || left === null) return;
      el.limitText.textContent =
        left > 0
          ? t("list.downloadsLeft", left, DAILY_PAPER_LIMIT)
          : t("list.limitReached");
      el.limit.classList.toggle("badge-ok", left > 0);
      el.limit.classList.toggle("badge-warn", left <= 0);
    }
    if (cfg.quotaKey && el.limit) {
      Zafar.authGet("/auth/quota")
        .then(function (q) {
          left = cfg.quotaKey === "books" ? q.books_left : q.papers_left;
          renderLimit();
        })
        .catch(function () {
          if (el.limitText) el.limitText.textContent = t("list.limitUnavailable");
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

    /* ---------- Downloads ----------
       The list response never carries a download URL — a permanent link
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
        return shell.showToast(t("list.limitReached"), "alert");
      }

      var id = btn.dataset.download;
      btn.dataset.pending = "true";
      btn.setAttribute("aria-disabled", "true");
      var restore = btn.innerHTML;
      btn.innerHTML = svg("clock", 15) + t("list.preparing");

      function done() {
        btn.dataset.pending = "false";
        btn.removeAttribute("aria-disabled");
        btn.innerHTML = restore;
      }

      Zafar.authPostJSON(
        "/drive/download/" + encodeURIComponent(id) + "?section=" + encodeURIComponent(cfg.section)
      )
        .then(function (data) {
          if (cfg.quotaKey && data.quota) {
            left = cfg.quotaKey === "books" ? data.quota.books_left : data.quota.papers_left;
            renderLimit();
          }
          var card = btn.closest(".doc");
          Zafar.recordDownload({
            id: id,
            name: card ? card.querySelector(".doc-title").textContent : btn.dataset.filename,
            category: card ? card.querySelector(".badge").textContent : "",
          });

          if (data.demo || !data.url) {
            done();
            shell.showToast(t("list.demoNoFile"), "alert");
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
              done();
              // Tell the backend the bytes actually arrived, so this counts
              // permanently against today's quota. A reservation that never
              // gets confirmed (network drop, tab closed mid-fetch) ages out
              // on its own instead of burning the allowance for nothing.
              Zafar.authPostJSON("/drive/confirm/" + data.download_id).catch(function () {});
            })
            .catch(function () {
              done();
              shell.showToast(t("list.downloadFailed"), "alert");
            });
        })
        .catch(function (err) {
          done();
          if (err && err.status === 429) shell.showToast(t("list.limitReached"), "alert");
          else shell.showToast((err && err.message) || t("list.downloadStartFailed"), "alert");
        });
    });

    /* ---------- Chips ---------- */
    function renderChips() {
      var chips = [];
      if (state.category) {
        chips.push('<span class="chip" data-chip="category">' + Zafar.escapeHTML(state.category) +
          '<button aria-label="' + t("list.clearCategory") + '">✕</button></span>');
      }
      if (state.q) {
        chips.push('<span class="chip" data-chip="q">“' + Zafar.escapeHTML(state.q) +
          '”<button aria-label="' + t("list.clearSearch") + '">✕</button></span>');
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
        if (el.category) el.category.value = "";
        return load();
      }
      var chip = e.target.closest("[data-chip]");
      if (!chip || e.target.tagName !== "BUTTON") return;
      if (chip.dataset.chip === "category") {
        state.category = "";
        if (el.category) el.category.value = "";
      } else {
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
      el.grid.style.display = which === "grid" ? "grid" : "none";
      el.empty.classList.toggle("show", which === "empty");
      el.error.classList.toggle("show", which === "error");
      el.offline.classList.toggle("show", which === "offline");
    }

    /* ---------- Load ---------- */
    function load() {
      renderChips();
      syncURL();

      if (!navigator.onLine) {
        show("offline");
        shell.count.textContent = t("list.offline");
        return;
      }

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
          var docs = [].concat.apply([], results);
          if (Zafar.isDemo()) ZafarShell.markDemo();
          if (cfg.favoritesOnly) {
            var saved = Zafar.getBookmarks();
            docs = docs.filter(function (d) { return saved.indexOf(d.id) !== -1; });
          }
          docs = docs.slice().sort(SORTS[state.sort] || SORTS["name-asc"]);

          shell.count.textContent = cfg.favoritesOnly
            ? t("list.savedCount", docs.length)
            : t("list.results", docs.length);

          if (!docs.length) {
            var p = el.empty.querySelector("p");
            var h = el.empty.querySelector("h3");
            if (cfg.favoritesOnly) {
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

          el.grid.innerHTML = docs.map(cardHTML).join("");
          show("grid");
        })
        .catch(function (err) {
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
    if (el.category) {
      el.category.addEventListener("change", function () {
        state.category = el.category.value;
        load();
      });
    }
    el.sort.addEventListener("change", function () {
      state.sort = el.sort.value;
      load();
    });

    window.addEventListener("offline", function () {
      show("offline");
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
