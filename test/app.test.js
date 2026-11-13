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
  const papersLeft = d.querySelector("[data-quota-text]").textContent;
  assert.match(papersLeft, /10 of 10/);

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
  // One bucket for both: the papers numbers, and no second quota request.
  assert.equal(d.querySelector("[data-quota-text]").textContent, papersLeft);
  assert.equal(seen.filter((u) => /\/auth\/quota/.test(u)).length, 1, "no second allowance");
  // And the download knows which shelf the file came from.
  assert.equal(d.querySelector("[data-download]").dataset.section, "primary");
  dom.window.close();
});

/* ---------- 8c. Favorites ---------- */

test("Favorites says how many are saved, and reads the Primary shelf too", async () => {
  const seen = [];
  const dom = await openPage("/favorites.html", {
    storage: {
      zafar_token: token("student"),
      // The saved list lives on the phone: two ids, one from each shelf.
      zafar_bookmarks_student: JSON.stringify(["s1", "p1"]),
    },
    fetch: (input) => {
      const url = String(input && input.url ? input.url : input);
      seen.push(url);
      const u = new URL(url, origin + "/");
      const section = u.searchParams.get("section");
      if (/\/auth\/quota/.test(u.pathname)) return reply(QUOTA);
      if (/\/drive\/papers/.test(u.pathname)) {
        const rows =
          section === "primary"
            ? [{ id: "p1", name: "PSLC Mathematics 2023.pdf", category: "PSLC Maneb", size_bytes: 1000 }]
            : section === "papers"
              ? [{ id: "s1", name: "MSCE Biology 2022.pdf", category: "MSCE Maneb", size_bytes: 1000 }]
              : [{ id: section + "-x", name: "Other.pdf", category: "Cat", size_bytes: 1000 }];
        return reply(rows, 200, { "X-Total-Count": "1" });
      }
      return reply({});
    },
  });
  await wait(1300);

  const d = dom.window.document;
  const papers = seen.filter((u) => /\/drive\/papers/.test(u));
  // Five shelves, each asked for its first page and nothing more.
  assert.equal(papers.length, 5, "one page per section: " + papers.join(", "));
  assert.ok(papers.every((u) => /offset=0/.test(u)), "a saved list does not read the shelf");
  assert.ok(papers.some((u) => /section=primary/.test(u)), "Favorites reads the Primary shelf");

  // Both saved documents are on screen, each under its own shelf.
  const titles = [...d.querySelectorAll(".item-title")].map((n) => n.textContent).sort();
  assert.deepEqual(titles, ["MSCE Biology 2022", "PSLC Mathematics 2023"]);
  const groups = [...d.querySelectorAll(".group-title")].map((h) =>
    h.textContent.replace(/\d+$/, "").trim()
  );
  assert.deepEqual(groups, ["Past Papers", "Primary"]);

  // The number is the saved list's, not the page's.
  assert.equal(d.querySelector("[data-count]").textContent, "2 saved");

  // A saved Primary file downloads as Primary, so the server charges papers.
  const primaryCard = [...d.querySelectorAll(".item")].find((c) => /PSLC/.test(c.textContent));
  assert.equal(primaryCard.querySelector("[data-download]").dataset.section, "primary");
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
  ["favorites.html", "/favorites.html"],
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
  for (const page of ["dashboard.html", "books.html", "notes.html", "marking-keys.html", "favorites.html"]) {
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
