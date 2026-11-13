# Deploying: Cloudflare for the site, Koyeb for the API

Two hosts, two halves, one contract. This is the runbook for the pair, and the
place to look when "the button isn't there" or "the app can't reach the API".

| What | Where | Serves |
| --- | --- | --- |
| The site | Cloudflare Worker `zafar-frontend`, custom domain `studymw.netlibrary.dpdns.org` | everything in `web/` |
| The API | Koyeb service running `zafar-backend` (`bloody-brigitta-…koyeb.app`) | `/auth/*`, `/drive/*`, `/health` |
| Signed downloads | Cloudflare Worker `download-proxy` | the redirect a download lands on after `/drive/download/{id}` |

The frontend never calls anything but the API origin in
`web/assets/js/config.js` → `API_BASE_URL`. There is no relative-path proxy in
between, so the API must allow the site's origin in CORS
(`ALLOWED_ORIGINS=https://studymw.netlibrary.dpdns.org`, exact, including
scheme) — see `zafar-backend/docs/FRONTEND_DEPLOYMENT.md`.

## Google sign-in across the two hosts

The ID token flow needs three things to agree, and each lives somewhere
different:

1. **Google Cloud** — the OAuth *Web application* client's *Authorised
   JavaScript origins* must list `https://studymw.netlibrary.dpdns.org` (and
   `http://localhost:4173` for local work). No redirect URI is needed: this is a
   popup/ID-token flow, not a redirect one.
2. **Cloudflare** — `GOOGLE_CLIENT_ID` in `web/assets/js/config.js`. This is the
   switch that draws the button; it is public by design and is already set. It
   ships with the site, so it takes effect on the next Worker deploy.
3. **Koyeb** — `GOOGLE_CLIENT_ID` in the service environment, with the **same**
   value:

   ```text
   GOOGLE_CLIENT_ID=511934392016-ehg3o0pfejjr9qhavvhj1uoo3aoq7knm.apps.googleusercontent.com
   ```

   Then redeploy the service. Until that variable is set, `POST /auth/google`
   answers **503 `google_not_configured`** and the card says *"Google sign-in
   isn't switched on yet. Use your email and password."* — which is the honest
   state and also the fastest way to see the difference: a student who reads
   that sentence has a Koyeb environment without the variable.

A mismatch between (2) and (3) looks different: Google signs a token for one
audience, the API refuses it, and the card says *"Google couldn't confirm that
account."* Same code path, different cause — check that the two values are
character-for-character identical before looking anywhere else.

**No client secret is involved anywhere.** Google signs the token; the API
verifies the signature against Google's published keys. Nothing in either
deployment needs a secret, and none should ever be pasted into this repository.

## Checking a deployment without touching it

These are read-only and tell you most of what a bug report would:

```bash
# Is the API awake? (Koyeb's free instance sleeps; the first call is slow.)
curl -s https://bloody-brigitta-ahzafar-de9b1709.koyeb.app/health            # {"status":"ok"}

# Is the Google route deployed? 405 = the path exists and only takes POST;
# 404 = that deployment predates the route.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://bloody-brigitta-ahzafar-de9b1709.koyeb.app/auth/google

# Does the live site carry the client ID? (empty or absent = old deploy)
curl -s https://studymw.netlibrary.dpdns.org/assets/js/config.js | grep GOOGLE_CLIENT_ID=
```

A last check that only a browser can make: open the sign-in page, and look for
**Continue with Google** at the bottom. If the button is missing but the ID is
in the file, the scenario is almost always Cloudflare — see below.

## The deployed paths have no `.html` on them

Cloudflare serves the pages at their clean paths — `/login`, `/register`,
`/verify`, `/dashboard` — and a request for `/login.html` is normally redirected
to `/login`. That is one URL shape too many for a page that asks "which page am
I?" and forgets to allow for both.

It has already happened once: the sign-in card's Google block was drawn only on
`login.html` or `register.html`, so on the deployed `/login` it decided it was
not a sign-in page, hid itself, and never asked Google for a script. Localhost
and the test suite were both happy, because both served `login.html`. The fix is
`currentPage()` in `web/assets/js/auth.js`: strip the directory, strip the
extension, compare against `login` / `register` / `verify`. The dev server now
answers the clean paths too (see `server.js`), so the next bug of this kind
fails locally rather than on a phone.

Anything new that branches on `location.pathname` must go through that helper.

## Cloudflare settings that break this button

* **Rocket Loader must stay off.** It defers third-party scripts and rewrites
  their loading order; Google's script then initialises after the page has
  already asked it to draw, and the button never appears.
* **Email Address Obfuscation** rewrites anything that looks like an address in
  served HTML. This app builds its screens in JavaScript so it is not affected
  today, but leaving it on is asking for a mystery later.
* **`_headers`** is applied when the Worker serves `web/` as static assets, and
  that is what carries the no-cache rule for pages and the CSP
  (`frame-ancestors 'none'`). If the site is ever moved behind a Worker that
  builds responses in code, those headers have to be set there instead — a page
  served without them is a page that can be framed.
* A Worker deploy is atomic: the site goes from the old build to the new one in
  one step, so an HTML change and the `config.js` change that supports it can
  never be half-live.

## Koyeb settings worth knowing

* The free instance sleeps. The app pings `/health` once per page load
  (`Zafar.warmUp()`) so the instance is awake by the time someone presses a
  button — but the first page of the day can still take ~30 s to answer.
* **The first listing is the slowest request in the app.** Answering it means
  walking the Drive tree, and each of those Drive calls may take up to 20 s on
  its own; the result is then cached, so every later visit is quick. A browser
  deadline shorter than that can only abort work that was going to answer, and
  the student sees a failure that "works after a refresh". That is exactly what
  a 15 s deadline did. Two deadlines now exist in `config.js`:
  `REQUEST_TIMEOUT_MS` (15 s) for forms and small reads, `LIST_TIMEOUT_MS`
  (45 s) for `/drive/papers` and `/drive/categories`, and a timed-out catalogue
  request is retried once — the scan it interrupted is usually finished by the
  time the retry arrives. While that happens the count line reads *"Still
  loading — the first visit takes a moment."*, and if both attempts fail the
  page shows its error state with a **Try again** button.
  Do not "fix" a slow first listing by shortening these: it makes the symptom
  (refresh works) into the cause (the scan never finishes in the browser).
* Environment variables are read at process start: change `GOOGLE_CLIENT_ID`
  and you must redeploy/restart, not just save.
* `ALLOWED_ORIGINS` is the exact site origin. A wrong value here fails every
  request from the site with a CORS error that looks like the API being down.

## Order of operations

1. Koyeb: set `GOOGLE_CLIENT_ID` (same value as `config.js`) → redeploy.
2. Cloudflare: deploy the current `main` of this repository if it is not already
   live (check with the `curl … | grep GOOGLE_CLIENT_ID=` above).
3. Open the site, press **Continue with Google**, and sign in with a personal
   Gmail account. A work or school Google account is refused on purpose with
   *"StudyMW works with Gmail addresses"* — registration codes only ever go out
   from the site's Gmail.
4. If it fails: the sentence on the card names the cause, and the table in
   `docs/backend-prompt-google-signin.md` maps it to the host at fault.
