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

// One rule, out of a stylesheet, with the comments stripped: the CSS is part
// of the contract these pages promise a 360px phone, and jsdom does no layout.
function cssRule(file, selector) {
  const css = read(path.join(WEB, "assets/css", file)).replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp("(?:^|\n)" + escaped + "\\s*\\{([^}]*)\\}").exec(css);
  assert.ok(found, file + " has no " + selector + " rule");
  return found[1];
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

test("the first page is 50, and the next page waits until the end is reached", async () => {
  const all = catalogue(250);
  const seen = [];
  const watchers = [];
  const dom = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    // jsdom has no layout, so no scrolling to speak of: stand in for the
    // observer and fire it by hand, which is the only thing the page uses it
    // for anyway.
    beforeParse(win) {
      win.IntersectionObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.targets = [];
          watchers.push(this);
        }
        observe(el) { this.targets.push(el); }
        unobserve(el) { this.targets = this.targets.filter((t) => t !== el); }
        disconnect() { this.targets = []; }
      };
    },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior", "Junior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        const limit = Number(u.searchParams.get("limit"));
        const offset = Number(u.searchParams.get("offset")) || 0;
        const q = (u.searchParams.get("q") || "").toLowerCase();
        assert.equal(limit, 50, "the page should ask for 50, the backend's default: " + url);
        const matched = all.filter((d) => !q || d.name.toLowerCase().includes(q));
        // The count beside the page is of the whole answer, as the backend
        // sends it: a header, not the page size.
        return reply(matched.slice(offset, offset + limit), 200, {
          "X-Total-Count": String(matched.length),
        });
      }
      return reply({});
    },
  });
  await wait(900);

  const d = dom.window.document;
  const papers = () => seen.filter((u) => /\/drive\/papers/.test(u));
  const count = () => d.querySelector("[data-count]").textContent;

  // One request on load. Not two, not twenty-five.
  assert.equal(papers().length, 1, "one page on load: " + papers().join(", "));
  assert.match(papers()[0], /offset=0/);
  assert.equal(d.querySelectorAll(".item").length, 50);
  // And the number is the library's, not the page's.
  assert.equal(count(), "250 results", "the count is the whole answer, not the page");

  const more = d.querySelector("[data-more]");
  const moreBtn = d.querySelector("[data-more-btn]");
  assert.equal(more.hidden, false, "the rest of the list is behind a button");
  assert.equal(moreBtn.textContent, "Load more");

  // Time passing is not a reason to fetch anything.
  await wait(300);
  assert.equal(papers().length, 1, "nothing else is fetched until the list is read");

  // Reaching the end of the list is.
  assert.ok(watchers.length, "the page watches for the end of the list");
  watchers[0].callback([{ target: d.querySelector("[data-sentinel]"), isIntersecting: true }]);
  await wait(300);
  assert.equal(papers().length, 2);
  assert.match(papers()[1], /offset=50/);
  assert.equal(d.querySelectorAll(".item").length, 100);
  assert.equal(count(), "250 results", "a second page does not change how big the answer is");

  // The button does the same for a browser without the observer.
  moreBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await wait(300);
  assert.equal(papers().length, 3);
  assert.match(papers()[2], /offset=100/);
  assert.equal(d.querySelectorAll(".item").length, 150);

  // A new question starts at the first page, and the old rows go with it. The
  // count follows the question: "Document 1" is 111 names, not 250.
  const input = d.querySelector("[data-search]");
  input.value = "Document 1";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(600);
  const last = papers()[papers().length - 1];
  assert.match(last, /offset=0/, "a new question starts at the first page");
  assert.match(last, /q=Document/);
  assert.equal(d.querySelectorAll(".item").length, 50);
  assert.equal(count(), "111 results", "the count is of the search, not of the shelf");

  // The same question again is answered from the cache.
  const before = papers().length;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(500);
  assert.equal(papers().length, before, "a repeated question should not hit the server");
  dom.window.close();
});

test("a server that sends no count gets 50+, never 50", async () => {
  const all = catalogue(250);
  const seen = [];
  const dom = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior"]);
      // An older backend: pages, but no X-Total-Count beside them.
      if (/\/drive\/papers/.test(u.pathname)) {
        const limit = Number(u.searchParams.get("limit"));
        const offset = Number(u.searchParams.get("offset")) || 0;
        return reply(all.slice(offset, offset + limit));
      }
      return reply({});
    },
  });
  await wait(900);

  const d = dom.window.document;
  const count = () => d.querySelector("[data-count]").textContent;
  assert.equal(d.querySelectorAll(".item").length, 50);
  // It cannot know it is 250, so it must not claim the list ends at 50 either.
  assert.equal(count(), "50+ results");

  // Once every page is in, "250+" would be as wrong as "250" was early: the
  // page knows the whole answer now.
  const moreBtn = d.querySelector("[data-more-btn]");
  // 250 is exactly five pages, so every page is full and five pages fill the
  // screen — but without a count the page cannot yet say the shelf has ended.
  for (let i = 0; i < 4; i++) {
    moreBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await wait(300);
  }
  assert.equal(d.querySelectorAll(".item").length, 250);
  assert.equal(d.querySelector("[data-count]").textContent, "250+ results");
  moreBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await wait(300);
  assert.equal(d.querySelectorAll(".item").length, 250);
  assert.equal(count(), "250 results");
  assert.equal(d.querySelector("[data-more]").hidden, true);
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
  const papers = () => seen.filter((u) => /\/drive\/papers/.test(u));
  const expected = d.querySelectorAll(".item").length;
  assert.equal(expected, 200, "what came back is shown");
  assert.equal(d.querySelector("[data-count]").textContent, "200+ results", "no count, no claim");

  // Asking again brings the same rows. Nothing new means the end of the list,
  // so the button goes away rather than asking for a page that cannot arrive.
  const moreBtn = d.querySelector("[data-more-btn]");
  assert.equal(d.querySelector("[data-more]").hidden, false);
  moreBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await wait(400);

  assert.equal(papers().length, 2, "it asks once more, then stops: " + papers().join(", "));
  assert.equal(d.querySelectorAll(".item").length, 200, "no duplicates from the repeated page");
  assert.equal(d.querySelector("[data-count]").textContent, "200 results");
  assert.equal(d.querySelector("[data-more]").hidden, true, "there is nothing more to load");
  dom.window.close();
});

/* ---------- 8e2. the owner's second factor ---------- */

test("the authenticator code is asked for only when the API asks for it", async () => {
  const posts = [];
  const dom = await openPage("/login.html", {
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      const body = String((init && init.body) || "");
      posts.push({ url, body });
      if (/\/auth\/login/.test(url)) {
        // First attempt: no code, so the API says it needs one. Second: accepted.
        if (/totp_code=\d{6}/.test(body)) return reply({ access_token: "jwt" });
        return reply({ detail: "Enter the current authenticator code" }, 401, {
          "X-Error-Code": "admin_totp_required",
        });
      }
      return reply({});
    },
  });
  await wait(300);
  const w = dom.window;
  const d = w.document;

  // Nothing asks a student for a code before the server does.
  assert.equal(d.getElementById("field-totp").hidden, true, "the field starts hidden");

  d.getElementById("email").value = "owner@gmail.com";
  d.getElementById("password").value = "correct horse";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  assert.equal(d.getElementById("field-totp").hidden, false, "the field appears when asked");
  assert.match(d.getElementById("authBanner").textContent, /authenticator app/i);
  assert.equal(d.activeElement, d.getElementById("totpCode"), "and the cursor is in it");
  assert.doesNotMatch(d.getElementById("authBanner").textContent, /Enter the current authenticator code/,
    "the server's sentence is not repeated");

  d.getElementById("totpCode").value = "123456";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  const second = posts.filter((p) => /\/auth\/login/.test(p.url)).pop();
  assert.match(second.body, /totp_code=123456/, "the second attempt carries the code");
  assert.match(second.body, /email=owner%40gmail\.com/);
  dom.window.close();
});

test("an owner with no authenticator is told why they cannot sign in", async () => {
  const dom = await openPage("/login.html", {
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/auth\/login/.test(url)) {
        return reply({ detail: "Owner authenticator is not enrolled" }, 403, {
          "X-Error-Code": "admin_mfa_unavailable",
        });
      }
      return reply({});
    },
  });
  await wait(300);
  const w = dom.window;
  const d = w.document;
  d.getElementById("email").value = "owner@gmail.com";
  d.getElementById("password").value = "correct horse";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  const banner = d.getElementById("authBanner").textContent;
  assert.match(banner, /authenticator enrolled/i);
  assert.doesNotMatch(banner, /Owner authenticator is not enrolled/, "no server wording");
  // It is a dead end that needs a human, so the field would only tease.
  assert.equal(d.getElementById("field-totp").hidden, true);
  dom.window.close();
});

test("a Google owner is asked for the code and the token is reused", async () => {
  const bodies = [];
  const dom = await openPage("/login.html", {
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/auth\/google/.test(url)) {
        const body = JSON.parse(String((init && init.body) || "{}"));
        bodies.push(body);
        if (!body.totp_code) {
          return reply({ detail: "Enter the current authenticator code" }, 401, {
            "X-Error-Code": "admin_totp_required",
          });
        }
        return reply({ access_token: "jwt" });
      }
      return reply({});
    },
  });
  await wait(300);
  const w = dom.window;
  const d = w.document;

  w.ZafarAuth.signInWithGoogle("google-id-token");
  await wait(400);

  assert.equal(d.getElementById("field-totp").hidden, false);
  assert.match(d.getElementById("authBanner").textContent, /authenticator app/i);
  assert.equal(d.getElementById("googleZone").hidden, true, "Google steps aside for the code");

  d.getElementById("totpCode").value = "654321";
  submit(w, d.getElementById("authForm"));
  await wait(400);

  assert.deepEqual(bodies[bodies.length - 1], { credential: "google-id-token", totp_code: "654321" },
    "the same Google token, with the code: no second popup");
  dom.window.close();
});

/* ---------- 8e3. public settings reach the student site ---------- */

function siteConfigPage(config, opts) {
  const extra = opts || {};
  const seen = [];
  return openPage(extra.path || "/dashboard.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply(config);
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/admin\/whoami/.test(u.pathname)) return reply({ detail: "Admins only" }, 403);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["MSCE Maneb"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply(
          [
            { id: "featured-1", name: "MSCE Chemistry 2024.pdf", category: "MSCE Maneb", size_bytes: 1000 },
            { id: "other-2", name: "MSCE Biology 2024.pdf", category: "MSCE Maneb", size_bytes: 1000 },
          ],
          200,
          { "X-Total-Count": "2" }
        );
      }
      return reply({});
    },
  }).then((dom) => ({ dom, seen }));
}

test("an announcement and the featured papers come from the server, not the code", async () => {
  const { dom, seen } = await siteConfigPage({
    announcement: "MSCE 2026 papers are up",
    maintenance: false,
    featured: ["featured-1"],
  });
  await wait(900);
  const d = dom.window.document;

  assert.equal(d.querySelector(".announce").textContent.includes("MSCE 2026 papers are up"), true);

  // One pill, on the right card, and nothing invented from an id alone.
  const pills = [...d.querySelectorAll(".item-featured")];
  assert.equal(pills.length, 1, "exactly one featured badge");
  // The card title drops the extension; the point is that it is the right card.
  assert.equal(pills[0].closest(".item").textContent.includes("MSCE Chemistry 2024"), true);

  // Dismissal is per session: the strip goes, and stays gone for this visit.
  d.querySelector(".announce-x").click();
  assert.equal(d.querySelector(".announce"), null);
  assert.equal(dom.window.sessionStorage.getItem("zafar_announce_dismissed"), "MSCE 2026 papers are up");
  dom.window.close();
});

test("maintenance hides the app from students, and only from students", async () => {
  const student = await siteConfigPage({ announcement: null, maintenance: true, featured: [] });
  await wait(900);
  const text = student.dom.window.document.body.textContent;
  assert.ok(student.dom.window.document.querySelector(".maintenance"), "the app is replaced");
  assert.match(text, /being updated/i);
  // No half-drawn app behind it.
  assert.equal(student.dom.window.document.querySelector(".app-bar"), null);
  student.dom.window.close();

  // An admin who is signed in still gets in: they are the one who turns it off.
  const admin = await openPage("/dashboard.html", {
    storage: { zafar_token: token("owner") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ maintenance: true, featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({ email: "owner@gmail.com", role: "owner" });
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["MSCE Maneb"]);
      return reply([]);
    },
  });
  await wait(900);
  assert.equal(admin.window.document.querySelector(".maintenance"), null, "an admin is not locked out");
  assert.equal(admin.window.document.querySelector("[data-admin-slot] a").getAttribute("href"), "admin.html",
    "and finds a way into the portal");
  admin.window.close();
});

