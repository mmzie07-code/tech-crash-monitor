"""Economic calendar -> data/calendar.json (all times US Eastern).
Sources: Federal Reserve (FOMC dates), BEA (GDP / PCE / trade), Nasdaq (large-company earnings), plus weekly jobless claims.
BLS (CPI, jobs report) blocks automated access, so those dates are NOT included; the site links to bls.gov instead."""
import datetime as dt, html, json, os, re
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"}
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"])}


def fetch(url, timeout=25):
    return urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=timeout).read().decode("utf8", "ignore")


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:48]


def ev(date, time, kind, title, importance, why, extra=None, source="", link=None):
    return dict(id="%s-%s-%s" % (date.isoformat(), kind, slug(title)), date=date.isoformat(), time=time, kind=kind, title=title, importance=importance,
                why=why, extra=extra, source=source, link=link)


def fomc_all():
    """Every FOMC decision date listed on the Fed's site: [(date, has_projections)]."""
    page = fetch("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")
    out = []
    for m in re.finditer(r"(\d{4}) FOMC Meetings(.*?)(?=\d{4} FOMC Meetings|$)", page, re.S):
        year = int(m.group(1))
        for mm in re.finditer(r'fomc-meeting__month[^>]*><strong>([A-Za-z/]+)</strong></div>\s*<div class="fomc-meeting__date[^>]*>([\d\-/\*\s]+)', m.group(2)):
            months, days = mm.group(1).split("/"), re.findall(r"\d+", mm.group(2))
            month = MONTHS.get(months[-1]) if days else None
            if month:
                out.append((dt.date(year, month, int(days[-1])), "*" in mm.group(2)))
    return sorted(out)


def fomc(start, end):
    out = []
    for d, sep in fomc_all():
        if start <= d <= end:
            out.append(ev(d, "2:00 PM", "fed", "Fed interest-rate decision (FOMC)", "high",
                          "The Fed sets short-term interest rates. Changes ripple through mortgage and loan rates, savings yields, and stock valuations, especially growth and tech stocks. A press conference follows at 2:30 PM." + (" This meeting also includes new economic projections." if sep else ""),
                          dict(meeting=d.isoformat()), "Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"))
    return out


def fed_calendar(start, end):
    """Speeches, FOMC minutes, Beige Book and statistical releases from the Fed's own calendar feed."""
    j = json.loads(fetch("https://www.federalreserve.gov/json/calendar.json").lstrip("\ufeff"))["events"]
    out = []
    for e in j:
        try:
            y, m = map(int, (e.get("month") or "").split("-"))
            d = dt.date(y, m, int(re.findall(r"\d+", e.get("days") or "")[0]))
        except Exception:
            continue
        if not (start <= d <= end):
            continue
        t = (e.get("time") or "").replace("a.m.", "AM").replace("p.m.", "PM").strip() or "Time TBA"
        title, typ = html.unescape(e.get("title") or "").strip(), e.get("type")
        desc = re.sub(r"<[^>]+>", "", html.unescape(html.unescape(e.get("description") or ""))).strip()
        link = e.get("live") or None
        if typ == "Speeches":
            who = re.sub(r"^(Speech|Discussion|Testimony|Remarks|Interview)\s*-\s*", "", title)
            top = bool(re.search(r"\bChair\b", who)) and "Vice" not in who
            out.append(ev(d, t, "fed", "Fed speaks: " + who, "high" if top else "medium",
                          ("Topic: %s. " % desc if desc else "") + "Fed officials' remarks can move markets when they hint at where interest rates are headed. The Chair's words carry the most weight.",
                          dict(speaker=who, location=html.unescape(e.get("location") or "")), "Federal Reserve", link))
        elif typ == "FOMC" and "Minutes" in title:
            out.append(ev(d, t, "fed", "FOMC minutes (%s)" % desc.replace("Meeting of ", "meeting of "), "high",
                          "A detailed record of what Fed officials discussed at their last meeting, published three weeks later. Markets look for clues about future rate moves.", dict(meeting=desc), "Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"))
        elif typ == "Beige":
            out.append(ev(d, t, "fed", "Fed Beige Book", "medium", "A report on how businesses across the country say the economy is doing, gathered before each Fed meeting.", None, "Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/beigebook/"))
        elif typ == "Stat":
            out.append(ev(d, t, "data", title, "low", "A routine Federal Reserve statistical release. " + desc, None, "Federal Reserve", None))
    return out


