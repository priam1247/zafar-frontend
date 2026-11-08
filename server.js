/* ============================================================
   Zafar — zero-dependency static server for local development.
   Serves web/ so the pages can be opened at their real paths.

     node server.js            -> http://localhost:4173

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

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Bad request");
    return;
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
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      // Dev server: always re-read, so an edit shows up on refresh.
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Zafar running on http://localhost:" + PORT);
});
