# 9gag AdFree

A self-hosted, ad-free 9gag image feed. One file per concern, zero dependencies, no build step, no login, no framework.

- Mobile first (one column, ≤640px, dark mode)
- Category chips (12 groups + "all" merge), lightbox, NSFW opt-in chip
- GIFs/videos rendered in place (`image460sv` → `<video>`), WebP + fixed aspect ratio (no layout shift)
- True infinite scroll via 9gag's cursor API — deep history, fully anonymous

## Files

| File | Role |
|---|---|
| `proxy.py` | LAN server: static frontend + `/api/feed` proxy, stdlib only, port 8091 |
| `worker.js` | Cloudflare Worker port of the same API, serves the frontend from `assets` |
| `static/index.html` | The entire frontend: inline CSS + JS, no external resources |

## API

```
GET /api/feed?g=<group>            # page 1 (60s server cache)
GET /api/feed?g=<group>&after=...  # cursor page (never cached)
```

`g`: one of `funny, meme, gaming, girl, music, food, car, tv, science, history, random, nsfw, fresh`.
Response: `{ "posts": [...], "nextCursor": "after=...&c=10" | null }`

## The one gotcha: raw cursor passthrough

9gag's `nextCursor` value is **already percent-encoded** (e.g. `after=aD2B...%3D%3D`).
It must be forwarded **raw** — any decode/re-encode (`parse_qs`, `URLSearchParams`,
`encodeURIComponent`, `quote`) corrupts the cursor and upstream silently returns
page 1 again, which looks exactly like a login wall. There is no login wall:
deep history (months) is available anonymously.

## Design constraints

- **No server-side "all" merge** — Cloudflare's free tier allows 10 subrequests per
  invocation; merging 13 sources would 502. The "all" chip merges 13 parallel
  single-source calls client-side instead.
- **Whitelist, not string passthrough** — only the 12 group names + `fresh` reach the upstream URL.
- **One constant per breakage** — if 9gag moves an endpoint, change `UPSTREAM`
  (and `FRESH`) in `proxy.py`/`worker.js` and redeploy. Nothing else.
- NSFW is masked client-side except the explicit `nsfw` chip.

## Run

**LAN:**
```bash
python3 proxy.py          # http://<host>:8091
```

**Cloudflare Worker:**
```bash
wrangler deploy           # from the cf-deploy/ dir (wrangler.jsonc + site/)
```

## Status

Unofficial 9gag JSON endpoint — no API key, no auth. If it breaks, that is a
one-constant fix, not an architecture problem.
