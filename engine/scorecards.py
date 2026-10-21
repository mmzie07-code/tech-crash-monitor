"""Company scorecards -> <out>/<SYM>.json for every company with filing data. Built when the site is assembled, from the latest data.
Each file holds: five 0-100 scores ranked against the company's own sector (value, growth, profitability, health, payouts), a short rule-based summary,
rewards and risks with the numbers behind them, and the valuation report's cash-flow model value (base / bear / bull) so the price chart can show it.
Facts and fixed rules only: no AI, no ratings, no price targets.  Usage: python3 engine/scorecards.py [out_dir]"""
import json, math, os, sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SPECIAL = {"financials", "real-estate", "utilities"}          # cash-flow measures don't describe these (same rule as the valuation report)
SECTOR_TG = {"technology": 3.0, "communication": 2.5, "health-care": 2.5, "financials": 2.5, "consumer-discretionary": 2.5, "industrials": 2.5, "consumer-staples": 2.0, "energy": 1.5, "utilities": 2.0, "real-estate": 2.0, "materials": 2.0}
POOL_MIN_CAP_M = 300.0
AXES = [("value", "Value"), ("growth", "Growth"), ("profit", "Profitability"), ("health", "Health"), ("payout", "Payouts")]


def clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def last_i(a):
    for i in range(len(a or []) - 1, -1, -1):
        if a[i] is not None:
            return i
    return -1


def at(a, i):
    return a[i] if a and 0 <= i < len(a) else None


def nz(v):
    return 0.0 if v is None else v


def money(m):
    """$ millions -> '$4.5 billion' / '$850 million'."""
    a = abs(m)
    s = "$%.1f trillion" % (a / 1e6) if a >= 1e6 else "$%.1f billion" % (a / 1e3) if a >= 1e3 else "$%.0f million" % a
    return ("-" if m < 0 else "") + s


# ---------- the valuation report's model, ported line for line from web/js/report.js so the chart matches the report ----------
def model_value(row, F, rf):
    sym, name, sector, cap_b, price = row[0], row[1], row[2], row[3], row[4]
    if sector in SPECIAL:
        return dict(ok=False, note="A cash-flow model doesn't fit this kind of company.")
    rev_a = F.get("rev") or []
    ri = last_i(rev_a)
    if ri < 0:
        return None
    rev = rev_a[ri]
    ocf, capex, sbc = F.get("ocf") or [], F.get("capex") or [], F.get("sbc") or []
    fcf = [(ocf[i] - nz(at(capex, i))) if at(ocf, i) is not None else None for i in range(len(rev_a))]
    fcfa = [None if fcf[i] is None else fcf[i] - (at(sbc, i) if at(sbc, i) is not None else 0) for i in range(len(rev_a))]

    def mg(arr):
        pts = []
        i = len(rev_a) - 1
        while i >= 0 and len(pts) < 2:
            if arr[i] is not None and rev_a[i]:
                pts.append(arr[i] / rev_a[i])
            i -= 1
        return 0.6 * pts[0] + 0.4 * pts[1] if len(pts) == 2 else pts[0] if pts else None

    margin = mg(fcfa)
    if mg(fcf) is None or margin is None:
        return dict(ok=False, note="Cash-flow figures are missing, so a model value can't be built.")
    first = next((i for i, v in enumerate(rev_a) if v is not None and v > 0), None)
    n = ri - first if first is not None else 0
    cagr = (rev / rev_a[first]) ** (1.0 / n) - 1 if n >= 1 and rev_a[first] > 0 else None
    cap_m = cap_b * 1000.0
    shares = cap_m / price
    raw_beta = F.get("beta")
    beta = 0.67 * raw_beta + 0.33 if raw_beta is not None else 1.0
    cash, debt = nz(F.get("cash")) + nz(F.get("sti")), (F.get("debt") or 0.0)
    ii = last_i(F.get("interest") or [])
    interest = F["interest"][ii] if ii >= 0 else None
    g1 = max(-0.1, min(0.4, cagr if cagr is not None else 0.05))
    kd = max(rf, min(rf + 0.04, interest / debt)) if debt > 0 and interest else rf + 0.015
    tg = SECTOR_TG.get(sector, 2.5) / 100.0
    erp, tax = 0.05, 0.21
    ke = rf + beta * erp
    w = cap_m / (cap_m + debt) if debt > 0 else 1.0
    wacc = max(0.06, min(0.15, w * ke + (1 - w) * kd * (1 - tax)))

    def dcf(g1_, margin_, wacc_):
        r, pv_sum, last_f = rev, 0.0, 0.0
        for t in range(1, 8):
            g = g1_ + (tg - g1_) * (t - 1) / 6.0
            r *= 1 + g
            last_f = r * margin_
            pv_sum += last_f / (1 + wacc_) ** t
        tv = last_f * (1 + tg) / max(wacc_ - tg, 0.02)
        return (pv_sum + tv / (1 + wacc_) ** 7 - debt + cash) / shares

    base, bear, bull = dcf(g1, margin, wacc), dcf(g1 - 0.05, margin * 0.85, wacc + 0.01), dcf(g1 + 0.05, margin * 1.1, wacc - 0.005)
    if margin <= 0.005 or base <= 0:
        return dict(ok=False, note="Free cash flow is negative or very small, so a cash-flow model can't value it.", margin=round(margin, 4))
    return dict(ok=True, base=round(base, 2), bear=round(min(bear, base), 2), bull=round(max(bull, base), 2), wacc=round(wacc, 4), g1=round(g1, 4), margin=round(margin, 4), tg=round(tg, 4))


