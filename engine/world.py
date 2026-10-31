"""Country economies for the home-page globe -> data/world/world.json (scores + facts) and data/world/world-series.json (history and IMF projections).
Facts only. Data: IMF World Economic Outlook (DataMapper API) for growth, inflation, unemployment, debt, current account, budget balance, income and population;
our own currency data (currencies.json) for how each country's currency has moved against the dollar. The 0-100 "economic health" score is a transparent
yardstick built from fixed rules (shown in the panel), not a rating, a ranking of investments or a forecast.
v2 adds World Bank inputs (interest burden, reserves, foreign-debt payments, governance, life expectancy, income at purchasing-power prices), a "borrowing strength" reading,
four pillars (activity, public finances, external strength, institutions & people) and a confidence flag for countries whose numbers are thin or unreliable."""
import datetime as dt, json, os, statistics, sys, time
import urllib.request as ur

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
WB = "https://api.worldbank.org/v2/country/all/indicator/"
# key: (World Bank code, label, unit, decimals, what, why)
WBIND = {
    "interest": ("GC.XPN.INTP.RV.ZS", "Interest on government debt", "% of revenue", 0, "The share of what the government collects that goes straight to paying interest on its debt.", "Interest is money that cannot fund schools, roads or defense. When it takes a large share, the debt is becoming a burden."),
    "reserves": ("FI.RES.TOTL.MO", "Foreign reserves", "months of imports", 1, "Foreign currency and gold the central bank holds, measured by how many months of imports they could pay for.", "Reserves are a cushion in a crisis. Under 3 months is thin; countries with no reserves run out first when money flees."),
    "extdebt": ("DT.TDS.DECT.EX.ZS", "Foreign debt payments", "% of exports", 0, "Payments on debt owed to foreigners, compared with what the country earns from exports. Reported for developing countries.", "Foreign debt must be paid in foreign money. A high share of export income going to it is a classic warning sign."),
    "gov": ("GOV_WGI_RL.EST", "Rule of law", "index", 2, "World Bank index of how far people trust and follow the rules: courts, contracts, property rights, police. About -2.5 (weak) to +2.5 (strong).", "Investors, businesses and lenders need to trust that contracts hold. It is the best single predictor of how a country handles stress."),
    "geff": ("GOV_WGI_GE.EST", "Government effectiveness", "index", 2, "World Bank index of the quality of public services and how well policy is carried out. About -2.5 to +2.5.", "A government that cannot deliver cannot fix a crisis."),
    "lifeexp": ("SP.DYN.LE00.IN", "Life expectancy", "years", 1, "How long a baby born today is expected to live.", "Health and income show up in how long people live. It captures living standards that GDP misses."),
    "gdppp": ("NY.GDP.PCAP.PP.CD", "Income per person (price-adjusted)", "US$", 0, "Output per person adjusted for what money buys locally (purchasing-power prices).", "Market exchange rates understate what people in poorer countries can buy. This is a fairer guide to living standards."),
}
RESERVE_CCY = {"USD", "EUR", "JPY", "GBP", "CHF"}
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
# key: (label, weight, points, rule text, pillar)
RULES = {
    "growth": ("Growth", 12, [(-4, 0), (0, 35), (2, 65), (4, 90), (6, 100)], "Full marks at 6% or more, 65 at 2%, 35 at 0%, zero at -4% or worse.", "act"),
    "inflation": ("Inflation", 10, [(-3, 20), (0, 60), (1, 90), (2, 100), (3, 95), (5, 70), (10, 30), (20, 3), (50, 0)], "Best at 1% to 3%. 70 at 5%, 30 at 10%, near zero at 20% or more. Falling prices also lose points.", "act"),
    "unemployment": ("Unemployment", 8, [(3, 100), (4.5, 95), (8, 65), (15, 20), (25, 0)], "Full marks at 3% or less, 65 at 8%, 20 at 15%, zero at 25%.", "act"),
    "debt": ("Government debt", 8, [(30, 100), (60, 80), (90, 55), (120, 30), (150, 10), (250, 0)], "Full marks under 30% of GDP, 55 at 90%, 30 at 120%, 10 at 150%.", "fin"),
    "fiscal": ("Budget balance", 6, [(-12, 10), (-8, 40), (-5, 70), (-2.5, 92), (0, 100), (5, 100)], "Full marks at balance or surplus, 70 at -5% of GDP, 10 at -12%.", "fin"),
    "interest": ("Interest on debt", 7, [(3, 100), (8, 85), (15, 60), (25, 30), (40, 5), (60, 0)], "Full marks under 3% of revenue, 60 at 15%, 30 at 25%, near zero at 40% or more.", "fin"),
    "borrow": ("Borrowing strength", 8, None, "How easily the country can fund itself: half rule of law and government effectiveness, a quarter income per person, and a quarter for borrowing in a major world currency (dollar, euro, yen, pound, Swiss franc).", "fin"),
    "ca": ("Current account", 6, [(-12, 10), (-6, 45), (-3, 75), (0, 92), (4, 100), (10, 95), (20, 80)], "Best from about 0% to +10% of GDP. 45 at -6%, 10 at -12% or worse.", "ext"),
    "reserves": ("Foreign reserves", 6, [(0.5, 0), (2, 35), (3, 55), (6, 85), (9, 100)], "Full marks at 9 months of imports or more, 55 at 3 months, 35 at 2, zero at half a month. Countries that borrow in a world currency need fewer.", "ext"),
    "extdebt": ("Foreign debt payments", 4, [(5, 100), (12, 80), (20, 55), (30, 25), (50, 0)], "Full marks under 5% of exports, 55 at 20%, 25 at 30%, zero at 50% or more.", "ext"),
    "currency": ("Currency vs. the dollar", 4, [(-10, 100), (0, 100), (3, 92), (10, 65), (25, 30), (60, 0)], "Based on how much more of the local currency a dollar buys than a year ago. Full marks if it held or rose; 65 at a 10% fall; zero at 60%.", "ext"),
    "govq": ("Governance", 10, [(-2, 0), (-1, 25), (0, 55), (1, 85), (1.8, 100)], "Average of rule of law and government effectiveness (-2.5 to +2.5). Full marks at +1.8, 55 at 0, 25 at -1, zero at -2 or worse.", "inst"),
    "gdppp": ("Income per person (price-adjusted)", 6, [(1500, 0), (5000, 25), (15000, 55), (40000, 85), (80000, 100)], "Full marks at $80,000, 85 at $40,000, 55 at $15,000, 25 at $5,000, zero at $1,500 or less.", "inst"),
    "lifeexp": ("Life expectancy", 5, [(50, 0), (60, 25), (70, 60), (78, 90), (83, 100)], "Full marks at 83 years, 90 at 78, 60 at 70, 25 at 60, zero at 50 or less.", "inst"),
}
PILLARS = {"act": "Activity", "fin": "Public finances", "ext": "External strength", "inst": "Institutions and people"}


