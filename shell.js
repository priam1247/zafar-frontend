// Shared chrome for every page behind the sidebar/top-bar shell:
// home.html, dashboard.html, favorites.html, books.html, notes.html,
// marking-keys.html, help.html.
// Handles the auth guard, sidebar open/close + dropdowns, dark mode,
// logout, the toast helper, and highlighting which nav item is "active"
// based on the current page + ?category=. Page-specific content (the
// paper list, quota, search) lives in content.js + each page's own
// thin script.
var ZafarShell = (function () {
  function init() {
    // Auth guard: no token, no page.
    if (!Zafar.getToken()) {
      window.location.href = 'login.html';
      return null;
    }

    // Sidebar "Favorites" count pill — reflects how many papers are
    // bookmarked right now, on every page (updated again whenever a
    // bookmark is toggled, from content.js).
    Zafar.updateFavCountPill();

    var logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', function (e) {
        e.preventDefault();
        Zafar.clearToken();
        window.location.href = 'login.html';
      });
    }

    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('overlay');
    var hamburger = document.getElementById('hamburger-btn');
    var closeBtn = document.getElementById('close-btn');

    function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('active'); }
    function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('active'); }

    if (hamburger) hamburger.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Dropdown sections (Books, Past Papers, MANEB)
    document.querySelectorAll('.dropdown-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var target = document.getElementById(this.dataset.target);
        var chevron = this.querySelector('.chevron');
        if (target) target.classList.toggle('open');
        if (chevron) chevron.classList.toggle('rotated');
      });
    });

    // Auto-close sidebar when an actual destination is picked.
    document.querySelectorAll('.nav-item:not(.dropdown-toggle), .sub-item:not(.dropdown-toggle), .sub-sub-item').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });

    // Dark mode — synced to the persisted state on load, saved on toggle.
    var THEME_KEY = 'zafar_dark_mode';
    var themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
      var isDark = localStorage.getItem(THEME_KEY) === 'true';
      document.body.classList.toggle('dark-mode', isDark);
      themeSwitch.classList.toggle('on', isDark);

      themeSwitch.addEventListener('click', function () {
        var nowDark = !document.body.classList.contains('dark-mode');
        document.body.classList.toggle('dark-mode', nowDark);
        this.classList.toggle('on', nowDark);
        localStorage.setItem(THEME_KEY, String(nowDark));
      });
    }

    // Highlight which sidebar entry matches the page we're actually on,
    // instead of a hardcoded "active"/"open" baked into the HTML.
    var page = (window.location.pathname.split('/').pop() || 'dashboard.html');
    var category = new URLSearchParams(window.location.search).get('category');

    document.querySelectorAll('#sidebar a[href]').forEach(function (link) {
      var url = new URL(link.getAttribute('href'), window.location.href);
      var linkPage = url.pathname.split('/').pop();
      var linkCategory = new URLSearchParams(url.search).get('category');
      var isMatch = linkPage === page && (linkCategory || null) === (category || null);
      link.classList.toggle('active', isMatch);
      if (isMatch) {
        // Open every ancestor submenu so the active item is visible.
        var el = link;
        while (el && el !== document.body) {
          if (el.classList && el.classList.contains('sub-list')) el.classList.add('open');
          if (el.classList && el.classList.contains('sub-sub-list')) el.classList.add('open');
          el = el.parentElement;
        }
      }
    });

    // Toast helper — shared by every page's content script.
    var toast = document.getElementById('toast');
    function showToast(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 2200);
    }

    return { showToast: showToast, closeSidebar: closeSidebar };
  }

  return { init: init };
})();
