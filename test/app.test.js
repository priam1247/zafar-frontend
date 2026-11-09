/* ============================================================
   Tests for the things that have actually broken, or could quietly.
   Run with `npm test`. They spawn the normal dev server on a free port.
   ============================================================ */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const WEB = path.join(ROOT, "web");
const CONFIG = path.join(WEB, "assets/js/config.js");
const I18N = path.join(WEB, "assets/js/i18n.js");
const DEPLOYED_API = "https://bloody-brigitta-ahzafar-de9b1709.koyeb.app";

/* ---------- helpers ---------- */

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function token(sub) {
  const body = Buffer.from(
    JSON.stringify({ sub: sub || "john", exp: Math.floor(Date.now() / 1000) + 3600 })
  )
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return "eyJhbGciOiJub25lIn0." + body + ".SIG";
}

// A response stub shaped like the browser's: ok/status/json/headers.
function reply(body, status, headers) {
  const code = status || 200;
  const map = {};
  for (const name of Object.keys(headers || {})) map[name.toLowerCase()] = headers[name];
  return Promise.resolve({
    ok: code < 400,
    status: code,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
      },
    },
    json: async () => body,
  });
}

// Run config.js in a page-like window without loading the real network.
function configWindow(url) {
  const dom = new JSDOM("<body></body>", { url, runScripts: "outside-only" });
  const calls = [];
  dom.window.fetch = (input) => {
    calls.push(String(input && input.url ? input.url : input));
    return reply({});
  };
  dom.window.console.warn = () => {};
  dom.window.eval(read(CONFIG));
  return { dom, calls, Zafar: dom.window.Zafar };
}

/* ---------- the dev server, for the page-level tests ---------- */

let origin = "";
let server = null;

before(async () => {
  const port = await freePort();
  origin = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(origin + "/notes.html");
      if (res.ok) return;
    } catch (e) {
      /* not up yet */
    }
    await wait(100);
  }
  throw new Error("the dev server did not start on " + origin);
});

after(() => {
  if (server) server.kill();
});

// Every page needs the same four stubs before its scripts run: a fetch, a
// service worker that is not there, caches that hold nothing, and blob URLs.
// `hooks` can add storage and anything else the test wants in place first.
function openPage(pathAndQuery, hooks) {
  const opts = hooks || {};
  return JSDOM.fromURL(origin + pathAndQuery, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(win) {
      win.fetch = opts.fetch || (() => Promise.reject(new TypeError("no network in tests")));
      win.navigator.serviceWorker = new win.EventTarget();
      win.navigator.serviceWorker.getRegistrations = async () => [];
      win.caches = { keys: async () => [], delete: async () => true };
      win.URL.createObjectURL = () => "blob:test";
      win.URL.revokeObjectURL = () => {};
      for (const key of Object.keys(opts.storage || {})) {
        win.localStorage.setItem(key, opts.storage[key]);
      }
      if (opts.beforeParse) opts.beforeParse(win);
    },
  });
}

function submit(win, form) {
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
}

/* ---------- 1. the token never leaves for an unknown host ---------- */

test("?api= is ignored on a page that is not local", () => {
  const page = configWindow(
    "https://library.zafar.dpdns.org/notes.html?api=https://evil.example"
  );
  page.Zafar.authGet("/auth/quota");
  assert.ok(page.calls.length, "the page should still ask for the quota");
  for (const call of page.calls) {
    assert.ok(
      call.startsWith(DEPLOYED_API),
      "a non-local page must keep talking to the deployed API, got " + call
    );
    assert.ok(!call.includes("evil.example"), "the token went to evil.example: " + call);
  }
});

test("?api= still works on a local page", () => {
  const page = configWindow("http://127.0.0.1:4173/notes.html?api=http://127.0.0.1:8000/");
  page.Zafar.authGet("/auth/quota");
  assert.equal(page.calls[0], "http://127.0.0.1:8000/auth/quota");
});

/* ---------- 2. server text is filtered before it reaches the screen ---------- */

test("an internal 5xx message is replaced, a fixable 4xx is kept", () => {
  const { Zafar } = configWindow("https://library.zafar.dpdns.org/notes.html");

  assert.equal(
    Zafar.safeMessage(
      { status: 502, message: "Could not reach Drive: project zafar-482113, folder 1SWv79" },
      "Try again"
    ),
    "Try again"
  );
  assert.equal(
    Zafar.safeMessage({ status: 400, message: "Unknown section 'x'" }, "Try again"),
    "Unknown section 'x'"
  );
  assert.equal(Zafar.safeMessage({ status: 0 }, "Offline"), "Offline");
  assert.equal(
    Zafar.safeMessage({ status: 0, timeout: true, message: "This is taking too long." }, "x"),
    "This is taking too long."
  );
});

/* ---------- 3. the grid always matches the search box ---------- */

