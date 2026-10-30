"""AI Watch Index v3 -> data/aiwatch.json. One composite "heat" score (0-100) built from ~35 indicators in five pillars:
  A  AI spending and demand      (hyperscaler capex, cash flow, cloud backlog)
  B  NVIDIA and the chip supply chain (receivables, inventory, commitments, debt, insiders, peers, production)
  C  Financing and credit        (hyperscaler debt, bank lending to non-bank lenders, credit spreads, GPU-financing filings)
  D  Market structure and valuation (the original ten checks plus long-history valuation, margin debt, breadth)
  E  Validated statistical models (the v2 crash-probability model)
Every indicator carries its source, its as-of date, how often it updates, the rule that turns it into heat, and a history where one exists.
Heat is DESCRIPTIVE: pillar A-C weights are judgment (those series are too short to fit), only pillar E and part of D have been tested out of sample.
Needs SEC_USER_AGENT with a contact address (set as a GitHub secret)."""
import datetime as dt, json, math, os, re, sys, time
import urllib.parse, urllib.request as ur
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import sec, economy

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE = os.path.join(DATA, "model_cache")
CIK = {"MSFT": 789019, "GOOGL": 1652044, "AMZN": 1018724, "META": 1326801, "ORCL": 1341439, "NVDA": 1045810, "AMD": 2488, "AVGO": 1730168, "MU": 723125, "CRWV": 1769628}
HYPER = ["MSFT", "GOOGL", "AMZN", "META", "ORCL"]
PEERS = ["AMD", "AVGO", "MU"]
PILLARS = [("A", "AI spending and demand", 22), ("B", "NVIDIA and the chip supply chain", 22), ("C", "Financing and credit", 22), ("D", "Market structure and valuation", 24), ("E", "Validated statistical models", 10)]
QENDS = [(3, 31), (6, 30), (9, 30), (12, 31)]


