"""Site-wide forecasts -> data/forecasts.json and data/earnings_move.json.
The same honest approach as the AI Watch outlook, applied to every price on the site: forecast HOW FAR a price can move (volatility), not WHICH WAY.
  sigma      daily volatility = sqrt(0.75 * EWMA(lambda 0.94) + 0.25 * trailing-year variance)
  z          realized h-step log return / (sigma * sqrt(h))      (h = 1 week, 1 month, 3 months)
  ranges     price * exp(sigma * sqrt(h) * q), q = empirical quantiles of z for that asset class (fat tails and skew included, not assumed normal)
  odds       P(fall of d within h) from the class's empirical table of how deep paths dipped, in units of sigma * sqrt(h)
Quantiles and tables are fitted on long histories per asset class, then CHECKED on 2018-onward data they never saw (coverage of the 68% and 90% bands).
Earnings: each stock's own past reactions (2-day window around SEC 8-K Item 2.02 dates, divided by its pre-event jump-robust volatility)."""
import datetime as dt, glob, json, math, os, re, time
import numpy as np, pandas as pd
import mdata

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")
QS = [0.05, 0.16, 0.5, 0.84, 0.95]
XGRID = [round(x * 0.1, 1) for x in range(0, 41)]
ZGRID = [round(-4 + 0.25 * i, 2) for i in range(33)]
EPOCH = dt.date(2000, 1, 1)
STD_H = {"h5": 5, "h21": 21, "h63": 63}
CRY_H = {"h5": 7, "h21": 30, "h63": 90}
SAMPLE = {
    "stock": ["AAPL", "MSFT", "JPM", "XOM", "JNJ", "PG", "WMT", "KO", "PFE", "INTC", "CSCO", "ORCL", "IBM", "GE", "CAT", "MMM", "HD", "MCD", "NKE", "DIS", "T", "VZ", "MRK", "AMGN", "UNH", "BA", "HON", "LMT", "COST", "TXN", "QCOM", "NVDA", "AMZN", "GOOGL", "TSLA", "AMD", "MU", "F", "GS", "BAC"],
    "index": ["^GSPC", "^IXIC", "^DJI", "^RUT", "^FTSE", "^N225", "^HSI", "^STOXX50E"],
    "sector": ["XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB"],
    "crypto": ["BTC-USD", "ETH-USD", "LTC-USD", "XRP-USD", "DOGE-USD"],
    "fx": ["EURUSD=X", "GBPUSD=X", "JPY=X", "AUDUSD=X", "USDCAD=X", "USDCHF=X", "NZDUSD=X", "USDMXN=X", "USDBRL=X", "USDINR=X"],
    "commodity": ["CL=F", "GC=F", "SI=F", "NG=F", "HG=F"],
    "rate": ["^TNX", "^FVX"],
}
CRYPTO_SITE = ["BTC", "ETH", "BNB", "XRP", "SOL", "ADA", "DOGE", "LTC", "AVAX", "LINK", "DOT", "TRX", "BCH", "XLM"]
COMMODITY_SITE = ["CL=F", "BZ=F", "GC=F", "SI=F", "NG=F", "HG=F", "PL=F"]


def day_to_date(t):
    return EPOCH + dt.timedelta(days=int(t))


def sigma_daily(c):
    """Daily volatility estimate at each date, using only data up to that date."""
    lr = np.log(c).diff()
    ew = lr.pow(2).ewm(alpha=0.06, adjust=False, min_periods=20).mean()
    yr = lr.pow(2).rolling(250, min_periods=60).mean()
    return np.sqrt(0.75 * ew + 0.25 * yr.fillna(ew))


def samples(c, h, step):
    """z (terminal) and zmin (depth of the deepest dip along the path, in sigma*sqrt(h) units) for every `step`-th date."""
    lr = np.log(c.astype(float)); sg = sigma_daily(c)
    term = lr.shift(-h) - lr
    fmin = lr[::-1].rolling(h, min_periods=h).min()[::-1].shift(-1) - lr
    sd = sg * math.sqrt(h)
    df = pd.DataFrame({"z": term / sd, "zmin": (-fmin).clip(lower=0) / sd}).dropna()
    df = df[np.isfinite(df["z"]) & np.isfinite(df["zmin"])]
    return df.iloc[::step]


def fit(frames):
    z = np.concatenate([f["z"].values for f in frames]); zm = np.concatenate([f["zmin"].values for f in frames])
    return dict(q=[round(float(x), 3) for x in np.quantile(z, QS)], dn=[round(float((zm >= x).mean()), 4) for x in XGRID], cdf=[round(float((z <= v).mean()), 4) for v in ZGRID], n=int(len(z)))


