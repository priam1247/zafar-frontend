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
  assets/css/app.css     the whole design system, token driven, light theme
  assets/css/auth.css    the authentication screen
  assets/img/hero.jpg    brand photograph (auth hero)
  assets/js/config.js    API client, token storage, favorites, formatting
  assets/js/i18n.js      the English string table for the signed-in app
  assets/js/shell.js     sidebar + topbar + drawer + toasts
  assets/js/list.js      the shared document-list page
  assets/js/auth.js      sign in / create account / verify
server.js                zero-dependency static server for local development
worker.js                Cloudflare Worker that signs + streams Drive downloads
```

The sidebar and topbar are rendered once from `shell.js`, and every list page
(papers, books, notes, marking keys, favorites) is one call to
`ZafarList.init({...})` — so a change to a card or a filter lands everywhere.
Likewise `auth.js` builds the whole sign-in screen, and `login.html`,
`register.html` and `verify.html` are 20-line shells that differ only in which
panel opens first.

## Design

Colours live in `web/assets/css/app.css` as tokens and derive from the
authentication screen: deep forest green `#0c3a2d` on warm cream `#f7f2e8`,
with white as the single bright accent on the green surfaces. The app is
light-only and English-only. Nothing in the app hard-codes a colour outside
those tokens.

## Running locally

```bash
node server.js            # http://localhost:4173
```

Or with the Alloy dev stack:

```bash
docker compose -f docker-compose.alloy.yaml up
```

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

There is no demo mode — the app always talks to the real backend. When it
can't be reached, each page shows a clear error or offline state instead of
fake data, so what you see is always what's actually published.

## Downloads

The catalogue response never carries a file URL — a permanent link there would
let the daily quota be bypassed from the network tab. Each click calls
`POST /drive/download/{id}`, which enforces the quota and returns a signed,
expiring URL for `worker.js`. The Worker verifies the HMAC and streams the file
from Drive with a correct `Content-Disposition`; the page then hands the browser
a same-origin blob so the filename survives.

## Known gaps

- `/auth/forgot-password` and `/auth/reset-password` don't exist server-side
  yet. The sign-in screen has both panels built and wired to validation, but
  submitting says so plainly instead of faking success — swap the banner in
  `wireForgot()` for the real calls when the endpoints land.
- The app is English-only and light-only. The former EN/Chichewa toggle and
  the dark-mode toggle were removed; `assets/js/i18n.js` is now a plain
  English string table, and the theme boots straight to the light palette.
  The separate dashboard overview page was also removed — signing in now
  lands directly on Past Papers.
