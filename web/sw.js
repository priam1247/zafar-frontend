/* ============================================================
   Zafar — service worker
   The app opens on a bad connection, and a page that has been visited
   still lists its documents with the radio off.

   Two rules learned the hard way:

     1. NOTHING is served from the cache while the network can answer.
        Pages and static files are network-first; the stored copy is a
        fallback, never the first choice. Serving a stored page as the
        primary answer is how a working site starts reporting "This site
        can't be reached" — one bad stored response and every navigation
        fails at the browser, with no page left to fix it from.

     2. What is stored is re-wrapped, never passed through. A response
        fetched from the network carries content-encoding and
        content-length for the bytes the browser already decoded; storing
        that pair and handing it back later is how a cached page fails to
        load. Entries are written as a fresh Response with only a
        Content-Type.

   The rest of the boundaries:

     - Only GET is intercepted; downloads, sign-in and confirm go straight
       to the network.
     - Routing is by path, before any origin test: /drive/papers gets the
       catalogue treatment wherever it lives, and /auth/* is never cached
       under any origin.
     - Catalogue entries are keyed by a fingerprint of the exact bearer
       token that produced them, so a forged or different credential can
       never read somebody else's offline list.
     - Activation retires only zafar-shell-* and zafar-docs-*.
     - A failed install leaves the previous worker serving.

   Bump VERSION when web/ changes; it retires the old caches.
   ============================================================ */

var VERSION = "2026-11-09.4";

var SHELL_CACHE = "zafar-shell-" + VERSION;
var DOCS_CACHE = "zafar-docs-" + VERSION;

// Only caches with these prefixes belong to this worker.
var OWNED = /^zafar-(shell|docs)-/;

/* Essential: the app cannot open without these. If any one cannot be stored
   the install fails and the previous worker keeps serving. login.html is here
   on purpose: with no token the shell redirects there, and an uncached sign-in
   screen is a blank screen on a dead connection. */
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

// The complete set of paths that may be served from the shell cache.
var STATIC = {};
ESSENTIAL.concat(OPTIONAL).forEach(function (path) {
  if (path.indexOf("assets/") === 0 || path === "manifest.webmanifest") {
    STATIC["/" + path] = true;
  }
});

// Pages we are allowed to keep a copy of. Anything else that navigates — a
// registration page, an index redirect, another app in the same scope — is
// left to the browser, and never stored.
var PAGES = {};
["dashboard.html", "books.html", "notes.html", "marking-keys.html", "favorites.html", "help.html", "login.html"]
  .forEach(function (name) {
    PAGES["/" + name] = true;
  });

// A catalogue answer is a few KB; this cap keeps a long afternoon of
// filtering from filling the phone's storage.
var DOCS_MAX = 40;

/* ------------------------------------------------------------
   Install / activate
   ------------------------------------------------------------ */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        // Essentials must all land, or this install fails and the working
        // cache stays in place.
        return Promise.all([
          Promise.all(ESSENTIAL.map(function (url) {
            return precache(cache, url);
          })),
          Promise.all(OPTIONAL.map(function (url) {
            return precache(cache, url).catch(function () {});
          })),
        ]);
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
   Fetching and storing
   ------------------------------------------------------------ */

function hasStorage() {
  return typeof caches !== "undefined";
}

function contentTypeFor(path) {
  if (/\.css$/.test(path)) return "text/css; charset=utf-8";
  if (/\.js$/.test(path)) return "text/javascript; charset=utf-8";
  if (/\.json$/.test(path)) return "application/json; charset=utf-8";
  if (/\.webmanifest$/.test(path)) return "application/manifest+json; charset=utf-8";
  if (/\.woff2$/.test(path)) return "font/woff2";
  if (/\.svg$/.test(path)) return "image/svg+xml";
  if (/\.png$/.test(path)) return "image/png";
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  return "text/html; charset=utf-8";
}

/* A copy safe to hand back later: the bytes only, with a Content-Type and
   nothing else. Content-Encoding and Content-Length describe the wire, not
   what the browser will read on the way back out. */
function cleanCopy(response, path) {
  return response
    .clone()
    .arrayBuffer()
    .then(function (bytes) {
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": contentTypeFor(path) },
      });
    });
}

function absolute(path) {
  return self.location.origin + path;
}

function precache(cache, path) {
  // Absolute, never relative: a Request built from a bare path depends on the
  // worker's base URL, and an install must not fail over that.
  return fetch(new Request(absolute("/" + path), { cache: "reload" })).then(function (response) {
    if (!response || !response.ok) throw new Error("cannot precache " + path);
    return cleanCopy(response, path).then(function (copy) {
      return cache.put(absolute("/" + path), copy);
    });
  });
}

// Network first, stored copy second. Never the other way round.
function networkFirst(cacheName, path, request) {
  if (!hasStorage()) return fetch(request);

  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        var type = contentTypeFor(path);
        var copy = cleanCopy(response, path);
        caches
          .open(cacheName)
          .then(function (cache) {
            return copy.then(function (clean) {
              return cache.put(absolute(path), clean);
            });
          })
          .catch(function () {});
      }
      return response;
    })
    .catch(function (error) {
      return caches
        .open(cacheName)
        .then(function (cache) {
          return cache.match(absolute(path));
        })
        .then(function (hit) {
          if (!hit) throw error;
          return hit;
        });
    });
}

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
    event.respondWith(
      safe(catalogueFirst(event), request)
    );
    return;
  }

  // Every other API path is somebody else's business — /auth/quota, the
  // download handshake, the confirm call. Never cached, whatever the origin.
  if (/^\/(auth|drive)\//.test(url.pathname)) return;

  if (url.origin !== self.location.origin) return;

  // A page load we own: network first, a stored copy only when the network
  // has nothing to say, and a page of our own when there is not even that.
  // This promise never rejects — a rejected navigation is a browser error
  // screen with no way back into the app.
  if (request.mode === "navigate") {
    if (!PAGES[url.pathname]) return; // not ours to keep
    event.respondWith(pageResponse(url.pathname, request));
    return;
  }

  if (STATIC[url.pathname]) {
    event.respondWith(
      safe(networkFirst(SHELL_CACHE, url.pathname, request), request)
    );
  }
  // Anything else on this origin is not ours to decide about.
});