test("the public config is fetched once per session", async () => {
  const seen = [];
  const dom = await openPage("/dashboard.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply([]);
      return reply([]);
    },
  });
  await wait(900);
  // The page asks, and an explicit second ask is served from the cache.
  await dom.window.Zafar.siteConfig(true).catch(() => null);
  const before = seen.filter((u) => /\/site-config$/.test(u)).length;
  await dom.window.Zafar.siteConfig();
  await dom.window.Zafar.siteConfig();
  const after = seen.filter((u) => /\/site-config$/.test(u)).length;
  assert.equal(after, before, "the second and third reads cost nothing");
  dom.window.close();
});

/* ---------- 8e4. what a student can send us ---------- */

// Only one form now: asking for a file that is missing. The "!" control that
// reported a broken file lived on each card and was removed by request; with
// it went the dialog, and the card's own id went with them, which is what a
// report needs (see README). */

function studentSite(hooks) {
  const extra = hooks || {};
  return openPage(extra.path || "/dashboard.html", {
    storage: { zafar_token: token("student") },
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({ detail: "Admins only" }, 403);
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["MSCE Maneb"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply(
          [{ id: "p1", name: "MSCE Chemistry 2024.pdf", category: "MSCE Maneb", size_bytes: 1000 }],
          200,
          { "X-Total-Count": "1" }
        );
      }
      if (extra.onPost && (init && init.method) === "POST") return extra.onPost(u, init);
      return reply({});
    },
  });
}

test("a request for a missing file goes to the queue, not to an inbox", async () => {
  const posts = [];
  const dom = await studentSite({
    path: "/help.html",
    onPost: (u, init) => {
      if (!/\/requests$/.test(u.pathname)) return reply({});
      posts.push({ body: JSON.parse(String(init.body || "{}")), auth: init.headers && init.headers.Authorization });
      return reply({ id: 7 }, 201);
    },
  });
  await wait(900);
  const w = dom.window;
  const d = w.document;

  const form = d.querySelector("[data-request-form]");
  const done = d.querySelector("[data-request-done]");
  const error = d.querySelector("[data-request-error]");
  assert.ok(form, "the Help page asks for what is missing");
  assert.equal(done.hidden, true, "and starts by asking, not by thanking");

  // The library's own folder keys, not free text.
  const sections = [...d.querySelectorAll("#request-section option")].map((o) => o.value);
  assert.deepEqual(sections, ["papers", "primary", "books", "notes", "marking-keys"],
    "the API's Section literal, key for key");

  // The API refuses more than 160 characters of title and 2000 of note
  // (Field(max_length=…)); the boxes stop the typing instead of the 422.
  assert.equal(d.querySelector("#request-title").getAttribute("maxlength"), "160");
  assert.equal(d.querySelector("#request-note").getAttribute("maxlength"), "2000");

  // An empty box is not a request.
  submit(w, form);
  await wait(200);
  assert.equal(posts.length, 0, "nothing was sent");
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /Fill in/i);
  assert.equal(d.querySelector("#request-title").classList.contains("has-error"), true);

  d.querySelector("#request-section").value = "books";
  d.querySelector("#request-title").value = "Form 3 Biology textbook";
  submit(w, form);
  await wait(400);

  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { section: "books", title: "Form 3 Biology textbook" },
    "no empty note, no email: the account is the bearer token");
  assert.match(posts[0].auth, /^Bearer /);

  assert.equal(done.hidden, false, "the page confirms it arrived");
  assert.equal(form.hidden, true);

  // "Send another" clears the boxes rather than resending the same thing.
  d.querySelector("[data-request-again]").click();
  assert.equal(form.hidden, false);
  assert.equal(d.querySelector("#request-title").value, "");
  assert.equal(d.querySelector("#request-section").value, "papers", "back to the first section");
  dom.window.close();
});

/* ---------- 8f. the admin portal: gates, roles, and no invented numbers ---------- */

const ADMIN_OVERVIEW = {
  users: { total: 128, verified: 96, new_today: 4 },
  downloads: { today: 37, total: 1420, failed_today: 2 },
  daily: [
    { date: "2026-11-07", signups: 2, downloads: 20, failed: 1 },
    { date: "2026-11-08", signups: 4, downloads: 37, failed: 2 },
  ],
  top_files: [{ id: "f1", name: "MSCE Maths 2023.pdf", section: "papers", downloads: 41 }],
  top_subjects: [{ subject: "Mathematics", downloads: 88 }],
  zero_result_searches: [{ q: "physics paper 2 2026", count: 7 }],
};

function adminPage(hooks) {
  const opts = hooks || {};
  return openPage("/admin", {
    beforeParse: (win) => {
      win.confirm = () => true;
      if (opts.beforeParse) opts.beforeParse(win);
    },
    fetch: opts.fetch,
    storage: opts.storage,
  });
}

test("without an admin API the portal says so and shows no numbers", async () => {
  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: () => reply({ detail: "Not Found" }, 404),
  });
  await wait(400);
  const text = dom.window.document.getElementById("view").textContent;

  assert.match(text, /admin API isn't deployed yet/i);
  assert.match(text, /docs\/admin-portal\.md/, "and points at the contract");
  // The whole point: no sample data anywhere on the page.
  assert.doesNotMatch(text, /\b128\b|\b1,?420\b|MSCE Maths/, "nothing is invented: " + text.slice(0, 200));
  assert.equal(dom.window.document.getElementById("tabs").hidden, true, "and no tabs to click");
  dom.window.close();
});

test("signed out is a sign-in gate; a student is turned away", async () => {
  const anon = await adminPage({ fetch: () => reply({}) });
  await wait(300);
  assert.match(anon.window.document.getElementById("view").textContent, /Sign in first/i);
  assert.equal(anon.window.document.querySelector("#view a[href^='login.html']").getAttribute("href"), "login.html?switch=1");
  anon.window.close();

  const student = await adminPage({
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/admin\/whoami/.test(url)) return reply({ detail: "Admins only" }, 403, { "X-Error-Code": "admin_forbidden" });
      return reply({});
    },
  });
  await wait(400);
  const text = student.window.document.getElementById("view").textContent;
  assert.match(text, /for administrators/i);
  assert.doesNotMatch(text, /Admins only/, "the server's own wording stays off the screen");
  student.window.close();
});

test("an owner sees the numbers the API actually sent", async () => {
  const seen = [];
  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      if (/\/admin\/whoami/.test(url)) return reply({ email: "owner@gmail.com", name: "Owner", role: "owner" });
      if (/\/admin\/overview/.test(url)) return reply(ADMIN_OVERVIEW);
      return reply({});
    },
  });
  await wait(500);
  const d = dom.window.document;
  const text = d.getElementById("view").textContent;

  assert.match(seen.join(" "), /\/admin\/overview\?days=14/);
  assert.match(text, /128/);
  assert.match(text, /96 verified/);
  assert.match(text, /37/);
  // Top files, top subjects and the upload list all come from the payload.
  assert.match(text, /MSCE Maths 2023\.pdf/);
  assert.match(text, /Mathematics/);
  assert.match(text, /physics paper 2 2026/);
  // Bars: one column per day, scaled from the data.
  assert.equal(d.querySelectorAll(".chart .col").length, 2);
  // The chrome names who you are and what you may do.
  assert.equal(d.querySelector(".role-chip").textContent, "Owner");
  assert.equal(d.getElementById("tabs").hidden, false);
  dom.window.close();
});

test("a viewer gets the numbers and nothing that changes anything", async () => {
  const dom = await adminPage({
    storage: { zafar_token: token("viewer") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/admin\/whoami/.test(url)) return reply({ email: "v@gmail.com", role: "viewer" });
      if (/\/admin\/overview/.test(url)) return reply(ADMIN_OVERVIEW);
      return reply({});
    },
  });
  await wait(500);
  const d = dom.window.document;
  const tabs = [...d.querySelectorAll("#tabs .tab")].map((b) => b.textContent);

  assert.deepEqual(tabs, ["Overview"], "a viewer sees statistics only: " + tabs.join(", "));
  // There is no tab to click, so there is nothing to click by accident — and a
  // hand-typed #users does not open a panel the role cannot have.
  assert.equal(d.querySelector('[data-tab="users"]'), null, "no users tab for a viewer");
  assert.equal(dom.window.location.hash, "#overview");
  dom.window.close();
});

test("the users table is real, and suspending posts the right thing", async () => {
  const calls = [];
  const users = [
    { id: "1", email: "amina@gmail.com", name: "Amina", role: null, is_verified: true,
      signup_method: "google", created_at: "2026-10-02T09:10:00Z", last_active_at: "2026-11-08T05:00:00Z", downloads: 12 },
    { id: "2", email: "bob@gmail.com", name: "Bob", role: null, suspended: true,
      signup_method: "email", created_at: "2026-09-01T09:10:00Z", last_active_at: null, downloads: 0 },
  ];
  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      calls.push({ url, method: (init && init.method) || "GET", body: init && init.body });
      if (/\/admin\/whoami/.test(url)) return reply({ email: "owner@gmail.com", role: "owner" });
      if (/\/admin\/users\/1\/suspend/.test(url)) return reply({ id: "1", suspended: true });
      if (/\/admin\/users/.test(url)) return reply(users, 200, { "X-Total-Count": "2" });
      return reply({});
    },
  });
  await wait(300);
  const d = dom.window.document;

  d.querySelector('[data-action="tab"][data-tab="users"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await wait(400);

  const view = d.getElementById("view").textContent;
  assert.match(view, /amina@gmail\.com/);
  assert.match(view, /Google/, "the sign-in method is shown");
  assert.match(view, /Suspended/, "so is a suspended account");
  assert.match(view, /1\u20132 of 2/, "and the page count comes from X-Total-Count");

  // On a phone the header row is not beside the values any more: every cell
  // carries its own column name, which is what the stacked layout shows.
  const firstRow = d.querySelector("#view table tbody tr");
  const labels = [...firstRow.querySelectorAll("td")].map((td) => td.getAttribute("data-label"));
  assert.ok(labels.includes("Account"), "cells carry their column name: " + labels.join(", "));
  assert.ok(labels.includes("Status"), "including the one that is a badge");
  assert.equal(labels.length, firstRow.querySelectorAll("td").length);

  // Suspend is a POST with a boolean, on the account's own path.
  d.querySelector('[data-action="suspend"][data-id="1"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await wait(400);
  const suspend = calls.filter((c) => /\/admin\/users\/1\/suspend$/.test(c.url))[0];
  assert.ok(suspend, "no suspend request: " + JSON.stringify(calls.map((c) => c.method + " " + c.url)));
  assert.equal(suspend.method, "POST");
  assert.deepEqual(JSON.parse(suspend.body), { suspended: true });

  // Search is a query the API does, not a filter of the page.
  const search = d.getElementById("userSearch");
  search.value = "amina";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await wait(600);
  assert.ok(calls.some((c) => /\/admin\/users\?.*q=amina/.test(c.url)), "the search went to the API");
  dom.window.close();
});

