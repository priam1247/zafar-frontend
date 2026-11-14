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
  settings.html          the account, the data kept here, password reset
  help.html              FAQ, and the form that asks for a missing file
  admin.html             the owner/editor portal (noindex, not linked publicly)
  favicon.ico            the tab icon, three sizes in one file
  robots.txt             what a crawler may read: the icons, not the shelves
  assets/img/icon-*.png  the mark at every size a browser or a search engine
                         asks for (drawn by tools/make-icons.py)
  assets/css/app.css     the signed-in app — same system as auth.css
  assets/css/admin.css   the portal, phone-first: rows become cards under 720px
  assets/css/auth.css    the authentication screen — self-contained, so the
                         app stylesheet can be re-skinned without touching it
  assets/fonts/…         Instrument Sans, 29 KB variable (the only webfont)
  assets/img/icon.svg    the open-book mark, scalable, for the browser tab
  assets/img/icon-*.png  the same mark rasterised for a home screen: 192, 512,
                         a 512 maskable, and a 180 apple-touch icon
  manifest.webmanifest   name, colours and icons for "Add to Home Screen"
  assets/js/config.js    API client, token storage, the signed-in profile, formatting
  assets/js/i18n.js      the English string table for the signed-in app
  assets/js/shell.js     bar + drawer + four tabs + allowance sheet + toasts
  assets/js/list.js      the shared document-list page
  assets/js/auth.js      sign in / create account / verify
server.js                zero-dependency static server for local development
worker.js                Cloudflare Worker that signs + streams Drive downloads
```

The bar, the drawer and the bottom tabs are rendered once from `shell.js`, and
every list page (books, past papers, notes, marking keys) is one call to
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

**The signed-in app** (`app.css`) is the same system, built the same way, and
it is the same on a phone as on a desk: the column keeps its 470px width and
centres itself. The bar is two lines and nothing else — an avatar with *Hi,
Priam* beside it on the left, Help on the right, then *Library / Books* with the
day's allowance beside it. Tapping the avatar opens the drawer: a profile card
(full name, the address you signed in with), the four sections, **My
Downloads**, **Settings**, **Help**, and **Log out** in soft red at the bottom
behind a confirmation. The drawer closes on the overlay, on Escape, on a link,
and on a rightward swipe of the panel itself.

The bar shrinks by a few pixels once the list is scrolling — not a fixed height
that jumps: the padding, the avatar and the title each step down, so reading
costs less chrome. There is no band above it in the installed app either; the
only space up there is `env(safe-area-inset-top)`, which is zero unless the
phone has a notch.

**Four tabs, solid white, 24px icons.** Books, Past Papers, Notes, Marking Keys
— in that order, Books first, because that is where signing in lands. Four is
what lets *Marking Keys* stay on one line at 360px. The bar is `#FFF` with one
hairline on top and no blur or translucent wash behind it (that wash is what
made the icons look soft), every icon is exactly 24×24 on the same 24-unit grid
with `shape-rendering="geometricPrecision"`, inactive icons are solid `--muted`
teal-grey rather than teal at 70%, and the active tab is a filled mint pill with
a bolder label. Each tab is a 56px-tall target plus
`env(safe-area-inset-bottom)` of padding, so it clears the gesture bar.

**Favorites is gone** (the tab, the heart, the count, and `favorites.html`;
`/favorites` now redirects to Books). **My Downloads is gone too** — the page,
the drawer row, its strings and its recipe-shortcut. What the app still keeps
is the bare fact that a file was saved on this phone: the card says
*Downloaded ✓*, and Settings shows the count and a way to clear it. The list
lives in `localStorage` under the account's own namespace, so two people
sharing a handset never see each other's.

**Settings** (`settings.html`) holds only what is true: the name and address
the sign-in established (the API has no student profile route, so these are
display values from the form or from Google's ID token, never an authorization
decision), how many downloads the phone is remembering, a way to clear that,
and a link to the password reset flow. There are no invented toggles: a
preference the backend cannot store is a lie with a switch on it.

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
choice is written to `?section=` so a link or the back button returns to it,
and a card on the Primary shelf downloads with `section=primary`, so the papers
allowance is charged once and correctly.

**The catalogue is read one page at a time.** The first request asks for
`limit=50&offset=0` — the backend's default page — and nothing else is fetched
until the student reaches the end of the list, by scrolling (an
`IntersectionObserver` watches a hairline under the last card) or by tapping
*Load more*. Each further page asks for the next `offset` and is appended, not
replaced. A page shorter than 50 is the end of the shelf; a full page that
brings no new ids means the server ignored `offset`, so the page stops there
rather than asking forever. Changing the switch, the search or the category
throws the offsets and the rows away and starts at `offset=0` again. Answers
are kept for one minute per exact view (`section|category|q`), so going back to
the same search costs no request.

