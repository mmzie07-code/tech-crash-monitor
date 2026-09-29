"""Daily market brief -> data/brief.json
Facts are computed from the day's data; headlines come from public RSS feeds (titles + links only).
If ANTHROPIC_API_KEY is set, a short plain-English summary is added (optional)."""
import json, os, re, datetime as dt, html
import xml.etree.ElementTree as ET
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
FEEDS = [("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html", 4),
         ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories", 4),
         ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex", 3)]
ASSETS = {"^VIX": "VIX (fear gauge)", "^TNX": "10-year Treasury yield", "DX-Y.NYB": "US dollar index", "CL=F": "Crude oil", "GC=F": "Gold", "BTC-USD": "Bitcoin"}


def pct(v):
    return "%+.2f%%" % v


def headlines():
    out, seen = [], set()
    for src, url, per_feed in FEEDS:
        try:
            raw = urlreq.urlopen(urlreq.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read()
            n = 0
            for it in ET.fromstring(raw).iter("item"):
                title = html.unescape((it.findtext("title") or "").strip())
                link = (it.findtext("link") or "").strip()
                key = re.sub(r"\W+", "", title.lower())[:50]
                if not title or not link.startswith("http") or key in seen:
                    continue
                seen.add(key)
                out.append(dict(title=title, source=src, link=link, published=(it.findtext("pubDate") or "")[:25]))
                n += 1
                if n >= per_feed:
                    break
        except Exception:
            continue
    return out


def notes(mk):
    """Educational 'why it may matter' notes, triggered by unusually large moves. Deliberately hedged."""
    a = {r["symbol"]: r for r in mk.get("macro", [])}
    out = []
    oil = a.get("CL=F")
    if oil and oil["d1"] is not None and abs(oil["d1"]) >= 2:
        out.append("Oil %s today. Energy prices feed into inflation expectations, which can influence interest rates and airline, shipping and energy stocks." % pct(oil["d1"]))
    y = a.get("^TNX")
    if y and y["d1"] is not None and abs(y["d1"]) >= 0.05:
        out.append("The 10-year yield moved %+.2f points to %.2f%%. Higher yields make safer bonds more competitive with stocks and can weigh on expensive growth and tech shares." % (y["d1"], y["last"]))
    v = a.get("^VIX")
    if v and v["d1"] is not None and abs(v["d1"]) >= 8:
        out.append("The VIX (expected volatility) jumped %s to %.1f. Rising fear often accompanies sharp stock drops, but spikes usually fade quickly." % (pct(v["d1"]), v["last"]) if v["d1"] > 0 else "The VIX fell %s to %.1f, a sign of calming nerves." % (pct(v["d1"]), v["last"]))
    d = a.get("DX-Y.NYB")
    if d and d["d1"] is not None and abs(d["d1"]) >= 0.5:
        out.append("The US dollar moved %s. A stronger dollar can squeeze the overseas profits of US multinationals; a weaker one tends to help them." % pct(d["d1"]))
    g = a.get("GC=F")
    if g and g["d1"] is not None and abs(g["d1"]) >= 1:
        out.append("Gold moved %s. Investors often buy gold when they are worried about inflation or turmoil." % pct(g["d1"]))
    b = a.get("BTC-USD")
    if b and b["d1"] is not None and abs(b["d1"]) >= 3:
        out.append("Bitcoin moved %s, showing appetite (or lack of it) for speculative assets." % pct(b["d1"]))
    sec = [r for r in mk.get("sectors", []) if r["d1"] is not None]
    if sec:
        spread = max(r["d1"] for r in sec) - min(r["d1"] for r in sec)
        if spread >= 2:
            out.append("A %.1f-point gap between the best and worst sectors means money is rotating between parts of the economy, not moving as one." % spread)
    return out or ["No unusually large moves in rates, oil, the dollar, gold or volatility today. Quiet days are normal, and most days are unremarkable."]


def build():
    mk = json.load(open(os.path.join(DATA, "markets.json")))
    snap = json.load(open(os.path.join(DATA, "latest.json")))
    try:
        hist = json.load(open(os.path.join(DATA, "history.json")))
    except Exception:
        hist = []
    idx = {r["symbol"]: r for r in mk.get("indices", [])}
    secs = sorted([r for r in mk.get("sectors", []) if r["d1"] is not None], key=lambda r: -r["d1"])
    up = sum(1 for r in secs if r["d1"] > 0)
    spx = idx.get("^GSPC")
    mood = "no clear direction"
    if spx and spx["d1"] is not None:
        mood = "higher" if spx["d1"] > 0.3 else "lower" if spx["d1"] < -0.3 else "little changed"
    move = ("%s %.2f%%" % ("rose" if spx["d1"] > 0 else "fell", abs(spx["d1"]))) if spx and spx["d1"] is not None else "n/a"
    headline = "US stocks finished %s. The S&P 500 %s" % (mood, move) + (", with %d of 11 sectors up." % up if secs else ".")

    S = []
    S.append(dict(title="How the market did", bullets=["%s: %s today, %s this month, %s this year" % (r["name"], pct(r["d1"]), pct(r["m1"]), pct(r["ytd"])) for r in mk.get("indices", []) if r["d1"] is not None]))
    if secs:
        S.append(dict(title="Sectors: leaders and laggards", bullets=["Leading: " + ", ".join("%s %s" % (r["name"], pct(r["d1"])) for r in secs[:3]),
                                                                 "Lagging: " + ", ".join("%s %s" % (r["name"], pct(r["d1"])) for r in secs[-3:][::-1]),
                                                                 "%d of 11 sectors rose." % up]))
    macro = []
    for r in mk.get("macro", []):
        if r["symbol"] in ASSETS and r["d1"] is not None:
            macro.append("%s: %s (%s today)" % (ASSETS[r["symbol"]], ("%.2f%%" % r["last"]) if r["kind"] == "yield" else "{:,.2f}".format(r["last"]),
                                                ("%+.2f pts" % r["d1"]) if r["kind"] == "yield" else pct(r["d1"])))
    S.append(dict(title="Rates, currencies, commodities", bullets=macro))
    S.append(dict(title="Why it may matter", bullets=notes(mk)))
    prev = [h for h in hist if h["date"] < snap["date"]]
    delta = ""
    if prev and prev[-1].get("score") is not None:
        d = snap["score"] - prev[-1]["score"]
        delta = " (%s from %d on %s)" % ("unchanged" if d == 0 else "%+d" % d, prev[-1]["score"], prev[-1]["date"])
    flash = [c["name"] for c in snap["checks"] if c["status"] == "warn"]
    S.append(dict(title="AI & Tech Watch", bullets=["Crash-risk score %d, %s risk%s." % (snap["score"], snap["level"], delta),
                                                    ("Warning signs flashing: " + "; ".join(flash) + ".") if flash else "No warning signs flashing.",
                                                    "%d of %d checks are live. The score is a modest tilt in odds, not a prediction." % (snap["evaluated"], snap["total"])]))
    out = dict(date=mk["indices"][0]["date"] if mk.get("indices") else snap["date"], generated=dt.datetime.utcnow().isoformat() + "Z",
               headline=headline, sections=S, headlines=headlines(), summary=None,
               disclaimer="Automatically generated from market data and public headlines. Educational only, not investment advice.")
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        try:
            facts = headline + "\n" + "\n".join(b for s in S for b in s["bullets"]) + "\nHeadlines:\n" + "\n".join(h["title"] for h in out["headlines"][:8])
            req = urlreq.Request("https://api.anthropic.com/v1/messages", data=json.dumps({
                "model": "claude-sonnet-5-5", "max_tokens": 400,
                "messages": [{"role": "user", "content": "Write a 90-120 word plain-English market summary for high-school and college students, "
                              "using ONLY the facts below. Do not predict prices, do not give investment advice, do not invent causes for moves "
                              "(say 'headlines mention X' if relevant). Define any jargon in passing.\n\n" + facts}]}).encode(),
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            out["summary"] = json.loads(urlreq.urlopen(req, timeout=60).read())["content"][0]["text"].strip()
        except Exception:
            pass
    return out


if __name__ == "__main__":
    b = build()
    json.dump(b, open(os.path.join(DATA, "brief.json"), "w"), indent=1)
    print(b["headline"], "|", len(b["headlines"]), "headlines")