test("the portal is a tool, not a page", () => {
  const html = read(path.join(WEB, "admin.html"));
  assert.match(html, /<meta name="robots" content="noindex/);
  const robots = read(path.join(WEB, "robots.txt"));
  assert.match(robots, /Disallow: \/admin\b/);
  const headers = read(path.join(WEB, "_headers"));
  assert.match(headers, /X-Robots-Tag: noindex/);
  // Nothing in the student app links to it.
  for (const page of ["login.html", "dashboard.html", "help.html", "index.html"]) {
    const body = read(path.join(WEB, page));
    assert.doesNotMatch(body, /admin\.html/, page + " links to the admin portal");
  }
});

/* ---------- 9a2. a cold library scan is not cut off at 15 seconds ---------- */

test("the catalogue waits longer than the app's normal deadline, and retries once", async () => {
  const dom = await openPage("/login.html", { fetch: () => reply({}) });
  await wait(300);
  const Z = dom.window.Zafar;

  // The two deadlines, and why they differ: the server may spend twenty
  // seconds in a single Drive call while it builds its tree on a cold start, so
  // a browser deadline at or below that can only ever abort work that was
  // going to answer.
  assert.equal(Z.REQUEST_TIMEOUT_MS, 15000, "forms keep the tight deadline");
  assert.ok(Z.LIST_TIMEOUT_MS > 20000, "the catalogue deadline must outlast one Drive call");
  assert.ok(Z.LIST_TIMEOUT_MS >= 30000, "and leave the scan room: " + Z.LIST_TIMEOUT_MS);

  // The deadline actually reaches fetch: the third argument of _fetch is the
  // one that arms the abort timer.
  const seen = [];
  Z._fetch = function (url, opts, ms) {
    seen.push({ path: String(url).replace(/^https?:\/\/[^/]+/, ""), ms });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve([]),
    });
  };
  await Z.authGetMeta("/drive/papers?section=papers", { timeout: Z.LIST_TIMEOUT_MS, attempts: 1 });
  assert.equal(seen[seen.length - 1].ms, Z.LIST_TIMEOUT_MS);

  // A request that asks for nothing keeps the fifteen seconds.
  await Z.authGet("/auth/quota", { attempts: 1 });
  assert.equal(seen[seen.length - 1].ms, undefined);

  // And the page passes those options at both catalogue call sites — a helper
  // nobody calls is not a fix.
  const list = read(path.join(WEB, "assets/js/list.js"));
  assert.match(list, /timeout:\s*Zafar\.LIST_TIMEOUT_MS/);
  assert.match(
    list,
    /authGetMeta\(pageURL\(section, entry\.nextOffset\), catalogueOpts\(/,
    "the papers page asks with the catalogue deadline"
  );
  assert.match(
    list,
    /authGet\("\/drive\/categories\?section=" \+ encodeURIComponent\(wanted\), catalogueOpts\(\)\)/,
    "so do the folders"
  );

  // The retry: a timeout is tried again, once, and the second answer is used.
  let attempts = 0;
  const answer = await Z._withRetry(
    () => {
      attempts += 1;
      if (attempts === 1) {
        const timeout = new Error("This is taking too long. Check your connection and try again.");
        timeout.timeout = true;
        return Promise.reject(timeout);
      }
      return Promise.resolve("second answer");
    },
    { attempts: 2, delay: 5 }
  );
  assert.equal(answer, "second answer");
  assert.equal(attempts, 2, "one retry, not a loop");

  // A refusal is an answer: never repeated.
  let refused = 0;
  await Z._withRetry(
    () => {
      refused += 1;
      const err = new Error("Not Found");
      err.status = 404;
      return Promise.reject(err);
    },
    { attempts: 3, delay: 5 }
  ).catch(() => {});
  assert.equal(refused, 1, "a 404 is not retried");

  // A platform hiccup is worth one more try; a dead session is not — retrying
  // a 401 would just be three logouts in a row.
  assert.equal(Z._retryable({ status: 503 }), true);
  assert.equal(Z._retryable({ status: 502 }), true);
  assert.equal(Z._retryable({ timeout: true }), true);
  assert.equal(Z._retryable({ status: 401 }), false);
  assert.equal(Z._retryable({ status: 403 }), false);

  // While the retry is pending the page says so, rather than leaving a still
  // skeleton that reads as a dead page.
  const i18n = read(path.join(WEB, "assets/js/i18n.js"));
  assert.match(i18n, /loadingSlow: "Still loading/);
  dom.window.close();
});

/* ---------- 9b. Primary is a shelf inside Past Papers ---------- */

test("Primary swaps the shelf, not the allowance", async () => {
  const seen = [];
  const row = (section) => ({
    id: section + "-1",
    name: (section === "primary" ? "PSLC" : "MSCE") + " Mathematics 2023.pdf",
    category: section === "primary" ? "PSLC Maneb" : "MSCE Maneb",
    size_bytes: 1000,
  });
  const dom = await openPage("/dashboard.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) {
        return reply(
          u.searchParams.get("section") === "primary"
            ? ["PSLC Maneb", "Primary Mock"]
            : ["MSCE Maneb", "Mock"]
        );
      }
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply([row(u.searchParams.get("section"))], 200, { "X-Total-Count": "1" });
      }
      return reply({});
    },
  });
  await wait(900);

  const d = dom.window.document;
  const papers = () => seen.filter((u) => /\/drive\/papers/.test(u));
  const levels = () => [...d.querySelectorAll("[data-switch] [data-level]")];

  // It is a switch on the page, not a sixth tab at the bottom.
  assert.deepEqual(levels().map((b) => b.textContent), ["Secondary", "Primary"]);
  const tabs = [...d.querySelectorAll(".tabbar .tab")].map((a) => a.textContent.trim());
  assert.ok(!tabs.some((label) => /primary/i.test(label)), "no sixth tab: " + tabs.join(" | "));
  assert.equal(levels()[0].getAttribute("aria-pressed"), "true", "Secondary first");
  assert.match(papers()[0], /section=papers/);
  assert.match(papers()[0], /limit=50/);
  // Past Papers counts its own allowance, in its own words — the same pill
  // every section gets.
  assert.equal(d.querySelector("[data-quota]").hidden, false);
  assert.equal(d.querySelector("[data-quota-text]").textContent, "10 papers left today");

  levels()[1].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await wait(700);

  const primaryCall = papers()[papers().length - 1];
  assert.match(primaryCall, /section=primary/);
  assert.match(primaryCall, /limit=50/);
  assert.match(primaryCall, /offset=0/, "a new shelf starts at the first page");
  assert.equal(levels()[1].getAttribute("aria-pressed"), "true");
  assert.equal(d.querySelector("[data-count]").textContent, "1 result");
  assert.match(d.querySelector(".item-title").textContent, /PSLC/);
  // The folders follow the shelf: a Secondary category would filter Primary to nothing.
  assert.match(d.querySelector("[data-cat-chips]").textContent, /PSLC Maneb/);
  // One bucket for both: one allowance answer for the page, and the pill stays
  // out of it — the numbers live in config and the notice, not in a Books-only
  // counter.
  assert.equal(seen.filter((u) => /\/auth\/quota/.test(u)).length, 1, "no second allowance");
  // And the download knows which shelf the file came from.
  assert.equal(d.querySelector("[data-download]").dataset.section, "primary");
  dom.window.close();
});

/* ---------- 8c. the shell: four tabs, a drawer, and an allowance in words ---------- */

// A signed-in student with a catalogue of one book, so a list page has
// something to draw without a real backend.
function libraryPage(path, extra) {
  const opts = extra || {};
  return openPage(path, {
    storage: Object.assign({ zafar_token: token("student") }, opts.storage || {}),
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({ detail: "Admins only" }, 403);
      if (/\/auth\/quota/.test(u.pathname)) return reply(opts.quota || QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior", "Junior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply(
          [{ id: "b1", name: "Mathematics Form 3.pdf", category: "Senior", size_bytes: 2048 }],
          200,
          { "X-Total-Count": "1" }
        );
      }
      if (opts.onPost && init && init.method === "POST") return opts.onPost(u, init);
      return reply({});
    },
  });
}

test("the bar has four tabs, in order, and Favorites is not one of them", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;

  const tabs = [...d.querySelectorAll(".tabbar .tab")];
  assert.equal(tabs.length, 4, "four sections in the bar");
  assert.deepEqual(
    tabs.map((a) => a.querySelector(".tab-label").textContent),
    ["Books", "Past Papers", "Notes", "Marking Keys"]
  );
  assert.deepEqual(
    tabs.map((a) => a.getAttribute("href")),
    ["books.html", "dashboard.html", "notes.html", "marking-keys.html"]
  );
  // Books is where a student starts, and the bar says so.
  assert.equal(tabs[0].classList.contains("active"), true);
  assert.equal(tabs[0].getAttribute("aria-current"), "page");
  assert.equal(d.querySelector(".app-title").textContent, "Books");
  // The eyebrow, the breadcrumb and its slash are gone: the title is the
  // whole of row two on the left.
  assert.equal(d.querySelector(".crumb"), null);
  assert.equal(d.querySelector(".page-path"), null);
  assert.equal(d.querySelector(".sep"), null);
  assert.doesNotMatch(d.getElementById("app").textContent, /Library/);
  // Icons are 24×24 and drawn on whole pixels: the blur came from both.
  for (const glyph of tabs.map((a) => a.querySelector(".tab-ic svg"))) {
    assert.equal(glyph.getAttribute("width"), "24");
    assert.equal(glyph.getAttribute("height"), "24");
    assert.equal(glyph.getAttribute("shape-rendering"), "geometricPrecision");
  }
  assert.equal(d.querySelectorAll(".tabbar a[href*='favorites']").length, 0);
  dom.window.close();
});

test("the hamburger opens a drawer that holds Settings, Help and Log out", async () => {
  const dom = await libraryPage("/notes.html", { storage: { zafar_me: JSON.stringify({ name: "Priam Zafar", email: "priam@gmail.com" }) } });
  await wait(700);
  const w = dom.window;
  const d = w.document;

  // No Log out in the bar any more: the bar has the name and Help.
  assert.equal(d.querySelector(".app-bar [data-logout]"), null);
  assert.equal(d.querySelector('.app-bar a[href="help.html"]').getAttribute("aria-label"), "Help & FAQ");
  assert.equal(d.querySelector("[data-greeting]").textContent, "Hi, Priam");
  assert.equal(d.querySelector(".avatar").textContent, "PZ");

  const drawer = d.querySelector("[data-drawer]");
  assert.equal(drawer.hidden, true, "the drawer starts out of the way");
  assert.equal(drawer.id, "app-drawer", "the hamburger says what it controls");
  d.querySelector(".bar-circle[data-drawer-open]").click();
  assert.equal(drawer.hidden, false);
  assert.equal(d.querySelector(".bar-circle[data-drawer-open]").getAttribute("aria-expanded"), "true");

  // Six destinations. My Downloads is not one of them, and neither is
  // anything that only the drawer page could have linked to.
  const links = [...drawer.querySelectorAll(".drawer-link")].map((a) => a.textContent.trim());
  assert.deepEqual(links, ["Books", "Past Papers", "Notes", "Marking Keys", "Settings", "Help & FAQ"]);
  assert.equal(drawer.querySelectorAll('a[href="downloads.html"]').length, 0);
  assert.equal(drawer.querySelector("[data-email]").textContent, "priam@gmail.com");
  assert.equal(drawer.querySelector("[data-full-name]").textContent, "Priam Zafar");

  // Log out is soft red, and it asks first.
  const out = drawer.querySelector("[data-logout-open]");
  assert.equal(out.classList.contains("btn-danger-soft"), true);
  out.click();
  const modal = d.querySelector("[data-logout-modal]");
  assert.equal(modal.hidden, false, "a confirmation, not an instant exit");
  assert.match(modal.querySelector("h2").textContent, /Log out\?/);

  // Cancel keeps the session; confirming ends it.
  modal.querySelector("[data-logout-cancel]").click();
  assert.equal(modal.hidden, true);
  assert.ok(w.localStorage.getItem("zafar_token"), "cancelling changes nothing");
  d.querySelector(".bar-circle[data-drawer-open]").click();
  d.querySelector("[data-logout-open]").click();
  d.querySelector("[data-logout-confirm]").click();
  await wait(60);
  assert.equal(w.localStorage.getItem("zafar_token"), null, "the token is gone");
  // jsdom does not navigate, so the assertion stops at the token: clearing it
  // is what makes the next page's guard send the student to sign-in.
  assert.equal(w.sessionStorage.getItem("zafar_admin_role"), null, "and the cached role");
  dom.window.close();
});

