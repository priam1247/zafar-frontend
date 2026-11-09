# Frontend ↔ backend alignment

Read from `priam1247/zafar-backend` @ `708bf30` (API 0.2.0) and from the deployed
`/openapi.json`. This is the list of changes the **frontend** needs so that what
it sends, expects and promises matches what the backend actually does. No code
has been changed for this document.

Legend: **P0** breaks a flow · **P1** wrong behaviour or a false claim ·
**P2** polish, docs, dead weight.

---

## 0. The origin gate — check this first (P0)

Both the API and the download proxy hardcode **one** allowed origin:

| Where | Value |
| --- | --- |
| `main.py` → `CORSMiddleware(allow_origins=…)` | `https://library.zafarh.dpdns.org`, `http://library.zafarh.dpdns.org` |
| `cloudflare-worker/download-proxy/worker.js` → `ALLOWED_ORIGIN` | `https://library.zafarh.dpdns.org` |

Note the **`h`**: `zafarh`, not `zafar`. Anything else — a Cloudflare preview URL,
a `workers.dev` URL, `localhost` during development, `?api=` pointed at a local
server — is refused by CORS, and a CORS failure is indistinguishable in the UI
from being offline ("Could not reach the server. Check your connection.").

Frontend changes:
1. Record the production origin in the README, so nobody ever debugs this again.
2. Decide how development works: either the backend allowlist gains the dev
   origin (a **backend** change), or development runs behind the production
   hostname. `?api=` alone does not help — the browser origin is what CORS
   checks.
3. Make the offline/network error copy distinguish "no connection" from
   "this site is not allowed to talk to the API" — they are different seconds
   of a student's life.

---

## 1. Registration is Gmail-only (P0)

`schemas.py`:

```python
@field_validator("email")
def gmail_only(cls, v: str) -> str:
    if not v.lower().endswith("@gmail.com"):
        raise ValueError("Only Gmail addresses are supported")
```

The frontend accepts any address (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), then shows
the flattened 422 — literally `email: Value error, Only Gmail addresses are
supported`. A student with a school, Yahoo or Outlook address hits a wall after
typing a password.

Frontend changes:
- Validate `@gmail.com` in the register form, before submit.
- Say *why* on the field itself — "ZAFAR sends your code from Gmail, so use a
  Gmail address" — not a bare error.
- Humanise that 422 in `friendlyError` as a fallback.
- The forgot-password and login fields stay any-email (the backend looks up
  whatever is on the account).

---

## 2. Login must accept a legacy username (P1)

`routers/auth.py::login` looks up `email OR username`. Accounts created before
the email migration sign in by typing their old username into the same field.

But the field is rendered `type="email"`, so a phone keyboard refuses `johndoe`
and the browser blocks submit before the request is ever made.

Frontend changes:
- Make the sign-in identifier field `type="text"` with `inputmode="email"` and
  `autocomplete="username"`, so both work and the @ key is still offered.
- Label it "Email or username".
- The register/verify/forgot fields stay `type="email"` — only sign-in has this
  dual meaning.

---

## 3. The token's subject is a username, not an email (P1 — correctness of copy)

`auth.py::create_access_token(user.username)`; the username is generated from the
email's local part and uniquified (`john`, `john2`, `john3`).

The frontend assumes it is an email in two places:

- `Zafar.username()` splits `sub` on `@` and title-cases the result — the comment
  says "the JWT subject is an email address", which is false. It still produces a
  plausible word ("John", "John2"), which is why nobody noticed.
- `_currentUserSuffix()` uses `sub` as the bookmark namespace. That is safe
  (usernames are unique), but a deleted-and-re-registered account gets `john2`
  and silently loses its favourites. Worth knowing; not worth fixing now.

The real display name lives at `GET /auth/me` → `UserOut.name` (nullable), and can
be set with `PATCH /auth/name` — exactly the "one-time prompt" the backend's own
comment references.

Frontend changes:
- Correct the comment; stop pretending `sub` is an email.
- Call `/auth/me` once at shell start: gives the real name, and proves the session
  before the first list request fails (see §4).
- If `name` is null, offer the one-time prompt → `PATCH /auth/name`.

---

## 4. Error shapes the UI does not distinguish (P1)

