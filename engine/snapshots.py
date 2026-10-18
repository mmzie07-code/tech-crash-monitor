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
    out["dividends"] = [dict(ex=r.get("exOrEffDate"), amount=num(r.get("amount")), paid=r.get("paymentDate")) for r in dv[:6]]
    sub = jget("https://data.sec.gov/submissions/CIK%010d.json" % cik, {"User-Agent": SEC_UA, "Accept-Encoding": "identity"}, pace=True)
    if sub:
        out["facts"].update(sic=sub.get("sicDescription"), fiscal_year_end=sub.get("fiscalYearEnd"), filer_category=sub.get("category"), state=sub.get("stateOfIncorporation"), website=sub.get("website") or None, cik=cik)
        r = sub["filings"]["recent"]; today = dt.date.today(); n4 = 0
        for form, date, accn, doc, desc in zip(r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"], r["primaryDocDescription"]):
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