test("the hamburger is a toggle, and the drawer closes four ways", async () => {
  const dom = await libraryPage("/books.html", {
    storage: { zafar_me: JSON.stringify({ name: "Priam Zafar", email: "priam@gmail.com" }) },
  });
  await wait(700);
  const w = dom.window;
  const d = w.document;

  const burger = d.querySelector(".app-bar .bar-circle[data-drawer-open]");
  const avatarBtn = d.querySelector(".app-bar .avatar");
  const drawer = d.querySelector("[data-drawer]");
  const panel = d.querySelector("[data-drawer-panel]");

  // The control announces itself, and its state, before anything is tapped.
  assert.equal(burger.tagName, "BUTTON");
  assert.equal(burger.getAttribute("aria-label"), "Open menu");
  assert.equal(burger.getAttribute("aria-expanded"), "false");
  assert.equal(burger.getAttribute("aria-controls"), drawer.id);
  const glyph = burger.querySelector("svg");
  assert.equal(glyph.getAttribute("width"), "24");
  assert.equal(glyph.getAttribute("height"), "24");
  assert.equal(glyph.getAttribute("shape-rendering"), "geometricPrecision");

  // Open.
  burger.click();
  await wait(30);
  assert.equal(drawer.hidden, false);
  assert.equal(drawer.classList.contains("is-open"), true);
  assert.equal(burger.getAttribute("aria-expanded"), "true");
  assert.equal(avatarBtn.getAttribute("aria-expanded"), "true", "both openers agree");

  // The same thumb, the same place: tapping it again closes.
  burger.click();
  await wait(300);
  assert.equal(drawer.classList.contains("is-open"), false);
  assert.equal(drawer.hidden, true, "and it is out of the way after the slide");
  assert.equal(burger.getAttribute("aria-expanded"), "false");

  // The avatar is a second way in.
  avatarBtn.click();
  await wait(30);
  assert.equal(drawer.hidden, false);
  // …and the X on the profile card is a way out.
  const x = panel.querySelector(".drawer-x");
  assert.ok(x, "the panel carries its own close button");
  assert.equal(x.getAttribute("aria-label"), "Close menu");
  x.click();
  await wait(300);
  assert.equal(drawer.hidden, true);

  // Escape closes it too.
  burger.click();
  await wait(30);
  panel.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(300);
  assert.equal(drawer.hidden, true);
  assert.equal(burger.getAttribute("aria-expanded"), "false");
  dom.window.close();
});

test("the header is two rows: the bar, then the section and its allowance", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;
  const bar = d.querySelector(".app-bar");
  const rows = [...bar.querySelectorAll(".bar-row")];
  assert.equal(rows.length, 2, "two rows, not three and not one wrapping one");

  // Row one, in order: menu, avatar, greeting, Help. Nothing else, and Help
  // is inside the row rather than below it.
  const top = [...rows[0].children];
  assert.deepEqual(
    top.map((node) => node.getAttribute("class")),
    ["bar-circle", "avatar", "me-hi", "bar-circle"]
  );
  assert.equal(top[0].getAttribute("aria-label"), "Open menu");
  assert.equal(top[1].hasAttribute("data-avatar"), true);
  assert.equal(top[2].hasAttribute("data-greeting"), true);
  assert.equal(top[3].tagName, "A");
  assert.equal(top[3].getAttribute("href"), "help.html");

  // Row two: the section alone on the left, the allowance on the right.
  const second = [...rows[1].children];
  assert.deepEqual(second.map((node) => node.className), ["app-title", "quota"]);
  assert.equal(second[0].textContent, "Books");
  assert.equal(second[1].hidden, false, "the pill is on Books");
  assert.equal(d.querySelector(".app-bar .bar-row [data-quota]"), second[1]);

  // Every section puts its own allowance in the same place.
  dom.window.close();
  const notes = await libraryPage("/notes.html");
  await wait(900);
  const nd = notes.window.document;
  assert.equal(nd.querySelector(".app-bar [data-quota]").hidden, false);
  assert.equal(nd.querySelector("[data-quota-text]").textContent, "3 notes left today");
  assert.equal(nd.querySelector(".bar-row-title .app-title").textContent, "Notes");
  notes.window.close();

  // The CSS contract the phone relies on: one line, a truncating greeting, and
  // 40px circles at both ends.
  const row = cssRule("app.css", ".bar-row");
  assert.match(row, /display:\s*flex/);
  assert.match(row, /flex-wrap:\s*nowrap/);
  assert.match(row, /align-items:\s*center/);
  const greeting = cssRule("app.css", ".me-hi");
  assert.match(greeting, /flex:\s*1/);
  assert.match(greeting, /min-width:\s*0/);
  assert.match(greeting, /text-overflow:\s*ellipsis/);
  assert.match(greeting, /white-space:\s*nowrap/);
  const circle = cssRule("app.css", ".bar-circle");
  assert.match(circle, /width:\s*40px/);
  assert.match(circle, /height:\s*40px/);
  // 10px between the four things in row one, so the avatar clears the
  // hamburger instead of sitting on top of it.
  assert.match(row, /gap:\s*10px/);
  // The avatar is a fixed circle that cannot be squeezed by a long name, and
  // it has no pill behind the group it sits in.
  const avatar = cssRule("app.css", ".avatar");
  assert.match(avatar, /flex:\s*none/);
  assert.match(avatar, /width:\s*36px/);
  assert.match(avatar, /height:\s*36px/);
  assert.match(avatar, /border-radius:\s*(999px|50%)/);
  assert.match(cssRule("app.css", ".bar-row-title"), /align-items:\s*baseline/);
  // Header padding: 12px top and bottom, 16px at the sides.
  const barCss = cssRule("app.css", ".app-bar");
  assert.match(barCss, /position:\s*sticky/);
  assert.match(barCss, /top:\s*0/);
  assert.match(barCss, /calc\(12px \+ env\(safe-area-inset-top\)\)/);
  assert.match(barCss, /12px\s+calc\(16px/);
  // The pill is one of the things that must stay small.
  const pill = cssRule("app.css", ".quota");
  assert.match(pill, /height:\s*28px/);
  assert.match(pill, /font-size:\s*13px/);
  assert.match(pill, /padding:\s*0 10px/);
});

test("the favorites and downloads addresses lead to Books, not to a 404", async () => {
  for (const pathname of ["/favorites", "/favorites/", "/favorites.html", "/downloads", "/downloads.html"]) {
    const res = await fetch(origin + pathname, { redirect: "manual" });
    assert.equal(res.status, 301, pathname + " should redirect");
    assert.equal(res.headers.get("location"), "/books.html", pathname + " should land on Books");
  }
  assert.equal((await fetch(origin + "/books.html")).status, 200, "and Books is there to land on");

  // The deployed site is static: Cloudflare reads _redirects, so the same two
  // rules have to be in the file that actually ships.
  const redirects = read(path.join(WEB, "_redirects"));
  assert.match(redirects, /^\/favorites\s+\/books\.html\s+301$/m);
  assert.match(redirects, /^\/favorites\/\s+\/books\.html\s+301$/m);
  assert.match(redirects, /^\/downloads\s+\/books\.html\s+301$/m);
});

test("the university note is on Past Papers only, and stays dismissed", async () => {
  const papers = await libraryPage("/dashboard.html");
  await wait(900);
  const pd = papers.window.document;
  const note = pd.querySelector("[data-note]");
  assert.ok(note, "Past Papers carries the note");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /university papers/i);
  // In the flow of the page, not a band under the header.
  assert.ok(note.closest(".content"), "the note sits inside the content area");
  assert.equal(pd.querySelectorAll(".app-bar [data-note]").length, 0);

  pd.querySelector(".note-x").click();
  assert.equal(note.hidden, true);
  assert.equal(papers.window.localStorage.getItem("zafar_note_papers"), "1",
    "dismissal is remembered on the phone");
  assert.equal(papers.window.sessionStorage.getItem("zafar_note_papers"), null,
    "not just for this visit");
  papers.window.close();

  // The next visit starts dismissed.
  const again = await libraryPage("/dashboard.html", { storage: { zafar_note_papers: "1" } });
  await wait(900);
  assert.equal(again.window.document.querySelector("[data-note]").hidden, true);
  again.window.close();

  // Every other shelf is clean.
  for (const page of ["/books.html", "/notes.html", "/marking-keys.html"]) {
    const other = await libraryPage(page);
    await wait(900);
    assert.equal(other.window.document.querySelector("[data-note]"), null, page + " has no note");
    other.window.close();
  }
});

test("the controls are three rows, and the list has one layout", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;

  // A: one search field, full width.
  assert.equal(d.querySelectorAll("[data-search]").length, 1);
  // The grid/list switch is gone, with its icons and its stored preference.
  assert.equal(d.querySelector(".view-toggle"), null);
  assert.equal(d.querySelectorAll("[data-view]").length, 0);
  assert.equal(dom.window.localStorage.getItem("zafar_view"), null);
  assert.equal(d.querySelectorAll(".grid.list-view").length, 0);

  // B: one scrolling chip row, and the first chip says "All".
  assert.equal(d.querySelectorAll(".cat-chips").length, 1);
  const chips = [...d.querySelectorAll(".cat-chip")].map((c) => c.textContent);
  assert.equal(chips[0], "All");
  assert.deepEqual(chips, ["All", "Senior", "Junior"]);

  // C: the count and the sort, on one line. No SORT label, no results pill.
  assert.equal(d.querySelector(".sort-label"), null);
  const row = d.querySelector(".results-row");
  assert.ok(row, "a results row");
  assert.equal(row.querySelector("[data-count]").textContent, "1 result");
  assert.equal(row.querySelector("[data-sort]").tagName, "SELECT");
  assert.equal(d.querySelectorAll(".results-row").length, 1);
  assert.equal(d.querySelectorAll(".results-row [data-count]").length, 1);
  // The count is words, not a pill.
  assert.doesNotMatch(cssRule("app.css", ".count"), /border-radius|background/);
  assert.match(cssRule("app.css", ".search"), /width:\s*100%/);
  dom.window.close();
});

test("nothing is dragged off the side of a 360px phone", () => {
  // The page clips, the scroller scrolls, and every flex or grid child is
  // allowed to be narrower than its own content.
  assert.match(cssRule("app.css", ".app"), /overflow-x:\s*clip/);
  for (const selector of [".content", ".sheet", ".item", ".item-body", ".item-meta", ".cat-chips", ".bar-row"]) {
    assert.match(cssRule("app.css", selector), /min-width:\s*0/, selector + " needs min-width: 0");
  }
  // The chips scroll; they are not merely hidden, and they have no negative
  // margins to hide in — that was what let them sit over the row below.
  const chips = cssRule("app.css", ".cat-chips");
  assert.match(chips, /overflow-x:\s*auto/);
  assert.doesNotMatch(chips, /overflow-x:\s*hidden/);
  assert.doesNotMatch(chips, /margin/, "the scroller has no negative margins");
  assert.match(chips, /height:\s*32px/, "the scroller has its own height");
  // The base sheet is the 360px case: no small-phone block may quietly undo
  // the geomety checked here.
  const css = read(path.join(WEB, "assets/css/app.css"));
  for (const block of css.match(/@media \(max-width: \d+px\) \{[\s\S]*?\n\}/g) || []) {
    assert.doesNotMatch(block, /\.(item|cat-chips|sheet|app-bar|search|select|quota)\b/,
      "a small-phone override undoes the layout: " + block.slice(0, 60));
  }
  // …and fade out at the right edge, so the cut-off is legible.
  assert.match(chips, /mask-image:[^;]*linear-gradient\(to right/);
  // One padding scale, and 16px of it at both sides.
  assert.match(cssRule("app.css", ".sheet"), /16px/);
  assert.match(cssRule("app.css", ".app-bar"), /calc\(16px/);
  // The title may wrap anywhere and stops at two lines.
  const title = cssRule("app.css", ".item-title");
  assert.match(title, /-webkit-line-clamp:\s*2/);
  assert.match(title, /overflow-wrap:\s*anywhere/);
  // Nothing in the list is taller than 44px except a card.
  for (const [selector, height] of [
    [".search", "44px"],
    [".cat-chip", "32px"],
    [".select", "32px"],
    [".quota", "28px"],
  ]) {
    assert.match(cssRule("app.css", selector), new RegExp("height:\\s*" + height), selector);
  }
});

test("a card is two zones: what it is, then the facts and the button", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;
  const card = d.querySelector(".item");

  // Top zone: tile + title. The chip only when the library has something to
  // name, which here it does ("Senior").
  const top = card.querySelector(".item-top");
  const foot = card.querySelector(".item-foot");
  assert.ok(top && foot, "two zones");
  assert.deepEqual([...top.children].map((n) => n.className), ["glyph-tile", "item-body"]);
  assert.equal(top.querySelector(".glyph-tile").querySelector("svg").getAttribute("width"), "20");
  assert.equal(top.querySelector(".item-title").textContent, "Mathematics Form 3");
  assert.equal(top.querySelector(".item-cat").textContent, "Senior");
  assert.equal(top.querySelector(".item-cat").getAttribute("class"), "item-cat");

  // Footer: the facts, then the action. The old "PDF document" line and the
  // "Document" chip are not coming back.
  assert.equal(foot.querySelector(".item-meta").textContent, "2 KB · PDF");
  assert.equal(card.textContent.includes("PDF document"), false);
  assert.equal(card.textContent.includes("Document"), false);
  const btn = foot.querySelector("[data-download]");
  assert.equal(btn.querySelector(".btn-label").textContent, "Download");
  assert.equal(btn.querySelector("svg").getAttribute("width"), "16");
  dom.window.close();

  // A card with no category carries no chip at all.
  const bare = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const u = new URL(String(input && input.url ? input.url : input), origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({}, 403);
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply([{ id: "n1", name: "agriculture_archivers_book_3.pdf", size_bytes: 16148070 }], 200, {
          "X-Total-Count": "1",
        });
      }
      return reply({});
    },
  });
  await wait(900);
  const bd = bare.window.document;
  assert.equal(bd.querySelector(".item-cat"), null, "no category, no chip");
  assert.equal(bd.querySelector(".item-meta").textContent, "15.4 MB · PDF");
  // A long name with no spaces wraps; it is not cut off.
  assert.equal(bd.querySelector(".item-title").textContent, "agriculture_archivers_book_3");
  bare.window.close();

  // The styles that make it work.
  const item = cssRule("app.css", ".item");
  assert.match(item, /padding:\s*12px/);
  assert.match(item, /border-radius:\s*16px/);
  assert.match(item, /background:\s*#FFFFFF/);
  assert.match(item, /border:\s*1px solid/);
  assert.match(cssRule("app.css", ".grid"), /gap:\s*10px/);
  const tile = cssRule("app.css", ".glyph-tile");
  assert.match(tile, /width:\s*40px/);
  assert.match(tile, /height:\s*40px/);
  assert.match(tile, /border-radius:\s*10px/);
  const title = cssRule("app.css", ".item-title");
  assert.match(title, /font-size:\s*15px/);
  assert.match(title, /font-weight:\s*600/);
  assert.match(title, /-webkit-line-clamp:\s*2/);
  assert.match(title, /overflow-wrap:\s*anywhere/);
  const chip = cssRule("app.css", ".item-cat,\n.item-dl");
  assert.match(chip, /height:\s*24px/);
  assert.match(chip, /font-size:\s*12px/);
  // 1px divider between the zones.
  const footCss = cssRule("app.css", ".item-foot");
  assert.match(footCss, /border-top:\s*1px solid/);
  assert.match(cssRule("app.css", ".item-meta"), /font-size:\s*13px/);

  // The button is 36px tall and still a 44px target: the last 4px on each
  // side come from a hit area, not from the box.
  const button = cssRule("app.css", ".item .btn");
  assert.match(button, /height:\s*36px/);
  assert.match(button, /padding:\s*0 14px/);
  assert.match(button, /border-radius:\s*18px/);
  assert.match(button, /font-size:\s*14px/);
  assert.match(button, /font-weight:\s*600/);
  assert.match(cssRule("app.css", ".item .btn::after"), /height:\s*44px/);
  // …and nothing clips it back down to the 36px box.
  assert.doesNotMatch(cssRule("app.css", ".btn[data-download]"), /overflow:\s*hidden/);
});

