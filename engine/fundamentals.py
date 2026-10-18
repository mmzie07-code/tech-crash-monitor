"""Company fundamentals for the valuation workbench -> data/fundamentals.json
Source: SEC XBRL "frames" (one line item for every filer per call) + our own price history for beta.
Annual flows for the last 4 calendar-year frames; latest balance-sheet items. Values in $ millions (shares in millions).
Set SEC_USER_AGENT to "AppName your-contact@email" (the SEC requires a contact)."""
import datetime as dt, json, math, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = os.environ.get("SEC_USER_AGENT", "TheAnalytic educational-project")
YEARS = ["CY2022", "CY2023", "CY2024", "CY2025"]
INST = ["CY2026Q2I", "CY2026Q1I", "CY2025Q4I", "CY2026Q3I"]   # try newest balance sheet first
_last = [0.0]
NAMES = {}   # cik -> filer name (used to follow companies that reorganized under a new holding company)

FLOWS = {   # key -> candidate XBRL tags, first one with a value wins
    "rev": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet"],
    "opinc": ["OperatingIncomeLoss"],
    "ni": ["NetIncomeLoss", "ProfitLoss"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"],
    "sbc": ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
    "da": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"],
    "interest": ["InterestExpense", "InterestExpenseDebt", "InterestExpenseNonoperating"],
    "buyback": ["PaymentsForRepurchaseOfCommonStock"],
    "dividends": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
}
BALANCE = {
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValueIncludingRestrictedCash"],
    "sti": ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "debt": ["LongTermDebt", "DebtInstrumentCarryingAmount", "LongTermDebtAndCapitalLeaseObligations"],
    "debt_nc": ["LongTermDebtNoncurrent"],
    "debt_c": ["LongTermDebtCurrent", "DebtCurrent"],
    "equity": ["StockholdersEquity"],
}


def get(url, tries=3):
    for i in range(tries):
        wait = 0.12 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            with urlreq.urlopen(urlreq.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}), timeout=90) as r:
                return json.loads(r.read())
        except Exception as e:
            if "404" in str(e):
                return None
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def frame(ns, tag, unit, period):
    j = get("https://data.sec.gov/api/xbrl/frames/%s/%s/%s/%s.json" % (ns, tag, unit, period))
    if not j:
        return {}
    for d in j["data"]:
        NAMES.setdefault(d["cik"], d.get("entityName", ""))
    return {d["cik"]: (d["val"], d["end"]) for d in j["data"]}


def merged(tags, unit, period, ns="us-gaap"):
    """First tag that has a value for each company wins."""
    out = {}
    for t in tags:
        for cik, v in frame(ns, t, unit, period).items():
            out.setdefault(cik, v)
    return out


import re
_STOP = re.compile(r"\b(corporation|corp|incorporated|inc|company|co|ltd|limited|plc|holdings?|group|the|class [a-z]|common stock|sa|nv|ag)\b")
norm = lambda n: re.sub(r"[^a-z0-9]", "", _STOP.sub("", re.sub(r"[.,]", "", (n or "").lower())))


def beta(sym, spx_weekly):
    """Beta vs the S&P 500 from ~3 years of weekly returns (our own price history)."""
    p = os.path.join(DATA, "hist", sym.replace("^", "_") + ".json")
    if not os.path.exists(p):
        return None
    j = json.load(open(p)); closes = dict(zip(j["t"], j["c"]))
    days = sorted(closes)
    wk = {}
    for d in days:
        wk[d // 7] = closes[d]   # last close of each week
    ws = sorted(set(wk) & set(spx_weekly))[-157:]
    if len(ws) < 80:
        return None
    r = [(wk[b] / wk[a] - 1, spx_weekly[b] / spx_weekly[a] - 1) for a, b in zip(ws, ws[1:])]
    mx, my = sum(x for _, x in r) / len(r), sum(y for y, _ in r) / len(r)
    var = sum((x - mx) ** 2 for _, x in r)
    return round(sum((x - mx) * (y - my) for y, x in r) / var, 2) if var else None


def build():
    universe = json.load(open(os.path.join(DATA, "search.json")))["stocks"]
    tickers = get("https://www.sec.gov/files/company_tickers.json")
    cik_of = {}
    for v in tickers.values():
        cik_of.setdefault(v["ticker"].upper().replace(".", "-"), v["cik_str"])
    flows = {k: [merged(tags, "USD", y) for y in YEARS] for k, tags in FLOWS.items()}
    bal = {}
    for k, tags in BALANCE.items():
        bal[k] = {}
        for per in INST:
            for cik, v in merged(tags, "USD", per).items():
                bal[k].setdefault(cik, v)
    shares = {}
    for per in INST:
        for cik, v in frame("dei", "EntityCommonStockSharesOutstanding", "shares", per).items():
            shares.setdefault(cik, v)
    sp = json.load(open(os.path.join(DATA, "hist", "_GSPC.json")))
    spx_weekly = {}
    for d, c in zip(sp["t"], sp["c"]):
        spx_weekly[d // 7] = c
    m = lambda v: None if v is None else round(v / 1e6, 1)
    by_name = {}
    for c in set(flows["rev"][-1]) | set(flows["rev"][-2]):
        by_name.setdefault(norm(NAMES.get(c)), []).append(c)
    out, missing = {}, 0
    for sym, name, sector, cap_b, price, d1 in universe:
        cik = cik_of.get(sym)
        has = lambda c: c in flows["rev"][-1] or c in flows["rev"][-2] or c in flows["ocf"][-1] or c in flows["ocf"][-2]
        if not cik or not has(cik):   # reorganised company: look the history up by name
            cands = by_name.get(norm(name), [])
            cik = cands[0] if len(cands) == 1 else None
        if not cik or not has(cik):
            missing += 1
            continue
        rec = {"cik": cik}
        for k in FLOWS:
            arr = [m(flows[k][i].get(cik, (None,))[0]) for i in range(len(YEARS))]
            if any(v is not None for v in arr):
                rec[k] = arr
        ends = [flows["rev"][i][cik][1] for i in range(len(YEARS)) if cik in flows["rev"][i]]
        if ends:
            rec["fy_end"] = max(ends)
        for k in ("cash", "sti", "equity"):
            if cik in bal[k]:
                rec[k] = m(bal[k][cik][0])
        debt = bal["debt"].get(cik, (None,))[0]
        if debt is None:
            nc, c = bal["debt_nc"].get(cik, (None,))[0], bal["debt_c"].get(cik, (None,))[0]
            debt = (nc or 0) + (c or 0) if (nc is not None or c is not None) else None
        if debt is not None:
            rec["debt"] = m(debt)
        if cik in shares:
            rec["shares"] = m(shares[cik][0])
        b = beta(sym, spx_weekly)
        if b is not None:
            rec["beta"] = b
        if "rev" in rec or "ocf" in rec:
            out[sym] = rec
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", periods=YEARS, units="USD millions (shares in millions)", stocks=out), missing


if __name__ == "__main__":
    t0 = time.time()
    o, missing = build()
    json.dump(o, open(os.path.join(DATA, "fundamentals.json"), "w"), separators=(",", ":"))
    print("fundamentals:", len(o["stocks"]), "companies;", missing, "without SEC data;", round(time.time() - t0), "s;", os.path.getsize(os.path.join(DATA, "fundamentals.json")) // 1024, "KB")
    for s in ["AAPL", "MSFT", "NVDA", "KO", "JPM", "TSLA"]:
        print(s, json.dumps(o["stocks"].get(s))[:330])
