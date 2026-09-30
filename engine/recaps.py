"""Event recaps -> data/recaps.json. Facts only (no AI): what was announced, how markets reacted, historical context, and for Fed decisions
what changed in the statement. AI_ANALYSIS is OFF until the owner enables it; each recap has an empty slot for it."""
import datetime as dt, difflib, html, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from calendar_feed import fetch, fomc_all, DATA, ARCHIVE
import history

AI_ANALYSIS = False
EPOCH = dt.date(2000, 1, 1)
REACT = [("^GSPC", "S&P 500", "pct"), ("^IXIC", "Nasdaq", "pct"), ("^DJI", "Dow", "pct"), ("^RUT", "Russell 2000", "pct"), ("^TNX", "10-year yield", "pts"),
         ("DX-Y.NYB", "US dollar", "pct"), ("^VIX", "VIX (fear gauge)", "pct"), ("GC=F", "Gold", "pct"), ("CL=F", "Oil", "pct"), ("BTC-USD", "Bitcoin", "pct")]
_cache = {}


def series(sym):
    if sym not in _cache:
        h = history.load(sym.replace("^", "_"))
        _cache[sym] = dict(h) if h else {}
    return _cache[sym]


def move_on(sym, date, unit="pct"):
    s = series(sym)
    d = (date - EPOCH).days
    if d not in s:
        return None
    prev = max((k for k in s if k < d), default=None)
    if prev is None:
        return None
    return round(s[d] - s[prev], 3) if unit == "pts" else round((s[d] / s[prev] - 1) * 100, 2)


def reaction(date):
    rows = []
    for sym, name, unit in REACT:
        m = move_on(sym, date, unit)
        if m is not None:
            rows.append(dict(name=name, move=m, unit=unit, symbol=sym))
    sectors = json.load(open(os.path.join(DATA, "sectors.json")))["sectors"]
    sec = [(s["name"], move_on("_S_" + s["key"], date)) for s in sectors]
    sec = sorted([x for x in sec if x[1] is not None], key=lambda x: -x[1])
    return rows, ({"best": dict(name=sec[0][0], move=sec[0][1]), "worst": dict(name=sec[-1][0], move=sec[-1][1])} if sec else None)


