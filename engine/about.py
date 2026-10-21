"""Company descriptions -> data/about/<SYM>.json (one small file per company, cached between runs like data/snap).
Each holds 3 to 8 sentences on what the company does (the business summary from its regulatory filings, via Yahoo Finance; Nasdaq's company profile as a backup), plus a few balance-sheet numbers the page uses to write
the "how today's economy could affect it" note. Built up over several nights (largest companies first); a profile is re-fetched at most every ~90 days.
Set ABOUT_LIMIT to change how many companies are fetched per run (default 800)."""
import datetime as dt, html, http.cookiejar, json, os, re, sys, time
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
OUT = os.path.join(DATA, "about")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
ABBR = ["Inc.", "Corp.", "Co.", "Ltd.", "L.P.", "S.A.", "N.V.", "U.S.", "U.K.", "Dr.", "Mr.", "Mrs.", "St.", "No.", "vs.", "approx.", "e.g.", "i.e.", "Jr.", "Sr.", "B.V.", "A.G.", "S.p.A.", "p.l.c.", "Mt.", "Ft."]
MAX_SENT, MAX_CHARS, MIN_SENT = 8, 1100, 3
STALE_DAYS = 90


def sentences(text):
    t = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    t = re.sub(r"\s+", " ", t).strip()
    for a in ABBR:  # protect abbreviations so "Apple Inc. makes" isn't split
        t = t.replace(a, a.replace(".", "․"))
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'“(])", t)
    return [p.replace("․", ".").strip() for p in parts if len(p.strip()) > 2]


def trim(sents):
    out, n = [], 0
    for s in sents:
        if len(out) >= MAX_SENT or (n + len(s) > MAX_CHARS and len(out) >= MIN_SENT):
            break
        out.append(s)
        n += len(s)
    return out


def cap_text(cap_b):
    return "$%.1f trillion" % (cap_b / 1000) if cap_b >= 1000 else "$%.0f billion" % cap_b if cap_b >= 10 else "$%.1f billion" % cap_b


class Yahoo:
    """Yahoo's profile endpoint needs a cookie and a short-lived 'crumb'. Get both once, reuse them, and start over if Yahoo says they expired."""
    def __init__(self):
        self.op, self.crumb = None, None
        self.fails, self.dead = 0, False  # circuit breaker: after a few failures in a row, stop trying Yahoo this run and use the backup source

    def login(self):
        self.op = urlreq.build_opener(urlreq.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        try:
            self.op.open(urlreq.Request("https://fc.yahoo.com", headers={"User-Agent": "Mozilla/5.0"}), timeout=15)
        except Exception:
            pass  # a 404 is normal here; the cookie is still set
        self.crumb = self.op.open(urlreq.Request("https://query1.finance.yahoo.com/v1/test/getcrumb", headers={"User-Agent": "Mozilla/5.0"}), timeout=15).read().decode()

    def profile(self, sym):
        if self.dead:
            return None
        for attempt in range(3):
            try:
                if not self.crumb:
                    self.login()
                url = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=assetProfile&crumb=%s" % (sym, urlreq.quote(self.crumb))
                d = json.loads(self.op.open(urlreq.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read())
                self.fails = 0
                return d["quoteSummary"]["result"][0]["assetProfile"]
            except urlreq.HTTPError as e:
                if e.code == 404:
                    return None  # no profile for this symbol
                self.crumb = None  # expired or rate limited: log in again after a pause
                time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(1.5 * (attempt + 1))
        self.fails += 1
        if self.fails >= 4:
            self.dead = True
            print("about: Yahoo keeps failing, using Nasdaq for the rest of this run", flush=True)
        return None


YAHOO = Yahoo()


def fetch(sym):
    """(summary text, industry, sector, employees, city, country, website) from Yahoo, else from Nasdaq's profile."""
    p = YAHOO.profile(sym)
    if p and p.get("longBusinessSummary"):
        return dict(text=p["longBusinessSummary"], industry=p.get("industry"), sector=p.get("sector"), employees=p.get("fullTimeEmployees"), city=p.get("city"), country=p.get("country"), url=p.get("website"), source="Yahoo Finance")
    url = "https://api.nasdaq.com/api/company/%s/company-profile" % sym.replace("-", ".")
    for attempt in range(2):
        try:
            d = json.loads(urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25).read())
            v = {k: (x or {}).get("value") for k, x in (d.get("data") or {}).items() if isinstance(x, dict)}
            if v.get("CompanyDescription"):
                return dict(text=v["CompanyDescription"], industry=v.get("Industry"), sector=v.get("Sector"), url=v.get("CompanyUrl"), source="Nasdaq")
            return None
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


def last(a):
    for v in reversed(a or []):
        if v is not None:
            return v
    return None


def build_one(row, F):
    sym, name, sector, cap_b = row[0], row[1], row[2], row[3]
    p = fetch(sym)
    if p is None:
        return None
    sents = trim(sentences(p.get("text")))
    industry = (p.get("industry") or "").strip() or None
    pad = []
    if industry:
        pad.append("%s is classified in the %s industry." % (name, industry))
    pad.append("Its stock has a market value of about %s." % cap_text(cap_b))
    if industry and sector:
        pad.append("It is part of the %s sector." % sector.replace("-", " "))
    for s in pad:
        if len(sents) >= MIN_SENT:
            break
        sents.append(s)
    f = F.get(sym) or {}
    fin = dict(rev=last(f.get("rev")), ni=last(f.get("ni")), ocf=last(f.get("ocf")), debt=f.get("debt"), cash=(f.get("cash") or 0) + (f.get("sti") or 0) if f.get("cash") is not None else None,
               beta=f.get("beta"), div=last(f.get("dividends")), interest=last(f.get("interest")))
    return dict(sym=sym, name=name, desc=sents, industry=industry, sector_label=p.get("sector"), employees=p.get("employees"), city=p.get("city"), country=p.get("country"), url=p.get("url"), source=p.get("source"), generated=dt.date.today().isoformat(), fin={k: v for k, v in fin.items() if v is not None})


def main():
    S = json.load(open(os.path.join(DATA, "search.json")))["stocks"]
    F = json.load(open(os.path.join(DATA, "fundamentals.json")))["stocks"]
    os.makedirs(OUT, exist_ok=True)
    today = dt.date.today()
    todo = []
    for r in sorted(S, key=lambda r: -r[3]):  # largest companies first
        path = os.path.join(OUT, r[0] + ".json")
        if not os.path.exists(path):
            todo.append((0, r))
        elif (today - dt.date.fromtimestamp(os.path.getmtime(path))).days > STALE_DAYS:
            todo.append((1, r))
    todo = [r for _, r in sorted(todo, key=lambda x: x[0])][: int(os.environ.get("ABOUT_LIMIT", "800"))]
    done = 0
    for i, r in enumerate(todo):
        try:
            o = build_one(r, F)
            if o:
                json.dump(o, open(os.path.join(OUT, r[0] + ".json"), "w"), separators=(",", ":"))
                done += 1
        except Exception:
            pass
        time.sleep(0.15)
        if (i + 1) % 100 == 0:
            print("  about %d/%d" % (i + 1, len(todo)), flush=True)
    print("about: wrote %d of %d | total files: %d of %d companies" % (done, len(todo), len(os.listdir(OUT)), len(S)))


if __name__ == "__main__":
    main()
