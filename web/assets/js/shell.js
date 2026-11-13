/* ============================================================
   StudyMW — app shell
   Renders the bar, the sheet and the bottom tabs for every signed-in
   page from one place, and owns toasts and the auth guard.

   Phone-first, like the auth screen: the bar sticks to the top, the
   tabs stick to the bottom, and the column keeps its phone width on
   any display. There is no sidebar — categories live as chips on the
   list pages, and Help / Log out sit in the bar.
   ============================================================ */

var ZafarShell = (function () {
  var ICONS = {
    // Same open-book mark as the auth screen, so the brand reads as one thing.
    logo: '<path d="M12 5C10.2 3.6 7.6 3 5 3v13c2.6 0 5.2.6 7 2 1.8-1.4 4.4-2 7-2V3c-2.6 0-5.2.6-7 2Z"/><path d="M12 5v13"/>',
    book: '<path d="M12 7.2C10.4 5.7 8.2 5 6 5H4v13.2h2c2.2 0 4.4.7 6 2.2 1.6-1.5 3.8-2.2 6-2.2h2V5h-2c-2.2 0-4.4.7-6 2.2Z"/><path d="M12 7.2v13.2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8.5 13h7"/><path d="M8.5 17h4"/>',
    heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
    notes: '<path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="2.4" width="8" height="3.6" rx="1.2"/><path d="M8.5 12h7"/><path d="M8.5 16h4.5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.5 2.5 4.7-5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    bolt: '<path d="M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z"/><path d="M9 4h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    offline: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    empty: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m6.08 12-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83L17.9 12"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  };

  function svg(name, size, stroke) {
    var s = size || 18;
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + (stroke || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + (ICONS[name] || "") + "</svg>"
    );
  }

  /* ---------- Nav model — the source of truth for labels and hrefs ---------- */
  function navModel() {
    var t = ZafarI18n.t;
    return [
      { id: "papers", icon: "file", text: t("nav.pastPapers"), href: "dashboard.html" },
      { id: "books", icon: "book", text: t("nav.books"), href: "books.html" },
      { id: "notes", icon: "notes", text: t("nav.notes"), href: "notes.html" },
      { id: "keys", icon: "check", text: t("nav.markingKeys"), href: "marking-keys.html" },
      { id: "favorites", icon: "heart", text: t("nav.favorites"), href: "favorites.html", favCount: true },
    ];
  }

  function tabsHTML(active) {
    return navModel().map(function (entry) {
      var on = entry.id === active;
      return (
        '<a class="tab' + (on ? " active" : "") + '" href="' + entry.href + '"' +
          (on ? ' aria-current="page"' : "") + ">" +
          '<span class="tab-ic">' + svg(entry.icon, 19, on ? 2 : 1.7) + "</span>" +
          "<span>" + entry.text + "</span>" +
          (entry.favCount ? '<span class="pill" data-fav-count style="display:none">0</span>' : "") +
        "</a>"
      );
    }).join("");
  }

  function shellHTML(opts) {
    var t = ZafarI18n.t;
    var title = Zafar.escapeHTML(opts.title || "Zafar");
    var crumb = Zafar.escapeHTML(opts.crumb || t("nav.studyLibrary"));

    return (
      '<header class="app-bar">' +
        '<div class="bar-top">' +
          '<a class="wordmark" href="dashboard.html">' +
            '<span class="glyph">' + svg("logo", 15, 2) + "</span>STUDYMW" +
          "</a>" +
          '<div class="bar-actions">' +
            // Filled in only for an admin: see maybeShowAdminLink().
            '<span data-admin-slot></span>' +
            '<a class="bar-btn bar-btn-wide" href="help.html">' + svg("help", 16) + "<span>Help</span></a>" +
            '<a class="bar-btn" href="login.html" data-logout aria-label="Log out">' + svg("logout", 17) + "</a>" +
          "</div>" +
        "</div>" +
        '<div class="app-head">' +
          '<div class="app-head-text">' +
            '<div class="crumb">' + crumb + "</div>" +
            '<h1 class="app-title">' + title + "</h1>" +
          "</div>" +
          // Filled by the list page when the section has a daily allowance.
          // A live region: the chip appears, counts down and turns into "No
          // papers left" without anyone touching it, so a screen reader has to
          // be told, or the change is invisible to the person it matters most to.
          '<span class="quota" data-quota role="status" aria-live="polite" aria-atomic="true" hidden>' +
            svg("download", 13, 2) + '<span data-quota-text></span></span>' +
        "</div>" +
      "</header>" +
      // The running count lives on the sheet, not in the teal bar: the bar says
      // which page you are on, and every pixel of it is a pixel of list you
      // cannot see. Shown by the list page; hidden on pages that have no list.
      '<main class="sheet">' +
        '<div class="list-meta" data-meta hidden>' +
          '<span class="count" data-count>' + t("list.loading") + "</span>" +
        "</div>" +
        '<div class="content" data-content></div>' +
      "</main>" +
      '<nav class="tabbar" aria-label="Sections">' + tabsHTML(opts.active) + "</nav>" +
      '<div class="toast" data-toast role="status"></div>'
    );
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(msg, icon) {
    var el = document.querySelector("[data-toast]");
    if (!el) return;
    el.innerHTML = svg(icon || "bolt", 15) + "<span>" + Zafar.escapeHTML(msg) + "</span>";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------- Nothing is stored on the phone ----------
     StudyMW used to install a service worker that kept the app's pages and the
     last catalogue answer, so it opened without a connection. It is gone. This
     is a download site: a stored list carried no download links, so it could
     only ever show filenames the phone had no way to fetch. What is left below
     is the clean-up, for phones still carrying a copy from an older version. */
  function retireStoredCopy() {
    try {
      retireNow();
    } catch (error) {
      // Housekeeping is never worth a broken page.
    }
  }

  // Unregister this app's worker and drop its caches.
  //
  // No worker is deployed any more, so a browser that goes looking for one gets
  // a 404 and retires the registration by itself. This does the same from the
  // page side, immediately, and takes the stored pages with it — the caches
  // would otherwise sit on the phone using space for ever.
  function clearWorker() {
    if (!("serviceWorker" in navigator)) return;

    // Only this app's registration. Other apps can share the origin, and their
    // workers are not ours to remove.
    var mine = new URL("sw.js", location.href).href;
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) {
        var workers = [reg.installing, reg.waiting, reg.active];
        var ours = workers.some(function (worker) {
          return worker && worker.scriptURL && worker.scriptURL === mine;
        });
        if (ours) reg.unregister();
      });
    });

    // Prefix-scoped, like the worker's own cleanup: zafar-* only.
    if (window.caches) {
      caches.keys().then(function (names) {
        names.forEach(function (name) {
          if (name.indexOf("zafar-") === 0) caches.delete(name);
        });
      });
    }
  }

  function retireNow() {
    if (!("serviceWorker" in navigator)) return;

    // After load, and never on the path to the first painting.
    var start = function () { clearWorker(); };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }

  /* ---------- Init ---------- */
  // Returns null when the visitor isn't signed in (page is already
  // navigating to login.html), so page scripts can bail out early.
  /* ---------- What the owner says ----------
     GET /site-config is public, cached for a minute, and never fatal: if it
     fails the page is exactly what it was before. Two things come out of it
     here — an announcement strip, and maintenance mode. */

  function showAnnounce(root, text) {
    if (!text) return;
    var dismissed = "";
    try { dismissed = sessionStorage.getItem("zafar_announce_dismissed") || ""; } catch (e) {}
    if (dismissed === text) return;

    var strip = document.createElement("div");
    strip.className = "announce";
    strip.setAttribute("role", "status");
    strip.innerHTML =
      svg("bolt", 15) + '<span class="announce-text"></span>' +
      '<button type="button" class="announce-x" aria-label="Dismiss">&times;</button>';
    strip.querySelector(".announce-text").textContent = text;
    strip.querySelector(".announce-x").addEventListener("click", function () {
      try { sessionStorage.setItem("zafar_announce_dismissed", text); } catch (e) {}
      strip.remove();
    });
    var bar = root.querySelector(".app-bar");
    if (bar && bar.parentNode) bar.parentNode.insertBefore(strip, bar.nextSibling);
  }

  // Maintenance mode is for students, not the people doing the maintenance: an
  // admin keeps working (that is how the flag gets switched off again).
  function showMaintenance(root) {
    root.innerHTML =
      '<div class="maintenance">' +
        '<span class="m-glyph">' + svg("logo", 22, 2) + "</span>" +
        "<h1>StudyMW is being updated</h1>" +
        "<p>The library is briefly closed while we fix something. Nothing of yours is lost — " +
        "your favorites and download allowance are on your account, not this phone.</p>" +
        "<p class=\"m-hint\">Try again in a few minutes.</p>" +
        '<div class="m-actions"><a class="btn btn-ghost btn-sm" href="login.html" data-logout>Log out</a></div>' +
      "</div>";
    var out = root.querySelector("[data-logout]");
    if (out) out.addEventListener("click", function () { Zafar.clearToken(); });
  }

  function applySiteConfig(root) {
    return Zafar.siteConfig().then(function (cfg) {
      if (!cfg) return null;
      showAnnounce(root, cfg.announcement);
      if (!cfg.maintenance) return cfg;
      return Zafar.adminWhoami().then(function (me) {
        if (!me || !me.role) showMaintenance(root);
        return cfg;
      });
    }).catch(function () { return null; });
  }

  /* ---------- Admins can find the admin ----------
     One request per browser session, not per page: /admin/whoami answers 200
     with a role for an admin and 403 for everyone else, and the answer is kept
     in sessionStorage so the bar does not ask again on every tab. A student
     never sees a link to a door they cannot open. */
  function maybeShowAdminLink(root) {
    var cached = null;
    try { cached = sessionStorage.getItem("zafar_admin_role"); } catch (e) {}
    if (cached === "none") return;
    if (cached) return addAdminLink(root, cached);
    Zafar.adminWhoami().then(function (me) {
      var role = me && me.role ? me.role : "none";
      try { sessionStorage.setItem("zafar_admin_role", role); } catch (e) {}
      if (role !== "none") addAdminLink(root, role);
    });
  }

  function addAdminLink(root, role) {
    var slot = root.querySelector("[data-admin-slot]");
    if (!slot || slot.querySelector("a")) return;
    var link = document.createElement("a");
    link.className = "bar-btn bar-btn-wide";
    link.href = "admin.html";
    link.setAttribute("title", "Admin portal (" + role + ")");
    link.innerHTML = svg("grid", 16) + "<span>Admin</span>";
    slot.appendChild(link);
  }

  function init(opts) {
    opts = opts || {};

    if (!Zafar.getToken()) {
      location.href = "login.html";
      return null;
    }

    var root = document.getElementById("app");
    root.className = "app";
    root.innerHTML = shellHTML({
      active: opts.active,
      title: opts.title || "StudyMW",
      crumb: opts.crumb,
    });

    Zafar.updateFavCountPill();
    retireStoredCopy();

    // The announcement and the maintenance flag come from the API, so they are
    // applied when they arrive rather than blocking the first paint.
    var config = applySiteConfig(root);
    maybeShowAdminLink(root);

    root.querySelector("[data-logout]").addEventListener("click", function () {
      // The token is the only thing held here, and it goes with the click. There
      // is no stored catalogue to clear: nothing is cached.
      Zafar.clearToken();
      try { sessionStorage.removeItem("zafar_admin_role"); } catch (e) {}
    });

    // The bar is sticky, so a long page still needs its landmark announced.
    root.querySelector(".app-title").setAttribute("tabindex", "-1");

    return {
      config: config,
      content: root.querySelector("[data-content]"),
      count: root.querySelector("[data-count]"),
      meta: root.querySelector("[data-meta]"),
      quota: root.querySelector("[data-quota]"),
      showToast: showToast,
      svg: svg,
    };
  }

  return { init: init, svg: svg, showToast: showToast };
})();