def clean(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()


# ---------- Fed statement ----------
def statement_sentences(d):
    page = fetch("https://www.federalreserve.gov/newsevents/pressreleases/monetary%s a.htm".replace(" ", "") % d.strftime("%Y%m%d"))
    i = page.find('id="article"')
    paras = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", page[i:] if i > 0 else page, re.S)]
    paras = [p for p in paras if len(p) > 40 and not re.search(r"For release at|media inquiries|Implementation Note", p)]
    if not paras:
        raise ValueError("no statement text")
    return paras


def split_sentences(paras):
    out = []
    for p in paras:
        out += [x.strip() for x in re.split(r"(?<=[.!?])(?<!\s[A-Z]\.)\s+(?=[A-Z])", p) if len(x.strip()) > 25]
    return out


def statement_changes(new, old):
    def best(s, pool):
        return max((difflib.SequenceMatcher(None, s.lower(), o.lower()).ratio() for o in pool), default=0)
    added = [s for s in new if best(s, old) < 0.86]
    removed = [s for s in old if best(s, new) < 0.86]
    return added[:6], removed[:6]


def fomc_recap(e, date):
    paras = statement_sentences(date)
    sents = split_sentences(paras)
    decision = next((s for s in sents if "target range for the federal funds rate" in s and "decided" in s), None)
    vote_bits = [x for x in sents if x.startswith("Voting") or "preferred" in x and "federal funds" in x]
    votes = " ".join(vote_bits) if vote_bits else next((p for p in paras if p.startswith("Voting")), None)
    kind = "raised" if decision and re.search(r"\braise", decision) else "cut" if decision and re.search(r"\blower|reduce", decision) else "held" if decision and re.search(r"maintain", decision) else None
    rng = re.search(r"to ([\d\-/ ]+ to [\d\-/ ]+ percent)", decision or "")
    bullets = []
    if decision:
        bullets.append("Decision: " + decision)
    if votes:
        bullets.append("Vote: " + votes)
    dates = [d for d, _ in fomc_all()]
    prev = max((d for d in dates if d < date), default=None)
    changes = None
    if prev:
        try:
            old = split_sentences(statement_sentences(prev))
            a, r = statement_changes(sents, old)
            changes = dict(since=prev.isoformat(), added=a, removed=r)
        except Exception:
            pass
    ctx = []
    moves = [m for m in (move_on("^GSPC", d) for d in dates if d < date and d > date - dt.timedelta(days=365 * 5)) if m is not None]
    today_m = move_on("^GSPC", date)
    if moves and today_m is not None:
        avg = sum(abs(m) for m in moves) / len(moves)
        ctx.append("On the %d previous Fed decision days we have data for, the S&P 500 moved an average of %.2f%% (up %d times, down %d). This time it moved %+.2f%%, %s than typical." % (
            len(moves), avg, sum(m > 0 for m in moves), sum(m < 0 for m in moves), today_m, "a bigger move" if abs(today_m) > avg else "a smaller move"))
    ctx.append("The decision came out at 2:00 PM and daily figures include the hours before it, so not all of the day's move is a reaction to the Fed.")
    head = "The Fed %s interest rates%s." % ({"raised": "raised", "cut": "cut", "held": "held"}.get(kind, "announced a decision on"), (" to a target range of " + rng.group(1)) if rng else "")
    return dict(headline=head, bullets=bullets, changes=changes, context=ctx, lesson=3,
                sources=[dict(label="Fed statement", url="https://www.federalreserve.gov/newsevents/pressreleases/monetary%sa.htm" % date.strftime("%Y%m%d")),
                         dict(label="Press conference", url="https://www.federalreserve.gov/monetarypolicy/fomcpressconf%s.htm" % date.strftime("%Y%m%d"))])


# ---------- BEA releases ----------
def bea_recap(e, date):
    raw = fetch("https://apps.bea.gov/rss/rss.xml")
    key = (e["title"].lower())
    want = "gdp" if key.startswith("gdp") else "personal income" if key.startswith("personal") else "international trade"
    for it in re.findall(r"<item[ >].*?</item>", raw, re.S):
        t = clean(re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(r"<title[^>]*>(.*?)</title>", it, re.S) or [None, ""])[1]))
        p = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", it, re.S)
        if not p or not t.lower().replace("u.s. ", "").startswith(want):
            continue
        try:
            if dt.datetime.strptime(p.group(1).strip()[5:16], "%d %b %Y").date() != date:
                continue
        except Exception:
            continue
        d = (re.search(r"<description[^>]*>(.*?)</description>", it, re.S) or [None, ""])[1]
        text = clean(re.sub(r"<!\[CDATA\[|\]\]>", "", d))
        sents = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
        link = (re.search(r"<link[^>]*>(.*?)</link>", it, re.S) or [None, ""])[1].strip()
        head = sents[0] if sents else t
        head = re.sub(r",? according to (the )?(third |second |advance )?estimates? released today.*", "", head)
        return dict(headline=head.rstrip(".") + ".", bullets=[s for s in sents[1:4]][:3], changes=None, lesson=3,
                    context=["Headline economic numbers matter most when they differ from what analysts expected. We don't have consensus forecasts, so judge the market reaction below as a guide to whether this was a surprise."],
                    sources=[dict(label="BEA release", url=link or "https://www.bea.gov/news/current-releases")])
    raise ValueError("BEA release not in feed yet")


