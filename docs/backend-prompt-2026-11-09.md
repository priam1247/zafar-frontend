# Prompt for the backend agent — 2026-11-09

Copy everything under the line into the backend session. It is written to be
done top to bottom: task 1 is the only one that can cost a student downloads
they were promised, the rest are safety and honesty.

---

You are working in `priam1247/zafar-backend` at `main` (`916db86`). The frontend
(`zafar-frontend` @ PR #25) now filters server text, sends one download at a
time, caches list answers for a minute, reads categories from
`GET /drive/categories`, and reads `Retry-After`. These ten tasks are what is
left on the server. Keep the existing test suite green (`pytest -q` → 54 passed)
and add a test for each numbered task.

## 1. P0 — make the quota check-and-insert atomic

`routers/drive.py:194-198, 222-244`. The docstring says the row lock makes the
check-then-insert atomic because "the real protection is on Postgres, which is
what's actually deployed" — the app is deployed on **D1**, and `with_for_update()`
compiles to nothing there (and on SQLite). Each statement is its own HTTPS
round-trip on D1, so two concurrent requests both read `used = limit - 1` and
both insert. Measured on file-backed SQLite: limit 3, six simultaneous
`POST /drive/download` → six 200s, six rows.

Replace the read-then-write with one statement that only inserts while there is
room, and treat "nothing inserted" as the 429:

```python
from sqlalchemy import text

midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
cutoff = midnight + timedelta(seconds=settings.download_link_ttl_seconds)

result = db.execute(
    text(
        """
        INSERT INTO download_logs
            (user_id, file_id, file_name, category, downloaded_at, confirmed)
        SELECT :uid, :fid, :name, :cat, :now, 0
        WHERE (
            SELECT COUNT(*) FROM download_logs
            WHERE user_id = :uid
              AND category = :cat
              AND downloaded_at >= :midnight
              AND (confirmed = 1 OR downloaded_at >= :cutoff)
        ) < :limit
        """
    ),
    {
        "uid": current_user.id, "fid": file_id, "name": meta["name"],
        "cat": quota_category, "now": datetime.now(timezone.utc),
        "midnight": midnight, "cutoff": cutoff, "limit": limit,
    },
)
if result.rowcount == 0:
    ...  # the existing 429 with Retry-After + X-Error-Code: limit_reached
log_id = db.execute(text("SELECT last_insert_rowid()")).scalar()
```

Match the column names and the timestamp handling to `models.DownloadLog` and
to `_count_today_by_category` (the `confirmed = 1` / `>= cutoff` predicate must
be the same one, or the two disagree). Delete the `with_for_update()` line and
the paragraph about it. `_count_today_by_category` stays for `/auth/quota`.

**Test:** `tests/test_quota_and_downloads.py` — six threads posting with the
limit at 3 must produce exactly three 200s and three 429s, and three rows.

## 2. P1 — stop echoing internal detail in `detail`

`routers/drive.py:218` (`Could not reach Drive: {exc}`), `routers/drive.py:160`,
and any other `except Exception as exc: raise HTTPException(502, detail=f"…{exc}")`.
`exc` carries the Drive API body, which can name the service-account project
and folder ids; the frontend used to print it into a toast.

Log the exception (`logger.exception`) and answer with a fixed sentence:

```python
raise HTTPException(status_code=502, detail="The library could not be reached.")
```

**Test:** with the Drive call raising, the 502 body contains no folder id and
no `{exc}` text.

## 3. P1 — key the list rate limits on the user, not only the IP

`routers/drive.py:120` and `:155` call
`limit_request(request, "drive-papers", limit=120, window=60)` with no
identifier, so the budget is per IP. Favorites loads four sections at once and
Malawian schools sit behind one NAT; the frontend has cut its own traffic but
one class can still exhaust the window for everybody.

Pass the user, exactly as the download route already does at `:200`:

```python
limit_request(request, "drive-papers", limit=120, window=60, identifier=str(current_user.id))
```

Raise the per-user limit to 240/min if the per-IP guard should stay as a
secondary ceiling; either way the identifier must be there.

**Test:** two users behind the same `client.host` each keep their own budget.

## 4. P1 — invalidate sessions when a password is reset

`auth.py:36-47` decodes the JWT and never consults the account, so a 7-day
token keeps working after `/auth/reset-password` — the one moment a student
uses it to lock someone out.

Add `password_changed_at` (nullable `DateTime(timezone=True)`) to `User`,
set it in `reset_password` and in any password change, and in `get_current_user`
reject a token whose `iat` is older than that column:

```python
pwd = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
if user.password_changed_at and pwd < user.password_changed_at:
    raise _credentials_error
```

Include the migration in `main._run_migrations()` (the file already does
`ALTER TABLE … ADD COLUMN`, so one more nullable column is in keeping).

**Test:** reset the password, then re-use a token minted before the reset → 401.

## 5. P1 — do not trust `X-Forwarded-For` from anyone

`app.py` sets `forwarded_allow_ips="*"`, so a script setting its own
`X-Forwarded-For` picks its own rate-limit bucket, and `auth-register`
(5/hour) and the drive limits stop meaning anything.

Trust only the platform's proxy — Koyeb's egress addresses, or a value from
`settings` — or key the limits that matter on the account as well as the IP.
Whichever you pick, a request with a forged `X-Forwarded-For` from a direct
client must not open a fresh bucket.

**Test:** two requests with different forged headers, same socket → one bucket.

## 6. P2 — close the public doors

- `main.py:93-96`: `/docs` and `/openapi.json` are public in production (the
  "disable it if you like" is a comment). Take `docs_url`/`redoc_url`/
  `openapi_url` from a setting, default off, and turn them on for local work.
- `routers/drive.py:85-100`: `GET /drive/health` returns the top-level folder
  **names** to any signed-in student. Return counts, or the ids already in the
  catalogue, not the folder names.
- `schemas.py:53-59`: `UserOut` exposes the internal `username` the UI never
  shows. Drop it.

**Test:** `/docs` is 404 with the setting off; `/drive/health` has no folder
names in its body.

## 7. P2 — the download proxy can hand a student an HTML page called `.pdf`

`cloudflare-worker/download-proxy/worker.js:66-67` fetches
`drive.google.com/uc?export=download` with `cacheEverything: true,
cacheTtl: 86400`. For large or unscanned files Drive answers with an HTML
"virus scan" interstitial; that page is then cached at the edge for a day and
saved as a `.pdf`.

Check `Content-Type` before replying — if it is `text/html`, return 502 and do
not cache. Add `Range` passthrough so a dropped connection can resume instead
of re-downloading the whole file (and so Safari can stream it).

**Test:** a stubbed Drive answering `text/html` → 502, `Cache-Control: no-store`.

## 8. P2 — three small lies

- `drive_service.py:124`: the tree walk returns silently at `max_depth=6`, so
  files deeper than six folders vanish from the catalogue. Log a warning with
  the folder id when the cut happens, and make the depth a setting.
- `main.py:121` `_error_code()` derives the machine code by substring-matching
  the English `detail`. Map from the exception (status + route) instead, so
  rewording a message cannot change the header.
- `drive.py` caches a section's folder id for 1 h but its tree for
  `drive_cache_ttl_seconds` (6 h): after a folder move the id is stale for six
  hours. Use one TTL for both.

## 9. P2 — the email path has a hard ceiling and no alarm

`email_utils.py` sends through one Gmail account: about 500 recipients a day,
and a failure only prints to the log. On a busy day codes silently stop
arriving and the student is told to check an inbox that will never fill.

Count sends per day, log a clear warning at 400, and return a real error from
`/auth/register` and `/auth/resend` when sending fails — the frontend already
shows a 5xx as "Something went wrong on our side." Whoever owns the account
should be told; if the count matters, a transactional provider is the fix.

**Test:** with the sender raising, `/auth/register` answers 503, not a fake
success.

## 10. P1 — the two contracts the frontend now relies on

The app already consumes both of these; until the server sends them, it falls
back (sign-in on a conflict, the whole array in one request). Neither fallback
is as good as the real thing, and the paging one will not survive the library
growing.

- **`X-Error-Code` on the two "account needs a code" answers.** The frontend
  reads `err.code` from that header and no longer matches English text.
  - `POST /auth/register` → 409 with `X-Error-Code: unverified` when the
    account exists but was never verified, and `verified` when it was. The app
    sends `unverified` straight to the code screen and quietly re-sends a code;
    `verified` goes to sign-in with the address kept. Without a code it assumes
    sign-in, which is the one road that cannot leave a student stuck.
  - `POST /auth/login` → 403 with `X-Error-Code: email_not_verified` (and, as
    today, the 403 itself). The app then opens the code screen and resends.
  Both codes must also be added to `expose_headers`, or the browser will not
  let the app read them.
- **`limit`/`offset` on `GET /drive/papers`.** The app asks for
  `?limit=200&offset=0`, then 200, 400, … and stops at the first short page,
  combining the pages into one cached list. `limit` must cap the page and
  `offset` must skip, on the **filtered** result (section + category + q), in a
  stable order — otherwise pages overlap or skip documents. Guard the values
  (`limit` 1–500, `offset` ≥ 0) and keep returning a plain array.
  *(Shipped in `0b07721`. The page now asks for **50** and reads only the first
  page until the student reaches the end of the list.)*

**Tests:** register 409 carries `code` for both cases; login 403 carries
`email_not_verified`; `?limit=2&offset=2` on a five-document section returns
documents 3 and 4, and the same query twice returns the same ids in the same
order.

## Definition of done

- `pytest -q` green, with a new test for each task above.
- No 5xx body contains a Drive, project, or folder identifier.
- Six concurrent downloads against a limit of three cannot produce four 200s.
- The docstring at `drive.py:194` no longer claims a lock that does not exist,
  and no longer claims Postgres is what is deployed.
