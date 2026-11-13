# Admin portal — the contract the frontend already speaks

`web/admin.html` exists and is wired. It has no sample data in it: every number
on the page comes from the routes below, and until they exist it shows
*"The admin API isn't deployed yet"* and stops. That is deliberate — an admin
screen showing invented users is worse than no admin screen.

Hand this to whoever works in `priam1247/zafar-backend`.

## The shape of it

* One new router, `routers/admin.py`, mounted with `prefix="/admin"`.
* The **same JWT** students already get. The role lives on the user row, not in
  a second token system: `users.role` = `owner` | `editor` | `viewer` | `NULL`
  (a student).
* Every route re-checks the role. A role in a token is a claim; the row is the
  fact — and a suspended admin loses access on the next request, not on the next
  login.
* Errors use the existing `APIError` (`{"detail": …}` + `X-Error-Code`), and
  lists send `X-Total-Count` so the client can page without counting.
* Mutations are audited: `audit_log(id, at, actor_user_id, actor_email, action,
  target, detail)`.

## Routes

| Method | Path | Who | Body / query | Answer |
| --- | --- | --- | --- | --- |
| GET | `/admin/whoami` | any role | — | `{email, name, role}` |
| GET | `/admin/overview` | any role | `?days=14` | see below |
| GET | `/admin/users` | owner | `?q=&limit=25&offset=0` | `[{id,email,name,role,suspended,is_verified,signup_method,created_at,last_active_at,downloads}]` + `X-Total-Count` |
| POST | `/admin/users/{id}/suspend` | owner | `{suspended: bool, reason?}` | the user |
| POST | `/admin/users/{id}/reset-password` | owner | `{}` | `{sent: true}` |
| PATCH | `/admin/users/{id}` | owner | `{role}` | the user |
| DELETE | `/admin/users/{id}` | owner | — | `204` |
| GET | `/admin/requests` | owner, editor | `?status=open&limit=50` | `[{id,email,section,title,note,status,created_at}]` |
| PATCH | `/admin/requests/{id}` | owner, editor | `{status}` (`open`/`done`) | the row |
| GET | `/admin/reports` | owner, editor | `?status=open&limit=50` | `[{id,email,file_id,file_name,reason,note,status,created_at}]` |
| PATCH | `/admin/reports/{id}` | owner, editor | `{status}` (`open`/`resolved`) | the row |
| GET | `/admin/settings` | owner | — | `{announcement, maintenance, featured: [ids], limits: {papers,books,notes,marking_keys}}` |
| PATCH | `/admin/settings` | owner | any subset of the above | the settings |
| GET | `/admin/audit` | owner | `?limit=50&offset=0` | `[{id,at,actor_email,action,target,detail}]` |
| GET | `/admin/ops` | owner | — | `{storage:{driver,used_bytes,quota_bytes}, db:{kind,size_bytes}, backups:[{at,bytes}], errors:[{at,route,status,count}], errors_today}` |
| POST | `/admin/export/{users\|files}` | owner | `{}` | `{url, expires_at}` — a **signed, short-lived** link |

### `/admin/overview`

```json
{
  "users": {"total": 0, "verified": 0, "new_today": 0},
  "downloads": {"today": 0, "total": 0, "failed_today": 0},
  "daily": [{"date": "2026-11-08", "signups": 3, "downloads": 12, "failed": 1}],
  "top_files": [{"id": "…", "name": "MSCE Maths 2023.pdf", "section": "papers", "downloads": 41}],
  "top_subjects": [{"subject": "Mathematics", "downloads": 88}],
  "zero_result_searches": [{"q": "physics paper 2 2026", "count": 7}]
}
```

`daily` is the whole window, oldest first, with zero-filled days — a chart that
silently skips quiet days lies about the shape of the week. Fields the API
cannot answer should be **omitted**, not zeroed: the page prints "—" for a
missing number and would print a false 0.

## What each number means

Nothing here should be guessed at request time; the cheap fix is to record it as
it happens.

| Number | Where it comes from |
| --- | --- |
| Signups per day | `users.created_at` |
| Sign-in method | a `signup_method` column written at register (`email`) and at `/auth/google` (`google`) |
| Last active | `users.last_active_at`, touched by `get_current_user` (one small UPDATE, not on every request — once a minute per user is enough) |
| Downloads / failures | the existing download rows and `/drive/confirm` — a download with no confirm within the timeout is a failure. If only successes are recorded today, add `downloads.failed` deliberately rather than deriving it from logs |
| Top files | count by file id |
| Top subjects | the subject parsed from the file name/folder, or a `subject` column |
| Zero-result searches | `search_log(q, results, at)` written by `/drive/papers` when it answers an empty list — **this is the one that tells you what to upload next**, so it is worth the table |
| Storage | Drime quota from the API, or the sum of file sizes |
| Errors | grouped by route + status from the API's own error handler |

## Security

* **Roles**: owner (everything), editor (library + moderation, no users, no
  settings, no audit), viewer (read-only statistics). The frontend hides tabs it
  cannot use, but that is cosmetic: every route checks the role itself.
* **2FA for the owner**: TOTP (`pyotp`), enrolled once, required at login for
  `role = owner`. A password alone should not be able to delete every account.
* **Rate limits**: `limit_request(request, "admin", user.email, limit=60,
  window=60)` — per admin, not per IP, for the same reason the Google route is.
* **Audit**: every POST/PATCH/DELETE above writes one row inside the same
  transaction as the change, so a failed mutation leaves no log and a successful
  one cannot be forgotten.
* **No admin token in a URL**: exports return a signed link with a short expiry,
  the same pattern as `/drive/download/{id}`.
* **Bootstrap**: the first owner is set by a migration or a CLI
  (`python -m scripts.make_owner someone@gmail.com`), never by an HTTP route —
  a "first user becomes admin" rule is one race away from being a backdoor.

## Deploying it

1. `GOOGLE_CLIENT_ID` is unrelated to this, but `ADMIN_2FA_ISSUER` (e.g. `StudyMW`)
   belongs in the environment if you add TOTP.
2. Mount the router in `main.py` next to the others.
3. If the routes are not ready, `GET /admin/whoami` answering **404** is already
   handled: the portal says the API isn't deployed. A partial deploy is worse
   than none — the page is written to survive it, but each tab will show its own
   error.

## Testing it against the real thing

```bash
# Not an admin: 403. Not signed in: 401. No router yet: 404.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  https://bloody-brigitta-ahzafar-de9b1709.koyeb.app/admin/whoami
```

Then open `https://studymw.netlibrary.dpdns.org/admin` signed in as the owner.
The page is `noindex`, in `robots.txt` as `Disallow: /admin`, and `_headers`
sends `X-Robots-Tag: noindex` — it is a tool, not a page.
