"""Country economies for the home-page globe -> data/world/world.json (scores + facts) and data/world/world-series.json (history and IMF projections).
Facts only. Data: IMF World Economic Outlook (DataMapper API) for growth, inflation, unemployment, debt, current account, budget balance, income and population;
our own currency data (currencies.json) for how each country's currency has moved against the dollar. The 0-100 "economic health" score is a transparent
yardstick built from fixed rules (shown in the panel), not a rating, a ranking of investments or a forecast."""
import datetime as dt, json, os, statistics, sys, time
import urllib.request as ur

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
OUT = os.path.join(DATA, "world")
IMF = "https://www.imf.org/external/datamapper/api/v1/"
Y0, Y1 = 2000, 2031
# key: (IMF code, label, unit, decimals, what, why, rule text)
IND = {
    "growth": ("NGDP_RPCH", "Economic growth", "%", 1, "How fast the country's economy grew after inflation (real GDP).", "Growth creates jobs and income. Shrinking or stalled output is the most basic sign of trouble."),
    "inflation": ("PCPIPCH", "Inflation", "%", 1, "How much consumer prices rose over the year (yearly average).", "Moderate inflation (around 2%) is normal. High inflation erodes savings and wages; falling prices can signal weak demand."),
    "unemployment": ("LUR", "Unemployment", "%", 1, "The share of people in the labor force without a job. Reported for fewer countries.", "High unemployment wastes talent and income. Very low can mean a tight labor market."),
    "debt": ("GGXWDG_NGDP", "Government debt", "% of GDP", 0, "Everything the national government owes, compared with a year of the country's output.", "More debt means more of tomorrow's income goes to interest, and less room to respond to a crisis."),
    "ca": ("BCA_NGDPD", "Current account", "% of GDP", 1, "The balance of a country's trade and income with the world. Negative means it borrows from abroad to pay its way.", "Large, lasting deficits make a country depend on foreign lenders, which can end suddenly."),
    "fiscal": ("GGXCNL_NGDP", "Government budget balance", "% of GDP", 1, "Government spending minus revenue in a year. Negative means a deficit.", "Persistent big deficits add to debt and can force higher taxes, cuts or inflation."),
    "gdppc": ("NGDPDPC", "Income per person", "US$", 0, "Economic output per person at market exchange rates.", "A rough guide to average living standards. It is shown for context and is not part of the score."),
    "gdp": ("NGDPD", "Size of economy", "US$ billion", 0, "Total economic output in US dollars.", "Shows how big the economy is. Not part of the score."),
    "pop": ("LP", "Population", "million", 1, "Number of people.", "Context. Not part of the score."),
}
RULES = {
    "growth": ("Growth", 20, [(-4, 0), (0, 35), (2, 65), (4, 90), (6, 100)], "Full marks at 6% or more, 65 at 2%, 35 at 0%, zero at -4% or worse."),
    "inflation": ("Inflation", 20, [(-3, 20), (0, 60), (1, 90), (2, 100), (3, 95), (5, 70), (10, 30), (20, 3), (50, 0)], "Best at 1% to 3%. 70 at 5%, 30 at 10%, near zero at 20% or more. Falling prices also lose points."),
    "unemployment": ("Unemployment", 15, [(3, 100), (4.5, 95), (8, 65), (15, 20), (25, 0)], "Full marks at 3% or less, 65 at 8%, 20 at 15%, zero at 25%."),
    "debt": ("Government debt", 15, [(30, 100), (60, 80), (90, 55), (120, 30), (150, 10), (250, 0)], "Full marks under 30% of GDP, 55 at 90%, 30 at 120%, 10 at 150%."),
    "ca": ("Current account", 10, [(-12, 10), (-6, 45), (-3, 75), (0, 92), (4, 100), (10, 95), (20, 80)], "Best from about 0% to +10% of GDP. 45 at -6%, 10 at -12% or worse."),
    "fiscal": ("Budget balance", 10, [(-12, 10), (-8, 40), (-5, 70), (-2.5, 92), (0, 100), (5, 100)], "Full marks at balance or surplus, 70 at -5% of GDP, 10 at -12%."),
    "currency": ("Currency vs. the dollar", 10, [(-10, 100), (0, 100), (3, 92), (10, 65), (25, 30), (60, 0)], "Based on how much more of the local currency a dollar buys than a year ago. Full marks if it held or rose; 65 at a 10% fall; zero at 60%."),
}


def lin(v, pts):
    if v <= pts[0][0]:
        return pts[0][1]
    if v >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= v <= x1:
            return y0 + (y1 - y0) * (v - x0) / (x1 - x0)


def imf(code):
    for i in range(3):
        try:
            req = ur.Request(IMF + code, headers={"User-Agent": "curl/8.4.0", "Accept": "application/json"})   # the IMF blocks browser-style agents
            return json.loads(ur.urlopen(req, timeout=60).read())["values"][code]
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("IMF " + code)


def state(s):
    return "ok" if s >= 65 else "watch" if s >= 45 else "bad"