/* The worker must never be the reason a page cannot open. If a strategy
   throws — storage refused, a half-written entry, a browser quirk — the
   request goes to the network instead of failing with it. */
function safe(strategy, request) {
  return Promise.resolve(strategy).catch(function () {
    return fetch(request);
  });
}

/* A navigation can end three ways, and all three are a page the browser can
   render: the network, the stored copy, or a small offline page of our own.
   There is deliberately no fourth outcome. */
function pageResponse(path, request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.ok && hasStorage()) {
        var copy = cleanCopy(response, path);
        caches
          .open(SHELL_CACHE)
          .then(function (cache) {
            return copy.then(function (clean) {
              return cache.put(absolute(path), clean);
            });
          })
          .catch(function () {});
      }
      return response;
    })
    .catch(function () {
      if (!hasStorage()) return offlineShell();
      return caches
        .open(SHELL_CACHE)
        .then(function (cache) {
          return cache.match(absolute(path));
        })
        .then(function (hit) {
          return hit || offlineShell();
        })
        .catch(function () {
          return offlineShell();
        });
    })
    .catch(function () {
      return offlineShell();
    });
}

// A last resort that is still ZAFAR: no network, no stored copy, but a page
// with the brand and a button that tries again.
function offlineShell() {
  var html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="theme-color" content="#006D7C"><title>ZAFAR — offline</title>' +
    '<style>' +
    'html,body{margin:0;height:100%}' +
    'body{display:grid;place-items:center;background:#006D7C;color:#FAF5E9;' +
    'font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;padding:28px;text-align:center}' +
    '.card{max-width:340px}' +
    'h1{margin:0 0 10px;font-size:22px;letter-spacing:-.02em}' +
    'p{margin:0 0 22px;font-size:14px;line-height:1.5;color:rgba(250,245,233,.72)}' +
    'a{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 22px;' +
    'border-radius:999px;background:#CFEBE1;color:#006D7C;font-weight:650;font-size:14px;' +
    'text-decoration:none}' +
    '</style></head><body><div class="card">' +
    '<h1>ZAFAR can’t load this page</h1>' +
    '<p>You are offline, and this page was never opened on this phone. ' +
    'Anything you have already visited still works.</p>' +
    '<a href="./dashboard.html">Try again</a>' +
    '</div></body></html>';

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* ------------------------------------------------------------
   The catalogue
   ------------------------------------------------------------ */

// The exact credential the request carried. Entries are keyed by a
// fingerprint of it, so a different — or forged — bearer cannot read a copy
// that was stored for somebody else.
function tokenOf(request) {
  var header = request.headers && request.headers.get ? request.headers.get("authorization") : null;
  if (!header) return null;
  var token = header.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

// FNV-1a. A cache namespace, not a secret: it never leaves the device, and it
// is one-way, so the token itself is never written to storage.
function fingerprint(token) {
  var hash = 0x811c9dc5;
  for (var i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return ("0000000" + hash.toString(16)).slice(-8);
}

// A token we cannot date is treated as expired: no offline reading for
// something we cannot show is still valid.
function tokenExpired(token) {
  var parts = token.split(".");
  if (parts.length < 2) return true;
  try {
    var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    var claims = JSON.parse(atob(payload));
    return typeof claims.exp === "number" ? claims.exp * 1000 <= Date.now() : false;
  } catch (error) {
    return true;
  }
}

function catalogueKey(url, token) {
  return (
    url.origin + url.pathname + url.search + (url.search ? "&" : "?") + "_k=" + fingerprint(token)
  );
}

function catalogueFirst(event) {
  var request = event.request;
  if (!hasStorage()) return fetch(request);

  var token = tokenOf(request);
  // No token at all: the network is the only place this answer can come from,
  // and the 401 it returns is what sends the phone back to sign-in.
  if (!token) return fetch(request);

  var key = catalogueKey(new URL(request.url), token);

  return fetch(request)
    .then(function (response) {
      if (response && response.ok && !tokenExpired(token)) {
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
        // The write outlives the response, so the event has to be extended.
        if (event.waitUntil) event.waitUntil(write);
      }
      return response;
    })
    .catch(function (error) {
      // An expired session reads no cache: better a failed request than a
      // list belonging to a session that is over.
      if (tokenExpired(token)) throw error;
      return caches
        .open(DOCS_CACHE)
        .then(function (cache) {
          return cache.match(key);
        })
        .then(function (hit) {
          if (!hit) throw error;
          announceCached(event.clientId, request.url);
          return hit;
        });
    });
}

/* A list served from the copy is not a live list. Tell the tab that asked —
   and only that tab, because another tab's live answer must not be relabelled
   by this one's fallback. */
function announceCached(clientId, url) {
  if (!clientId || !self.clients || !self.clients.get) return;
  var stamp = Date.now();
  self.clients
    .get(clientId)
    .then(function (client) {
      if (!client) return;
      client.postMessage({ type: "zafar-catalogue-cached", url: url, servedAt: stamp });
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

// Logging out — or a 401 — leaves nothing of the session behind: the shell
// stays installed, every stored catalogue answer goes.
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
