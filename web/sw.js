/* ============================================================
   Zafar — service worker
   Two jobs, both about a phone with no bars:

     1. Keep the shell on the device, so tapping the icon opens the
        app instead of the browser's dinosaur.
     2. Keep the last catalogue answer, so a page that has been
        visited still lists its documents with the radio off.

   The rules that matter:

     - Only GET is intercepted. Downloads, sign-in and the confirm
       call pass straight through to the network.
     - Cache-first applies to an explicit list of static files, and to
       nothing else. Anything else on this origin — including a
       backend reached through ?api — is left alone.
     - The catalogue (/drive/papers) is handled by path, on whatever
       origin it lives, and is never stored without an account to
       attach it to: entries are keyed by the token's subject, skipped
       once that token has expired, and dropped on logout.
     - /auth/* is never cached. An allowance served from last week is
       a lie, not a cache hit.
     - When a stored catalogue answer is served, the page is told, so
       it can label the list instead of passing it off as live.
     - Activation retires only this worker's own caches. Another app
       on the same origin keeps everything it had.

   BUMP `VERSION` ON EVERY DEPLOY that changes anything in web/.
   Pages and static files are both cache-first, so a bump moves the
   whole app at once — a missed bump leaves the whole app as it was,
   consistently, rather than new HTML running yesterday's scripts.
   ============================================================ */

var VERSION = "2026-11-09.3";

var SHELL_CACHE = "zafar-shell-" + VERSION;
var DOCS_CACHE = "zafar-docs-" + VERSION;

// Only caches with these prefixes belong to this worker, and only those are
// ever deleted on activate.
var OWNED = /^zafar-(shell|docs)-/;

/* Essential: the app cannot open without these. If any one of them cannot be
   stored, the install fails and the previous worker keeps serving — a phone
   gets a stale app, never a broken one. login.html is here on purpose: with no
   token the shell redirects there, and an uncached sign-in screen is a blank
   screen on a dead connection. */
var ESSENTIAL = [
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
];

/* Optional: fetched by the operating system when it installs the app, not by
   the app itself. Worth caching, never worth failing an install over. */
var OPTIONAL = [
  "assets/img/icon.svg",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/apple-touch-icon.png",
];

// The complete set of paths that may be served cache-first.
var STATIC = {};
ESSENTIAL.concat(OPTIONAL).forEach(function (path) {
  if (path.indexOf("assets/") === 0 || path === "manifest.webmanifest") {
    STATIC["/" + path] = true;
  }
});

// A catalogue answer is a few KB; this cap is about not letting a long
// afternoon of filtering fill the phone's storage.
var DOCS_MAX = 40;

/* ------------------------------------------------------------
   Install / activate
   ------------------------------------------------------------ */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        var required = ESSENTIAL.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" }));
        });
        var bonus = OPTIONAL.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" })).catch(function () {});
        });
        // Promise.all on the essentials: one failure aborts the install, so
        // the working cache stays in place instead of being replaced by a
        // half-filled one.
        return Promise.all([Promise.all(required), Promise.all(bonus)]);
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
            if (name === SHELL_CACHE || name === DOCS_CACHE) return;
            if (OWNED.test(name)) return caches.delete(name);
            // Someone else's cache. Not ours to tidy.
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

  // The catalogue first, before any origin test: with ?api pointing at this
  // same host it is still a catalogue, and it gets the catalogue treatment.
  if (url.pathname.indexOf("/drive/papers") === 0) {
    event.respondWith(safe(catalogueFirst(event), request));
    return;
  }

  // Every other API path is somebody else's business — /auth/quota, the
  // download handshake, the confirm call. Never cached, whatever the origin.
  if (/^\/(auth|drive)\//.test(url.pathname)) return;

  if (url.origin !== self.location.origin) return;

  // Pages and the listed static files are both cache-first, so the markup and
  // the scripts it loads always come from the same deploy.
  if (request.mode === "navigate") {
    event.respondWith(safe(cacheFirst(SHELL_CACHE, request), request));
    return;
  }

  if (STATIC[url.pathname]) {
    event.respondWith(safe(cacheFirst(SHELL_CACHE, request), request));
  }
  // Anything else on this origin is not ours to decide about.
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

function hasStorage() {
  return typeof caches !== "undefined";
}

function cacheFirst(name, request) {
  if (!hasStorage()) return fetch(request);
  return caches.open(name).then(function (cache) {
    return cache.match(request, { ignoreSearch: request.mode === "navigate" }).then(function (hit) {
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

// Who is asking, and is that session still good? The catalogue is only ever
// stored and served for a named account with a live token.
function sessionOf(request) {
  var header = request.headers && request.headers.get ? request.headers.get("authorization") : null;
  if (!header) return null;
  var token = header.replace(/^Bearer\s+/i, "").trim();

  var parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    var claims = JSON.parse(atob(payload));
    return {
      sub: String(claims.sub || ""),
      expired: typeof claims.exp === "number" ? claims.exp * 1000 <= Date.now() : false,
    };
  } catch (error) {
    return null;
  }
}

// Entries carry the account in the key, so one student's list can never be
// handed to the next account to sign in on the same phone.
function catalogueKey(url, sub) {
  return (
    url.origin + url.pathname + url.search + (url.search ? "&" : "?") + "_sub=" + encodeURIComponent(sub)
  );
}

function catalogueFirst(event) {
  var request = event.request;
  if (!hasStorage()) return fetch(request);

  var session = sessionOf(request);
  // No token, or one that has already expired: the network is the only place
  // this answer can come from, and the 401 it returns is what sends the phone
  // back to the sign-in screen.
  if (!session || !session.sub || session.expired) return fetch(request);

  var key = catalogueKey(new URL(request.url), session.sub);

  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        var write = caches
          .open(DOCS_CACHE)
          .then(function (cache) {
            return cache
              .put(key, copy)
              .then(function () {
                return trim(cache);
              })
              .catch(function () {});
          })
          .catch(function () {});
        // The write outlives the response, so the event has to be extended or
        // the worker can be shut down before the entry lands.
        if (event.waitUntil) event.waitUntil(write);
      }
      return response;
    })
    .catch(function (error) {
      return caches
        .open(DOCS_CACHE)
        .then(function (cache) {
          return cache.match(key);
        })
        .then(function (hit) {
          if (!hit) throw error;
          announceCached(request.url);
          return hit;
        });
    });
}

// A list served from the copy is not a live list. Say so, and let the page
// label itself — navigator.onLine is not enough, because a captive portal or
// a backend outage leaves the radio on and the network useless.
function announceCached(url) {
  if (!self.clients || !self.clients.matchAll) return;
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then(function (list) {
      list.forEach(function (client) {
        try {
          client.postMessage({ type: "zafar-catalogue-cached", url: url });
        } catch (error) {}
      });
    })
    .catch(function () {});
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

// Logging out — or a 401 — should leave nothing of the session behind: the
// shell stays installed, every stored catalogue answer goes.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "clear-catalogue") {
    event.waitUntil(
      caches.keys().then(function (names) {
        return Promise.all(
          names.map(function (name) {
            if (name.indexOf("zafar-docs-") === 0) return caches.delete(name);
          })
        );
      })
    );
  }
});
