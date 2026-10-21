"""Company snapshots (no AI) -> data/snap/<SYMBOL>.json for the 550 companies in the sector top-50 lists.
Facts, last reported quarters vs analyst consensus, dividend history, and recent SEC filings. Analyst price targets are deliberately NOT included.
Refreshes the stalest files first; SNAP_LIMIT (default 200) caps how many are refreshed per run."""
import datetime as dt, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SNAP = os.path.join(DATA, "snap")
UA_BROWSER = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
SEC_UA = os.environ.get("SEC_USER_AGENT", "TheAnalytic educational-project")
FORMS_OF_INTEREST = {"10-K": "Annual report", "10-Q": "Quarterly report", "8-K": "Current report (major event)", "DEF 14A": "Proxy statement (shareholder vote)", "S-1": "Registration (IPO)", "424B5": "Prospectus supplement (selling shares or debt)", "SC 13G": "Large shareholder disclosure", "SC 13G/A": "Large shareholder update", "6-K": "Foreign company report", "20-F": "Foreign company annual report", "10-K/A": "Annual report (amended)", "8-K/A": "Current report (amended)"}
_last = {"sec": 0.0}


def jget(url, headers, tries=2, pace=None):
    for i in range(tries):
        if pace:
            w = 0.12 - (time.time() - _last["sec"])
            if w > 0:
                time.sleep(w)
            _last["sec"] = time.time()
        try:
            return json.loads(urlreq.urlopen(urlreq.Request(url, headers=headers), timeout=25).read())
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1.5)


def num(s):
    try:
        return float(re.sub(r"[^\d.\-]", "", str(s)))
    except ValueError:
        return None


def numneg(s):
    """Nasdaq shows negatives in parentheses: '(22,336)' -> -22336."""
    v = num(s)
    return -v if v is not None and "(" in str(s) else v


def us_date(s):
    try:
        m, d, y = str(s).split("/")
        return "%04d-%02d-%02d" % (int(y), int(m), int(d))
    except Exception:
        return None


def insider_block(nq):
    """Who has been buying or selling: recent transactions plus 3- and 12-month totals (Nasdaq's insider-trades table, from SEC Form 4)."""
    d = (nq("company/{s}/insider-trades?limit=60&type=ALL&sortColumn=lastDate&sortOrder=DESC") or {}).get("data") or {}
    rows = ((d.get("transactionTable") or {}).get("table") or {}).get("rows") or []
    if not rows and not d.get("numberOfTrades"):
        return None
    tx = [dict(who=(r.get("insider") or "").title(), rel=r.get("relation"), date=us_date(r.get("lastDate")), type=r.get("transactionType"), own=r.get("ownType"),
               shares=num(r.get("sharesTraded")), price=num(r.get("lastPrice")), held=num(r.get("sharesHeld"))) for r in rows[:30]]
    cnt = {}
    for key, tbl in (("n", d.get("numberOfTrades")), ("sh", d.get("numberOfSharesTraded"))):
        for r in ((tbl or {}).get("rows") or []):
            cnt[key + ":" + (r.get("insiderTrade") or "")] = (numneg(r.get("months3")), numneg(r.get("months12")))
    # latest holding per person (the table is newest first), used to estimate how much insiders own
    seen, held = set(), 0.0
    for r in rows:
        k = (r.get("insider"), r.get("ownType"))
        if k in seen or (r.get("ownType") or "").lower() != "direct":
            continue
        seen.add(k)
        held += num(r.get("sharesHeld")) or 0.0
    return dict(tx=tx, buys=cnt.get("n:Number of Open Market Buys"), sells=cnt.get("n:Number of Sells"), bought=cnt.get("sh:Number of Shares Bought"), sold=cnt.get("sh:Number of Shares Sold"),
                net=cnt.get("sh:Net Activity"), insider_shares=held)


def inst_block(nq):
    """Institutional ownership: share of the company held by funds and the largest holders (Nasdaq, from 13F filings)."""
    d = (nq("company/{s}/institutional-holdings?limit=25&type=TOTAL&sortColumn=marketValue&sortOrder=DESC") or {}).get("data") or {}
    sm = d.get("ownershipSummary") or {}
    rows = ((d.get("holdingsTransactions") or {}).get("table") or {}).get("rows") or []
    if not sm and not rows:
        return None
    g = lambda k: (sm.get(k) or {}).get("value")
    return dict(pct=num(g("SharesOutstandingPCT")), shares_out_m=num(g("ShareoutstandingTotal")), value_m=num(g("TotalHoldingsValue")),
                holders=[dict(name=(r.get("ownerName") or "").strip(), date=us_date(r.get("date")), shares=num(r.get("sharesHeld")), change=numneg(r.get("sharesChange")), change_pct=numneg(r.get("sharesChangePCT")),
                              value_k=num(r.get("marketValue"))) for r in rows[:25]])


