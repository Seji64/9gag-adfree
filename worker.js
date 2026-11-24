// 9gag AdFree als Cloudflare Worker: /api/feed?g=<gruppe|fresh> + static Frontend in EINER URL.
// WICHTIG: keine Server-Merge ("all") — 13 Subrequests/Invocation bricht CFs Free-Limit (10) -> 502.
// "all" wird clientseitig gemerged (12x parallele Calls, 1 Subrequest pro Call).
const UPSTREAM = "https://9gag.com/v1/group-posts/group/%s/type/fresh";
const FRESH = "https://9gag.com/v1/feed-posts/type/fresh"; // live-Tipp (~Minuten alt), 3er-Fenster, Cursor nur mit Login
const GROUPS = ["funny","meme","gaming","girl","music","food","car","tv","science","history","random","nsfw"]; // Whitelist
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148";

// genau EIN Upstream-Quellfenster pro Request (1 Subrequest, Cache-Key = Upstream-URL).
// Cache nur für Seite 1 — Cursor-Seiten sind Einweg und dürfen nicht alt werden.
async function fetchSrc(cache, target) {
  const cached = !target.includes("?after=");
  const key = new Request(target);
  let hit = cached ? await cache.match(key) : undefined;
  if (!hit) {
    const r = await fetch(target, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error("upstream " + r.status); // Fehler sichtbar statt 1101
    const data = await r.json();
    if (!data.data || !Array.isArray(data.data.posts)) throw new Error("bad payload");
    const body = JSON.stringify({ posts: data.data.posts.filter((p) => !p.promoted), cur: data.data.nextCursor || null });
    hit = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" } });
    if (cached) await cache.put(key, hit.clone());
  }
  return JSON.parse(await hit.text());
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/feed") {
      // RAW-Parsing: `after` (Cursor) ist bereits percent-encoded — searchParams
      // würde dekodieren → kaputter Cursor → Upstream liefert immer Seite 1.
      const params = {};
      for (const kv of url.search.slice(1).split("&")) {
        const i = kv.indexOf("=");
        if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1);
      }
      const g0 = params.g || "funny";
      const g = g0 === "fresh" ? "fresh" : GROUPS.includes(g0) ? g0 : "funny";
      const after = params.after || "";
      try {
        const cache = await caches.open("gag-v1");
        const target = (g === "fresh" ? FRESH : UPSTREAM.replace("%s", g)) + (after ? "?after=" + after : "");
        const { posts, cur } = await fetchSrc(cache, target);
        return new Response(JSON.stringify({ posts, nextCursor: cur }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=15" },
        });
      } catch (e) {
        return new Response("upstream error: " + e.message, { status: 502 });
      }
    }
    return env.ASSETS.fetch(req); // statisches Frontend, gleiche URL
  },
};