test("the list sits under the bar, not beneath it", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;

  // Sticky, in normal flow: the sheet is the bar's sibling, so no padding or
  // negative margin has to be guessed to keep the search field visible.
  const bar = d.querySelector(".app-bar");
  const sheet = d.querySelector(".sheet");
  assert.equal(bar.nextElementSibling, sheet, "the sheet follows the bar in the DOM");
  assert.equal(d.querySelector(".content").closest(".sheet"), sheet);
  assert.equal(sheet.querySelector("[data-search]") !== null, true, "the search field is in the sheet");

  const sheetCss = cssRule("app.css", ".sheet");
  assert.match(sheetCss, /^\s*padding:\s*12px/m, "12px between the bar and the search field");
  assert.doesNotMatch(sheetCss, /margin-top:\s*-|margin:\s*-/, "no negative margin pulling it up");
  assert.match(cssRule("app.css", ".content"), /display:\s*flex/);
  // The bar is sticky and nothing is fixed except the tabs.
  assert.match(cssRule("app.css", ".app-bar"), /position:\s*sticky/);
});

test("no beige under the tab bar, and the labels are a readable size", async () => {
  // The page under the nav is white, so the safe-area strip is white too.
  assert.match(cssRule("app.css", "html"), /background:\s*#FFFFFF/);
  assert.match(cssRule("app.css", "body"), /background:\s*#FFFFFF/);
  // …while the sheet keeps the warm surface a student reads on.
  assert.match(cssRule("app.css", ".sheet"), /background:\s*var\(--sheet\)/);

  const tabbar = cssRule("app.css", ".tabbar");
  assert.match(tabbar, /padding(-bottom)?:[^;]*env\(safe-area-inset-bottom\)/);
  assert.match(tabbar, /border-top:\s*1px solid/);
  assert.match(cssRule("app.css", ".tab"), /font-size:\s*12px/);

  // Every app page lets the viewport reach the notch and the home bar.
  for (const page of ["books.html", "dashboard.html", "notes.html", "marking-keys.html", "settings.html", "help.html"]) {
    assert.match(headOf(page), /name="viewport" content="[^"]*viewport-fit=cover/, page);
  }

  // Icons stay 24×24 in the bar itself.
  const dom = await libraryPage("/books.html");
  await wait(900);
  for (const glyph of dom.window.document.querySelectorAll(".tabbar .tab svg")) {
    assert.equal(glyph.getAttribute("width"), "24");
    assert.equal(glyph.getAttribute("height"), "24");
  }
  dom.window.close();
});

test("the tab bar carries its own safe-area padding", () => {
  const tabbar = cssRule("app.css", ".tabbar");
  assert.match(tabbar, /padding(-bottom)?:[^;]*env\(safe-area-inset-bottom\)/,
    "the white background has to reach the bottom edge of the screen");
  assert.match(tabbar, /border-top:\s*1px solid/);
  assert.match(tabbar, /background:\s*#FFFFFF/);
  // Solid, not blurred: no backdrop filter, no translucent white.
  assert.doesNotMatch(tabbar, /backdrop-filter|opacity|rgba\(255, 255, 255/);
  // The sheet still leaves room to scroll the last card clear of it.
  assert.match(cssRule("app.css", ".sheet"), /env\(safe-area-inset-bottom\)/);
});

test("the allowance reads as a sentence, and the colour follows the count", async () => {
  // Three left: teal, no warning.
  const full = await libraryPage("/books.html");
  await wait(900);
  const pill = full.window.document.querySelector("[data-quota]");
  assert.equal(pill.hidden, false);
  assert.equal(pill.querySelector("[data-quota-text]").textContent, "3 books left today");
  assert.equal(pill.classList.contains("is-low"), false);
  assert.equal(pill.classList.contains("is-out"), false);
  full.window.close();

  // One left: amber.
  const one = await libraryPage("/books.html", {
    quota: Object.assign({}, QUOTA, { books_left: 1 }),
  });
  await wait(900);
  const p1 = one.window.document.querySelector("[data-quota]");
  assert.equal(p1.querySelector("[data-quota-text]").textContent, "1 book left today");
  assert.equal(p1.classList.contains("is-low"), true);
  one.window.close();

  // None left: muted red, it says when it comes back, and every Download
  // button refuses without disappearing.
  const none = await libraryPage("/books.html", {
    quota: Object.assign({}, QUOTA, { books_left: 0 }),
  });
  await wait(900);
  const d = none.window.document;
  const p0 = d.querySelector("[data-quota]");
  assert.equal(p0.querySelector("[data-quota-text]").textContent, "0 books left · resets at midnight");
  assert.equal(p0.classList.contains("is-out"), true);
  const buttons = [...d.querySelectorAll("[data-download]")];
  assert.ok(buttons.length > 0, "the cards are still there");
  for (const btn of buttons) {
    assert.equal(btn.getAttribute("aria-disabled"), "true");
    assert.equal(btn.querySelector(".btn-label").textContent, "Limit reached");
  }
  none.window.close();
});

test("the allowance is the server's number, not a constant in the page", async () => {
  // A number no one would hardcode: if the pill is built from the response,
  // this is what it must say.
  const dom = await libraryPage("/books.html", {
    quota: { books_left: 2, books_limit: 7 },
  });
  await wait(900);
  const d = dom.window.document;
  assert.equal(d.querySelector("[data-quota-text]").textContent, "2 books left today");
  dom.window.close();
});

test("every section counts its own allowance, in its own words", async () => {
  // The same sentence shape on all four shelves, from the same endpoint: what,
  // how many, and when. One section's number never appears on another.
  const cases = [
    ["/books.html", "3 books left today"],
    ["/dashboard.html", "10 papers left today"],
    ["/notes.html", "3 notes left today"],
    ["/marking-keys.html", "10 marking keys left today"],
  ];
  for (const [page, copy] of cases) {
    const dom = await libraryPage(page);
    await wait(900);
    const d = dom.window.document;
    const pill = d.querySelector("[data-quota]");
    assert.equal(pill.hidden, false, page + " shows its allowance");
    assert.equal(pill.querySelector("[data-quota-text]").textContent, copy, page);
    assert.equal(pill.classList.contains("is-low"), false);
    dom.window.close();
  }
});

test("a section that runs out says so in its own words, and still stops at zero", async () => {
  const dom = await libraryPage("/notes.html", {
    quota: Object.assign({}, QUOTA, { notes_left: 0 }),
  });
  await wait(900);
  const d = dom.window.document;
  const pill = d.querySelector("[data-quota]");
  assert.equal(pill.hidden, false);
  assert.equal(pill.querySelector("[data-quota-text]").textContent, "0 notes left · resets at midnight");
  assert.equal(pill.classList.contains("is-out"), true);
  assert.equal(d.querySelector("[data-notice]").hidden, false, "the notice explains it");
  const btn = d.querySelector("[data-download]");
  assert.equal(btn.getAttribute("aria-disabled"), "true");
  assert.equal(btn.querySelector(".btn-label").textContent, "Limit reached");
  dom.window.close();
});

test("the category row is the library's, not the page's", async () => {
  // No page carries a list of categories: a guessed folder that does not exist
  // filters to nothing and reads as broken search.
  for (const page of ["books.html", "dashboard.html", "notes.html", "marking-keys.html"]) {
    assert.doesNotMatch(read(path.join(WEB, page)), /categories:\s*\[/, page + " still hard-codes folders");
  }

  // The folders the server reports become chips — except the one that only
  // repeats the shelf ("Books" on Books is not a filter, it is the page name).
  const seen = [];
  const dom = await openPage("/books.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const u = new URL(String(input && input.url ? input.url : input), origin + "/");
      seen.push(u.pathname);
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({}, 403);
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Books", "Senior", "Junior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply(
          [
            { id: "b1", name: "Senior Mathematics 3.pdf", category: "Books", size_bytes: 8420000 },
            { id: "b2", name: "Junior Science 2.pdf", category: "Junior", size_bytes: 6110000 },
          ],
          200,
          { "X-Total-Count": "2" }
        );
      }
      return reply({});
    },
  });
  await wait(900);
  const d = dom.window.document;
  assert.ok(seen.some((p) => /categories/.test(p)), "the folders are asked for");
  const chips = [...d.querySelectorAll(".cat-chip")].map((c) => c.textContent);
  assert.deepEqual(chips, ["All", "Senior", "Junior"], "the shelf's own name is not a category");
  // …and the same word is not a chip on the card either.
  const cards = [...d.querySelectorAll(".item")];
  const card = (needle) => cards.find((c) => c.querySelector(".item-title").textContent.includes(needle));
  assert.equal(card("Senior").querySelector(".item-cat"), null, "'Books' adds nothing on Books");
  assert.equal(card("Junior").querySelector(".item-cat").textContent, "Junior");
  dom.window.close();

  // No folders reported: no chip row at all, rather than a lone "All".
  const bare = await openPage("/notes.html", {
    storage: { zafar_token: token("student") },
    fetch: (input) => {
      const u = new URL(String(input && input.url ? input.url : input), origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({}, 403);
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/categories/.test(u.pathname)) return reply([]);
      if (/\/drive\/papers/.test(u.pathname)) return reply([], 200, { "X-Total-Count": "0" });
      return reply({});
    },
  });
  await wait(900);
  const bd = bare.window.document;
  assert.equal(bd.querySelector("[data-cat-chips]").hidden, true);
  assert.equal(bd.querySelectorAll(".cat-chip").length, 0);
  bare.window.close();
});

test("no card carries a report control or a heart any more", async () => {
  const dom = await libraryPage("/books.html");
  await wait(900);
  const d = dom.window.document;
  const card = d.querySelector(".item");
  assert.ok(card, "a card is on screen");
  assert.equal(card.querySelector("[data-report]"), null);
  assert.equal(card.querySelector("[data-fav]"), null);
  assert.equal(card.querySelector(".fav-btn"), null);
  assert.equal(d.querySelector("[data-report-modal]"), null);
  assert.equal(d.querySelector("[data-report-form]"), null);
  dom.window.close();
});

test("a download says what it is doing while it runs", async () => {
  // The two halves: the reservation, then the file. The button carries a bar
  // and a word through both, so a slow connection never looks like a dead tap.
  let release = null;
  const dom = await libraryPage("/books.html", {
    onPost: (u) => {
      if (/\/drive\/download\//.test(u.pathname)) {
        return new Promise((resolve) => {
          release = () => resolve(reply({ url: origin + "/file.pdf", download_id: "d1", quota: QUOTA }));
        });
      }
      return reply({});
    },
  });
  await wait(900);
  const d = dom.window.document;
  const btn = d.querySelector("[data-download]");
  btn.click();
  await wait(80);
  assert.equal(btn.classList.contains("is-loading"), true);
  assert.match(btn.textContent, /Preparing/, btn.textContent);
  assert.ok(btn.querySelector(".btn-progress"), "the bar is in the button");

  // Let the reservation through, and let the whole chain settle before the
  // window closes: a promise that resolves after close would touch a document
  // that no longer exists, and that is a failure of the test, not the app.
  assert.ok(release, "the reservation was sent");
  release();
  await wait(400);
  assert.equal(btn.classList.contains("is-loading"), false, "the button comes back");
  assert.match(btn.textContent, /Download/, btn.textContent);
  dom.window.close();
});

/* ---------- 9b. what the card says after the file lands ---------- */
// A page whose downloads really land: the ticket comes back, the file comes
// back as bytes, and the one thing a browser does with them (the anchor click
// that saves the file) is stubbed by openPage. Everything else is the app.
function downloadPage(path, conf) {
  const opts = conf || {};
  return openPage(path, {
    storage: Object.assign({ zafar_token: token("student") }, opts.storage || {}),
    beforeParse: opts.beforeParse,
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      const u = new URL(url, origin + "/");
      if (/\/site-config$/.test(u.pathname)) return reply({ featured: [] });
      if (/\/admin\/whoami/.test(u.pathname)) return reply({ detail: "Admins only" }, 403);
      if (/\/auth\/quota/.test(u.pathname)) {
        if (opts.counters) opts.counters.quota = (opts.counters.quota || 0) + 1;
        return reply(opts.quota || QUOTA);
      }
      if (/\/drive\/categories/.test(u.pathname)) return reply(["Senior"]);
      if (/\/drive\/papers/.test(u.pathname)) {
        return reply(
          [{ id: "b1", name: "Mathematics Form 3.pdf", category: "Senior", size_bytes: 2048 }],
          200,
          { "X-Total-Count": "1" }
        );
      }
      if (/\/drive\/download\//.test(u.pathname)) {
        if (opts.ticket) return opts.ticket(u);
        return reply({ url: origin + "/file.pdf", download_id: 9, quota: opts.after || QUOTA });
      }
      if (/\/drive\/confirm\//.test(u.pathname)) {
        if (opts.counters) opts.counters.confirm = (opts.counters.confirm || 0) + 1;
        return reply({ status: "confirmed" });
      }
      if (/\/file\.pdf$/.test(u.pathname)) {
        if (opts.file === false) return reply({}, 502);
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }),
        });
      }
      return reply({});
    },
  });
}

