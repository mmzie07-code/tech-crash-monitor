"""Ranges for the smaller companies that have no stored price history -> data/small.json (and data/small_calib.json).
The ~550 largest companies already get a range from their stored 5-year history (forecast.py). For everyone else on the screener we pull one year of
daily closes, keep only what the range needs (today's price and daily volatility, same formula as forecast.py) and refresh a rotating batch each night,
so within a week every company has a range and none is more than a week stale. The browser turns volatility into ranges with the calibration in forecasts.json.
Small companies move differently from large ones (fatter tails), so they get their OWN calibration, fitted on a sample of them and checked on a later
period it never saw, instead of borrowing the large-company one."""
import datetime as dt, json, math, os, random, sys, time, urllib.parse, urllib.request as ur
import numpy as np, pandas as pd

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
DATA = os.path.join(HERE, "..", "data")
SMALL = os.path.join(DATA, "small.json")
CALIB = os.path.join(DATA, "small_calib.json")
UA = {"User-Agent": "Mozilla/5.0"}


def universe():
    """Screener companies with no stored history file."""
    have = {os.path.basename(p)[:-5] for p in os.listdir(os.path.join(DATA, "hist")) if p.endswith(".json")} if os.path.isdir(os.path.join(DATA, "hist")) else set()
    rows = json.load(open(os.path.join(DATA, "search.json")))["stocks"]
    return [r for r in rows if r[0] not in have and r[0].replace("-", ".") not in have and r[3] is not None]


def closes(sym, rng="1y", tries=3):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=1d" % (urllib.parse.quote(sym), rng)
    last = None
    for i in range(tries):
        try:
            r = json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=25).read())["chart"]["result"][0]
            idx = pd.to_datetime(r["timestamp"], unit="s").normalize()
            c = pd.Series(r["indicators"]["quote"][0]["close"], index=idx, dtype=float)
            c = c[~c.index.duplicated(keep="last")].dropna()
            return c[c > 0]
        except Exception as e:
            last = e
            if "404" in str(e):
                break
            time.sleep(1.5 * (i + 1))
    raise RuntimeError("%s: %s" % (sym, last))


def refresh(max_n=700, budget_s=1500, pause=0.25):
    """Fetch the stalest `max_n` companies (never-fetched first) within a time budget; keeps what it has if anything fails."""
    from forecast import sigma_daily
    cur = json.load(open(SMALL)) if os.path.exists(SMALL) else {}
    uni = universe(); syms = [r[0] for r in uni]
    syms.sort(key=lambda s: cur.get(s, {}).get("d", "0000"))
    t0 = time.time(); done = 0; bad = 0
    for s in syms[:max_n]:
        if time.time() - t0 > budget_s:
            break
        try:
            c = closes(s)
            if len(c) < 120:
                cur[s] = {"d": "9999-short", "s": None}; bad += 1; continue
            sg = float(sigma_daily(c).iloc[-1])
            if sg and sg == sg:
                cur[s] = {"p": round(float(c.iloc[-1]), 4), "s": round(sg, 5), "d": str(c.index[-1].date())}; done += 1
        except Exception:
            bad += 1
        time.sleep(pause)
        if (done + bad) % 100 == 0:
            json.dump(cur, open(SMALL, "w"), separators=(",", ":"))
    keep = {s for s in syms}
    cur = {s: v for s, v in cur.items() if s in keep}
    json.dump(cur, open(SMALL, "w"), separators=(",", ":"))
    have = sum(1 for v in cur.values() if v.get("s"))
    print("small-company volatility: +%d fetched, %d failed/short, %d of %d have a range (%.0fs)" % (done, bad, have, len(syms), time.time() - t0))
    return cur


def calibrate(n=90, seed=7, force=False):
    """Fit the 'small' class on a sample of small companies (5y of history) and test coverage on dates after 2024-01-01 using a fit from before it."""
    from forecast import samples, fit, STD_H, XGRID
    if not force and os.path.exists(CALIB) and time.time() - os.path.getmtime(CALIB) < 30 * 86400:
        return json.load(open(CALIB))
    pool = [r[0] for r in universe() if 0.3 <= r[3] <= 5]
    random.Random(seed).shuffle(pool)
    series = {}
    for s in pool:
        if len(series) >= n:
            break
        try:
            c = closes(s, "5y")
            if len(c) > 900:
                series[s] = c
        except Exception:
            pass
        time.sleep(0.25)
    if len(series) < 30:
        raise RuntimeError("too few small-company histories to calibrate (%d)" % len(series))
    calib, ev = {}, {"symbols": len(series), "from": min(str(c.index[0].date()) for c in series.values())}
    for hk, h in STD_H.items():
        fr = [samples(c, h, max(2, h // 5)) for c in series.values()]
        calib[hk] = fit(fr)
        des = [f[f.index < "2024-01-01"] for f in fr if (f.index < "2024-01-01").sum() > 25]
        hol = [f[f.index >= "2024-01-01"] for f in fr if (f.index >= "2024-01-01").sum() > 25]
        if des and hol:
            m = fit(des); q = m["q"]; z = np.concatenate([f["z"].values for f in hol]); zm = np.concatenate([f["zmin"].values for f in hol]); i = XGRID.index(1.0)
            ev[hk] = dict(n_holdout=int(len(z)), band68=round(float(((z >= q[1]) & (z <= q[3])).mean()), 3), band90=round(float(((z >= q[0]) & (z <= q[4])).mean()), 3),
                          normal68=round(float((np.abs(z) <= 1).mean()), 3), normal90=round(float((np.abs(z) <= 1.645).mean()), 3), dip_pred=m["dn"][i], dip_real=round(float((zm >= 1.0).mean()), 4))
    out = {"calib": calib, "evidence": ev}
    json.dump(out, open(CALIB, "w"), separators=(",", ":"))
    print("small-company calibration:", {k: ev.get(k, {}).get("band68") for k in STD_H}, "symbols", len(series))
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if "calibrate" in a:
        calibrate(force=True)
    n = 700
    for x in a:
        if x.isdigit():
            n = int(x)
    if "calibrate" not in a or any(x.isdigit() for x in a):
        refresh(max_n=n, budget_s=60 * 60 if n > 1000 else 1500)