test("a slow answer cannot overwrite a newer one", async () => {
  const seen = [];
  const doc = (id, name) => ({ id, name, category: "Senior", size_bytes: 1000 });

  const dom = await JSDOM.fromURL(origin + "/notes.html", {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(win) {
      win.localStorage.setItem("zafar_token", token("john"));
      win.fetch = (input) => {
        const url = String(input && input.url ? input.url : input);
        seen.push(url);
        const u = new URL(url, origin + "/");
        if (/\/auth\/quota/.test(u.pathname)) {
          return reply({
            notes_left: 3, notes_limit: 3,
            papers_left: 10, papers_limit: 10,
            books_left: 3, books_limit: 3,
            marking_keys_left: 10, marking_keys_limit: 10,
          });
        }
        if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior", "Junior"]);
        if (/\/drive\/papers/.test(u.pathname)) {
          const q = u.searchParams.get("q") || "";
          // The short query is the slow one: the order a phone network
          // produces all the time.
          const delay = q === "a" ? 400 : 20;
          const rows = q === "a" ? [doc("old1", "ALGEBRA old.pdf")] : [doc("new1", "ALGEBRA NEW.pdf")];
          return new Promise((resolve) => setTimeout(() => resolve(reply(rows)), delay));
        }
        return reply({});
      };
      win.navigator.serviceWorker = new win.EventTarget();
      win.navigator.serviceWorker.getRegistrations = async () => [];
      win.caches = { keys: async () => [], delete: async () => true };
    },
  });

  await wait(600);
  const d = dom.window.document;
  const input = d.querySelector("[data-search]");

  input.value = "a";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(340);
  input.value = "ab";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(900);

  const titles = [...d.querySelectorAll(".item-title")].map((n) => n.textContent);
  assert.ok(titles.some((t) => /NEW/.test(t)), "the newer answer should be on screen: " + titles);
  assert.ok(
    !titles.some((t) => /old/.test(t)),
    "the slow answer for 'a' overwrote the answer for 'ab': " + titles
  );

  // 4. and the same question is not asked twice in a minute
  const before = seen.filter((u) => /\/drive\/papers/.test(u)).length;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(500);
  const after = seen.filter((u) => /\/drive\/papers/.test(u)).length;
  assert.equal(after, before, "a repeated search should be answered from the cache");
});

/* ---------- 5. every string the app asks for exists ---------- */

test("every i18n key used by a page resolves", () => {
  const dom = new JSDOM("<body></body>", { url: "http://127.0.0.1/", runScripts: "outside-only" });
  dom.window.eval(read(I18N));
  const t = dom.window.ZafarI18n.t;

  const sources = [];
  for (const name of fs.readdirSync(WEB)) {
    if (name.endsWith(".html")) sources.push(path.join(WEB, name));
  }
  for (const name of fs.readdirSync(path.join(WEB, "assets/js"))) {
    if (name.endsWith(".js")) sources.push(path.join(WEB, "assets/js", name));
  }

  const keys = new Set();
  for (const file of sources) {
    const text = read(file);
    for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
    for (const m of text.matchAll(/ZafarI18n\.t\(\s*"([a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  }

  assert.ok(keys.size > 20, "the scan should find the app's strings");
  const missing = [...keys].filter((key) => !key.endsWith(".") && t(key) === key);
  assert.deepEqual(missing, [], "these keys are asked for but do not exist");
});

/* ---------- 6. one place knows where the backend is ---------- */

test("the deployed API host is written in exactly one file", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js|css|json|webmanifest)$/.test(entry.name) && full !== CONFIG) {
        if (read(full).includes("koyeb.app")) offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(WEB);
  assert.deepEqual(offenders, [], "these files hardcode the API host");
});

/* ---------- 7. a conflict says which kind of conflict it is ---------- */

test("a conflict marked 'unverified' goes to the code screen and resends", async () => {
  const calls = [];
  const dom = await openPage("/register.html", {
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      calls.push(url);
      if (/\/auth\/register/.test(url)) {
        return reply({ detail: "That email is already registered" }, 409, {
          "X-Error-Code": "unverified",
        });
      }
      if (/\/auth\/resend/.test(url)) return reply({ message: "sent" });
      return reply({});
    },
  });
  await wait(300);

  const d = dom.window.document;
  const w = dom.window;
  d.getElementById("fullName").value = "Test Student";
  d.getElementById("email").value = "student@gmail.com";
  d.getElementById("password").value = "hunter22";
  d.getElementById("confirmPassword").value = "hunter22";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  assert.equal(
    d.getElementById("panel-verify").hidden,
    false,
    "the code screen should be the visible one"
  );
  assert.equal(d.getElementById("verify-email-target").textContent, "student@gmail.com");
  assert.ok(
    calls.some((u) => /\/auth\/resend/.test(u)),
    "an unverified account should be sent a fresh code"
  );
  assert.equal(w.sessionStorage.getItem("zafar_pending_email"), "student@gmail.com");
  dom.window.close();
});

test("a conflict marked 'verified' lands on sign-in, not the code screen", async () => {
  const dom = await openPage("/register.html", {
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/auth\/register/.test(url)) {
        return reply({ detail: "That email is already registered" }, 409, {
          "X-Error-Code": "verified",
        });
      }
      return reply({});
    },
  });
  await wait(300);

  const d = dom.window.document;
  const w = dom.window;
  d.getElementById("fullName").value = "Test Student";
  d.getElementById("email").value = "student@gmail.com";
  d.getElementById("password").value = "hunter22";
  d.getElementById("confirmPassword").value = "hunter22";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  assert.equal(d.getElementById("panel-verify").hidden, true, "no code screen for a verified account");
  assert.equal(d.getElementById("txt-pageTitle").textContent, "Sign in");
  assert.equal(d.getElementById("email").value, "student@gmail.com", "the address stays in the box");
  assert.match(d.getElementById("authBanner").textContent, /already has an account/i);
  dom.window.close();
});

