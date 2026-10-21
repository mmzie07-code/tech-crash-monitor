"""Housing market -> data/housing.json. Four independent parts (each can fail without the others):
  series  : mortgage rates (Freddie Mac), prices, sales, building activity (FRED public CSVs)
  payment : what a median-priced home costs per month at today's rate (plain arithmetic)
  market  : homebuilder / housing / REIT stocks (Yahoo)
  moves   : what public real-estate companies are doing with property: completed acquisitions/sales (8-K Item 2.01) and activist stakes (13D), from SEC EDGAR
Facts only. Big private deals come from the live news feed on the page, not from here."""
import csv, datetime as dt, io, json, os, sys, time
import urllib.request as urlreq

sys.path.insert(0, os.path.dirname(__file__))
import providers, sec

DATA = os.path.join(os.path.dirname(__file__), "..", "data")

# key, label, FRED id, unit, years kept, plain-English description
SERIES = [
    ("cs", "Home prices (Case-Shiller index)", "CSUSHPINSA", "index", 15, "How much US home prices have risen, as an index (January 2000 = 100). It lags about two months, so it describes where prices were, not are."),
    ("median", "Median sale price of a home", "MSPUS", "usd", 15, "The middle price of all houses sold in the US each quarter. Half sold for more, half for less."),
    ("existing", "Existing-home sales (per year)", "EXHOSLUSM495S", "count", 5, "Resales of homes people already own, shown as a yearly pace. This is most of the housing market."),
    ("newsales", "New-home sales (per year, thousands)", "HSN1F", "thousands", 10, "Newly built single-family homes sold, as a yearly pace."),
    ("supply", "Months of new homes for sale", "MSACSR", "months", 10, "How long today's unsold new homes would last at the current sales pace. About 6 months is balanced; more means buyers have the upper hand."),
    ("starts", "Housing starts (per year, thousands)", "HOUST", "thousands", 10, "New homes where construction began, as a yearly pace. Builders react to demand, so this moves with confidence."),
    ("permits", "Building permits (per year, thousands)", "PERMIT", "thousands", 10, "Permits issued to build. They come before starts, so they hint at where building is heading."),
    ("rent", "Rent (CPI, primary residence)", "CUSR0000SEHA", "index", 10, "The consumer price index for rent. It shows how fast rents are rising for tenants."),
]
MARKET = [  # symbol, name, group
    ("ITB", "Homebuilders fund (iShares)", "Funds"), ("XHB", "Homebuilders & housing fund (SPDR)", "Funds"), ("VNQ", "US real estate fund (Vanguard)", "Funds"), ("REZ", "Residential real estate fund", "Funds"),
    ("DHI", "D.R. Horton", "Homebuilders"), ("LEN", "Lennar", "Homebuilders"), ("PHM", "PulteGroup", "Homebuilders"), ("NVR", "NVR", "Homebuilders"), ("TOL", "Toll Brothers", "Homebuilders"),
    ("KBH", "KB Home", "Homebuilders"), ("TMHC", "Taylor Morrison", "Homebuilders"), ("MTH", "Meritage Homes", "Homebuilders"),
    ("INVH", "Invitation Homes", "Landlords & REITs"), ("AMH", "American Homes 4 Rent", "Landlords & REITs"), ("EQR", "Equity Residential", "Landlords & REITs"), ("AVB", "AvalonBay", "Landlords & REITs"),
    ("PLD", "Prologis (warehouses)", "Landlords & REITs"), ("O", "Realty Income", "Landlords & REITs"), ("WELL", "Welltower (senior housing)", "Landlords & REITs"),
    ("Z", "Zillow", "Housing tech & services"), ("CSGP", "CoStar (listings & data)", "Housing tech & services"), ("CBRE", "CBRE (brokerage)", "Housing tech & services"), ("OPEN", "Opendoor", "Housing tech & services"), ("RKT", "Rocket (mortgages)", "Housing tech & services"),
]
BUILDER_TICKERS = ["DHI", "LEN", "PHM", "NVR", "TOL", "KBH", "TMHC", "MTH", "CCS", "LGIH", "MHO", "GRBK", "BLDR", "SKY"]
ITEMS = {"2.01": "Completed an acquisition or sale of assets"}
FORMS_13D = {"SC 13D", "SC 13D/A", "SCHEDULE 13D", "SCHEDULE 13D/A"}
MOVES_DAYS = 60


