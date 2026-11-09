# StudyMW

A study library for Malawian secondary students: MANEB MSCE/JCE past papers,
mocks, textbooks, summary notes and marking keys.

## Layout

```
web/                     static frontend (no build step, no framework)
  login.html             sign in          }  entry point — the site now
  register.html          create account   }  starts here, not on a
  verify.html            email code       }  marketing landing page
  dashboard.html         past papers
  books.html             textbooks
  notes.html             summary notes
  marking-keys.html      marking keys
  favorites.html         saved documents, across every section
  help.html              FAQ
  assets/css/app.css     the signed-in app — same system as auth.css
  assets/css/auth.css    the authentication screen — self-contained, so the
                         app stylesheet can be re-skinned without touching it
  assets/fonts/…         Instrument Sans, 29 KB variable (the only webfont)
  assets/img/icon.svg    the open-book mark, scalable, for the browser tab
  assets/img/icon-*.png  the same mark rasterised for a home screen: 192, 512,
                         a 512 maskable, and a 180 apple-touch icon
  manifest.webmanifest   name, colours and icons for "Add to Home Screen"
  assets/js/config.js    API client, token storage, favorites, formatting
  assets/js/i18n.js      the English string table for the signed-in app
  assets/js/shell.js     top bar + bottom tabs + toasts
  assets/js/list.js      the shared document-list page
  assets/js/auth.js      sign in / create account / verify
server.js                zero-dependency static server for local development
worker.js                Cloudflare Worker that signs + streams Drive downloads
```

The bar and the bottom tabs are rendered once from `shell.js`, and every list
page (papers, books, notes, marking keys, favorites) is one call to
`ZafarList.init({...})` — so a change to a card or a filter lands everywhere.
Likewise `auth.js` builds the whole sign-in screen, and `login.html`,
`register.html` and `verify.html` are 20-line shells that differ only in which
panel opens first.

## Design

**The authentication screen** (`auth.css`) is the current reference design.
A teal panel carries the brand and a white sheet carries the form: centred
title, pill fields with leading icons, one pill CTA. Two colours do the work —
teal `#006D7C` for every piece of text, border and the CTA, mint `#CFEBE1` for
highlights on the teal panel only (mint on cream is invisible, so it never
appears there). Amber `#B26A14` is reserved for errors and notices. Contrast:
teal on the sheet 5.9:1, cream on the teal CTA 5.9:1, mint on teal 4.8:1.

One webfont, self-hosted: Instrument Sans, 29 KB, variable 100–900. No shadows
anywhere — depth comes from the teal block against the sheet and one hairline.
The design is **phone-only**. The sheet fills whatever height is left, the
form is centred with `margin-block: auto` and the footer is pinned, so no
screen ends in a dead band. There is no desktop layout at all: on a wide screen
the column keeps its 470px phone width and centres itself, so what you see on a
phone is what you see everywhere. Type is fixed in px — nothing scales with the
viewport — so the two never drift apart.

The mobile header carries a CSS-drawn library — floating past-paper cards over
a shelf of book spines — which costs zero bytes. Phones therefore never
download a hero image.

**The signed-in app** (`app.css`) is the same system, built the same way. A
teal bar carries the wordmark, the page title, the day's download allowance and
a running count; the white sheet carries the catalogue; five tabs pinned to the
bottom hold the sections (Past Papers, Books, Notes, Marking Keys, Favorites).
There is no sidebar and no drawer — categories are chips that scroll sideways
on the list pages, and Help sits in the bar with its word on it next to an
icon-only Log out.

Glyphs are near-black ink (`--ink`) on the light surfaces — files, hearts,
search, tabs — while teal is kept for text, headers and the filled download
button. Each page carries a one-line description under its title.

The allowance chip sits beside the title so it stays visible while the
catalogue scrolls. Each section has its **own** allowance, and the chip reports
the one for the page you are on: **10 papers, 3 books, 3 notes, 10 marking
keys** a day, each on its own UTC day. `QUOTA_FIELD` in `config.js` maps a page
to the field prefix its numbers live under — the `marking-keys` section reads
`marking_keys_left` / `marking_keys_limit`, with the underscore the API uses.
Both the count and the ceiling come from that answer, because both are server
settings (`DAILY_*_LIMIT`). The Help page reads the same answer for its table,
so a retuned allowance shows up in both places at once; the numbers in
`DAILY_LIMITS` are printed only if that request fails, with a note that says
they are the published defaults and may not be your account's. Where the server
reports no count — or no ceiling — the chip stays hidden instead of quoting a
policy the backend does not keep.

