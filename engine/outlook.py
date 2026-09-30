"""Outlook -> data/outlook.json
NOT a forecast. For each horizon it reports (1) what the S&P 500 has historically done over that span, (2) what it did in
conditions like today's (same trend + fear level), (3) live drivers on each side, (4) scheduled events. Scenario labels carry
their historical frequency, never a probability of what will happen next."""
import bisect, datetime as dt, json, os
from providers import yahoo_history

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE = os.path.join(DATA, "cache")
HORIZONS = [("today", "Today", 1, 1.0), ("tomorrow", "Tomorrow", 1, 1.0), ("week", "Next week", 5, 2.5),
            ("month", "Next month", 21, 5.0), ("year", "Next year", 252, 15.0)]


def load(sym, start):
    path = os.path.join(CACHE, sym.replace("^", "") + ".json")
    if os.path.exists(path):
        try:
            h = [tuple(x) for x in json.load(open(path))]
            if h and h[0][0] < "1999" and (dt.date.today() - dt.date.fromisoformat(h[-1][0])).days < 7:
                return h
        except Exception:
            pass
    h = yahoo_history(sym, start)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(h, open(path, "w"))
    return h


def pctile(v, q):
    v = sorted(v)
    k = (len(v) - 1) * q
    f = int(k)
    return v[f] + (v[min(f + 1, len(v) - 1)] - v[f]) * (k - f)


def stats(rets, thr):
    n = len(rets)
    if n < 30:
        return None
    return dict(n=n, up=round(100 * sum(r > 0 for r in rets) / n), median=round(pctile(rets, .5), 1), p10=round(pctile(rets, .1), 1),
                p25=round(pctile(rets, .25), 1), p75=round(pctile(rets, .75), 1), p90=round(pctile(rets, .9), 1),
                below=round(100 * sum(r < -thr for r in rets) / n), above=round(100 * sum(r > thr for r in rets) / n),
                worst=round(min(rets), 1), best=round(max(rets), 1))


def vix_bucket(v):
    return 0 if v < 15 else 1 if v < 20 else 2 if v < 30 else 3


BUCKETS = ["calm (VIX under 15)", "normal (VIX 15-20)", "nervous (VIX 20-30)", "fearful (VIX over 30)"]


def drivers(snap, mk, cal, h):
    up, down = [], []
    macro = {r["symbol"]: r for r in (mk or {}).get("macro", [])}
    idx = {r["symbol"]: r for r in (mk or {}).get("indices", [])}
    chk = {c["id"]: c for c in snap["checks"]}
    spx = idx.get("^GSPC")
    if spx:
        (up if spx["from_high"] > -5 else down).append(("S&P 500 is close to its 1-year high (%.1f%% below it)." % abs(spx["from_high"])) if spx["from_high"] > -5 else ("S&P 500 is %.1f%% below its 1-year high." % abs(spx["from_high"])))
    v = macro.get("^VIX")
    if v:
        (up if v["last"] < 20 else down).append("VIX at %.1f: %s." % (v["last"], "investors are relatively calm" if v["last"] < 20 else "investors are nervous"))
    y = macro.get("^TNX")
    if y:
        if y["m1"] is not None and y["m1"] > 0.25:
            down.append("10-year yield is %.2f%% and rose %.2f points in a month; rising rates pressure expensive stocks." % (y["last"], y["m1"]))
        elif y["m1"] is not None and y["m1"] < -0.25:
            up.append("10-year yield fell %.2f points in a month to %.2f%%, which eases pressure on stocks." % (abs(y["m1"]), y["last"]))
        elif y["last"] >= 4.5:
            down.append("10-year yield is high at %.2f%%, which makes bonds a strong competitor to stocks." % y["last"])
    oil = macro.get("CL=F")
    if oil and oil["m1"] is not None and oil["m1"] > 10:
        down.append("Oil is up %.0f%% in a month, which can feed inflation." % oil["m1"])
    flashing = [c for c in snap["checks"] if c["status"] == "warn" and c["weight"] > 0]
    if flashing:
        down.append("AI & Tech Watch has %d warning sign(s) flashing (%s); score %d, %s risk." % (len(flashing), "; ".join(c["name"] for c in flashing), snap["score"], snap["level"]))
    else:
        up.append("AI & Tech Watch shows no weighted warning signs today.")
    c10 = chk.get(10)
    if c10 and c10["status"] == "ok":
        up.append("Chip stocks are not lagging the market (our best-tested warning is quiet).")
    if h in ("week", "month", "year"):
        c3 = chk.get(3)
        if c3 and c3["status"] == "warn":
            down.append(c3["detail"].split(" As of")[0])
    if h == "year":
        c1 = chk.get(1)
        if c1 and c1.get("value") and c1["name"].startswith("Valuation"):
            (down if c1["status"] == "warn" else up).append(("QQQ trailing P/E is %.1f, above our 32 warning line; expensive markets have less room for error." if c1["status"] == "warn" else "QQQ trailing P/E is %.1f, under our 32 warning line. Over a year, profit growth and interest rates have mattered more than starting valuation.") % c1["value"])
    return up, down