# ---------- company metrics ----------
def metrics(row, F):
    sym, name, sector, cap_b, price = row[0], row[1], row[2], row[3], row[4]
    rev_a = F.get("rev") or []
    ri = last_i(rev_a)
    if ri < 0 or not rev_a[ri] or rev_a[ri] <= 0:
        ri = max(last_i(F.get("ocf") or []), last_i(F.get("ni") or []))   # pre-revenue company: use the latest year with any cash-flow or profit figure
        if ri < 0:
            return None
        rev = 0.0
    else:
        rev = rev_a[ri]
    cap = cap_b * 1000.0
    ni, opinc, ocf = at(F.get("ni"), ri), at(F.get("opinc"), ri), at(F.get("ocf"), ri)
    capex = nz(at(F.get("capex"), ri))
    fcf = ocf - capex if ocf is not None else None
    sbc, div, buy = at(F.get("sbc"), ri), at(F.get("dividends"), ri), at(F.get("buyback"), ri)
    debt, cash = (F.get("debt") or 0.0), nz(F.get("cash")) + nz(F.get("sti"))
    ii = last_i(F.get("interest") or [])
    interest = F["interest"][ii] if ii >= 0 else None
    equity = F.get("equity")
    first = next((i for i, v in enumerate(rev_a) if v is not None and v > 0), None)
    n = ri - first if first is not None else 0
    cagr = (rev / rev_a[first]) ** (1.0 / n) - 1 if n >= 1 and rev > 0 and rev_a[first] > 0 else None
    ni_a = F.get("ni") or []
    ni_first = next((v for v in ni_a if v is not None), None)
    ni_prev = at(ni_a, ri - 1)
    ev = cap + debt - cash
    m = dict(sym=sym, name=name, sector=sector, cap=cap, price=price, rev=rev, ni=ni, opinc=opinc, ocf=ocf, fcf=fcf, sbc=sbc, div=nz(div), buy=nz(buy), debt=debt, cash=cash,
             interest=interest, equity=equity, cagr=cagr, n=n, beta=F.get("beta"), ni_prev=ni_prev)
    m["pe"] = cap / ni if ni and ni > 0 else None
    m["pfcf"] = cap / fcf if fcf and fcf > 0 else None
    m["evebit"] = ev / opinc if opinc and opinc > 0 and ev > 0 else None
    m["pb"] = cap / equity if equity and equity > 0 else None
    m["opm"] = opinc / rev if opinc is not None and rev > 0 else None
    m["fcfm"] = fcf / rev if fcf is not None and rev > 0 else None
    m["roe"] = ni / equity if ni is not None and equity and equity > 0 else None
    m["debt_cover"] = debt / ocf if ocf and ocf > 0 and debt else (0.0 if not debt else None)
    m["int_cov"] = opinc / interest if opinc is not None and interest and interest > 0 else None
    m["payout_yield"] = (m["div"] + m["buy"]) / cap if cap else 0.0
    if ni_first is not None and ni is not None and n >= 1:
        m["ni_growth"] = (ni / ni_first) ** (1.0 / n) - 1 if ni_first > 0 and ni > 0 else (0.5 if ni_first <= 0 < ni else -0.5 if ni <= 0 else None)
    else:
        m["ni_growth"] = None
    return m


def make_ranker(pool, key, reverse=False):
    vals = sorted(v for v in (p.get(key) for p in pool) if v is not None)
    def rank(v):
        if v is None or len(vals) < 8:
            return None
        below = sum(1 for x in vals if x < v) + 0.5 * sum(1 for x in vals if x == v)
        r = 100.0 * below / len(vals)
        return 100.0 - r if reverse else r
    return rank


def wavg(pairs):
    pairs = [(v, w) for v, w in pairs if v is not None]
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if tw else None


def _chk(lst, ok, text, na=False):
    lst.append(dict(ok=bool(ok), t=text, na=bool(na)))