**The count is the library's, not the page's.** Fifty cards on screen must not
mean "50 results", so the size of the whole answer arrives beside the page in an
`X-Total-Count` header (`authGetMeta` in `config.js` reads it): the catalogue
shows *1,240 results* from the first page, and the number does not move as pages
arrive. It is the count **after** the section, category and `q` filters and
**before** the page is cut out of the answer, so it also follows a search. The
same header lets the page know it has reached the end without spending a request
on an empty page. Until a backend sends it, the count grows with the pages and
is written `50+` — a floor, never a claim that the list ends at fifty. The
backend change this needs is written out in
`docs/backend-prompt-results-total.md`.

Glyphs are one family — the same 24-unit grid and 1.8 stroke in the bar, the
drawer, the cards and the states — and every size is a whole pixel, because a
23.5px icon lands on a half pixel and the phone blurs it to hide it. Cards are
16px radius on white with one soft shadow, 16px of padding and 12px between
parts; teal is the only accent, the neutrals are warm, and every control is at
least 44px in its smaller dimension.

The allowance pill is the **Books** page's. It sits beside the title so it
stays visible while the catalogue scrolls, and it reads as a sentence rather
than a counter: **3 books left today**, **1 book left today**, **0 books
left · resets at midnight**. The number is always the server's — `left` and `limit` both come
from `/auth/quota`, and a page that is told neither shows no pill at all rather
than quoting a policy the backend may not keep. Three or two left is teal, one
is amber, none is muted red; tapping the pill opens a small sheet that says how
many you get a day, how many are left, and that the allowance starts again at
**02:00 in Malawi (00:00 UTC)**.

Every section counts its own allowance the same way, in its own words —
**10 papers left today**, **3 notes left today**, **10 marking keys left
today** — and keeps the same behaviour at zero (the notice, *Limit reached* on
the buttons, the server re-check on the next tap). A section whose numbers the
server does not report shows no counter and no notice, and its buttons stay as
they are: saying nothing is the honest option when there is nothing to say.

At zero the pill is not the only signal: every *Download* button on the page
becomes *Limit reached* and stops accepting taps — `aria-disabled`, not
`disabled`, so a screen reader still finds it and a tap still opens the sheet
that explains why. The buttons keep their size and place; hiding them would
move the page under a thumb already reaching for one. The same check runs
before the request whenever the stored count says zero, because an unconfirmed
reservation or the refill can have freed a place since the answer arrived.

**Re-downloads still cost a place.** The requirement was that downloading a
file you already have should not count against the limit. The backend cannot do
that today: `/drive/download/{id}` inserts a `download_logs` row after counting
today's rows for `(user_id, category)` with no `file_id` in the condition, so a
second copy of the same book is charged exactly like the first. The app
therefore charges it, and counts it, honestly — a client-side "already
downloaded" exemption would desynchronise the pill from the server's own
numbers. Making it free is a backend change (add `file_id NOT IN (...)` to the
counting condition, or dedupe on confirm); until then the app says what is
true. Each section has its **own** allowance, and the page reports
the one it spends: **10 papers, 3 books, 3 notes, 10 marking keys** a day, each on its own UTC day. `QUOTA_FIELD` in `config.js` maps a page
to the field prefix its numbers live under — the `marking-keys` section reads
`marking_keys_left` / `marking_keys_limit`, with the underscore the API uses.
Both the count and the ceiling come from that answer, because both are server
settings (`DAILY_*_LIMIT`). The app carries no copy of those numbers: there is
no `DAILY_LIMITS` any more, so a retuned allowance cannot leave a stale figure
on screen. The Help page reads the same answer for its table; if that request
fails the rows keep a dash and the note says the limits could not be read,
rather than printing a policy the backend may not be keeping. Where the server
reports no count — or no ceiling — the pill stays hidden for the same reason.

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
does not dress the failure up as a refusal. Every card carries the shelf it
came from, so its download is charged to that shelf's allowance — a Primary
paper to papers, a note to notes — never to whichever page happens to be
nominally on screen.