def events_for(cal, key):
    if not cal:
        return []
    today = dt.date.fromisoformat(cal["today"])
    d1 = today + dt.timedelta(days=1)
    while d1.weekday() >= 5:
        d1 += dt.timedelta(days=1)
    span = {"today": (today, today), "tomorrow": (d1, d1), "week": (today, today + dt.timedelta(days=7)),
            "month": (today, today + dt.timedelta(days=31)), "year": (today, today + dt.timedelta(days=370))}[key]
    out = []
    for e in cal["events"]:
        d = dt.date.fromisoformat(e["date"])
        if span[0] <= d <= span[1] and (e["importance"] == "high" or (key in ("today", "tomorrow", "week") and e["importance"] == "medium")):
            out.append(dict(date=e["date"], time=e["time"], title=e["title"], importance=e["importance"]))
    return out[:12] if key != "year" else [e for e in out if "FOMC" in e["title"]][:8]


def build():
    snap = json.load(open(os.path.join(DATA, "latest.json")))
    try: mk = json.load(open(os.path.join(DATA, "markets.json")))
    except Exception: mk = None
    try: cal = json.load(open(os.path.join(DATA, "calendar.json")))
    except Exception: cal = None
    spx = load("^GSPC", 1985)
    vix = dict(load("^VIX", 1990))
    dates = [d for d, _ in spx]
    px = [c for _, c in spx]
    sma200 = [None] * len(px)
    run = 0.0
    for i, c in enumerate(px):
        run += c
        if i >= 200: run -= px[i - 200]
        if i >= 199: sma200[i] = run / 200
    # current regime
    cur_i = len(px) - 1
    above = px[cur_i] > sma200[cur_i]
    cur_vix = vix.get(dates[cur_i]) or next(iter(reversed(list(vix.values()))))
    bucket = vix_bucket(cur_vix)
    regime = "S&P 500 %s its 200-day average and the market is %s" % ("above" if above else "below", BUCKETS[bucket])
    out = dict(generated=dt.datetime.utcnow().isoformat() + "Z", as_of=dates[cur_i], regime=regime, history_from=dates[0], horizons={})
    for key, label, n, thr in HORIZONS:
        allr, condr = [], []
        for i in range(200, len(px) - n):
            r = (px[i + n] / px[i] - 1) * 100
            allr.append(r)
            v = vix.get(dates[i])
            if v is not None and (px[i] > sma200[i]) == above and vix_bucket(v) == bucket:
                condr.append(r)
        up, down = drivers(snap, mk, cal, key)
        out["horizons"][key] = dict(label=label, trading_days=n, threshold=thr, all=stats(allr, thr), similar=stats(condr, thr),
                                    bull=up, bear=down, events=events_for(cal, key))
    return out


if __name__ == "__main__":
    o = build()
    json.dump(o, open(os.path.join(DATA, "outlook.json"), "w"), indent=1)
    print(o["as_of"], "|", o["regime"])
    for k, h in o["horizons"].items():
        a, s = h["all"], h["similar"]
        print("%-9s all: up %d%% median %+.1f p10 %+.1f p90 %+.1f | similar(n=%s): up %s%% median %s | bull %d bear %d events %d" % (
            k, a["up"], a["median"], a["p10"], a["p90"], s and s["n"], s and s["up"], s and s["median"], len(h["bull"]), len(h["bear"]), len(h["events"])))
