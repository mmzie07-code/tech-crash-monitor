"""The 10-item crash-risk checklist. Each check returns a dict:
status: 'warn' | 'ok' | 'unknown'   (unknown = data source not wired up yet, excluded from score)
group:  'stretch' (how fragile) | 'trigger' (what could pop it)
"""
import sec
from providers import yahoo_closes, fred_series


def sma(vals, n):
    return sum(vals[-n:]) / n if len(vals) >= n else None


def pct(a, b):
    return (a / b - 1) * 100


# Backtest evidence (see data/BACKTEST.md): weight 2 = helped in both eras, 1 = weak/one era, 0 = no edge (context only)
WEIGHTS = {1: 0, 2: 1, 3: 1, 4: 1, 5: 0, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2}


def result(i, name, group, status, value=None, threshold=None, detail="", source="", proxy=False):
    return dict(id=i, name=name, group=group, status=status, value=value, threshold=threshold,
                detail=detail, source=source, proxy=proxy, weight=WEIGHTS.get(i, 1))


def pending(i, name, group, why):
    return result(i, name, group, "unknown", detail=why, source="not yet connected")


def c1_price_stretch(d):
    pe = d.get("PE")
    v = [c for _, c in d["QQQ"]]
    ext = pct(v[-1], sma(v, 200))
    if pe:
        return result(1, "Valuation (QQQ trailing P/E)", "stretch", "warn" if pe > 32 else "ok", round(pe, 1),
                      "P/E > 32 (2021 peak zone ~35-40; 2015-24 typical ~22-28)",
                      "QQQ trailing P/E %.1f; price is %.1f%% above its 200-day avg. Measures fragility, not timing: "
                      "stretch showed no short-term crash edge in backtests." % (pe, ext), "Yahoo Finance (yfinance)")
    return result(1, "Price stretch (valuation proxy)", "stretch", "warn" if ext > 15 else "ok",
                  round(ext, 1), "> +15% above 200-day avg",
                  "QQQ is %.1f%% above its 200-day average (P/E feed unavailable). Context only." % ext,
                  "Yahoo Finance", True)


def c2_concentration(d):
    q = {k: c for k, c in d["QQQ"]}
    e = {k: c for k, c in d["QQQE"]}
    days = sorted(set(q) & set(e))
    ratio = [q[x] / e[x] for x in days]
    chg = pct(ratio[-1], ratio[-126]) if len(ratio) > 126 else 0
    near_high = ratio[-1] >= max(ratio[-252:]) * 0.99
    warn = chg > 5 and near_high
    return result(2, "Mega-cap concentration", "stretch", "warn" if warn else "ok", round(chg, 1),
                  "> +5% in 6mo and at 1y high",
                  "Cap-weighted QQQ vs equal-weight QQQE: ratio moved %+.1f%% over 6 months." % chg,
                  "Yahoo Finance", True)


def c5_rates(d):
    v = [c for _, c in d["^TNX"]]
    chg = v[-1] - v[-63]
    return result(5, "Rates rising", "trigger", "warn" if chg > 0.4 else "ok", round(chg, 2),
                  "> +0.40 pts in 3mo",
                  "10Y yield %.2f%%, %+.2f pts over 3 months." % (v[-1], chg), "Yahoo Finance (^TNX)")


def c6_credit(d):
    """Credit-stress proxy: junk bonds (HYG) vs Treasuries (IEF). Falling ratio = lenders demanding more to hold risky debt.
    (The official FRED spread is unreachable from this machine and from GitHub Actions.)"""
    h, i = dict(d["HYG"]), dict(d["IEF"])
    days = sorted(set(h) & set(i))
    r = [h[x] / i[x] for x in days]
    if len(r) < 22:
        return pending(6, "Credit stress", "trigger", "not enough bond-fund history")
    chg = (r[-1] / r[-21] - 1) * 100
    return result(6, "Credit stress (junk bonds vs Treasuries)", "trigger", "warn" if chg < -2 else "ok", round(chg, 1),
                  "HYG falls > 2% vs IEF in 20 days",
                  "High-yield bond fund is %+.1f%% vs Treasuries over 20 trading days. Falling = investors demanding more to hold risky debt." % chg,
                  "Yahoo Finance (HYG, IEF)", True)


