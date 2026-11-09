# Backend changes to apply (zafar-backend)

Read from `priam1247/zafar-backend` @ `708bf30`. These are the changes to make on
the **backend** so the shipped frontend works as designed — the mirror of
`docs/backend-alignment.md`, which lists what the frontend would otherwise have
to change.

Every item names the file and function, the reason, and what it unblocks.
**P0** = security or breaks a flow · **P1** = removes a frontend compromise ·
**P2** = consistency.

---

## 1. Delete the unsigned-download-URL fallback (P0 — what you asked for)

**File:** `auth.py` → `make_signed_download_url()`

```python
if not settings.download_proxy_base_url or not settings.download_signing_secret:
    return f"https://drive.google.com/uc?export=download&id={file_id}"
```

You have the secret set in Koyeb, so this branch is dead code — but dead code
that arms the exact hole the function exists to close: a permanent, unsigned,
shareable link that bypasses the daily quota entirely. One unset env var on a
future redeploy reopens it silently.

**Change:** raise instead of falling back.

```python
raise HTTPException(500, "Download signing is not configured")
```

Then delete the paragraph of the docstring that describes the fallback, so
nobody restores it by reading the comment.

**Better still — make it undeployable** (see §2): validate the settings at
startup, and the exception can never be reached.

---

## 2. Fail fast on every required setting (P0)

**File:** `config.py` → `Settings`

Today only `jwt_secret_key` is required (with a good comment explaining why).
Everything else that the app cannot honestly run without is optional with an
empty-string default:

| Setting | Today | Should be |
| --- | --- | --- |
| `download_proxy_base_url` | `""` | required |
| `download_signing_secret` | `""` | required |
| `google_service_account_json` | `""` | required |
| `drive_root_folder_id` | hardcoded default | required |
| `smtp_user` / `smtp_pass` | `""` | required (registration cannot verify without them) |
| `jwt_secret_key` | required ✓ | keep |

Add a `model_post_init` (pydantic-settings) that raises a named error listing
every missing value, so a half-configured deploy fails at boot instead of at the
first download.

Keep as defaults — these are policy, not credentials:
`daily_paper_limit`, `daily_book_limit`, `download_link_ttl_seconds`,
`drive_cache_ttl_seconds`, `jwt_expire_minutes`, `database_url`.

---

## 3. Make CORS configuration, not a hardcoded string (P0)

**Files:** `main.py` → `CORSMiddleware`; `cloudflare-worker/download-proxy/worker.js` → `ALLOWED_ORIGIN`

Both hardcode `https://library.zafarh.dpdns.org`. Nothing else can call the API
or fetch a file — and a CORS refusal is indistinguishable from being offline in
the browser, which is exactly how it will be reported to you.

**Changes:**

1. `main.py`: move the list into `Settings.allowed_origins` (comma-separated env
   var, parsed to `list[str]`). Drop the `http://` entry now that HTTPS is
   enforced — it is a second way in that you no longer need.
2. `worker.js`: read the origin from `env.ALLOWED_ORIGIN`; reflect it only when
   the request's `Origin` matches; add `Vary: Origin`.
3. `worker.js`: put CORS headers on **every** response, including the early
   `new Response("Not found", { status: 404 })` and the three 403s. Today those
   carry no `Access-Control-Allow-Origin`, so a mistyped or expired link surfaces
   in the browser as a network error rather than "Link expired".
4. Optional: answer `OPTIONS` explicitly on `/dl/*`. A plain `GET` needs no
   preflight today, but one added header would silently break downloads.

**Unblocks:** preview deployments and local development; a frontend host change
without a backend code change.

---

## 4. Confirm the canonical frontend origin (P0)

`https://library.zafarh.dpdns.org` — note the **`h`** — appears in both repos. If
the app is ever served from `library.zafar.dpdns.org` (no h), everything loads
except the API and the downloads. Put the real hostname in the backend README and
in `docs/`, one place, and treat changing it as a deployment step.

---

## 5. Take `/drive/refresh` away from ordinary users (P1)

**File:** `routers/drive.py` → `refresh()`

Any signed-in student can clear the global Drive tree cache and the section-id
cache. That is a free lever to force N cold Drive walks — everyone's next page
goes slow — and it costs the caller nothing.

**Change:** require an admin flag/allow-list, or make it per-section, or remove
the route and call `clear_cache()` from `scripts/` after uploads.

---

## 6. Self-heal the stale-tree 404 (P1)

**File:** `routers/drive.py` → `get_download_url()`

```python
meta = next((f for f in files if f["id"] == file_id), None)
if meta is None:
    raise HTTPException(404, "File not found in this section")
```

`files` comes from a tree cached for **6 hours**. A paper uploaded an hour ago is
listed only after the cache expires — and until then, the list shows it and the
download 404s.

**Change:** on a miss, `list_files_recursive(_section_folder_id(section), force_refresh=True)`
and look again once, then 404. This removes the need for the frontend to call
`/drive/refresh` and retry, and it makes the two endpoints agree.

---

## 7. Expose the categories (P1 — biggest frontend simplification)

`PaperOut.category` is the **immediate parent folder's name**, whatever someone
typed into Drive. The frontend cannot know those names, so it hardcodes chips:
"MSCE Maneb / JCE Maneb / Mock / Other Past Papers" for papers,
"Senior / Junior" for books and notes.

Rename a folder, or add "Standard 8", and the chip filters to nothing while the
page says "No matches".

