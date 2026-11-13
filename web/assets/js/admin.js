/* ============================================================
   StudyMW — admin portal

   Everything on this page comes from the API. There is no sample data and no
   placeholder number anywhere: if the backend has not shipped the /admin
   routes yet, the page says so and stops, because an admin screen that shows
   invented users is worse than no admin screen. The contract it speaks is
   written down in docs/admin-portal.md.

   Three gates, and each one is a sentence rather than a blank page:
     no token           -> sign in
     401 / 403          -> this area is for administrators
     404 / 501          -> the admin API is not deployed yet
   ============================================================ */

var ZafarAdmin = (function () {
  "use strict";

  /* ---------------- sections ---------------- */

  // Order matters: it is the priority order the portal was asked for.
  var TABS = [
    { id: "overview", label: "Overview", roles: ["owner", "editor", "viewer"] },
    { id: "users", label: "Users", roles: ["owner"] },
    { id: "moderation", label: "Requests & reports", roles: ["owner", "editor"] },
    { id: "settings", label: "Site settings", roles: ["owner"] },
    { id: "security", label: "Roles & audit", roles: ["owner"] },
    { id: "ops", label: "Operations", roles: ["owner"] },
  ];

  var ROLE_NAMES = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
  var ROLE_WHAT = {
    owner: "everything, including other people's roles",
    editor: "the library and the reports that come from it — no users, no settings",
    viewer: "the numbers, and nothing that changes anything",
  };

  var state = { me: null, tab: null, users: { q: "", offset: 0, limit: 25 } };

  /* ---------------- tiny helpers ---------------- */

  function el(id) { return document.getElementById(id); }
  function esc(v) { return Zafar.escapeHTML(v == null ? "" : String(v)); }

  // A missing number is not zero. "—" says "the API did not send this", which
  // is the truth; 0 would be a claim.
  function n(v) { return typeof v === "number" && isFinite(v) ? String(v) : "\u2014"; }

  function bytes(v) {
    if (typeof v !== "number" || !isFinite(v) || v <= 0) return "\u2014";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var i = 0;
    var x = v;
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i += 1; }
    return (x >= 10 ? Math.round(x) : x.toFixed(1)) + " " + units[i];
  }

  function when(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    try {
      return d.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  var toastTimer = null;
  function toast(message, bad) {
    var box = el("toast");
    if (!box) return;
    box.textContent = message || "";
    box.classList.toggle("bad", !!bad);
    box.classList.toggle("show", !!message);
    clearTimeout(toastTimer);
    if (message) toastTimer = setTimeout(function () { box.classList.remove("show"); }, 4200);
  }

  /* ---------------- the wire ---------------- */

  // { data, total } where total is X-Total-Count when the server sends one.
  // Errors keep their status, and their machine code from X-Error-Code, so the
  // gates below can tell a refusal from a missing route.
  function req(path, opts) {
    var conf = opts || {};
    var headers = { Authorization: "Bearer " + (Zafar.getToken() || "") };
    if (conf.body !== undefined) headers["Content-Type"] = "application/json";
    return Zafar._fetch(API_BASE_URL + path, {
      method: conf.method || "GET",
      headers: headers,
      body: conf.body === undefined ? undefined : JSON.stringify(conf.body),
    }).then(function (res) {
      var raw = res.headers && typeof res.headers.get === "function" ? res.headers.get("X-Total-Count") : null;
      var total = raw === null || raw === "" ? null : Number(raw);
      return Zafar._json(res).then(function (data) {
        return { data: data, total: isFinite(total) && total >= 0 ? total : null };
      });
    });
  }

  // Conflicts the API reports with a machine code. Each one is a sentence the
  // person can act on; none of them repeats what the server wrote, which is
  // written for whoever reads logs.
  var CONFLICT = {
    owner_mfa_not_enrolled:
      "That account needs an authenticator enrolled first. Run the owner bootstrap CLI for it " +
      "(--enroll), then set the role again.",
    owner_account_suspended: "Restore the account before making it an owner.",
    last_owner: "There must always be one active owner, so that change was refused.",
    self_role_change: "You cannot remove your own owner role. Ask another owner to do it.",
    self_suspend: "You cannot suspend the session you are using.",
    self_delete: "You cannot delete the account you are signed in with.",
    // Settings: the API checks every featured id against the library, and
    // refuses the whole save if one of them is not a real file.
    admin_featured_file_missing:
      "One of those ids is not a file in the library, so nothing was saved. " +
      "Use the id shown on the file's own page.",
    admin_featured_validation_unavailable:
      "The library could not be read just now, so the featured list was not saved. Try again in a moment.",
    admin_settings_unavailable: "The settings could not be saved. Try again.",
  };

  function conflictText(err) {
    if (err && err.code && CONFLICT[err.code]) return CONFLICT[err.code];
    return reason(err);
  }

  function isMissing(err) {
    if (!err) return false;
    if (err.code === "admin_not_configured") return true;
    return err.status === 404 || err.status === 501;
  }

  function reason(err) {
    if (err && err.timeout) return err.message;
    if (err && !err.status) return "Could not reach the server. Check the connection and try again.";
    if (err && err.status >= 500) return "The API failed on its side. Try again in a moment.";
    return Zafar.safeMessage(err, "That request did not work.");
  }

  /* ---------------- chrome ---------------- */

  function paintChrome() {
    var me = state.me || {};
    var right = el("barRight");
    if (right) {
      right.innerHTML =
        '<span class="who">' + esc(me.email || me.name || "signed in") + "</span>" +
        '<span class="role-chip">' + esc(ROLE_NAMES[me.role] || me.role || "?") + "</span>" +
        '<button class="btn ghost small" data-action="signout">Sign out</button>';
    }

    var tabs = el("tabs");
    if (!tabs) return;
    var allowed = TABS.filter(function (t) { return t.roles.indexOf(me.role) !== -1; });
    tabs.innerHTML = allowed.map(function (t) {
      return '<button class="tab" role="tab" data-action="tab" data-tab="' + t.id + '"' +
        ' aria-selected="' + (state.tab === t.id) + '">' + esc(t.label) + "</button>";
    }).join("");
    tabs.hidden = false;
  }

  /* ---------------- gates ---------------- */

  function gate(kind, err) {
    var tabs = el("tabs");
    if (tabs) tabs.hidden = true;
    var right = el("barRight");
    if (right) right.innerHTML = "";

    var body = "";
    if (kind === "signin") {
      body =
        "<h2>Sign in first</h2>" +
        "<p>The admin portal uses the same account as the app. Sign in, then come back to this address.</p>" +
        '<div class="actions"><a class="btn" href="login.html?switch=1">Sign in</a></div>';
    } else if (kind === "forbidden") {
      body =
        "<h2>This area is for administrators</h2>" +
        "<p>Your account does not have an admin role. If it should, ask the owner to give you one — roles are " +
        "owner, editor and viewer.</p>" +
        '<div class="actions"><a class="btn ghost" href="dashboard.html">Back to the library</a></div>';
    } else if (kind === "missing") {
      body =
        "<h2>The admin API isn't deployed yet</h2>" +
        "<p>The portal is here and the contract is written down, but this API answers <code>404</code> for " +
        "<code>/admin/*</code>, so there is nothing real to show. Nothing on this page is invented: no " +
        "sample users, no made-up downloads.</p>" +
        "<p>What has to exist on the backend is listed in <code>docs/admin-portal.md</code>, starting with " +
        "<code>GET /admin/whoami</code>.</p>" +
        '<div class="actions"><button class="btn ghost" data-action="retry-gate">Check again</button>' +
        '<a class="btn ghost" href="dashboard.html">Back to the library</a></div>';
    } else {
      body =
        "<h2>Could not reach the admin API</h2>" +
        "<p>" + esc(reason(err)) + "</p>" +
        '<div class="actions"><button class="btn" data-action="retry-gate">Try again</button></div>';
    }
    el("view").innerHTML = '<div class="state">' + body + "</div>";
  }

  function boot() {
    state.tab = null;
    if (!Zafar.getToken()) return gate("signin");
    el("view").innerHTML =
      '<div class="state"><div class="spinner" aria-hidden="true"></div><p>Checking your access\u2026</p></div>';

    return req("/admin/whoami").then(function (r) {
      var me = (r && r.data) || {};
      if (!me.role) return gate("forbidden");
      state.me = me;
      open("overview");
      paintChrome();
    }).catch(function (err) {
      if (err && err.status === 401) {
        // The token is gone or expired: this page has nothing to offer, so it
        // sends the person to sign in rather than showing a dead portal. The
        // attribute is the record of that decision, and the only way a test can
        // see it — jsdom refuses to navigate.
        document.documentElement.setAttribute("data-admin-redirect", "login");
        try { Zafar.clearToken(); } catch (e) {}
        location.replace("login.html?switch=1");
        return gate("signin");
      }
      if (err && err.status === 403) return gate("forbidden");
      if (isMissing(err)) return gate("missing");
      return gate("offline", err);
    });
  }

  /* ---------------- panel scaffolding ---------------- */

  function head(title, note) {
    return '<div class="panel-head"><h2>' + esc(title) + "</h2><p>" + esc(note || "") + "</p></div>";
  }

  function loadingHTML(message) {
    return '<div class="state"><div class="spinner" aria-hidden="true"></div><p>' + esc(message) + "</p></div>";
  }

  function failureHTML(err, panel) {
    return '<div class="state"><h2>That did not load</h2><p>' + esc(reason(err)) + "</p>" +
      '<div class="actions"><button class="btn" data-action="reload" data-panel="' + esc(panel) + '">Try again</button></div></div>';
  }

  function kpi(label, value, note) {
    return '<div class="kpi-card"><div class="k-label">' + esc(label) + "</div>" +
      '<div class="k-value">' + esc(value) + "</div>" +
      (note ? '<div class="k-note">' + esc(note) + "</div>" : "") + "</div>";
  }

  function tableHTML(columns, rows, emptyText) {
    var head_ = "<tr>" + columns.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : "") + ">" + esc(c.label) + "</th>";
    }).join("") + "</tr>";
    var body = rows.length
      ? rows.map(function (row) {
          return "<tr>" + columns.map(function (c) {
            var cell = c.render ? c.render(row) : esc(row[c.key]);
            return "<td" + (c.num ? ' class="num"' : "") + ">" + cell + "</td>";
          }).join("") + "</tr>";
        }).join("")
      : '<tr class="empty-row"><td colspan="' + columns.length + '">' + esc(emptyText || "Nothing yet.") + "</td></tr>";
    return '<div class="table-scroll"><table><thead>' + head_ + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  /* ---------------- overview ---------------- */

  function bars(daily) {
    if (!daily.length) return '<p class="k-note">No daily figures yet.</p>';
    var max = 1;
    daily.forEach(function (d) {
      max = Math.max(max, Number(d.downloads) || 0, Number(d.failed) || 0);
    });
    return '<div class="chart">' + daily.map(function (d) {
      var ok = Math.round(((Number(d.downloads) || 0) / max) * 100);
      var bad = Math.round(((Number(d.failed) || 0) / max) * 100);
      return '<div class="col" title="' + esc(d.date) + ": " + n(Number(d.downloads)) + " downloaded, " +
        n(Number(d.failed)) + ' failed">' +
        '<div class="b failed" style="height:' + (bad || 0) + '%"></div>' +
        '<div class="b" style="height:' + (ok || 0) + '%"></div></div>';
    }).join("") + "</div>" +
      '<div class="chart-legend"><span><i></i>downloaded</span><span><i class="warn"></i>failed</span></div>';
  }

  function renderOverview() {
    var v = el("view");
    v.innerHTML = loadingHTML("Reading the numbers\u2026");
    req("/admin/overview?days=14").then(function (r) {
      var d = (r && r.data) || {};
      var users = d.users || {};
      var dl = d.downloads || {};
      var daily = Array.isArray(d.daily) ? d.daily : [];
      var topFiles = Array.isArray(d.top_files) ? d.top_files : [];
      var topSubjects = Array.isArray(d.top_subjects) ? d.top_subjects : [];
      var zero = Array.isArray(d.zero_result_searches) ? d.zero_result_searches : [];

      v.innerHTML =
        head("Overview", "Fourteen days, straight from the API.") +
        '<div class="grid kpi">' +
          kpi("Users", n(users.total), n(users.verified) === "\u2014" ? "" : n(users.verified) + " verified") +
          kpi("New today", n(users.new_today), "") +
          kpi("Downloads today", n(dl.today), "") +
          kpi("Failed today", n(dl.failed_today), "") +
        "</div>" +
        '<div class="card"><h3>Per day</h3>' + bars(daily) + "</div>" +
        '<div class="grid two">' +
          '<div class="card"><h3>Top files</h3>' +
            tableHTML([
              { label: "File", render: function (row) { return esc(row.name || row.id); } },
              { label: "Section", render: function (row) { return '<span class="badge">' + esc(row.section || "\u2014") + "</span>"; } },
              { label: "Downloads", num: true, render: function (row) { return esc(n(row.downloads)); } },
            ], topFiles, "No downloads recorded yet.") +
          "</div>" +
          // top_subjects is omitted by the API on purpose: there is no
          // trustworthy subject field, and it will not invent one from file
          // names. An empty table here would say "nobody downloaded anything",
          // which would be false, so the card is not drawn at all.
          (Array.isArray(d.top_subjects)
            ? '<div class="card"><h3>Top subjects</h3>' +
                tableHTML([
                  { label: "Subject", render: function (row) { return esc(row.subject || row.name); } },
                  { label: "Downloads", num: true, render: function (row) { return esc(n(row.downloads)); } },
                ], topSubjects, "Nothing recorded yet.") +
              "</div>"
            : "") +
        "</div>" +
        '<div class="card"><h3>Searches that found nothing</h3>' +
          '<p class="k-note" style="margin:0 0 10px">What students asked for and the library could not give. ' +
          "This is the upload list, in order.</p>" +
          tableHTML([
            { label: "Search", render: function (row) { return esc(row.q || row.query); } },
            { label: "Times", num: true, render: function (row) { return esc(n(row.count)); } },
          ], zero, "Nobody has searched for something missing.") +
        "</div>";
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "overview");
    });
  }

  /* ---------------- users ---------------- */

  function userRows() {
    var u = state.users;
    return tableHTML([
      { label: "Account", render: function (row) {
          return '<strong>' + esc(row.email) + "</strong>" +
            (row.name ? '<div class="k-note">' + esc(row.name) + "</div>" : "");
        } },
      { label: "Sign-in", render: function (row) {
          var how = row.signup_method || row.provider || "email";
          return '<span class="badge">' + esc(how === "google" ? "Google" : "Email") + "</span>";
        } },
      // The role lives on the account, and only an owner can change it:
      // PATCH /admin/users/{id} {"role": "viewer" | "editor" | "owner" | null}.
      // An account must have an authenticator enrolled before it can become an
      // owner, so that refusal is expected and has its own sentence.
      { label: "Role", render: function (row) {
          var current = row.role || "";
          var options = [["", "Student"], ["viewer", "Viewer"], ["editor", "Editor"], ["owner", "Owner"]];
          return '<select class="select role-select" data-action="role" data-id="' + esc(row.id) +
            '" data-email="' + esc(row.email) + '" data-was="' + esc(current) +
            '" aria-label="Role for ' + esc(row.email) + '">' +
            options.map(function (pair) {
              return '<option value="' + pair[0] + '"' + (pair[0] === current ? " selected" : "") + ">" +
                esc(pair[1]) + "</option>";
            }).join("") + "</select>";
        } },
      { label: "Status", render: function (row) {
          if (row.suspended || row.is_active === false) return '<span class="badge warn">Suspended</span>';
          if (row.is_verified === false) return '<span class="badge off">Unverified</span>';
          return '<span class="badge ok">Active</span>';
        } },
      { label: "Joined", render: function (row) { return esc(when(row.created_at)); } },
      { label: "Last active", render: function (row) { return esc(when(row.last_active_at)); } },
      { label: "Downloads", num: true, render: function (row) { return esc(n(row.downloads)); } },
      { label: "Actions", render: function (row) {
          var suspended = !!(row.suspended || row.is_active === false);
          return '<div class="actions">' +
            '<button class="btn ghost small" data-action="suspend" data-id="' + esc(row.id) + '" data-to="' +
              (suspended ? "false" : "true") + '">' + (suspended ? "Restore" : "Suspend") + "</button>" +
            '<button class="btn ghost small" data-action="reset-password" data-id="' + esc(row.id) + '">Reset password</button>' +
            '<button class="btn danger small" data-action="delete-user" data-id="' + esc(row.id) +
              '" data-email="' + esc(row.email) + '">Delete</button>' +
            "</div>";
        } },
    ], u.rows || [], u.q ? "No account matches \u201c" + u.q + "\u201d." : "No accounts yet.");
  }

  function usersPageInfo() {
    var u = state.users;
    if (u.total === null || u.total === undefined) return "";
    var from = u.offset + 1;
    var to = u.offset + (u.rows || []).length;
    return from + "\u2013" + to + " of " + u.total;
  }

  function loadUsers(keepFocus) {
    var u = state.users;
    var v = el("view");
    var query = "/admin/users?limit=" + u.limit + "&offset=" + u.offset +
      (u.q ? "&q=" + encodeURIComponent(u.q) : "");
    return req(query).then(function (r) {
      u.rows = Array.isArray(r.data) ? r.data : [];
      u.total = r.total;
      v.innerHTML =
        head("Users", "Search by email or name. Nothing here changes until you press a button.") +
        '<div class="search-row">' +
          '<input class="input" id="userSearch" type="search" placeholder="Email or name" value="' + esc(u.q) + '"' +
            ' autocomplete="off" aria-label="Search accounts">' +
          '<button class="btn ghost" data-action="clear-search"' + (u.q ? "" : " hidden") + ">Clear</button>" +
        "</div>" +
        '<div class="card">' + userRows() + "</div>" +
        '<div class="panel-head" style="margin:0">' +
          '<p>' + esc(usersPageInfo()) + "</p>" +
          '<div class="actions">' +
            '<button class="btn ghost small" data-action="prev-page"' + (u.offset > 0 ? "" : " disabled") + ">Previous</button>" +
            '<button class="btn ghost small" data-action="next-page"' +
              (u.total === null || u.offset + u.limit < u.total ? "" : " disabled") + ">Next</button>" +
          "</div>" +
        "</div>";
      if (keepFocus) {
        var search = el("userSearch");
        if (search) {
          search.focus();
          try { search.setSelectionRange(search.value.length, search.value.length); } catch (e) {}
        }
      }
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "users");
    });
  }

  function renderUsers() {
    el("view").innerHTML = loadingHTML("Reading accounts\u2026");
    return loadUsers();
  }

  /* ---------------- moderation ---------------- */

  function renderModeration() {
    var v = el("view");
    v.innerHTML = loadingHTML("Reading the queue\u2026");
    Promise.all([
      req("/admin/requests?status=open&limit=50"),
      req("/admin/reports?status=open&limit=50"),
    ]).then(function (answers) {
      var requests = Array.isArray(answers[0].data) ? answers[0].data : [];
      var reports = Array.isArray(answers[1].data) ? answers[1].data : [];
      v.innerHTML =
        head("Requests & reports", "What students asked for, and what broke.") +
        '<div class="card"><h3>Missing papers people asked for</h3>' +
          tableHTML([
            { label: "Asked", render: function (row) { return esc(when(row.created_at)); } },
            { label: "By", render: function (row) { return esc(row.email || "\u2014"); } },
            { label: "What", render: function (row) {
                return '<strong>' + esc(row.title || row.subject || "\u2014") + "</strong>" +
                  (row.note ? '<div class="k-note">' + esc(row.note) + "</div>" : "");
              } },
            { label: "Section", render: function (row) { return '<span class="badge">' + esc(row.section || "\u2014") + "</span>"; } },
            { label: "", render: function (row) {
                return '<button class="btn ghost small" data-action="request-done" data-id="' + esc(row.id) + '">Mark done</button>';
              } },
          ], requests, "Nothing open.") +
        "</div>" +
        '<div class="card"><h3>Broken or wrong files</h3>' +
          tableHTML([
            { label: "Reported", render: function (row) { return esc(when(row.created_at)); } },
            { label: "File", render: function (row) {
                return '<strong>' + esc(row.file_name || row.file_id || "\u2014") + "</strong>" +
                  (row.reason ? '<div class="k-note">' + esc(row.reason) + "</div>" : "");
              } },
            { label: "By", render: function (row) { return esc(row.email || "\u2014"); } },
            { label: "", render: function (row) {
                return '<button class="btn ghost small" data-action="report-resolved" data-id="' + esc(row.id) + '">Resolved</button>';
              } },
          ], reports, "No open reports.") +
        "</div>";
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "moderation");
    });
  }

  /* ---------------- settings ---------------- */

  function renderSettings() {
    var v = el("view");
    v.innerHTML = loadingHTML("Reading settings\u2026");
    req("/admin/settings").then(function (r) {
      var s = (r && r.data) || {};
      var limits = s.limits || {};
      v.innerHTML =
        head("Site settings", "Saved to the API, not to this browser.") +
        '<div class="notice info">An announcement shows on the library pages of every signed-in student. ' +
          "Maintenance mode turns the app into a notice for everyone who is not an admin.</div>" +
        '<form class="card" id="settingsForm">' +
          '<div class="field"><label for="announcement">Announcement</label>' +
            '<textarea class="textarea" id="announcement" placeholder="e.g. MSCE 2026 papers added">' +
              esc(s.announcement || "") + "</textarea></div>" +
          '<div class="switch-row"><input type="checkbox" id="maintenance"' +
            (s.maintenance ? " checked" : "") + "><label for=\"maintenance\">Maintenance mode</label></div>" +
          '<div class="field"><label for="featured">Featured papers (one per line)</label>' +
            '<textarea class="textarea" id="featured" placeholder="One file id per line">' +
              esc((Array.isArray(s.featured) ? s.featured : []).join("\n")) + "</textarea></div>" +
          '<div class="grid two">' +
            ['papers', 'books', 'notes', 'marking_keys'].map(function (key) {
              return '<div class="field"><label for="limit-' + key + '">' +
                esc(key === "marking_keys" ? "Marking keys" : key.charAt(0).toUpperCase() + key.slice(1)) +
                " per day</label>" +
                '<input class="input" id="limit-' + key + '" type="number" min="0" step="1" value="' +
                esc(n(limits[key]) === "\u2014" ? "" : limits[key]) + '"></div>';
            }).join("") +
          "</div>" +
          '<div class="actions"><button class="btn" type="submit">Save settings</button></div>' +
        "</form>";
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "settings");
    });
  }

  function saveSettings(form) {
    var featured = (el("featured").value || "").split("\n").map(function (line) { return line.trim(); })
      .filter(function (line) { return !!line; });
    var limits = {};
    ["papers", "books", "notes", "marking_keys"].forEach(function (key) {
      var input = el("limit-" + key);
      if (!input || input.value === "") return;
      var value = Number(input.value);
      // A blank box means "leave it alone", not "set it to zero".
      if (isFinite(value) && value >= 0) limits[key] = value;
    });

    var body = {
      announcement: el("announcement").value || "",
      maintenance: !!el("maintenance").checked,
      featured: featured,
    };
    if (Object.keys(limits).length) body.limits = limits;

    return req("/admin/settings", { method: "PATCH", body: body }).then(function () {
      toast("Settings saved.");
      // The API returns what is now stored — including any limit it clipped —
      // so the panel is redrawn from that rather than from the form.
      return renderSettings();
    }).catch(function (err) {
      toast(conflictText(err), true);
    });
  }

  /* ---------------- security ---------------- */

  function renderSecurity() {
    var v = el("view");
    v.innerHTML = loadingHTML("Reading the log\u2026");
    var roles =
      '<div class="card"><h3>Roles</h3>' +
      ["owner", "editor", "viewer"].map(function (role) {
        return '<p style="margin:0 0 8px"><span class="badge">' + esc(ROLE_NAMES[role]) + "</span> " +
          esc(ROLE_WHAT[role]) + "</p>";
      }).join("") +
      '<p class="k-note" style="margin:0">Only an owner can change a role, and only in the Users tab. ' +
      "The browser is never trusted with the decision: the API re-reads the role from the account on " +
      "every request. An account must have an authenticator enrolled before it can become an owner.</p></div>";

    req("/admin/audit?limit=50").then(function (r) {
      var rows = Array.isArray(r.data) ? r.data : [];
      v.innerHTML =
        head("Roles & audit", "Who changed what, and when.") + roles +
        '<div class="card"><h3>Last 50 actions</h3>' +
          tableHTML([
            { label: "When", render: function (row) { return esc(when(row.at || row.created_at)); } },
            { label: "Who", render: function (row) { return esc(row.actor_email || row.actor || "\u2014"); } },
            { label: "Action", render: function (row) { return '<span class="badge">' + esc(row.action || "\u2014") + "</span>"; } },
            { label: "Target", render: function (row) { return esc(row.target || row.detail || "\u2014"); } },
          ], rows, "Nothing recorded yet.") +
        "</div>";
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "security");
    });
  }

  /* ---------------- operations ---------------- */

  function renderOps() {
    var v = el("view");
    v.innerHTML = loadingHTML("Reading the state of the deployment\u2026");
    req("/admin/ops").then(function (r) {
      var d = (r && r.data) || {};
      var storage = d.storage || {};
      var db = d.db || {};
      var backups = Array.isArray(d.backups) ? d.backups : [];
      var errors = Array.isArray(d.errors) ? d.errors : [];
      var used = Number(storage.used_bytes);
      var quota = Number(storage.quota_bytes);
      var share = isFinite(used) && isFinite(quota) && quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : null;

      v.innerHTML =
        head("Operations", "Storage, backups and what the API is logging.") +
        '<div class="grid kpi">' +
          // Storage and backups are only drawn when the API reports them. The
          // service has no trustworthy provider inventory today, so it omits
          // both — and "0 backups" would be a claim it never made.
          (d.storage
            ? kpi("Storage used", bytes(used), isFinite(quota) && quota > 0 ? "of " + bytes(quota) : (storage.driver || ""))
            : "") +
          kpi("Database", bytes(Number(db.size_bytes)), db.kind ? db.kind + (db.size_bytes ? "" : " · size not reported") : "") +
          (Array.isArray(d.backups) ? kpi("Backups", n(backups.length), "") : "") +
          kpi("Errors today", n(Number(d.errors_today)), "") +
        "</div>" +
        (!d.storage && !Array.isArray(d.backups)
          ? '<div class="notice info">This deployment does not report storage or backups yet, so they are ' +
            "not shown. An empty chart here would read as \"none\", which is not the same thing.</div>"
          : "") +
        (share === null ? "" :
          '<div class="card"><h3>Storage</h3><div class="chart" style="height:24px">' +
            '<div class="col" style="height:100%"><div class="b" style="height:' + share + '%"></div></div></div>' +
            '<p class="k-note">' + share + "% of the quota.</p></div>") +
        '<div class="card"><h3>Export</h3>' +
          '<p class="k-note" style="margin:0 0 10px">A link that expires, exactly like a download: the browser ' +
          "never holds an admin token in a URL.</p>" +
          '<div class="actions">' +
            '<button class="btn ghost small" data-action="export" data-kind="users">Users CSV</button>' +
            '<button class="btn ghost small" data-action="export" data-kind="files">Files CSV</button>' +
          "</div></div>" +
        '<div class="grid two">' +
          (Array.isArray(d.backups)
            ? '<div class="card"><h3>Recent backups</h3>' +
                tableHTML([
                  { label: "When", render: function (row) { return esc(when(row.at)); } },
                  { label: "Size", num: true, render: function (row) { return esc(bytes(Number(row.bytes))); } },
                ], backups, "No backups recorded.") + "</div>"
            : "") +
          '<div class="card"><h3>Errors</h3>' +
            tableHTML([
              { label: "When", render: function (row) { return esc(when(row.at)); } },
              { label: "Route", render: function (row) { return '<span class="mono">' + esc(row.route || "") + "</span>"; } },
              { label: "Count", num: true, render: function (row) { return esc(n(Number(row.count))); } },
            ], errors, "Nothing failing.") + "</div>" +
        "</div>";
    }).catch(function (err) {
      if (isMissing(err)) return gate("missing");
      v.innerHTML = failureHTML(err, "ops");
    });
  }

  /* ---------------- routing ---------------- */

  var PANELS = {
    overview: renderOverview,
    users: renderUsers,
    moderation: renderModeration,
    settings: renderSettings,
    security: renderSecurity,
    ops: renderOps,
  };

  function may(role, tab) {
    var entry = TABS.filter(function (t) { return t.id === tab; })[0];
    return !!entry && entry.roles.indexOf(role) !== -1;
  }

  function open(tab) {
    var role = state.me && state.me.role;
    if (!may(role, tab)) tab = "overview";
    state.tab = tab;
    paintChrome();
    try {
      history.replaceState(null, "", "#" + tab);
    } catch (e) {}
    PANELS[tab]();
  }

  /* ---------------- actions ---------------- */

  function signOut() {
    Zafar.clearToken();
    location.href = "login.html?switch=1";
  }

  function reloadPanel(name) {
    if (PANELS[name]) PANELS[name]();
  }

  function onUserAction(action, id, node) {
    if (action === "suspend") {
      var to = node.getAttribute("data-to") === "true";
      return req("/admin/users/" + encodeURIComponent(id) + "/suspend", {
        method: "POST", body: { suspended: to },
      }).then(function () {
        toast(to ? "Account suspended." : "Account restored.");
        return reloadPanel("users");
      }).catch(function (err) { toast(conflictText(err), true); });
    }
    if (action === "reset-password") {
      return req("/admin/users/" + encodeURIComponent(id) + "/reset-password", { method: "POST", body: {} })
        .then(function () { toast("A reset code is on its way to that address."); })
        .catch(function (err) { toast(reason(err), true); });
    }
    if (action === "delete-user") {
      var email = node.getAttribute("data-email") || "this account";
      if (typeof confirm === "function" && !confirm("Delete " + email + "? This cannot be undone.")) return;
      return req("/admin/users/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () { toast("Account deleted."); return reloadPanel("users"); })
        .catch(function (err) { toast(conflictText(err), true); });
    }
  }

  function changeRole(node) {
    var id = node.getAttribute("data-id");
    var was = node.getAttribute("data-was") || "";
    var next = node.value;
    var email = node.getAttribute("data-email") || "that account";
    if (next === was) return;

    node.disabled = true;
    return req("/admin/users/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { role: next === "" ? null : next },
    }).then(function (r) {
      var role = (r && r.data && r.data.role) || next || null;
      node.setAttribute("data-was", role || "");
      toast(email + " is now " + (ROLE_NAMES[role] || "a student") + ".");
      // Changing your own role changes what this page may do.
      return req("/admin/whoami").then(function (me) {
        state.me = (me && me.data) || state.me;
        if (!may(state.me.role, state.tab)) return open("overview");
        paintChrome();
        return loadUsers();
      }).catch(function () { return loadUsers(); });
    }).catch(function (err) {
      node.disabled = false;
      node.value = was;
      toast(conflictText(err), true);
    });
  }

  function exportCSV(kind) {
    // A signed, short-lived URL: the same shape the download flow uses, so an
    // admin token never has to travel in a query string.
    return req("/admin/export/" + encodeURIComponent(kind), { method: "POST", body: {} })
      .then(function (r) {
        var url = r && r.data && r.data.url;
        if (!url) throw new Error("The API did not return a link.");
        location.href = url;
      })
      .catch(function (err) { toast(reason(err), true); });
  }

  /* ---------------- events ---------------- */

  function onClick(event) {
    var node = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (!node) return;
    var action = node.getAttribute("data-action");
    var id = node.getAttribute("data-id");

    if (action === "tab") return open(node.getAttribute("data-tab"));
    if (action === "signout") return signOut();
    if (action === "retry-gate") return boot();
    if (action === "reload") return reloadPanel(node.getAttribute("data-panel"));
    if (action === "clear-search") {
      state.users.q = "";
      state.users.offset = 0;
      return loadUsers();
    }
    if (action === "prev-page") {
      state.users.offset = Math.max(0, state.users.offset - state.users.limit);
      return loadUsers();
    }
    if (action === "next-page") {
      state.users.offset = state.users.offset + state.users.limit;
      return loadUsers();
    }
    if (action === "request-done") {
      return req("/admin/requests/" + encodeURIComponent(id), { method: "PATCH", body: { status: "done" } })
        .then(function () { toast("Marked done."); return reloadPanel("moderation"); })
        .catch(function (err) { toast(reason(err), true); });
    }
    if (action === "report-resolved") {
      return req("/admin/reports/" + encodeURIComponent(id), { method: "PATCH", body: { status: "resolved" } })
        .then(function () { toast("Marked resolved."); return reloadPanel("moderation"); })
        .catch(function (err) { toast(reason(err), true); });
    }
    if (action === "export") return exportCSV(node.getAttribute("data-kind"));
    if (action === "role") return changeRole(node);
    return onUserAction(action, id, node);
  }

  var searchTimer = null;
  function onInput(event) {
    if (!event.target || event.target.id !== "userSearch") return;
    var value = event.target.value || "";
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.users.q = value.trim();
      state.users.offset = 0;
      loadUsers(true);
    }, 260);
  }

  function onChange(event) {
    var node = event.target;
    if (!node || node.getAttribute("data-action") !== "role") return;
    changeRole(node);
  }

  function onSubmit(event) {
    if (!event.target || event.target.id !== "settingsForm") return;
    event.preventDefault();
    saveSettings(event.target);
  }

  function init() {
    var view = el("view");
    if (view) {
      view.addEventListener("click", onClick);
      view.addEventListener("input", onInput);
      view.addEventListener("change", onChange);
      view.addEventListener("submit", onSubmit);
    }
    var tabs = el("tabs");
    if (tabs) tabs.addEventListener("click", onClick);
    var bar = el("barRight");
    if (bar) bar.addEventListener("click", onClick);

    // A link to a section is a link someone can keep.
    var wanted = (location.hash || "").replace(/^#/, "");
    return boot().then(function () {
      if (wanted && state.me && may(state.me.role, wanted) && wanted !== state.tab) open(wanted);
    });
  }

  return { init: init, TABS: TABS, state: state, boot: boot };
})();

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ZafarAdmin.init);
  else ZafarAdmin.init();
}