test("an unverified sign-in is recognised by its code, not by its wording", async () => {
  const dom = await openPage("/login.html", {
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/auth\/login/.test(url)) {
        // Deliberately worded so the old /not verified/ test would fail.
        return reply({ detail: "Account pending confirmation" }, 403, {
          "X-Error-Code": "email_not_verified",
        });
      }
      if (/\/auth\/resend/.test(url)) return reply({ message: "sent" });
      return reply({});
    },
  });
  await wait(300);

  const d = dom.window.document;
  const w = dom.window;
  d.getElementById("email").value = "student@gmail.com";
  d.getElementById("password").value = "hunter22";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  assert.equal(d.getElementById("panel-verify").hidden, false);
  assert.equal(d.getElementById("verify-email-target").textContent, "student@gmail.com");
  assert.equal(d.getElementById("authBanner").textContent, "", "no error banner: this is a flow, not a fault");
  dom.window.close();
});

/* ---------- 8. a long catalogue is read a page at a time ---------- */

function catalogue(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: "d" + i, name: "Document " + i + ".pdf", category: "Senior", size_bytes: 1000 });
  }
  return rows;
}

const QUOTA = {
  notes_left: 3, notes_limit: 3,
  papers_left: 10, papers_limit: 10,
  books_left: 3, books_limit: 3,
  marking_keys_left: 10, marking_keys_limit: 10,
};

test("a section larger than one page is read to the end and cached whole", async () => {
  const all = catalogue(250);
  const seen = [];
  const dom = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior", "Junior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        const limit = Number(u.searchParams.get("limit"));
        const offset = Number(u.searchParams.get("offset")) || 0;
        assert.ok(limit > 0, "the page should ask for a bounded page");
        return reply(all.slice(offset, offset + limit));
      }
      return reply({});
    },
  });
  await wait(900);

  const d = dom.window.document;
  const listCalls = seen.filter((u) => /\/drive\/papers/.test(u));
  assert.equal(listCalls.length, 2, "one page of 200 and one of 50: " + listCalls.join(", "));
  assert.ok(listCalls.some((u) => /offset=200/.test(u)), "the second page must be asked for");
  assert.equal(d.querySelector("[data-count]").textContent, "250 results");
  assert.equal(d.querySelectorAll(".item").length, 250);

  // The same question again is answered from the cache, whole.
  const input = d.querySelector("[data-search]");
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(500);
  assert.equal(
    seen.filter((u) => /\/drive\/papers/.test(u)).length,
    listCalls.length,
    "a repeated question should not hit the server"
  );
  dom.window.close();
});

test("a backend that ignores offset is read once, not in a loop", async () => {
  const all = catalogue(200);
  const seen = [];
  const dom = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior", "Junior"]);
      // An older backend: limit and offset are ignored, the whole list comes
      // back every time.
      if (/\/drive\/papers/.test(u.pathname)) return reply(all);
      return reply({});
    },
  });
  await wait(900);

  const d = dom.window.document;
  const listCalls = seen.filter((u) => /\/drive\/papers/.test(u));
  assert.ok(listCalls.length <= 2, "it must stop when a page brings nothing new: " + listCalls.length);
  assert.equal(d.querySelectorAll(".item").length, 200, "no duplicates from the repeated page");
  assert.equal(d.querySelector("[data-count]").textContent, "200 results");
  dom.window.close();
});

/* ---------- 9. the headers that cost nothing are actually served ---------- */

test("_headers closes the obvious doors", () => {
  const headers = read(path.join(WEB, "_headers"));
  for (const rule of [
    "Cache-Control: no-cache",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "frame-ancestors 'none'",
  ]) {
    assert.ok(headers.includes(rule), "_headers is missing: " + rule);
  }
});
