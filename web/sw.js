/* ============================================================
   Zafar — service worker
   Two jobs, both about a phone with no bars:

     1. Keep the shell on the device, so tapping the icon opens the
        app instead of the browser's dinosaur.
     2. Keep the last catalogue answer, so a page that has been
        visited still lists its documents with the radio off.

   It is deliberately narrow:
     - only GET is ever intercepted; downloads, sign-in and the
       confirm call pass straight through to the network
     - /auth/* is never cached — an allowance or a token served
       from last week is a lie, not a cache hit
     - from the API, only the catalogue (/drive/papers) is stored

   BUMP `VERSION` ON EVERY DEPLOY that changes anything in web/.
   That string is what retires the old cache: new name, fresh fetch,
   everything else deleted on activate.
   ============================================================ */

var VERSION = "2026-11-09.1";

var SHELL_CACHE = "zafar-shell-" + VERSION;
var DOCS_CACHE = "zafar-docs-" + VERSION;

/* Everything a page needs to render with no network. login.html is here on
   purpose: with no token the shell redirects there, and an uncached sign-in
   screen is a blank screen on a dead connection. */
var SHELL = [
  "dashboard.html",
  "books.html",
  "notes.html",
  "marking-keys.html",
  "favorites.html",
  "help.html",
  "login.html",
  "manifest.webmanifest",
  "assets/css/app.css",
  "assets/css/auth.css",
  "assets/js/config.js",
  "assets/js/i18n.js",
  "assets/js/shell.js",
  "assets/js/list.js",
  "assets/js/auth.js",
  "assets/fonts/instrument-sans.woff2",
  "assets/img/icon.svg",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/apple-touch-icon.png",
];

/* A catalogue answer is a few KB; this cap is about not letting a long
   afternoon of filtering fill the phone's storage. */
var DOCS_MAX = 40;

/* ------------------------------------------------------------
   Install / activate
   ------------------------------------------------------------ */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        // One missing file must not fail the whole install — a single 404
        // would otherwise leave the app with no service worker at all.
        return Promise.all(
          SHELL.map(function (url) {
            return cache.add(new Request(url, { cache: "reload" })).catch(function () {});
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            if (name !== SHELL_CACHE && name !== DOCS_CACHE) return caches.delete(name);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/* ------------------------------------------------------------
   Routes
   ------------------------------------------------------------ */

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return; // let the browser handle anything it cannot parse either
  }

  if (url.origin !== self.location.origin) {
    // The catalogue is the only API answer worth keeping. Quota, tokens and
    // downloads are never touched.
    if (url.pathname.indexOf("/drive/papers") === 0) {
      event.respondWith(safe(catalogueFirst(request), request));
    }
    return;
  }

  // A page load: serve the stored copy, refresh it in the background.
  if (request.mode === "navigate") {
    event.respondWith(safe(pageFirst(request), request));
    return;
  }

  event.respondWith(safe(assetFirst(request), request));
});

/* The worker must never be the reason a page cannot open. If a strategy
   throws — storage refused, a half-written entry, a browser quirk nobody
   predicted — the request goes to the network instead of failing with it.
   A page that loads slowly is a problem; a page that loads not at all is an
   outage, and this is the difference. */
function safe(strategy, request) {
  return Promise.resolve(strategy).catch(function () {
    return fetch(request);
  });
}

/* ------------------------------------------------------------
   Strategies
   ------------------------------------------------------------ */

// Query strings on a page are app state (a search, ?demo=1), not a different
// document — so pages are stored under their path alone.
function pathKey(url) {
  return url.origin + url.pathname;
}

// Cache first: the stylesheet and the font do not change between deploys any
// more than the HTML does. VERSION retires them all at once.
function assetFirst(request) {
  if (typeof caches === "undefined") return fetch(request); // no storage: the network is all there is
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(function () {});
        }
        return response;
      });
    });
  });
}

// Stale-while-revalidate. A cached page paints immediately on a slow
// connection; the next visit gets whatever shipped in between.
function pageFirst(request) {
  if (typeof caches === "undefined") return fetch(request); // no storage: the network is all there is
  var url = new URL(request.url);
  var key = pathKey(url);

  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(key).then(function (hit) {
      if (!hit) return fetch(request);

      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            return cache.put(key, response.clone()).catch(function () {});
          }
        })
        .catch(function () {
          // Offline: the stored copy is already being served.
        });

      return hit;
    });
  });
}

// Network first for the catalogue: fresh lists matter more than instant ones,
// and the stored answer is only for when the network says nothing at all.
function catalogueFirst(request) {
  if (typeof caches === "undefined") return fetch(request); // no storage: the network is all there is
  var url = new URL(request.url);
  var key = url.origin + url.pathname + url.search;

  return caches.open(DOCS_CACHE).then(function (cache) {
    return fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          cache
            .put(key, response.clone())
            .then(function () {
              return trim(cache);
            })
            .catch(function () {});
        }
        return response;
      })
      .catch(function (error) {
        return cache.match(key).then(function (hit) {
          if (hit) return hit;
          throw error; // nothing stored for this exact view — let the page say so
        });
      });
  });
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= DOCS_MAX) return;
    return Promise.all(
      keys.slice(0, keys.length - DOCS_MAX).map(function (key) {
        return cache.delete(key);
      })
    );
  });
}

/* ------------------------------------------------------------
   Messages
   ------------------------------------------------------------ */

// Logging out should leave nothing of the session behind — the shell stays
// installed, the catalogue it was showing does not.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "clear-catalogue") {
    event.waitUntil(caches.delete(DOCS_CACHE));
  }
});
