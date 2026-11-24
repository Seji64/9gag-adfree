#!/usr/bin/env python3
"""9gag AdFree: /api/feed -> 9gag fresh-Feed (promoted gefiltert, NSFW-Flag durch), Rest static aus ./static.
Einzeiler-Upgrade-Pfad: bei Endpoint-Breakage nur UPSTREAM aendern."""
import json
import time
import urllib.parse
import urllib.request
import http.server

UPSTREAM = "https://9gag.com/v1/group-posts/group/%s/type/fresh"
FRESH = "https://9gag.com/v1/feed-posts/type/fresh"  # live-Tipp (Posts ~Minuten alt)
GROUPS = ("funny", "meme", "gaming", "girl", "music", "food", "car", "tv", "science", "history", "random", "nsfw")  # Whitelist: kein offenes String-Passen in die URL
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148")
CACHE_S = 60
PORT = 8091
_cache = {}


def fetch(group="funny", after=""):
    # after = Cursor (B64, bereits percent-encoded) — ROH weiterleiten,
    # kein Re-Encode (sonst ignoriert Upstream ihn und liefert Seite 1).
    # Cache nur für Seite 1; Cursor-Seiten immer frisch.
    if not after:
        c = _cache.setdefault(group, {"ts": 0.0, "posts": None})
        now = time.time()
        if c["posts"] is not None and now - c["ts"] < CACHE_S:
            return c["posts"], None
    url = (FRESH if group == "fresh" else UPSTREAM % group) + (("?after=" + after) if after else "")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    # promoted serverseitig raus, nsfw-flag bleibt im Payload (client entscheidet)
    posts = [p for p in data["data"]["posts"] if not p.get("promoted")]
    cur = data["data"].get("nextCursor")
    if not after:
        _cache[group] = {"ts": time.time(), "posts": posts}
    return posts, cur


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory="static", **kw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/feed":
            # RAW-Parsing: `after` (Cursor) ist bereits percent-encoded und muss
            # unangetastet weiter — parse_qs würde dekodieren und den Cursor brechen.
            raw = urllib.parse.urlparse(self.path).query
            params = {}
            for kv in raw.split("&"):
                i = kv.find("=")
                if i > 0:
                    params[kv[:i]] = kv[i + 1:]
            g = params.get("g", "funny")
            if g != "fresh" and g not in GROUPS:
                g = "funny"
            after = params.get("after", "")
            try:
                posts, cur = fetch(g, after)
                body, code = json.dumps({"posts": posts, "nextCursor": cur}).encode(), 200
            except Exception as e:
                body, code = json.dumps({"error": str(e)}).encode(), 502
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "max-age=%d" % CACHE_S)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
