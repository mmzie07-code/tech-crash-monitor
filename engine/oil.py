"""Oil page -> data/oil.json. Facts only: spot prices and pump prices (FRED, from the US Energy Information Administration), the futures curve (Yahoo Finance),
weekly US inventories, production and refinery data (EIA open data), the refining margin, and how oil has moved with other markets (our own stored history).
No forecasts, no price targets."""
import datetime as dt, json, math, os, sys, time
import urllib.request as ur

sys.path.insert(0, os.path.dirname(__file__))
import economy, history
from crypto import corr, hist as stored_hist

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
EPOCH = dt.date(2000, 1, 1)
EIA_KEY = os.environ.get("EIA_API_KEY") or ""   # optional free key (eia.gov/opendata); without one we read EIA's public data tables
MONTH_CODE = "FGHJKMNQUVXZ"

SPOT = [  # key, FRED id, label, unit, decimals
    ("wti", "DCOILWTICO", "WTI crude oil (US benchmark)", "$/barrel", 2), ("brent", "DCOILBRENTEU", "Brent crude oil (world benchmark)", "$/barrel", 2),
    ("gas", "GASREGW", "US regular gasoline, pump price", "$/gallon", 3), ("diesel", "GASDESW", "US diesel, pump price", "$/gallon", 3),
    ("natgas", "DHHNGSP", "Natural gas (Henry Hub)", "$/million BTU", 2)]
EIA = [  # key, EIA series, label, unit, kind (stock/flow), what it is, why it matters
    ("crude", "WCESTUS1", "Crude oil in storage (commercial)", "million barrels", "stock", "Crude oil held in US tanks and pipelines, not counting the emergency reserve.", "Rising stocks mean supply is outrunning demand, which tends to weigh on prices. Falling stocks mean the opposite."),
    ("spr", "WCSSTUS1", "Strategic Petroleum Reserve", "million barrels", "stock", "The government's emergency crude stockpile, held in salt caverns on the Gulf Coast.", "Releases add supply in a crisis; refilling it adds demand. Its level is a policy choice, not a market signal."),
    ("prod", "WCRFPUS2", "US crude oil production", "million barrels/day", "flow", "How much crude the US pumps each day. The US has been the world's largest producer for years.", "Shale drilling responds to prices within months, which is why high prices tend to bring more supply."),
    ("imports", "WCRIMUS2", "Crude imports", "million barrels/day", "flow", "Crude the US buys from other countries.", "Shows how much the US relies on the world market, and which way the trade is moving."),
    ("exports", "WCREXUS2", "Crude exports", "million barrels/day", "flow", "Crude the US sells abroad (allowed since 2015).", "Links US prices to the world market: more exports pull US prices toward Brent."),
    ("refutil", "WPULEUS3", "Refinery utilization", "% of capacity", "level", "How much of the country's refining capacity is running.", "Refineries turn crude into gasoline and diesel. Near 95% means they are running flat out, so pump prices can rise even if crude does not."),
    ("gasstock", "WGTSTUS1", "Gasoline in storage", "million barrels", "stock", "Finished gasoline and blending components held in storage.", "Low gasoline stocks in the driving season push pump prices up."),
    ("diststock", "WDISTUS1", "Diesel and heating oil in storage", "million barrels", "stock", "Distillate fuel oil: diesel for trucks, trains and farms, and heating oil.", "Diesel moves freight and farming costs, so tight stocks feed into prices across the economy."),
    ("demand", "WRPUPUS2", "Total petroleum demand (product supplied)", "million barrels/day", "flow", "How much oil product the US consumed that week (a close stand-in for demand).", "The cleanest weekly read on whether people and businesses are using more or less fuel."),
]
EVENTS = [  # date, short title, what happened (facts, with hedged causes)
    ("1990-10-11", "Gulf War shock", "Iraq invaded Kuwait in August 1990. Oil roughly doubled in a few months, from about $20 to above $40 a barrel."),
    ("1998-12-10", "Asian crisis glut", "Weak Asian demand and rising supply pushed oil to about $11 a barrel, among the lowest prices in decades once inflation is counted."),
    ("2008-07-03", "The 2008 peak", "Oil peaked near $145 in July 2008, then fell by about three-quarters in six months as the financial crisis cut demand."),
    ("2014-11-28", "The shale price war", "OPEC chose not to cut output while US shale boomed. Prices fell from over $100 in mid-2014 to under $30 by early 2016."),
    ("2020-04-20", "Prices below zero", "Pandemic lockdowns emptied roads and airports, and storage filled. On April 20, 2020 the front-month WTI futures contract settled below zero for the first time."),
    ("2022-03-08", "Russia-Ukraine", "After Russia invaded Ukraine in February 2022, sanctions and fears for supply sent Brent above $125 in early March."),
]


