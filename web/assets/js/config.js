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
// These numbers are the published policy the Help page lists. The app never
// quotes them as if it had measured anything: /auth/quota reports each
// section's real limit (they are env settings on the server, DAILY_*_LIMIT),
// and a chip with no reported ceiling stays hidden rather than borrowing the
// number below.
var DAILY_LIMITS = {
  papers: 10,
  books: 3,
  notes: 3,
  "marking-keys": 10,
};

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
  BOOKMARKS_KEY: "zafar_bookmarks",
  RECENT_DOWNLOADS_KEY: "zafar_recent_downloads",
  RECENT_DOWNLOADS_MAX: 20,
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
  },

  // Bookmarks / recent downloads are per-account, not per-device: two
  // accounts sharing a browser must never see each other's data. The JWT's
  // "sub" claim (the account's generated username, e.g. "john2") is decoded
  // client-side and used purely as a storage key namespace — never as an
  // auth decision, and never shown to anyone.
  _currentUserSuffix: function () {
    var token = this.getToken();
    if (!token) return "anon";
    try {
      var payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      return JSON.parse(atob(payload)).sub || "anon";
    } catch (e) {
      return "anon";
    }
  },
  // One-time migration: the first version of this app stored bookmarks and
  // downloads under one shared key for every account on the device. Each key
  // is looked at once per page, not on every read.
  _migrated: {},
  _migrateLegacyKey: function (legacyKey, scopedKey) {
    if (this._migrated[legacyKey]) return;
    this._migrated[legacyKey] = true;
    var legacy = localStorage.getItem(legacyKey);
    if (legacy !== null && localStorage.getItem(scopedKey) === null) {
      localStorage.setItem(scopedKey, legacy);
    }
    localStorage.removeItem(legacyKey);
  },

  /* ---------- Favorites ---------------------------------------------- */
  getBookmarks: function () {
    var scopedKey = this.BOOKMARKS_KEY + "_" + this._currentUserSuffix();
    this._migrateLegacyKey(this.BOOKMARKS_KEY, scopedKey);
    try {
      return JSON.parse(localStorage.getItem(scopedKey) || "[]");
    } catch (e) {
      return [];
    }
  },
  setBookmarks: function (ids) {
    var scopedKey = this.BOOKMARKS_KEY + "_" + this._currentUserSuffix();
    localStorage.setItem(scopedKey, JSON.stringify(ids));
    this.updateFavCountPill();
  },
  updateFavCountPill: function () {
    var count = this.getBookmarks().length;
    document.querySelectorAll("[data-fav-count]").forEach(function (pill) {
      pill.textContent = String(count);
      pill.style.display = count > 0 ? "inline-flex" : "none";
    });
  },

  /* ---------- Recent downloads (local history) ------------------------ */
  recordDownload: function (item) {
    var list = this.getRecentDownloads();
    list.unshift({
      id: item.id || "",
      name: item.name || "Document",
      category: item.category || "",
      at: new Date().toISOString(),
    });
    if (list.length > this.RECENT_DOWNLOADS_MAX) list = list.slice(0, this.RECENT_DOWNLOADS_MAX);
    localStorage.setItem(
      this.RECENT_DOWNLOADS_KEY + "_" + this._currentUserSuffix(),
      JSON.stringify(list)
    );
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
    return limit ? list.slice(0, limit) : list;
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

  authGet: function (path) {
    var self = this;
    return this._fetch(API_BASE_URL + path, {
      headers: { Authorization: "Bearer " + this.getToken() },
    })
      .then(function (res) {
        if (res.status === 401) return self._unauthorized();
        return self._json(res);
      });
  },

  authPostJSON: function (path, body) {
    var self = this;
    return this._fetch(API_BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.getToken(),
      },
      body: JSON.stringify(body || {}),
    })
      .then(function (res) {
        if (res.status === 401) return self._unauthorized();
        return self._json(res);
      });
  },
};
