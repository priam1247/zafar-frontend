/* ============================================================
   Zafar — app shell
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
            '<span class="glyph">' + svg("logo", 15, 2) + "</span>ZAFAR" +
          "</a>" +
          '<div class="bar-actions">' +
            '<a class="bar-btn bar-btn-wide" href="help.html">' + svg("help", 16) + "<span>Help</span></a>" +
            '<a class="bar-btn" href="login.html" data-logout aria-label="Log out">' + svg("logout", 17) + "</a>" +
          "</div>" +
        "</div>" +
        '<div class="app-head">' +
          '<div class="app-head-text">' +
            '<div class="crumb">' + crumb + "</div>" +
            '<h1 class="app-title">' + title + "</h1>" +
            (opts.desc ? '<p class="app-desc">' + Zafar.escapeHTML(opts.desc) + "</p>" : "") +
          "</div>" +
          // Filled by the list page when the section has a daily allowance.
          '<span class="quota" data-quota hidden>' + svg("download", 13, 2) +
            '<span data-quota-text></span></span>' +
        "</div>" +
        '<div class="app-meta"><span class="count" data-count>' + t("list.loading") + "</span></div>" +
      "</header>" +
      '<main class="sheet"><div class="content" data-content></div></main>' +
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

  /* ---------- Installable / offline ----------
     The service worker keeps the shell and the last catalogue on the device,
     so the app opens when the connection does not. It is skipped in the demo:
     server.js rewrites each page as it serves it, and a stored copy would be
     the wrong copy. ?sw=1 forces it on, ?sw=0 removes it and its caches. */
  function registerWorker() {
    if (!("serviceWorker" in navigator)) return;

    var flag = new URLSearchParams(location.search).get("sw");

    if (flag === "0") {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      });
      if (window.caches) {
        caches.keys().then(function (names) {
          names.forEach(function (name) {
            if (name.indexOf("zafar-") === 0) caches.delete(name);
          });
        });
      }
      return;
    }

    var demo = new URLSearchParams(location.search).get("demo") ||
      /^demo\./.test(Zafar.getToken() || "");
    if (demo && flag !== "1") return;

    // Service workers need a secure origin; localhost counts as one.
    var secure = location.protocol === "https:" ||
      location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) return;

    navigator.serviceWorker.register("sw.js").catch(function () {
      // Installing is an enhancement — a failure must never surface.
    });
  }

  /* ---------- Init ---------- */
  // Returns null when the visitor isn't signed in (page is already
  // navigating to login.html), so page scripts can bail out early.
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
      title: opts.title || "Zafar",
      crumb: opts.crumb,
      desc: opts.desc || "",
    });

    Zafar.updateFavCountPill();
    registerWorker();

    root.querySelector("[data-logout]").addEventListener("click", function () {
      Zafar.clearToken();
      // A shared phone should not keep the last account's catalogue in its
      // cache. The shell itself stays installed — that is just the app.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-catalogue" });
      }
    });

    // The bar is sticky, so a long page still needs its landmark announced.
    root.querySelector(".app-title").setAttribute("tabindex", "-1");

    return {
      content: root.querySelector("[data-content]"),
      count: root.querySelector("[data-count]"),
      quota: root.querySelector("[data-quota]"),
      showToast: showToast,
      svg: svg,
    };
  }

  return { init: init, svg: svg, showToast: showToast };
})();
