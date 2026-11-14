/* ============================================================
   StudyMW — app shell
   Renders the bar, the sheet, the drawer and the bottom tabs for every
   signed-in page from one place, and owns toasts and the auth guard.

   Phone-first, like the auth screen: the bar sticks to the top, the four
   tabs stick to the bottom, and the white sheet scrolls between them.
   Everything a student reads or taps is sized for a thumb: 44px targets,
   24px icons, and one accent colour.
   ============================================================ */

var ZafarShell = (function () {
  /* ---------- Icons ----------
     One family, drawn on the same 24×24 grid with the same 1.8 stroke, so the
     tab bar, the drawer and the cards read as one hand. Sizes are whole
     pixels: a 23.5px icon lands on a half pixel and the phone blurs it. */
  var ICONS = {
    logo: '<path d="M12 5C10.2 3.6 7.6 3 5 3v13c2.6 0 5.2.6 7 2 1.8-1.4 4.4-2 7-2V3c-2.6 0-5.2.6-7 2Z"/><path d="M12 5v13"/>',
    book: '<path d="M12 7.2C10.4 5.7 8.2 5 6 5H4v13.2h2c2.2 0 4.4.7 6 2.2 1.6-1.5 3.8-2.2 6-2.2h2V5h-2c-2.2 0-4.4.7-6 2.2Z"/><path d="M12 7.2v13.2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8.5 13h7"/><path d="M8.5 17h4"/>',
    notes: '<path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="2.4" width="8" height="3.6" rx="1.2"/><path d="M8.5 12h7"/><path d="M8.5 16h4.5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.5 2.5 4.7-5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    bolt: '<path d="M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z"/><path d="M9 4h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    offline: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    empty: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  // Whole pixels only, and geometricPrecision: fractional sizes land on half
  // pixels on a phone and the browser blurs the strokes to hide it.
  function svg(name, size, stroke) {
    var s = Math.round(size || 18);
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + (stroke || 1.8) + '" stroke-linecap="round" ' +
      'stroke-linejoin="round" shape-rendering="geometricPrecision" aria-hidden="true">' +
      (ICONS[name] || "") + "</svg>"
    );
  }

  /* ---------- Nav model — the source of truth for labels and hrefs ----------
     Four sections in the bar, in the order the library is used. Help moved to
     the bar's right-hand button and everything else into the drawer. */
  function navModel() {
    var t = ZafarI18n.t;
    return [
      { id: "books", icon: "book", text: t("nav.books"), href: "books.html" },
      { id: "papers", icon: "file", text: t("nav.pastPapers"), href: "dashboard.html" },
      { id: "notes", icon: "notes", text: t("nav.notes"), href: "notes.html" },
      { id: "keys", icon: "check", text: t("nav.markingKeys"), href: "marking-keys.html" },
    ];
  }

  // The drawer repeats the four sections and adds what has no tab of its own.
  function drawerModel() {
    var t = ZafarI18n.t;
    return navModel().concat([
      { id: "settings", icon: "settings", text: t("nav.settings"), href: "settings.html" },
      { id: "help", icon: "help", text: t("nav.help"), href: "help.html" },
    ]);
  }

  function tabsHTML(active) {
    return navModel().map(function (entry) {
      var on = entry.id === active;
      return (
        '<a class="tab' + (on ? " active" : "") + '" href="' + entry.href + '"' +
          (on ? ' aria-current="page"' : "") + ">" +
          '<span class="tab-ic">' + svg(entry.icon, 24, on ? 2 : 1.8) + "</span>" +
          '<span class="tab-label">' + entry.text + "</span>" +
        "</a>"
      );
    }).join("");
  }

  function drawerHTML(active) {
    var t = ZafarI18n.t;
    return (
      '<div class="drawer" id="app-drawer" data-drawer hidden>' +
        '<div class="drawer-scrim" data-drawer-close></div>' +
        '<aside class="drawer-panel" data-drawer-panel role="dialog" aria-modal="true" aria-labelledby="drawer-name">' +
          '<div class="drawer-profile">' +
            '<span class="avatar avatar-lg" data-avatar aria-hidden="true"></span>' +
            '<div class="drawer-who">' +
              '<h2 id="drawer-name" data-full-name>' + t("shell.student") + "</h2>" +
              '<p data-email></p>' +
            "</div>" +
            // The panel covers the hamburger that opened it, so it carries its
            // own way out at the corner a thumb reaches for.
            '<button type="button" class="drawer-x" data-drawer-close aria-label="' +
              Zafar.escapeHTML(t("shell.closeMenu")) + '">' + svg("close", 20) + "</button>" +
          "</div>" +
          '<nav class="drawer-nav" aria-label="' + Zafar.escapeHTML(t("shell.menu")) + '">' +
            drawerModel().map(function (entry) {
              var on = entry.id === active;
              return (
                '<a class="drawer-link' + (on ? " active" : "") + '" href="' + entry.href + '"' +
                  (on ? ' aria-current="page"' : "") + ">" +
                  svg(entry.icon, 22) + "<span>" + entry.text + "</span></a>"
              );
            }).join("") +
            // Filled in only for an admin: /admin/whoami decides, not the page.
            '<span data-admin-slot></span>' +
          "</nav>" +
          '<div class="drawer-foot">' +
            '<button type="button" class="btn btn-danger-soft" data-logout-open>' +
              svg("logout", 20) + "<span>" + t("shell.logOut") + "</span>" +
            "</button>" +
          "</div>" +
        "</aside>" +
      "</div>" +

      // "Log out?" — the one destructive action a student can reach.
      '<div class="modal" data-logout-modal hidden>' +
        '<div class="modal-scrim" data-logout-cancel></div>' +
        '<div class="modal-card modal-card-sm" role="dialog" aria-modal="true" aria-labelledby="logout-heading">' +
          '<h2 id="logout-heading">' + t("shell.logOutTitle") + "</h2>" +
          '<p class="modal-lede">' + t("shell.logOutBody") + "</p>" +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-danger" data-logout-confirm>' + t("shell.logOut") + "</button>" +
            '<button type="button" class="btn btn-ghost" data-logout-cancel>' + t("shell.cancel") + "</button>" +
          "</div>" +
        "</div>" +
      "</div>" +

      // What the pill in the bar is counting. A sheet, because it is an answer
      // to a question, not a page to go to.
      '<div class="modal" data-quota-modal hidden>' +
        '<div class="modal-scrim" data-quota-close></div>' +
        '<div class="modal-card modal-card-sm" role="dialog" aria-modal="true" aria-labelledby="quota-heading">' +
          '<h2 id="quota-heading">' + t("shell.quotaTitle") + "</h2>" +
          '<p class="modal-lede" data-quota-body></p>' +
          '<p class="modal-fine" data-quota-reset></p>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-ghost" data-quota-close>' + t("shell.gotIt") + "</button>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function shellHTML(opts) {
    var t = ZafarI18n.t;
    var title = Zafar.escapeHTML(opts.title || "StudyMW");

    return (
      // Row one: the way into the menu, who is here, and Help. One line,
      // no wrapping — Help is a door that must stay in the corner.
      '<header class="app-bar" data-bar>' +
        '<div class="bar-row">' +
          '<button type="button" class="bar-circle" data-drawer-open aria-label="' +
            Zafar.escapeHTML(t("shell.openMenu")) + '" aria-haspopup="dialog" aria-expanded="false" ' +
            'aria-controls="app-drawer">' + svg("menu", 24) + "</button>" +
          // A second, larger way in for a thumb. It repeats the hamburger, so
          // a screen reader and the tab order skip it and keep one menu button.
          '<button type="button" class="avatar" data-drawer-open data-avatar aria-hidden="true" ' +
            'tabindex="-1">MW</button>' +
          '<span class="me-hi" data-greeting></span>' +
          '<a class="bar-circle" href="help.html" aria-label="' + Zafar.escapeHTML(t("nav.help")) +
            '" title="' + Zafar.escapeHTML(t("nav.help")) + '">' + svg("help", 24) + "</a>" +
        "</div>" +
        // Row two: the section, and (on Books) what is left of its allowance.
        '<div class="bar-row bar-row-title">' +
          '<h1 class="app-title">' + title + "</h1>" +
          // Filled by the list page from /auth/quota — the server's number, not
          // a constant. A live region: it counts down and turns amber then red
          // without anyone touching it.
          // The live region is the text inside, not the button: role="status"
          // on a button would replace its button role, and the pill would stop
          // being announced as something you can tap.
          '<button type="button" class="quota" data-quota hidden>' +
            '<span class="quota-dot" aria-hidden="true"></span>' +
            '<span data-quota-text role="status" aria-live="polite" aria-atomic="true"></span>' +
          "</button>" +
          "</div>" +
      "</header>" +

      '<main class="sheet">' +
        // A list page puts its own count above the sort control, in the flow
        // of the page. Settings and Help have no list, so they get this line.
        (opts.lede
          ? '<div class="list-meta"><span class="count" data-count></span></div>'
          : "") +
        '<div class="content" data-content></div>' +
      "</main>" +

      '<nav class="tabbar" aria-label="' + Zafar.escapeHTML(t("shell.sections")) + '">' +
        tabsHTML(opts.active) +
      "</nav>" +

      drawerHTML(opts.active) +
      '<div class="toast" data-toast role="status"></div>'
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

  function clearWorker() {
    if (!("serviceWorker" in navigator)) return;
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
    var start = function () { clearWorker(); };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }

  /* ---------- What the owner says ----------
     GET /site-config is public, cached for a minute, and never fatal: if it
     fails the page is exactly what it was before. */
  function showAnnounce(root, text) {
    if (!text) return;
    var dismissed = "";
    try { dismissed = sessionStorage.getItem("zafar_announce_dismissed") || ""; } catch (e) {}
    if (dismissed === text) return;

    var strip = document.createElement("div");
    strip.className = "announce";
    strip.setAttribute("role", "status");
    strip.innerHTML =
      svg("bolt", 16) + '<span class="announce-text"></span>' +
      '<button type="button" class="announce-x" aria-label="Dismiss">&times;</button>';
    strip.querySelector(".announce-text").textContent = text;
    strip.querySelector(".announce-x").addEventListener("click", function () {
      try { sessionStorage.setItem("zafar_announce_dismissed", text); } catch (e) {}
      strip.remove();
    });
    var bar = root.querySelector(".app-bar");
    if (bar && bar.parentNode) bar.parentNode.insertBefore(strip, bar.nextSibling);
  }

  // Maintenance is for students, not the people doing the maintenance: an
  // admin keeps working (that is how the flag gets switched off again).
  function showMaintenance(root) {
    root.innerHTML =
      '<div class="maintenance">' +
        '<span class="m-glyph">' + svg("logo", 24, 2) + "</span>" +
        "<h1>StudyMW is being updated</h1>" +
        "<p>The library is briefly closed while we fix something. Nothing of yours is lost — " +
        "your downloads and your allowance are on your account, not this phone.</p>" +
        '<p class="m-hint">Try again in a few minutes.</p>' +
        '<div class="m-actions"><button type="button" class="btn btn-ghost btn-sm" data-maintenance-out>' +
          ZafarI18n.t("shell.logOut") + "</button></div>" +
      "</div>";
    var out = root.querySelector("[data-maintenance-out]");
    if (out) out.addEventListener("click", function () {
      Zafar.signOut();
      location.href = "login.html";
    });
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
     One request per browser session, not per page. The entry lives in the
     drawer now: the bar has one button, and it is Help. */
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
    link.className = "drawer-link drawer-link-admin";
    link.href = "admin.html";
    link.innerHTML = svg("grid", 22) + "<span>" + ZafarI18n.t("nav.admin") +
      '<em class="drawer-role">' + Zafar.escapeHTML(role) + "</em></span>";
    slot.appendChild(link);
  }

  /* ---------- The drawer ----------
     Slides in from the left over the page, closes on the overlay, on Escape,
     on a link, and on a rightwards swipe of the panel itself — a phone habit
     worth honouring. Focus moves into the panel and comes back to the avatar
     when it closes. */
  function wireDrawer(root) {
    var drawer = root.querySelector("[data-drawer]");
    var panel = root.querySelector("[data-drawer-panel]");
    // The hamburger and the avatar both open it. Neither is special, so both
    // are kept in step: aria-expanded describes the drawer, not the button.
    var openers = Array.prototype.slice.call(root.querySelectorAll("[data-drawer-open]"));
    var lastFocus = null;
    var open = false;
    var closeTimer = null;

    // Swipe state, in CSS pixels.
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dragging = false;

    function setOpen(next) {
      open = next;
      // A fast toggle reopens while the close animation is still pending: that
      // timer must not run on and hide a drawer the person just opened.
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
      if (next) {
        drawer.hidden = false;
        lastFocus = document.activeElement;
        // Next frame, so the transition runs from the off-screen position.
        requestAnimationFrame(function () { drawer.classList.add("is-open"); });
        openers.forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
        var first = panel.querySelector("a, button");
        if (first) first.focus();
      } else {
        drawer.classList.remove("is-open");
        panel.style.transform = "";
        openers.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
        var back = lastFocus;
        closeTimer = setTimeout(function () {
          closeTimer = null;
          drawer.hidden = true;
          if (back && back.focus) back.focus();
        }, 220);
      }
    }

    // Tapping the hamburger twice is open then close: the same control, the
    // same place, and no hunting for an X behind a dimmed page.
    openers.forEach(function (b) {
      b.addEventListener("click", function () { setOpen(!open); });
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-drawer-close]") || e.target.closest(".drawer-link")) setOpen(false);
    });

    // Tab stays inside the drawer while it is open: it covers the page, and a
    // keyboard that wanders behind it is a keyboard on nothing.
    panel.addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || !open) return;
      var stops = panel.querySelectorAll('a[href], button:not([disabled])');
      if (!stops.length) return;
      var first = stops[0];
      var last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Escape closes the drawer and both sheets.
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (open) setOpen(false);
      closeAllSheets(root);
    });

    // Swipe right to dismiss. Only horizontally-dominant gestures are taken,
    // so a vertical scroll inside the drawer still scrolls.
    panel.addEventListener("pointerdown", function (e) {
      if (!open || e.pointerType === "mouse") return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      panel.style.transition = "none";
    });
    panel.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var moveX = e.clientX - startX;
      var moveY = e.clientY - startY;
      if (Math.abs(moveY) > Math.abs(moveX) + 8) {
        // A scroll, not a swipe: give it back.
        dragging = false;
        panel.style.transition = "";
        panel.style.transform = "";
        return;
      }
      dx = Math.max(0, moveX);
      panel.style.transform = "translateX(" + dx + "px)";
    });
    function endSwipe() {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = "";
      if (dx > 72) setOpen(false);
      else panel.style.transform = "";
    }
    panel.addEventListener("pointerup", endSwipe);
    panel.addEventListener("pointercancel", endSwipe);

    return { close: function () { if (open) setOpen(false); } };
  }

  /* ---------- Bottom sheets ---------- */
  function openSheet(root, selector) {
    var sheet = root.querySelector(selector);
    if (!sheet) return null;
    sheet.hidden = false;
    var card = sheet.querySelector(".modal-card");
    return card;
  }

  function closeAllSheets(root) {
    ["[data-logout-modal]", "[data-quota-modal]"].forEach(function (sel) {
      var node = root.querySelector(sel);
      if (node && !node.hidden) node.hidden = true;
    });
  }

  /* ---------- The header's two lines ----------
     "Hi, Priam" over the full name; the avatar shows initials until a real
     photo exists (the API has no photo field yet). */
  function paintProfile(root) {
    var first = Zafar.firstName();
    var greeting = root.querySelector("[data-greeting]");
    var emailSlot = root.querySelector("[data-email]");
    var fullSlot = root.querySelector("[data-full-name]");
    var me = Zafar.getMe();

    if (greeting) greeting.textContent = first ? ZafarI18n.t("shell.greeting", first) : ZafarI18n.t("shell.greetingNobody");
    if (fullSlot) fullSlot.textContent = Zafar.fullName();
    if (emailSlot) emailSlot.textContent = me.email || ZafarI18n.t("shell.noEmail");

    root.querySelectorAll("[data-avatar]").forEach(function (node) {
      node.textContent = Zafar.initials();
    });
  }

  /* ---------- Header shrinks a little on scroll ----------
     Not a fixed height that changes: the whole point is that the list gets a
     few more lines as soon as the person starts reading. */
  function wireBar(root) {
    var bar = root.querySelector("[data-bar]");
    if (!bar) return;
    var ticking = false;
    function apply() {
      ticking = false;
      bar.classList.toggle("is-slim", (window.scrollY || 0) > 12);
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  }

  /* ---------- The allowance sheet ----------
     The pill is a question ("3 books left? until when?"); this is the answer.
     The copy comes from the list page, which is the only place that knows the
     section's limit and what the server last said. */
  var quotaCopy = null;
  function setQuotaSheet(copy) {
    quotaCopy = copy;
  }

  function wireQuotaSheet(root) {
    var pill = root.querySelector("[data-quota]");
    var modal = root.querySelector("[data-quota-modal]");
    if (!pill || !modal) return;
    var body = modal.querySelector("[data-quota-body]");
    var reset = modal.querySelector("[data-quota-reset]");

    pill.addEventListener("click", function () {
      var copy = quotaCopy || {};
      if (body) body.textContent = copy.body || "";
      if (reset) reset.textContent = copy.reset || ZafarI18n.t("shell.quotaReset");
      openSheet(root, "[data-quota-modal]");
    });
    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-quota-close]")) modal.hidden = true;
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
      title: opts.title || "StudyMW",
      lede: opts.lede,
    });

    paintProfile(root);
    retireStoredCopy();
    wireBar(root);
    wireQuotaSheet(root);

    var drawer = wireDrawer(root);

    // Closing a sheet puts the keyboard back where it was, and click-away is
    // the same gesture people already use for the drawer.
    var logoutModal = root.querySelector("[data-logout-modal]");
    var logoutOpener = null;
    var logoutButton = root.querySelector("[data-logout-open]");
    logoutButton && logoutButton.addEventListener("click", function () {
      logoutOpener = logoutButton;
      drawer.close();
      openSheet(root, "[data-logout-modal]");
    });
    logoutModal.addEventListener("click", function (e) {
      if (e.target.closest("[data-logout-cancel]")) {
        logoutModal.hidden = true;
        if (logoutOpener) logoutOpener.focus();
      }
      if (e.target.closest("[data-logout-confirm]")) {
        Zafar.signOut();
        location.href = "login.html";
      }
    });

    // The announcement and the maintenance flag come from the API, so they are
    // applied when they arrive rather than blocking the first paint.
    var config = applySiteConfig(root);
    maybeShowAdminLink(root);

    // The bar is sticky, so a long page still needs its landmark announced.
    var title = root.querySelector(".app-title");
    if (title) title.setAttribute("tabindex", "-1");

    var count = root.querySelector("[data-count]");
    if (count && opts.lede) count.textContent = opts.lede;

    return {
      config: config,
      content: root.querySelector("[data-content]"),
      count: count,
      quota: root.querySelector("[data-quota]"),
      setQuotaSheet: function (copy) { setQuotaSheet(copy); },
      showToast: showToast,
    };
  }

  return { init: init, svg: svg };
})();