# ---------- Treasury auctions ----------
def treasury_recap(e, date):
    typ, term = e["extra"]["type"], e["extra"]["term"]
    rows = json.loads(fetch("https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&type=%s&days=900" % typ))
    same = [r for r in rows if r.get("securityTerm") == term and r.get("bidToCoverRatio")]
    mine = next((r for r in same if r["auctionDate"][:10] == date.isoformat()), None)
    if not mine:
        raise ValueError("auction result not posted yet")
    others = [float(r["bidToCoverRatio"]) for r in same if r["auctionDate"][:10] < date.isoformat()][:8]
    btc = float(mine["bidToCoverRatio"])
    bullets = ["High yield (the highest rate accepted): %.3f%%." % float(mine["highYield"]) if mine.get("highYield") else "Yield: %s%%." % mine.get("averageMedianYield"),
               "Bid-to-cover ratio: %.2f (bids received per dollar sold)." % btc]
    ctx = []
    if others:
        avg = sum(others) / len(others)
        bullets.append("That is %s the average of %.2f over the previous %d %s auctions." % ("above" if btc > avg else "below" if btc < avg else "in line with", avg, len(others), term))
        ctx.append("Demand was %s than usual. %s" % ("stronger" if btc > avg + 0.05 else "weaker" if btc < avg - 0.05 else "about the same", "Weak auctions can push yields up; strong ones keep them steady."))
    if mine.get("offeringAmount"):
        bullets.append("Size: $%.0fB offered%s." % (float(mine["offeringAmount"]) / 1e9, (", $%.1fB accepted" % (float(mine["totalAccepted"]) / 1e9)) if mine.get("totalAccepted") else ""))
    return dict(headline="The Treasury sold %s %ss at a %.3f%% yield with demand %s." % (term, typ.lower(), float(mine.get("highYield") or mine.get("averageMedianYield")), "above average" if others and btc > sum(others) / len(others) else "below average" if others else "noted"),
                bullets=bullets, changes=None, context=ctx, lesson=3, sources=[dict(label="Auction results", url="https://www.treasurydirect.gov/auctions/results/")])


# ---------- Fed speeches / minutes / Beige Book ----------
def fed_generic_recap(e, date):
    title = e["title"]
    if title.startswith("Fed speaks:"):
        who = title.replace("Fed speaks: ", "")
        sur = re.findall(r"([A-Z][a-z]+)\s*$", who.strip())
        sur = sur[0] if sur else who
        for feed in ("speeches", "testimony"):
            try:
                raw = fetch("https://www.federalreserve.gov/feeds/%s.xml" % feed)
            except Exception:
                continue
            for it in re.findall(r"<item[ >].*?</item>", raw, re.S):
                t = clean(re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(r"<title[^>]*>(.*?)</title>", it, re.S) or [None, ""])[1]))
                p = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", it, re.S)
                l = (re.search(r"<link[^>]*>(.*?)</link>", it, re.S) or [None, ""])[1].strip()
                try:
                    pd = dt.datetime.strptime(p.group(1).strip()[5:16], "%d %b %Y").date()
                except Exception:
                    continue
                if t.startswith(sur + ",") and abs((pd - date).days) <= 1:
                    return dict(headline="%s spoke on: %s" % (who, t.split(",", 1)[1].strip()), bullets=["Read the full text at the link below. Look for any change in tone about inflation, jobs or future interest-rate moves."],
                                changes=None, context=["Individual Fed officials do not set rates alone, but their remarks show which way the committee may lean."], lesson=3, sources=[dict(label="Full remarks", url=l)])
        raise ValueError("speech text not published yet")
    if title.startswith("FOMC minutes"):
        m = re.search(r"meeting of ([A-Za-z]+) (\d+)-(\d+)", title)
        bullets, src = [], "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
        if m:
            mo = MONTHS_NUM.get(m.group(1))
            if mo:
                src = "https://www.federalreserve.gov/monetarypolicy/fomcminutes%s%02d%02d.htm" % (date.year if mo <= date.month else date.year - 1, mo, int(m.group(3)))
        return dict(headline="The Fed published the minutes of its last meeting.", bullets=["Markets read the minutes for hints about future rate changes and how divided officials were."], changes=None,
                    context=["Minutes are backward-looking, so they move markets mainly when they reveal more disagreement or urgency than the original statement showed."], lesson=3, sources=[dict(label="Minutes", url=src)])
    if title == "Fed Beige Book":
        return dict(headline="The Fed published its Beige Book on regional business conditions.", bullets=["It summarizes anecdotes from businesses in each Fed district about hiring, prices and demand."], changes=None,
                    context=["Words like 'softening' or 'slight growth' are compared with the previous edition."], lesson=3, sources=[dict(label="Beige Book", url="https://www.federalreserve.gov/monetarypolicy/beigebook/")])
    raise ValueError("unsupported")


MONTHS_NUM = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"])}


