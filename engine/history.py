"""5-year daily price history per stock + a market-cap-weighted index per sector -> data/hist/*.json
File format: {"t": [days since 2000-01-01, ...], "c": [close, ...]}  (split-adjusted closes from Yahoo)."""
import datetime as dt, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
HIST = os.path.join(DATA, "hist")
UA = {"User-Agent": "Mozilla/5.0"}  # Yahoo 429s long browser UAs
EPOCH = dt.date(2000, 1, 1)
OHLC = os.path.join(DATA, "hist-ohlc")
_OHLC = {}  # filled by fetch(): date, close, open, high, low
EXTRA = ["SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "VXUS", "AGG", "GLD",
         # market overview items (indices, global, rates, currency, commodities, crypto)
         "^GSPC", "^DJI", "^IXIC", "^RUT", "^FTSE", "^STOXX50E", "^N225", "^HSI", "^VIX", "^TNX", "DX-Y.NYB", "CL=F", "GC=F", "BTC-USD"]


def day(iso):
    return (dt.date.fromisoformat(iso) - EPOCH).days


def fetch(sym, rng="5y", tries=4):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=1d" % (urlreq.quote(sym), rng)
    for i in range(tries):
        try:
            with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25) as r:
                res = json.loads(r.read())["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            rows = [(dt.datetime.utcfromtimestamp(t).date().isoformat(), c, o, h, l) for t, c, o, h, l in zip(res["timestamp"], q["close"], q.get("open") or [None] * 9999, q.get("high") or [None] * 9999, q.get("low") or [None] * 9999) if c is not None]
            if len(rows) < 20:
                raise ValueError("short")
            _OHLC[sym] = rows
            return [(d, c) for d, c, _, _, _ in rows]
        except Exception as e:
            if "404" in str(e):
                raise
            time.sleep(2 * (i + 1))  # 429 backoff
    raise RuntimeError("failed " + sym)


def save(sym, series):
    os.makedirs(HIST, exist_ok=True)
    json.dump({"t": [day(d) for d, _ in series], "c": [round(c, 2) for _, c in series]}, open(os.path.join(HIST, sym.replace("^", "_") + ".json"), "w"), separators=(",", ":"))


def save_ohlc(sym):
    """Open/high/low/close history for the candlestick view (kept separate so line charts stay light)."""
    rows = _OHLC.get(sym)
    if not rows:
        return
    os.makedirs(OHLC, exist_ok=True)
    r2 = lambda v, c: round(v if v is not None else c, 2)
    json.dump({"t": [day(d) for d, *_ in rows], "o": [r2(o, c) for _, c, o, _, _ in rows], "h": [r2(h, c) for _, c, _, h, _ in rows],
               "l": [r2(l, c) for _, c, _, _, l in rows], "c": [round(c, 2) for _, c, *_ in rows]},
              open(os.path.join(OHLC, sym.replace("^", "_") + ".json"), "w"), separators=(",", ":"))


def load(sym):
    p = os.path.join(HIST, sym + ".json")
    if not os.path.exists(p):
        return None
    j = json.load(open(p))
    return list(zip(j["t"], j["c"]))


def sector_index(members):
    """Cap-weighted index (base 100) from member histories, weights fixed at today's market caps, renormalised for missing days."""
    series = {}
    for sym, cap in members:
        h = load(sym)
        if h and len(h) > 100:
            series[sym] = (cap, dict(h))
    if not series:
        return None
    days = sorted(set(d for _, (_, m) in series.items() for d in m))
    level, out, prev = 100.0, [], {}
    for d in days:
        num = den = 0.0
        for sym, (cap, m) in series.items():
            if d in m and sym in prev and prev[sym] > 0:
                num += cap * (m[d] / prev[sym] - 1)
                den += cap
            if d in m:
                prev[sym] = m[d]
        if den > 0:
            level *= 1 + num / den
        out.append((d, round(level, 2)))
    return out[1:] if len(out) > 1 else None


def write_sparks():
    """Per-sector bundle of the last year of closes for each top-50 stock, so sector pages can show a chart on every row without 50 separate downloads."""
    sectors = json.load(open(os.path.join(DATA, "sectors.json")))["sectors"]
    out_dir = os.path.join(DATA, "sparks")
    os.makedirs(out_dir, exist_ok=True)
    for sec in sectors:
        bundle = {}
        for t in sec["top"]:
            h = load(t["symbol"])
            if h and len(h) > 30:
                bundle[t["symbol"]] = {"t0": h[-252:][0][0], "c": [round(c, 1 if c >= 20 else 2) for _, c in h[-252:]]}
        json.dump(bundle, open(os.path.join(out_dir, sec["key"] + ".json"), "w"), separators=(",", ":"))


def main(limit=None):
    sectors = json.load(open(os.path.join(DATA, "sectors.json")))["sectors"]
    syms = []
    for s in sectors:
        syms += [t["symbol"] for t in s["top"]]
    try:
        from quotes import UNIVERSE
        syms += [u[0] for u in UNIVERSE]
    except Exception:
        pass
    syms = list(dict.fromkeys(syms + EXTRA))
    if limit:
        syms = syms[:limit]
    ok = bad = 0
    for i, sym in enumerate(syms):
        try:
            save(sym, fetch(sym))
            save_ohlc(sym)
            ok += 1
        except Exception:
            bad += 1  # keep any previous file
        time.sleep(0.25)
        if (i + 1) % 50 == 0:
            print("  %d/%d (ok %d, failed %d)" % (i + 1, len(syms), ok, bad), flush=True)
    for s in sectors:
        idx = sector_index([(t["symbol"], t["cap_b"]) for t in s["top"]])
        if idx:
            save("_S_" + s["key"], [(dt.date.fromordinal(EPOCH.toordinal() + d).isoformat(), c) for d, c in idx])
    write_sparks()
    print("history done: ok", ok, "failed", bad)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "sparks":
        write_sparks()
        print("sparks written")
    else:
        main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
