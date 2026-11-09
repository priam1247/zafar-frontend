# Zafar

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
  sw.js                  service worker — the shell and the last catalogue
                         answer, kept on the device
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
catalogue scrolls. It reports what the server actually enforces: **10 paper
downloads and 3 book downloads a day**, refilling **at midnight UTC**. Notes
and marking keys are charged against the paper allowance, so those pages show
the *same* number as Past Papers rather than advertising an allowance of their
own — the chip's accessible label says so, and the page description reads
"counted against your papers". Where the server reports no count, the chip
stays hidden instead of quoting a policy the backend does not keep.

When the allowance runs out, a plain-English notice appears above the
catalogue — and again if a download is refused — saying that ZAFAR is free, why
the limits exist, and that saving to Favorites and coming back tomorrow is the
way through, with a button straight to that tab.

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

The stand-in mirrors the real rules rather than simplifying them: the same two
buckets (10 papers shared by notes and marking keys, 3 books), refilling at
midnight UTC; the allowance persists in `localStorage` across page loads and
carries a schema version, so a record left by an older demo starts the day
over rather than half-initialising; a spent allowance answers `429`, so the
client's limit path is exercised for real.

It also stands down the moment a real session exists. **Logging out ends the
demo** (cookie and demo token both cleared), and `login.html?switch=1` hands the
form back to the real backend — a real sign-in is never intercepted.

## Installed on a phone

`manifest.webmanifest` makes ZAFAR installable: `display: standalone`, the teal
theme colour in the status bar, and the same open-book mark the bar draws. Each
page's `<head>` also carries the iOS metas and `apple-touch-icon`, and
`viewport-fit=cover` — without it `env(safe-area-inset-*)` reports zero and the
notch and home indicator would sit on top of the bar and the tabs.

`sw.js` keeps two things on the device, and nothing else:

| Route | Strategy | Why |
| --- | --- | --- |
| pages (`dashboard.html`, …) | stored copy, refreshed in the background | opens instantly, and opens with no signal |
| css, js, font, icons | cache first | they only change when the version does |
| `GET /drive/papers` | network first, stored copy as fallback | a fresh list beats an instant one; the copy is for when nothing answers |
| `/auth/*`, downloads, anything but GET | untouched | an allowance or a token served from last week is a lie |

A list served from that copy says **offline** next to its count rather than
letting a stored list pass for a live one, and losing signal mid-page leaves
the list on screen instead of replacing it with a warning. Signing out deletes
the stored catalogue — the app itself stays installed, which is the point.

**Bump `VERSION` in `sw.js` on every deploy that changes `web/`.** The old
cache is retired by name on activate; a forgotten bump means returning visitors
keep yesterday's shell.

The demo deliberately skips registration: `server.js` rewrites each page as it
serves it, and a stored copy would be the wrong copy. `?sw=1` forces the worker
on, `?sw=0` unregisters it and deletes its caches.

## Backend

`API_BASE_URL` in `web/assets/js/config.js` points at the deployed FastAPI
backend. Endpoints used:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | create an account — `{email, password, name}` |
| POST | `/auth/login` | issue a JWT (form-encoded: `email`, `password`) |
| POST | `/auth/verify` | confirm the 6-digit email code — `{email, code}` |
| POST | `/auth/resend` | send a fresh verification code — `{email}` |
| GET | `/auth/quota` | today's remaining paper/book downloads |
| GET | `/drive/papers` | catalogue, filtered by `section`, `category`, `q` |
| POST | `/drive/download/{id}` | spend quota, return a short-lived signed URL |
| POST | `/drive/confirm/{download_id}` | confirm the bytes actually arrived |

Override the backend per-session with `?api=https://…` on any page.

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

- **Per-section allowances are a backend change.** The aiming point is four
  independent counters — 10 papers, 10 marking keys, 3 notes, 3 books — each
  refilling 24 hours after its first download. Until `/auth/quota` reports
  `notes_left` / `marking_keys_left` and the server stops charging notes and
  marking keys to the paper bucket, the UI deliberately describes today's
  shared bucket instead of promising the new one. Flipping it over is
  `QUOTA_SECTION` in `config.js` plus three strings in `i18n.js`.

- **Offline covers what you have already seen.** The worker stores one
  catalogue answer per exact view (section plus any filter), up to forty of
  them, so a search never run online has nothing to fall back on — that view
  shows the offline state, honestly. Downloads always need a connection.

- `/auth/forgot-password` and `/auth/reset-password` don't exist server-side
  yet. The sign-in screen has both panels built and wired to validation, but
  submitting says so plainly instead of faking success — swap the banner in
  `wireForgot()` for the real calls when the endpoints land.
- The app is English-only and light-only. The former EN/Chichewa toggle and
  the dark-mode toggle were removed; `assets/js/i18n.js` is now a plain
  English string table, and the theme boots straight to the light palette.
  The separate dashboard overview page was also removed — signing in now
  lands directly on Past Papers.
