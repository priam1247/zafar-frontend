# Backend prompt — Sign in with Google

Hand this to the agent working in `priam1247/zafar-backend`.

## What is already on the frontend

The sign-in card has a **Continue with Google** button at the bottom. It is
inert until a Google OAuth client ID is pasted into
`web/assets/js/config.js` (`GOOGLE_CLIENT_ID`); with an ID in place the page
loads Google Identity Services, renders the official button, and hands the ID
token it receives straight to:

```
POST /auth/google
{"credential": "<Google ID token, a signed JWT>"}
```

Nothing else is sent — no password, no email typed by the user. The page then
expects the **same answer `/auth/login` gives**, because everything after it
(`Zafar.setToken`, the redirect to `dashboard.html`, the quota chips) is already
written against that shape:

```json
{"access_token": "<jwt>", "token_type": "bearer"}
```

The button is hidden on the create-account side and on the code screen. It is
also hidden when no client ID is configured, so this route can ship in either
order.

## The route

```python
# routers/auth.py
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

@router.post("/google", response_model=Token)
def google_sign_in(
    payload: GoogleCredentialIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Exchange a Google ID token for the same JWT /auth/login issues."""
```

1. **Verify the token with Google's keys**, not by decoding it:
   `id_token.verify_oauth2_token(payload.credential, google_requests.Request(), settings.google_client_id)`.
   That call checks the signature, `aud` (must equal `GOOGLE_CLIENT_ID`), `iss`
   (`accounts.google.com` / `https://accounts.google.com`) and `exp`.
2. **Take `email` and `email_verified` from the verified claims only.**
   `email_verified` must be `true`; a token that says otherwise is a refusal.
3. **Find or create the account by email**:
   - exists → sign them in, and set `email_verified = True` (Google has just
     proved the address, so an account created here but never confirmed by code
     stops being stuck);
   - does not exist → create it with `name` from the token's `name` claim (fall
     back to the local part of the address), `email_verified = True`, and an
     unusable password: `secrets.token_urlsafe(32)` hashed with the same hasher
     the register route uses. Do not leave a NULL password column that a login
     attempt could trip over.
4. **Issue the JWT exactly as `/auth/login` does** — same claims, same expiry,
   same helper, so nothing downstream can tell the two apart.
5. **Rate limit it** the way the other auth routes are limited.

### Configuration

- `config.py`: `google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")`.
- `requirements.txt`: `google-auth` (its `requests` extra is already implied by
  the transport module).
- If `GOOGLE_CLIENT_ID` is empty, answer **501 with
  `X-Error-Code: google_not_configured`** rather than 500. The frontend turns
  that into "Google sign-in isn't switched on yet. Use your email and password."
  and stays usable.

### Errors — the words are never Google's

| Status | `X-Error-Code` | When | What the student sees |
| --- | --- | --- | --- |
| 400 | `google_missing_credential` | no `credential` in the body | "Google couldn't confirm that account…" |
| 401 | `google_invalid_token` | signature, audience, issuer or expiry check failed | same |
| 403 | `google_email_unverified` | the token says `email_verified: false` | same |
| 501 | `google_not_configured` | no client ID on the server | "…isn't switched on yet" |

No response body may quote Google's exception text, the client ID, or the
token — the frontend shows a fixed sentence for each, and a stray detail in a
body is exactly the kind of thing that leaks into a screenshot.

### One decision to make deliberately

Registration is Gmail-only because codes are delivered by the Gmail account the
site already has. Google sign-in needs no delivery at all, so it can accept any
verified Google address. If you accept those, a student on `name@school.mw` can
sign in but **cannot reset a password by email** — recommend accepting any
verified Google email (Google has already proved it), and leaving
`/auth/forgot-password` untouched: it already answers generically for addresses
it will not mail. If you would rather stay Gmail-only, answer
`403 google_not_gmail`, and say so in the PR so the frontend copy can say it
too.

## Tests

- A verifier patched to return a valid claim set → `200` with an `access_token`,
  and one user row created.
- The same call again → the same user, no second row.
- An existing password account with the same email → signed in, not duplicated,
  and `email_verified` is now true.
- `aud` mismatch → `401` with `X-Error-Code: google_invalid_token`, and no user
  created.
- Missing `credential` → `400`; empty `GOOGLE_CLIENT_ID` → `501`.
- The error bodies contain no token, client ID or library exception text.

Nothing in the tests may reach Google's servers: patch
`id_token.verify_oauth2_token`.