AUCTION_WHY = "The Treasury borrows by auctioning bonds. Strong demand keeps borrowing costs (yields) steady; weak demand can push yields higher, which affects mortgage rates and stock valuations."


def treasury_upcoming(start, end):
    out = []
    for r in json.loads(fetch("https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json")):
        if r.get("securityType") not in ("Note", "Bond", "TIPS", "FRN"):
            continue
        try:
            d = dt.date.fromisoformat(r["auctionDate"][:10])
        except Exception:
            continue
        if not (start <= d <= end):
            continue
        term = r.get("securityTerm") or ""
        imp = "high" if term.startswith(("10-", "30-")) else "medium" if term.startswith(("2-", "3-", "5-", "7-", "20-")) else "low"
        amt = float(r.get("offeringAmount") or 0) / 1e9
        out.append(ev(d, "1:00 PM", "treasury", "Treasury auction: %s %s" % (term, r["securityType"]), imp,
                      AUCTION_WHY + (" Offering size: $%.0fB." % amt if amt else ""), dict(term=term, type=r["securityType"], cusip=r.get("cusip")), "TreasuryDirect", "https://www.treasurydirect.gov/auctions/upcoming/"))
    return out


def treasury_past(start, end):
    out = []
    for typ in ("Note", "Bond"):
        try:
            rows = json.loads(fetch("https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&type=%s&days=%d" % (typ, (end - start).days + 5)))
        except Exception:
            continue
        for r in rows:
            try:
                d = dt.date.fromisoformat(r["auctionDate"][:10])
            except Exception:
                continue
            if not (start <= d <= end):
                continue
            term = r.get("securityTerm") or ""
            imp = "high" if term.startswith(("10-", "30-")) else "medium" if term.startswith(("2-", "3-", "5-", "7-", "20-")) else "low"
            out.append(ev(d, "1:00 PM", "treasury", "Treasury auction: %s %s" % (term, typ), imp, AUCTION_WHY, dict(term=term, type=typ, cusip=r.get("cusip")), "TreasuryDirect", "https://www.treasurydirect.gov/auctions/results/"))
    return out


def bea_past(start, end):
    """Past BEA releases (with their headline text) from the BEA news feed."""
    out = []
    raw = fetch("https://apps.bea.gov/rss/rss.xml")
    for it in re.findall(r"<item[ >].*?</item>", raw, re.S):
        t = re.search(r"<title[^>]*>(.*?)</title>", it, re.S)
        pdt = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", it, re.S)
        l = re.search(r"<link[^>]*>(.*?)</link>", it, re.S)
        if not (t and pdt):
            continue
        title = html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", t.group(1))).strip()
        try:
            d = dt.datetime.strptime(pdt.group(1).strip()[5:16], "%d %b %Y").date()
        except Exception:
            continue
        low = title.lower()
        if not (start <= d <= end) or not (low.startswith(("gdp", "personal income and outlays", "u.s. international trade in goods"))):
            continue
        if low.startswith("gdp"):
            est = "advance" if "advance" in low else "second" if "second" in low else "third"
            title2, imp = ("GDP advance estimate: first look at economic growth", "high") if est == "advance" else ("GDP %s estimate: revised economic growth" % est, "medium")
        elif low.startswith("personal"):
            title2, imp = "Personal income and spending, including PCE inflation", "high"
        else:
            title2, imp = "Trade balance (imports and exports)", "low"
        out.append(ev(d, "8:30 AM", "data", title2, imp, "A US government economic release.", dict(bea_key=low[:40]), "BEA", (l.group(1).strip() if l else None)))
    return out


