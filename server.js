/* ============================================================
   StudyMW — zero-dependency static server for local development.
   Serves web/ so the pages can be opened at their real paths.

     node server.js            -> http://localhost:4173
     http://localhost:4173/?demo=1

   ?demo=1 drops a cookie and injects a small stand-in for the backend:
   a fake session plus a catalogue of sample documents, so the app can be
   reviewed without an account (or a network). It exists only in this file
   — nothing is added to web/, and the deployed site is unaffected.

   The demo stands down the moment a real session exists: log out, or open
   login.html?switch=1, and the cookie and the demo token are both cleared
   so the real form talks to the real backend.

   The deployed site is static, so this file is not part of it.
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "web");
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

/* ------------------------------------------------------------
   Demo session. Only the dev server ever serves this.
   ------------------------------------------------------------ */
const DEMO_SCRIPT = `<script>
(function () {
  // ---- limits, exactly as the backend keeps them --------------------------
  // Four independent buckets, one per section: papers 10, books 3, notes 3,
  // marking keys 10. Each is spent only by its own section, and each refills
  // at midnight UTC. The demo has to mirror this: a demo that is more generous
  // than production teaches the wrong thing.
  var LIMITS = { papers: 10, books: 3, notes: 3, "marking-keys": 10 };
  // Section key -> the field prefix its numbers live under, exactly as the
  // server does it: "marking-keys" the section, "marking_keys" the fields.
  // Primary is a shelf inside Past Papers and spends the papers allowance, so
  // it maps to "papers" too: one bucket, two sections. Only the four fields
  // named in LIMITS exist.
  var BUCKET = { papers: "papers", primary: "papers", books: "books", notes: "notes", "marking-keys": "marking_keys" };
  var QUOTA_VERSION = 3;

  var TOKEN_KEY = "zafar_token";
  var QUOTA_KEY = "zafar_demo_quota";
  var DEMO_TOKEN = "demo." + btoa(JSON.stringify({ sub: "student@zafar.mw" })).replace(/=+$/, "") + ".demo";

  function isDemoToken(t) { return !!t && t.indexOf("demo.") === 0; }
  function utcDay() { return new Date().toISOString().slice(0, 10); }

  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); }
    catch (e) { return null; }
  }

  // ---- allowance lives in localStorage, so it survives navigation ---------
  function freshQuota() {
    var q = { v: QUOTA_VERSION, day: utcDay() };
    Object.keys(LIMITS).forEach(function (section) {
      var field = BUCKET[section];
      q[field + "_left"] = LIMITS[section];
      q[field + "_limit"] = LIMITS[section];
      q[field + "_downloaded_today"] = 0;
    });
    return q;
  }

  function readQuota() {
    var q = null;
    try { q = JSON.parse(localStorage.getItem(QUOTA_KEY) || "null"); } catch (e) {}
    // A record from an older demo (no version, or per-section fields) and a
    // record from an earlier UTC day are both stale: start the day over.
    var usable = q && q.v === QUOTA_VERSION && q.day === utcDay() &&
      typeof q.papers_left === "number" && typeof q.books_left === "number" &&
      typeof q.notes_left === "number" && typeof q.marking_keys_left === "number";
    if (!usable) {
      q = freshQuota();
      writeQuota(q);
    }
    return q;
  }
  function writeQuota(q) {
    try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch (e) {}
  }

  // ---- ending the demo ---------------------------------------------------
  function clearDemo() {
    document.cookie = "zafar_demo=; Max-Age=0; path=/";
    try {
      if (isDemoToken(readToken())) {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {}
  }

  var params = new URLSearchParams(location.search);
  if (params.get("switch") === "1") {
    // Documented escape hatch: "show me the real form".
    clearDemo();
  } else if (!readToken() || isDemoToken(readToken())) {
    // Never overwrite a real session that is already stored.
    try { localStorage.setItem(TOKEN_KEY, DEMO_TOKEN); } catch (e) {}
  }

  // Logging out has to end the demo — otherwise the cookie reseeds a demo
  // token on the way to login.html and the session comes back by itself.
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-logout]")) clearDemo();
  }, true);

  // ---- sample catalogue --------------------------------------------------
  var DOCS = {
    papers: [
      { id: "p1", name: "MSCE Mathematics 2023 Paper 1.pdf", category: "MSCE Maneb", size_bytes: 1184000 },
      { id: "p2", name: "MSCE Biology 2022 Paper 2.pdf", category: "MSCE Maneb", size_bytes: 942000 },
      { id: "p3", name: "MSCE English 2021 Paper 1.pdf", category: "MSCE Maneb", size_bytes: 731000 },
      { id: "p4", name: "JCE Chichewa 2021 Paper 1.pdf", category: "JCE Maneb", size_bytes: 512000 },
      { id: "p5", name: "JCE Physical Science 2022 Paper 2.pdf", category: "JCE Maneb", size_bytes: 688000 },
      { id: "p6", name: "MSCE Physics Mock 2024 Paper 1.pdf", category: "Mock", size_bytes: 803000 },
      { id: "p7", name: "MSCE Geography 2019 Paper 2.pdf", category: "Other Past Papers", size_bytes: 654000 }
    ],
    primary: [
      { id: "e1", name: "PSLC Mathematics 2023.pdf", category: "PSLC Maneb", size_bytes: 690000 },
      { id: "e2", name: "PSLC English 2022.pdf", category: "PSLC Maneb", size_bytes: 574000 },
      { id: "e3", name: "Standard 6 Mathematics Mock 2024.pdf", category: "Primary Mock", size_bytes: 402000 }
    ],
    books: [
      { id: "b1", name: "Senior Mathematics 3 Learner's Book.pdf", category: "Senior", size_bytes: 8420000 },
      { id: "b2", name: "Junior Science 2 Learner's Book.pdf", category: "Junior", size_bytes: 6110000 }
    ],
    notes: [
      { id: "n1", name: "Form 3 Algebra Summary Notes.pdf", category: "Senior", size_bytes: 384000 },
      { id: "n2", name: "Form 1 Biology Summary Notes.pdf", category: "Junior", size_bytes: 297000 }
    ],
    "marking-keys": [
      { id: "k1", name: "MSCE Mathematics 2023 Marking Key.pdf", category: "MSCE Maneb", size_bytes: 421000 },
      { id: "k2", name: "JCE Physical Science 2021 Marking Key.pdf", category: "JCE Maneb", size_bytes: 388000 }
    ]
  };

  // The real library runs to thousands of documents, and a demo of seven can
  // never show what the count and the Load more button are for. So the Past
  // Papers shelf is topped up to a believable size: the hand-written ones
  // above stay, the rest are generated names in the same shape.
  (function fillPastPapers() {
    var subjects = ["Mathematics", "Biology", "English", "Chichewa", "Physics",
      "Chemistry", "Geography", "History", "Agriculture", "Life Science"];
    var categories = ["MSCE Maneb", "JCE Maneb", "Mock", "Other Past Papers"];
    var years = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
    var i = 0;
    while (DOCS.papers.length < 1187) {
      var category = categories[i % categories.length];
      DOCS.papers.push({
        id: "pp" + i,
        name: category.split(" ")[0] + " " + subjects[i % subjects.length] + " " +
          years[(i * 3) % years.length] + " Paper " + (1 + (i % 2)) + ".pdf",
        category: category,
        size_bytes: 400000 + ((i * 7919) % 900000)
      });
      i += 1;
    }
  })();

  function reply(status, data, headers) {
    var map = headers || {};
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      headers: {
        get: function (name) {
          var key = String(name).toLowerCase();
          for (var k in map) if (k.toLowerCase() === key) return map[k];
          return null;
        }
      },
      json: function () { return Promise.resolve(data); }
    });
  }

  var realFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);

    // Assets, blobs, and anything asked for while a *real* session is stored
    // must never be intercepted — signing in for real has to stay real.
    if (url.indexOf(location.origin) === 0 || url.indexOf("data:") === 0 || url.indexOf("blob:") === 0) {
      return realFetch(input, init);
    }
    if (!isDemoToken(readToken())) return realFetch(input, init);

    if (url.indexOf("/health") !== -1) return reply(200, { ok: true });
    if (url.indexOf("/auth/quota") !== -1) return reply(200, readQuota());

    if (url.indexOf("/drive/download/") !== -1) {
      // The section is required, exactly as on the server: no default, because a
      // default is what a broken caller never notices. Missing answers 422 in
      // FastAPI's own validation shape, unknown answers 400 with its message,
      // and neither charges anything.
      var asked = new URL(url, location.href).searchParams.get("section");
      if (asked === null) {
        return reply(422, {
          detail: [
            { type: "missing", loc: ["query", "section"], msg: "Field required", input: null }
          ]
        });
      }
      if (!BUCKET[asked]) return reply(400, { detail: "Unknown section '" + asked + "'" });
      var field = BUCKET[asked];
      var key = field + "_left";
      var usedKey = field + "_downloaded_today";
      var quota = readQuota();
      if (quota[key] <= 0) {
        // Same shape and status the backend uses, so the client's 429 path
        // ("Daily download limit reached") is exercised for real.
        return reply(429, { detail: "Daily download limit reached" });
      }
      // Both numbers move together, in one write: the detail and its total can
      // never disagree, exactly as the server counts them from one table.
      quota[key] = quota[key] - 1;
      quota[usedKey] = (quota[usedKey] || 0) + 1;
      writeQuota(quota);
      return reply(200, {
        url: URL.createObjectURL(new Blob(["%PDF-1.4 demo"], { type: "application/pdf" })),
        download_id: "demo-" + Date.now(),
        quota: quota
      });
    }

    if (url.indexOf("/drive/confirm/") !== -1) return reply(200, { ok: true });

    if (url.indexOf("/drive/categories") !== -1) {
      // The folders are the library's, not the page's: the real server reads
      // them from Drive, so the demo reads them from its own catalogue.
      var wantedCat = new URL(url, location.href).searchParams.get("section") || "papers";
      var names = [];
      (DOCS[wantedCat] || []).forEach(function (d) {
        if (d.category && names.indexOf(d.category) === -1) names.push(d.category);
      });
      names.sort(function (a, b) { return a.localeCompare(b); });
      return reply(200, names);
    }

    if (url.indexOf("/drive/papers") !== -1) {
      var q = new URL(url, location.href).searchParams;
      var wanted = q.get("section") || "papers";
      var category = q.get("category") || "";
      var term = (q.get("q") || "").toLowerCase();
      var matches = (DOCS[wanted] || []).filter(function (d) {
        if (category && d.category !== category) return false;
        return !term || d.name.toLowerCase().indexOf(term) !== -1;
      });
      // The real route takes limit/offset; the demo does the same, so a bug in
      // the page's paging shows up here rather than only in production.
      var limit = Number(q.get("limit"));
      var offset = Math.max(0, Number(q.get("offset")) || 0);
      // The count is of the whole answer, before the page is cut out of it:
      // that is the number the page shows, so it must not be the page size.
      var total = matches.length;
      if (isFinite(limit) && limit > 0) matches = matches.slice(offset, offset + limit);
      return reply(200, matches, { "X-Total-Count": String(total) });
    }

    // Anything else (register, verify, resend, password reset) is a real
    // call: let it through rather than answering it with a fake success.
    return realFetch(input, init);
  };
})();
</script>`;

