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
  help.html              FAQ, and the form that asks for a missing file
  favicon.ico            the tab icon, three sizes in one file
  robots.txt             what a crawler may read: the icons, not the shelves
  assets/img/icon-*.png  the mark at every size a browser or a search engine
                         asks for (drawn by tools/make-icons.py)
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

The sign-in sheet opens with a small CSS-drawn stack of books — three spines
and a leaning one, straight-line SVG in the markup — which costs zero bytes.
On a phone the drawing is hidden outright: the form is the reason the page
exists, and at 360×640 every 60 pixels of decoration pushes a button below the
fold.

**The sign-in screen is sized so it does not scroll.** The teal band holds a
wordmark, one short line ("Pass MSCE & JCE.") and a sentence that names what is
inside — the four section names used to sit there as pill-shaped tags, which
looked tappable and were not, so they moved into the sentence where they read as
a promise. The band is sized by its own copy, never by a fraction of the
viewport, and `@media (max-height: 700px)` trims the band, the fields and the
button on a short screen — never the form itself.

**Text is measured, not eyeballed.** Quiet text on the sheet is `--muted`
`#4B666A` (6.1:1 on cream), placeholders are `#5D7275` (5.1:1 on white), typed
text is ink (18.6:1), and the border a field shows at rest clears 3:1 against
the field it surrounds. A test computes those ratios from the stylesheet itself,
so a shade that "looks fine" on a desk cannot quietly become 4:1 in daylight.
The one amber thing on the page is the word FREE in the footer: an accent is for
a highlight, not for anything a student needs in order to sign in.

**The signed-in app** (`app.css`) is the same system, built the same way. A
teal bar carries the wordmark, the page title, the day's download allowance and
a running count; the white sheet carries the catalogue; five tabs pinned to the
bottom hold the sections (Past Papers, Books, Notes, Marking Keys, Favorites).
There is no sidebar and no drawer — categories are chips that scroll sideways
on the list pages, and Help sits in the bar with its word on it next to an
icon-only Log out.

**Two ways in.** The sign-in card leads with *Continue with Google* — one tap
instead of typing an address and a password on a phone — then an `or` rule, then
the email and password form. (The rule belongs to Google: it is there to explain
why a form follows, so the two appear and disappear together.) Google's own
script draws the button — the
branding is theirs to keep — and the only thing that leaves the page is the ID
token Google issued: `POST /auth/google` verifies it against the client ID and
answers with the same JWT the email form gets, so nothing downstream knows the
difference. The button stays out of the create-account side (that flow proves
the address with a code) and off the code screen.