| Status | Where | `detail` | Today in the UI |
| --- | --- | --- | --- |
| 401 | every protected route | `Could not validate credentials` | clear token + login ✓ |
| 403 | `/auth/login` unverified | `Email not verified. Check your Gmail for the code.` | matched by **message text** ⚠ |
| 403 | download proxy (expired/forged link) | plain text `Link expired — request a fresh one` | `Download failed (403)` ✗ |
| 400 | `/drive/*` | `Unknown section 'x'` | generic ✗ (should never happen) |
| 404 | `/drive/download` | `File not found in this section` | generic ✗ |
| 422 | schemas | array of `{loc,msg,type}` | flattened ✓ |
| 429 | `/auth/verify`, `/auth/reset-password` | `Too many incorrect attempts — request a new code` | generic ✗ |
| 429 | `/drive/download` | `Daily download limit reached` | handled ✓ |
| 502 | `/drive/papers` | `Could not reach Drive: …` | raw string ✗ |
| 503 | any DB route | `Database temporarily unreachable — please try again shortly` | raw string ✗ |

Frontend changes:
- Branch on **status**, not on the English wording. Keep the `/not verified/i`
  check only as a fallback, and note the dependency in a comment so nobody
  rewords the backend and silently breaks sign-in.
- 403 anywhere else → "This session is no longer valid" and the same clean
  sign-out path as 401.
- 502 / 503 → "The library is having a moment — try again shortly", with the
  retry button, instead of surfacing the server's sentence.

---

## 5. Verification and reset rules the UI under-serves (P1)

Backend facts:

- Code: exactly 6 digits, valid **10 minutes**, **5 attempts**, then
  `429 Too many incorrect attempts — request a new code`.
- Wrong code: `400 Incorrect code`. Expired: `400 Code expired — request a new one`.
- `/auth/resend` only works for an **unverified** account, else
  `400 Cannot resend a code for this account`.
- `/auth/verify` on an already-verified account returns **200** "Already verified".
- Reset codes: also 6 digits, 10 minutes, 5 attempts, and every failure is the
  same generic `400 Incorrect or expired code` (deliberately).
- Password: 6–128 characters.

Frontend changes:
- On `429` from verify or reset, stop saying "incorrect" and offer resend
  immediately, with the countdown reset.
- On `400 Code expired` (verify only), the same.
- After 5 failures the code is dead — the retry loop currently keeps accepting
  input that can never succeed.
- Resend on a verified/absent account → "That account is already verified — sign
  in instead", not "Cannot resend a code for this account".

---

## 6. Quota: the numbers are the server's, not ours — closed

The backend keeps **four** buckets (`f30f39a`): `papers_*`, `books_*`,
`notes_*`, `marking_keys_*`, each with `downloaded_today` / `limit` / `left`,
from `daily_paper_limit = 10`, `daily_book_limit = 3`, `daily_notes_limit = 3`,
`daily_marking_keys_limit = 10` in `config.py`. `SECTION_QUOTA_CATEGORY` maps
the section slug (`marking-keys`) to the stored category (`marking_keys`), and
every download response carries the whole `QuotaOut`, so one successful tap
refreshes all four numbers at once.

What the frontend now does:
- `QUOTA_FIELD` maps a page's slug to its field prefix (`marking-keys` →
  `marking_keys`); the chip reads `<field>_left` and `<field>_limit` from the
  same answer.
- No reported ceiling means no chip. `DAILY_LIMITS` is the published policy the
  Help page lists, never a number to render as if measured — no fallback.
- The spent-allowance notice names the section that ran out and lists what the
  others still have, from that same answer; with everything spent it says so.
- The FAQ and the Help table describe four separate allowances, refilling at
  midnight UTC (02:00 in Malawi).

Settled by the backend, no longer a frontend question: the UTC calendar day
(`_count_today_by_category`), the 300 s reservation TTL the "a few minutes"
wording refers to, and the `429` body plus `X-Error-Code: limit_reached`. Rows
written before `f30f39a` still carry `category = "paper"` for notes and marking
keys, so an early-morning download can look like a paper until the UTC day
rolls over; nothing in the UI claims otherwise.

## 7. The download flow (P1)

`POST /drive/download/{file_id}?section=` → `{download_id, url, expires_in, quota}`.

- `expires_in` is **ignored** by the frontend. The signed link dies after 300 s.
  On a slow connection the blob fetch can outlive it and come back
  `403 Link expired` — which the UI reports as a generic failure even though the
  link, not the connection, expired.
- The signed `url` is on the **download proxy**, not the API host, and it
  carries CORS only for the production origin. The app fetches it for a blob;
  the backend's own example client instead navigates to it
  (`window.location.assign(url)`), which needs no CORS. Worth keeping a
  navigation fallback for the day CORS is the problem.
- `404 File not found in this section` happens when the Drive tree cache (6 h
  TTL) predates an upload. `POST /drive/refresh` exists and is open to any
  signed-in user — call it once and retry, instead of failing the download.