function toastText(d) {
  const node = d.querySelector("[data-toast]");
  return node ? node.textContent : "";
}

test("a file that lands is marked downloaded on every shelf, and is never called a failure", async () => {
  // The whole point: the card says what the phone has. Same code, same words,
  // four shelves — a download that marks on Notes and not on Past Papers is
  // the same download lying to two thirds of the library.
  for (const page of ["/books.html", "/dashboard.html", "/notes.html", "/marking-keys.html"]) {
    const counters = { confirm: 0, quota: 0 };
    const dom = await downloadPage(page, { counters });
    await wait(900);
    const d = dom.window.document;
    const card = d.querySelector(".item");
    const btn = card.querySelector("[data-download]");
    const quotaBefore = counters.quota;
    btn.click();
    await wait(600);

    assert.equal(card.querySelector(".item-dl").textContent, "Downloaded \u2713", page);
    assert.match(btn.textContent, /Saved/, page + " calls a saved file " + btn.textContent);
    assert.doesNotMatch(toastText(d), /Could not/, page + " called a saved file a failure");
    // The file is on the phone, so the backend is told so: an unconfirmed
    // reservation is one the allowance never gets.
    assert.equal(counters.confirm, 1, page + " never confirmed the download");
    // …and the count is read back afterwards, because the answer to the
    // reservation is not necessarily the count after a download.
    assert.ok(counters.quota > quotaBefore, page + " never re-read the allowance");
    // The card keeps saying so when the list is drawn again: the download is
    // in the phone's own history, under this account, not only in memory.
    const stored = JSON.parse(dom.window.localStorage.getItem("zafar_recent_downloads_student") || "[]");
    assert.equal(stored.length, 1, page + " forgot the download");
    assert.equal(stored[0].id, "b1", page);
    dom.window.close();
  }
});

test("a phone that refuses to store history still marks the file, and never calls it a failure", async () => {
  // A locked-down browser or a full quota throws on every write. History is a
  // convenience; it must not be able to turn a saved file into an error, and it
  // must not be able to keep the badge off the card.
  const dom = await downloadPage("/notes.html", {
    beforeParse(win) {
      Object.getPrototypeOf(win.localStorage).setItem = function () {
        throw new win.Error("storage denied");
      };
    },
  });
  await wait(900);
  const d = dom.window.document;
  const card = d.querySelector(".item");
  const btn = card.querySelector("[data-download]");
  btn.click();
  await wait(500);

  assert.equal(card.querySelector(".item-dl").textContent, "Downloaded \u2713", "the badge is on the card");
  assert.match(btn.textContent, /Saved/, btn.textContent);
  assert.doesNotMatch(toastText(d), /Could not/, "a saved file was reported as a failure");
  dom.window.close();
});

test("a download that never started is not dressed up as a saved file", async () => {
  // No ticket, no file. The card must not claim a download, and the words must
  // name what actually failed — starting it, not delivering it.
  const dom = await downloadPage("/notes.html", {
    ticket: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  await wait(900);
  const d = dom.window.document;
  const card = d.querySelector(".item");
  const btn = card.querySelector("[data-download]");
  btn.click();
  await wait(500);

  assert.equal(card.querySelector(".item-dl"), null, "nothing was downloaded");
  assert.match(btn.textContent, /Download/, btn.textContent);
  assert.match(toastText(d), /Could not start the download/, toastText(d));
  dom.window.close();
});

test("a file that fails on the way still asks the server what it is owed", async () => {
  // The ticket is written before the file moves, so a failure here can leave a
  // slot spent for the life of the signed link. The pill must show the
  // server's count, not the count the page happened to be holding.
  const counters = { quota: 0 };
  const dom = await downloadPage("/notes.html", { file: false, counters });
  await wait(900);
  const d = dom.window.document;
  const before = counters.quota;
  d.querySelector("[data-download]").click();
  await wait(700);

  assert.match(toastText(d), /Could not download the file/, toastText(d));
  assert.ok(counters.quota > before, "the page re-read the allowance after the failure");
  dom.window.close();
});

test("asking for a download ticket gets longer than the app's normal deadline", async () => {
  // The ticket is a write: the server reserves the slot before it answers. A
  // browser deadline that cuts it off can spend an allowance for a file that
  // never arrives, so this one request waits.
  const dom = await openPage("/login.html", { fetch: () => reply({}) });
  await wait(300);
  const Z = dom.window.Zafar;
  assert.ok(Z.TICKET_TIMEOUT_MS > Z.REQUEST_TIMEOUT_MS, "the ticket deadline is the longer one");

  const seen = [];
  Z._fetch = function (url, opts, ms) {
    seen.push(ms);
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve({}),
    });
  };
  await Z.authPostJSON("/drive/download/abc?section=notes", null, { timeout: Z.TICKET_TIMEOUT_MS });
  assert.equal(seen[0], Z.TICKET_TIMEOUT_MS);
  // A plain POST keeps the fifteen seconds it had before.
  await Z.authPostJSON("/reports", {});
  assert.equal(seen[1], undefined);

  const list = read(path.join(WEB, "assets/js/list.js"));
  assert.match(list, /timeout:\s*Zafar\.TICKET_TIMEOUT_MS/, "the page passes it");
  dom.window.close();
});

/* ---------- 8d. the mark: files, sizes, and what a crawler reads ---------- */

const SITE = "https://studymw.netlibrary.dpdns.org";
const PAGES = [
  ["index.html", "/"],
  ["login.html", "/login.html"],
  ["register.html", "/register.html"],
  ["verify.html", "/verify.html"],
  ["help.html", "/help.html"],
  ["dashboard.html", "/dashboard.html"],
  ["books.html", "/books.html"],
  ["notes.html", "/notes.html"],
  ["marking-keys.html", "/marking-keys.html"],
  ["settings.html", "/settings.html"],
];

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.slice(1, 4).toString("ascii"), "PNG", file + " is not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function icoSizes(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt16LE(0), 0, file + " is not an ICO");
  assert.equal(buf.readUInt16LE(2), 1, file + " is not an ICO");
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const width = buf.readUInt8(6 + 16 * i) || 256;
    sizes.push(width);
  }
  return sizes;
}

function headOf(page) {
  const html = read(path.join(WEB, page));
  return html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
}

test("the mark exists at every size the pages promise", () => {
  // Google will only use a favicon it can fetch, and it prefers squares that are
  // a multiple of 48. These are the sizes the <link> tags claim, so they must be
  // the sizes on disk — a 512 renamed to 48x48 is worse than nothing.
  const promised = {
    "assets/img/icon-16.png": 16,
    "assets/img/icon-48.png": 48,
    "assets/img/icon-96.png": 96,
    "assets/img/icon-144.png": 144,
    "assets/img/icon-192.png": 192,
    "assets/img/icon-512.png": 512,
    "assets/img/icon-maskable-192.png": 192,
    "assets/img/icon-maskable-512.png": 512,
  };
  for (const [rel, side] of Object.entries(promised)) {
    const size = pngSize(path.join(WEB, rel));
    assert.deepEqual(size, { width: side, height: side }, rel);
  }

  // iOS draws its own corners, so the touch icon is full bleed and square.
  assert.deepEqual(pngSize(path.join(WEB, "assets/img/apple-touch-icon.png")), {
    width: 180,
    height: 180,
  });

  // The tab icon carries three frames in one file, for browsers and for crawlers
  // that only ever ask for /favicon.ico.
  assert.deepEqual(icoSizes(path.join(WEB, "favicon.ico")), [16, 32, 48]);

  // The share card is the one size the og: meta tags promise.
  assert.deepEqual(pngSize(path.join(WEB, "assets/img/og-1200x630.png")), {
    width: 1200,
    height: 630,
  });

  // Both SVGs are real XML, draw from a viewBox, and are the same mark.
  for (const rel of ["assets/img/icon.svg", "assets/img/safari-pinned-tab.svg"]) {
    const svg = read(path.join(WEB, rel));
    assert.match(svg, /^<svg[^>]+viewBox="0 0 (100|512) (100|512)"/, rel + " has no viewBox");
    assert.match(svg, /<path /, rel + " has no shape");
    assert.doesNotMatch(svg, /undefined|NaN/, rel + " has a broken number in it");
  }
});

