"""Stock universe -> data/sectors.json (top 50 per sector) and data/search.json (every decent-size US-listed stock).
Source: Nasdaq stock screener (sector, industry, market cap, last price). Educational use."""
import json, os, re, time, datetime as dt
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
# Standard GICS sectors (what most investors expect). S&P 500 members get their official GICS sector and sub-industry;
# everything else falls back to Nasdaq's coarser labels, mapped across.
GICS = [("technology", "Information Technology"), ("health-care", "Health Care"), ("financials", "Financials"), ("consumer-discretionary", "Consumer Discretionary"),
        ("communication", "Communication Services"), ("industrials", "Industrials"), ("consumer-staples", "Consumer Staples"), ("energy", "Energy"),
        ("utilities", "Utilities"), ("real-estate", "Real Estate"), ("materials", "Materials")]
KEY = {name: key for key, name in GICS}
NASDAQ_TO_GICS = {"Technology": "Information Technology", "Health Care": "Health Care", "Finance": "Financials", "Consumer Discretionary": "Consumer Discretionary",
                  "Consumer Staples": "Consumer Staples", "Industrials": "Industrials", "Energy": "Energy", "Utilities": "Utilities", "Real Estate": "Real Estate",
                  "Basic Materials": "Materials", "Telecommunications": "Communication Services"}
BAD_NAME = re.compile(r"(%|\bnotes?\b|\bwarrants?\b|\bpreferred\b|\brights?\b|\bunits?\b|\bdepositary shares\b representing|\btrust preferred\b|\bsubordinated\b|\bdebentures?\b)", re.I)
STRIP = re.compile(r"\b(class [a-z]|common stock|ordinary shares?|american depositary (shares?|receipts?)|capital stock|common shares?|inc\.?|corporation|corp\.?|plc|ltd\.?|limited|company|co\.|holdings?|\(the\)|the|series [a-z]|non-voting|voting)\b", re.I)


def gics_table():
    """S&P 500 constituents with official GICS sector + sub-industry (from Wikipedia). Cached so a failed fetch doesn't lose data."""
    import html
    path = os.path.join(DATA, "gics.json")
    try:
        url = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=text&format=json&formatversion=2"
        t = json.loads(urlreq.urlopen(urlreq.Request(url, headers={"User-Agent": "TheAnalyticEducationalApp/1.0 (github.com/mmzie07-code/tech-crash-monitor)"}), timeout=40).read())["parse"]["text"]
        i = t.find('id="constituents"')
        out = {}
        for r in re.findall(r"<tr>(.*?)</tr>", t[i:t.find("</table>", i)], re.S)[1:]:
            c = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
            if len(c) >= 4 and c[2] in KEY:
                out[yahoo_sym(c[0])] = [c[2], c[3]]
        if len(out) > 400:
            json.dump(out, open(path, "w"), separators=(",", ":"))
            return out
    except Exception:
        pass
    return json.load(open(path)) if os.path.exists(path) else {}


def fetch():
    url = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true"
    for i in range(3):
        try:
            return json.loads(urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=60).read())["data"]["rows"]
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("Nasdaq screener unreachable")


def num(s, default=None):
    try:
        return float(re.sub(r"[^\d.\-]", "", s or ""))
    except ValueError:
        return default


def clean_name(n):
    n = re.sub(r"\s+(Common Stock|Common Shares?|Ordinary Shares?|Class [A-Z]( Common Stock| Ordinary Shares?| Capital Stock)?|Capital Stock|American Depositary (Shares?|Receipts?).*)$", "", n, flags=re.I)
    n = re.sub(r"\s+(Common Stock|Class [A-Z].*)$", "", n, flags=re.I)
    return n.strip(" ,.")


def yahoo_sym(s):
    return s.strip().replace("/", "-").replace(".", "-")


def build():
    rows = fetch()
    gics = gics_table()
    items = []
    for r in rows:
        sym = yahoo_sym(r["symbol"])
        g = gics.get(sym)
        sector_name = g[0] if g else NASDAQ_TO_GICS.get(r.get("sector"))
        cap, px = num(r.get("marketCap"), 0), num(r.get("lastsale"))
        if not sector_name or cap <= 0 or px is None or BAD_NAME.search(r["name"] or ""):
            continue
        items.append(dict(symbol=sym, name=clean_name(r["name"]), sector=KEY[sector_name], industry=(g[1] if g else (r.get("industry") or "").split(":")[-1]).strip(),
                          cap=cap, price=px, d1=num(r.get("pctchange"), 0.0), country=r.get("country") or "", raw=r["name"]))
    items.sort(key=lambda x: (-x["cap"], len(x["symbol"])))
    seen, uniq = set(), []
    for it in items:  # keep the biggest share class per company (GOOGL over GOOG, etc.)
        key = re.sub(r"[^a-z0-9]+", " ", STRIP.sub("", it["raw"].lower())).strip()[:40]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)
    for it in uniq:
        del it["raw"]
    sectors = []
    for key, name in GICS:
        members = [i for i in uniq if i["sector"] == key]
        sectors.append(dict(key=key, name=name, companies=len(members), total_cap_b=round(sum(m["cap"] for m in members) / 1e9),
                            top=[dict(symbol=m["symbol"], name=m["name"], industry=m["industry"], cap_b=round(m["cap"] / 1e9, 1), price=m["price"], d1=m["d1"], country=m["country"]) for m in members[:50]]))
    sectors.sort(key=lambda s: -s["total_cap_b"])
    search = [[i["symbol"], i["name"], i["sector"], round(i["cap"] / 1e9, 2), i["price"], i["d1"]] for i in uniq if i["cap"] >= 3e8]
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", sectors=sectors), dict(generated=dt.datetime.utcnow().isoformat() + "Z", stocks=search)


if __name__ == "__main__":
    sec, srch = build()
    os.makedirs(DATA, exist_ok=True)
    json.dump(sec, open(os.path.join(DATA, "sectors.json"), "w"), separators=(",", ":"))
    json.dump(srch, open(os.path.join(DATA, "search.json"), "w"), separators=(",", ":"))
    print("sectors:", [(s["name"], s["companies"], len(s["top"])) for s in sec["sectors"]], "| search:", len(srch["stocks"]))
    for s in sec["sectors"][:3]:
        print(s["name"], [(t["symbol"], t["cap_b"]) for t in s["top"][:6]])