def c7_sentiment(d):
    v = [c for _, c in d["^VIX"]]
    avg = sum(v[-51:-1]) / 50
    ratio = v[-1] / avg
    return result(7, "Fear spike", "trigger", "warn" if ratio > 1.25 else "ok", round(v[-1], 1),
                  "VIX > 1.25x its 50-day avg",
                  "VIX %.1f is %.2fx its 50-day average. (Low VIX was NOT a useful warning in backtests.)" % (v[-1], ratio),
                  "Yahoo Finance (^VIX)", True)


def c8_trend(d):
    v = [c for _, c in d["QQQ"]]
    m50, m200 = sma(v, 50), sma(v, 200)
    dd = pct(v[-1], max(v[-252:]))
    warn = v[-1] < m50 or dd < -7
    return result(8, "Trend breakdown", "trigger", "warn" if warn else "ok", round(dd, 1),
                  "below 50-day avg or > 7% off high",
                  "QQQ %.1f%% from 1y high; %s 50-day, %s 200-day avg." % (
                      dd, "below" if v[-1] < m50 else "above", "below" if v[-1] < m200 else "above"),
                  "Yahoo Finance")


def c10_semis(d):
    s = [c for _, c in d["SMH"]]
    q = [c for _, c in d["QQQ"]]
    r10 = pct(s[-1], s[-11])
    rel = r10 - pct(q[-1], q[-11])
    warn = rel < -5
    return result(10, "Semiconductor leadership break (AI narrative proxy)", "trigger",
                  "warn" if warn else "ok", round(rel, 1), "SMH lags QQQ by > 5pts over 10 days",
                  "SMH %+.1f%% over 10 days (%+.1f pts vs QQQ). Best-performing signal in backtests." % (r10, rel),
                  "Yahoo Finance", True)


def c3_capex(d):
    x = d.get("SEC_CAPEX")
    if not x:
        return pending(3, "AI capex vs revenue gap", "stretch", "SEC EDGAR unreachable this run")
    gap = x["capex_growth"] - x["rev_growth"]
    return result(3, "AI capex vs revenue gap", "stretch", "warn" if gap > 25 else "ok", round(gap, 1),
                  "capex growth exceeds revenue growth by > 25 pts (unvalidated)",
                  "MSFT+GOOGL+AMZN+META capex $%.0fB TTM (%+.0f%% YoY, %.0f%% of revenue) vs revenue %+.0f%%. As of %s." % (
                      x["capex_ttm"], x["capex_growth"], x["intensity"], x["rev_growth"], x["as_of"]),
                  "SEC EDGAR XBRL")


def c9_insiders(d):
    x = d.get("SEC_INSIDER")
    if not x or x["ratio"] is None:
        return pending(9, "Insider selling", "trigger", "SEC EDGAR unreachable or no history")
    warn = x["ratio"] > 1.5 and x["recent_bought"] < 0.05 * x["recent_sold"]
    return result(9, "Insider selling", "trigger", "warn" if warn else "ok", round(x["ratio"], 2),
                  "last-90d sales > 1.5x prior average, with ~no buying (unvalidated)",
                  "NVDA/MSFT/GOOGL/AMZN/META/AVGO insiders sold $%.0fM in 90 days vs $%.0fM per-90d baseline (%.2fx); bought $%.1fM." % (
                      x["recent_sold"], x["baseline_sold"], x["ratio"], x["recent_bought"]), "SEC EDGAR Form 4")


PENDING = [
    pending(4, "Earnings deterioration", "trigger", "Needs analyst revision data (paid API)."),
]

CHECKS = [c1_price_stretch, c2_concentration, c3_capex, c5_rates, c6_credit, c7_sentiment, c8_trend, c9_insiders, c10_semis]


def load_data():
    d = {}
    for sym in ["QQQ", "QQQE", "SMH", "^TNX", "^VIX", "HYG", "IEF"]:
        d[sym] = yahoo_closes(sym)
    try:
        import yfinance
        d["PE"] = yfinance.Ticker("QQQ").info.get("trailingPE")
    except Exception:
        d["PE"] = None
    for key, fn in [("SEC_CAPEX", sec.capex_vs_revenue), ("SEC_INSIDER", sec.insider_selling)]:
        try:
            d[key] = fn()
        except Exception:
            d[key] = None
    return d


def run_all(d):
    out = []
    for fn in CHECKS:
        try:
            out.append(fn(d))
        except Exception as e:
            out.append(pending(int(fn.__name__[1:].split("_")[0]), fn.__name__, "trigger", "error: %s" % e))
    out += PENDING
    return sorted(out, key=lambda x: x["id"])