def _score(lst):
    live = [c for c in lst if not c["na"]]
    return dict(checks=lst, score=sum(1 for c in live if c["ok"]), total=len(live))


def build_sections(m, sec, special, md, m2, peer, mv, snap, F, periods, bsr=None, about=None):
    """The full-analysis page: for each section a pass/fail checklist (each check is a plain statement with its numbers) plus the data for its charts."""
    price, out = m["price"], {}
    # ---- valuation ----
    V = []
    if peer:
        _chk(V, price < peer["base"], "Priced at $%.2f, %s the $%.2f it would trade at on its sector's typical multiples" % (price, "below" if price < peer["base"] else "above", peer["base"]))
    else:
        _chk(V, False, "Sector-typical value can't be worked out (it needs positive earnings or cash flow)", na=True)
    for key, label in [("pe", "Price/earnings"), ("pfcf", "Price/free cash flow"), ("evebit", "Enterprise value/operating profit"), ("pb", "Price/book value")]:
        if special and key in ("pfcf", "evebit"):
            continue
        v, med = m.get(key), md.get(key)
        if v is None:
            _chk(V, False, "%s can't be compared (%s)" % (label, "no positive earnings" if key == "pe" else "no positive free cash flow" if key == "pfcf" else "no positive operating profit" if key == "evebit" else "no positive book value"), na=True)
        elif med:
            _chk(V, v < med, "%s of %.1f× is %s its sector's median of %.1f×" % (label, v, "below" if v < med else "above", med))
    if not special:
        if mv and mv.get("ok"):
            _chk(V, price < mv["base"], "Priced at $%.2f, %s the cash-flow model's $%.2f" % (price, "below" if price < mv["base"] else "above", mv["base"]))
        else:
            _chk(V, False, (mv or {}).get("note", "The cash-flow model can't value this company"), na=True)
    out["valuation"] = dict(_score(V), metrics={k: dict(v=m.get(k), med=md.get(k)) for k in ("pe", "pfcf", "evebit", "pb")})
    # ---- past performance ----
    P = []
    if m["cagr"] is not None and m["n"] >= 1:
        _chk(P, m["cagr"] > 0, "Revenue %s %.0f%% a year over %d years" % ("grew" if m["cagr"] > 0 else "shrank", abs(m["cagr"]) * 100, m["n"]))
        if m2.get("cagr") is not None:
            _chk(P, m["cagr"] >= m2["cagr"], "Revenue growth of %.0f%% a year is %s its sector's median of %.0f%%" % (m["cagr"] * 100, "at or above" if m["cagr"] >= m2["cagr"] else "below", m2["cagr"] * 100))
    if m["ni"] is not None:
        _chk(P, m["ni"] > 0, "%s %s last year" % ("Earned" if m["ni"] > 0 else "Lost", money(abs(m["ni"]))))
    if m["ni_growth"] is not None:
        g = m["ni_growth"]
        _chk(P, g > 0, "Net income %s" % ("grew %.0f%% a year" % (g * 100) if g > 0 and g != 0.5 else "turned from a loss to a profit" if g == 0.5 else "fell or stayed negative over the period"))
    if m["opm"] is not None and m2.get("opm") is not None:
        _chk(P, m["opm"] >= m2["opm"], "Operating margin of %.0f%% is %s its sector's median of %.0f%%" % (m["opm"] * 100, "at or above" if m["opm"] >= m2["opm"] else "below", m2["opm"] * 100))
    if m["roe"] is not None:
        _chk(P, m["roe"] >= 0.10, "Return on shareholders' equity is %.0f%% (a healthy level is 10%% or more)" % (m["roe"] * 100))
    ser = lambda k: [None if v is None else round(v, 1) for v in (F.get(k) or [])]
    fcf_series = [None if (F.get("ocf") or [None] * 4)[i] is None else round(F["ocf"][i] - nz((F.get("capex") or [None] * 4)[i]), 1) for i in range(len(F.get("ocf") or []))]
    beats = [e for e in (snap.get("earnings") or []) if e.get("surprise_pct") is not None][:4]
    out["past"] = dict(_score(P), periods=periods, rev=ser("rev"), ni=ser("ni"), opinc=ser("opinc"), fcf=fcf_series,
                       surprises=[dict(q=e.get("quarter"), eps=e.get("eps"), est=e.get("estimate"), pct=e.get("surprise_pct")) for e in beats])
    # ---- financial health ----
    if sec == "financials":
        out["health"] = dict(checks=[], score=0, total=0, note="Banks, insurers and asset managers run on borrowed money by design, so ordinary debt checks don't apply to them.")
    else:
        H, debt, cash = [], m["debt"], m["cash"]
        _chk(H, debt <= 0 or cash >= debt, "Holds %s of cash against %s of debt" % (money(cash), money(debt)) if debt > 0 else "Has no borrowings in its filings data")
        if m["equity"] and m["equity"] > 0:
            _chk(H, debt <= m["equity"], "Debt is %.0f%% of shareholders' equity" % (debt / m["equity"] * 100) if debt > 0 else "Has no debt against its shareholders' equity")
        else:
            _chk(H, False, "Shareholders' equity is zero or negative (liabilities exceed assets)")
        if debt <= 0:
            _chk(H, True, "No debt to repay")
        elif m["ocf"] and m["ocf"] > 0:
            _chk(H, debt / m["ocf"] <= 4, "Debt equals %.1f years of operating cash flow (4 or fewer is comfortable)" % (debt / m["ocf"]))
        else:
            _chk(H, False, "Operations aren't producing cash to repay %s of debt" % money(debt))
        if m["int_cov"] is not None:
            _chk(H, m["int_cov"] >= 5, "Operating profit covers its interest bill %.1f times (5 or more is comfortable)" % m["int_cov"])
        elif debt <= 0:
            _chk(H, True, "No interest bill")
        if m["fcf"] is not None:
            if m["fcf"] >= 0:
                _chk(H, True, "Free cash flow is positive (%s)" % money(m["fcf"]))
            else:
                runway = cash / -m["fcf"] if cash else 0
                _chk(H, runway >= 3, "Burning %s a year; its cash would last about %.1f years at that pace" % (money(-m["fcf"]), runway))
        extra = {}
        if bsr:
            lastv = lambda k: next((v for v in reversed(bsr.get(k) or []) if v is not None), None)
            ta, ac, tl, lc, eq = lastv("assets"), lastv("assets_c"), lastv("liab"), lastv("liab_c"), lastv("equity_y")
            if ac is not None and lc is not None:
                _chk(H, ac > lc, "Short-term assets (%s) %s its short-term liabilities (%s)" % (money(ac), "exceed" if ac > lc else "don't cover", money(lc)))
            if None not in (ta, ac, tl, lc):
                lta, ltl = ta - ac, tl - lc
                _chk(H, lta > ltl, "Long-term assets (%s) %s its long-term liabilities (%s)" % (money(lta), "exceed" if lta > ltl else "don't cover", money(ltl)))
            hist = []
            for i, per in enumerate(periods):
                d = (bsr.get("debt_y") or [None] * 4)[i] if i < len(bsr.get("debt_y") or []) else None
                e = (bsr.get("equity_y") or [None] * 4)[i] if i < len(bsr.get("equity_y") or []) else None
                if e is not None:
                    hist.append(dict(p=per, debt=d, equity=e, ratio=round(d / e * 100, 1) if d is not None and e > 0 else None))
            rs = [h["ratio"] for h in hist if h["ratio"] is not None]
            if len(rs) >= 2:
                first, lastr = rs[0], rs[-1]
                _chk(H, lastr <= first or lastr < 40, "Debt-to-equity went from %.0f%% to %.0f%% over %d years" % (first, lastr, len(rs)) if lastr != first else "Debt-to-equity has stayed at about %.0f%%" % lastr)
            cash_y = lastv("cash_y")
            extra = dict(debt_equity_history=hist, sheet=dict(assets=ta, cash=cash_y, current_assets=ac, liab=tl, current_liab=lc, equity=eq) if ta is not None else None)
        out["health"] = dict(_score(H), cash=round(cash, 1), debt=round(debt, 1), equity=m["equity"], ocf=m["ocf"], rev=m["rev"], **extra)
    # ---- dividends and buybacks ----
    D, dv, bb = [], m["div"], m["buy"]
    _chk(D, dv > 0, "Pays a dividend (%s last year)" % money(dv) if dv > 0 else "Doesn't pay a dividend")
    if dv > 0:
        yld = dv / m["cap"] * 100
        _chk(D, yld >= 1, "Dividend yield is %.1f%% (1%% or more)" % yld)
        if m["fcf"] is not None and m["fcf"] > 0:
            _chk(D, m["fcf"] >= dv, "Free cash flow (%s) %s the dividend (%s)" % (money(m["fcf"]), "covers" if m["fcf"] >= dv else "does not cover", money(dv)))
        if m["ni"] and m["ni"] > 0:
            _chk(D, dv / m["ni"] <= 0.75, "Pays out %.0f%% of its profit as dividends (75%% or less leaves room)" % (dv / m["ni"] * 100))
        dseries = [v for v in (F.get("dividends") or []) if v is not None and v > 0]
        if len(dseries) >= 2:
            _chk(D, dseries[-1] > dseries[0], "Dividend payments %s over the period (%s to %s)" % ("rose" if dseries[-1] > dseries[0] else "did not rise", money(dseries[0]), money(dseries[-1])))
    _chk(D, bb > 0, "Buys back its own shares (%s last year)" % money(bb) if bb > 0 else "Isn't buying back shares")
    out["dividend"] = dict(_score(D), yield_pct=round(dv / m["cap"] * 100, 2) if m["cap"] else 0, payout_pct=round(dv / m["ni"] * 100) if m["ni"] and m["ni"] > 0 and dv > 0 else None,
                           div=ser("dividends"), buy=ser("buyback"), periods=periods, shareholder_yield=round(m["payout_yield"] * 100, 2),
                           history=[dict(ex=d.get("ex"), amount=d.get("amount"), paid=d.get("paid")) for d in (snap.get("dividends") or [])[:8]])
    # ---- insiders and ownership ----
    ins, inst = snap.get("insider") or {}, snap.get("inst") or {}
    O = []
    net = ins.get("net")
    if net and net[0] is not None:
        _chk(O, net[0] >= 0, "Insiders %s than they sold over the last 3 months (net %s%s shares). Routine, pre-scheduled sales are common, so read the table below." % ("bought more" if net[0] >= 0 else "sold more", "+" if net[0] >= 0 else "-", format(int(abs(net[0])), ",")))
    else:
        _chk(O, False, "Not enough recent insider trading data to say whether insiders have been buying or selling", na=True)
    sh_y = [v for v in ((bsr or {}).get("shares_y") or []) if v]
    if len(sh_y) >= 2:
        g1 = sh_y[-1] / sh_y[-2] - 1
        g3 = sh_y[-1] / sh_y[0] - 1
        _chk(O, g1 <= 0.05, "Average shares outstanding %s %.1f%% in the past year (%+.1f%% over %d years)%s" % ("grew" if g1 > 0 else "fell", abs(g1) * 100, g3 * 100, len(sh_y) - 1, ", which dilutes existing shareholders" if g1 > 0.05 else ""))
    else:
        _chk(O, False, "Share-count history isn't available yet", na=True)
    shares_out = (inst.get("shares_out_m") or F.get("shares") or 0) * 1e6
    ins_pct = round(ins["insider_shares"] / shares_out * 100, 2) if ins.get("insider_shares") and shares_out else None
    inst_pct = inst.get("pct")
    pub_pct = round(max(0.0, 100 - (ins_pct or 0) - (inst_pct or 0)), 2) if inst_pct is not None else None
    big = [dict(form=f.get("form"), date=f.get("date"), what=f.get("what"), url=f.get("url")) for f in (snap.get("filings") or []) if "13" in (f.get("form") or "")][:6]
    out["ownership"] = dict(_score(O), insider_filings_90d=snap.get("insider_filings_90d"), large_holder_filings=big, has_snapshot=bool(snap),
                            tx=(ins.get("tx") or [])[:15], buys=ins.get("buys"), sells=ins.get("sells"), bought=ins.get("bought"), sold=ins.get("sold"), net=ins.get("net"),
                            insider_pct=ins_pct, inst_pct=inst_pct, public_pct=pub_pct, holders=(inst.get("holders") or [])[:15], shares_out_m=inst.get("shares_out_m"))
    # ---- management: named officers and independent governance-risk scores (1 = lowest risk, 10 = highest) ----
    gov = (about or {}).get("gov") or {}
    G = []
    for key, label in [("auditRisk", "Audit risk"), ("boardRisk", "Board-structure risk"), ("compensationRisk", "Executive-pay risk"), ("shareHolderRightsRisk", "Shareholder-rights risk")]:
        if gov.get(key) is not None:
            _chk(G, gov[key] <= 5, "%s is %d out of 10 (lower is better)" % (label, gov[key]))
    off = (about or {}).get("officers") or []
    ceo = next((o for o in off if "ceo" in (o.get("title") or "").lower() or "chief executive" in (o.get("title") or "").lower()), None)
    out["management"] = dict(_score(G), officers=off[:8], gov=gov, ceo=ceo, updates=(snap.get("mgmt_updates") or [])[:6],
                             note=None if off or gov else "Management details are added nightly, largest companies first.")
    # ---- company information ----
    fa = snap.get("facts") or {}
    out["info"] = dict(employees=(about or {}).get("employees"), city=(about or {}).get("city"), country=(about or {}).get("country"), website=(about or {}).get("url"), industry=(about or {}).get("industry") or fa.get("industry"),
                       exchange=fa.get("exchange"), sic=fa.get("sic"), fiscal_year_end=fa.get("fiscal_year_end"), filer=fa.get("filer_category"), state=fa.get("state"), cik=F.get("cik"), fy_end=F.get("fy_end"))
    return out


