/* ============================================================
   Zafar — app shell
   Renders the sidebar + topbar for every signed-in page from one place
   (previously each page hand-copied ~90 lines of identical markup),
   and owns theme, the mobile drawer, toasts and the auth guard.
   ============================================================ */

var ZafarShell = (function () {
  var ICONS = {
    // Same open-book mark as the auth screen, so the brand reads as one thing.
    logo: '<path d="M12 5C10.2 3.6 7.6 3 5 3v13c2.6 0 5.2.6 7 2 1.8-1.4 4.4-2 7-2V3c-2.6 0-5.2.6-7 2Z"/><path d="M12 5v13"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
    notes: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 11h8"/><path d="M8 16h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    bolt: '<path d="M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z"/><path d="M9 4h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    offline: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    empty: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m6.08 12-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83L17.9 12"/>',
  };

  function svg(name, size) {
    var s = size || 18;
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + (ICONS[name] || "") + "</svg>"
    );
  }

  /* ---------- Theme (applied before paint by inline script in <head>) ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("zafar_theme", theme); } catch (e) {}
    document.querySelectorAll("[data-theme-switch]").forEach(function (el) {
      el.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    });
  }

  /* ---------- Nav model ---------- */
  function navModel() {
    var t = ZafarI18n.t;
    return [
      { label: t("nav.overview") },
      { id: "home", icon: "home", text: t("nav.dashboard"), href: "home.html" },
      {
        id: "papers", icon: "file", text: t("nav.pastPapers"), href: "dashboard.html",
        children: [
          { text: "MSCE Maneb", href: "dashboard.html?category=MSCE%20Maneb" },
          { text: "JCE Maneb", href: "dashboard.html?category=JCE%20Maneb" },
          { text: "Mock", href: "dashboard.html?category=Mock" },
          { text: "Other Past Papers", href: "dashboard.html?category=Other%20Past%20Papers" },
        ],
      },
      {
        id: "books", icon: "book", text: t("nav.books"), href: "books.html",
        children: [
          { text: "Senior", href: "books.html?category=Senior" },
          { text: "Junior", href: "books.html?category=Junior" },
        ],
      },
      { id: "notes", icon: "notes", text: t("nav.notes"), href: "notes.html" },
      { id: "keys", icon: "check", text: t("nav.markingKeys"), href: "marking-keys.html" },
      { label: t("nav.yours") },
      { id: "favorites", icon: "heart", text: t("nav.favorites"), href: "favorites.html", favCount: true },
      { label: t("nav.support") },
      { id: "help", icon: "help", text: t("nav.help"), href: "help.html" },
    ];
  }

  function navHTML(active, activeCategory) {
    return navModel().map(function (entry, i) {
      if (entry.label) return '<div class="nav-label">' + entry.label + "</div>";

      var isActive = entry.id === active;
      var kids = entry.children || null;
      var openKids = isActive && kids;

      var item =
        '<a class="nav-item' + (isActive ? " active" : "") + (openKids ? " open" : "") + '" href="' +
        entry.href + '"' + (kids ? ' data-sub="sub-' + entry.id + '"' : "") + ">" +
        svg(entry.icon) +
        "<span>" + entry.text + "</span>" +
        (entry.favCount ? '<span class="pill" data-fav-count style="display:none">0</span>' : "") +
        (kids ? '<span class="chevron">' + svg("chevron", 15) + "</span>" : "") +
        "</a>";

      if (!kids) return item;

      var subs = kids.map(function (kid) {
        var cat = new URLSearchParams(kid.href.split("?")[1] || "").get("category");
        var on = isActive && activeCategory && cat === activeCategory;
        return '<a class="sub-item' + (on ? " active" : "") + '" href="' + kid.href + '">' + kid.text + "</a>";
      }).join("");

      return item + '<div class="sub-nav' + (openKids ? " open" : "") + '" id="sub-' + entry.id + '"><div>' + subs + "</div></div>";
    }).join("");
  }

  function shellHTML(opts) {
    var t = ZafarI18n.t;
    var lang = ZafarI18n.getLang();
    return (
      '<div class="overlay" data-overlay></div>' +
      '<aside class="sidebar" data-sidebar>' +
        '<div class="sidebar-header">' +
          '<a class="brand" href="home.html">' +
            '<span class="brand-mark">' + svg("logo", 19) + "</span>" +
            '<span class="brand-text"><span class="brand-name">ZAFAR</span>' +
            '<span class="brand-sub">' + t("nav.studyLibrary") + "</span></span>" +
          "</a>" +
          '<button class="icon-btn close-btn" data-close aria-label="Close menu">' + svg("close", 18) + "</button>" +
        "</div>" +
        '<nav class="nav">' + navHTML(opts.active, opts.activeCategory) + "</nav>" +
        '<div class="sidebar-footer">' +
          '<div class="theme-row">' + svg("sun", 16) + "<span>" + t("nav.darkMode") + "</span>" +
            '<button class="switch" data-theme-switch role="switch" aria-checked="false" aria-label="Toggle dark mode"></button>' +
          "</div>" +
          '<div class="theme-row">' +
            '<div class="lang-toggle" role="group" aria-label="Language">' +
              '<button type="button" data-lang="en" class="' + (lang === "en" ? "active" : "") + '">EN</button>' +
              '<button type="button" data-lang="ny" class="' + (lang === "ny" ? "active" : "") + '">CH</button>' +
            "</div>" +
          "</div>" +
          '<a class="nav-item" data-logout href="login.html">' + svg("logout") + "<span>" + t("nav.logOut") + "</span></a>" +
        "</div>" +
      "</aside>" +
      '<main class="main">' +
        '<header class="topbar">' +
          '<button class="icon-btn hamburger" data-open aria-label="Open menu">' + svg("menu", 20) + "</button>" +
          "<div><div class=\"crumb\">" + (opts.crumb || "Zafar") + '</div><h1>' + opts.title + "</h1></div>" +
          '<div class="topbar-right"><span class="count-tag" data-count>' + t("list.loading") + "</span></div>" +
        "</header>" +
        '<div class="content" data-content></div>' +
      "</main>" +
      '<div class="toast" data-toast></div>'
    );
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(msg, icon) {
    var el = document.querySelector("[data-toast]");
    if (!el) return;
    el.innerHTML = svg(icon || "bolt", 16) + "<span>" + Zafar.escapeHTML(msg) + "</span>";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function markDemo() {
    var tag = document.querySelector("[data-demo-tag]");
    if (tag) tag.style.display = "inline-flex";
  }

  /* ---------- Init ---------- */
  // Returns null when the visitor isn't signed in (page is already
  // navigating to login.html), so page scripts can bail out early.
  function init(opts) {
    opts = opts || {};

    // `?demo=1` (from the landing page's "Explore the demo" button) opens a
    // read-only tour of the app without a backend round-trip.
    var params = new URLSearchParams(location.search);
    if (params.get("demo") === "1") {
      Zafar.setDemo(true);
      if (!Zafar.getToken()) Zafar.setToken("demo.eyJzdWIiOiJndWVzdCJ9.demo", false);
    }

    if (!Zafar.getToken()) {
      location.href = "login.html";
      return null;
    }

    var root = document.getElementById("app");
    root.className = "app";
    root.innerHTML = shellHTML({
      active: opts.active,
      activeCategory: params.get("category"),
      title: opts.title || "Zafar",
      crumb: opts.crumb,
    });

    applyTheme(currentTheme());
    Zafar.updateFavCountPill();

    var sidebar = root.querySelector("[data-sidebar]");
    var overlay = root.querySelector("[data-overlay]");
    function setDrawer(open) {
      sidebar.classList.toggle("open", open);
      overlay.classList.toggle("show", open);
    }
    root.querySelector("[data-open]").addEventListener("click", function () { setDrawer(true); });
    root.querySelector("[data-close]").addEventListener("click", function () { setDrawer(false); });
    overlay.addEventListener("click", function () { setDrawer(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setDrawer(false);
    });

    // Collapsible sections: clicking the chevron expands in place, clicking
    // the label still navigates to the section's own page.
    root.querySelectorAll(".nav-item[data-sub]").forEach(function (item) {
      item.addEventListener("click", function (e) {
        if (!e.target.closest(".chevron")) return;
        e.preventDefault();
        item.classList.toggle("open");
        var sub = document.getElementById(item.dataset.sub);
        if (sub) sub.classList.toggle("open");
      });
    });

    root.querySelectorAll("[data-theme-switch]").forEach(function (sw) {
      sw.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    });

    root.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.classList.contains("active")) return;
        ZafarI18n.setLang(btn.dataset.lang); // reloads the page
      });
    });

    root.querySelector("[data-logout]").addEventListener("click", function () {
      Zafar.clearToken();
    });

    if (Zafar.isDemo()) markDemo();

    return {
      content: root.querySelector("[data-content]"),
      count: root.querySelector("[data-count]"),
      showToast: showToast,
      svg: svg,
    };
  }

  return { init: init, svg: svg, showToast: showToast, applyTheme: applyTheme, markDemo: markDemo };
})();