def lin(v, pts):
    """Piecewise-linear heat from (value, heat) anchor points sorted by value; clamps outside."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    pts = sorted(pts)
    if v <= pts[0][0]:
        return float(pts[0][1])
    if v >= pts[-1][0]:
        return float(pts[-1][1])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= v <= x1:
            return float(y0 + (y1 - y0) * (v - x0) / (x1 - x0))


def pctile(series, v, high_is_hot=True):
    s = [x for x in series if x is not None]
    if len(s) < 12 or v is None:
        return None
    r = sum(1 for x in s if x <= v) / len(s) * 100
    return float(r if high_is_hot else 100 - r)


# ---------- SEC company facts ----------
def companyfacts(sym):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, "cf_%s.json" % sym)
    if os.path.exists(p) and time.time() - os.path.getmtime(p) < 6 * 3600:
        return json.load(open(p))
    j = json.loads(sec.get("https://data.sec.gov/api/xbrl/companyfacts/CIK%010d.json" % CIK[sym]))["facts"]["us-gaap"]
    keep = {}
    for k, v in j.items():
        u = v["units"].get("USD")
        if u:
            keep[k] = [dict(start=r.get("start"), end=r["end"], val=r["val"], form=r.get("form"), filed=r.get("filed")) for r in u if r.get("form") in ("10-Q", "10-K", "10-K/A", "10-Q/A")]
    json.dump(keep, open(p, "w"))
    return keep


def quarters(cf, tags):
    """Quarterly flow values {quarter_end: value}: the tag with the most recent data wins each quarter; older tags fill gaps."""
    out = {}
    cands = []
    for t in tags:
        if t in cf:
            q = sec.quarterly([e for e in cf[t] if e.get("start")])
            if q:
                cands.append((list(q)[-1], q))
    for _, q in sorted(cands, key=lambda x: x[0]):          # oldest-latest first, newest overrides
        for k, v in q.items():
            out[k] = v
    return dict(sorted(out.items()))


def instants(cf, tags):
    """Point-in-time values {date: value}. The tag with the most recent data wins each date; for a date, the most recently filed value wins."""
    cands = []
    for t in tags:
        if t in cf:
            d = {}
            for e in sorted((e for e in cf[t] if not e.get("start")), key=lambda e: e.get("filed") or ""):
                d[e["end"]] = e["val"]
            if d:
                cands.append((max(d), d))
    out = {}
    for _, d in sorted(cands, key=lambda x: x[0]):
        out.update(d)
    return dict(sorted(out.items()))


def cal_q(end):
    """Calendar quarter-end nearest to a (possibly fiscal) period end date."""
    e = dt.date.fromisoformat(end)
    best = min(((dt.date(y, m, d) for y in (e.year - 1, e.year, e.year + 1) for m, d in QENDS)), key=lambda x: abs((x - e).days))
    return best.isoformat()


def ttm(q):
    ks = list(q)
    return [(ks[i], sum(q[k] for k in ks[i - 3:i + 1])) for i in range(3, len(ks))]


def agg_quarterly(per_company):
    """Sum quarterly series across companies on calendar-quarter labels, keeping only quarters where every company reported."""
    by = {}
    for c, q in per_company.items():
        m = {}
        for k, v in q.items():
            m[cal_q(k)] = v
        by[c] = m
    labels = sorted(set.intersection(*[set(m) for m in by.values()])) if by else []
    return {l: sum(by[c][l] for c in by) for l in labels}


def age_days(iso):
    return (dt.date.today() - dt.date.fromisoformat(iso)).days


# ---------- indicator constructor ----------
def ind(pillar, key, name, value, display, unit, asof, source, cadence, heat, rule, detail, hist=None, weight=1.0, kind="data"):
    return dict(pillar=pillar, key=key, name=name, value=None if value is None else round(float(value), 4), display=display, unit=unit, asof=asof, age=age_days(asof) if asof else None,
                source=source, cadence=cadence, heat=None if heat is None else round(float(heat), 1), rule=rule, detail=detail, hist=hist, weight=weight, kind=kind)


def usd_b(v):
    return "$%.1fB" % (v / 1e9) if abs(v) < 1e12 else "$%.2fT" % (v / 1e12)


def pct_s(v, d=0):
    return ("%+." + str(d) + "f%%") % v


# ---------- pillar A: spending and demand ----------
def pillar_a(F):
    out = []
    cap_tags = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]
    ocf_tags = ["NetCashProvidedByUsedInOperatingActivities"]
    rev_tags = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]
    cap = {c: quarters(F[c], cap_tags) for c in HYPER}
    ocf = {c: quarters(F[c], ocf_tags) for c in HYPER}
    rev = {c: quarters(F[c], rev_tags) for c in HYPER}
    A = agg_quarterly(cap); O = agg_quarterly(ocf); R = agg_quarterly(rev)
    keys = sorted(set(A) & set(O) & set(R))
    if len(keys) < 12:
        return out, {}
    def ttm_of(S):
        ks = sorted(S); return {ks[i]: sum(S[k] for k in ks[i - 3:i + 1]) for i in range(3, len(ks))}
    TA, TO, TR = ttm_of({k: A[k] for k in keys}), ttm_of({k: O[k] for k in keys}), ttm_of({k: R[k] for k in keys})
    tk = sorted(TA); last, prev_y = tk[-1], tk[-5]
    asof = last
    cg = (TA[last] / TA[prev_y] - 1) * 100; rg = (TR[last] / TR[prev_y] - 1) * 100; gap = cg - rg
    out.append(ind("A", "capex_gap", "Capex growth vs revenue growth (gap)", gap, "%+.0f pts" % gap, "pts", asof, "SEC XBRL: MSFT, GOOGL, AMZN, META, ORCL", "quarterly", lin(gap, [(-10, 8), (0, 20), (25, 60), (50, 90)]),
                   "Heat 20 at zero gap, 60 at +25 pts, 90 at +50 pts. The AI-bubble question in one number: is spending outrunning the revenue it is meant to earn?",
                   "Hyperscaler capex is %s over the last 12 months (%s vs a year earlier) while their revenue grew %s." % (usd_b(TA[last]), pct_s(cg), pct_s(rg)), hist=[round(TA[k] / 1e9, 1) for k in tk[-16:]]))
    ratio = {k: TA[k] / TR[k] * 100 for k in tk}
    r_now = ratio[last]
    out.append(ind("A", "capex_intensity", "Capex as a share of revenue", r_now, "%.0f%%" % r_now, "%", asof, "SEC XBRL (same five)", "quarterly", pctile(list(ratio.values()), r_now),
                   "Heat = where today sits among the last %d quarters of the group's own history (100 = highest ever recorded)." % len(ratio),
                   "The five spend %.0f cents of every revenue dollar on property and equipment, against a low of %.0f%% and a high of %.0f%% in this history." % (r_now, min(ratio.values()), max(ratio.values())), hist=[round(ratio[k], 1) for k in tk[-16:]]))
    cto = {k: TA[k] / TO[k] * 100 for k in tk if k in TO and TO[k] > 0}
    c_now = cto[last]
    out.append(ind("A", "capex_ocf", "Capex as a share of operating cash flow", c_now, "%.0f%%" % c_now, "%", asof, "SEC XBRL (same five)", "quarterly", max(pctile(list(cto.values()), c_now) or 0, lin(c_now, [(40, 10), (70, 55), (100, 90)])),
                   "Heat is the higher of the history percentile and a floor rule (70% = 55, 100% = 90): above 100% means spending exceeds the cash the business makes.",
                   "At %.0f%%, spending on buildout uses %s of every $100 of operating cash flow. Above 100%% requires borrowing, asset sales or cash on hand." % (c_now, "%.0f" % c_now), hist=[round(cto[k], 1) for k in tk[-16:]]))
    fcf = {k: TO[k] - TA[k] for k in tk if k in TO}
    fk = sorted(fcf)
    f_now, f_prev = fcf[fk[-1]], fcf[fk[-5]]
    ch = (f_now / f_prev - 1) * 100 if f_prev > 0 else None
    out.append(ind("A", "fcf", "Free cash flow after capex (trend)", ch, "%s vs a year ago" % (pct_s(ch) if ch is not None else "n/a"), "%", asof, "SEC XBRL (same five)", "quarterly", lin(ch, [(-60, 95), (-30, 75), (0, 40), (25, 15)]),
                   "Heat 40 if flat, 75 if down 30%, 95 if down 60%. Falling free cash flow while capex climbs is how bubbles become financing problems.",
                   "Combined free cash flow is %s over 12 months (%s a year earlier)." % (usd_b(f_now), usd_b(f_prev)), hist=[round(fcf[k] / 1e9, 1) for k in fk[-16:]]))
    # capex momentum: year-over-year growth of the latest quarter versus the quarter before
    qk = sorted(A)
    g = [(A[qk[i]] / A[qk[i - 4]] - 1) * 100 for i in range(4, len(qk))]
    if len(g) >= 3:
        d1, d2 = g[-1] - g[-2], g[-2] - g[-3]
        decel = d1 <= -5 and d2 <= -5
        h = 75 if decel else 55 if d1 <= -5 else 20
        out.append(ind("A", "capex_momentum", "Capex growth: is it slowing?", g[-1], "%s now, %s last quarter" % (pct_s(g[-1]), pct_s(g[-2])), "%", qk[-1], "SEC XBRL (same five)", "quarterly", h,
                       "Heat 75 if year-over-year growth slowed 5+ pts in each of the last two quarters (the commonly cited demand-cliff signal), 55 if once, else 20.",
                       "Latest quarter's capex grew %s year over year versus %s the quarter before and %s before that." % (pct_s(g[-1]), pct_s(g[-2]), pct_s(g[-3])), hist=[round(x, 1) for x in g[-12:]]))
    # cloud backlog (remaining performance obligations) versus capex growth
    rpo = {c: instants(F[c], ["RevenueRemainingPerformanceObligation"]) for c in HYPER}
    ok = [c for c in HYPER if len(rpo[c]) >= 5]
    if len(ok) >= 3:
        now = sum(list(rpo[c].values())[-1] for c in ok); then = 0
        for c in ok:
            ks = list(rpo[c]); tgt = (dt.date.fromisoformat(ks[-1]) - dt.timedelta(days=365)).isoformat()
            kk = min(ks, key=lambda k: abs((dt.date.fromisoformat(k) - dt.date.fromisoformat(tgt)).days)); then += rpo[c][kk]
        rg2 = (now / then - 1) * 100; diff = cg - rg2
        asof2 = max(list(rpo[c])[-1] for c in ok)
        out.append(ind("A", "backlog", "Cloud backlog growth vs capex growth", rg2, "backlog %s, capex %s" % (pct_s(rg2), pct_s(cg)), "%", asof2, "SEC XBRL RemainingPerformanceObligation (%s)" % ", ".join(ok), "quarterly",
                       lin(diff, [(-40, 10), (0, 40), (40, 85)]),
                       "Heat 40 when backlog grows as fast as capex, 85 when capex outgrows contracted backlog by 40 pts. Backlog is customers' signed commitments, the hardest evidence of real demand.",
                       "Signed-but-not-yet-delivered revenue at %s totals %s, %s over a year; capex is %s." % (", ".join(ok), usd_b(now), pct_s(rg2), pct_s(cg))))
    return out, dict(capex_ttm=TA[last], capex_growth=cg, rev_growth=rg, asof=asof)


# ---------- pillar B: NVIDIA and the chip supply chain ----------
def pillar_b(F, ctx):
    out = []
    n = F["NVDA"]
    rev = quarters(n, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"])
    cogs = quarters(n, ["CostOfRevenue", "CostOfGoodsAndServicesSold"])
    ar = instants(n, ["AccountsReceivableNetCurrent"]); inv = instants(n, ["InventoryNet"]); po = instants(n, ["PurchaseObligation"]); debt = instants(n, ["LongTermDebt", "LongTermDebtNoncurrent"])
    rk = sorted(rev)
    if len(rk) >= 8:
        yoy = [(rev[rk[i]] / rev[rk[i - 4]] - 1) * 100 for i in range(4, len(rk))]
        qoq = (rev[rk[-1]] / rev[rk[-2]] - 1) * 100
        d1 = yoy[-1] - yoy[-2]
        out.append(ind("B", "nvda_rev", "NVIDIA revenue growth (is it decelerating?)", yoy[-1], "%s year over year, %s on the quarter" % (pct_s(yoy[-1]), pct_s(qoq)), "%", rk[-1], "SEC XBRL (NVDA 10-Q)", "quarterly",
                       lin(d1, [(-30, 90), (-10, 65), (0, 35), (15, 15)]),
                       "Heat is set by the change in year-over-year growth versus last quarter: -30 pts = 90, -10 = 65, flat = 35, +15 = 15. NVIDIA's revenue is the clearest read on AI hardware demand.",
                       "Quarterly revenue is %s (%s). Growth moved %+.0f pts from last quarter's %s." % (usd_b(rev[rk[-1]]), pct_s(yoy[-1]), d1, pct_s(yoy[-2])), hist=[round(x, 1) for x in yoy[-16:]]))
        # receivable days
        dso = {k: ar[k] / rev[k] * 91 for k in rk if k in ar and rev[k] > 0}
        if len(dso) >= 12:
            dk = sorted(dso); now = dso[dk[-1]]; jump = now - dso[dk[-2]]
            h = max(pctile(list(dso.values()), now) or 0, lin(jump, [(0, 0), (8, 55), (20, 90)]) or 0)
            out.append(ind("B", "nvda_dso", "NVIDIA receivable days (how long customers take to pay)", now, "%.0f days (%+.0f vs last quarter)" % (now, jump), "days", dk[-1], "SEC XBRL (NVDA)", "quarterly", h,
                           "Heat is the higher of the history percentile and a jump rule (+8 days in a quarter = 55, +20 = 90). Rising receivable days can mean customers are stretching, or that sales are being financed.",
                           "Customers owe NVIDIA %s, equal to %.0f days of sales. It was %.0f days a quarter ago and %.0f at the quietest point on record." % (usd_b(ar[dk[-1]]), now, dso[dk[-2]], min(dso.values())), hist=[round(dso[k], 1) for k in dk[-16:]]))
        invd = {k: inv[k] / cogs[k] * 91 for k in rk if k in inv and k in cogs and cogs[k] > 0}
        if len(invd) >= 12:
            ik = sorted(invd); now = invd[ik[-1]]
            out.append(ind("B", "nvda_inv", "NVIDIA inventory days", now, "%.0f days of cost of sales (%s)" % (now, usd_b(inv[ik[-1]])), "days", ik[-1], "SEC XBRL (NVDA)", "quarterly", pctile(list(invd.values()), now),
                           "Heat = history percentile (100 = most inventory relative to sales in the record). Inventory building faster than sales is an early sign of demand cooling or over-ordering.",
                           "Unsold chips and parts equal %.0f days of sales, versus a range of %.0f to %.0f days over the record." % (now, min(invd.values()), max(invd.values())), hist=[round(invd[k], 1) for k in ik[-16:]]))
        if po:
            pk = sorted(po); ttm_rev = sum(rev[k] for k in rk[-4:]); ratio = po[pk[-1]] / ttm_rev * 100
            series = []
            for k in pk:
                rr = [rev[x] for x in rk if x <= k][-4:]
                if len(rr) == 4:
                    series.append(po[k] / sum(rr) * 100)
            out.append(ind("B", "nvda_commit", "NVIDIA supply commitments vs sales", ratio, "%s committed, %.0f%% of annual sales" % (usd_b(po[pk[-1]]), ratio), "%", pk[-1], "SEC XBRL PurchaseObligation (NVDA)", "quarterly", pctile(series, ratio),
                           "Heat = history percentile of purchase commitments relative to the last year's sales. Big commitments to suppliers are a bet that demand keeps growing.",
                           "NVIDIA has committed %s to suppliers (about %.0f%% of its last four quarters' revenue)." % (usd_b(po[pk[-1]]), ratio), hist=[round(x, 1) for x in series[-16:]]))
    if len(debt) >= 6:
        dk = sorted(debt); now, prev = debt[dk[-1]], debt[dk[-2]]; ch = now - prev
        out.append(ind("B", "nvda_debt", "NVIDIA borrowing", ch, "%s debt, %s vs last quarter" % (usd_b(now), ("+" if ch >= 0 else "-") + usd_b(abs(ch))), "USD", dk[-1], "SEC XBRL (NVDA)", "quarterly",
                       lin(ch / 1e9, [(0, 15), (5, 50), (20, 85)]),
                       "Heat 15 if flat, 50 if debt rose $5B in a quarter, 85 if $20B. NVIDIA has long been net cash; new borrowing by the main supplier is notable, because it can mean funding customers or buybacks beyond cash flow.",
                       "Long-term debt moved from %s to %s." % (usd_b(prev), usd_b(now)), hist=[round(debt[k] / 1e9, 1) for k in dk[-12:]]))
    # chip peers
    pr = {c: quarters(F[c], ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]) for c in PEERS}
    ok = [c for c in PEERS if len(pr[c]) >= 8]
    if ok:
        g = []
        for c in ok:
            ks = sorted(pr[c]); g.append((pr[c][ks[-1]] / pr[c][ks[-5]] - 1) * 100)
        avg = float(np.mean(g)); asof = max(sorted(pr[c])[-1] for c in ok)
        out.append(ind("B", "peers", "AI chip peers' revenue growth (AMD, Broadcom, Micron)", avg, "%s average (%s)" % (pct_s(avg), ", ".join("%s %s" % (c, pct_s(x)) for c, x in zip(ok, g))), "%", asof, "SEC XBRL", "quarterly",
                       lin(avg, [(0, 70), (15, 40), (40, 25), (80, 45)]),
                       "A U-shape: heat is high if peers' growth has stalled (the buildout is slowing) and rises again if it is extreme (an overheated cycle). 15-40% growth is the calm middle.",
                       "Latest-quarter revenue growth over a year earlier for the other AI-exposed chip makers."))
    # NVIDIA in the market
    try:
        c = json.load(open(os.path.join(DATA, "search.json")))["stocks"]; tot = sum(r[3] or 0 for r in c); nv = next((r[3] for r in c if r[0] == "NVDA"), None)
        if nv:
            share = nv / tot * 100
            out.append(ind("B", "nvda_share", "NVIDIA's weight in the US stock market", share, "%.1f%% of the combined value of US-listed stocks we track" % share, "%", dt.date.today().isoformat(), "Yahoo (market values)", "daily",
                           lin(share, [(1, 10), (3, 35), (5, 65), (8, 92)]), "Heat 35 at 3%, 65 at 5%, 92 at 8%. When one company carries this much of the index, its fortunes become the market's.",
                           "NVIDIA is %s of %s of total market value in our universe." % ("%.1f%%" % share, "$%.1fT" % (tot / 1000))))
    except Exception:
        pass
    # NVDA price activity from stored history
    try:
        h = json.load(open(os.path.join(DATA, "hist", "NVDA.json"))); c = np.array(h["c"], dtype=float)
        if len(c) > 400:
            ext = np.log(c[-1] / c[-200:].mean()) * 100
            ex_series = [np.log(c[i] / c[i - 200:i].mean()) * 100 for i in range(200, len(c))]
            r3 = (c[-1] / c[-64] - 1) * 100
            vol = np.std(np.diff(np.log(c[-21:]))) * math.sqrt(252) * 100
            out.append(ind("B", "nvda_price", "NVIDIA share price: stretch above its 200-day average", ext, "%+.0f%% above its 200-day average; %s over 3 months; volatility %.0f%%" % (ext, pct_s(r3), vol), "%", dt.date.today().isoformat(), "Stored price history", "daily",
                           pctile(ex_series, ext), "Heat = where today's stretch ranks among the last %d days of NVIDIA's own history." % len(ex_series), "How far the bellwether is running ahead of its trend."))
    except Exception:
        pass
    # insider selling (NVDA only)
    try:
        rows = sec.form4_sales(CIK["NVDA"], 400); today = dt.date.today()
        last = sum(r[1] for r in rows if (today - dt.date.fromisoformat(r[0])).days <= 90); base = sum(r[1] for r in rows if 90 < (today - dt.date.fromisoformat(r[0])).days <= 360) / 3
        bought = sum(r[2] for r in rows if (today - dt.date.fromisoformat(r[0])).days <= 90)
        if base > 0:
            ratio = last / base
            out.append(ind("B", "nvda_insiders", "NVIDIA insider selling", ratio, "$%.0fM sold in 90 days (%.1fx the usual pace); $%.1fM bought" % (last / 1e6, ratio, bought / 1e6), "x", today.isoformat(), "SEC Form 4 (NVDA insiders)", "daily",
                           lin(ratio, [(0.5, 10), (1, 30), (2, 60), (4, 90)]), "Heat 30 at the usual pace, 60 at double, 90 at four times. Insiders sell for many reasons (taxes, scheduled plans), so this is weak evidence alone.",
                           "Insiders' sales over the last 90 days versus their average over the three 90-day periods before."))
    except Exception:
        pass
    return out


# ---------- pillar C: financing and credit ----------
def pillar_c(F):
    out = []
    ltd = {c: instants(F[c], ["LongTermDebt", "LongTermDebtNoncurrent", "DebtLongtermAndShorttermCombinedAmount", "LongTermDebtAndCapitalLeaseObligations"]) for c in HYPER}
    ok = [c for c in HYPER if len(ltd[c]) >= 5 and age_days(max(ltd[c])) < 330]
    if len(ok) >= 3:
        now = then = 0
        for c in ok:
            ks = sorted(ltd[c]); now += ltd[c][ks[-1]]
            tgt = dt.date.fromisoformat(ks[-1]) - dt.timedelta(days=365); kk = min(ks, key=lambda k: abs((dt.date.fromisoformat(k) - tgt).days)); then += ltd[c][kk]
        g = (now / then - 1) * 100; asof = max(max(ltd[c]) for c in ok)
        out.append(ind("C", "hyper_debt", "Hyperscaler long-term debt growth", g, "%s, %s over a year" % (usd_b(now), pct_s(g)), "%", asof, "SEC XBRL (%s)" % ", ".join(ok), "quarterly", lin(g, [(0, 15), (25, 55), (60, 90)]),
                       "Heat 15 flat, 55 at +25%, 90 at +60%. Companies that used to fund buildout from cash are increasingly borrowing.", "Total long-term debt for the group versus a year earlier."))
    iss = {c: quarters(F[c], ["ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromIssuanceOfDebt"]) for c in HYPER}
    ok = [c for c in HYPER if iss[c] and age_days(sorted(iss[c])[-1]) < 330]
    if len(ok) >= 3:
        cur = prev = 0
        for c in ok:
            ks = sorted(iss[c]); cur += sum(iss[c][k] for k in ks[-4:]); prev += sum(iss[c][k] for k in ks[-8:-4])
        asof = max(sorted(iss[c])[-1] for c in ok)
        ratio = cur / prev if prev > 0 else None
        out.append(ind("C", "issuance", "Bonds and loans raised by the hyperscalers (last 12 months)", cur, "%s raised, %s the year before" % (usd_b(cur), usd_b(prev)), "USD", asof, "SEC XBRL cash-flow statements (%s)" % ", ".join(ok), "quarterly",
                       lin(ratio, [(0.5, 15), (1.0, 40), (2.0, 75), (4.0, 95)]), "Heat 40 if borrowing is unchanged, 75 if it doubled, 95 if it quadrupled.", "Debt proceeds reported in the cash-flow statements; some companies report only part of their issuance there."))
    # bank lending to non-bank financial institutions (the private-credit and data-center-lender pipeline)
    try:
        s = economy.fred("LNFACBW027SBOG", "2008-01-01"); d, v = s[-1]
        yo = [(s[i][0], (s[i][1] / s[i - 52][1] - 1) * 100) for i in range(52, len(s))]; g = yo[-1][1]
        ann13 = ((v / s[-14][1]) ** 4 - 1) * 100
        out.append(ind("C", "bank_nbfi", "Bank loans to non-bank lenders (the private-credit pipeline)", g, "%s, %s over a year (%s annualized over 13 weeks)" % ("$%.0fB" % v, pct_s(g, 1), pct_s(ann13, 0)), "%", d, "Federal Reserve H.8 via FRED (LNFACBW027SBOG)", "weekly",
                       pctile([x[1] for x in yo], g), "Heat = where the year-over-year growth ranks since 2009. Banks lending to private-credit funds, REITs and other lenders is a main channel through which GPU and data-center financing reaches the economy.",
                       "Loans from US commercial banks to non-depository financial institutions.", hist=[round(x[1], 1) for x in yo[-60::4]]))
    except Exception:
        pass
    try:
        s = economy.fred("BUSLOANS", "2008-01-01"); d, v = s[-1]
        yo = [(s[i][0], (s[i][1] / s[i - 12][1] - 1) * 100) for i in range(12, len(s))]; g = yo[-1][1]
        out.append(ind("C", "ci_loans", "Bank commercial and industrial loans", g, "%s over a year" % pct_s(g, 1), "%", d, "Federal Reserve via FRED (BUSLOANS)", "monthly", pctile([x[1] for x in yo], g),
                       "Heat = history percentile since 2009 of yearly growth.", "Business borrowing from banks, a broad measure of how freely credit is flowing."))
    except Exception:
        pass
    try:
        s = economy.fred("DRTSCILM", "2000-01-01"); d, v = s[-1]
        out.append(ind("C", "sloos", "Banks tightening loan standards (large firms)", v, "net %.0f%% of banks tightening" % v, "%", d, "Fed senior loan officer survey (DRTSCILM)", "quarterly",
                       lin(v, [(-20, 70), (0, 40), (25, 60), (50, 95)]), "A U-shape: standards loosening a lot (-20) is a late-cycle sign (70), standards tightening hard (+50) means credit is already pulling back (95).", "Net share of banks reporting tighter standards on loans to large and mid-size businesses."))
    except Exception:
        pass
    try:
        s = economy.fred("BAMLC0A4CBBB", "2023-11-01"); d, v = s[-1]; hist60 = s[-61][1] if len(s) > 61 else None; chg = v - hist60 if hist60 is not None else 0
        tight = lin(v, [(0.9, 85), (1.2, 65), (1.6, 40), (2.5, 55), (4.0, 90)])
        out.append(ind("C", "bbb", "Investment-grade (BBB) corporate bond spread", v, "%.2f points over Treasuries; %+.2f over 60 days" % (v, chg), "pts", d, "ICE BofA via FRED (BAMLC0A4CBBB)", "daily", max(tight, lin(chg, [(0, 0), (0.3, 70), (0.8, 95)]) or 0),
                       "Heat is the higher of two rules: spreads historically tight (1.0 = 75, 1.6 = 40: priced for perfection) or widening fast (+0.3 in 60 days = 70). BBB is where many hyperscaler bonds sit.", "Extra yield investors demand for mid-grade corporate bonds. FRED carries about three years of this series.", hist=[round(x[1], 2) for x in s[-250::5]]))
    except Exception:
        pass
    return out


def fts(q, forms, start, end, size=0):
    url = "https://efts.sec.gov/LATEST/search-index?" + urllib.parse.urlencode({"q": q, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": end})
    return json.loads(sec.get(url))["hits"]


FIN_QUERIES = ['"GPU" "credit agreement"', '"GPUs" "senior notes"', '"GPU" "term loan"', '"GPU" "delayed draw"', '"GPUs" "collateral"', '"graphics processing units" "credit facility"', '"GPU-backed"', '"GPUs" "securitization"']
FORMS = "8-K,424B2,424B3,424B5,S-3ASR,S-1"


def filings_activity():
    """SEC full-text search: how many filing-mentions pair GPUs with debt financing in the latest 90 days versus the four 90-day windows before.
    (The search syntax cannot combine OR groups, so eight phrase pairs are searched and their hit counts added.)"""
    today = dt.date.today(); counts = []
    for i in range(0, 5):
        end = today - dt.timedelta(days=90 * i); start = end - dt.timedelta(days=89)
        counts.append(sum(fts(q, FORMS, start.isoformat(), end.isoformat())["total"]["value"] for q in FIN_QUERIES))
    recent = []
    for q in ('"GPU-backed"', '"GPUs" "collateral"', '"GPU" "delayed draw"', '"graphics processing units" "credit facility"', '"GPU" "term loan"'):
        recent += fts(q, FORMS, (today - dt.timedelta(days=45)).isoformat(), today.isoformat())["hits"][:30]
    recent.sort(key=lambda h: h["_source"].get("file_date") or "", reverse=True)
    return counts, recent


def pillar_c_filings():
    out = []; feed = []
    try:
        counts, recent = filings_activity()
        cur, base = counts[0], np.mean(counts[1:]) if len(counts) > 1 else None
        ratio = cur / base if base else None
        out.append(ind("C", "gpu_filings", "SEC filings that pair GPUs with debt financing", cur, "%d filing mentions in the last 90 days (%.1fx the prior four 90-day periods, average %.0f)" % (cur, ratio or 0, base or 0), "count", dt.date.today().isoformat(), "SEC EDGAR full-text search", "daily",
                       lin(ratio, [(0.6, 15), (1.0, 35), (1.6, 65), (2.5, 92)]), "Heat 35 at the usual rate, 65 at 1.6x, 92 at 2.5x. Counts mentions in 8-Ks, prospectus supplements and shelf registrations that put GPUs next to credit agreements, notes, term loans, collateral or securitizations. A rising count means GPU purchases are increasingly debt-financed. Keyword matching is crude: some hits are incidental.",
                       "Companies raising money against or for GPU purchases must say so in filings; this counts them.", hist=list(reversed(counts))))
        seen = set()
        for h in recent:
            s = h["_source"]; name = (s.get("display_names") or ["?"])[0]; key = (name, s.get("file_date"))
            if key in seen:
                continue
            seen.add(key)
            acc = h["_id"].split(":")[0]; fn = h["_id"].split(":")[1] if ":" in h["_id"] else ""
            cik = int((s.get("ciks") or ["0"])[0])
            feed.append(dict(company=re.sub(r"\s*\(CIK.*$", "", name).strip(), form=s.get("form") or s.get("file_type"), date=s.get("file_date"), url="https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, acc.replace("-", ""), fn)))
            if len(feed) >= 14:
                break
    except Exception as e:
        print("filings activity failed:", e)
    return out, feed


ITEM_LABEL = {"1.01": "Signed a major agreement", "2.02": "Earnings", "2.03": "Took on debt or other obligation", "3.02": "Sold unregistered shares", "5.02": "Leadership change", "7.01": "Investor presentation", "8.01": "Other event", "1.02": "Ended a major agreement"}


def recent_filings():
    """Latest notable SEC filings from the AI buildout's key companies."""
    rows = []
    for sym, cik in CIK.items():
        try:
            sub = json.loads(sec.get("https://data.sec.gov/submissions/CIK%010d.json" % cik))["filings"]["recent"]
        except Exception:
            continue
        for form, date, accn, doc, items in zip(sub["form"], sub["filingDate"], sub["accessionNumber"], sub["primaryDocument"], sub.get("items", [""] * len(sub["form"]))):
            if age_days(date) > 45:
                break
            labs = [ITEM_LABEL[i] for i in (items or "").split(",") if i in ITEM_LABEL and i not in ("7.01", "8.01")]
            if form in ("10-Q", "10-K"):
                labs = ["Quarterly report" if form == "10-Q" else "Annual report"]
            if form.startswith("424B") or form in ("S-3ASR", "S-3"):
                labs = ["Offering of securities"]
            if form == "8-K" and not labs:
                continue
            if not labs:
                continue
            rows.append(dict(company=sym, form=form, date=date, what="; ".join(labs), url="https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, accn.replace("-", ""), doc)))
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows[:24]


# ---------- pillar D and E: market structure, v1 checks, v2 model ----------
def pillar_d(checks, F2):
    out = []
    by = {c["id"]: c for c in checks}
    m = {  # id -> (heat function, rule)
        1: (lambda c: lin(c["value"], [(18, 8), (25, 30), (32, 62), (40, 92)]) if c["value"] and "P/E" in c["name"] else (75 if c["status"] == "warn" else 20), "QQQ trailing P/E: 25 = 30, 32 = 62, 40 = 92."),
        2: (lambda c: lin(c["value"], [(-5, 10), (0, 20), (5, 60), (15, 90)]), "Change in cap-weighted vs equal-weighted QQQ over 6 months: +5 pts = 60, +15 pts = 90."),
        5: (lambda c: lin(c["value"], [(-0.5, 10), (0, 20), (0.4, 62), (1.0, 92)]), "10-year yield change over 3 months: +0.4 = 62, +1.0 = 92."),
        6: (lambda c: lin(-c["value"], [(0, 15), (2, 62), (6, 95)]), "Junk bonds vs Treasuries over 20 days: -2% = 62, -6% = 95."),
        7: (lambda c: 75 if c["status"] == "warn" else 20, "Flashing if the VIX is above 1.25x its 50-day average (heat 75), else 20."),
        8: (lambda c: lin(-c["value"], [(0, 15), (7, 62), (15, 92)]), "Distance below the 1-year high: -7% = 62, -15% = 92."),
        10: (lambda c: lin(-c["value"], [(-3, 10), (0, 25), (5, 65), (10, 92)]), "Semiconductors vs the Nasdaq-100 over 10 days: lagging by 5 pts = 65, by 10 = 92. The best-performing signal in the original backtest."),
    }
    for i, (fn, rule) in m.items():
        c = by.get(i)
        if not c or c["status"] == "unknown":
            continue
        try:
            h = fn(c)
        except Exception:
            h = 75 if c["status"] == "warn" else 20
        out.append(ind("D", "v1_%d" % i, c["name"], c["value"], c["detail"][:140], "", dt.date.today().isoformat(), c.get("source", ""), "daily", h, rule, c["detail"], weight=(0.5 if c.get("weight") == 0 else 1.0), kind="v1"))
    if c9 := by.get(9):
        if c9["status"] != "unknown":
            out.append(ind("D", "v1_9", c9["name"], c9["value"], c9["detail"][:140], "x", dt.date.today().isoformat(), c9.get("source", ""), "daily", lin(c9["value"], [(0.5, 10), (1, 30), (1.5, 62), (3, 92)]),
                           "Insider sales (six large AI names) vs their usual pace: 1.5x = 62, 3x = 92.", c9["detail"], kind="v1"))
    # long-history context from the v2 feature set: heat = percentile of today's reading within 1996-today
    names = {"valgdp": ("Stock market value vs the size of the economy", "std devs above its own history", "z", True), "margin": ("Margin-loan growth", "% over 12 months", "%", True),
             "breadth": ("Narrowing of market breadth (cap vs equal weight, 6 months)", "log change", "", True), "run24": ("Two-year run-up of the Nasdaq-100", "log change", "", True), "sadf": ("Explosiveness of the price path (Phillips-Shi-Yu style test)", "test statistic", "", True)}
    if F2 is not None:
        for k, (nm, un, u, hi) in names.items():
            try:
                s = F2[k].dropna(); v = float(s.iloc[-1])
                if len(s) < 500:
                    continue
                h = pctile(list(s.values[::5]), v, hi)
                disp = {"valgdp": "%+.1f standard deviations" % v, "margin": "%+.0f%% over 12 months" % v, "breadth": "%+.3f" % v, "run24": "%+.0f%% over two years" % ((math.exp(v) - 1) * 100), "sadf": "%+.2f" % v}[k]
                out.append(ind("D", "f_" + k, nm, v, disp, u, s.index[-1].date().isoformat(), "Long-history features (Yahoo, FRED)", "daily", h,
                               "Heat = where today's reading ranks among every day since %d (100 = the most extreme ever)." % s.index[0].year, "Does the long record say this reading is unusual? Extreme readings preceded 2000 and 2008 but have also persisted for years.", kind="v2f"))
            except Exception:
                continue
    return out


def pillar_e():
    out = []
    p = os.path.join(DATA, "model", "market_now.json")
    if not os.path.exists(p):
        return out
    m = json.load(open(p))
    out.append(ind("E", "v2_prob", "Crash probability from the volatility model", m["p"], "%.1f%% chance of a 15%% fall in 60 trading days (typical %.1f%%)" % (100 * m["p"], 100 * m["base_rate"]), "prob", m["asof"], "Prediction model v2 (owner page has the equation)", "daily",
                   lin(m["p"], [(0.02, 10), (0.10, 35), (0.20, 65), (0.30, 90)]), "Heat 35 at the typical probability, 65 at 20%, 90 at 30%. Well calibrated in 2003-17; no skill in the 2018-26 holdout, which is why this pillar has the smallest weight.",
                   "Probability from market volatility alone. See the model page for what it can and cannot do.", weight=1.0, kind="v2"))
    out.append(ind("E", "v2_frag", "Bubble-fragility index (21 indicators combined)", m["fragility"], "%.1f%%" % (100 * m["fragility"]), "prob", m["asof"], "Prediction model v2", "daily",
                   lin(m["fragility"], [(0.05, 10), (0.11, 35), (0.20, 65), (0.30, 90)]), "Heat 35 at the typical level, 65 at 20%. Out-of-sample AUC 0.80 in 2003-17 and 0.50 in 2018-26 (chance), so it counts for half.", "The combined reading of valuation, margin debt, breadth, credit, rates and more.", weight=0.5, kind="v2"))
    return out


# ---------- assembly ----------
def update_history(heat, health, pillars):
    """Keep one row per day of the composite and each pillar, so the page can show the trend and what moved since last week and last month."""
    p = os.path.join(DATA, "aiwatch_history.json")
    rows = json.load(open(p)) if os.path.exists(p) else []
    today = dt.date.today().isoformat()
    row = dict(d=today, heat=None if heat is None else round(heat, 1), health=health, p={x["key"]: x["heat"] for x in pillars})
    rows = [r for r in rows if r["d"] != today] + [row]
    rows = rows[-900:]
    json.dump(rows, open(p, "w"), separators=(",", ":"))
    def at(days):
        tgt = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        prev = [r for r in rows if r["d"] <= tgt]
        return prev[-1] if prev else None
    ch = {}
    for name, d in (("d7", 7), ("d30", 30)):
        r0 = at(d)
        if r0 and r0["heat"] is not None and heat is not None:
            ch[name] = dict(since=r0["d"], heat=round(heat - r0["heat"], 1), pillars={k: (None if v is None or r0["p"].get(k) is None else round(v - r0["p"][k], 1)) for k, v in row["p"].items()})
    return dict(changes=ch, series=[dict(d=r["d"], heat=r["heat"]) for r in rows[-400:]])



def zone(health):   # same zones as the site's gauge
    return "Healthy" if health >= 76 else "Caution" if health >= 51 else "Warning" if health >= 26 else "Danger"


def build(checks, F2=None):
    F = {}
    for c in CIK:
        try:
            F[c] = companyfacts(c)
        except Exception as e:
            print("companyfacts failed", c, e)
    inds, ctx = [], {}
    steps = []
    if all(c in F for c in HYPER):
        steps.append(("A", lambda: pillar_a(F)))
    if "NVDA" in F:
        steps.append(("B", lambda: (pillar_b(F, ctx), None)))
    steps.append(("C", lambda: (pillar_c(F), None)))
    feed = []
    for name, fn in steps:
        try:
            r, c = fn()
            inds += r
            if c:
                ctx.update(c)
        except Exception as e:
            print("pillar", name, "failed:", e)
    try:
        r, feed = pillar_c_filings(); inds += r
    except Exception as e:
        print("filings pillar failed:", e)
    try:
        inds += pillar_d(checks, F2)
    except Exception as e:
        print("pillar D failed:", e)
    try:
        inds += pillar_e()
    except Exception as e:
        print("pillar E failed:", e)
    limit = {"daily": 6, "weekly": 21, "monthly": 75, "quarterly": 135}
    for i in inds:
        if i["age"] is not None and i["age"] > limit.get(i["cadence"], 60):
            i["weight"] = 0.0; i["stale"] = True      # too old to count: shown, flagged, not scored
    pillars = []
    comp_num = comp_den = 0.0
    for key, name, w in PILLARS:
        its = [i for i in inds if i["pillar"] == key and i["heat"] is not None and i["weight"] > 0]
        if its:
            tw = sum(i["weight"] for i in its); heat = sum(i["heat"] * i["weight"] for i in its) / tw
            comp_num += heat * w; comp_den += w
        else:
            heat = None
        pillars.append(dict(key=key, name=name, weight=w, heat=None if heat is None else round(heat, 1), n=len(its), n_total=len([i for i in inds if i["pillar"] == key])))
    heat = comp_num / comp_den if comp_den else None
    health = None if heat is None else round(100 - heat)
    for i in inds:
        i["contribution"] = None
    for p in pillars:
        its = [i for i in inds if i["pillar"] == p["key"] and i["heat"] is not None and i["weight"] > 0]
        tw = sum(i["weight"] for i in its) or 1
        for i in its:
            i["contribution"] = round(i["heat"] * i["weight"] / tw * p["weight"] / (comp_den or 1), 2)
    try:
        filings = recent_filings()
    except Exception as e:
        print("recent filings failed:", e); filings = []
    drivers = sorted([i for i in inds if i["heat"] is not None], key=lambda i: -(i["contribution"] or 0))[:6]
    stale = [i["key"] for i in inds if i.get("stale")]
    hist = update_history(heat, health, pillars)
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", changes=hist["changes"], series=hist["series"], heat=None if heat is None else round(heat, 1), health=health, zone=None if health is None else zone(health), coverage=dict(n=len([i for i in inds if i["heat"] is not None and i["weight"] > 0]), total=len(inds)),
                pillars=pillars, indicators=inds, drivers=[i["key"] for i in drivers], stale=stale, filings=filings, financing_filings=feed, context=ctx)


if __name__ == "__main__":
    import checks as CH, mfeatures
    d = CH.load_data(); chk = CH.run_all(d)
    try:
        F2 = mfeatures.index_frame(refresh_days=0)
    except Exception as e:
        print("long-history features unavailable:", e); F2 = None
    r = build(chk, F2)
    json.dump(r, open(os.path.join(DATA, "aiwatch.json"), "w"), separators=(",", ":"))
    print("AI Watch Index: heat %s health %s (%s); %d/%d indicators; stale %s" % (r["heat"], r["health"], r["zone"], r["coverage"]["n"], r["coverage"]["total"], r["stale"]))
    for p in r["pillars"]:
        print("  %s %-34s weight %2d heat %s (%d/%d)" % (p["key"], p["name"], p["weight"], p["heat"], p["n"], p["n_total"]))
    for i in r["indicators"]:
        print("   [%s] %-58s heat %5s  asof %s  %s" % (i["pillar"], i["name"][:58], i["heat"], i["asof"], i["display"][:70]))