def build():
    C = json.load(open(os.path.join(OUT, "countries.json")))
    fx = {}
    try:
        for r in json.load(open(os.path.join(DATA, "currencies.json")))["rows"]:
            fx[r["code"]] = r
    except Exception:
        pass
    ref = dt.date.today().year
    years = list(range(Y0, Y1 + 1))
    raw, failed = {}, []
    old = {}
    ps = os.path.join(OUT, "world-series.json")
    if os.path.exists(ps):
        old = json.load(open(ps)).get("s", {})
    for k, (code, *_r) in IND.items():
        try:
            raw[k] = imf(code)
        except Exception:
            failed.append(k)
        time.sleep(0.4)
    series, countries = {}, {}
    for iso in C:
        ser = {}
        for k in IND:
            d = raw.get(k, {}).get(iso)
            if d:
                ser[k] = [round(float(d[str(y)]), 3) if str(y) in d else None for y in years]
            elif iso in old and k in old[iso] and k in failed:
                ser[k] = old[iso][k]
        if ser:
            series[iso] = ser
    def latest(ser, k):
        a = ser.get(k)
        if not a:
            return None, None
        for y in range(ref, ref - 4, -1):
            if Y0 <= y <= Y1 and a[y - Y0] is not None:
                return a[y - Y0], y
        return None, None
    for iso, c in C.items():
        ser = series.get(iso)
        comps, facts = [], {}
        if ser:
            for k, (label, w, pts, rule) in RULES.items():
                if k == "currency":
                    continue
                v, y = latest(ser, k)
                if v is not None:
                    comps.append(dict(k=k, v=round(v, 2), y=y, s=round(lin(v, pts)), w=w))
            for k in ("gdppc", "gdp", "pop"):
                v, y = latest(ser, k)
                if v is not None:
                    facts[k] = round(v, 2 if k == "pop" else 0)
        cur = None
        for code in c["cur"]:
            r = fx.get(code)
            if code == "USD":
                cur = dict(code="USD", usd=True)
                break
            if r:
                cur = dict(code=code, name=r["name"], per=r["per"], peg=r.get("peg"), quirk=bool(r.get("quirk")), d30=r.get("d30"), ytd=r.get("ytd"), y1=r.get("y1"), spark=r.get("spark"), hist=bool(r.get("hist")))
                break
        if cur and not cur.get("usd") and cur.get("y1") is not None and not cur.get("peg") and not cur.get("quirk"):
            w = RULES["currency"][1]
            comps.append(dict(k="currency", v=cur["y1"], y=ref, s=round(lin(cur["y1"], RULES["currency"][2])), w=w))
        score = None
        if len(comps) >= 4 and any(x["k"] in ("growth", "inflation") for x in comps):
            # 75% weighted average of the readings + 25% the weakest single reading: one bad number drags a score down harder than a good one lifts it
            score = round(0.75 * sum(x["s"] * x["w"] for x in comps) / sum(x["w"] for x in comps) + 0.25 * min(x["s"] for x in comps))
        e = dict(score=score, state=state(score) if score is not None else None, comps=comps, **facts)
        if cur:
            e["cur"] = cur
        countries[iso] = e
    med = {}
    for k in IND:
        vals = [latest(s, k)[0] for s in series.values() if latest(s, k)[0] is not None]
        if vals:
            med[k] = round(statistics.median(vals), 2)
    meta = {k: dict(label=v[1], unit=v[2], dec=v[3], what=v[4], why=v[5]) for k, v in IND.items()}
    rules = {k: dict(label=v[0], w=v[1], rule=v[3]) for k, v in RULES.items()}
    rules["_method"] = "The score is 75% a weighted average of the readings below plus 25% the weakest single reading, so one bad number drags it down harder than a good one lifts it. Missing readings are skipped (at least four are needed)."
    world = dict(generated=dt.datetime.utcnow().isoformat() + "Z", ref_year=ref, meta=meta, rules=rules, median=med, countries=countries, failed=failed,
                 source="IMF World Economic Outlook (DataMapper), our currency data, Natural Earth, NASA Visible Earth")
    return world, dict(years=years, s=series)


if __name__ == "__main__":
    w, s = build()
    os.makedirs(OUT, exist_ok=True)
    json.dump(w, open(os.path.join(OUT, "world.json"), "w"), separators=(",", ":"))
    json.dump(s, open(os.path.join(OUT, "world-series.json"), "w"), separators=(",", ":"))
    sc = sorted([(v["score"], k) for k, v in w["countries"].items() if v["score"] is not None])
    print("world: %d countries, %d scored, failed %s; sizes %d KB + %d KB" % (len(w["countries"]), len(sc), w["failed"], os.path.getsize(os.path.join(OUT, "world.json")) // 1024, os.path.getsize(os.path.join(OUT, "world-series.json")) // 1024))
    print("lowest:", sc[:6], "\nhighest:", sc[-6:])
    for k in ("USA", "DEU", "JPN", "CHN", "ARG", "TUR", "NGA"):
        print(k, w["countries"][k]["score"], [(c["k"], c["v"], c["s"]) for c in w["countries"][k]["comps"]])