**Change:** either add `GET /drive/categories?section=` returning the distinct,
sorted `category` values (from the same cached tree — nearly free), or return
`{"items": [...], "categories": [...]}` from `/drive/papers`.

**Unblocks:** data-driven filter chips; the frontend stops guessing your Drive
layout.

---

## 8. Machine-readable error codes (P1)

The frontend currently decides "email not verified" by matching the English
string `/not verified/i` against `detail`. That is a hidden contract: reword the
message and sign-in breaks silently.

**Change:** add a stable code to error responses. Least disruptive — keep
`detail` a string and add a header:

```
X-Error-Code: email_not_verified
```

Or make `detail` an object (`{"code": ..., "message": ...}`) — FastAPI allows it,
but it changes the shape for every client, so the header is safer today.

Suggested codes: `email_not_verified`, `bad_credentials`, `code_invalid`,
`code_expired`, `too_many_attempts`, `limit_reached`, `section_unknown`,
`file_missing`, `drive_unreachable`, `db_unreachable`.

**Unblocks:** the UI can stop text-matching, and copy can change freely on both
sides.

---

## 9. Tell the client what is left (P1)

- **verify / reset 400** → include `attempts_remaining` so the UI can warn before
  the 5th failure locks the code out (`MAX_VERIFY_ATTEMPTS`).
- **every 429** → add `Retry-After` in seconds. Today the frontend invents its own
  countdown for resend, and has nothing at all for the download limit.

---

## 10. What goes in the token (P1)

**File:** `auth.py` → `create_access_token(user.username)`

`sub` is an internal username (`john`, `john2`), not an email — the frontend
currently assumes otherwise. Two options:

- **Add claims:** `{"sub": username, "name": user.name, "email": user.email,
  "uid": user.id}`. The UI can then greet correctly and namespace local data on a
  stable `uid`, with no extra request. Cost: claims are stale until the token is
  reissued.
- **Keep it minimal** and have the UI call `/auth/me` at boot. Cost: one request
  per load (it also validates the session, so this is not wasted).

Either is fine; the `uid` claim is worth adding either way, because a
re-registered account gets `john2` and any client that keyed local data on `sub`
loses it.

---

## 11. Consistency fixes (P2)

| Where | Today | Change |
| --- | --- | --- |
| `schemas.py::ResetPassword.code` | `min_length=6, max_length=6` only | add `pattern=r"^\d{6}$"`, as `VerifyCode` has |
| `routers/auth.py::register` | `400` when the account exists and is verified | `409 Conflict` — it is not a validation error |
| Authenticated responses | no cache headers | `Cache-Control: no-store` on `/auth/*` and `/drive/*` |
| `GET /auth/verify` already-verified | returns 200 "Already verified" ✓ | leave |

---

## 12. Rate limiting (P2, but security-relevant)

Nothing limits `/auth/login`, `/auth/verify`, `/auth/reset-password`,
`/drive/download` or `/drive/papers`. bcrypt slows an attacker down, but it also
means each login attempt costs you CPU. A minimal per-IP + per-identifier counter
returning `429` with `Retry-After` is enough; the verify/reset attempt counters
that already exist are per-account and do not cover login.

---

## 13. Registration domain policy (decide, then document)

`schemas.py::UserRegister.gmail_only` rejects anything not `@gmail.com` with
`Only Gmail addresses are supported` — a 422 that arrives *after* the student has
typed a password.

Two honest options:

- **Keep it** (Gmail SMTP deliverability): the frontend adds a Gmail check and
  explains why. Say so in the schema docstring and the README, so the rule is not
  a surprise discovered in production.
- **Relax it**: then SMTP must genuinely deliver to other providers, which is the
  reason the rule exists.

Either way it is one line — but it must be a decision, not an accident.

---

## 14. Already correct — do not change

- Section keys `papers`, `books`, `notes`, `marking-keys`; the four frontend
  pages match exactly.
- Quota buckets: notes and marking keys charge the papers bucket
  (`SECTION_QUOTA_CATEGORY`).
- Window: UTC calendar day (`_count_today_by_category`), refilling at 00:00 UTC.
- Unconfirmed reservations count only for the link TTL (300 s) — this is why the
  UI can honestly say "a few minutes".
- `POST /drive/confirm/{id}` idempotent, called after the bytes arrive. Correct.
- `429 "Daily download limit reached"` — the frontend branches on status, not
  text.
- PDF-only listing, server-side `q` and `category`, `size_bytes` nullable,
  GZip, `allow_methods=[GET, POST, PATCH]`.

---

## If every P0/P1 above lands

The frontend's remaining work shrinks to: a Gmail check (if §13 keeps the rule),
a text field for legacy usernames, `/auth/me` for the display name, calm copy for
502/503, verify/reset attempt handling, quota numbers taken from the server, and
`expires_in`. The category chips, the 404 retry, the refresh call and the
English-text matching would all disappear.

## Order to do them in

1. §1 + §2 — delete the fallback, validate at boot (you asked for no fallbacks;
   this is the only one that risks money).
2. §3 + §4 — CORS from env, one canonical origin.
3. §6 + §7 — self-healing download, categories endpoint (these two remove the
   most frontend code).
4. §5 — refresh endpoint permission.
5. §8 + §9 — error codes and remaining-attempts.
6. §10–§13 — token claims, consistency, rate limiting, domain policy.
