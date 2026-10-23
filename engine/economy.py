"""US economy dashboard -> data/economy.json. Facts only: public FRED series (inflation, Treasury yields and the yield curve, jobs, growth, market stress),
each with its latest reading, change, history, a plain-English explanation, and a status from a simple fixed rule shown on the page. No forecasts, no ratings."""
import datetime as dt, json, os, sys, time
import urllib.request as urlreq

sys.path.insert(0, os.path.dirname(__file__))
import history

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
EPOCH = dt.date(2000, 1, 1)
START = "2000-01-01"


def S(key, fid, group, label, unit, freq, tf, what, why, rule=None, dec=1):
    return dict(key=key, id=fid, group=group, label=label, unit=unit, freq=freq, tf=tf, what=what, why=why, rule=rule, dec=dec)


# tf: "level" = as published, "yoy" = percent change from a year earlier, "diff" = change from the previous period
SERIES = [
    # ---- inflation ----
    S("cpi", "CPIAUCSL", "inflation", "Consumer prices (CPI)", "%", "M", "yoy", "How much more a typical household's shopping basket costs than a year ago. The most-quoted inflation number.", "Inflation eats into what wages and savings can buy. The Federal Reserve aims for 2% a year.", "infl"),
    S("core_cpi", "CPILFESL", "inflation", "Core CPI (no food or energy)", "%", "M", "yoy", "Consumer prices leaving out food and energy, which swing a lot from month to month.", "Shows the underlying trend in prices. Economists watch it to see if inflation is sticking.", "infl"),
    S("pce", "PCEPI", "inflation", "PCE prices", "%", "M", "yoy", "The Commerce Department's price measure, built from what people actually spend. Wider than CPI.", "The Fed's official 2% target is set on this measure.", "infl"),
    S("core_pce", "PCEPILFE", "inflation", "Core PCE (the Fed's favorite)", "%", "M", "yoy", "PCE prices leaving out food and energy.", "The Fed's preferred gauge of underlying inflation when it sets interest rates.", "infl"),
    S("shelter", "CUSR0000SAH1", "inflation", "Shelter (rent and housing costs)", "%", "M", "yoy", "The rent and owner-housing part of CPI, the biggest single piece of the basket.", "Housing is the largest bill for most households, and it changes slowly, so it often keeps CPI high after other prices cool.", None),
    S("food", "CPIUFDSL", "inflation", "Food prices", "%", "M", "yoy", "Grocery and restaurant prices.", "The prices people notice most every week.", None),
    S("energy", "CPIENGSL", "inflation", "Energy prices", "%", "M", "yoy", "Gasoline, electricity and heating fuel.", "Energy is volatile and feeds into the cost of nearly everything else.", None),
    S("wages", "CES0500000003", "inflation", "Average hourly pay", "%", "M", "yoy", "How much average hourly earnings of private-sector workers have grown over the past year.", "Pay growing faster than prices means paychecks are buying more. Slower means they are buying less.", "wages"),
    S("breakeven", "T10YIE", "inflation", "Market's 10-year inflation expectation", "%", "D", "level", "What bond investors are pricing in for average yearly inflation over the next 10 years (the gap between regular and inflation-protected Treasury yields).", "Shows whether markets trust the Fed to keep inflation near target.", None, 2),
    S("mich", "MICH", "inflation", "Consumers' expected inflation (next 12 months)", "%", "M", "level", "What households surveyed by the University of Michigan expect prices to do over the next year.", "Expectations can feed on themselves: if people expect higher prices, they ask for higher pay and raise prices.", None),
    # ---- rates ----
    S("ffr", "DFF", "rates", "Fed funds rate", "%", "D", "level", "The rate banks charge each other for overnight loans. The Federal Reserve's main policy lever.", "It sets the cost of borrowing across the economy: mortgages, credit cards, business loans, and what savings accounts pay.", None, 2),
    S("y3m", "DGS3MO", "rates", "3-month Treasury yield", "%", "D", "level", "What the US government pays to borrow for three months.", "Tracks where markets expect the Fed's rate to be soon.", None, 2),
    S("y2", "DGS2", "rates", "2-year Treasury yield", "%", "D", "level", "What the US government pays to borrow for two years.", "The market's best guess at the Fed's path. It moves first when expectations change.", None, 2),
    S("y10", "DGS10", "rates", "10-year Treasury yield", "%", "D", "level", "What the US government pays to borrow for ten years. The benchmark for mortgages and long-term loans.", "When it rises, borrowing gets more expensive, and stocks (especially growth stocks) face a higher bar.", "y10", 2),
    S("y30", "DGS30", "rates", "30-year Treasury yield", "%", "D", "level", "What the US government pays to borrow for thirty years.", "The longest-term price of money. Rising long yields can signal worries about inflation or government debt.", None, 2),
    S("real10", "DFII10", "rates", "10-year real yield", "%", "D", "level", "The 10-year yield after removing expected inflation (TIPS yield).", "The true cost of long-term money. High real yields squeeze borrowers and pull money out of stocks and gold.", None, 2),
    S("t10y2y", "T10Y2Y", "rates", "Yield curve: 10-year minus 2-year", "pts", "D", "level", "The gap between the 10-year and 2-year yields. Normally positive, because lenders want more for lending longer.", "When it falls below zero (an 'inverted' curve), short-term money pays more than long-term, which has often come before recessions.", "curve", 2),
    S("t10y3m", "T10Y3M", "rates", "Yield curve: 10-year minus 3-month", "pts", "D", "level", "The gap between the 10-year and 3-month yields. The version many researchers (including the New York Fed) use.", "Inversions of this gap have a strong record of coming before US recessions, though with a lag of many months and no guarantee.", "curve", 2),
    S("mortgage", "MORTGAGE30US", "rates", "30-year mortgage rate", "%", "W", "level", "The average rate on a 30-year fixed mortgage (Freddie Mac survey).", "Sets monthly payments for home buyers and drives the housing market.", None, 2),
    S("hy", "BAMLH0A0HYM2", "rates", "Junk-bond spread", "%", "D", "level", "How much extra interest risky ('high-yield') companies pay over Treasuries.", "A widening spread means lenders are getting nervous about companies' ability to repay. A narrow one means they are relaxed.", "hy", 2),
    # ---- jobs ----
    S("unrate", "UNRATE", "jobs", "Unemployment rate", "%", "M", "level", "The share of people in the labor force who want a job and can't find one.", "The simplest read on whether people who want work can get it.", "unrate"),
    S("u6", "U6RATE", "jobs", "Broad unemployment (U-6)", "%", "M", "level", "Counts the unemployed plus discouraged workers and people stuck in part-time work who want full-time.", "A fuller picture of slack in the job market than the headline rate.", None),
    S("payrolls", "PAYEMS", "jobs", "Jobs added per month", "thousand", "M", "diff", "How many jobs the economy added (or lost) in the latest month, from the employer survey.", "The headline jobs report. Steady gains mean employers are still hiring.", "payrolls", 0),
    S("claims", "IC4WSA", "jobs", "Jobless claims (4-week average)", "", "W", "level", "New applications for unemployment benefits each week, averaged over four weeks.", "The fastest signal of layoffs. A sustained rise is often the first sign that the job market is turning.", "claims", 0),
    S("openings", "JTSJOL", "jobs", "Job openings", "thousand", "M", "level", "How many jobs employers are trying to fill (JOLTS survey).", "More openings than unemployed people means workers have leverage; falling openings show hiring is cooling.", None, 0),
    S("lfpr", "CIVPART", "jobs", "Labor force participation", "%", "M", "level", "The share of adults who are working or looking for work.", "Shows how much of the population is in the workforce, which depends on aging, health and confidence in finding work.", None),
    S("sahm", "SAHMREALTIME", "jobs", "Sahm rule recession indicator", "pts", "M", "level", "Compares the recent unemployment rate with its lowest level of the past year. Hitting 0.5 points has signaled the start of every US recession since 1970.", "A rule-of-thumb alarm built from unemployment alone. It has been right on timing so far, but it is a rule, not a law.", "sahm", 2),
    # ---- growth ----
    S("gdp", "A191RL1Q225SBEA", "growth", "Economic growth (real GDP)", "%", "Q", "level", "How fast the economy grew in the latest quarter, as an annualized rate after inflation.", "The broadest measure of whether the economy is expanding or shrinking. Two negative quarters in a row is the popular definition of a recession.", "gdp"),
    S("indpro", "INDPRO", "growth", "Industrial production", "%", "M", "yoy", "Output of factories, mines and utilities compared with a year ago.", "A narrower but timely read on the goods side of the economy.", "indpro"),
    S("retail", "RSAFS", "growth", "Retail sales", "%", "M", "yoy", "Spending in stores and online compared with a year ago (not adjusted for inflation).", "Consumers drive about two-thirds of the US economy. Remember that inflation inflates this number.", None),
    S("sentiment", "UMCSENT", "growth", "Consumer sentiment", "index", "M", "level", "A University of Michigan survey of how households feel about their finances and the economy.", "Confidence can lead spending. It is a mood measure and often swings with prices and politics.", None),
    # ---- stress ----
    S("vix", "VIXCLS", "stress", "Market fear gauge (VIX)", "", "D", "level", "How much stock-market swing options traders are pricing in over the next 30 days.", "Low means calm; spikes come with sell-offs.", "vix"),
    S("nfci", "NFCI", "stress", "Financial conditions (Chicago Fed)", "index", "W", "level", "A weekly index of how easy or hard it is to get credit and finance things. Zero is the long-run average.", "Positive means tighter than average (money is harder to get); negative means looser.", "nfci", 2),
    S("stlfsi", "STLFSI4", "stress", "Financial stress (St. Louis Fed)", "index", "W", "level", "A weekly index built from 18 market measures such as interest rates, yield gaps and volatility. Zero is the long-run average.", "Positive means more stress than normal in financial markets.", "nfci", 2),
]
CURVE = [("1M", "DGS1MO"), ("3M", "DGS3MO"), ("6M", "DGS6MO"), ("1Y", "DGS1"), ("2Y", "DGS2"), ("3Y", "DGS3"), ("5Y", "DGS5"), ("7Y", "DGS7"), ("10Y", "DGS10"), ("20Y", "DGS20"), ("30Y", "DGS30")]