- `POST /drive/confirm/{download_id}` after the bytes arrive is correct and
  idempotent; it is what stops a good download from expiring out of the count.
  Keep it, and keep it **after** the blob resolves, never before.
- The frontend appends `.pdf` and labels everything "PDF document"; the backend
  only returns `application/pdf` and normalises the name itself. Deriving the
  name in two places is a needless way to disagree — use the list's `name`.

---

## 8. The catalogue (P1)

Backend:

- `SECTION_FOLDERS` = `papers` → Past Papers, `books` → Books, `notes` → Notes,
  `marking-keys` → Marking Keys. The frontend's four keys match exactly. ✓
- `?category=` is an exact, case-insensitive match against the **immediate
  parent folder name** in Drive — arbitrary strings, `null` for a file sitting
  directly in the section folder.
- `?q=` is a case-insensitive substring on the file name, applied server-side.
- Only PDFs are returned; `size_bytes` may be `null`.

The four pages hardcode their chips:

| Page | Chips |
| --- | --- |
| papers | MSCE Maneb · JCE Maneb · Mock · Other Past Papers |
| books, notes | Senior · Junior |
| marking keys | MSCE Maneb · JCE Maneb |

Those are Drive folder names guessed at design time. Rename a folder, or add
"Standard 8", and the chip silently filters to nothing while the page says
"No matches".

Frontend changes:
- Derive the chips from the data — the distinct `category` values in the
  section's response — so the filter can only ever offer something that exists.
- Treat `category: null` as its own bucket ("Uncategorised") rather than letting
  those files be invisible under every chip.
- Keep search and category server-side; do not add a second local filter.

---

## 9. Copy and documentation (P1/P2)

- **FAQ, "I forgot my password"**: still says self-service reset "isn't live yet"
  and to message the admin. `/auth/forgot-password` and `/auth/reset-password`
  are live and the sign-in screen already drives them. Rewrite.
- **Unused string**: `forgotNotAvailable` ("Password reset isn't available yet")
  — delete.
- **README endpoint table**: missing `/auth/me`, `PATCH /auth/name`,
  `/auth/forgot-password`, `/auth/reset-password`, `/drive/health`,
  `/drive/refresh`, `/health`, `/health/db`. Also record that `/auth/login`
  accepts a legacy username, and that registration is Gmail-only.
- **Comments**: `Zafar.username()` claims `sub` is an email (§3); `config.js`
  says the limits are "as the backend enforces them today" — make it point at
  the settings, not at the number.

---

## 10. Offered by the backend, unused by the frontend (decide, P2)

| Endpoint / field | Use it for |
| --- | --- |
| `GET /auth/me` | real display name; session check at boot; `is_verified` |
| `PATCH /auth/name` | one-time name prompt for accounts created before names existed |
| `POST /drive/refresh` | retry after `404 File not found`, and a manual "refresh library" |
| `GET /drive/health` | diagnostics only — not for students |
| `expires_in` | explain an expired link instead of blaming the connection |
| `*_downloaded_today` | "3 of 10 used today" |
| `token_type` | ignore; it is always `bearer` |

---

## 11. Things to confirm with the backend, not fix in the frontend (P0/P1)

1. **Which hostname actually serves the app** — `zafarh` or `zafar`? Everything
   hinges on it (§0). The repo says `zafarh`.
2. **Is `DOWNLOAD_SIGNING_SECRET` / `DOWNLOAD_PROXY_BASE_URL` set in production?**
   If not, `make_signed_download_url` falls back to a permanent unsigned Drive
   link — which reopens the quota bypass and invalidates the TTL/confirm story
   the UI tells.
3. **Does the deployed Koyeb build match this repo?** The OpenAPI says `0.2.0`,
   which matches `main.py`, so yes — worth re-checking after every backend
   merge.
4. **Rate limiting**: there is none. Nothing is blocking a client from hammering
   `/drive/papers`; the frontend should therefore keep its debounce and not add
   polling.

---

## Priority order

1. **P0** — confirm the origin (§0); Gmail-only registration (§1);
   confirm the signing secret is set (§11.2).
2. **P1** — legacy-username login field (§2); `/auth/me` and the name comments
   (§3); 403/502/503 handling (§4); verify/reset attempt rules (§5); `expires_in`, 404-refresh, and the `.pdf` name
   (§7); data-driven category chips (§8); the stale reset FAQ answer (§9).
   Done: quota numbers from the server (§6) — four buckets, read per section.
3. **P2** — README endpoint table, dead strings, optional extras (§10).
