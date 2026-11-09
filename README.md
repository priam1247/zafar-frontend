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
  sw.js                  the uninstaller — retires the worker older versions
                         installed; caches nothing
  reset.html             standalone recovery page, never cached
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
catalogue — and again if a download is refused — naming **which** allowance ran
out (papers, or books), saying how many of the other one are still available,
and when it refills: **02:00 in Malawi, which is midnight UTC**. It never says
"tomorrow", because the refill is not a day away — a student who hits the limit
at 01:00 has it back within the hour.

A refusal is a statement about a moment, not a permanent fact. The backend
expires an unconfirmed reservation five minutes after the *download request*,
not five minutes after we hear about it, so no local timer can know when the
answer changed: whenever the stored count says zero, the next tap asks
`/auth/quota` again and proceeds if the server has moved on. If that check
cannot reach the server, the page says so ("couldn't check your allowance") and
does not dress the failure up as a refusal. Favorites has no allowance of its
own, so a refusal there is a toast and nothing else — no amber chip, and no
notice whose button leads back to the page you are on.

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

**ZAFAR keeps nothing on the phone.** There is no service worker, no cache,
no stored copy of any page, and no offline list. Every request goes to the
network.

That is a decision, made after the alternative took the site down. Offline
reading stored the last catalogue answer per view and served the app's own pages
from the device; when a stored page was the *first* answer for a navigation, one
entry the browser would not render was every page failing, with no page inside
the app left to repair it from. It is also worth being honest about what the
feature bought: a stored list carries **no download URLs** — the download is a
`POST /drive/download/{id}` that spends the allowance, and the file link is a
signed URL that lives five minutes — so an offline phone could see a list of
filenames and download none of them. A list you cannot act on is not worth a
class of failure that can brick the app.

What remains, and why:

- **`web/sw.js` is an uninstaller.** Phones that installed an older version
  still have its worker and its stored pages. The browser checks a
  registration's script on the next visit, so this version reaches them, deletes
  the `zafar-*` caches, and unregisters itself. It has no fetch handler and no
  cache of its own. It can be deleted once the installed base has had a few
  weeks to update.
- **`shell.js` retires the worker from the page side**, on load, for browsers
  that never run the new script. Matching is by script URL, so another app's
  worker on a shared origin is left alone.
- **`web/_headers` serves `/sw.js` and every page with `Cache-Control:
  no-cache`.** Without it a phone can keep a stale script, and a fix arrives
  days late.
- **`reset.html` is the way back** for a phone still stuck on an old copy. It is
  standalone — no stylesheet, no script file, nothing an older version could
  have stored — unregisters only the registration whose script URL is ZAFAR's,
  deletes only `zafar-*` caches, and then checks the browser again before it
  claims success. If another tab put the worker back, it says so instead of
  reporting a reset that did not happen.

**It is not a guarantee, and the README used to pretend otherwise.** A worker
that answers every navigation can answer `reset.html` too — that is precisely
the failure it exists to repair. When even the reset page will not load, only
the browser can clear the site, and the page carries those steps (Chrome on
Android: Settings → Site settings → All sites → the site → Clear & reset;
Safari on iPhone: Settings → Safari → Advanced → Website Data → Delete). Close
every ZAFAR tab before and after; an open tab can put the old copy back.

There is no `?sw=1` any more — nothing to force on. Demo mode and `?sw=0` still
clear any leftover worker and its caches, because `server.js` rewrites each page
as it serves it and a stored page would be the wrong page.

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
