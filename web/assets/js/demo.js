/* ============================================================
   Zafar — demo data
   Stands in for the backend whenever it can't be reached, so the UI is
   always explorable. Mirrors the real response shapes exactly:
     GET  /drive/papers?section=&category=&q=  -> [{id,name,category,size_bytes}]
     GET  /auth/quota                          -> {papers_left, books_left}
     POST /drive/download/{id}?section=        -> {url, download_id, quota}
     POST /drive/confirm/{download_id}         -> {ok:true}
   ============================================================ */

var ZafarDemo = (function () {
  var SUBJECTS = [
    "Mathematics", "English Language", "Biology", "Physical Science",
    "Chemistry", "Agriculture", "Geography", "History", "Bible Knowledge",
    "Computer Studies", "Life Skills", "Chichewa", "Additional Mathematics",
    "Social Studies", "Business Studies",
  ];

  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h ^= h >>> 13;
      return ((h >>> 0) % 10000) / 10000;
    };
  }

  function build(section, category, names, years) {
    var out = [];
    var rnd = seeded(section + category);
    names.forEach(function (name) {
      years.forEach(function (year) {
        var label = name + " " + year;
        out.push({
          id: (section + "-" + label).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: label + ".pdf",
          category: category,
          size_bytes: Math.round((0.25 + rnd() * 4.2) * 1024 * 1024),
        });
      });
    });
    return out;
  }

  var CATALOG = []
    .concat(build("papers", "MSCE Maneb", SUBJECTS.slice(0, 10).map(function (s) { return s + " Paper 1"; }), [2024, 2023, 2022]))
    .concat(build("papers", "JCE Maneb", SUBJECTS.slice(0, 8), [2024, 2023]))
    .concat(build("papers", "Mock", SUBJECTS.slice(0, 6).map(function (s) { return s + " Mock"; }), [2025, 2024]))
    .concat(build("papers", "Other Past Papers", SUBJECTS.slice(2, 7).map(function (s) { return s + " Regional"; }), [2023]))
    .concat(build("books", "Senior", ["Strides in Mathematics", "Excel & Succeed Biology", "New Physical Science", "Achievers English", "Geography for Malawi"], ["Form 3", "Form 4"]))
    .concat(build("books", "Junior", ["Strides in Mathematics", "Achievers English", "Social Studies Today", "Agriculture Basics"], ["Form 1", "Form 2"]))
    .concat(build("notes", "Senior", SUBJECTS.slice(0, 7).map(function (s) { return s + " Summary Notes"; }), ["Form 4"]))
    .concat(build("notes", "Junior", SUBJECTS.slice(0, 5).map(function (s) { return s + " Summary Notes"; }), ["Form 2"]))
    .concat(build("marking-keys", "MSCE Maneb", SUBJECTS.slice(0, 8).map(function (s) { return s + " Marking Key"; }), [2024, 2023]))
    .concat(build("marking-keys", "JCE Maneb", SUBJECTS.slice(0, 5).map(function (s) { return s + " Marking Key"; }), [2024]));

  // Which section each catalog row belongs to (encoded in its id prefix).
  function sectionOf(item) {
    return item.id.split("-")[0] === "marking" ? "marking-keys" : item.id.split("-")[0];
  }

  var QUOTA_KEY = "zafar_demo_quota";

  function quota() {
    var today = new Date().toDateString();
    var raw;
    try {
      raw = JSON.parse(sessionStorage.getItem(QUOTA_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    if (!raw || raw.day !== today) {
      raw = { day: today, papers_left: DAILY_PAPER_LIMIT, books_left: DAILY_PAPER_LIMIT };
      sessionStorage.setItem(QUOTA_KEY, JSON.stringify(raw));
    }
    return raw;
  }

  function spend(section) {
    var q = quota();
    var key = section === "books" ? "books_left" : "papers_left";
    q[key] = Math.max(0, q[key] - 1);
    sessionStorage.setItem(QUOTA_KEY, JSON.stringify(q));
    return q;
  }

  function delay(value, ms) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(value); }, ms == null ? 260 : ms);
    });
  }

  function get(path) {
    var url = new URL(path, "http://demo.local");
    if (url.pathname === "/auth/quota") {
      var q = quota();
      return delay({ papers_left: q.papers_left, books_left: q.books_left }, 180);
    }
    if (url.pathname === "/drive/papers") {
      var section = url.searchParams.get("section") || "papers";
      var category = url.searchParams.get("category");
      var q2 = (url.searchParams.get("q") || "").toLowerCase();
      var rows = CATALOG.filter(function (item) {
        if (sectionOf(item) !== section) return false;
        if (category && item.category !== category) return false;
        if (q2 && item.name.toLowerCase().indexOf(q2) === -1) return false;
        return true;
      });
      return delay(rows);
    }
    return delay([]);
  }

  function post(path) {
    var url = new URL(path, "http://demo.local");
    if (/^\/drive\/confirm\//.test(url.pathname)) return delay({ ok: true }, 60);
    if (/^\/drive\/download\//.test(url.pathname)) {
      var section = url.searchParams.get("section") || "papers";
      var q = spend(section);
      return delay({
        url: "",
        demo: true,
        download_id: "demo-" + Date.now(),
        quota: { papers_left: q.papers_left, books_left: q.books_left },
      }, 420);
    }
    return delay({});
  }

  // Used by the dashboard's "browse by subject/category" tiles.
  function categoryCounts(section) {
    var counts = {};
    CATALOG.forEach(function (item) {
      if (sectionOf(item) !== section) return;
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }

  return { get: get, post: post, categoryCounts: categoryCounts, total: CATALOG.length };
})();
