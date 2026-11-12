# Backend prompt — send the real number of results

Hand this to the agent working in `priam1247/zafar-backend`.

## The problem

The frontend reads `/drive/papers` one page at a time now: 50 documents, then 50
more when the student reaches the end of the list. That fixed the slow first
paint, but it left the results counter at the top of the catalogue unable to say
how big the answer is. A page of 50 cannot tell you that 1,240 documents match,
so the page can only say `50+ results` — honest, but not what a student wants to
know. The library has thousands of documents; the count is what tells them their
subject is in there at all.

The backend already knows the number: it computes the filtered list, then slices
a page out of it (`routers/drive.py:182`). It just does not say it.

## The change

Return the size of the whole answer in a response header on
`GET /drive/papers`:

```python
@router.get("/papers", response_model=list[PaperOut])
def list_papers(
    request: Request,
    response: Response,          # <- add
    section: str = "papers",
    ...
):
    ...
    pdf_files = [f for f in files if f.get("mimeType") == "application/pdf"]
    # The size of the whole answer, before this page is cut out of it.
    response.headers["X-Total-Count"] = str(len(pdf_files))
    page = pdf_files[offset:offset + limit]
    return [ ... for f in page ]
```

The `len()` must be taken **after** the section, `category` and `q` filters and
**before** the `offset`/`limit` slice. That is the whole point: the number
describes the answer, not the page, so it is identical on every page of the same
query.

Rules:

- A plain integer in a string: `str(len(pdf_files))`. No thousands separators.
- Only on a **200**. A 400 (`Unknown section`), 422, 429 or 502 must not carry
  it — a stale count beside an error is a lie.
- Add it to the CORS `expose_headers` in `main.py`, or the browser refuses to let
  the page read it and nothing changes:

```python
expose_headers=["X-Error-Code", "X-Attempts-Remaining", "Retry-After", "X-Total-Count"],
```

## What the frontend does with it

- Reads `response.headers.get("X-Total-Count")` in `config.js` (`authGetMeta`)
  and shows `1,240 results` from the **first** page, with only 50 cards drawn.
- Missing header (older backend): the count grows as pages arrive and is shown as
  `50+`, so it never claims the list ends at the page size. Nothing breaks.
- When the header is present and `offset + limit >= total`, the page treats the
  answer as finished: it stops offering *Load more* without spending one extra
  request on an empty page. That is why the header must be exact, not an
  estimate.

The body stays a plain array, and the header is additive, so either side can
deploy first.

## Tests

- Five documents in a section, `?limit=2&offset=0` → two rows **and**
  `X-Total-Count: 5`; `?limit=2&offset=4` → one row and the same header.
- `?category=<three matches>` → `X-Total-Count: 3`.
- `?q=<no matches>` → `[]` and `X-Total-Count: 0`.
- Unknown section → 400, no `X-Total-Count`.
- The CORS assertion: `access-control-expose-headers` contains `X-Total-Count`
  (extend the existing expose-headers test rather than writing a new one).

## Why a header and not the body

The body is `list[PaperOut]` and the deployed frontend parses it as an array.
Wrapping it in `{"items": [...], "total": n}` would break that frontend on the
day this deploys. A header is additive: the old page ignores it, the new one
reads it.