def bea_upcoming(today):
    page = fetch("https://www.bea.gov/news/schedule")
    out = []
    for r in re.finditer(r'release-date">([A-Za-z]+ \d{1,2})</div>\s*<small[^>]*>([^<]+)</small>.*?release-title[^>]*>\s*(.*?)\s*</td>', page, re.S):
        mon, day = r.group(1).split()
        if mon not in MONTHS:
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", r.group(3))).strip()
        d = None
        for y in (today.year, today.year + 1):
            c = dt.date(y, MONTHS[mon], int(day))
            if today - dt.timedelta(days=1) <= c <= today + dt.timedelta(days=400):
                d = c
                break
        if not d or d > today + dt.timedelta(days=45):
            continue
        t = title.lower()
        if t.startswith("gdp (advance"):
            out.append(ev(d, r.group(2).strip(), "data", "GDP advance estimate: first look at economic growth", "high",
                          "GDP measures the size of the US economy. The first estimate shows whether growth is speeding up or slowing, which shapes expectations for company profits and Fed policy."))
        elif t.startswith("gdp ("):
            out.append(ev(d, r.group(2).strip(), "data", "GDP " + ("second" if "second" in t else "third") + " estimate: revised economic growth", "medium",
                          "A revision to the earlier GDP number. Big revisions can change the story about how strong the economy is.", dict(bea_key="gdp"), "BEA"))
        elif t.startswith("personal income and outlays"):
            out.append(ev(d, r.group(2).strip(), "data", "Personal income &amp; spending, including PCE inflation".replace("&amp;", "and"), "high",
                          "Includes the PCE price index, the inflation gauge the Fed watches most closely, plus how much households earn and spend. Hot inflation can push rate-cut hopes back and hit stocks."))
        elif t.startswith("u.s. international trade"):
            out.append(ev(d, r.group(2).strip(), "data", "Trade balance (imports and exports)", "low",
                          "Shows whether the US is buying more from the world than it sells. Matters more when tariffs and trade policy are in the news."))
    return out


def jobless(today):
    out, d = [], today
    while len(out) < 3:
        if d.weekday() == 3 and d >= today:
            out.append(ev(d, "8:30 AM", "data", "Weekly jobless claims", "low",
                          "How many people filed for unemployment benefits last week. A quick read on the job market; a sustained rise can signal a weakening economy."))
        d += dt.timedelta(days=1)
    return out


def earnings(today, days=10, min_cap=50e9):
    out = []
    for i in range(days):
        d = today + dt.timedelta(days=i)
        if d.weekday() >= 5:
            continue
        try:
            rows = json.loads(fetch("https://api.nasdaq.com/api/calendar/earnings?date=" + d.isoformat(), 20))["data"]["rows"] or []
        except Exception:
            continue
        big = []
        for r in rows:
            try:
                cap = float(re.sub(r"[^\d.]", "", r.get("marketCap") or "0") or 0)
            except ValueError:
                continue
            if cap >= min_cap:
                big.append((cap, r))
        for cap, r in sorted(big, key=lambda x: -x[0])[:8]:
            when = {"time-pre-market": "Before open", "time-after-hours": "After close"}.get(r.get("time"), "Time TBA")
            out.append(ev(d, when, "earnings", "%s (%s) reports earnings" % (re.sub(r"(,? (Inc\.?|Corporation|Corp\.?|Co\.|Ltd\.?|plc))+$", "", r["name"]).strip(" ,"), r["symbol"]),
                          "high" if cap >= 500e9 else "medium",
                          "Companies report profits and give guidance for the future. Stocks often move sharply on the gap between results and expectations." + (" Analysts expect EPS of %s." % r["epsForecast"] if r.get("epsForecast") else ""),
                          dict(market_cap_b=round(cap / 1e9), eps_forecast=r.get("epsForecast"))))
    return out


