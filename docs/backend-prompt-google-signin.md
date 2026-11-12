# Sign in with Google — the contract, as shipped

Both halves exist now. This page is the record of what they agree on, so the
next change to either side does not have to guess.

* Frontend: `web/assets/js/auth.js` (`signInWithGoogle`, the zone at the bottom
  of the sign-in card), switched on by `GOOGLE_CLIENT_ID` in
  `web/assets/js/config.js`.
* Backend: `routers/auth.py` → `POST /auth/google` (PR #18 in `zafar-backend`).

## The exchange

```
POST /auth/google
{"credential": "<Google ID token — a signed JWT from Google Identity Services>"}

200 {"access_token": "<Zafar JWT>", "token_type": "bearer"}
```

`credential` is the only field, and the only thing the browser sends. There is
no password, no address typed by the student, and **no client secret**: Google
signs the token, the API verifies the signature with Google's published keys
(`google.oauth2.id_token.verify_oauth2_token(..., audience=GOOGLE_CLIENT_ID)`),
which also checks `aud`, `iss` and `exp`. The token that comes back is the same
one `/auth/login` issues, which is why nothing else in the app had to change.

## What the API decides, and what the card then says

| Status | `X-Error-Code` | Meaning | What the student reads |
| --- | --- | --- | --- |
| 401 | `google_invalid_token` | signature / `aud` / `iss` / `exp` failed, or `email_verified` is not `true` | "Google couldn't confirm that account. Try again, or use your email." |
| 403 | `google_email_unsupported` | the address is not `@gmail.com` | "StudyMW works with Gmail addresses. Sign in with your @gmail.com Google account." |
| 503 | `google_account_unavailable` | the row could not be created (a race lost twice) | "Google signed you in, but StudyMW couldn't finish setting up the account. Try again in a moment." |
| 503 | `google_not_configured` | `GOOGLE_CLIENT_ID` is empty on that deployment | "Google sign-in isn't switched on yet. Use your email and password." |
| 429 | — | more than 10 tries a minute for one account | the API's own sentence, which is written for a student |

The code in `X-Error-Code` selects the sentence, never the `detail` string: the
detail is written for whoever is reading logs, and the tests assert that none of
it — no `audience mismatch`, no token, no client ID — reaches the screen.

**Gmail-only is deliberate.** Registration delivers codes from the site's Gmail
account, so the account policy is one policy. A student who signs in with a
work or school Google account would end up with an account that can never
receive a reset code, so the API refuses it up front and the card explains why.

## Rate limiting

Per **verified email**, ten a minute, with no shared-IP component
(`limit_request(request, "auth-google", email, limit=10, window=60, ip_limit=0)`).
The school's students sit behind one NAT address, so an IP-based bucket would
have let one person lock out everybody. The 500-a-day email cap is untouched by
this route: Google sign-in sends no email.

## Turning it on

1. Google Cloud → Credentials → the OAuth **Web application** client →
   *Authorised JavaScript origins*: `https://studymw.netlibrary.dpdns.org` and
   `http://localhost:4173`. (No redirect URI is needed — this is a popup/ID-token
   flow, not a redirect one.)
2. The same client ID in both places: `GOOGLE_CLIENT_ID` in `config.js` and in
   the API deployment's environment. They must match exactly; a mismatch is a
   401 `google_invalid_token`, which looks like "Google couldn't confirm" to the
   student.
3. Deploy both. The button appears on the next page load.

## If a client secret is ever exposed

It is not used by anything in this flow, so there is nothing to change in code —
but a `client_secret_*.json` in a chat, a screenshot or a commit is still a
credential that someone else can hold. Reset it in the Google Cloud console
(the client ID stays the same, so no deploy is needed), check that no redirect
URI has been added to the client, and keep the replacement out of this
repository: `.gitignore` lists `client_secret*.json`, and `npm test` fails if a
`GOCSPX-` string appears anywhere under `web/`.
