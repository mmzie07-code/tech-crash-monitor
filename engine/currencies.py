"""Dollar vs. the world's currencies -> data/currencies.json (+ data/hist/FX_<CODE>.json for charts).
Facts only: today's rates (open.er-api.com, ~160 currencies), currency names (openexchangerates.org list), and price history from Yahoo Finance
(units of the currency per US dollar). Every change is stated from the dollar's side: + means the dollar bought more of that currency."""
import datetime as dt, json, math, os, statistics, sys, time
import urllib.request as urlreq

sys.path.insert(0, os.path.dirname(__file__))
import history

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
MAJORS = ["EUR", "JPY", "GBP", "CNY", "CAD", "CHF", "AUD", "MXN", "INR", "KRW", "BRL", "SEK"]
# Currencies officially fixed (or tightly held) to the dollar, or to the euro. Their price barely moves by design.
PEG_USD = {"AED", "SAR", "QAR", "BHD", "OMR", "JOD", "HKD", "PAB", "BSD", "BBD", "BZD", "ANG", "AWG", "XCD", "DJF", "ERN", "TMT", "KYD", "BMD", "CUP", "SSP"}
PEG_EUR = {"XOF", "XAF", "KMF", "BAM", "BGN", "DKK", "CVE", "XPF"}
NO_HIST = {"CLF", "XDR", "XAU", "XAG", "XPT", "XPD", "BTC"}   # units and metals, not ordinary currencies


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            return json.loads(urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=30).read())
        except Exception as e:
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError("%s: %s" % (url, last))


def yahoo_sym(c):
    return "%sUSD=X" % c if c in ("EUR", "GBP", "AUD", "NZD") else "%s=X" % c   # Yahoo quotes these four as dollars per unit


def pct(now, then):
    return round((now / then - 1) * 100, 2) if then else None


def stats(series):
    """series = [(iso date, units per dollar)] -> the dollar's change over each window, and the 52-week range."""
    d = [x for x in series if x[1]]
    if len(d) < 30:
        return None
    last = d[-1][1]
    ago = lambda n: d[-1 - n][1] if len(d) > n else None
    ytd0 = next((v for dd, v in reversed(d) if dd < d[-1][0][:4] + "-01-01"), d[0][1])
    y = [v for _, v in d[-260:]]
    ex = lambda a, b: pct(a, b)
    jump = max((abs(d[i][1] / d[i - 1][1] - 1) * 100 for i in range(max(1, len(d) - 260), len(d))), default=0)
    return dict(jump=round(jump, 1), d1=ex(last, ago(1)), d7=ex(last, ago(5)), d30=ex(last, ago(21)), ytd=ex(last, ytd0), y1=ex(last, ago(252)) if len(d) > 252 else None,
                y5=ex(last, d[0][1]) if len(d) > 1000 else None, lo52=min(y), hi52=max(y), pos52=round((last - min(y)) / (max(y) - min(y)) * 100) if max(y) > min(y) else None)


def save_fx(code, series):
    """Like history.save, but keeps 6 significant digits (rates near 1, like CAD or SGD, would turn blocky at 2 decimals)."""
    json.dump({"t": [history.day(dd) for dd, _ in series], "c": [float("%.6g" % v) for _, v in series]}, open(os.path.join(history.HIST, "FX_" + code + ".json"), "w"), separators=(",", ":"))


def build(fetch_history=True):
    er = get("https://open.er-api.com/v6/latest/USD")
    rates = er["rates"]
    try:
        names = get("https://openexchangerates.org/api/currencies.json")
    except Exception:
        names = {}
    rows, bad = [], 0
    os.makedirs(history.HIST, exist_ok=True)
    for code in sorted(rates):
        if code == "USD":
            continue
        row = dict(code=code, name=names.get(code, code), per=rates[code], peg="usd" if code in PEG_USD else "eur" if code in PEG_EUR else None, hist=False)
        if fetch_history and code not in NO_HIST:
            try:
                series = history.fetch(yahoo_sym(code), "5y", tries=2)
                if code in ("EUR", "GBP", "AUD", "NZD"):
                    series = [(dd, 1 / v) for dd, v in series if v]   # Yahoo gives dollars per unit; flip to units per dollar like every other row
                # a long Yahoo series can end a day or two behind today's rate; use today's rate as the final point when the dates allow
                st = stats(series)
                if st:
                    row.update(st)
                    row["hist"] = True
                    row["quirk"] = st["jump"] > 15 or abs(st["ytd"] or 0) > 100   # extreme or irregular: official vs street rates, or a change in the quoted rate
                    row["spark"] = [round(v, 6 if v < 1 else 2) for _, v in series[-90:][::3]]
                    save_fx(code, series)
            except Exception:
                bad += 1
            time.sleep(0.25)
        rows.append(row)
    have = [r for r in rows if r["hist"] and r.get("ytd") is not None and not r["peg"] and not r.get("quirk")]
    free = sorted(have, key=lambda r: r["ytd"])
    summary = dict(
        quirks=sum(1 for r in rows if r.get("quirk")), n=len(rows), with_history=sum(r["hist"] for r in rows), pegged=sum(1 for r in rows if r["peg"]),
        ytd_up=sum(1 for r in have if r["ytd"] > 0), ytd_down=sum(1 for r in have if r["ytd"] < 0), ytd_n=len(have),
        ytd_median=round(statistics.median([r["ytd"] for r in have]), 2) if have else None,
        dollar_weakest_vs=[r["code"] for r in free[:5]],      # dollar fell most against these (their currency gained most)
        dollar_strongest_vs=[r["code"] for r in free[::-1][:5]])
    dxy = None
    p = os.path.join(DATA, "hist", "DX-Y.NYB.json")
    if os.path.exists(p):
        j = json.load(open(p))
        ser = [((history.EPOCH + dt.timedelta(days=t)).isoformat(), c) for t, c in zip(j["t"], j["c"])]
        dxy = stats(ser)
        if dxy:
            dxy["level"] = round(ser[-1][1], 2)
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", rates_updated=er.get("time_last_update_utc"), dxy=dxy, majors=MAJORS, rows=rows, summary=summary,
                source="open.er-api.com (rates), Yahoo Finance (history, dollar index), openexchangerates.org (names)", failed_history=bad)


if __name__ == "__main__":
    d = build(fetch_history="--no-history" not in sys.argv)
    json.dump(d, open(os.path.join(DATA, "currencies.json"), "w"), separators=(",", ":"))
    print("currencies: %d rows, %d with history; summary %s; dxy %s" % (len(d["rows"]), d["summary"]["with_history"], d["summary"], d["dxy"]))
