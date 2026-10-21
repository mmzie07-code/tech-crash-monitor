"""IPO tracker -> data/ipos.json. Facts only: Nasdaq's public IPO calendar (priced / upcoming / filed) plus Yahoo prices since pricing.
No ratings or predictions. SPACs (blank-check shells) are tagged so the page can hide them by default."""
import datetime as dt, json, os, re, statistics, sys, time
import urllib.request as urlreq

sys.path.insert(0, os.path.dirname(__file__))
import providers

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
SPAC = re.compile(r"\b(acquisition|merger|spac|blank check)\b", re.I)
LOOKBACK_DAYS = 120
LOCKUP_DAYS = 180  # the typical lock-up on insider and early-investor shares; each deal sets its own


def month_rows(ym):
    j = json.loads(urlreq.urlopen(urlreq.Request("https://api.nasdaq.com/api/ipo/calendar?date=" + ym, headers=UA), timeout=25).read())
    return j.get("data") or {}


def num(s):
    try:
        return float(re.sub(r"[^\d.]", "", s or ""))
    except Exception:
        return None


def iso(us_date):
    try:
        m, d, y = us_date.split("/")
        return dt.date(int(y), int(m), int(d)).isoformat()
    except Exception:
        return None


def months_back(today, n):
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append("%04d-%02d" % (y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def performance(sym, offer):
    """Since pricing: first-day close and latest close versus the offer price. None if it isn't trading yet (or Yahoo doesn't know it)."""
    try:
        s = providers.yahoo_closes(sym, "6mo")
    except Exception:
        return None
    if not s or not offer:
        return None
    return dict(first_day_pct=round((s[0][1] / offer - 1) * 100, 1), now_pct=round((s[-1][1] / offer - 1) * 100, 1), last=round(s[-1][1], 2), last_date=s[-1][0], first_trade=s[0][0])


def build():
    today = dt.date.today()
    cutoff = today - dt.timedelta(days=LOOKBACK_DAYS)
    priced, filed, upcoming, withdrawn = [], [], [], 0
    seen = set()
    for ym in months_back(today, 5):
        d = month_rows(ym)
        for r in ((d.get("priced") or {}).get("rows") or []):
            date = iso(r.get("pricedDate"))
            if not date or dt.date.fromisoformat(date) < cutoff or r.get("dealID") in seen:
                continue
            seen.add(r.get("dealID"))
            name, sym, price = (r.get("companyName") or "").strip(), r.get("proposedTickerSymbol"), num(r.get("proposedSharePrice"))
            if name.isupper():  # Nasdaq shouts some names
                name = name.title()
            priced.append(dict(sym=sym, name=name, exchange=r.get("proposedExchange"), price=price, date=date, shares=num(r.get("sharesOffered")),
                               amount=num(r.get("dollarValueOfSharesOffered")), spac=bool(SPAC.search(name)),
                               lockup=(dt.date.fromisoformat(date) + dt.timedelta(days=LOCKUP_DAYS)).isoformat()))
        for r in ((d.get("filed") or {}).get("rows") or []):
            date = iso(r.get("filedDate"))
            if not date or dt.date.fromisoformat(date) < today - dt.timedelta(days=60) or r.get("dealID") in seen:
                continue
            seen.add(r.get("dealID"))
            name = (r.get("companyName") or "").strip()
            filed.append(dict(sym=r.get("proposedTickerSymbol"), name=name, date=date, amount=num(r.get("dollarValueOfSharesOffered")), spac=bool(SPAC.search(name))))
        for r in (((d.get("upcoming") or {}).get("upcomingTable") or {}).get("rows") or []):
            name = (r.get("companyName") or "").strip()
            upcoming.append(dict(sym=r.get("proposedTickerSymbol"), name=name, exchange=r.get("proposedExchange"), price=r.get("proposedSharePrice"),
                                 shares=num(r.get("sharesOffered")), amount=num(r.get("dollarValueOfSharesOffered")),
                                 date=iso(r.get("expectedPriceDate")), spac=bool(SPAC.search(name))))
        withdrawn += sum(1 for r in ((d.get("withdrawn") or {}).get("rows") or []) if (iso(r.get("withdrawDate")) or "0") >= (today - dt.timedelta(days=30)).isoformat())
    priced.sort(key=lambda x: x["date"], reverse=True)
    filed.sort(key=lambda x: x["date"], reverse=True)
    for p in priced:  # performance for operating companies only (SPAC shares just sit near $10)
        if p["sym"] and not p["spac"]:
            p["perf"] = performance(p["sym"], p["price"])
            time.sleep(0.2)
    real = [p for p in priced if not p["spac"]]
    traded = [p["perf"] for p in real if p.get("perf")]
    stats = dict(window_days=LOOKBACK_DAYS, priced=len(real), spacs=len(priced) - len(real), traded=len(traded),
                 raised=sum(p["amount"] or 0 for p in real),
                 median_first_day=round(statistics.median(t["first_day_pct"] for t in traded), 1) if traded else None,
                 below_offer=sum(1 for t in traded if t["now_pct"] < 0))
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", asof=today.isoformat(), priced=priced, upcoming=upcoming, filed=filed, withdrawn_30d=withdrawn, stats=stats,
                disclaimer="Facts from Nasdaq's public IPO calendar and Yahoo Finance prices. Educational only; not investment advice.")


if __name__ == "__main__":
    out = build()
    os.makedirs(DATA, exist_ok=True)
    json.dump(out, open(os.path.join(DATA, "ipos.json"), "w"), indent=1)
    s = out["stats"]
    print("ipos: %d priced (%d operating, %d SPACs), %d upcoming, %d filed; median first-day %s%%; %d/%d below offer" % (
        len(out["priced"]), s["priced"], s["spacs"], len(out["upcoming"]), len(out["filed"]), s["median_first_day"], s["below_offer"], s["traded"]))