def calibrate():
    """Per asset class and horizon: fit on everything, and test coverage on 2018-onward using a fit made only on pre-2018 data."""
    out, evidence = {}, {}
    for cls, syms in SAMPLE.items():
        hs = CRY_H if cls == "crypto" else STD_H
        series = {}
        for s in syms:
            try:
                c = mdata.yahoo(s, refresh_days=7).dropna()
                if len(c) > 500:
                    series[s] = c
            except Exception as e:
                print("  skip", s, str(e)[:50])
        if not series:
            continue
        out[cls] = {}; evidence[cls] = {"symbols": len(series), "from": min(str(c.index[0].date()) for c in series.values())}
        for hk, h in hs.items():
            step = max(2, h // 5)
            fr = {s: samples(c, h, step) for s, c in series.items()}
            allf = list(fr.values())
            out[cls][hk] = fit(allf)
            des = [f[f.index < "2018-01-01"] for f in allf if (f.index < "2018-01-01").sum() > 200]
            hol = [f[f.index >= "2018-01-01"] for f in allf if (f.index >= "2018-01-01").sum() > 100]
            if des and hol:
                m = fit(des); q = m["q"]; z = np.concatenate([f["z"].values for f in hol])
                cov68 = float(((z >= q[1]) & (z <= q[3])).mean()); cov90 = float(((z >= q[0]) & (z <= q[4])).mean())
                g68 = float((np.abs(z) <= 1).mean()); g90 = float((np.abs(z) <= 1.645).mean())
                zm = np.concatenate([f["zmin"].values for f in hol]); i = XGRID.index(1.0)
                evidence[cls][hk] = dict(n_holdout=int(len(z)), band68=round(cov68, 3), band90=round(cov90, 3), normal68=round(g68, 3), normal90=round(g90, 3), dip_pred=m["dn"][i], dip_real=round(float((zm >= 1.0).mean()), 4))
        print("  calibrated", cls, {k: evidence[cls].get(k, {}).get("band68") for k in hs})
    return out, evidence


# ---------- site-wide forecasts ----------
def interp(grid, vals, x):
    return float(np.interp(x, grid, vals))


def forecast_one(c, cls, calib, h_map, per_year):
    c = pd.Series(c).astype(float).dropna()
    if len(c) < 120:
        return None
    sg = float(sigma_daily(c).iloc[-1])
    if not sg or sg != sg:
        return None
    price = float(c.iloc[-1]); res = {}
    cal = calib.get(cls)
    if not cal:
        return None
    for hk, h in h_map.items():
        q = cal[hk]["q"]; sd = sg * math.sqrt(h)
        res[hk] = [round((math.exp(sd * q[i]) - 1) * 100, 2) for i in (0, 1, 3, 4)]    # 5%, 16%, 84%, 95%
    hk = "h63"; h = h_map[hk]; sd = sg * math.sqrt(h); cal63 = cal[hk]
    def p_down(d):
        return round(interp(XGRID, cal63["dn"], abs(math.log(1 - d)) / sd), 4)
    def p_up(u):
        return round(1 - interp(ZGRID, cal63["cdf"], math.log(1 + u) / sd), 4)
    return dict(c=cls, p=round(price, 4), s=round(sg * math.sqrt(per_year) * 100, 1), r=res, d10=p_down(0.10), d20=p_down(0.20), u10=p_up(0.10), u20=p_up(0.20))


SECTOR_ETFS = {"XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLC", "XLRE"}
INDEX_ETFS = {"SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "VXUS", "AGG"}


def classify(stem):
    if stem in SECTOR_ETFS:
        return "sector"
    if stem in INDEX_ETFS:
        return "index"
    if stem == "GLD":
        return "commodity"
    if stem.startswith("_S_"):
        return "sector"
    if stem in ("_TNX",):
        return "rate"
    if stem == "_VIX":
        return None
    if stem.startswith("_"):
        return "index"
    if stem.startswith("FX_"):
        return "fx"
    if stem == "DX-Y.NYB" or stem.startswith("DX-"):
        return "fx"
    if stem.endswith("-USD"):
        return None
    return "stock"


def site_forecasts(calib):
    out = {}; asof = None
    for p in sorted(glob.glob(os.path.join(DATA, "hist", "*.json")) + glob.glob(os.path.join(DATA, "fx", "*.json"))):
        stem = os.path.basename(p)[:-5]; cls = classify(stem)
        if not cls:
            continue
        try:
            h = json.load(open(p)); c = pd.Series(h["c"], index=pd.to_datetime([day_to_date(t) for t in h["t"]]))
        except Exception:
            continue
        r = forecast_one(c, cls, calib, STD_H, 252)
        if r:
            r["d"] = str(c.index[-1].date()); out[stem] = r; asof = max(asof or r["d"], r["d"])
    for s in CRYPTO_SITE:
        try:
            c = mdata.yahoo(s + "-USD", refresh_days=0).dropna(); r = forecast_one(c, "crypto", calib, CRY_H, 365)
            if r:
                r["d"] = str(c.index[-1].date()); out["CRYPTO_" + s] = r
        except Exception as e:
            print("  crypto skip", s, str(e)[:40])
    for s in COMMODITY_SITE:
        try:
            c = mdata.yahoo(s, refresh_days=0).dropna(); r = forecast_one(c, "commodity", calib, STD_H, 252)
            if r:
                r["d"] = str(c.index[-1].date()); out["COM_" + s] = r
        except Exception as e:
            print("  commodity skip", s, str(e)[:40])
    return out, asof


# ---------- earnings reactions ----------
def rsig(prices):
    lr = np.log(np.asarray(prices, dtype=float)); lr = np.diff(lr)
    return float(1.4826 * np.median(np.abs(lr - np.median(lr)))) if len(lr) else 0.0


def sec_get(url):
    import sec
    return sec.get(url)


def earnings_dates(sym_cik, cache_path):
    """8-K Item 2.02 filing dates per stock, cached; a full history on first sight, then only the newest filings."""
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    today = dt.date.today(); n = 0
    for sym, cik in sym_cik.items():
        e = cache.get(sym)
        if e and (today - dt.date.fromisoformat(e["checked"])).days < 3:
            continue
        try:
            time.sleep(0.11)
            sub = json.loads(sec_get("https://data.sec.gov/submissions/CIK%010d.json" % cik))["filings"]
            dates = set(e["dates"]) if e else set()
            def take(s):
                for form, date, items in zip(s["form"], s["filingDate"], s.get("items", [""] * len(s["form"]))):
                    if form == "8-K" and "2.02" in (items or ""):
                        dates.add(date)
            take(sub["recent"])
            if not e:
                for fl in sub.get("files", [])[:4]:
                    if fl.get("filingTo", "9999") < "2021-06-01":
                        continue
                    time.sleep(0.11); take(json.loads(sec_get("https://data.sec.gov/submissions/" + fl["name"])))
            cache[sym] = dict(cik=cik, dates=sorted(dates), checked=today.isoformat()); n += 1
        except Exception as ex:
            print("  8-K dates failed", sym, str(ex)[:50])
    json.dump(cache, open(cache_path, "w"), separators=(",", ":"))
    return cache


def tickers_cik():
    j = json.loads(sec_get("https://www.sec.gov/files/company_tickers.json"))
    return {v["ticker"].upper(): int(v["cik_str"]) for v in j.values()}


def upcoming_from_calendar():
    p = os.path.join(DATA, "calendar.json")
    up = {}
    if os.path.exists(p):
        for e in json.load(open(p)).get("events", []):
            if e.get("kind") == "earnings":
                m = re.search(r"\(([A-Z.\-]+)\) reports", e.get("title", ""))
                if m:
                    up[m.group(1)] = dict(date=e["date"], when=e.get("time", ""))
    return up


def earnings_moves():
    cik = tickers_cik()
    stems = [os.path.basename(p)[:-5] for p in glob.glob(os.path.join(DATA, "hist", "*.json"))]
    stocks = {}
    for s in stems:
        if s.startswith("_"):
            continue
        k = cik.get(s) or cik.get(s.replace("-", ".")) or cik.get(s.replace(".", "-"))
        if k:
            stocks[s] = k
    cache = earnings_dates(stocks, os.path.join(DATA, "earnings_dates.json"))
    up = upcoming_from_calendar(); ev, sn = {}, {}
    for s in stocks:
        try:
            h = json.load(open(os.path.join(DATA, "hist", s + ".json"))); c = pd.Series(h["c"], index=pd.to_datetime([day_to_date(t) for t in h["t"]]))
        except Exception:
            continue
        rows = []
        for d in cache.get(s, {}).get("dates", []):
            t = pd.Timestamp(d); a = int(c.index.searchsorted(t, side="left")) - 1; b = a + 2
            if a < 45 or b >= len(c) or (c.index[b] - t).days > 6:
                continue
            sg = rsig(c.iloc[a - 40: a + 1].values)
            if sg > 0:
                rows.append((d, math.log(c.iloc[b] / c.iloc[a]) / (sg * math.sqrt(2))))
        if len(rows) >= 8:
            ev[s] = rows; sn[s] = rsig(c.iloc[-41:].values) * math.sqrt(2) * 100
    K = 10.0                                                       # shrinkage: a stock's own scale counts as K extra pooled events
    def fit_scale(events):                                         # events: {sym: [(date, z)]} -> pooled mean |z| and per-stock shrunk scale
        allz = np.array([abs(z) for r in events.values() for _, z in r]); m = float(allz.mean())
        return m, {s: (sum(abs(z) for _, z in r) + K * m) / (len(r) + K) for s, r in events.items()}
    def shape(events, scale, since="0000"):                        # pooled quantiles of z / scale, optionally only recent events (reaction sizes drift with the market regime)
        zz = np.array([z / scale[s] for s, r in events.items() if s in scale for d, z in r if d >= since]); return np.percentile(zz, [10, 90]), float(np.abs(zz).mean())
    # walk-forward test: for each half-year block from 2023, fit on events BEFORE the block only (shape from the previous two years), then score the block
    blocks, hits_all, per_block = [], [], []
    y, mth = 2023, 1
    while dt.date(y, mth, 1) < dt.date.today():
        st = "%d-%02d-01" % (y, mth); mth += 6
        if mth > 12:
            y, mth = y + 1, mth - 12
        blocks.append((st, "%d-%02d-01" % (y, mth)))
    for st, en in blocks:
        prior = {s: [x for x in r if x[0] < st] for s, r in ev.items()}; prior = {s: r for s, r in prior.items() if len(r) >= 3}
        if not prior:
            continue
        m0, sc0 = fit_scale(prior); since = (dt.date.fromisoformat(st) - dt.timedelta(days=730)).isoformat()
        (lo0, hi0), _ = shape(prior, sc0, since); hb = [bool(lo0 * sc0.get(s, m0) <= z <= hi0 * sc0.get(s, m0)) for s, r in ev.items() for d, z in r if st <= d < en]
        if len(hb) > 50:
            hits_all += hb; per_block.append(round(float(np.mean(hb)), 3))
    m, scale = fit_scale(ev); (qlo, qhi), mabs = shape(ev, scale, (dt.date.today() - dt.timedelta(days=730)).isoformat()); out = {}; nev = sum(len(r) for r in ev.values())
    for s, r in ev.items():
        z = np.array([x for _, x in r]); k = sn[s] / 100.0
        out[s] = dict(n=len(z), typ=round(float(scale[s] * mabs * sn[s]), 1), lo=round(float((math.exp(qlo * scale[s] * k) - 1) * 100), 1), hi=round(float((math.exp(qhi * scale[s] * k) - 1) * 100), 1), up=round(float((z > 0).mean()), 2))
        if s in up:
            out[s]["next"] = up[s]
    meta = dict(stocks=len(out), events=nev, coverage80=round(float(np.mean(hits_all)), 3) if hits_all else None, block_min=min(per_block) if per_block else None, block_max=max(per_block) if per_block else None, blocks=len(per_block), n_checks=len(hits_all))
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", meta=meta, stocks=out)


def main(skip_earnings=False):
    t0 = time.time()
    calib, evidence = calibrate()
    fc, asof = site_forecasts(calib)
    try:   # smaller companies: their own calibration (their volatility per company lives in data/small.json, refreshed by smallcaps.refresh)
        import smallcaps
        sc = smallcaps.calibrate(); calib["small"] = sc["calib"]; evidence["small"] = sc["evidence"]
    except Exception as e:
        print("small-company calibration skipped:", e)
    out = dict(generated=dt.datetime.utcnow().isoformat() + "Z", asof=asof, calib=calib, evidence=evidence, f=fc, horizons={"std": STD_H, "crypto": CRY_H}, xgrid=XGRID, zgrid=ZGRID, qs=QS)
    json.dump(out, open(os.path.join(DATA, "forecasts.json"), "w"), separators=(",", ":"))
    print("forecasts: %d symbols, calibrated classes %s (%.0fs)" % (len(fc), list(calib), time.time() - t0))
    if not skip_earnings:
        em = earnings_moves()
        json.dump(em, open(os.path.join(DATA, "earnings_move.json"), "w"), separators=(",", ":"))
        print("earnings moves:", em["meta"])


if __name__ == "__main__":
    import sys
    main(skip_earnings="--no-earnings" in sys.argv)