When a section runs out, a plain-English notice appears above the catalogue —
and again if a download is refused. It is written for a Form 3 student reading
on a phone, not for a policy page: the section is named in the title and in the
chip (*No paper downloads left* / *No papers left*), and the body is four short
sentences — the section has its own daily limit, what the others still have
(*You can still download 3 books, 2 notes and 10 marking keys.*), that it comes
back at **02:00 in Malawi (00:00 UTC)**, and that a failed download frees its
place after a few minutes. The numbers come from the same answer the chip read,
so they are never stale, and the words "allowance", "reservation" and "counted
separately" do not appear. It never says "tomorrow", because the refill is not
a day away — a student who hits the limit at 01:00 has it back within the hour.

A refusal is a statement about a moment, not a permanent fact. The backend
expires an unconfirmed reservation five minutes after the *download request*,
not five minutes after we hear about it, so no local timer can know when the
answer changed: whenever the stored count says zero, the next tap asks
`/auth/quota` again and proceeds if the server has moved on. If that check
cannot reach the server, the page says so ("couldn't check your downloads") and
does not dress the failure up as a refusal. Favorites has no allowance of its
own, so a refusal there is a toast and nothing else — no amber chip, and no
notice whose button leads back to the page you are on. It still spends the
right one: every card carries the section its document came from, so a saved
note is charged to notes rather than to the papers the page is nominally
about.

Cards keep the same discipline as the auth screen: one hairline, no shadow, a
mint tile for the file mark, the title, a category chip, then size and a single
pill CTA. List view collapses the same card to one row. States (empty, error,
offline) and the skeleton loader are shared, so every section fails the same
way and loads the same way.

## Running locally

```bash
node server.js            # http://localhost:4173
```

Zero dependencies — `server.js` only serves `web/` and refuses paths outside it.

### Reviewing the app without an account

```
http://localhost:4173/?demo=1
```

sets a cookie and injects a stand-in for the backend — a fake session plus a
sample catalogue — so every screen can be walked without credentials or a
network. It lives entirely inside `server.js`: nothing is added to `web/`, and
the deployed site never sees it.

The stand-in mirrors the real rules rather than simplifying them: the same four
buckets (10 papers, 3 books, 3 notes, 10 marking keys), each download moving
that bucket's remaining count and its used-today total together, and every
bucket refilling at midnight UTC; the allowance persists in `localStorage` across page loads and
carries a schema version, so a record left by an older demo starts the day
over rather than half-initialising; a spent allowance answers `429`, so the
client's limit path is exercised for real. A download that names no section
gets FastAPI's own `422` body and an unknown one gets the server's `400`
(`Unknown section 'bogus'`) — the section is required on the real route now, and
a mock that defaulted it would hide exactly the bug that defaults cause.

It also stands down the moment a real session exists. **Logging out ends the
demo** (cookie and demo token both cleared), and `login.html?switch=1` hands the
form back to the real backend — a real sign-in is never intercepted.

## Installed on a phone

`manifest.webmanifest` makes StudyMW installable: `display: standalone`, the teal
theme colour in the status bar, and the same open-book mark the bar draws. Each
page's `<head>` also carries the iOS metas and `apple-touch-icon`, and
`viewport-fit=cover` — without it `env(safe-area-inset-*)` reports zero and the
notch and home indicator would sit on top of the bar and the tabs.

There is no service worker, so some browsers no longer offer their "Install app"
prompt; the icon and the standalone window still work from **Add to Home
Screen**, and the app itself is unaffected — it opens and fetches like any page.

**StudyMW keeps nothing on the phone. It is a download site: it works online,
only.**

There is no service worker, no cache, no stored page, no stored list. Every
request goes to the network, and every document is served by the server.

This is not a temporary state or a setting — the offline feature was built,
shipped, and removed. It stored the last catalogue answer per view and served
the app's own pages from the device; when a stored page became the first answer
for a navigation, one entry the browser would not render was **every page
failing**, with nothing inside the app left to repair it from. And what the
feature bought was thin: a stored list carries **no download URLs** — the
download is a `POST /drive/download/{id}` that spends the allowance, and the
file link is a signed URL that lives five minutes — so an offline phone could
see filenames and download none of them. A list you cannot act on is not worth
the ability to brick the app.

What is left, and why:

- **`shell.js` retires any copy left behind.** Phones that installed an older
  version still have that worker and its stored pages. On every page load the
  app unregisters the registration whose script URL is StudyMW's — matched by
  script URL, so another app's worker on a shared origin is untouched — and
  deletes the `zafar-*` caches that went with it.