def earnings_recap(e, date):
    m = re.search(r"\(([A-Z.\-]+)\) reports", e["title"])
    days = json.load(open(os.path.join(DATA, "earnings.json"))).get("days", [])
    day = next((d for d in days if d["date"] == date.isoformat()), None)
    co = next((c for c in (day or {}).get("top", []) if m and c["symbol"].replace("/", "-") == m.group(1)), None)
    if not co or co.get("eps") is None:
        raise ValueError("results not posted yet")
    sym = co["symbol"].replace("/", "-")
    mv = None
    h = history.load(sym)
    if h:
        s = dict(h); d0 = (date - EPOCH).days
        days_sorted = sorted(s)
        nxt = next((k for k in days_sorted if k > d0), None)
        if d0 in s and nxt:
            mv = round((s[nxt] / s[d0] - 1) * 100, 2)
    bullets = list(co["bullets"])
    if mv is not None:
        bullets.append("Stock moved %+.2f%% on the next trading day." % mv)
    return dict(headline="%s reported %s: %s." % (co["name"], "after the close" if co.get("timing") == "time-after-hours" else "before the open" if co.get("timing") == "time-pre-market" else "earnings", "beat estimates" if co["eps_estimate"] is not None and co["eps"] > co["eps_estimate"] else "missed estimates" if co["eps_estimate"] is not None and co["eps"] < co["eps_estimate"] else "results in"),
                bullets=bullets, changes=None, context=["Stocks often move on how results compare with expectations and on the company's outlook, not on the results alone."], lesson=1,
                sources=[dict(label="SEC filings", url=co["filings"])], stock=sym)


def build_recap(e):
    date = dt.date.fromisoformat(e["date"])
    t = e["title"]
    if t.startswith("Fed interest-rate decision"):
        body = fomc_recap(e, date)
    elif e["kind"] == "data" and e.get("source") == "BEA":
        body = bea_recap(e, date)
    elif e["kind"] == "treasury":
        body = treasury_recap(e, date)
    elif e["kind"] == "fed":
        body = fed_generic_recap(e, date)
    elif e["kind"] == "earnings":
        body = earnings_recap(e, date)
    else:
        raise ValueError("no recap for this kind")
    rows, sec = reaction(date)
    body.update(reaction=rows, sectors=sec)
    body.update(id=e["id"], date=e["date"], time=e["time"], kind=e["kind"], title=t, status="final", ai_analysis=None, link=e.get("link"),
                generated=dt.datetime.utcnow().isoformat() + "Z")
    return body


def build():
    path = os.path.join(DATA, "recaps.json")
    old = {r["id"]: r for r in (json.load(open(path)).get("recaps", []) if os.path.exists(path) else [])}
    now = dt.datetime.utcnow()
    arch = json.load(open(ARCHIVE))["events"]
    done, tried = 0, 0
    for e in arch:
        d = dt.date.fromisoformat(e["date"])
        over = d < now.date() or (d == now.date() and now.hour >= 21)
        if not over or e["importance"] == "low" or (e["kind"] == "earnings" and e["importance"] != "high"):
            continue
        if e["id"] in old and old[e["id"]].get("status") == "final":
            continue
        tried += 1
        try:
            old[e["id"]] = build_recap(e)
            done += 1
        except Exception as ex:
            if e["id"] not in old:
                old[e["id"]] = dict(id=e["id"], date=e["date"], time=e["time"], kind=e["kind"], title=e["title"], status="pending", headline="Recap coming soon.",
                                    bullets=["The official results for this event haven't been published yet. We check again after each market day (%s)." % str(ex)[:60]], reaction=[], sectors=None, changes=None, context=[], sources=[], ai_analysis=None, link=e.get("link"), lesson=3)
    recs = sorted(old.values(), key=lambda r: (r["date"], r["time"]), reverse=True)[:150]
    return dict(generated=now.isoformat() + "Z", ai_analysis_enabled=AI_ANALYSIS, recaps=recs), tried, done


if __name__ == "__main__":
    out, tried, done = build()
    json.dump(out, open(os.path.join(DATA, "recaps.json"), "w"), indent=1)
    print("recaps:", len(out["recaps"]), "| attempted", tried, "| newly final", done)
    for r in out["recaps"][:8]:
        print(r["date"], r["status"][:5], r["title"][:55], "|", r["headline"][:90])
