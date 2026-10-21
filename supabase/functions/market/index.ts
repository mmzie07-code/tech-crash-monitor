// Supabase Edge Function "market": authenticated proxy for live market data (search, quotes, intraday charts).
// Access: a signed-in user's JWT, OR the owner's private key (header x-owner-key). Everyone else gets 401.
// Secrets required (set with `supabase secrets set`): OWNER_KEY, ALLOWED_ORIGIN.  SUPABASE_URL / SUPABASE_ANON_KEY are provided automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ALLOWED_ORIGIN may be a comma-separated list, e.g. "https://mmzie07-code.github.io,http://localhost:4175"
const ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "https://mmzie07-code.github.io").split(",").map((x) => x.trim()).filter(Boolean);
const OWNER_KEY = Deno.env.get("OWNER_KEY") ?? "";
function corsFor(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-owner-key, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function whoIsCalling(req: Request): Promise<string | null> {
  const ownerHeader = req.headers.get("x-owner-key") ?? "";
  if (OWNER_KEY && safeEqual(ownerHeader, OWNER_KEY)) return "owner";
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

// Small in-memory cache and per-caller rate limit (resets when the function instance recycles).
const cache = new Map<string, { at: number; body: unknown }>();
const hits = new Map<string, { n: number; reset: number }>();
function limited(who: string): boolean {
  const now = Date.now(), h = hits.get(who);
  if (!h || now > h.reset) { hits.set(who, { n: 1, reset: now + 60_000 }); return false; }
  return ++h.n > 120;
}

// Finest interval Yahoo allows for each span: 1 day = every minute, 5 days = 5-minute, 1 month = 30-minute, 3 months = hourly.
const RANGES: Record<string, [string, string]> = { "1d": ["1d", "1m"], "5d": ["5d", "5m"], "1mo": ["1mo", "30m"], "3mo": ["3mo", "1h"], "5d1m": ["5d", "1m"], "1mo5m": ["1mo", "5m"], "6mo": ["6mo", "1d"], "ytd": ["ytd", "1d"], "1y": ["1y", "1d"], "5y": ["5y", "1wk"], "max": ["max", "1mo"] };
const SYMBOL = /^[A-Za-z0-9.\-^=]{1,12}$/;

async function yahoo(url: string, ttlMs: number) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.body;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("upstream " + r.status);
  const body = await r.json();
  cache.set(url, { at: Date.now(), body });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return body;
}

// ---- Top risers (powers the ticker at the top of the site) ----
// Universe: US stocks worth $2B+ and $5+ a share, read from the site's own public search.json (refreshed every 6 hours).
// Measure: percent change from the first minute of trading to the latest minute. Rebuilt at most once every 5 minutes while the market is open
// (once an hour when it's closed), and shared by every visitor, so this costs one set of Yahoo calls per refresh, not one per user.
const SITE = (Deno.env.get("SITE_URL") ?? "https://mmzie07-code.github.io/tech-crash-monitor").replace(/\/$/, "");
const MIN_CAP_B = 2, MIN_PRICE = 5, TOP_N = 20, MIN_BARS = 30;
let universe: { at: number; list: string[] } | null = null;
let gainers: { at: number; ttl: number; body: unknown } | null = null;
let gainersInflight: Promise<unknown> | null = null;

async function loadUniverse(): Promise<string[]> {
  if (universe && Date.now() - universe.at < 6 * 3600_000) return universe.list;
  const r = await fetch(`${SITE}/data/search.json`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("universe " + r.status);
  const d: any = await r.json();
  const list: string[] = (d.stocks as any[]).filter((s) => s[3] >= MIN_CAP_B && s[4] >= MIN_PRICE).map((s) => String(s[0]));
  universe = { at: Date.now(), list };
  return list;
}

async function buildGainers(): Promise<unknown> {
  const syms = await loadUniverse();
  const batches: string[][] = [];
  for (let i = 0; i < syms.length; i += 20) batches.push(syms.slice(i, i + 20));  // Yahoo's spark endpoint takes up to 20 symbols per call
  const rows: { s: string; p: number; o: number; d: number | null }[] = [];
  let asof = 0, failed = 0;
  for (let i = 0; i < batches.length; i += 8) {  // 8 calls at a time
    const settled = await Promise.allSettled(batches.slice(i, i + 8).map(async (b) => {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${b.join(",")}&range=1d&interval=1m`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error("spark " + r.status);
      return await r.json();
    }));
    for (const s of settled) {
      if (s.status !== "fulfilled") { failed++; continue; }
      for (const [sym, v] of Object.entries(s.value as Record<string, any>)) {
        const ts: number[] = v?.timestamp ?? [], cl: (number | null)[] = v?.close ?? [];
        let first: number | null = null, last: number | null = null, n = 0;
        for (let k = 0; k < cl.length; k++) {
          const x = cl[k];
          if (x == null) continue;
          if (first === null) first = x;
          last = x; n++;
          if (ts[k] > asof) asof = ts[k];
        }
        if (first === null || last === null || n < MIN_BARS) continue;
        const prev = typeof v.chartPreviousClose === "number" ? v.chartPreviousClose : null;
        rows.push({ s: sym, p: Math.round(last * 100) / 100, o: Math.round((last / first - 1) * 10000) / 100, d: prev ? Math.round((last / prev - 1) * 10000) / 100 : null });
      }
    }
  }
  if (rows.length < 100) throw new Error("not enough data (" + rows.length + " stocks, " + failed + " failed batches)");
  rows.sort((a, b) => b.o - a.o);
  const open = Date.now() / 1000 - asof < 20 * 60;  // the newest minute bar is fresh only while the market is trading
  const body = { session: open ? "open" : "closed", asof, universe: rows.length, items: rows.slice(0, TOP_N) };
  gainers = { at: Date.now(), ttl: open ? 300_000 : 3600_000, body };
  return body;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const who = await whoIsCalling(req);
  if (!who) return json({ error: "Sign in required" }, 401);
  if (limited(who)) return json({ error: "Too many requests, slow down" }, 429);
  const u = new URL(req.url), action = u.searchParams.get("action");
  try {
    if (action === "ping") return json({ ok: true, owner: who === "owner" });
    if (action === "search") {
      const q = (u.searchParams.get("q") ?? "").trim().slice(0, 40);
      if (!q) return json({ results: [] });
      const d: any = await yahoo(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, 300_000);
      const results = (d.quotes ?? []).filter((x: any) => x.quoteType === "EQUITY" || x.quoteType === "ETF")
        .map((x: any) => ({ symbol: x.symbol, name: x.shortname ?? x.longname ?? x.symbol, exchange: x.exchDisp, type: x.quoteType }));
      return json({ results });
    }
    if (action === "news") {  // headlines only (title, source, link); the publisher owns the story
      const qn = (u.searchParams.get("q") ?? "").replace(/[^\w .&'-]/g, "").trim().slice(0, 60);
      if (!qn) return json({ items: [] });
      const key = `https://news.google.com/rss/search?q=${encodeURIComponent(qn + " when:14d")}&hl=en-US&gl=US&ceid=US:en`;
      const hit = cache.get(key);
      let xml: string;
      if (hit && Date.now() - hit.at < 600_000) xml = hit.body as string;
      else { const r = await fetch(key, { headers: { "User-Agent": "Mozilla/5.0" } }); if (!r.ok) throw new Error("news upstream " + r.status); xml = await r.text(); cache.set(key, { at: Date.now(), body: xml }); }
      const dec = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((m) => {
        const b = m[1], title = dec(/<title>([\s\S]*?)<\/title>/.exec(b)?.[1] ?? ""), src = dec(/<source[^>]*>([\s\S]*?)<\/source>/.exec(b)?.[1] ?? "");
        return { title: src && title.endsWith(" - " + src) ? title.slice(0, -(src.length + 3)) : title, source: src, link: dec(/<link>([\s\S]*?)<\/link>/.exec(b)?.[1] ?? ""), published: dec(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(b)?.[1] ?? "") };
      });
      return json({ items });
    }
    if (action === "gainers") {
      if (gainers && Date.now() - gainers.at < gainers.ttl) return json(gainers.body);
      if (!gainersInflight) gainersInflight = buildGainers().finally(() => { gainersInflight = null; });  // everyone waits on the same rebuild
      return json(await gainersInflight);
    }
    const sym = (u.searchParams.get("symbol") ?? "").toUpperCase();
    if (!SYMBOL.test(sym)) return json({ error: "Bad symbol" }, 400);
    if (action === "chart") {
      const pair = RANGES[u.searchParams.get("range") ?? "1y"];
      if (!pair) return json({ error: "Bad range" }, 400);
      const d: any = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${pair[0]}&interval=${pair[1]}`, pair[0] === "1d" ? 20_000 : pair[0] === "5d" ? 60_000 : pair[1] === "5m" ? 120_000 : pair[0] === "1mo" || pair[0] === "3mo" ? 300_000 : 600_000);
      const r = d.chart?.result?.[0];
      if (!r) return json({ error: "No data" }, 404);
      const qd = r.indicators.quote[0], close = qd.close as (number | null)[], open = qd.open as (number | null)[], high = qd.high as (number | null)[], low = qd.low as (number | null)[];
      const t: number[] = [], c: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [];
      const r2 = (x: number | null | undefined, fallback: number) => Math.round((x ?? fallback) * 100) / 100;
      r.timestamp.forEach((ts: number, i: number) => { if (close[i] != null) { const cl = r2(close[i], 0); t.push(ts); c.push(cl); o.push(r2(open?.[i], cl)); h.push(r2(high?.[i], cl)); l.push(r2(low?.[i], cl)); } });
      return json({ symbol: sym, range: u.searchParams.get("range") ?? "1y", interval: pair[1], t, c, o, h, l, previousClose: r.meta?.chartPreviousClose ?? null, currency: r.meta?.currency ?? "USD", name: r.meta?.longName ?? r.meta?.shortName ?? sym });
    }
    if (action === "quote") {
      const d: any = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, 60_000);
      const m = d.chart?.result?.[0]?.meta;
      if (!m) return json({ error: "No data" }, 404);
      return json({ symbol: sym, price: m.regularMarketPrice, previousClose: m.chartPreviousClose, name: m.longName ?? m.shortName ?? sym });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 120) }, 502);
  }
});
