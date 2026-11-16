Dr. Unslopovich's diagnosis
Verdict: The library itself is honest and readable; the eyebrows were shouting and the mouse was being answered on a phone.
Stack: static HTML/CSS/vanilla JS on Cloudflare Pages, FastAPI + Cloudflare Worker behind it. Web, phone first.
Reviewed: Books, Past Papers, Notes, Marking Keys, Help, Settings, sign-in and register, plus the admin portal shell — from code and jsdom renders. No browser, so no screenshots.
Score: 21/24 Discharged  Task path 3 · Truth 4 · ~Native fit 3 · ~States 4 · ~Access 3 · Specificity 4
Performance: Not profiled. Static leads: the list pages 50 at a time with an IntersectionObserver sentinel (good), but each appended page re-renders the whole grid rather than adding rows, so a long scroll rebuilds every card.

Critical
- None found.

Noticeable
- `web/assets/css/*.css` (19 rules) — every hover effect was unguarded, so on a phone a tap left the button dark and the card lifted, reading as "still selected". Guarded with `@media (hover: hover)`; nothing lost on a desktop.
- `web/assets/js/list.js:887` — "Clear all" was a `<span>` with a click handler: invisible to Tab and to a screen reader. Now a `<button type="button">`, with the same look.
- `web/assets/js/auth.js:97`, `web/assets/js/i18n.js:178` — "Something went wrong…" with no cause and no next step. Now names what failed and what to do.

Minor
- 11 headings and labels in tracked capitals (`text-transform: uppercase` + letter-spacing), the newest form of the generated look. Section heads, panel titles, card titles, KPI labels, table headers, stacked-cell labels, the role chip and the "Featured" mark are sentence case, one step larger, and headings in ink.
- No pressed state on the primary buttons or the category chips — a tap had no answer before the spinner. Added `:active` on `.btn`, `.btn-primary`, `.cat-chip`, and in the admin portal.

Waived
- `tracked-caps-label` on the wordmark `.mark` — the brand, recorded in the chart.
- `glow-shadow` on the error field — a flat 3px ring, not a glow, recorded in the chart.

Worth keeping
- The allowance pill reads the server's `left`/`limit` and nothing else; it hides rather than guess.
- Loading, empty, error and offline states on every list page, each with a next step.
- 44px targets, a visible focus ring from the palette, and URLs that carry search, category and shelf.

Not checked
- Anything requiring eyes: contrast measured by hand from hex values only, 200% zoom, dark mode (the app ships light only, by design), and the admin portal's tables on a real phone.
- Performance on a device: not profiled.
- A fresh-context reviewer: not available here, so no second opinion was taken.

Changed this visit
- Hover guarded in `app.css`, `admin.css`, `auth.css`; pressed states added; `clear all` is a button; two error strings rewritten; eyebrow capitals removed from 11 rules; detector re-run on `web/` → 0 findings.