def fred(sid):
    # FRED drops connections from browser-style User-Agents (and hangs), so identify as a plain client and fail fast
    req = urlreq.Request("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid, headers={"User-Agent": "curl/8.4.0"})
    rows = list(csv.reader(io.StringIO(urlreq.urlopen(req, timeout=20).read().decode())))
    out = []
    for r in rows[1:]:
        try:
            out.append((r[0], float(r[1])))
        except (ValueError, IndexError):
            pass
    return out


def freddie():
    rows = list(csv.reader(io.StringIO(providers._get("https://www.freddiemac.com/pmms/docs/PMMS_history.csv", timeout=40).decode())))
    p30, p15 = [], []
    for r in rows[1:]:
        try:
            m, d, y = r[0].split("/")
            iso = "%04d-%02d-%02d" % (int(y), int(m), int(d))
            if r[1].strip():
                p30.append((iso, float(r[1])))
            if len(r) > 3 and r[3].strip():
                p15.append((iso, float(r[3])))
        except (ValueError, IndexError):
            pass
    return p30, p15


def ago(series, days):
    """Value at the last observation on or before (latest date - days)."""
    cut = (dt.date.fromisoformat(series[-1][0]) - dt.timedelta(days=days)).isoformat()
    prior = [v for d, v in series if d <= cut]
    return prior[-1] if prior else None


def pack(label, unit, desc, s, years, freq):
    s = [(d, v) for d, v in s if d >= (dt.date.today() - dt.timedelta(days=365 * years + 40)).isoformat()]
    if len(s) < 2:
        return None
    y1 = ago(s, 365)
    return dict(label=label, unit=unit, desc=desc, freq=freq, last=list(s[-1]), year_ago=y1, change_1y=round((s[-1][1] / y1 - 1) * 100, 1) if y1 else None,
                pts=[[d, round(v, 3)] for d, v in s])


def payment(price, rate_pct, down=0.20, years=30):
    loan, r, n = price * (1 - down), rate_pct / 1200.0, years * 12
    return loan * r / (1 - (1 + r) ** -n) if r else loan / n


def build_series():
    out = {}
    try:
        p30, p15 = freddie()
        out["m30"] = pack("30-year mortgage rate", "pct", "The average rate on a 30-year fixed mortgage, from Freddie Mac's weekly survey of lenders. The biggest single driver of what a home costs each month.", p30, 5, "weekly")
        out["m15"] = pack("15-year mortgage rate", "pct", "The average rate on a 15-year fixed mortgage (Freddie Mac). Lower than the 30-year, with bigger monthly payments.", p15, 5, "weekly")
    except Exception as e:
        print("housing: mortgage rates failed:", e)
    for key, label, sid, unit, years, desc in SERIES:
        try:
            out[key] = pack(label, unit, desc, fred(sid), years, "monthly" if key not in ("median",) else "quarterly")
        except Exception as e:
            print("housing: %s failed: %s" % (sid, e))
    return {k: v for k, v in out.items() if v}


def build_payment(series):
    try:
        m30, med = series["m30"], series["median"]
        now_price, now_rate = med["last"][1], m30["last"][1]
        yr_price, yr_rate = med["year_ago"], m30["year_ago"]
        low = min(m30["pts"], key=lambda p: p[1])  # lowest rate in the window we keep (about five years)
        low_price = ago(med["pts"], 365 * 5) or med["pts"][0][1]
        return dict(price=now_price, price_date=med["last"][0], rate=now_rate, rate_date=m30["last"][0], monthly=round(payment(now_price, now_rate)),
                    monthly_year_ago=round(payment(yr_price, yr_rate)) if yr_price and yr_rate else None,
                    monthly_at_low=round(payment(low_price, low[1])), low_rate=low[1], low_date=low[0], down_pct=20)
    except Exception as e:
        print("housing: payment failed:", e)
        return None


def build_market():
    try:
        out, syms = [], [m[0] for m in MARKET]
        data = {}
        for i in range(0, len(syms), 20):
            req = urlreq.Request("https://query1.finance.yahoo.com/v8/finance/spark?symbols=%s&range=1y&interval=1d" % ",".join(syms[i:i + 20]), headers={"User-Agent": "Mozilla/5.0"})
            data.update(json.loads(urlreq.urlopen(req, timeout=30).read()))
            time.sleep(0.3)
        for sym, name, group in MARKET:
            v = data.get(sym) or {}
            c = [x for x in (v.get("close") or []) if x is not None]
            if len(c) < 130:
                continue
            ch = lambda n: round((c[-1] / c[-1 - n] - 1) * 100, 1)
            out.append(dict(sym=sym, name=name, group=group, price=round(c[-1], 2), d1=round(v["fulldayChangePercent"], 2) if v.get("fulldayChangePercent") is not None else None,
                            m1=ch(21), m3=ch(63), m6=ch(126), y1=round((c[-1] / c[0] - 1) * 100, 1), spark=[round(x, 2) for x in c[-63:]]))
        return out
    except Exception as e:
        print("housing: market failed:", e)
        return []


def parse_moves(sub, sym, name, cik, today):
    """Completed acquisitions/sales (8-K Item 2.01) and activist stakes (13D) filed in the last MOVES_DAYS days."""
    r, out = sub["filings"]["recent"], []
    items = r.get("items") or [""] * len(r["form"])
    for form, date, accn, doc, it in zip(r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"], items):
        if (today - dt.date.fromisoformat(date)).days > MOVES_DAYS:
            continue
        what = None
        if form in ("8-K", "8-K/A") and "2.01" in (it or "").split(","):
            what = ITEMS["2.01"]
        elif form in FORMS_13D:
            what = "A large holder disclosed a stake and its intentions (13D)"
        if what:
            out.append(dict(date=date, sym=sym, name=name, form=form, what=what, url="https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (cik, accn.replace("-", ""), doc)))
    return out


def build_moves():
    try:
        sectors = json.load(open(os.path.join(DATA, "sectors.json")))["sectors"]
        fund = json.load(open(os.path.join(DATA, "fundamentals.json")))["stocks"]
        names = {t["symbol"]: t["name"] for s in sectors for t in s["top"]}
        re_syms = [t["symbol"] for s in sectors if s["key"] == "real-estate" for t in s["top"]]
        syms = list(dict.fromkeys(re_syms + [b for b in BUILDER_TICKERS if b in fund]))
        today, out, tried = dt.date.today(), [], 0
        if not sec.UA_OK:  # SEC rejects requests without a contact address in the User-Agent: don't hammer it (the nightly job has SEC_USER_AGENT)
            print("housing: SEC_USER_AGENT not set, skipping SEC filings")
            return dict(items=[], companies=0, days=MOVES_DAYS, ok=False)
        for s in syms:
            cik = (fund.get(s) or {}).get("cik")
            if not cik:
                continue
            tried += 1
            try:
                sub = json.loads(sec.get("https://data.sec.gov/submissions/CIK%010d.json" % cik))
                out += parse_moves(sub, s, names.get(s, s), cik, today)
            except Exception:
                pass
        out.sort(key=lambda m: m["date"], reverse=True)
        return dict(items=out[:80], companies=tried, days=MOVES_DAYS, ok=sec.UA_OK)
    except Exception as e:
        print("housing: moves failed:", e)
        return None


def story(series, pay, market):
    """Plain-English readings computed from the numbers (no AI). Each item: tone ('good', 'warn', 'info') and text."""
    out = []
    m = series.get("m30")
    if m:
        d, v = m["last"][1], m["year_ago"]
        mo = ago(m["pts"], 28)
        trend = "" if mo is None else (" It is %s from four weeks ago (%.2f%%)." % ("up" if d > mo + 0.04 else "down" if d < mo - 0.04 else "about unchanged", mo))
        out.append(dict(tone="warn" if d >= 6.5 else "info", text="A 30-year fixed mortgage costs %.2f%% this week%s.%s" % (d, "" if v is None else ", versus %.2f%% a year ago" % v, trend)))
    if pay:
        more = pay["monthly"] - pay["monthly_at_low"]
        out.append(dict(tone="warn" if pay["monthly"] > (pay["monthly_year_ago"] or 0) else "info",
                        text="On a median-priced home ($%s) with 20%% down, the monthly payment for the loan alone (principal and interest) is about $%s%s. At the lowest rate in the last five years (%.2f%% in %s) it would be about $%s, a difference of $%s a month." % (
                            format(round(pay["price"]), ","), format(pay["monthly"], ","), "" if not pay["monthly_year_ago"] else ", versus about $%s a year ago" % format(pay["monthly_year_ago"], ","), pay["low_rate"], pay["low_date"][:4], format(pay["monthly_at_low"], ","), format(more, ","))))
    c = series.get("cs")
    if c and c["change_1y"] is not None:
        out.append(dict(tone="info", text="Home prices (Case-Shiller, through %s) are %s%.1f%% from a year ago. Prices move slowly and lag mortgage rates by months." % (c["last"][0][:7], "+" if c["change_1y"] >= 0 else "", c["change_1y"])))
    e = series.get("existing")
    if e and e["change_1y"] is not None:
        out.append(dict(tone="info", text="Existing homes are selling at a pace of %.2f million a year, %s%.1f%% from a year ago. High rates tend to freeze the market: owners with cheap old mortgages don't want to sell." % (e["last"][1] / 1e6, "+" if e["change_1y"] >= 0 else "", e["change_1y"])))
    s = series.get("supply")
    if s:
        v = s["last"][1]
        out.append(dict(tone="warn" if v > 7 else "info", text="There are %.1f months of new homes for sale at the current pace. %s" % (v, "That is above the ~6 months seen in a balanced market, which usually means builders must offer discounts or incentives." if v > 7 else "Around 4 to 6 months is typical for a balanced market.")))
    p, st = series.get("permits"), series.get("starts")
    if p and st:
        out.append(dict(tone="info", text="Builders pulled permits at a %s thousand yearly pace and started homes at %s thousand (%s). Permits come first, so they show where building is heading." % (format(round(p["last"][1]), ","), format(round(st["last"][1]), ","), "permits %s%.1f%% vs a year ago" % ("+" if (p["change_1y"] or 0) >= 0 else "", p["change_1y"] or 0))))
    by = {x["sym"]: x for x in market}
    if "ITB" in by and "VNQ" in by:
        out.append(dict(tone="info", text="Markets: homebuilder stocks (ITB) are %s%.1f%% over three months and real estate funds (VNQ) %s%.1f%%. Stocks often move ahead of the housing data because investors look forward." % ("+" if by["ITB"]["m3"] >= 0 else "", by["ITB"]["m3"], "+" if by["VNQ"]["m3"] >= 0 else "", by["VNQ"]["m3"])))
    return out


def keep_last_good(series):
    """If a source is down tonight, keep its last good series from the previous file (marked stale) instead of dropping it from the page."""
    try:
        old = json.load(open(os.path.join(DATA, "housing.json"))).get("series") or {}
    except Exception:
        return series
    for k, v in old.items():
        if k not in series and v:
            v["stale"] = True
            series[k] = v
    return series


def build():
    series = keep_last_good(build_series())
    pay = build_payment(series) if series else None
    market = build_market()
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", series=series, payment=pay, market=market, moves=build_moves(), story=story(series, pay, market),
                disclaimer="Facts from Freddie Mac, the St. Louis Fed (FRED), Yahoo Finance and SEC EDGAR. Educational only; not investment advice.")


if __name__ == "__main__":
    out = build()
    json.dump(out, open(os.path.join(DATA, "housing.json"), "w"), separators=(",", ":"))
    print("housing: %d series, %d market rows, moves %s" % (len(out["series"]), len(out["market"]), None if out["moves"] is None else "%d items from %d companies (sec ok=%s)" % (len(out["moves"]["items"]), out["moves"]["companies"], out["moves"]["ok"])))
    for s in out["story"]:
        print("  [%s] %s" % (s["tone"], s["text"]))
