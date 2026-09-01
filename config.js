// Base URL of the deployed Zafar backend (the zafar-backend FastAPI app on Koyeb).
var API_BASE_URL = "https://bloody-brigitta-ahzafar-de9b1709.koyeb.app";

// The backend's /auth/quota endpoint only reports how many papers/books are
// left today, not the daily cap itself — so the cap is mirrored here purely
// for rendering progress bars (e.g. "4 of 5 left") on the dashboard. Keep in
// sync with the backend's daily_paper_limit setting.
var DAILY_PAPER_LIMIT = 5;

// Shared helpers for talking to the backend + storing the JWT.
var Zafar = {
  TOKEN_KEY: "zafar_token",
  BOOKMARKS_KEY: "zafar_bookmarks",
  RECENT_DOWNLOADS_KEY: "zafar_recent_downloads",
  RECENT_DOWNLOADS_MAX: 20,

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
  // one page's script. ----
  getBookmarks: function () {
    try {
      return JSON.parse(localStorage.getItem(this.BOOKMARKS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  },
  setBookmarks: function (ids) {
    localStorage.setItem(this.BOOKMARKS_KEY, JSON.stringify(ids));
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
  // client-side alongside it. ----
  recordDownload: function (item) {
    var list = this.getRecentDownloads(this.RECENT_DOWNLOADS_MAX);
    list.unshift({
      id: item.id || "",
      name: item.name || "Document",
      category: item.category || "",
      at: new Date().toISOString(),
    });
    if (list.length > this.RECENT_DOWNLOADS_MAX) list = list.slice(0, this.RECENT_DOWNLOADS_MAX);
    localStorage.setItem(this.RECENT_DOWNLOADS_KEY, JSON.stringify(list));
  },
  getRecentDownloads: function (limit) {
    var list;
    try {
      list = JSON.parse(localStorage.getItem(this.RECENT_DOWNLOADS_KEY) || "[]");
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