def day(iso):
    return (dt.date.fromisoformat(iso) - EPOCH).days


def thin(pts):
    """Daily series: keep the last 3 years in full and the last reading of each week before that."""
    cut = (dt.date.today() - dt.timedelta(days=1095)).isoformat()
    out, wk = [], None
    for i, (d, v) in enumerate(pts):
        if d >= cut:
            out.append((d, v))
        else:
            k = dt.date.fromisoformat(d).isocalendar()[:2]
            nxt = pts[i + 1][0] if i + 1 < len(pts) else None
            if nxt is None or dt.date.fromisoformat(nxt).isocalendar()[:2] != k:
                out.append((d, v))
    return out


def stats(pts):
    last, prev = pts[-1], pts[-2]
    def ago(days):
        tgt = (dt.date.fromisoformat(last[0]) - dt.timedelta(days=days)).isoformat()
        return next((v for d, v in reversed(pts) if d <= tgt), None)
    y0 = last[0][:4] + "-01-01"
    ytd0 = next((v for d, v in reversed(pts) if d < y0), None)
    pct = lambda a, b: round((a / b - 1) * 100, 1) if b and b > 0 else None
    hi = max(pts, key=lambda p: p[1]); lo = min(pts, key=lambda p: p[1])
    yr = [p for p in pts if p[0] >= (dt.date.fromisoformat(last[0]) - dt.timedelta(days=365)).isoformat()]
    return dict(latest=last[1], date=last[0], prev=prev[1], d1=pct(last[1], prev[1]), w1=pct(last[1], ago(7)), m1=pct(last[1], ago(30)), ytd=pct(last[1], ytd0), y1=pct(last[1], ago(365)), y5=pct(last[1], ago(1826)),
                hi=dict(v=hi[1], d=hi[0]), lo=dict(v=lo[1], d=lo[0]), hi52=max(v for _, v in yr), lo52=min(v for _, v in yr))