def wb(code):
    """Latest World Bank value per country (iso3) -> {iso: (year, value)}."""
    for i in range(3):
        try:
            req = ur.Request(WB + code + "?format=json&date=2015:2026&per_page=20000&mrnev=1", headers={"User-Agent": "curl/8.4.0"})
            rows = json.loads(ur.urlopen(req, timeout=90).read())[1]
            return {r["countryiso3code"]: (int(r["date"]), r["value"]) for r in rows if r["value"] is not None and len(r["countryiso3code"]) == 3}
        except Exception:
            time.sleep(4 * (i + 1))
    raise RuntimeError("World Bank " + code)


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
    wbd, wbp = {}, os.path.join(OUT, "wb.json")
    wbold = json.load(open(wbp)) if os.path.exists(wbp) else {}
    for k, (code, *_r) in WBIND.items():
        try:
            wbd[k] = {iso: [y, v] for iso, (y, v) in wb(code).items()}
        except Exception:
            wbd[k] = wbold.get(k, {}); failed.append(k)
        time.sleep(0.4)
    json.dump(wbd, open(wbp, "w"), separators=(",", ":"))
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
    def wbv(k, iso, maxage=8):
        r = wbd.get(k, {}).get(iso)
        return (r[1], r[0]) if r and ref - r[0] <= maxage else (None, None)
    for iso, c in C.items():
        ser = series.get(iso)
        comps, facts = [], {}
        reserve = any(x in RESERVE_CCY for x in c["cur"])
        def add(k, v, y):
            pts = RULES[k][2]
            comps.append(dict(k=k, v=round(v, 2), y=y, s=round(lin(v, pts)) if pts else round(v), w=RULES[k][1], p=RULES[k][4]))
        if ser:
            for k in ("growth", "inflation", "unemployment", "debt", "ca", "fiscal"):
                v, y = latest(ser, k)
                if v is not None:
                    add(k, v, y)
            for k in ("gdppc", "gdp", "pop"):
                v, y = latest(ser, k)
                if v is not None:
                    facts[k] = round(v, 2 if k == "pop" else 0)
        for k in ("interest", "extdebt"):
            v, y = wbv(k, iso)
            if v is not None:
                add(k, v, y)
        v, y = wbv("reserves", iso)
        if v is not None:
            if reserve:
                v = max(v, 6)                      # a country that borrows in a world currency needs far fewer reserves; floor at "adequate"
            add("reserves", v, y)
        rl, yr = wbv("gov", iso); ge, yg = wbv("geff", iso); pp, yp = wbv("gdppp", iso); le, yl = wbv("lifeexp", iso)
        gq = [x for x in (rl, ge) if x is not None]
        if gq:
            add("govq", sum(gq) / len(gq), yr or yg)
        if pp is not None:
            add("gdppp", pp, yp)
        if le is not None:
            add("lifeexp", le, yl)
        if gq and pp is not None:
            gs = lin(sum(gq) / len(gq), RULES["govq"][2]); ps = lin(pp, RULES["gdppp"][2])
            add("borrow", 0.5 * gs + 0.25 * ps + (25 if reserve else 0), yr or yg)
        facts.update({k: round(v, 2) for k, v in (("gov", rl), ("geff", ge), ("lifeexp", le), ("gdppp", pp)) if v is not None})
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
            add("currency", cur["y1"], ref)
        score, pillars, conf = None, {}, None
        core = [x for x in comps if x["k"] in ("growth", "inflation", "unemployment", "debt", "fiscal", "ca")]
        if len(comps) >= 6 and any(x["k"] in ("growth", "inflation") for x in comps):
            for p in PILLARS:
                cs = [x for x in comps if x["p"] == p]
                if cs:
                    pillars[p] = round(sum(x["s"] * x["w"] for x in cs) / sum(x["w"] for x in cs))
            # 80% weighted average of all readings + 20% the weakest pillar: one badly broken area drags a score down harder than a good one lifts it
            score = round(0.8 * sum(x["s"] * x["w"] for x in comps) / sum(x["w"] for x in comps) + 0.2 * min(pillars.values()))
            # confidence: how complete and how believable the inputs are
            why = []
            if len(comps) < 9: why.append("few readings (%d of 14)" % len(comps))
            if len(pillars) < 4: why.append("a whole area has no data")
            if any(x["y"] < ref - 3 for x in core): why.append("some figures are more than 3 years old")
            infl = next((x["v"] for x in comps if x["k"] == "inflation"), None)
            SEV = "reported growth and prices look far better than its institutions and living standards suggest, so the figures may be unreliable"
            if pillars.get("act", 0) - pillars.get("inst", 100) >= 45: why.append(SEV)
            if cur and cur.get("quirk"): why.append("its official exchange rate is irregular")
            if infl is not None and infl > 60: why.append("inflation is extreme, so figures are unreliable")
            gv = next((x["v"] for x in comps if x["k"] == "govq"), None)
            if gv is not None and gv < -1.3 and (ser is None or len(core) < 5): why.append("weak statistics and weak institutions")
            conf = dict(level="low" if len(why) >= 2 or SEV in why or "inflation is extreme, so figures are unreliable" in why else "medium" if why else "high", why=why)
        e = dict(score=score, state=state(score) if score is not None else None, comps=comps, **facts)
        if pillars:
            e["pillars"] = pillars
        if conf:
            e["conf"] = conf
        if cur:
            e["cur"] = cur
        countries[iso] = e
    med = {}
    for k in IND:
        vals = [latest(s, k)[0] for s in series.values() if latest(s, k)[0] is not None]
        if vals:
            med[k] = round(statistics.median(vals), 2)
    for k in WBIND:
        vals = [r[1] for r in wbd.get(k, {}).values() if ref - r[0] <= 8]
        if vals:
            med[k] = round(statistics.median(vals), 2)
    meta = {k: dict(label=v[1], unit=v[2], dec=v[3], what=v[4], why=v[5]) for k, v in IND.items()}
    meta.update({k: dict(label=v[1], unit=v[2], dec=v[3], what=v[4], why=v[5]) for k, v in WBIND.items()})
    meta["govq"] = dict(label="Governance", unit="index", dec=2, what=WBIND["gov"][4], why=WBIND["gov"][5])
    meta["borrow"] = dict(label="Borrowing strength", unit="of 100", dec=0, what="How easily the country can fund itself: its institutions, its income, and whether it borrows in a major world currency.", why="The US and Japan can carry debt that would sink most countries, because the world wants to lend to them. This reading captures that.")
    rules = {k: dict(label=v[0], w=v[1], rule=v[3], p=v[4]) for k, v in RULES.items()}
    rules["_pillars"] = PILLARS
    rules["_method"] = "The score is 80% a weighted average of every reading below plus 20% the weakest of four areas (activity, public finances, external strength, institutions and people), so one badly broken area drags it down harder than a good one lifts it. Missing readings are skipped (at least six are needed). Countries with thin or unreliable numbers are flagged low confidence."
    world = dict(generated=dt.datetime.utcnow().isoformat() + "Z", ref_year=ref, meta=meta, rules=rules, median=med, countries=countries, failed=failed,
                 source="IMF World Economic Outlook (DataMapper), World Bank (World Development Indicators, Worldwide Governance Indicators), our currency data, Natural Earth, NASA Visible Earth")
    return world, dict(years=years, s=series)


if __name__ == "__main__":
    w, s = build()
    os.makedirs(OUT, exist_ok=True)
    json.dump(w, open(os.path.join(OUT, "world.json"), "w"), separators=(",", ":"))
    json.dump(s, open(os.path.join(OUT, "world-series.json"), "w"), separators=(",", ":"))
    sc = sorted([(v["score"], k) for k, v in w["countries"].items() if v["score"] is not None])
    print("world: %d countries, %d scored, failed %s; sizes %d KB + %d KB" % (len(w["countries"]), len(sc), w["failed"], os.path.getsize(os.path.join(OUT, "world.json")) // 1024, os.path.getsize(os.path.join(OUT, "world-series.json")) // 1024))
    print("lowest:", sc[:6], "\nhighest:", sc[-6:])
    for k in ("USA", "MEX", "DEU", "JPN", "CHN", "ARG", "TUR", "NGA", "ZWE", "CHE", "NOR", "IND"):
        print(k, w["countries"][k]["score"], w["countries"][k].get("pillars"), (w["countries"][k].get("conf") or {}).get("level"))
