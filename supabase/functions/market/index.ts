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
