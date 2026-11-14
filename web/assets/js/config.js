/* ============================================================
   StudyMW — shared config + API client
   ============================================================ */

// Base URL of the deployed backend (the zafar-backend FastAPI app).
// A local page may point at another backend with ?api=http://..., which is
// how the app is developed against a laptop server. Anywhere else the
// parameter is ignored: honouring it on the live site would let a link such
// as notes.html?api=https://elsewhere send the student's login token to a
// host we do not control.
var API_BASE_URL = "https://bloody-brigitta-ahzafar-de9b1709.koyeb.app";

// Daily allowances: one bucket per section, counted separately.
//   papers        10 a day
//   books          3 a day
//   notes          3 a day
//   marking keys  10 a day
// The window is a UTC calendar day: every bucket refills at 00:00 UTC, not 24
// hours after a first download. The chips, the help page and the FAQ all say
// so.
//
// /auth/quota reports each section's real limit (they are env settings on the
// server, DAILY_*_LIMIT). Nothing in the app carries a copy of those numbers:
// a limit nobody measured is not a limit, and a copy would be wrong the day an
// administrator changes one.

// The section key in the API is not always the field prefix in /auth/quota:
// the section is "marking-keys", the four numbers are "marking_keys_*".
var QUOTA_FIELD = {
  papers: "papers",
  books: "books",
  notes: "notes",
  "marking-keys": "marking_keys",
};

// Display order for "what is still available" in the spent-allowance notice.
var QUOTA_SECTIONS = ["papers", "books", "notes", "marking-keys"];

// Google sign-in. This is the OAuth "Web application" client ID; it is public
// by design (it is in this file, in the page, for anyone to read). The client
// SECRET is not used by this flow and must never appear in this repository —
// the browser sends Google's signed ID token and the backend verifies it with
// Google's keys, so there is nothing for a secret to do here.
//
// Empty means no button at all: a button that cannot work is worse than no
// button. A value that is not a real client ID (they always end in
// .apps.googleusercontent.com) is treated as empty for the same reason.
//
// What this ID needs on the other side:
//   1. Google Cloud console -> APIs & Services -> Credentials -> this OAuth
//      client -> Authorised JavaScript origins must list
//      https://studymw.netlibrary.dpdns.org and http://localhost:4173.
//   2. The API deployment must set GOOGLE_CLIENT_ID to the same value and serve
//      POST /auth/google — it answers 503 google_not_configured until it does,
//      which the card reports in plain words and then steps aside.
// If the client is ever replaced, change it in both places in the same deploy.
var GOOGLE_CLIENT_ID = "511934392016-ehg3o0pfejjr9qhavvhj1uoo3aoq7knm.apps.googleusercontent.com";

// The admin's WhatsApp number in international format — digits only,
// country code included, no "+" (e.g. "265991234567"). Leave empty to
// hide the "Still stuck?" contact card on the Help page.
var SUPPORT_WHATSAPP = "";

(function () {
  var override = new URLSearchParams(location.search).get("api");
  if (!override) return;
  var host = location.hostname;
  var local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  var target = null;
  try { target = new URL(override); } catch (e) { target = null; }
  if (!local || !target || (target.protocol !== "http:" && target.protocol !== "https:")) {
    console.warn("StudyMW: ?api= is only honoured on a local page — ignoring it.");
    return;
  }
  API_BASE_URL = target.origin + target.pathname.replace(/\/+$/, "");
})();