def fred(sid, start=START):
    # FRED drops connections from browser-style User-Agents, so identify as a plain client and fail fast
    for i in range(3):
        try:
            req = urlreq.Request("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, start), headers={"User-Agent": "curl/8.4.0"})
            out = []
            for line in urlreq.urlopen(req, timeout=30).read().decode().splitlines()[1:]:
                d, _, v = line.partition(",")
                try:
                    out.append((d, float(v)))
                except ValueError:
                    pass   # "." = no value that day
            if out:
                return out
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("FRED " + sid)


def transform(pts, tf, freq):
    if tf == "level":
        return pts
    lag = {"M": 12, "Q": 4, "W": 52, "D": 252}[freq] if tf == "yoy" else 1
    if tf == "yoy":
        return [(pts[i][0], (pts[i][1] / pts[i - lag][1] - 1) * 100) for i in range(lag, len(pts)) if pts[i - lag][1]]
    return [(pts[i][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts))]


def thin(pts, freq):
    """Keep every point for monthly/weekly/quarterly series; for daily series keep the last 2 years in full and one point a week before that."""
    if freq != "D":
        return pts
    cut = (dt.date.today() - dt.timedelta(days=730)).isoformat()
    out, last_week = [], None
    for d, v in pts:
        if d >= cut:
            out.append((d, v))
        else:
            wk = dt.date.fromisoformat(d).isocalendar()[:2]
            if wk != last_week:
                out.append((d, v))
                last_week = wk
    return out


def day(iso):
    return (dt.date.fromisoformat(iso) - EPOCH).days


def status(rule, v, extra=None):
    """Returns (state, short rule text). State: ok / watch / bad. Fixed, simple thresholds, shown on the page; they are yardsticks, not forecasts."""
    if v is None or rule is None:
        return None, None
    if rule == "infl":
        return ("ok" if v <= 2.5 else "watch" if v <= 3.5 else "bad"), "Healthy: at or under 2.5% (near the Fed's 2% goal). Watch: 2.5% to 3.5%. Strained: over 3.5%."
    if rule == "wages":
        cpi = (extra or {}).get("cpi")
        if cpi is None:
            return None, None
        return ("ok" if v >= cpi else "watch" if v >= cpi - 1 else "bad"), "Healthy: pay growth at or above consumer-price inflation (paychecks keep up). Watch: up to 1 point below. Strained: more than 1 point below."
    if rule == "y10":
        return ("ok" if v < 4 else "watch" if v < 5 else "bad"), "Healthy: under 4%. Watch: 4% to 5%. Strained: over 5% (borrowing is expensive across the economy)."
    if rule == "curve":
        return ("ok" if v > 0.25 else "watch" if v > -0.25 else "bad"), "Healthy: more than 0.25 points above zero. Watch: within 0.25 of zero. Strained: inverted by more than 0.25."
    if rule == "hy":
        return ("ok" if v < 4 else "watch" if v < 6 else "bad"), "Healthy: under 4 points. Watch: 4 to 6. Strained: over 6 (lenders are demanding a lot extra)."
    if rule == "unrate":
        return ("ok" if v <= 4.5 else "watch" if v <= 5.5 else "bad"), "Healthy: 4.5% or less. Watch: 4.5% to 5.5%. Strained: over 5.5%."
    if rule == "payrolls":
        a = (extra or {}).get("avg3", v)
        return ("ok" if a >= 100 else "watch" if a >= 0 else "bad"), "Based on the 3-month average. Healthy: at least 100,000 jobs a month. Watch: 0 to 100,000. Strained: losing jobs."
    if rule == "claims":
        return ("ok" if v < 250000 else "watch" if v < 300000 else "bad"), "Healthy: under 250,000 a week. Watch: 250,000 to 300,000. Strained: over 300,000."
    if rule == "sahm":
        return ("ok" if v < 0.3 else "watch" if v < 0.5 else "bad"), "Healthy: under 0.3. Watch: 0.3 to 0.5. Strained: 0.5 or more (the recession signal)."
    if rule == "gdp":
        return ("ok" if v >= 2 else "watch" if v >= 0 else "bad"), "Healthy: growing at 2% or faster. Watch: 0% to 2%. Strained: shrinking."
    if rule == "indpro":
        return ("ok" if v >= 1 else "watch" if v >= -1 else "bad"), "Healthy: output up 1% or more on a year. Watch: between -1% and +1%. Strained: down more than 1%."
    if rule == "vix":
        return ("ok" if v < 20 else "watch" if v < 30 else "bad"), "Healthy: under 20. Watch: 20 to 30. Strained: over 30."
    if rule == "nfci":
        return ("ok" if v < 0 else "watch" if v < 0.5 else "bad"), "Healthy: below zero (looser than average). Watch: 0 to 0.5. Strained: above 0.5 (tight)."
    return None, None


def build():
    old = {}
    p = os.path.join(DATA, "economy.json")
    if os.path.exists(p):
        old = json.load(open(p)).get("items", {})
    items, failed = {}, []
    raw = {}
    for s in SERIES:
        try:
            pts = fred(s["id"])
            raw[s["key"]] = pts
        except Exception:
            failed.append(s["key"])
            if s["key"] in old:
                items[s["key"]] = old[s["key"]]   # keep last good copy
            time.sleep(0.3)
            continue
        time.sleep(0.2)
    vals = {}
    for s in SERIES:
        if s["key"] not in raw:
            continue
        pts = transform(raw[s["key"]], s["tf"], s["freq"])
        if len(pts) < 3:
            continue
        vals[s["key"]] = pts[-1][1]
    for s in SERIES:
        if s["key"] not in raw:
            continue
        pts = transform(raw[s["key"]], s["tf"], s["freq"])
        if len(pts) < 3:
            continue
        last, prev = pts[-1], pts[-2]
        yr = next((v for d, v in reversed(pts) if d <= (dt.date.fromisoformat(last[0]) - dt.timedelta(days=365)).isoformat()), None)
        extra = {"cpi": vals.get("cpi")}
        if s["key"] == "payrolls":
            extra["avg3"] = sum(v for _, v in pts[-3:]) / 3
        st, rule_text = status(s["rule"], last[1], extra)
        view = thin(pts, s["freq"])
        # keep monthly and weekly history from 2000; shift nothing: dates are as published
        it = dict(key=s["key"], group=s["group"], label=s["label"], unit=s["unit"], freq=s["freq"], dec=s["dec"], what=s["what"], why=s["why"],
                  latest=round(last[1], 4), date=last[0], prev=round(prev[1], 4), prev_date=prev[0], year_ago=round(yr, 4) if yr is not None else None,
                  state=st, rule=rule_text, t=[day(d) for d, _ in view], v=[round(v, 4) for _, v in view])
        if s["key"] == "payrolls":
            it["avg3"] = round(extra["avg3"], 1)
        # extremes over the stored history, for context
        allv = [v for _, v in pts]
        it["lo"], it["hi"] = round(min(allv), 4), round(max(allv), 4)
        items[s["key"]] = it
    # yield curve snapshots: today, ~1 month ago, ~1 year ago
    curve = None
    try:
        rows = {}
        for lab, sid in CURVE:
            rows[lab] = fred(sid, (dt.date.today() - dt.timedelta(days=420)).isoformat())
            time.sleep(0.2)
        end = min(r[-1][0] for r in rows.values())
        def at(target):
            out = {}
            for lab, r in rows.items():
                out[lab] = next((v for d, v in reversed(r) if d <= target), None)
            return out
        e = dt.date.fromisoformat(end)
        curve = dict(date=end, labels=[l for l, _ in CURVE], now=at(end), month=at((e - dt.timedelta(days=30)).isoformat()), year=at((e - dt.timedelta(days=365)).isoformat()))
    except Exception:
        failed.append("curve")
        if os.path.exists(p):
            curve = json.load(open(p)).get("curve")
    order = [s["key"] for s in SERIES if s["key"] in items]
    states = [items[k]["state"] for k in order if items[k].get("state")]
    summary = dict(ok=states.count("ok"), watch=states.count("watch"), bad=states.count("bad"), n=len(states))
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", order=order, items=items, curve=curve, summary=summary, failed=failed,
                source="Federal Reserve Bank of St. Louis (FRED), using data from the Bureau of Labor Statistics, Bureau of Economic Analysis, Federal Reserve Board, Treasury, University of Michigan, Freddie Mac and ICE")


if __name__ == "__main__":
    d = build()
    json.dump(d, open(os.path.join(DATA, "economy.json"), "w"), separators=(",", ":"))
    print("economy: %d indicators, summary %s, failed %s, %d KB" % (len(d["items"]), d["summary"], d["failed"], os.path.getsize(os.path.join(DATA, "economy.json")) // 1024))
    for k in d["order"]:
        i = d["items"][k]
        print("  %-10s %9s %s  %s" % (k, i["latest"], i["date"], i["state"]))
