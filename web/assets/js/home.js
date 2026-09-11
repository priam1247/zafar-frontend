/* ============================================================
   Zafar — dashboard overview (home.html)
   A bento-style start screen: a search-first command bar, circular quota
   rings, shortcut shelves (with live counts from the API/demo catalogue)
   and a recent-activity timeline built from local download history.
   ============================================================ */

(function () {
  var svg = ZafarShell.svg;
  var t = ZafarI18n.t;

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return t("home.morning");
    if (h < 17) return t("home.afternoon");
    return t("home.evening");
  }

  /* ---------- Quota bars ----------
     Was a big circular SVG ring per stat, which — even shrunk — still
     read as an oversized tile on a phone for what's just one number.
     Reuses the same compact .meter bar the app already has elsewhere,
     matching the flatter card style of the two stats next to it. */
  function barStat(o) {
    return (
      '<div class="stat">' +
        '<div class="stat-head"><span class="stat-glyph">' + svg(o.icon, 17) + "</span>" +
          '<span class="stat-label">' + o.label + "</span></div>" +
        '<div class="stat-value" data-quota-value="' + o.key + '">…</div>' +
        '<div class="meter" data-quota-track="' + o.key + '"><i data-quota-fill="' + o.key + '" style="width:0%"></i></div>' +
        '<div class="stat-foot" data-stat-foot="' + o.key + '">' + (o.foot || "") + "</div>" +
      "</div>"
    );
  }

  function setBar(key, left, cap) {
    var value = document.querySelector('[data-quota-value="' + key + '"]');
    var track = document.querySelector('[data-quota-track="' + key + '"]');
    var fill = document.querySelector('[data-quota-fill="' + key + '"]');
    if (!value || !fill || !track) return;
    if (left == null) { value.textContent = "—"; fill.style.width = "0%"; return; }
    var pct = Math.max(0, Math.min(100, (left / cap) * 100));
    value.textContent = left;
    fill.style.width = pct + "%";
    track.classList.toggle("low", left > 0 && pct <= 30);
    track.classList.toggle("out", left <= 0);
  }

  function plainStat(o) {
    return (
      '<div class="stat">' +
        '<div class="stat-head"><span class="stat-glyph">' + svg(o.icon, 17) + "</span>" +
        '<span class="stat-label">' + o.label + "</span></div>" +
        '<div class="stat-value">' + o.value + "</div>" +
        '<div class="stat-foot">' + (o.foot || "") + "</div>" +
      "</div>"
    );
  }

  /* ---------- Command bar ---------- */
  function commandBarHTML() {
    return (
      '<form class="command-bar" data-command-form>' +
        '<label class="search">' + svg("search", 18) +
          '<input type="search" data-command placeholder="' + Zafar.escapeHTML(t("home.commandPlaceholder")) + '" aria-label="Search">' +
        "</label>" +
      "</form>"
    );
  }

  /* ---------- Shelves ---------- */
  function shelfHTML(s, i) {
    return (
      '<a class="panel feature shelf" href="' + s.href + '" data-shelf="' + i + '">' +
        '<span class="stat-glyph">' + svg(s.icon, 18) + "</span>" +
        "<h3>" + Zafar.escapeHTML(s.title) + "</h3><p>" + Zafar.escapeHTML(s.text) + "</p>" +
        (s.section ? '<span class="shelf-count" data-shelf-count="' + i + '">…</span>' : "") +
      "</a>"
    );
  }

  function fillShelfCounts(shortcuts) {
    shortcuts.forEach(function (s, i) {
      var pill = document.querySelector('[data-shelf-count="' + i + '"]');
      if (!pill) return;
      if (!s.section) { pill.remove(); return; }
      var query = new URLSearchParams({ section: s.section });
      if (s.category) query.set("category", s.category);
      Zafar.authGet("/drive/papers?" + query.toString())
        .then(function (rows) { pill.textContent = (rows || []).length; })
        .catch(function () { pill.remove(); });
    });
  }

  /* ---------- Activity timeline ---------- */
  function timelineHTML(recent) {
    if (!recent.length) {
      return (
        '<div class="state show">' + svg("clock", 40) +
        "<h3>" + t("home.noDownloadsTitle") + "</h3><p>" + t("home.noDownloadsBody") + "</p>" +
        '<a class="btn btn-primary btn-sm" href="dashboard.html">' + t("home.findPaper") + "</a></div>"
      );
    }
    return (
      '<div class="panel timeline">' +
        recent.map(function (d) {
          return (
            '<div class="timeline-row">' +
              '<span class="timeline-dot">' + svg("file", 15) + "</span>" +
              '<span class="timeline-body">' +
                '<span class="name">' + Zafar.escapeHTML(d.name.replace(/\.pdf$/i, "")) + "</span>" +
                '<span class="sub">' + Zafar.escapeHTML(d.category || t("home.documentFallback")) +
                " · " + '<span class="when">' + Zafar.timeAgo(d.at) + "</span></span>" +
              "</span>" +
            "</div>"
          );
        }).join("") +
      "</div>"
    );
  }

  function render(shell) {
    var recent = Zafar.getRecentDownloads(6);
    var shortcuts = t("home.shortcuts");

    shell.content.innerHTML =
      '<section class="hero">' +
        "<div><h2>" + greeting() + ", " + Zafar.escapeHTML(Zafar.username()) + "</h2>" +
        "<p>" + t("home.heroLede") + "</p>" +
        commandBarHTML() +
        "</div>" +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary" href="dashboard.html">' + svg("file", 16) + t("home.browsePapers") + "</a>" +
          '<a class="btn btn-ghost" href="favorites.html">' + svg("heart", 16) + t("home.yourFavorites") + "</a>" +
        "</div>" +
      "</section>" +

      '<div class="row"><span class="badge badge-warn" data-demo-tag style="display:none">' + t("list.demoData") + "</span></div>" +

      '<div class="grid grid-stats bento">' +
        barStat({ key: "papers", icon: "bolt", label: t("home.papersLeft"), foot: t("home.resetsMidnight") }) +
        barStat({ key: "books", icon: "book", label: t("home.booksLeft"), foot: t("home.resetsMidnight") }) +
        plainStat({ icon: "download", label: t("home.downloadedToday"), value: Zafar.getDownloadsToday(), foot: t("home.onThisDevice") }) +
        plainStat({ icon: "heart", label: t("home.savedFavorites"), value: Zafar.getBookmarks().length, foot: t("home.acrossSections") }) +
      "</div>" +

      '<section class="stack">' +
        '<div class="section-head"><h2>' + t("home.shelvesTitle") + "</h2><p>" + t("home.shelvesSubtitle") + "</p></div>" +
        '<div class="grid shelf-grid">' + shortcuts.map(shelfHTML).join("") + "</div>" +
      "</section>" +

      '<section class="stack">' +
        '<div class="section-head"><h2>' + t("home.activityTitle") + "</h2>" +
        "<p>" + t("home.recentSubtitle") + "</p></div>" +
        timelineHTML(recent) +
      "</section>";

    shell.count.textContent = t("home.overview");

    var form = shell.content.querySelector("[data-command-form]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (form.querySelector("[data-command]").value || "").trim();
      location.href = "dashboard.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });

    fillShelfCounts(shortcuts);
  }

  function fillQuota(shell) {
    Zafar.authGet("/auth/quota")
      .then(function (q) {
        if (Zafar.isDemo()) ZafarShell.markDemo();
        [["papers", q.papers_left], ["books", q.books_left]].forEach(function (pair) {
          var key = pair[0], left = pair[1];
          setBar(key, left, DAILY_PAPER_LIMIT);
          var foot = shell.content.querySelector('[data-stat-foot="' + key + '"]');
          if (foot) foot.textContent = left != null && left <= 0 ? t("home.limitReachedFoot") : t("home.perDay", DAILY_PAPER_LIMIT);
        });
      })
      .catch(function () {
        setBar("papers", null); setBar("books", null);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var p = ZafarI18n.t("pages.home");
    var shell = ZafarShell.init({ active: "home", title: p.title, crumb: p.crumb });
    if (!shell) return;
    render(shell);
    fillQuota(shell);
  });
})();
