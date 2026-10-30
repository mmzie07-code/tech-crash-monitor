"""Data layer for the prediction model. Pulls long daily histories (Yahoo Finance, FRED) and caches them under data/model_cache/ (git-ignored).
Everything is returned as pandas Series indexed by calendar date, so features can be computed without look-ahead."""
import io, json, os, time, urllib.parse, urllib.request as ur
import numpy as np, pandas as pd

HERE = os.path.dirname(__file__)
CACHE = os.path.join(HERE, "..", "data", "model_cache")
UA = {"User-Agent": "Mozilla/5.0"}


def _cache_path(name):
    os.makedirs(CACHE, exist_ok=True)
    return os.path.join(CACHE, name.replace("^", "_").replace("/", "_") + ".csv")


def yahoo(sym, rng="max", refresh_days=3, volume=False):
    """Daily closes (and optionally volume) from Yahoo, cached for `refresh_days`."""
    p = _cache_path("y_" + sym + ("_v" if volume else ""))
    if os.path.exists(p) and time.time() - os.path.getmtime(p) < refresh_days * 86400:
        df = pd.read_csv(p, index_col=0, parse_dates=True)
        return df if volume else df["close"]
    # explicit period1/period2: with range=max Yahoo quietly downsamples long histories to monthly bars
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d" % (urllib.parse.quote(sym), 0 if rng == "max" else time.time() - 86400 * 365.25 * int(rng.rstrip("y")), time.time() + 86400)
    last = None
    for i in range(4):
        try:
            r = json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=40).read())["chart"]["result"][0]
            idx = pd.to_datetime(r["timestamp"], unit="s").normalize()
            q = r["indicators"]["quote"][0]
            df = pd.DataFrame({"close": q["close"], "volume": q.get("volume")}, index=idx)
            df = df[~df.index.duplicated(keep="last")].dropna(subset=["close"])
            df.to_csv(p)
            return df if volume else df["close"]
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError("yahoo %s: %s" % (sym, last))


def fred(sid, start="1980-01-01", refresh_days=3):
    p = _cache_path("f_" + sid)
    if os.path.exists(p) and time.time() - os.path.getmtime(p) < refresh_days * 86400:
        return pd.read_csv(p, index_col=0, parse_dates=True).iloc[:, 0]
    req = ur.Request("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, start), headers={"User-Agent": "curl/8.4.0"})
    for i in range(3):
        try:
            df = pd.read_csv(io.BytesIO(ur.urlopen(req, timeout=40).read()), index_col=0, parse_dates=True, na_values=["."])
            s = df.iloc[:, 0].astype(float).dropna()
            s.to_csv(p)
            return s
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("fred " + sid)


def asof(series, index, lag_days):
    """Value of `series` known on each date in `index`, assuming it is published `lag_days` after its own date (no look-ahead)."""
    s = series.copy()
    s.index = s.index + pd.Timedelta(days=lag_days)
    return s.reindex(s.index.union(index)).ffill().reindex(index)