- **The browser retires it too.** `sw.js` no longer exists, so an update check
  finds a 404 and drops the registration on its own. Two independent paths, so
  no phone keeps a stored copy.
- **`web/_headers` serves every page with `Cache-Control: no-cache`**, and adds
  the headers that cost nothing and close the obvious doors: no framing
  (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), no MIME guessing
  (`nosniff`), no plugins (`object-src 'none'`), and no referrer leakage to
  other sites.

If a phone is stuck on an old copy and will not open the app at all, only the
browser can clear it: Chrome on Android → Settings → Site settings → All sites →
the site → **Clear & reset**; Safari on iPhone → Settings → Safari → Advanced →
**Website Data** → find the site → Delete; Firefox → the site's padlock → Site
settings → **Clear data**. Close every StudyMW tab first — an open tab can put the
old copy back.

Every page load does that clean-up, so demo mode gets it too — which matters,
because `server.js` rewrites each page as it serves it, and a stored page would
be the wrong page.

## Backend

`API_BASE_URL` in `web/assets/js/config.js` points at the deployed FastAPI
backend. Endpoints used:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | create an account — `{email, password, name}` |
| POST | `/auth/login` | issue a JWT (form-encoded: `email`, `password`) |
| POST | `/auth/verify` | confirm the 6-digit email code — `{email, code}` |
| POST | `/auth/resend` | send a fresh verification code — `{email}` |
| POST | `/auth/forgot-password` | email a reset code — `{email}` |
| POST | `/auth/reset-password` | set a new password — `{email, code, new_password}` |
| GET | `/auth/quota` | today's remaining downloads, per section |
| GET | `/drive/papers` | catalogue, filtered by `section`, `category`, `q`; read with `limit` + `offset`, a page at a time |
| GET | `/drive/categories` | the folder names inside a `section` |
| POST | `/drive/download/{id}` | spend quota, return a short-lived signed URL |
| POST | `/drive/confirm/{download_id}` | confirm the bytes actually arrived |
| GET | `/health` | warm-up ping, used by `Zafar.warmUp()` |

A **local** page may point at another backend with `?api=http://localhost:8000`.
On the live site the parameter is ignored: honouring it there would let a link
such as `notes.html?api=https://elsewhere` hand a student's login token to a
host we do not control.

The deployed app has no demo mode — it always talks to the real backend, and
`server.js` is the only thing that ever fakes an answer. When the backend can't
be reached, each page shows a clear error or offline state instead of inventing
data, so what you see is what's actually published.

## Downloads

The catalogue response never carries a file URL — a permanent link there would
let the daily quota be bypassed from the network tab. Each click calls
`POST /drive/download/{id}`, which enforces the quota and returns a signed,
expiring URL for `worker.js`. The Worker verifies the HMAC and streams the file
from Drive with a correct `Content-Disposition`; the page then hands the browser
a same-origin blob so the filename survives.

## Known gaps

- **Per-section quotas landed in the backend** (`f30f39a`): four independent
  counters — 10 papers, 3 books, 3 notes, 10 marking keys — each on its own UTC
  day, reported as `papers_*`, `books_*`, `notes_*` and `marking_keys_*` in
  every `/auth/quota` and download response. The section key and the field
  prefix differ for one page (`marking-keys` → `marking_keys`), which is what
  `QUOTA_FIELD` in `config.js` is for. The Help table is filled from
  `/auth/quota` too, so the two never disagree; `DAILY_LIMITS` appears only
  when that request fails, labelled as the published defaults.

- **Legacy download rows cannot be split.** Rows created before this change
  carry `category` of `paper` for anything charged to the old shared bucket, so
  a notes or marking-keys download made earlier today still counts as a paper
  until the UTC day rolls over. Nothing in the UI needs to say so — the numbers
  correct themselves at 00:00 UTC — but it explains a chip that looks one out.

- **Offline covers what you have already seen, on the credential that saw it.**
  The worker stores one catalogue answer per exact view (section plus filters)
  per account, up to forty in total, so a search never run online has nothing
  to fall back on — that view shows the offline state, honestly. Downloads
  always need a connection.

- `/auth/forgot-password` and `/auth/reset-password` don't exist server-side
  yet. The sign-in screen has both panels built and wired to validation, but
  submitting says so plainly instead of faking success — swap the banner in
  `wireForgot()` for the real calls when the endpoints land.
- The app is English-only and light-only. The former EN/Chichewa toggle and
  the dark-mode toggle were removed; `assets/js/i18n.js` is now a plain
  English string table, and the theme boots straight to the light palette.
  The separate dashboard overview page was also removed — signing in now
  lands directly on Past Papers.
