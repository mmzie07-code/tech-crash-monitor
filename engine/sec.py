"""SEC EDGAR data (free, no key): hyperscaler capex vs revenue (#3) and insider selling (#9).
Set SEC_USER_AGENT to "YourApp your-contact@email" (SEC requires a contact in the User-Agent)."""
import json, os, time, datetime as dt, xml.etree.ElementTree as ET
import urllib.request as urlreq

UA = os.environ.get("SEC_USER_AGENT", "CrashMonitor personal-research-tool")
UA_OK = "@" in UA  # sec.gov file server 403s any User-Agent without a contact address
CACHE = os.path.join(os.path.dirname(__file__), "..", "data", "cache")
HYPERSCALERS = {"MSFT": 789019, "GOOGL": 1652044, "AMZN": 1018724, "META": 1326801}
INSIDER_CO = {"NVDA": 1045810, "MSFT": 789019, "GOOGL": 1652044, "AMZN": 1018724, "META": 1326801, "AVGO": 1730168}
_last = [0.0]


def get(url, tries=3):
    for i in range(tries):
        wait = 0.13 - (time.time() - _last[0])  # SEC limit: 10 req/s
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            with urlreq.urlopen(urlreq.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}), timeout=30) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def days(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def quarterly(entries):
    """Turn SEC duration facts (3m/6m/9m/12m cumulative from a fiscal-year start) into {quarter_end: value}."""
    by_start = {}
    for e in entries:
        n = days(e["start"], e["end"])
        if 60 <= n <= 380:
            by_start.setdefault(e["start"], {})[e["end"]] = e["val"]
    q = {}
    for start, ends in by_start.items():
        prev_end, prev_val = None, 0.0
        for end in sorted(ends):
            if prev_end is None and days(start, end) > 110:
                continue  # cumulative without its first quarter; can't split
            if prev_end is not None and not 60 <= days(prev_end, end) <= 120:
                continue
            q[end] = ends[end] - prev_val
            prev_end, prev_val = end, ends[end]
    return dict(sorted(q.items()))


def ttm_pair(q):
    v = list(q.values())
    if len(v) < 8:
        return None
    return sum(v[-4:]), sum(v[-8:-4]), list(q)[-1]


def facts_for(cik, tags):
    j = json.loads(get("https://data.sec.gov/api/xbrl/companyfacts/CIK%010d.json" % cik))["facts"]["us-gaap"]
    best = None
    for t in tags:
        if t in j:
            q = quarterly(j[t]["units"]["USD"])
            if q and (best is None or list(q)[-1] > list(best)[-1]):
                best = q
    return best


def capex_vs_revenue():
    cap_tags = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]
    rev_tags = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]
    cn = co = rn = ro = 0.0
    per = {}
    latest = ""
    for name, cik in HYPERSCALERS.items():
        c = ttm_pair(facts_for(cik, cap_tags) or {})
        r = ttm_pair(facts_for(cik, rev_tags) or {})
        if not c or not r:
            raise RuntimeError("missing SEC facts for " + name)
        cn, co, rn, ro = cn + c[0], co + c[1], rn + r[0], ro + r[1]
        per[name] = dict(capex_ttm=round(c[0] / 1e9, 1), capex_growth=round(100 * (c[0] / c[1] - 1)),
                         rev_growth=round(100 * (r[0] / r[1] - 1)))
        latest = max(latest, c[2])
    return dict(capex_growth=100 * (cn / co - 1), rev_growth=100 * (rn / ro - 1), capex_ttm=cn / 1e9,
                intensity=100 * cn / rn, per_company=per, as_of=latest)


def form4_sales(cik, lookback_days=400):
    """Insider open-market sales and purchases in USD, cached per filing. Returns list of (date, sold, bought)."""
    if not UA_OK:
        raise RuntimeError("Set SEC_USER_AGENT to 'AppName your-email@example.com' (SEC requires a contact)")
    path = os.path.join(CACHE, "form4_%d.json" % cik)
    cache = json.load(open(path)) if os.path.exists(path) else {}
    sub = json.loads(get("https://data.sec.gov/submissions/CIK%010d.json" % cik))["filings"]["recent"]
    cutoff = (dt.date.today() - dt.timedelta(days=lookback_days)).isoformat()
    errors = 0
    for form, date, accn, doc in zip(sub["form"], sub["filingDate"], sub["accessionNumber"], sub["primaryDocument"]):
        if form != "4" or date < cutoff or accn in cache:
            continue
        url = "https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, accn.replace("-", ""), doc.split("/")[-1])
        sold = bought = 0.0
        try:
            root = ET.fromstring(get(url))
            for t in root.iter("nonDerivativeTransaction"):
                code = t.findtext("transactionCoding/transactionCode")
                sh = float(t.findtext("transactionAmounts/transactionShares/value") or 0)
                px = float(t.findtext("transactionAmounts/transactionPricePerShare/value") or 0)
                if code == "S":
                    sold += sh * px
                elif code == "P":
                    bought += sh * px
        except Exception:
            errors += 1
            if errors >= 5:  # blocked or down: stop instead of retrying hundreds of times
                raise RuntimeError("too many Form 4 fetch errors")
            continue
        cache[accn] = [date, sold, bought]
    json.dump(cache, open(path, "w"))
    return [tuple(v) for v in cache.values()]


def insider_selling():
    today = dt.date.today()
    recent = base = rbuy = 0.0
    for name, cik in INSIDER_CO.items():
        for date, sold, bought in form4_sales(cik):
            age = (today - dt.date.fromisoformat(date)).days
            if age <= 90:
                recent += sold; rbuy += bought
            elif age <= 360:
                base += sold
    base_per90 = base / 3  # average of the three prior 90-day windows
    return dict(recent_sold=recent / 1e6, baseline_sold=base_per90 / 1e6, recent_bought=rbuy / 1e6,
                ratio=recent / base_per90 if base_per90 else None)
