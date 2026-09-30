// Supabase Edge Function "market": authenticated proxy for live market data (search, quotes, intraday charts).
// Access: a signed-in user's JWT, OR the owner's private key (header x-owner-key). Everyone else gets 401.
// Secrets required (set with `supabase secrets set`): OWNER_KEY, ALLOWED_ORIGIN.  SUPABASE_URL / SUPABASE_ANON_KEY are provided automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://mmzie07-code.github.io";
const OWNER_KEY = Deno.env.get("OWNER_KEY") ?? "";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-owner-key, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", ...extra } });

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

const RANGES: Record<string, [string, string]> = { "1d": ["1d", "5m"], "5d": ["5d", "15m"], "1mo": ["1mo", "1d"], "3mo": ["3mo", "1d"], "6mo": ["6mo", "1d"], "ytd": ["ytd", "1d"], "1y": ["1y", "1d"], "5y": ["5y", "1wk"], "max": ["max", "1mo"] };
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
      const d: any = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${pair[0]}&interval=${pair[1]}`, pair[0] === "1d" || pair[0] === "5d" ? 60_000 : 600_000);
      const r = d.chart?.result?.[0];
      if (!r) return json({ error: "No data" }, 404);
      const close = r.indicators.quote[0].close as (number | null)[];
      const t: number[] = [], c: number[] = [];
      r.timestamp.forEach((ts: number, i: number) => { if (close[i] != null) { t.push(ts); c.push(Math.round(close[i]! * 100) / 100); } });
      return json({ symbol: sym, range: u.searchParams.get("range") ?? "1y", interval: pair[1], t, c, previousClose: r.meta?.chartPreviousClose ?? null, currency: r.meta?.currency ?? "USD", name: r.meta?.longName ?? r.meta?.shortName ?? sym });
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