test("every page advertises the same mark, and search engines can name the site", () => {
  const blocks = new Set();

  for (const [page, pathname] of PAGES) {
    const head = headOf(page);

    // The icon block is identical everywhere: one mark, one set of promises.
    const links = head
      .split("\n")
      .filter((line) => /^<link rel="(icon|apple-touch-icon|mask-icon|manifest)"/.test(line));
    blocks.add(links.join("\n"));
    assert.ok(links.length >= 9, page + " has only " + links.length + " icon links");

    // Every local file it names is on disk.
    for (const line of links) {
      const href = /href="([^"]+)"/.exec(line)[1];
      if (href.startsWith("http")) continue;
      assert.ok(fs.existsSync(path.join(WEB, href)), page + " points at a missing " + href);
    }

    // One canonical address per page, on the deployed host, whatever the URL bar
    // or a preview deployment says.
    assert.match(head, new RegExp('<link rel="canonical" href="' + SITE + pathname + '">'));

    const title = /<title>(.*?)<\/title>/.exec(read(path.join(WEB, page)))[1];
    const ogTitle = /<meta property="og:title" content="([^"]*)">/.exec(head)[1];
    assert.equal(
      ogTitle.replace(/&amp;/g, "&"),
      title.replace(/&amp;/g, "&"),
      page + ": og:title is not the page title"
    );
    assert.ok(
      head.includes('<meta property="og:image" content="' + SITE + '/assets/img/og-1200x630.png">'),
      page + " has no absolute og:image"
    );
    assert.match(head, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(head, /<meta name="theme-color" content="#006D7C">/);

    // The structured data a search engine reads to name the site and draw the
    // mark: the url and the logo are absolute, and the logo is a file we ship.
    const json = /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/.exec(head)[1];
    const data = JSON.parse(json);
    assert.equal(data["@type"], "WebSite");
    assert.equal(data.name, "StudyMW");
    assert.equal(data.url, SITE + "/");
    assert.equal(data.publisher["@type"], "EducationalOrganization");
    assert.equal(data.publisher.logo.url, SITE + "/assets/img/icon-512.png");
    const logoPath = path.join(WEB, data.publisher.logo.url.replace(SITE + "/", ""));
    assert.deepEqual(pngSize(logoPath), { width: 512, height: 512 }, "the logo a crawler is promised");
  }

  assert.equal(blocks.size, 1, "the icon block drifted between pages");
});

test("the manifest and robots.txt agree with what is on disk", () => {
  const manifest = JSON.parse(read(path.join(WEB, "manifest.webmanifest")));
  assert.equal(manifest.name, "StudyMW — Malawian exam papers");
  assert.equal(manifest.short_name, "StudyMW");
  assert.equal(manifest.start_url, "dashboard.html");
  assert.equal(manifest.display, "standalone");
  // The theme colour is the tile itself; a launcher that tints its chrome from
  // the manifest must find the same teal the page uses.
  assert.equal(manifest.theme_color, "#006D7C");
  assert.equal(manifest.background_color, "#FAF5E9");

  // The long-press shortcuts point at pages that exist. My Downloads was the
  // third, and the file it opened is gone.
  assert.equal(manifest.shortcuts.some((s) => /downloads/.test(s.url)), false);
  assert.deepEqual(manifest.shortcuts.map((s) => s.url), ["dashboard.html", "marking-keys.html"]);

  const sizes = manifest.icons.map((icon) => icon.sizes);
  for (const wanted of ["48x48", "96x96", "144x144", "192x192", "512x512"]) {
    assert.ok(sizes.includes(wanted), "the manifest is missing " + wanted);
  }
  const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable");
  assert.deepEqual(maskable.map((i) => i.sizes), ["192x192", "512x512"],
    "Android needs both maskable sizes: it crops to a shape of its own choosing");
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(WEB, icon.src)), "the manifest points at a missing " + icon.src);
    if (icon.type === "image/png") {
      const side = Number(icon.sizes.split("x")[0]);
      assert.deepEqual(pngSize(path.join(WEB, icon.src)), { width: side, height: side }, icon.src);
    }
  }

  const robots = read(path.join(WEB, "robots.txt"));
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  // The icons must stay fetchable or the mark cannot appear beside a result.
  assert.doesNotMatch(robots, /Disallow: \/assets/);
  assert.doesNotMatch(robots, /Disallow: \/favicon\.ico/);
  // The signed-in pages are not: a crawler would only ever see the sign-in screen.
  for (const page of [
    "dashboard.html",
    "books.html",
    "notes.html",
    "marking-keys.html",
    "settings.html",
  ]) {
    assert.match(robots, new RegExp("^Disallow: /" + page + "$", "m"));
  }

  const headers = read(path.join(WEB, "_headers"));
  assert.match(headers, /\/favicon\.ico\n\s+Cache-Control: public/);
  assert.match(headers, /\/assets\/img\/\*\n\s+Cache-Control: public/);
});

/* ---------- 8e. the sign-in card: fields you can see, and Google ---------- */

test("the email and password fields read as fields, not as disabled boxes", () => {
  const css = read(path.join(WEB, "assets/css/auth.css"));
  const rule = (selector) => {
    const at = css.indexOf(selector + " {");
    assert.ok(at !== -1, "auth.css has no " + selector + " rule");
    return css.slice(at, css.indexOf("}", at));
  };

  const hex = (value) => {
    assert.match(value, /^#[0-9A-Fa-f]{6}$/, "not a colour: " + value);
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  };
  const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
  const luminance = (rgb) =>
    rgb
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const field = hex(/--field:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  const ink = hex(/--ink:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  const brand = hex(/--brand:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  assert.deepEqual(field, [255, 255, 255], "the field is white, not a teal wash");

  const input = rule(".input");
  // What is typed: ink on white, eighteen to one.
  assert.match(input, /color:\s*var\(--ink\)/);
  assert.ok(contrast(ink, field) > 12, "typed text is only " + contrast(ink, field).toFixed(1) + ":1");
  // 16 px keeps iOS from zooming the whole page when the field is focused.
  assert.match(input, /font-size:\s*16px/);

  // The line around the field, against the field it surrounds: WCAG asks 3:1 of
  // a control's own edge, and the point of this round is that it is visible.
  const borderAlpha = Number(/\.(\d+)\)/.exec(rule(".input"))[1]) / 100;
  const border = over(brand, borderAlpha, field);
  assert.ok(
    contrast(border, field) >= 3,
    "the resting border is " + contrast(border, field).toFixed(2) + ":1 against the field, needs 3:1"
  );

  // The placeholder, still readable rather than a rumour.
  const ph = rule(".input::placeholder");
  const placeholder = hex(/--placeholder:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  assert.match(ph, /color:\s*var\(--placeholder\)/);
  assert.ok(
    contrast(placeholder, field) >= 4.5,
    "the placeholder is only " + contrast(placeholder, field).toFixed(1) + ":1"
  );
  assert.match(ph, /opacity:\s*1/, "the placeholder must not be faded twice");

  // The quiet text on the sheet — "Don't have an account?", "Remember me",
  // OR, the footer — measured where it actually sits, on the sheet colour.
  const sheet = hex(/--sheet:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  const muted = hex(/--muted:\s*(#[0-9A-Fa-f]{6})/.exec(css)[1]);
  assert.ok(
    contrast(muted, sheet) >= 4.5,
    "muted text is only " + contrast(muted, sheet).toFixed(1) + ":1 on the sheet"
  );
  for (const selector of [".head p", ".or-rule", ".stay-signed", ".sheet-footer"]) {
    assert.match(rule(selector), /color:\s*var\(--muted\)/, selector + " still uses a pale tint");
  }
  // And nothing on this page goes back to a translucent teal for text: .45
  // and .60 of #006D7C measure about 3:1 on cream, which is what made the
  // labels and the OR look washed out in the first place.
  assert.doesNotMatch(css, /color:\s*var\(--t-(45|60|70)\)/);
  // The eye button is a control, so it is held to the same floor.
  assert.match(rule(".toggle-show"), /color:\s*var\(--muted\)/);

  // Focus is visible on a phone, where :focus-visible never fires.
  assert.match(rule(".input:focus"), /box-shadow:\s*0 0 0 3px rgba\(var\(--brand-rgb\), \.18\)/);
  // An error changes the colour, not just the thickness.
  assert.match(rule(".field.has-error .input"), /border-color:\s*var\(--warn\)/);
});

test("Google is offered where it can work, and nowhere else", async () => {
  // The script tag is recorded but never loaded: the test has no business
  // talking to accounts.google.com, and a load that never resolves leaves the
  // zone exactly as the page left it.
  const requested = [];
  const blockGoogleScripts = (win) => {
    const realAppend = win.Node.prototype.appendChild;
    win.Node.prototype.appendChild = function (node) {
      if (node && node.tagName === "SCRIPT" && /accounts\.google\.com/.test(node.src || "")) {
        requested.push(node.src);
        return node;
      }
      return realAppend.call(this, node);
    };
  };

  // The sign-in side: a real client ID is configured, so the block is there.
  const calls = [];
  const login = await openPage("/login.html", {
    beforeParse: blockGoogleScripts,
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      calls.push([url, init && init.body]);
      // The API as it stands until GOOGLE_CLIENT_ID is set on that deployment.
      if (/\/auth\/google/.test(url)) {
        return reply({ detail: "Google sign-in is not configured" }, 503, {
          "X-Error-Code": "google_not_configured",
        });
      }
      return reply({});
    },
  });
  await wait(300);
  const lw = login.window;
  const ld = lw.document;

  assert.match(lw.GOOGLE_CLIENT_ID, /\.apps\.googleusercontent\.com$/);
  const zone = ld.getElementById("googleZone");
  assert.equal(zone.hidden, false, "the block is visible on sign-in");
  assert.equal(ld.getElementById("txt-or").textContent, "or");

  // Google is the first thing offered, above the email form — one tap instead
  // of typing an address and a password on a phone — and it is outside the
  // <form>, so it can never submit one.
  const form = ld.getElementById("authForm");
  assert.ok(
    zone.compareDocumentPosition(form) & 4,
    "Continue with Google comes before the form"
  );
  assert.equal(zone.closest("form"), null, "and it is not inside the form");
  // The OR rule explains why a form follows, so the two travel together.
  assert.ok(zone.querySelector(".or-rule"), "the OR rule belongs to the Google block");
  assert.equal(ld.getElementById("txt-or").textContent, "or");

  // The phone keyboard and the password manager get what they need.
  const email = ld.getElementById("email");
  const password = ld.getElementById("password");
  assert.equal(email.getAttribute("autocomplete"), "email");
  assert.equal(email.getAttribute("inputmode"), "email");
  assert.equal(email.getAttribute("type"), "email");
  assert.equal(password.getAttribute("autocomplete"), "current-password");
  assert.equal(password.getAttribute("type"), "password");
  assert.deepEqual(requested, ["https://accounts.google.com/gsi/client"], "Google's script, once");

  // What counts as a client ID.
  const gate = lw.ZafarAuth.googleEnabled;
  assert.equal(gate("511934392016-abc.apps.googleusercontent.com"), true);
  assert.equal(gate("  511934392016-abc.apps.googleusercontent.com\n"), true, "a pasted newline is forgiven");
  assert.equal(gate(""), false);
  assert.equal(gate("PENDING"), false, "a half-pasted value is not a client ID");
  assert.equal(gate(undefined), false);

  // The sign-in call: the ID token is the only thing that goes up, and a
  // deployment without the route is reported in plain words, not as a dead
  // button.
  const before = calls.length;
  lw.ZafarAuth.signInWithGoogle("id-token-from-google");
  await wait(400);
  const sent = calls.slice(before);
  assert.equal(sent.length, 1, "one request: " + JSON.stringify(sent));
  assert.match(sent[0][0], /\/auth\/google$/);
  assert.deepEqual(JSON.parse(sent[0][1]), { credential: "id-token-from-google" });

  const note = ld.getElementById("googleNote");
  assert.equal(note.hidden, false, "a refusal has to be said out loud");
  assert.match(note.textContent, /switched on yet/i);
  assert.match(note.textContent, /email and password/i, "and it points at the door that works");
  assert.equal(ld.getElementById("googleZone").classList.contains("is-busy"), false, "and the button is usable again");
  login.window.close();

  // The create side proves the address with a code instead, so the block is
  // absent there — and nothing is fetched from Google to draw a button that
  // will not be shown.
  const register = await openPage("/register.html", {
    beforeParse: blockGoogleScripts,
    fetch: () => reply({}),
  });
  await wait(300);
  assert.equal(register.window.document.getElementById("googleZone").hidden, true, "no Google on create-account");
  assert.deepEqual(requested.slice(1), [], "and no script was fetched for it");
  register.window.close();
});

test("the deployed clean URLs behave exactly like the .html ones", async () => {
  // Cloudflare serves /login, /register and /verify; a page-name check written
  // against "login.html" passed on localhost and failed in production, which is
  // how Continue with Google went missing from the live site while every test
  // (and the dev server) said it was there.
  const blockGoogleScripts = (win) => {
    const realAppend = win.Node.prototype.appendChild;
    win.Node.prototype.appendChild = function (node) {
      if (node && node.tagName === "SCRIPT" && /accounts\.google\.com/.test(node.src || "")) return node;
      return realAppend.call(this, node);
    };
  };

  const login = await openPage("/login", { beforeParse: blockGoogleScripts, fetch: () => reply({}) });
  await wait(300);
  const lw = login.window;
  assert.equal(lw.location.pathname, "/login", "the dev server answers the clean path");
  assert.equal(lw.document.getElementById("googleZone").hidden, false, "/login shows Google");
  // The sign-in side, not the create side.
  assert.equal(lw.document.getElementById("field-name").hidden, true);
  assert.equal(lw.document.querySelector("#submitBtn .submit-label").textContent, "Sign in");
  login.window.close();

  const register = await openPage("/register", { beforeParse: blockGoogleScripts, fetch: () => reply({}) });
  await wait(300);
  const rd = register.window.document;
  // /register is the create form — this used to be the sign-in form, because
  // the check compared against "register.html".
  assert.equal(rd.getElementById("field-name").hidden, false, "/register is the create form");
  assert.equal(rd.querySelector("#submitBtn .submit-label").textContent, "Create account");
  assert.equal(rd.getElementById("googleZone").hidden, true, "and it has no Google block");
  register.window.close();

  // The code screen keeps its own branch rather than falling through to the
  // sign-in one: with an address to verify it shows the code panel, which only
  // happens when the page name matched "verify".
  const verify = await openPage("/verify?email=student@gmail.com", { fetch: () => reply({}) });
  await wait(300);
  const vd = verify.window.document;
  assert.equal(verify.window.location.pathname, "/verify");
  assert.equal(vd.getElementById("panel-verify").hidden, false, "/verify shows the code screen");
  assert.equal(vd.getElementById("panel-auth").hidden, true, "and not the sign-in form");
  verify.window.close();
});

test("each Google refusal says something a student can act on", async () => {
  const cases = [
    {
      name: "an address Google verified but the site cannot use",
      status: 403,
      code: "google_email_unsupported",
      detail: "Only verified Gmail addresses are supported",
      expect: /gmail/i,
      forbid: /unsupported|verified Gmail addresses/i,
    },
    {
      name: "the account could not be created",
      status: 503,
      code: "google_account_unavailable",
      detail: "Google sign-in could not create the account. Please try again.",
      expect: /try again in a moment/i,
      forbid: /create the account/i,
    },
    {
      name: "a token Google will not stand behind",
      status: 401,
      code: "google_invalid_token",
      detail: "google_id_token audience mismatch: 123-abc",
      expect: /couldn\u2019t confirm|couldn't confirm/i,
      forbid: /audience|mismatch|123-abc|token/i,
    },
  ];

  for (const c of cases) {
    const dom = await openPage("/login.html", {
      beforeParse: (win) => {
        const realAppend = win.Node.prototype.appendChild;
        win.Node.prototype.appendChild = function (node) {
          if (node && node.tagName === "SCRIPT" && /accounts\.google\.com/.test(node.src || "")) return node;
          return realAppend.call(this, node);
        };
      },
      fetch: (input) => {
        const url = String(input && input.url ? input.url : input);
        if (/\/auth\/google/.test(url)) {
          return reply({ detail: c.detail }, c.status, { "X-Error-Code": c.code });
        }
        return reply({});
      },
    });
    await wait(300);
    const d = dom.window.document;
    dom.window.ZafarAuth.signInWithGoogle("id-token");
    await wait(400);

    const note = d.getElementById("googleNote");
    assert.equal(note.hidden, false, c.name + ": the refusal is silent");
    assert.match(note.textContent, c.expect, c.name + ": " + note.textContent);
    assert.doesNotMatch(note.textContent, c.forbid, c.name + ": repeats the server: " + note.textContent);
    dom.window.close();
  }
});

test("no OAuth client secret is in the repository", () => {
  // The client ID in config.js is public by design; the secret is not used by
  // an ID-token flow at all, so its only possible role here is as a leak.
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.name === "node_modules" || e.name === ".git") return [];
      return e.isDirectory() ? walk(full) : [full];
    });

  const suspicious = walk(WEB).filter((f) => /client_secret/i.test(path.basename(f)));
  assert.deepEqual(suspicious, [], "a client-secret file is in web/");
  const withSecret = walk(WEB).filter((f) => /\.(json|js|html|md|txt)$/.test(f) && /GOCSPX-/.test(read(f)));
  assert.deepEqual(withSecret, [], "something in web/ carries a GOCSPX- secret");

  // And the ignore rules that keep one out if it is ever dropped in.
  const ignore = read(path.join(ROOT, ".gitignore"));
  assert.match(ignore, /client_secret\*\.json/);
  assert.match(ignore, /^\s*\.env$/m);
});

test("an expired session sends the portal back to sign-in", async () => {
  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/admin\/whoami/.test(url)) return reply({ detail: "Not authenticated" }, 401);
      return reply({});
    },
  });
  await wait(400);
  const d = dom.window.document;
  // jsdom cannot navigate, so the decision is recorded where a test can see it.
  assert.equal(d.documentElement.getAttribute("data-admin-redirect"), "login");
  assert.match(d.getElementById("view").textContent, /Sign in/i);
  dom.window.close();
});