def build(out_dir):
    fd = json.load(open(os.path.join(DATA, "fundamentals.json")))
    F_all, periods = fd["stocks"], [x.replace("CY", "") for x in fd.get("periods", [])]
    S = json.load(open(os.path.join(DATA, "search.json")))["stocks"]
    try:
        mk = json.load(open(os.path.join(DATA, "markets.json")))
        rf = next(r["last"] for r in mk["macro"] if r["symbol"] == "^TNX") / 100.0
    except Exception:
        rf = 0.045
    rows = {r[0]: r for r in S}
    allm = [m for r in S if r[0] in F_all for m in [metrics(r, F_all[r[0]])] if m]
    pools = {}
    for m in allm:
        if m["cap"] >= POOL_MIN_CAP_M:
            pools.setdefault(m["sector"], []).append(m)
    rankers = {}
    for sec, pool in pools.items():
        rankers[sec] = {k: make_ranker(pool, k, rev) for k, rev in [("pe", True), ("pfcf", True), ("evebit", True), ("pb", True), ("cagr", False), ("ni_growth", False), ("opm", False), ("fcfm", False), ("roe", False), ("debt_cover", True), ("int_cov", False)]}
    import statistics
    med = {sec: {k: statistics.median(v) for k in ("pe", "pfcf", "evebit", "pb") for v in [[p[k] for p in pool if p.get(k)]] if len(v) >= 8} for sec, pool in pools.items()}
    med2 = {sec: {k: statistics.median(v) for k in ("cagr", "opm", "roe", "fcfm") for v in [[p[k] for p in pool if p.get(k) is not None]] if len(v) >= 8} for sec, pool in pools.items()}
    try:
        BS = json.load(open(os.path.join(DATA, "balance.json")))["stocks"]
    except Exception:
        BS = {}
    ABOUT = {}
    adir = os.path.join(DATA, "about")
    if os.path.isdir(adir):
        for f in os.listdir(adir):
            try:
                ABOUT[f[:-5]] = json.load(open(os.path.join(adir, f)))
            except Exception:
                pass
    industry = {k: v.get("industry") for k, v in ABOUT.items()}
    payloads, meta = {}, {}
    os.makedirs(out_dir, exist_ok=True)
    snapdir, histdir = os.path.join(DATA, "snap"), os.path.join(DATA, "hist")
    written = 0
    for m in allm:
        sym, sec = m["sym"], m["sector"]
        R = rankers.get(sec)
        if not R:
            continue
        special = sec in SPECIAL
        # ----- the five axes (0-100, ranked against the sector; 50 is typical) -----
        vkeys = ["pe", "pb"] if special else ["pe", "pfcf", "evebit"]   # banks, insurers, REITs and utilities: earnings and book value instead of cash-flow multiples
        vr = [R[k](m[k]) for k in vkeys]
        vr = [v for v in vr if v is not None]
        value = sum(vr) / len(vr) if len(vr) >= 1 and (len(vr) >= 2 or special) else None
        growth = wavg([(R["cagr"](m["cagr"]), 0.6), (R["ni_growth"](m["ni_growth"]) if m["ni_growth"] is not None else None, 0.4)])
        profit = wavg([(R["opm"](m["opm"]), 0.35), (R["fcfm"](m["fcfm"]), 0.35), (R["roe"](m["roe"]), 0.30)])
        if sec == "financials":
            health = None
        elif m["debt"] <= 0.0 or m["cash"] >= m["debt"]:
            health = 100.0
        else:
            health = wavg([(R["debt_cover"](m["debt_cover"]) if m["debt_cover"] is not None else 0.0, 0.5), (R["int_cov"](m["int_cov"]), 0.5)])
        y = m["payout_yield"]
        cover = (m["fcf"] / (m["div"] + m["buy"])) if m["fcf"] is not None and (m["div"] + m["buy"]) > 0 else None
        payout = 0.0 if y <= 0 else 100.0 * (0.6 * clip(y / 0.06) + 0.4 * (clip((cover - 0.5) / 1.0) if cover is not None else 0.3))
        axes = {"value": value, "growth": growth, "profit": profit, "health": health, "payout": payout}
        na = [k for k, v in axes.items() if v is None]
        axes = {k: (round(v) if v is not None else None) for k, v in axes.items()}
        # ----- extra facts from the nightly snapshot and price history, when we have them -----
        snap, hist = {}, None
        try:
            snap = json.load(open(os.path.join(snapdir, sym + ".json")))
        except Exception:
            pass
        facts = snap.get("facts") or {}
        hi52, avg_vol = facts.get("week52_high"), facts.get("avg_volume")
        drop52 = (m["price"] / hi52 - 1) * 100 if hi52 else None
        # ----- checks: each is good / bad / warn (with the numbers), or skipped -----
        C = []
        def add(kind, order, text):
            C.append(dict(k=kind, o=order, t=text))
        if m["ni"] is not None:
            if m["ni"] < 0:
                add("bad", 1, "Lost %s last year (net income)" % money(-m["ni"]))
            elif m["ni"] > 0 and m["ni_prev"] is not None and m["ni_prev"] > 0 and m["ni"] < 0.7 * m["ni_prev"]:
                add("warn", 6, "Profit fell %.0f%% from the year before" % ((1 - m["ni"] / m["ni_prev"]) * 100))
            elif m["ni"] > 0 and m["rev"] and m["ni"] / m["rev"] >= 0.10:
                add("good", 2, "Profitable: %.0f%% of revenue is left as net profit" % (m["ni"] / m["rev"] * 100))
        if m["fcf"] is not None and not special:
            if m["fcf"] < 0:
                add("bad", 2, "Free cash flow was negative (%s)" % money(m["fcf"]))
            elif m["fcfm"] is not None and m["fcfm"] >= 0.15:
                add("good", 3, "Turns %.0f%% of revenue into free cash flow" % (m["fcfm"] * 100))
        if m["cagr"] is not None and m["n"] >= 2:
            if m["cagr"] >= 0.10:
                add("good", 1, "Revenue has grown %.0f%% a year over %d years" % (m["cagr"] * 100, m["n"]))
            elif m["cagr"] < -0.02:
                add("bad", 3, "Revenue has shrunk %.0f%% a year over %d years" % (-m["cagr"] * 100, m["n"]))
        if m["rev"] < 5:
            add("bad", 1, "Makes under $5 million a year in revenue")
        if value is not None and not special:
            used = [k for k in vkeys if m[k]]
            label = {"pe": "earnings", "pfcf": "free cash flow", "evebit": "operating profit", "pb": "book value"}
            if value >= 70:
                add("good", 4, "Cheaper than %.0f%% of its sector peers (price vs %s)" % (value, label[used[0]] if used else "profits"))
            elif value <= 20:
                add("warn", 4, "More expensive than %.0f%% of its sector peers" % (100 - value))
        if sec != "financials":
            if m["debt"] <= 0 or m["cash"] >= m["debt"]:
                add("good", 5, "Holds more cash (%s) than debt" % money(m["cash"]) if m["debt"] > 0 else "Has no borrowings in its filings data")
            elif m["debt_cover"] is not None and m["debt_cover"] >= 5:
                add("bad", 4, "Debt (%s) equals %.1f years of its operating cash flow" % (money(m["debt"]), m["debt_cover"]))
            elif m["debt_cover"] is None and m["debt"] > 0:
                add("bad", 4, "Owes %s while its operations aren't generating cash" % money(m["debt"]))
            if m["int_cov"] is not None and m["int_cov"] < 3:
                add("warn", 5, "Operating profit covers its interest bill only %.1f times" % m["int_cov"])
        if m["sbc"] and m["rev"] and m["sbc"] / m["rev"] >= 0.10:
            add("bad" if m["sbc"] / m["rev"] >= 0.20 else "warn", 7, "Stock-based pay is %.0f%% of revenue, which dilutes shareholders" % (m["sbc"] / m["rev"] * 100))
        if y >= 0.03:
            add("good", 6, "Returns %.1f%% of its value a year through dividends and buybacks" % (y * 100))
        if m["div"] > 0 and m["fcf"] is not None and m["fcf"] > 0 and m["div"] > m["fcf"]:
            add("warn", 8, "Its dividend (%s) is larger than its free cash flow (%s)" % (money(m["div"]), money(m["fcf"])))
        if m["beta"] is not None:
            if m["beta"] >= 1.8:
                add("warn", 9, "Volatile: its shares have swung about %.1f times as much as the market" % m["beta"])
            elif m["beta"] < 0.3:
                add("good", 7, "Its shares have barely moved with the market (beta %.1f)" % m["beta"])
            elif m["beta"] <= 0.6:
                add("good", 7, "Steady: its shares have moved only %.1f times as much as the market" % m["beta"])
        if drop52 is not None and drop52 <= -40:
            add("warn", 10, "Down %.0f%% from its 52-week high" % -drop52)
        if m["cap"] < 300:
            add("warn", 11, "A very small company (%s): its shares can be hard to trade and swing widely" % money(m["cap"]))
        elif avg_vol and m["price"] and avg_vol * m["price"] < 1e6:
            add("warn", 11, "Thinly traded: under $1 million of shares change hands on a typical day")
        rewards = sorted([c for c in C if c["k"] == "good"], key=lambda c: c["o"])
        risks = sorted([c for c in C if c["k"] in ("bad", "warn")], key=lambda c: (0 if c["k"] == "bad" else 1, c["o"]))
        # ----- one-line read of the profile -----
        have = [(k, v) for k, v in axes.items() if v is not None]
        names = dict(AXES)
        summary = ""
        if len(have) >= 3:
            hi, lo = max(have, key=lambda x: x[1]), min(have, key=lambda x: x[1])
            summary = "Strongest: %s (%d out of 100). Weakest: %s (%d out of 100). Scores compare this company with the other companies in its sector; 50 is typical." % (names[hi[0]], hi[1], names[lo[0]], lo[1])
        mv = model_value(rows[sym], F_all[sym], rf)
        peer = None
        if m["price"] and m["cap"] > 0:
            sh, md, parts = m["cap"] / m["price"], med.get(sec, {}), {}
            if md.get("pe") and m["ni"] and m["ni"] > 0:
                parts["pe"] = md["pe"] * m["ni"] / sh
            if not special and md.get("pfcf") and m["fcf"] and m["fcf"] > 0:
                parts["pfcf"] = md["pfcf"] * m["fcf"] / sh
            if not special and md.get("evebit") and m["opinc"] and m["opinc"] > 0:
                parts["evebit"] = (md["evebit"] * m["opinc"] - m["debt"] + m["cash"]) / sh
            if special and md.get("pb") and m["equity"] and m["equity"] > 0:
                parts["pb"] = md["pb"] * m["equity"] / sh
            parts = {k: round(v, 2) for k, v in parts.items() if v > 0}
            if parts:
                vals = sorted(parts.values())
                peer = dict(base=round(statistics.median(vals), 2), low=vals[0], high=vals[-1], parts=parts, med={k: round(v, 1) for k, v in md.items()})
        payloads[sym] = dict(s=sym, axes=axes, na=na, summary=summary, rewards=[c["t"] for c in rewards[:4]], risks=[dict(t=c["t"], k=c["k"]) for c in risks[:4]],
                             all=[dict(t=c["t"], k=c["k"]) for c in sorted(C, key=lambda c: (c["k"] != "good", c["o"]))], model=mv, peer=peer, peers=len(pools.get(sec, [])),
                             sec=build_sections(m, sec, special, med.get(sec, {}), med2.get(sec, {}), peer, mv, snap, F_all[sym], periods, BS.get(sym), ABOUT.get(sym)))
        meta[sym] = dict(sector=sec, cap=m["cap"], name=m["name"], price=m["price"], pe=m["pe"], pfcf=m["pfcf"], pb=m["pb"], evebit=m["evebit"])
    # second pass: similar companies (same industry first when we know it, then nearest in size within the sector), each with its own scorecard
    by_sec = {}
    for sym in payloads:
        by_sec.setdefault(meta[sym]["sector"], []).append(sym)
    for sym, pl in payloads.items():
        me = meta[sym]
        cands = [x for x in by_sec[me["sector"]] if x != sym and meta[x]["cap"] >= 100]
        cands.sort(key=lambda x: (0 if industry.get(sym) and industry.get(x) == industry.get(sym) else 1, abs(math.log(max(meta[x]["cap"], 1) / max(me["cap"], 1)))))
        pl["similar"] = [dict(s=x, name=meta[x]["name"], cap_b=round(meta[x]["cap"] / 1000, 2), price=meta[x]["price"], axes=payloads[x]["axes"],
                              pe=round(meta[x]["pe"], 1) if meta[x]["pe"] else None, pfcf=round(meta[x]["pfcf"], 1) if meta[x]["pfcf"] else None,
                              pb=round(meta[x]["pb"], 1) if meta[x]["pb"] else None, evebit=round(meta[x]["evebit"], 1) if meta[x]["evebit"] else None) for x in cands[:6]]
        disc = {}
        pool_syms = [x for x in by_sec[me["sector"]] if x != sym and meta[x]["cap"] >= 1000]
        for axis in ("value", "health", "growth", "payout"):
            best = sorted((x for x in pool_syms if payloads[x]["axes"].get(axis) is not None), key=lambda x: (-(payloads[x]["axes"][axis]), 0 if industry.get(sym) and industry.get(x) == industry.get(sym) else 1))
            best.sort(key=lambda x: (0 if industry.get(sym) and industry.get(x) == industry.get(sym) else 1, -payloads[x]["axes"][axis]))
            disc[axis] = [dict(s=x, name=meta[x]["name"], cap_b=round(meta[x]["cap"] / 1000, 2), price=meta[x]["price"], axes=payloads[x]["axes"]) for x in best[:3]]
        pl["discover"] = disc
        json.dump(pl, open(os.path.join(out_dir, sym + ".json"), "w"), separators=(",", ":"))
        written += 1
    return written, len(allm)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DATA, "..", "scorecards_preview")
    w, n = build(out)
    print("scorecards: wrote %d files (%d companies with revenue data) -> %s" % (w, n, out))
