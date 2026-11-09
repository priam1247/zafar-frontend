/* ============================================================
   Zafar — zero-dependency static server for local development.
   Serves web/ so the pages can be opened at their real paths.

     node server.js            -> http://localhost:4173
     http://localhost:4173/?demo=1

   ?demo=1 drops a cookie and injects a small stand-in for the backend:
   a fake session plus a catalogue of sample documents, so the app can be
   reviewed without an account (or a network). It exists only in this file
   — nothing is added to web/, and the deployed site is unaffected.

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
  // A token the client only ever uses as a storage namespace — the fake
  // API below never checks it.
  var payload = btoa(JSON.stringify({ sub: "student@zafar.mw" })).replace(/=+$/, "");
  try { localStorage.setItem("zafar_token", "demo." + payload + ".demo"); } catch (e) {}

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

  function json(data) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function () { return Promise.resolve(data); }
    });
  }

  var quota = { papers_left: 8, books_left: 9 };
  var realFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    if (url.indexOf(location.origin) === 0 || url.indexOf("data:") === 0 || url.indexOf("blob:") === 0) {
      return realFetch(input, init); // assets and the blob we hand back
    }
    if (url.indexOf("/health") !== -1) return json({ ok: true });
    if (url.indexOf("/auth/quota") !== -1) return json(quota);
    if (url.indexOf("/drive/download/") !== -1) {
      quota.papers_left = Math.max(0, quota.papers_left - 1);
      return json({
        url: URL.createObjectURL(new Blob(["%PDF-1.4 demo"], { type: "application/pdf" })),
        download_id: "demo-" + Date.now(),
        quota: quota
      });
    }
    if (url.indexOf("/drive/confirm/") !== -1) return json({ ok: true });
    if (url.indexOf("/drive/papers") !== -1) {
      var q = new URL(url, location.href).searchParams;
      var section = q.get("section") || "papers";
      var category = q.get("category") || "";
      var term = (q.get("q") || "").toLowerCase();
      var rows = (DOCS[section] || []).filter(function (d) {
        if (category && d.category !== category) return false;
        return !term || d.name.toLowerCase().indexOf(term) !== -1;
      });
      return json(rows);
    }
    return json({});
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
  console.log("Zafar running on http://localhost:" + PORT);
  console.log("Demo session: http://localhost:" + PORT + "/?demo=1");
});
