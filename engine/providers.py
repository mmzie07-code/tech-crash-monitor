"""Market data providers. Stdlib only. Every fetch returns a list of (date, value) or raises."""
import csv, io, json, time, datetime as dt
import urllib.request as urlreq

UA = {"User-Agent": "Mozilla/5.0"}


def _get(url, timeout=25, tries=3):
    last = None
    for i in range(tries):
        try:
            with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network flake / rate limit: back off and retry
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def yahoo_closes(symbol, rng="2y"):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=1d" % (symbol, rng)
    j = json.loads(_get(url))
    res = j["chart"]["result"][0]
    ts = res["timestamp"]
    closes = res["indicators"]["quote"][0]["close"]
    out = []
    for t, c in zip(ts, closes):
        if c is not None:
            out.append((dt.datetime.utcfromtimestamp(t).date().isoformat(), float(c)))
    return out


def fred_series(series_id):
    raw = _get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s" % series_id, timeout=40).decode()
    out = []
    for row in csv.reader(io.StringIO(raw)):
        if len(row) == 2 and row[1] not in ("", ".") and row[0][:2] == "20":
            out.append((row[0], float(row[1])))
    return out