var Zafar = {
  TOKEN_KEY: "zafar_token",
  ME_KEY: "zafar_me",
  RECENT_DOWNLOADS_KEY: "zafar_recent_downloads",
  RECENT_DOWNLOADS_MAX: 40,
  // Where signing in lands. The library opens on Books.
  HOME: "books.html",
  /* ---------- Token -------------------------------------------------- */
  // Remember Me on  -> localStorage (survives closing the browser)
  // Remember Me off -> sessionStorage (cleared when the tab closes)
  getToken: function () {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
  },
  setToken: function (token, remember) {
    if (remember) {
      sessionStorage.removeItem(this.TOKEN_KEY);
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.setItem(this.TOKEN_KEY, token);
    }
  },
  clearToken: function () {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.ME_KEY);
  },

  // One way out, used by the sidebar. What the app remembers about the person
  // (their name for the greeting, and which account is admin) goes with the
  // token, or the next account on this phone inherits it.
  signOut: function () {
    this.clearToken();
    try { sessionStorage.removeItem("zafar_admin_role"); } catch (e) {}
    try { sessionStorage.removeItem("zafar_site_config"); } catch (e) {}
  },

  /* ---------- Who is signed in ---------------------------------------
     The API has no student profile route (GET /admin/whoami is admins only),
     so the greeting is built from what the sign-in itself already told us:
     the email from the form, or the name and email inside the Google ID token
     the browser just received. It is display only — never an authorization
     decision, which the token's own claims and the API's role check settle. */
  setMe: function (info) {
    if (!info) return;
    var current = this.getMe();
    var next = {
      email: info.email || current.email || "",
      name: info.name || current.name || "",
    };
    try { localStorage.setItem(this.ME_KEY, JSON.stringify(next)); } catch (e) {}
  },
  getMe: function () {
    try {
      return JSON.parse(localStorage.getItem(this.ME_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  },
  // "Priam" from "Priam Zafar", or from priam@gmail.com when there is no name:
  // the local part, tidied — "priam1247" reads as "Priam".
  firstName: function () {
    var me = this.getMe();
    if (me.name) return String(me.name).trim().split(/\s+/)[0];
    var local = String(me.email || "").split("@")[0];
    var cleaned = local.replace(/[._-]+/g, " ").replace(/[0-9]+$/, "").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).split(" ")[0].toLowerCase();
  },
  fullName: function () {
    var me = this.getMe();
    if (me.name) return String(me.name).trim();
    var first = this.firstName();
    return first || "Student";
  },
  initials: function () {
    var me = this.getMe();
    var source = (me.name || "").trim();
    if (source) {
      var parts = source.split(/\s+/).filter(Boolean);
      var first = parts[0] ? parts[0][0] : "";
      var last = parts.length > 1 ? parts[parts.length - 1][0] : "";
      return (first + last).toUpperCase();
    }
    var word = this.firstName();
    return word ? word.slice(0, 1).toUpperCase() : "S";
  },

  /* ---------- What the token already told us -------------------------
     A JWT's middle segment, decoded and parsed. Never an auth decision — the
     server verifies the signature — only what the token carries: the account's
     subject (a generated username, e.g. "john2", used purely as a storage-key
     namespace) and, after Google sign-in, the name and address. Returns null
     for anything that is not a readable token. */
  jwtPayload: function (token) {
    try {
      var payload = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch (e) {
      return null;
    }
  },

  // Recent downloads are per-account, not per-device: two accounts sharing a
  // browser must never see each other's data.
  _currentUserSuffix: function () {
    var claims = this.jwtPayload(this.getToken() || "");
    return (claims && claims.sub) || "anon";
  },

  // One-time migration: the first version of this app stored downloads under
  // one shared key for every account on the device. Each key is looked at once
  // per page, not on every read. (Bookmarks are gone; a phone still holding
  // the old list simply never reads that key again.)
  _migrated: {},
  _migrateLegacyKey: function (legacyKey, scopedKey) {
    if (this._migrated[legacyKey]) return;
    this._migrated[legacyKey] = true;
    // A phone that refuses storage (a locked-down browser, a full quota)
    // throws on every one of these. History is a convenience; it is never
    // worth a broken download.
    try {
      var legacy = localStorage.getItem(legacyKey);
      if (legacy !== null && localStorage.getItem(scopedKey) === null) {
        localStorage.setItem(scopedKey, legacy);
      }
      localStorage.removeItem(legacyKey);
    } catch (e) {}
  },

  /* ---------- Recent downloads (local history) ------------------------ */
  // Reads and writes here are wrapped because they run *after* a file has
  // landed on the phone: an exception on the way to the badge would otherwise
  // be reported as a failed download of a file the student is looking at.
  recordDownload: function (item) {
    try {
      var list = this.getRecentDownloads();
      list.unshift({
        id: item.id || "",
        name: item.name || "Document",
        category: item.category || "",
        section: item.section || "",
        at: new Date().toISOString(),
      });
      if (list.length > this.RECENT_DOWNLOADS_MAX) list = list.slice(0, this.RECENT_DOWNLOADS_MAX);
      localStorage.setItem(
        this.RECENT_DOWNLOADS_KEY + "_" + this._currentUserSuffix(),
        JSON.stringify(list)
      );
    } catch (e) {}
  },
  getRecentDownloads: function (limit) {
    var scopedKey = this.RECENT_DOWNLOADS_KEY + "_" + this._currentUserSuffix();
    this._migrateLegacyKey(this.RECENT_DOWNLOADS_KEY, scopedKey);
    var list;
    try {
      list = JSON.parse(localStorage.getItem(scopedKey) || "[]");
    } catch (e) {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    return limit ? list.slice(0, limit) : list;
  },
  /* ---------- Confirmations that outlive the page --------------------- */
  // The backend counts a download permanently only once POST /drive/confirm
  // says the bytes arrived; until then the reservation expires and the
  // allowance climbs back. That one request can be lost — a dropped
  // connection, a tab closed mid-download, a phone that sleeps — and nothing
  // used to send it again, so the count quietly went back up. The ids wait on
  // the phone until the server has accepted them. Confirming twice is safe
  // (the endpoint is idempotent), so a duplicate costs nothing.
  PENDING_CONFIRM_KEY: "zafar_pending_confirms",
  PENDING_CONFIRM_MAX: 20,

  _pendingKey: function () {
    return this.PENDING_CONFIRM_KEY + "_" + this._currentUserSuffix();
  },

  pendingConfirms: function () {
    try {
      var list = JSON.parse(localStorage.getItem(this._pendingKey()) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  },

  _savePending: function (list) {
    try {
      localStorage.setItem(this._pendingKey(), JSON.stringify(list.slice(-this.PENDING_CONFIRM_MAX)));
    } catch (e) {}
  },

  queueConfirm: function (downloadId) {
    if (downloadId == null || downloadId === "") return;
    var list = this.pendingConfirms();
    if (list.indexOf(downloadId) === -1) list.push(downloadId);
    this._savePending(list);
  },

  dropConfirm: function (downloadId) {
    this._savePending(this.pendingConfirms().filter(function (id) { return id !== downloadId; }));
  },

  // One confirmation. Forgotten once the server has answered — including with
  // a 4xx, which is an answer too: an id the server will never accept must not
  // be retried on every visit for the rest of the day.
  confirmDownload: function (downloadId) {
    var self = this;
    return this.authPostJSON("/drive/confirm/" + encodeURIComponent(downloadId))
      .then(function (data) {
        self.dropConfirm(downloadId);
        return data;
      })
      .catch(function (err) {
        if (err && err.status && err.status < 500) self.dropConfirm(downloadId);
        throw err;
      });
  },

  // Everything still waiting from an earlier visit, one at a time. Resolves to
  // how many the server accepted.
  flushConfirms: function () {
    var self = this;
    var waiting = this.pendingConfirms();
    var sent = 0;
    return waiting
      .reduce(function (chain, id) {
        return chain.then(function () {
          return self.confirmDownload(id).then(
            function () { sent += 1; },
            function () {}
          );
        });
      }, Promise.resolve())
      .then(function () { return sent; });
  },

  /* ---------- Formatting -------------------------------------------- */
  escapeHTML: function (str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  },
  formatSize: function (bytes) {
    if (!bytes) return "Unknown size";
    var mb = bytes / (1024 * 1024);
    return mb < 0.1 ? Math.ceil(bytes / 1024) + " KB" : mb.toFixed(1) + " MB";
  },

  // "in 20 seconds", "in a minute": the wait a 429 is asking for, in words a
  // person would use. One copy, because the list and the two forms all show it.
  waitPhrase: function (seconds) {
    if (!(seconds > 0)) return "";
    if (seconds <= 1) return "a second";
    if (seconds < 60) return seconds + " seconds";
    var mins = Math.ceil(seconds / 60);
    return mins === 1 ? "a minute" : mins + " minutes";
  },

  // What to tell a student when the request form did not send. The API's own
  // sentence is written for whoever reads the logs, so it stays off the screen;
  // the status and the machine code are what this maps from. Anything
  // unrecognised gets the plain "that did not reach the library", never a guess
  // at a cause.
  submitMessage: function (err) {
    var t = ZafarI18n.t;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return t("support.errOffline");
    if (!err || !err.status) return t("support.errServer");
    if (err.status === 429) return t("support.errTooMany", this.waitPhrase(err.retryAfter));
    // Causes that name themselves. These are read from the machine code, never
    // from the status alone: 404 also means "this route is not deployed yet".
    var code = err.code || "";
    if (code === "email_not_verified") return t("support.errUnverified");
    if (code === "user_suspended") return t("support.errSuspended");
    if (err.status === 401 || err.status === 403) return t("support.errForbidden");
    if (err.status === 400 || err.status === 422) return t("support.errRefused");
    return t("support.errServer");
  },

  // Send a request for a file the library does not have. An authenticated
  // post: the API attributes it to the signed-in account.
  submitRequest: function (section, title, note) {
    var body = { section: section, title: title };
    if (note) body.note = note;
    return this.authPostJSON("/requests", body);
  },

  // FastAPI error bodies come in two shapes:
  //   {"detail": "some string"}                       (HTTPException)
  //   {"detail": [{"loc": [...], "msg": "..."}]}      (pydantic 422)
  // What may be shown to a student. The backend's own wording is used only
  // when it is a 4xx explaining a mistake the person can fix (a wrong code, a
  // section that does not match). Anything from a 5xx, a gateway, or a network
  // failure can carry internal detail — server names, project ids, folder ids
  // — so it never reaches the screen; `fallback` does.
  safeMessage: function (err, fallback) {
    if (!err) return fallback;
    if (err.timeout) return err.message;
    if (err instanceof TypeError) return fallback;
    if (!err.status) return fallback;
    if (err.status >= 500) return fallback;
    return err.message || fallback;
  },

  extractErrorMessage: function (data) {
    if (!data || !data.detail) return "Request failed";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map(function (e) {
          var field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "field";
          return field + ": " + e.msg;
        })
        .join("; ");
    }
    return "Request failed";
  },

  /* ---------- HTTP --------------------------------------------------- */
  // A request that never comes back is the worst state this app can be in:
  // the spinner stays up and the only way out is to close the tab. Every
  // request therefore has a deadline — 15 s for an answer, 90 s for a file.
  REQUEST_TIMEOUT_MS: 15000,
  FILE_TIMEOUT_MS: 90000,
  // Asking for a download ticket is a *write*: the server reserves the slot
  // before it answers. Giving up on it early is worse than waiting, because
  // the reservation can already be committed — the phone would be told the
  // download failed while the allowance was quietly spent. So this one request
  // gets a generous deadline of its own (it may also have to walk the library
  // tree first, exactly like the list request that is allowed 45 s).
  TICKET_TIMEOUT_MS: 60000,
  // The catalogue is a different animal. On a cold start the server walks the
  // whole Drive tree before it can answer, and each of those Drive calls is
  // allowed twenty seconds on its own — so the *server* can legitimately take
  // longer than a browser's patience. Fifteen seconds was cutting that scan off
  // mid-flight, and a refresh then worked because the tree was cached by the
  // time it finished. The first listing therefore gets LIST_TIMEOUT_MS, and a
  // timeout is retried once: the scan the abort interrupted is usually finished
  // by the time the retry arrives, so the second answer is quick.
  LIST_TIMEOUT_MS: 45000,
  LIST_RETRY_DELAY_MS: 1200,
  // A 5xx from the platform in front of the app is worth one more try; a 4xx is
  // an answer, not a hiccup, and is never repeated.
  RETRYABLE_STATUS: { 502: true, 503: true, 504: true, 0: true },

  _retryable: function (err) {
    if (!err) return false;
    if (err.status === 401 || err.status === 403 || err.status === 404) return false;
    if (err.timeout) return true;
    if (!err.status) return true; // a dropped connection, not a refusal
    return this.RETRYABLE_STATUS[err.status] === true;
  },

  // Runs `make` up to `attempts` times (default 2) when the failure looks
  // transient. Every call it wraps is a GET, so repeating one cannot spend a
  // download, a code or a quota.
  _withRetry: function (make, opts) {
    var self = this;
    var conf = opts || {};
    var attempts = Math.max(1, Number(conf.attempts) || 2);
    var gap = Number(conf.delay) || self.LIST_RETRY_DELAY_MS;

    function attempt(n) {
      return make().catch(function (err) {
        if (n >= attempts || !self._retryable(err)) throw err;
        var wait = gap * n;
        if (typeof conf.onRetry === "function") {
          try { conf.onRetry(n + 1, attempts, wait); } catch (e) {}
        }
        return new Promise(function (resolve) { setTimeout(resolve, wait); })
          .then(function () { return attempt(n + 1); });
      });
    }
    return attempt(1);
  },

  _fetch: function (url, options, timeoutMs) {
    if (typeof AbortController === "undefined") return fetch(url, options);
    var controller = new AbortController();
    var ms = timeoutMs || this.REQUEST_TIMEOUT_MS;
    var timer = setTimeout(function () { controller.abort(); }, ms);
    var opts = {};
    Object.keys(options || {}).forEach(function (k) { opts[k] = options[k]; });
    opts.signal = controller.signal;
    return fetch(url, opts).then(
      function (res) {
        clearTimeout(timer);
        return res;
      },
      function (err) {
        clearTimeout(timer);
        if (err && err.name === "AbortError") {
          var timeout = new Error("This is taking too long. Check your connection and try again.");
          timeout.status = 0;
          timeout.timeout = true;
          throw timeout;
        }
        throw err;
      }
    );
  },

  _json: function (res) {
    var self = this;
    return res
      .json()
      .catch(function () {
        return {};
      })
      .then(function (data) {
        if (!res.ok) {
          var err = new Error(self.extractErrorMessage(data));
          err.status = res.status;
          // Headers the backend already sends: how long to wait before the
          // next try, and a stable machine code for the refusal.
          var retry = res.headers && res.headers.get ? Number(res.headers.get("Retry-After")) : NaN;
          if (isFinite(retry) && retry > 0) err.retryAfter = retry;
          var code = res.headers && res.headers.get ? res.headers.get("X-Error-Code") : null;
          if (code) err.code = code;
          throw err;
        }
        return data;
      });
  },

  // JSON request (/auth/register, /auth/verify, /auth/resend).
  postJSON: function (path, body) {
    var self = this;
    return this._fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return self._json(res);
    });
  },

  // application/x-www-form-urlencoded (for /auth/login, which uses
  // FastAPI's OAuth2PasswordRequestForm and expects form fields:
  // email + password).
  postForm: function (path, fields) {
    var self = this;
    var params = new URLSearchParams();
    Object.keys(fields).forEach(function (k) {
      params.append(k, fields[k]);
    });
    return this._fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).then(function (res) {
      return self._json(res);
    });
  },

  // Public display settings from the API (`GET /site-config`): the
  // announcement, the maintenance flag and the featured file ids. Public —
  // no token — and cached for a minute so a page load is not a request to the
  // API for something that changes twice a month. A failure is not an error
  // anywhere in the app: it returns null and the page behaves as it always did.
  SITE_CONFIG_KEY: "zafar_site_config",
  SITE_CONFIG_TTL_MS: 60000,
  siteConfig: function (force) {
    var self = this;
    if (!force) {
      try {
        var raw = sessionStorage.getItem(self.SITE_CONFIG_KEY);
        if (raw) {
          var cached = JSON.parse(raw);
          if (cached && typeof cached.at === "number" && Date.now() - cached.at < self.SITE_CONFIG_TTL_MS) {
            return Promise.resolve(cached.data);
          }
        }
      } catch (e) {}
    }
    return this._fetch(API_BASE_URL + "/site-config", {}, 8000)
      .then(function (res) { return self._json(res); })
      .then(function (data) {
        try {
          sessionStorage.setItem(self.SITE_CONFIG_KEY, JSON.stringify({ at: Date.now(), data: data }));
        } catch (e) {}
        return data;
      })
      .catch(function () { return null; });
  },

  // Koyeb's free instance sleeps. One ping per page, sent before the person
  // has finished typing, so the instance is awake by the time they press a
  // button. Harmless if it was already awake.
  _warmed: false,
  warmUp: function () {
    if (this._warmed) return;
    this._warmed = true;
    try {
      this._fetch(API_BASE_URL + "/health", { mode: "cors" }).catch(function () {});
    } catch (e) {}
  },

  _unauthorized: function () {
    this.clearToken();
    location.href = "login.html";
    // Never resolves — the page is already navigating away, so no .catch()
    // downstream fires a toast on a page that's on its way out.
    return new Promise(function () {});
  },

  // Who is this token? `/admin/whoami` answers 200 with a role for an admin,
  // 403 for a student and 404 on a deployment with no admin API. None of those
  // is a reason to bounce anyone to the sign-in screen, so this one does not go
  // through _unauthorized — it just reports the status.
  adminWhoami: function () {
    var self = this;
    if (!this.getToken()) return Promise.resolve(null);
    return this._fetch(API_BASE_URL + "/admin/whoami", {
      headers: { Authorization: "Bearer " + this.getToken() },
    }, 8000)
      .then(function (res) {
        if (res.status !== 200) return null;
        return self._json(res).catch(function () { return null; });
      })
      .catch(function () { return null; });
  },

  authGet: function (path, opts) {
    var self = this;
    var conf = opts || {};
    return this._withRetry(function () {
      return self._fetch(API_BASE_URL + path, {
        headers: { Authorization: "Bearer " + self.getToken() },
      }, conf.timeout)
        .then(function (res) {
          if (res.status === 401) return self._unauthorized();
          return self._json(res);
        });
    }, conf);
  },

  // Same as authGet, but keeps one number from the response headers. A
  // catalogue answer is one page of a longer list, and the count of the whole
  // list arrives beside it: `{ data, total }`, where `total` is null when the
  // server does not send it (or the browser is not allowed to read it).
  authGetMeta: function (path, opts) {
    var self = this;
    var conf = opts || {};
    return this._withRetry(function () {
      return self._fetch(API_BASE_URL + path, {
        headers: { Authorization: "Bearer " + self.getToken() },
      }, conf.timeout)
        .then(function (res) {
          if (res.status === 401) return self._unauthorized();
          return self._json(res).then(function (data) {
            var raw = res.headers && typeof res.headers.get === "function"
              ? res.headers.get("X-Total-Count")
              : null;
            var total = raw === null || raw === "" ? null : Number(raw);
            return { data: data, total: isFinite(total) && total >= 0 ? total : null };
          });
        });
    }, conf);
  },

  authPostJSON: function (path, body, opts) {
    var self = this;
    var conf = opts || {};
    return this._fetch(API_BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.getToken(),
      },
      body: JSON.stringify(body || {}),
    }, conf.timeout)
      .then(function (res) {
        if (res.status === 401) return self._unauthorized();
        return self._json(res);
      });
  },
};
