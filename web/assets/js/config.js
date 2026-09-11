/* ============================================================
   Zafar — shared config + API client
   ============================================================ */

// Base URL of the deployed Zafar backend (zafar-backend FastAPI app).
// Can be overridden at runtime with ?api=https://... for testing.
var API_BASE_URL = "https://bloody-brigitta-ahzafar-de9b1709.koyeb.app";

// The backend's /auth/quota endpoint only reports how many papers/books are
// left today, not the cap itself — mirrored here purely for progress bars.
// Keep in sync with the backend's daily_paper_limit (config.py default: 10).
var DAILY_PAPER_LIMIT = 10;

(function () {
  var override = new URLSearchParams(location.search).get("api");
  if (override) API_BASE_URL = override.replace(/\/+$/, "");
})();

var Zafar = {
  TOKEN_KEY: "zafar_token",
  BOOKMARKS_KEY: "zafar_bookmarks",
  RECENT_DOWNLOADS_KEY: "zafar_recent_downloads",
  RECENT_DOWNLOADS_MAX: 20,
  DEMO_KEY: "zafar_demo",

  /* ---------- Demo mode ----------------------------------------------
     The backend isn't always reachable (local dev, offline sandbox, a
     cold Koyeb instance). Rather than showing an error wall, the API
     client transparently falls back to ZafarDemo — the UI stays fully
     explorable and every page clearly labels itself as demo data. */
  isDemo: function () {
    return sessionStorage.getItem(this.DEMO_KEY) === "1";
  },
  setDemo: function (on) {
    if (on) sessionStorage.setItem(this.DEMO_KEY, "1");
    else sessionStorage.removeItem(this.DEMO_KEY);
    if (on && typeof ZafarShell !== "undefined") ZafarShell.markDemo();
  },

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
    sessionStorage.removeItem(this.DEMO_KEY);
  },

  // Bookmarks / recent downloads are per-account, not per-device: two
  // accounts sharing a browser must never see each other's data. The JWT's
  // "sub" claim (the account's email address) is decoded client-side and
  // used purely as a storage key namespace — never as an auth decision.
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
  // Friendly display name. The JWT subject is an email address, so greet
  // people with the local part rather than the whole address.
  username: function () {
    var sub = this._currentUserSuffix();
    if (sub === "anon") return "there";
    var local = sub.split("@")[0].replace(/[._-]+/g, " ").trim();
    return local.charAt(0).toUpperCase() + local.slice(1);
  },
  // One-time migration: the first version of this app stored bookmarks and
  // downloads under one shared key for every account on the device.
  _migrateLegacyKey: function (legacyKey, scopedKey) {
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
  getDownloadsToday: function () {
    var today = new Date().toDateString();
    return this.getRecentDownloads().filter(function (d) {
      return new Date(d.at).toDateString() === today;
    }).length;
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
  timeAgo: function (iso) {
    var secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(secs)) return "";
    if (secs < 60) return "just now";
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return days === 1 ? "yesterday" : days + "d ago";
  },

  // FastAPI error bodies come in two shapes:
  //   {"detail": "some string"}                       (HTTPException)
  //   {"detail": [{"loc": [...], "msg": "..."}]}      (pydantic 422)
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
          throw err;
        }
        return data;
      });
  },

  // JSON request (/auth/register, /auth/verify, /auth/resend).
  postJSON: function (path, body) {
    var self = this;
    return fetch(API_BASE_URL + path, {
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
    return fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).then(function (res) {
      return self._json(res);
    });
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
    if (this.isDemo()) return ZafarDemo.get(path);
    return fetch(API_BASE_URL + path, {
      headers: { Authorization: "Bearer " + this.getToken() },
    })
      .then(function (res) {
        if (res.status === 401) return self._unauthorized();
        return self._json(res);
      })
      .catch(function (err) {
        // Network-level failure (backend asleep/unreachable) -> demo data.
        if (err instanceof TypeError) {
          self.setDemo(true);
          return ZafarDemo.get(path);
        }
        throw err;
      });
  },

  authPostJSON: function (path, body) {
    var self = this;
    if (this.isDemo()) return ZafarDemo.post(path);
    return fetch(API_BASE_URL + path, {
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
      })
      .catch(function (err) {
        if (err instanceof TypeError) {
          self.setDemo(true);
          return ZafarDemo.post(path);
        }
        throw err;
      });
  },
};