Cards keep the same discipline as the auth screen — one accent, one hairline,
one shadow — with a mint tile for the file mark, the title, a category chip,
then size and a single pill CTA. List view collapses the same card to one row. States (empty, error,
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
| POST | `/drive/confirm/{download_id}` | confirm the bytes actually arrived — the id waits on the phone until the server accepts it, because an unconfirmed download only counts for five minutes |
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

**It is built for a phone first**, like everything else here: the people who run
StudyMW do it on the same handset the students use. The bar and the section tabs
are sticky, the tabs scroll sideways with a fade at the edge instead of being
squeezed to five unreadable words, and below 720px every table row becomes its
own card — the column name sits beside the value, taken from the cell's own
`data-label`, so adding a column needs no new CSS. Nothing depends on hover;
every control is at least 44px; the dense KPI grid folds to two columns.

It is `noindex` in its own `<meta>`, `Disallow: /admin` in `robots.txt`, and
`_headers` sends `X-Robots-Tag` for anything that asks anyway. There is no link
to it on any student page: the bar shows an **Admin** button only after
`GET /admin/whoami` has answered with a role for the account that is signed in,
which is one request per browser session and a `403` for everyone else. That
button lives in the drawer, next to Help — the bar has exactly one button and it
is Help.

### Getting in the first time

Being an owner is a database fact, not a form. Nothing in the app can grant it —
that is the point — so the first one is made from a trusted terminal:

```bash
# 1. The account must exist and have a verified email already: sign up in the
#    app with a gmail.com address and enter the code it emails you.
# 2. With the production environment loaded (the same DATABASE_URL / D1
#    variables the service runs with), from the backend checkout:
python -m scripts.make_owner owner@gmail.com
```

The script prints an `otpauth://` URI (paste it into an authenticator app, or
type the secret it also prints), then asks for the six-digit code showing in
that app. Only after the code verifies does it write `role = owner` and the
encrypted secret — a wrong code saves nothing. It refuses to run if an owner
already exists.

Then, in the browser:

1. **Sign out and back in.** The old token was issued before the account had a
   second factor, and every protected route refuses an owner token that carries
   no MFA proof (`403 admin_mfa_required`) — so the existing session stops
   working until it is replaced.
2. Sign in with the password. The card asks for the authenticator code — the
   field is hidden until the API answers `401 admin_totp_required`.
3. The bar now has an **Admin** button; `/admin` works for that account and
   returns *"This area is for administrators"* for every other one.

Further admins never need the terminal twice: `python -m scripts.make_owner
--enroll theirs@gmail.com` prints a URI for *their* authenticator, and the owner
then sets the role in **Users** → the Role select. Assigning `owner` to an
account without an enrolled authenticator is refused with
`owner_mfa_not_enrolled`, which is why `--enroll` comes first. Every role change,
suspend, deletion and settings save lands in the audit log, written in the same
transaction as the change.

**Nothing on it is invented.** Every figure comes from the API, and a missing
field prints "—" rather than a zero, because a zero is a claim. That means the
portal is honest in the state the backend is in today: it opens, checks
`GET /admin/whoami`, and if the API has no `/admin` routes it says *"The admin
API isn't deployed yet"* and stops. No sample users, no made-up download charts.

Four gates, each a sentence rather than a blank page:

| What the API says | What the admin sees |
| --- | --- |
| no token | *Sign in first* — with a link back |
| 401 | sent straight to the sign-in screen, session cleared |
| 403 | *This area is for administrators* |
| 404 / 501 | *The admin API isn't deployed yet*, pointing at the contract |
| anything else | the reason, and a Try again button |

When an owner's sign-in is refused, the wording says which of the two it is:
`401 admin_totp_required` reveals the code field and asks for it again, while
`403 admin_mfa_unavailable` means the account has no authenticator enrolled and
only the terminal can fix that.

Roles are `owner` (everything), `editor` (library and moderation) and `viewer`
(statistics only); no role at all means ordinary student. The tabs follow the
role, and so does every route on the API — hiding a tab is convenience, not
security. Every change the portal makes is audited server-side.

The contract the page already speaks — routes, payload shapes, what each number
means and where it should come from, 2FA for the owner, audit rows inside the
same transaction, signed export links — is `docs/admin-portal.md`. It is written
so the backend can be built against it without another round of guessing.

## What students can send back

**A request** — "this paper is not in the library". The Help page
(`help.html#request`) posts `POST /requests` with the library folder the file
belongs in (`papers`, `primary`, `books`, `notes`, `marking-keys`), a title and
an optional note. The FAQ answer that mentions missing papers links straight to
the form. It carries the ordinary student bearer token: the submission belongs
to the account that sent it, and a `401` sends the student to sign in rather
than showing an error. The caps match the API's own (`title` 160, `note` 2000),
and the limit is per account — 3 requests per 10 minutes. The `429` arrives
with `Retry-After` and the page says "Try again in 2 minutes" instead of
repeating the server's sentence.

**Reports have no entry point, and no client either.** `POST /reports` is live
on the backend, but the app no longer offers reporting: the alert button on
each card was removed by request, together with its dialog, and a report has to
carry the id of a real file — which only the card could supply. There is no
honest way to ask a student for one by typing it, so the client binding and its
strings were deleted rather than left idle. If reporting comes back it should
come back as a "Something wrong with this file?" row on a downloaded card,
where the id is already stored, or as a picker on the Help page. The portal
side of the queue is in `docs/admin-portal.md`.

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
  `/auth/quota` too, so the two never disagree, and nothing in the app keeps a
  copy of the numbers to disagree with: if that request fails the table shows
  dashes and says so.

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