It is drawn only when `GOOGLE_CLIENT_ID` in `config.js` is a real client ID, and
it never fails silently: the backend's machine code in `X-Error-Code` picks the
sentence, so a student is told *which* thing is wrong — `google_not_configured`
("isn't switched on yet" — and go and use the form below), `google_email_unsupported`
("StudyMW works with Gmail addresses"), `google_account_unavailable` ("try again
in a moment") or `google_invalid_token` ("couldn't confirm that account"). The
backend's own wording never reaches the screen; it is written for an operator.

**The client secret is not part of this.** An ID-token flow has nothing for one
to do: Google signs the token, the backend checks the signature against Google's
published keys. Only the public client ID is in this repository, and a secret
that ever turns up in it — or in a chat, a screenshot, a support thread — should
be reset in the Google Cloud console rather than pasted anywhere. `.gitignore`
keeps `client_secret*.json` out, and a test fails if a `GOCSPX-` string is
dropped into `web/`.

The fields themselves are white on the cream card with a line at rest that
clears 3:1 against that white (WCAG's floor for a control's own edge), ink for
what is typed (18.6:1) and a placeholder at 5.2:1 with `opacity: 1`, so it is
not faded twice. A 3 px ring marks focus, since `:focus-visible` never fires on
a phone. That is the whole difference between a field and a disabled box in
daylight.

**Past Papers holds two shelves.** A Primary / Secondary switch sits above the
search box — inside the page, not in the tab bar, because Primary is a level of
the same subject, not a sixth section. Secondary asks the server for
`section=papers`, Primary for `section=primary`; both read the **papers**
allowance (`quotaKey` stays `papers`), so Primary never opens a second bucket
to spend. Switching reloads the folder chips for that shelf and starts again at
the first page, because a Secondary folder would filter Primary to nothing. The
choice is written to `?section=` so a link or the back button returns to it, and
Favorites reads `primary` as well, so a saved Primary paper is listed under
*Primary* and downloaded with `section=primary`.

**The catalogue is read one page at a time.** The first request asks for
`limit=50&offset=0` — the backend's default page — and nothing else is fetched
until the student reaches the end of the list, by scrolling (an
`IntersectionObserver` watches a hairline under the last card) or by tapping
*Load more*. Each further page asks for the next `offset` and is appended, not
replaced. A page shorter than 50 is the end of the shelf; a full page that
brings no new ids means the server ignored `offset`, so the page stops there
rather than asking forever. Changing the switch, the search or the category
throws the offsets and the rows away and starts at `offset=0` again. Answers
are kept for one minute per exact view (`section|category|q`), so starring a
favourite or repeating a search costs no request.

**The count is the library's, not the page's.** Fifty cards on screen must not
mean "50 results", so the size of the whole answer arrives beside the page in an
`X-Total-Count` header (`authGetMeta` in `config.js` reads it): the catalogue
shows *1,240 results* from the first page, and the number does not move as pages
arrive. It is the count **after** the section, category and `q` filters and
**before** the page is cut out of the answer, so it also follows a search. The
same header lets the page know it has reached the end without spending a request
on an empty page. Until a backend sends it, the count grows with the pages and
is written `50+` — a floor, never a claim that the list ends at fifty. Favorites
counts its own saved list, which lives on the phone, so `12 saved` is exact with
no page needed; with a search or a category on it counts what it has read and
says `12+ saved`. The backend change this needs is written out in
`docs/backend-prompt-results-total.md`.

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

## The mark, and how it appears in search

One mark: an open book with its pages fanning out on both sides, cream on the
teal tile. It is drawn from curves in `tools/make-icons.py`, which writes every
file in `web/assets/img/` **and** `icon.svg` from the same numbers, so the SVG a
browser scales and the PNG a crawler downloads cannot drift apart. Every page
links the same block of them:

| File | Who uses it |
| --- | --- |
| `favicon.ico` (16, 32, 48 in one file) | a browser tab, and anything that still asks for `/favicon.ico` without reading the page |
| `icon-16.png` | the tab strip; a simplified drawing — at 16 px the fanned edges turn into grey mud, so that size keeps only the pages and the spine |
| `icon-48/96/144/192.png` | Google's results, Chrome's tab and bookmark icons, Windows shortcuts. The sizes are multiples of 48 on purpose: that is the shape Google asks for |
| `icon.svg` | anything modern enough to scale it, down to a 16 px tab |
| `apple-touch-icon.png` | the iOS home screen; square and full bleed, because iOS draws its own corners |
| `icon-maskable-192/512.png` | Android's launcher, which crops to a shape of its choosing; the mark stays inside the safe circle |
| `og-1200x630.png` | the card that appears when a link is pasted into WhatsApp, X or Facebook |
| `safari-pinned-tab.svg` | Safari's pinned tab, painted in the brand teal |

Three things make the mark appear **beside a search result** rather than only in
the tab:

1. The sizes above are real files at the sizes they claim — a test reads each
   PNG's header and fails if a 512 has been renamed to `48x48`.
2. `robots.txt` keeps `/assets/` and `/favicon.ico` open. Google will not show a
   favicon it is not allowed to fetch, which is why the five signed-in pages are
   the only things it closes.
3. Every page carries a canonical address on `https://studymw.netlibrary.dpdns.org`
   and a `WebSite` block in JSON-LD (`name`, `url`, and the logo as an absolute
   URL), so the site can be named as **StudyMW** rather than guessed from a
   URL. The `og:` and `twitter:` tags use the same title and description as the
   page itself.

Two things no amount of markup can rush: Google recrawls a favicon on its own
schedule (days, sometimes weeks), and it re-reads a name only after the domain
is indexed. Nothing here has to be deployed twice for that to happen.

To change the mark, edit the curves in `tools/make-icons.py`, run
`python3 tools/make-icons.py` (needs `pip install pillow`), and commit what it
writes. The site itself still has no build step and no dependencies.

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

The site is served at **`https://studymw.netlibrary.dpdns.org`** — the origin
written into every page's canonical link, its share card and its JSON-LD, and
the one the backend's `ALLOWED_ORIGINS` and the download worker accept. If the
domain ever changes, those are the files to change: `grep -rn
studymw.netlibrary web/ README.md`, plus the backend's environment.

`API_BASE_URL` in `web/assets/js/config.js` points at the deployed FastAPI
backend. Endpoints used:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | create an account — `{email, password, name}` |
| POST | `/auth/login` | issue a JWT (form-encoded: `email`, `password`) |
| POST | `/auth/google` | exchange a Google ID token for the same JWT — see `docs/backend-prompt-google-signin.md` |
| POST | `/auth/verify` | confirm the 6-digit email code — `{email, code}` |
| POST | `/auth/resend` | send a fresh verification code — `{email}` |
| POST | `/auth/forgot-password` | email a reset code — `{email}` |
| POST | `/auth/reset-password` | set a new password — `{email, code, new_password}` |
| GET | `/auth/quota` | today's remaining downloads, per section |
| GET | `/drive/papers` | catalogue, filtered by `section`, `category`, `q`; read 50 at a time with `limit` + `offset`, on demand; the size of the whole answer in `X-Total-Count` |
| GET | `/drive/categories` | the folder names inside a `section` |
| POST | `/drive/download/{id}` | spend quota, return a short-lived signed URL |
| POST | `/drive/confirm/{download_id}` | confirm the bytes actually arrived |
| GET | `/health` | warm-up ping, used by `Zafar.warmUp()` |

`GOOGLE_CLIENT_ID` in the same file is the switch for **Continue with Google**:
empty means no button anywhere, a real client ID (it ends in
`.apps.googleusercontent.com`) means the button appears on the sign-in card. The
backend needs the same value in its own `GOOGLE_CLIENT_ID`; until that
deployment has it, the route answers 503 `google_not_configured` and the card
says so instead of pretending. The contract the API implements is recorded in
`docs/backend-prompt-google-signin.md`, and the two-host runbook — Cloudflare
for the site, Koyeb for the API — is `docs/deploy-cloudflare-koyeb.md`.

The site is served by a Cloudflare Worker on
`studymw.netlibrary.dpdns.org`; the API runs on Koyeb. What has to agree between
the two — CORS, the Google client ID on both sides, the headers Cloudflare must
keep — is in `docs/deploy-cloudflare-koyeb.md`.

A **local** page may point at another backend with `?api=http://localhost:8000`.
On the live site the parameter is ignored: honouring it there would let a link
such as `notes.html?api=https://elsewhere` hand a student's login token to a
host we do not control.

The deployed app has no demo mode — it always talks to the real backend, and
`server.js` is the only thing that ever fakes an answer. When the backend can't
be reached, each page shows a clear error or offline state instead of inventing
data, so what you see is what's actually published.

## The admin portal

`/admin` (also `/admin.html`) is a desk tool for whoever runs the library:
users and their sign-in method, the numbers, the queue of "this paper is
missing" and "this file is broken", site settings, roles and the audit log, and
the operational state of the deployment — storage, backups, exports.

It is **not** linked from any student page. It is `noindex` in its own `<meta>`,
`Disallow: /admin` in `robots.txt`, and `_headers` sends `X-Robots-Tag` for
anything that asks anyway.

**Nothing on it is invented.** Every figure comes from the API, and a missing
field prints "—" rather than a zero, because a zero is a claim. That means the
portal is honest in the state the backend is in today: it opens, checks
`GET /admin/whoami`, and if the API has no `/admin` routes it says *"The admin
API isn't deployed yet"* and stops. No sample users, no made-up download charts.

Three gates, each a sentence rather than a blank page:

| What the API says | What the admin sees |
| --- | --- |
| no token | *Sign in first* — with a link back |
| 401 / 403 | *This area is for administrators* |
| 404 / 501 | *The admin API isn't deployed yet*, pointing at the contract |
| anything else | the reason, and a Try again button |

Roles are `owner` (everything), `editor` (library and moderation) and `viewer`
(statistics only). The tabs follow the role, and so does every route on the API —
hiding a tab is convenience, not security. Every change the portal makes is
audited server-side.

The contract the page already speaks — routes, payload shapes, what each number
means and where it should come from, 2FA for the owner, audit rows inside the
same transaction, signed export links — is `docs/admin-portal.md`. It is written
so the backend can be built against it without another round of guessing.

## What students can send back

Two forms, and they are deliberately different things:

- **A request** — "this paper is not in the library". The Help page
  (`help.html#request`) posts `POST /requests` with the library folder the file
  belongs in (`papers`, `primary`, `books`, `notes`, `marking-keys`), a title and
  an optional note. The FAQ answer that mentions missing papers links straight
  to the form.
- **A report** — "this file is broken". Every catalogue card carries an alert
  button that opens a small dialog on the same page, then posts `POST /reports`
  with the file's own id, one of five reasons and an optional note. It starts at
  the card because a report has to name a real file, and the id exists nowhere
  else on the page; the API looks the file name up in the live library itself,
  so no name, email or id the client invents can reach the queue. "Something
  else" cannot be sent without a note, or the row is useless to an editor.

Both carry the ordinary student bearer token: the submission belongs to the
account that sent it, and a `401` sends the student to sign in rather than
showing an error. Caps match the API's own (`title` 160, `note` 2000, both
`extra="forbid"`), and the rate limits are per account — 3 requests and 5
reports per 10 minutes. The `429` arrives with `Retry-After` and the page says
"Try again in 2 minutes" instead of repeating the server's sentence. A report
for a file the library no longer has comes back `404 report_file_missing`, and
the dialog asks for a refresh rather than a pointless retry. The portal side of
both queues is in `docs/admin-portal.md`.

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
