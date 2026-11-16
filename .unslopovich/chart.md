# Chart

Stack: static HTML + CSS + vanilla JavaScript (no framework), Cloudflare Pages; FastAPI backend, Cloudflare Worker as the signed download proxy
Platforms: web only, phone first (built and tested at 360 and 412 CSS px), also used on a desktop browser
Visits: on

## Top tasks
1. Find a document and download it — Books, Past Papers, Notes, Marking Keys (one list page per shelf)
2. Sign in, and get back in when the verification code goes missing (login / verify / reset)
3. See what is left today and why a download stopped — the allowance pill, the notice, Help

## Users and context
Malawian secondary-school students preparing for MSCE and JCE, one-handed on an Android
phone, often on a slow or expensive connection, sometimes on a handset shared between
two people. Density is low on purpose: one card per document, one action per card.

## Brand
- Color: `--brand #006D7C`, `--brand-deep #00535F`, `--mint #CFEBE1`, `--paper #FAF5E9`, `--sheet #FFFDF8`, `--ink #101413`, `--muted #4B666A`. The palette is the library's paper and the school's teal; it is not a theme picked from a kit.
- Type: Instrument Sans, self-hosted (`assets/fonts/instrument-sans.woff2`), one family, weights 500–750.
- Keep: the wordmark in capitals with wide tracking (it is drawn the same way in the app icon), the 470px shell, the four tabs and their URLs, the allowance pill reading `<n> <noun> left today`.

## Accepted
- `tracked-caps-label` on `.mark` (admin.css): the wordmark is the brand, drawn in caps and wide tracking on the site and in the icon. Everything else lost its capitals on 2026-11-14.
- `glow-shadow` on `.field.has-error .input` (auth.css): a flat 3px ring marking the field that needs fixing, not a decorative glow.
- Capitals in `.avatar` (initials) and `.or-rule` ("or"): initials are conventionally capitalised and the divider is a word, not an eyebrow. Neither carries letter-spaced small-caps styling.

## Off limits
- The four tabs, their order, and their URLs (`books.html`, `dashboard.html`, `notes.html`, `marking-keys.html`)
- The allowance pill's position in the bar and its sentence shape
- Log out lives in the drawer behind a confirmation; there is no header logout