KEY_RELEASES = [
    ("Jobs report (Employment Situation)", "How many jobs the economy added last month and the unemployment rate. Published by the BLS, usually on the first Friday of the month at 8:30 AM ET.", "Strong jobs can mean a healthy economy but also fewer rate cuts. Weak jobs can spark recession worries. Both can move markets."),
    ("CPI (Consumer Price Index)", "The most-watched inflation number: how fast everyday prices are rising. Published monthly by the BLS.", "Inflation above expectations tends to push interest rates (and pressure on stocks) higher. Below expectations often lifts stocks."),
    ("PCE inflation", "The inflation gauge the Fed prefers, released with the BEA's personal income report.", "The Fed's 2% inflation target is measured with PCE, so this number directly shapes rate decisions."),
    ("FOMC decision", "The Federal Reserve's committee meets eight times a year to set short-term interest rates.", "Rates affect borrowing costs everywhere and how much investors will pay for stocks. The words in the statement matter as much as the decision."),
    ("GDP", "The total output of the US economy. Released quarterly in three estimates: advance, second and third.", "Shows if the economy is growing or shrinking, which drives company profit expectations."),
    ("Retail sales &amp; consumer spending", "How much shoppers spent last month. Published monthly by the Census Bureau.", "US consumers drive about two-thirds of the economy, so weak spending is an early warning."),
    ("ISM / PMI surveys", "Monthly surveys of purchasing managers. A reading above 50 signals expansion, below 50 contraction.", "A fast, forward-looking read on business conditions."),
]


ARCHIVE = os.path.join(DATA, "event_archive.json")


def build():
    today = dt.date.today()
    events, failed = [], []
    sources = [("fomc", lambda: fomc(today - dt.timedelta(days=45), today + dt.timedelta(days=200))),
               ("fed", lambda: fed_calendar(today - dt.timedelta(days=30), today + dt.timedelta(days=45))),
               ("bea", lambda: bea_upcoming(today) + bea_past(today - dt.timedelta(days=30), today)),
               ("treasury", lambda: treasury_upcoming(today, today + dt.timedelta(days=21)) + treasury_past(today - dt.timedelta(days=30), today - dt.timedelta(days=1))),
               ("earnings", lambda: earnings(today))]
    for name, fn in sources:
        try:
            events += fn()
        except Exception:
            failed.append(name)
    events += jobless(today)
    by_id = {}
    for e in events:  # same event from two sources: keep the first, but prefer one that has a link
        if e["id"] not in by_id or (not by_id[e["id"]].get("link") and e.get("link")):
            by_id[e["id"]] = e
    # archive keeps recent past events so recaps can be written after they happen
    try:
        arch = {e["id"]: e for e in json.load(open(ARCHIVE))["events"]}
    except Exception:
        arch = {}
    arch.update(by_id)
    cutoff = (today - dt.timedelta(days=45)).isoformat()
    arch = {k: v for k, v in arch.items() if v["date"] >= cutoff}
    json.dump(dict(updated=dt.datetime.utcnow().isoformat() + "Z", events=sorted(arch.values(), key=lambda e: e["date"])), open(ARCHIVE, "w"), separators=(",", ":"))
    upcoming = sorted([e for e in by_id.values() if e["date"] >= today.isoformat()], key=lambda e: (e["date"], {"high": 0, "medium": 1, "low": 2}[e["importance"]]))
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", today=today.isoformat(), timezone="US Eastern", events=upcoming, failed=failed,
                key_releases=[dict(name=n.replace("&amp;", "and"), what=w.replace("&amp;", "and"), why=y) for n, w, y in KEY_RELEASES],
                notes=["CPI and the jobs report come from the BLS, which blocks automated access, so their dates are not listed here. See bls.gov/schedule.",
                       "Dates and times can change. Always confirm with the official source before relying on a time."])


if __name__ == "__main__":
    c = build()
    json.dump(c, open(os.path.join(DATA, "calendar.json"), "w"), indent=1)
    from collections import Counter
    print(len(c["events"]), "upcoming", dict(Counter(e["kind"] for e in c["events"])), "failed:", c["failed"])
    arch = json.load(open(ARCHIVE))["events"]
    print(len(arch), "in archive;", "past:", len([e for e in arch if e["date"] < c["today"]]))
    for e in [x for x in c["events"]][:12]:
        print(e["date"], e["time"], e["importance"][0], e["kind"], e["title"][:70])
