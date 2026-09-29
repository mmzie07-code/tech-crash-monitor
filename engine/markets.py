"""Broad-market snapshot: indices, sectors, and macro gauges -> data/markets.json"""
import datetime as dt
from providers import yahoo_closes

GROUPS = {
    "indices": [("^GSPC", "S&P 500"), ("^DJI", "Dow Jones"), ("^IXIC", "Nasdaq Composite"), ("^RUT", "Russell 2000")],
    "global": [("^FTSE", "UK FTSE 100"), ("^STOXX50E", "Euro Stoxx 50"), ("^N225", "Japan Nikkei 225"), ("^HSI", "Hong Kong Hang Seng")],
    "sectors": [("XLK", "Technology"), ("XLC", "Communication"), ("XLY", "Consumer Discretionary"), ("XLP", "Consumer Staples"),
                ("XLF", "Financials"), ("XLV", "Health Care"), ("XLI", "Industrials"), ("XLE", "Energy"),
                ("XLU", "Utilities"), ("XLB", "Materials"), ("XLRE", "Real Estate")],
    "macro": [("^VIX", "VIX (fear gauge)"), ("^TNX", "10-Year Treasury yield"), ("DX-Y.NYB", "US Dollar index"),
              ("CL=F", "Crude oil"), ("GC=F", "Gold"), ("BTC-USD", "Bitcoin")],
}
YIELDS = {"^TNX"}


def change(v, n):
    return round((v[-1] / v[-1 - n] - 1) * 100, 2) if len(v) > n else None


def one(sym, name):
    s = yahoo_closes(sym, "2y")
    v = [c for _, c in s]
    year = s[-1][0][:4]
    ytd_base = next((c for d, c in s if d[:4] == year), v[0])
    hi = max(v[-252:])
    row = dict(symbol=sym, name=name, date=s[-1][0], last=round(v[-1], 2), spark=[round(x, 2) for x in v[-60:]],
               from_high=round((v[-1] / hi - 1) * 100, 1))
    if sym in YIELDS:  # yields: report point changes, not percent
        row.update(kind="yield", d1=round(v[-1] - v[-2], 2), w1=round(v[-1] - v[-6], 2), m1=round(v[-1] - v[-22], 2),
                   ytd=round(v[-1] - ytd_base, 2), y1=round(v[-1] - v[-253], 2) if len(v) > 253 else None)
    else:
        row.update(kind="price", d1=change(v, 1), w1=change(v, 5), m1=change(v, 21), ytd=round((v[-1] / ytd_base - 1) * 100, 2),
                   y1=change(v, 252))
    return row


def build():
    out = dict(generated=dt.datetime.utcnow().isoformat() + "Z")
    for g, items in GROUPS.items():
        rows = []
        for sym, name in items:
            try:
                rows.append(one(sym, name))
            except Exception:
                pass  # one flaky symbol should not sink the whole snapshot
        out[g] = rows
    return out