def build_one(sym, cik):
    nq = lambda path: jget("https://api.nasdaq.com/api/" + path.replace("{s}", sym.replace("-", ".")), UA_BROWSER)
    out = dict(symbol=sym, generated=dt.datetime.utcnow().isoformat() + "Z", facts={}, earnings=[], dividends=[], filings=[], insider_filings_90d=None)
    summ = (nq("quote/{s}/summary?assetclass=stocks") or {}).get("data") or {}
    sd = {k: v.get("value") for k, v in (summ.get("summaryData") or {}).items()}
    if sd:
        hl = (sd.get("FiftTwoWeekHighLow") or "").split("/")
        out["facts"].update(exchange=sd.get("Exchange"), industry=sd.get("Industry"), avg_volume=num(sd.get("AverageVolume")), week52_high=num(hl[0]) if len(hl) == 2 else None, week52_low=num(hl[1]) if len(hl) == 2 else None,
                            dividend_annual=num(sd.get("AnnualizedDividend")), dividend_yield=num(sd.get("Yield")), ex_dividend=sd.get("ExDividendDate"), dividend_paid=sd.get("DividendPaymentDate"))
    es = (((nq("company/{s}/earnings-surprise") or {}).get("data") or {}).get("earningsSurpriseTable") or {}).get("rows") or []
    out["earnings"] = [dict(quarter=r.get("fiscalQtrEnd"), reported=r.get("dateReported"), eps=r.get("eps"), estimate=num(r.get("consensusForecast")), surprise_pct=num(r.get("percentageSurprise"))) for r in es[:8]]
    dv = (((nq("quote/{s}/dividends?assetclass=stocks") or {}).get("data") or {}).get("dividends") or {}).get("rows") or []
    out["dividends"] = [dict(ex=r.get("exOrEffDate"), amount=num(r.get("amount")), paid=r.get("paymentDate")) for r in dv[:12]]
    out["insider"] = insider_block(nq)
    out["inst"] = inst_block(nq)
    out["mgmt_updates"] = []
    sub = jget("https://data.sec.gov/submissions/CIK%010d.json" % cik, {"User-Agent": SEC_UA, "Accept-Encoding": "identity"}, pace=True)
    if sub:
        out["facts"].update(sic=sub.get("sicDescription"), fiscal_year_end=sub.get("fiscalYearEnd"), filer_category=sub.get("category"), state=sub.get("stateOfIncorporation"), website=sub.get("website") or None, cik=cik)
        r = sub["filings"]["recent"]; today = dt.date.today(); n4 = 0
        its = r.get("items") or [""] * len(r["form"])
        for form, date, accn, doc, desc, it in zip(r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"], r["primaryDocDescription"], its):
            if form in ("8-K", "8-K/A") and "5.02" in (it or "").split(",") and (today - dt.date.fromisoformat(date)).days <= 400 and len(out["mgmt_updates"]) < 8:
                out["mgmt_updates"].append(dict(date=date, what="Change in executives or directors (8-K Item 5.02)", url="https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, accn.replace("-", ""), doc)))
            if form == "4" and (today - dt.date.fromisoformat(date)).days <= 90:
                n4 += 1
            elif form in FORMS_OF_INTEREST and len(out["filings"]) < 12:
                out["filings"].append(dict(form=form, date=date, what=FORMS_OF_INTEREST[form], url="https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, accn.replace("-", ""), doc)))
        out["insider_filings_90d"] = n4
    return out


def main():
    sectors = json.load(open(os.path.join(DATA, "sectors.json")))["sectors"]
    syms = list(dict.fromkeys(t["symbol"] for s in sectors for t in s["top"]))
    fund = json.load(open(os.path.join(DATA, "fundamentals.json")))["stocks"]
    os.makedirs(SNAP, exist_ok=True)
    age = lambda s: os.path.getmtime(os.path.join(SNAP, s + ".json")) if os.path.exists(os.path.join(SNAP, s + ".json")) else 0
    todo = sorted((s for s in syms if s in fund and fund[s].get("cik")), key=age)[: int(os.environ.get("SNAP_LIMIT", "200"))]
    done = 0
    for i, s in enumerate(todo):
        try:
            json.dump(build_one(s, fund[s]["cik"]), open(os.path.join(SNAP, s + ".json"), "w"), separators=(",", ":"))
            done += 1
        except Exception:
            pass
        if (i + 1) % 50 == 0:
            print("  %d/%d" % (i + 1, len(todo)), flush=True)
    print("snapshots refreshed:", done, "of", len(todo), "| total files:", len(os.listdir(SNAP)))


if __name__ == "__main__":
    main()
