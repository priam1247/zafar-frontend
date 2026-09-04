// Base URL of the deployed Zafar backend (the zafar-backend FastAPI app on Koyeb).
var API_BASE_URL = "https://bloody-brigitta-ahzafar-de9b1709.koyeb.app";

// The backend's /auth/quota endpoint only reports how many papers/books are
// left today, not the daily cap itself — so the cap is mirrored here purely
// for rendering progress bars (e.g. "4 of 5 left") on the dashboard. Keep in
// sync with the backend's daily_paper_limit setting (config.py default: 10).
var DAILY_PAPER_LIMIT = 10;

// Shared helpers for talking to the backend + storing the JWT.
var Zafar = {
  TOKEN_KEY: "zafar_token",
  BOOKMARKS_KEY: "zafar_bookmarks",
  RECENT_DOWNLOADS_KEY: "zafar_recent_downloads",
  RECENT_DOWNLOADS_MAX: 20,

  // Bookmarks/recent-downloads are per-account, not per-device — two
  // different accounts logging into the same browser must never see each
  // other's data. The JWT's "sub" claim (set to the username at login) is
  // decoded client-side — no network call needed — and used to namespace
  // each account's localStorage keys. No verification is done here; the
  // token was already issued to this browser, so its claims are trusted
  // only as a storage key, never as an auth decision.
  _currentUserSuffix: function () {
    var token = this.getToken();
    if (!token) return "anon";
    try {
      var payload = token.split(".")[1];
      payload = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var json = JSON.parse(atob(payload));
      return json.sub || "anon";
    } catch (e) {
      return "anon";
    }
  },
  // One-time migration: the very first version of this app stored
  // bookmarks/downloads under one shared key for every account on the
  // device. If that legacy key still has data and this account doesn't
  // have its own scoped copy yet, adopt it once, then remove the legacy
  // key so it can't leak into the next account that logs in here.
  _migrateLegacyKey: function (legacyKey, scopedKey) {
    var legacy = localStorage.getItem(legacyKey);
    if (legacy !== null && localStorage.getItem(scopedKey) === null) {
      localStorage.setItem(scopedKey, legacy);
    }
    localStorage.removeItem(legacyKey);
  },

  // Remember Me on: token in localStorage (survives closing the browser).
  // Remember Me off: token in sessionStorage (cleared when the tab closes).
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

  // ---- Favorites (bookmarked paper IDs) — shared by every list page and
  // the sidebar's "Favorites" count pill, so it lives here instead of in
  // one page's script. Scoped per-account (see _currentUserSuffix above). ----
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
  // Refreshes every sidebar "Favorites" count pill on the current page to
  // match how many bookmarks are saved. Called on every page load (from
  // ZafarShell.init) and whenever a bookmark is toggled.
  updateFavCountPill: function () {
    var count = this.getBookmarks().length;
    document.querySelectorAll(".fav-count-pill").forEach(function (pill) {
      pill.textContent = String(count);
      pill.style.display = count > 0 ? "inline-flex" : "none";
    });
  },

  // ---- Recent downloads (local history for the dashboard's "Recent
  // downloads" list + "Downloaded today" stat). The backend only tracks the
  // day's remaining quota, not a browsable history, so this is kept
  // client-side alongside it. Scoped per-account (see _currentUserSuffix). ----
  recordDownload: function (item) {
    var list = this.getRecentDownloads(this.RECENT_DOWNLOADS_MAX);
    list.unshift({
      id: item.id || "",
      name: item.name || "Document",
      category: item.category || "",
      at: new Date().toISOString(),
    });
    if (list.length > this.RECENT_DOWNLOADS_MAX) list = list.slice(0, this.RECENT_DOWNLOADS_MAX);
    var scopedKey = this.RECENT_DOWNLOADS_KEY + "_" + this._currentUserSuffix();
    localStorage.setItem(scopedKey, JSON.stringify(list));
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
  getDownloadsToday: function () {
    var todayKey = new Date().toDateString();
    return this.getRecentDownloads().filter(function (d) {
      return new Date(d.at).toDateString() === todayKey;
    }).length;
  },

  // Escapes text before it's dropped into innerHTML — shared by every page
  // that renders paper/book cards from backend data.
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
  // - {"detail": "some string"}                     (raised HTTPException)
  // - {"detail": [{"loc": [...], "msg": "...", ...}]} (pydantic validation, 422)
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

  // JSON request (used for /auth/register)
  postJSON: function (path, body) {
    var self = this;
    return fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(self.extractErrorMessage(data));
        return data;
      });
    });
  },

  // application/x-www-form-urlencoded request (used for /auth/login,
  // which uses FastAPI's OAuth2PasswordRequestForm and expects form fields).
  postForm: function (path, fields) {
    var self = this;
    var params = new URLSearchParams();
    Object.keys(fields).forEach(function (key) {
      params.append(key, fields[key]);
    });
    return fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(self.extractErrorMessage(data));
        return data;
      });
    });
  },

  // Authenticated GET, sending the stored JWT as a Bearer token.
  authGet: function (path) {
    var self = this;
    return fetch(API_BASE_URL + path, {
      headers: { Authorization: "Bearer " + this.getToken() },
    }).then(function (res) {
      if (res.status === 401) {
        Zafar.clearToken();
        window.location.href = "login.html";
        // Don't throw here — the page is already navigating to login.html,
        // and a thrown error would still reach any .catch() this call has
        // and could show a toast/UI update on a page that's on its way out.
        // Returning a promise that never resolves just lets the navigation
        // happen instead.
        return new Promise(function () {});
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(self.extractErrorMessage(data));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  },

  // Authenticated POST with a JSON body (used for /drive/download/{file_id}).
  authPostJSON: function (path, body) {
    var self = this;
    return fetch(API_BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.getToken(),
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 401) {
        Zafar.clearToken();
        window.location.href = "login.html";
        return new Promise(function () {});
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(self.extractErrorMessage(data));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  },
};