const server = http.createServer((req, res) => {
  let urlPath;
  let params;
  try {
    const url = new URL(req.url || "/", "http://localhost");
    urlPath = decodeURIComponent(url.pathname);
    params = url.searchParams;
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Bad request");
    return;
  }

  const cookies = String(req.headers.cookie || "");
  let demo = cookies.indexOf("zafar_demo=1") !== -1;
  const headers = {};

  if (params.get("demo") === "1") {
    demo = true;
    headers["Set-Cookie"] = "zafar_demo=1; Path=/; SameSite=Lax";
  }

  if (urlPath === "/" || urlPath === "") urlPath = "/login.html";

  // Resolve inside ROOT only — ".." never escapes the web directory.
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { "Content-Type": "text/plain" }).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found: " + urlPath);
      return;
    }

    const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    let body = buf;

    if (demo && type.startsWith("text/html")) {
      const html = buf.toString("utf8");
      // Runs before DOMContentLoaded, so the shell guard and the first
      // catalogue request both see the demo session.
      body = Buffer.from(html.replace("</body>", DEMO_SCRIPT + "\n</body>"), "utf8");
    }

    res.writeHead(200, Object.assign({
      "Content-Type": type,
      "Content-Length": body.length,
      // Dev server: always re-read, so an edit shows up on refresh.
      "Cache-Control": "no-cache",
    }, headers));
    res.end(body);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("StudyMW running on http://localhost:" + PORT);
  console.log("Demo session: http://localhost:" + PORT + "/?demo=1");
});