def eia_api(sid, length=560):
    u = "https://api.eia.gov/v2/seriesid/PET.%s.W?api_key=%s&length=%d" % (sid, EIA_KEY or "DEMO_KEY", length)
    rows = json.loads(ur.urlopen(ur.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())["response"]["data"]
    return sorted((r["period"], float(r["value"])) for r in rows if r.get("value") not in (None, ""))


def eia_html(sid):
    """EIA's public weekly table: one row per month, up to five (week-ending date, value) pairs."""
    import re
    h = ur.urlopen(ur.Request("https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=%s&f=W" % sid, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "ignore")
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", h, re.S):
        m = re.search(r"class='B6'>(?:&nbsp;)*(\d{4})-\w{3}", tr)
        if not m:
            continue
        y = int(m.group(1))
        for md, val in re.findall(r"class='B5'>(\d\d/\d\d)&nbsp;</td>\s*<td class='B3'>([\d,.\-]+)&nbsp;", tr):
            try:
                out.append((dt.date(y, int(md[:2]), int(md[3:])).isoformat(), float(val.replace(",", ""))))
            except ValueError:
                pass
    return sorted(out)[-560:]


def eia(sid):
    order = (eia_api, eia_html) if EIA_KEY else (eia_html, eia_api)
    for fn in order:
        for i in range(2):
            try:
                out = fn(sid)
                if len(out) > 50:
                    return out
            except Exception:
                time.sleep(3 * (i + 1))
    raise RuntimeError("EIA " + sid)


def vs_five_year(pts):
    """Latest weekly value against the average of the same week in each of the previous five years."""
    d0 = dt.date.fromisoformat(pts[-1][0]); vals = []
    for k in range(1, 6):
        tgt = d0 - dt.timedelta(days=365 * k + (k // 4))
        near = min(pts, key=lambda p: abs((dt.date.fromisoformat(p[0]) - tgt).days))
        if abs((dt.date.fromisoformat(near[0]) - tgt).days) <= 4:
            vals.append(near[1])
    return round(sum(vals) / len(vals), 2) if len(vals) >= 3 else None


def quote(sym):
    try:
        r = ur.urlopen(ur.Request("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=5d&interval=1d" % sym, headers={"User-Agent": "Mozilla/5.0"}), timeout=25)
        m = json.loads(r.read())["chart"]["result"][0]["meta"]
        return m.get("regularMarketPrice")
    except Exception:
        return None


def curve(prefix, n=20):
    """Prices for the next n monthly futures contracts (e.g. CLZ26.NYM): the shape tells you whether the market is tight now (backwardation) or well supplied (contango)."""
    t = dt.date.today(); y, m = t.year, t.month; out = []
    for _ in range(n):
        sym = "%s%s%02d.NYM" % (prefix, MONTH_CODE[m - 1], y % 100)
        p = quote(sym)
        if p:
            out.append(dict(c=MONTH_CODE[m - 1] + "%02d" % (y % 100), l=dt.date(y, m, 1).strftime("%b %Y"), p=round(p, 2)))
        m += 1
        if m > 12:
            m, y = 1, y + 1
        time.sleep(0.15)
    return out


def build():
    raw, spot = {}, {}
    old = {}
    p = os.path.join(DATA, "oil.json")
    if os.path.exists(p):
        old = json.load(open(p))
    failed = []
    for key, fid, label, unit, dec in SPOT:
        try:
            pts = economy.fred(fid, "1986-01-01")
            raw[key] = pts
            st = stats(pts)
            view = pts if key in ("gas", "diesel") else thin(pts)
            spot[key] = dict(label=label, unit=unit, dec=dec, **st, t=[day(d) for d, _ in view], v=[round(v, 3) for _, v in view])
        except Exception:
            failed.append(key)
            if key in (old.get("spot") or {}):
                spot[key] = old["spot"][key]
        time.sleep(0.2)
    # real (inflation-adjusted) WTI, in today's dollars, using the CPI series already built for the dollar page
    real = None
    try:
        D = json.load(open(os.path.join(DATA, "dollar100.json")))
        cpi = dict(zip(D["t"], D["cpi"])); ct = sorted(cpi); last_cpi = cpi[ct[-1]]
        wti = raw["wti"]; out = []
        import bisect
        for d, v in thin(wti):
            t = day(d); i = bisect.bisect_right(ct, t) - 1
            if i >= 0 and v > 0:
                out.append((d, v * last_cpi / cpi[ct[i]]))
        if out:
            real = dict(t=[day(d) for d, _ in out], v=[round(v, 2) for _, v in out], hi=dict(zip(("d", "v"), max(out, key=lambda x: x[1]))))
    except Exception:
        real = old.get("real")
    # futures curves
    fut = {}
    for key, pre in (("wti", "CL"), ("brent", "BZ")):
        c = curve(pre)
        fut[key] = c if len(c) >= 4 else (old.get("futures") or {}).get(key, [])
    # weekly EIA
    weekly = {}
    for key, sid, label, unit, kind, what, why in EIA:
        try:
            pts = eia(sid)
            if kind != "level" and unit.startswith("million barrels") and pts[-1][1] > 5000:
                pts = [(d, v / 1000.0) for d, v in pts]   # EIA reports thousand barrels; show millions
            if unit.endswith("/day") and pts[-1][1] > 1000:
                pts = [(d, v / 1000.0) for d, v in pts]
            last, prev = pts[-1], pts[-2]
            a5 = vs_five_year(pts)
            weekly[key] = dict(label=label, unit=unit, kind=kind, what=what, why=why, latest=round(last[1], 2), date=last[0], prev=round(prev[1], 2), a5=a5,
                               vs5=(round(last[1] - a5, 2) if kind == "level" and a5 is not None else round((last[1] / a5 - 1) * 100, 1) if a5 else None),
                               y1=round(next((v for d, v in reversed(pts) if d <= (dt.date.fromisoformat(last[0]) - dt.timedelta(days=360)).isoformat()), last[1]), 2),
                               t=[day(d) for d, _ in pts[-262:]], v=[round(v, 2) for _, v in pts[-262:]])
        except Exception:
            failed.append(key)
            if key in (old.get("weekly") or {}):
                weekly[key] = old["weekly"][key]
        time.sleep(0.6)
    # refining margin: the 3-2-1 crack spread, per barrel, from NYMEX crude, gasoline and heating-oil futures
    crack = None
    try:
        s = {}
        for sym in ("CL=F", "RB=F", "HO=F"):
            s[sym] = dict(history.fetch(sym, "5y")); time.sleep(0.3)
        ks = sorted(set(s["CL=F"]) & set(s["RB=F"]) & set(s["HO=F"]))
        sp = [(d, (2 * s["RB=F"][d] * 42 + s["HO=F"][d] * 42 - 3 * s["CL=F"][d]) / 3) for d in ks if s["CL=F"][d] > 0]
        crack = dict(latest=round(sp[-1][1], 2), date=sp[-1][0], avg5=round(sum(v for _, v in sp) / len(sp), 2), t=[day(d) for d, _ in sp], v=[round(v, 2) for _, v in sp])
        ngv = history.fetch("NG=F", "5y")
    except Exception:
        crack = old.get("crack")
    # how oil has moved with other markets (daily returns, last 90 days) from our stored history
    behave = None
    try:
        o = stored_hist("CL=F")
        if o:
            behave = dict(sp500=corr(o, stored_hist("_GSPC"), 90) if stored_hist("_GSPC") else None, dollar=corr(o, stored_hist("DX-Y.NYB"), 90) if stored_hist("DX-Y.NYB") else None,
                          gold=corr(o, stored_hist("GC=F"), 90) if stored_hist("GC=F") else None)
    except Exception:
        behave = old.get("behave")
    # events: the price on the day, from the raw WTI series
    events = []
    if "wti" in raw:
        w = dict(raw["wti"])
        for d, title, text in EVENTS:
            v = w.get(d) or next((w[k] for k in sorted(w) if k >= d), None)
            events.append(dict(d=d, title=title, text=text, wti=round(v, 2) if v is not None else None))
    # biggest one-day moves
    moves = []
    if "wti" in raw:
        pts = raw["wti"]
        mv = [(pts[i][0], pts[i][1], pts[i][1] / pts[i - 1][1] - 1) for i in range(1, len(pts)) if pts[i - 1][1] > 5 and pts[i][1] > 0]
        moves = [dict(d=d, v=round(v, 2), pct=round(c * 100, 1)) for d, v, c in sorted(mv, key=lambda x: -abs(x[2]))[:6]]
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", spot=spot, real=real, futures=fut, weekly=weekly, crack=crack, behave=behave, events=events, moves=moves, failed=failed,
                source="US Energy Information Administration (via FRED and EIA open data), Yahoo Finance (futures), US Bureau of Labor Statistics (CPI)")


if __name__ == "__main__":
    d = build()
    json.dump(d, open(os.path.join(DATA, "oil.json"), "w"), separators=(",", ":"))
    print("oil: %d KB, failed %s" % (os.path.getsize(os.path.join(DATA, "oil.json")) // 1024, d["failed"]))
    for k, v in d["spot"].items():
        print("  %-7s %8.2f %s  d1 %s m1 %s ytd %s y1 %s" % (k, v["latest"], v["date"], v["d1"], v["m1"], v["ytd"], v["y1"]))
    for k, v in d["weekly"].items():
        print("  %-9s %9.2f %s vs5y %s" % (k, v["latest"], v["date"], v["vs5"]))
    print("futures:", {k: [(c["c"], c["p"]) for c in v][:6] for k, v in d["futures"].items()}, "\ncrack:", d["crack"] and d["crack"]["latest"], "behave:", d["behave"], "\nmoves:", d["moves"][:3])