test("an owner can change a role, and the conflicts are explained", async () => {
  const sent = [];
  let patchReply = () => reply({ id: "u2", email: "editor@gmail.com", role: "viewer" });
  // GET /admin/users answers with a bare array and the count in a header.
  const users = () =>
    reply(
      [{ id: "u2", email: "editor@gmail.com", name: "Editor", role: "", suspended: false,
         is_verified: true, signup_method: "password", created_at: "2026-11-01T09:00:00Z",
         last_active_at: "2026-11-07T09:00:00Z", downloads: 3 }],
      200,
      { "X-Total-Count": "1" }
    );

  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: (input, init) => {
      const url = String(input && input.url ? input.url : input);
      const method = (init && init.method) || "GET";
      if (/\/admin\/whoami/.test(url)) return reply({ email: "owner@gmail.com", name: "Owner", role: "owner" });
      if (/\/admin\/overview/.test(url)) return reply(ADMIN_OVERVIEW);
      if (/\/admin\/users(\?|$)/.test(url) && method === "GET") return users();
      if (/\/admin\/users\/u2$/.test(url) && method === "PATCH") {
        sent.push(JSON.parse(String(init.body || "{}")));
        return patchReply();
      }
      return reply({});
    },
  });
  await wait(500);
  const w = dom.window;
  const d = w.document;

  // Go to the users panel through the tab, the way a person would.
  const usersTab = [...d.querySelectorAll("#tabs button")].find((b) => /Users/.test(b.textContent));
  usersTab.click();
  await wait(400);

  const select = d.querySelector("select[data-action='role']");
  assert.ok(select, "each account has a role control");
  assert.equal(select.value, "", "a student account shows Student");
  assert.match(select.getAttribute("aria-label"), /editor@gmail\.com/, "and names the account it changes");

  select.value = "viewer";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  await wait(400);

  assert.deepEqual(sent, [{ role: "viewer" }], "the role goes up as an object, not a form field");
  assert.match(d.getElementById("toast").textContent, /editor@gmail\.com is now Viewer/);

  // The one conflict that matters most: an owner without an authenticator.
  patchReply = () =>
    reply({ detail: "Enroll the target account's authenticator with the owner bootstrap CLI" }, 409, {
      "X-Error-Code": "owner_mfa_not_enrolled",
    });
  const again = d.querySelector("select[data-action='role']");
  again.value = "owner";
  again.dispatchEvent(new w.Event("change", { bubbles: true }));
  await wait(400);

  const toast = d.getElementById("toast").textContent;
  assert.match(toast, /authenticator enrolled/i, toast);
  assert.doesNotMatch(toast, /bootstrap CLI before assigning/, "no server wording");
  assert.equal(d.querySelector("select[data-action='role']").value, "", "the control snaps back to the truth");
  dom.window.close();
});

test("what the API does not report is not drawn as zero", async () => {
  const dom = await adminPage({
    storage: { zafar_token: token("owner") },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/admin\/whoami/.test(url)) return reply({ email: "owner@gmail.com", name: "Owner", role: "owner" });
      if (/\/admin\/overview/.test(url)) {
        // The shipped payload: no top_subjects, on purpose.
        const { top_subjects, ...rest } = ADMIN_OVERVIEW;
        return reply(rest);
      }
      if (/\/admin\/ops/.test(url)) {
        // The shipped payload: db kind and errors, no storage and no backups.
        return reply({ db: { kind: "d1" }, errors: [], errors_today: 0 });
      }
      return reply({});
    },
  });
  await wait(500);
  const w = dom.window;
  const d = w.document;

  assert.doesNotMatch(d.getElementById("view").textContent, /Top subjects/,
    "no card for a field the API does not send");

  const opsTab = [...d.querySelectorAll("#tabs button")].find((b) => /Operations/.test(b.textContent));
  opsTab.click();
  await wait(400);

  const text = d.getElementById("view").textContent;
  assert.doesNotMatch(text, /Storage used/, "no storage figure it never received");
  assert.doesNotMatch(text, /Backups/, "and no backup count");
  assert.match(text, /does not report storage or backups/i, "it says so instead of implying zero");
  assert.match(text, /\bd1\b/);
  dom.window.close();
});

/* ---------- 9. the hero ---------- */

test("the hero says what StudyMW is in two lines, and offers nothing to tap", async () => {
  const dom = await openPage("/login.html", { fetch: () => reply({}) });
  await wait(300);
  const d = dom.window.document;

  assert.equal(d.querySelector(".wordmark").textContent.trim(), "STUDYMW");
  // One short line: the point of the hero is to say what this is, not to fill
  // the top of the screen. The first version's headline wrapped to two lines
  // and, with four chip-shaped tags under it, pushed the buttons below the fold
  // on a 360x640 phone.
  assert.equal(d.querySelector("#txt-headline").textContent, "Pass MSCE & JCE.");
  // What is inside the library now lives in the sentence, not in four pill-
  // shaped things that looked tappable and were not.
  const lede = d.querySelector("#txt-subtitle").textContent;
  for (const word of ["past papers", "marking keys", "books", "notes", "Free"]) {
    assert.match(lede, new RegExp(word, "i"), "the promise lost \"" + word + "\": " + lede);
  }
  assert.equal(d.querySelectorAll(".mast-chips, .mast .chip, .mast li").length, 0, "no chips");

  // Nothing in the hero looks like a control except the wordmark.
  const interactive = [...d.querySelectorAll(".mast button, .mast a, .mast [role=button], .mast [tabindex]")]
    .filter((el) => !el.classList.contains("wordmark"));
  assert.deepEqual(interactive.map((el) => el.outerHTML.slice(0, 60)), [], "the hero has no fake buttons");

  // The footer keeps the list, and the one amber word.
  const foot = d.querySelector("#txt-footer");
  assert.equal(foot.textContent, "PAPERS · MARKING KEYS · BOOKS · NOTES · FREE");
  assert.equal(foot.querySelector("b.free").textContent, "FREE", "FREE is the accent, and only it");
  dom.window.close();

  // It is a promise, not a greeting: it belongs on the create form too.
  const reg = await openPage("/register.html", { fetch: () => reply({}) });
  await wait(300);
  const head = reg.window.document.querySelector("#txt-headline");
  assert.match(head.textContent, /Pass MSCE/);
  assert.equal(head.hidden, false);
  reg.window.close();
});

test("the hero is sized by its words, and the phone gets the room back", () => {
  const css = read(path.join(WEB, "assets/css/auth.css"));

  // No viewport-relative height: the hero used to reserve a quarter of the
  // screen before it said anything.
  const mast = css.split("\n.mast {")[1].split("}")[0];
  assert.doesNotMatch(mast, /min-height/, "the hero is content-sized");

  // The subtext stays legible on teal.
  const lede = /\n\.mast-lede \{([^}]*)\}/.exec(css)[1];
  assert.match(lede, /font-size:\s*15px/);
  assert.match(lede, /rgba\(250, 245, 233, \.9\d\)/, "the subtext is at least 90% opaque");

  // On a phone the illustration goes, because the form is the reason the page
  // exists; on a short screen every band gets tighter.
  assert.match(css, /@media \(max-width: 480px\), \(max-height: 760px\) \{\s*\.card-art \{ display: none; \}/);
  const short = css.split("@media (max-height: 700px) {")[1].split("\n}")[0];
  for (const rule of [/\.mast \{ padding:/, /\.mast-head \{/, /\.input \{ height: 50px/, /\.submit \{ height: 52px/]) {
    assert.match(short, rule, "the short-screen layout is incomplete");
  }
});

/* ---------- 10. the headers that cost nothing are actually served ---------- */

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
