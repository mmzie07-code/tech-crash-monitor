"""Features for the AI-bubble / crash-risk model. Every feature at date t uses only information that was public at t (macro series are lagged by their publication delay).
Index level: Nasdaq-100 (the AI-bubble proxy). Stock level: one row per stock per date."""
import numpy as np, pandas as pd
import mdata

H = 60            # horizon in trading days
DROP = 0.15       # index event: falls at least 15% within H days
FEATURES = [      # name, plain-English meaning, expected sign (+ = raises crash risk)
    ("ext200", "How far the Nasdaq-100 is above its 200-day average (log)", "+"),
    ("run24", "Two-year price run-up (log). Greenwood-Shleifer-You: 100% run-ups raise crash odds", "+"),
    ("mom12", "One-year price change (log)", "?"),
    ("dd252", "Current drawdown from the 1-year high (log, 0 = at the high)", "?"),
    ("vol20", "Recent volatility (20-day, annualized)", "+"),
    ("volratio", "Recent volatility relative to its 1-year level", "+"),
    ("sadf", "Explosiveness: right-tailed unit-root statistic (Phillips-Shi-Yu style) on log price", "+"),
    ("semi10", "Semiconductors vs Nasdaq-100, 10-day change (AI-narrative leadership)", "-"),
    ("semi60", "Semiconductors vs Nasdaq-100, 60-day change", "?"),
    ("breadth", "Cap-weighted vs equal-weighted S&P 500, 126-day change (narrowing breadth)", "+"),
    ("vixrel", "VIX relative to its 50-day average (log)", "+"),
    ("vixlvl", "VIX level (log)", "?"),
    ("credit", "Moody's Baa corporate spread over 10-year Treasury (%)", "+"),
    ("credit60", "60-day change in that credit spread", "+"),
    ("curve", "10-year minus 3-month Treasury yield (%)", "-"),
    ("y10chg", "3-month change in the 10-year yield (%)", "+"),
    ("ffrchg", "6-month change in the Fed funds rate (%)", "+"),
    ("m2yoy", "Money supply (M2) growth over 12 months (%)", "?"),
    ("nfci", "Chicago Fed financial conditions index (positive = tight)", "+"),
    ("valgdp", "Stock market value relative to nominal GDP, in standard deviations from its own history", "+"),
    ("margin", "Brokers' margin-loan growth over 12 months (%)", "+"),
]
NAMES = [f[0] for f in FEATURES]


def sadf(logp, windows=(120, 180, 250, 375, 500)):
    """Supremum over trailing windows of the ADF(0) t-statistic of the autoregressive coefficient (right tail). Large positive = explosive."""
    y = logp.astype(float); x = y.shift(1); d = y.diff(); out = pd.DataFrame(index=y.index)
    x = x - x.mean()
    for w in windows:
        n = float(w)
        sx = x.rolling(w).sum(); sd = d.rolling(w).sum(); sxx = (x * x).rolling(w).sum(); sxd = (x * d).rolling(w).sum(); sdd = (d * d).rolling(w).sum()
        vx = sxx - sx * sx / n
        b = (sxd - sx * sd / n) / vx
        sse = (sdd - sd * sd / n) - b * (sxd - sx * sd / n)
        se = np.sqrt((sse / (n - 2)) / vx)
        out[w] = b / se
    return out.max(axis=1)


def index_frame(refresh_days=3):
    """Daily DataFrame of index-level features + the Nasdaq-100 price, aligned to Nasdaq-100 trading days."""
    ndx = mdata.yahoo("^NDX", refresh_days=refresh_days)
    ndx = ndx[ndx.index >= "1985-10-01"]
    idx = ndx.index
    lp = np.log(ndx)
    f = pd.DataFrame(index=idx)
    f["ext200"] = lp - np.log(ndx.rolling(200).mean())
    f["run24"] = lp - lp.shift(504)
    f["mom12"] = lp - lp.shift(252)
    f["dd252"] = lp - np.log(ndx.rolling(252).max())
    ret = lp.diff()
    f["vol20"] = ret.rolling(20).std() * np.sqrt(252)
    f["volratio"] = f["vol20"] / (ret.rolling(252).std() * np.sqrt(252))
    f["sadf"] = sadf(lp)
    sox = mdata.yahoo("^SOX", refresh_days=refresh_days).reindex(idx).ffill()
    rel = np.log(sox / ndx)
    f["semi10"] = rel - rel.shift(10)
    f["semi60"] = rel - rel.shift(60)
    try:
        spy = mdata.yahoo("SPY", refresh_days=refresh_days).reindex(idx).ffill(); rsp = mdata.yahoo("RSP", refresh_days=refresh_days).reindex(idx).ffill()
        r = np.log(spy / rsp); f["breadth"] = (r - r.shift(126))
    except Exception:
        f["breadth"] = np.nan
    vix = mdata.yahoo("^VIX", refresh_days=refresh_days).reindex(idx).ffill()
    f["vixrel"] = np.log(vix / vix.rolling(50).mean())
    f["vixlvl"] = np.log(vix)
    credit = mdata.asof(mdata.fred("BAA10Y"), idx, 1)
    f["credit"] = credit
    f["credit60"] = credit - credit.shift(60)
    f["curve"] = mdata.asof(mdata.fred("T10Y3M"), idx, 1)
    tnx = mdata.yahoo("^TNX", refresh_days=refresh_days).reindex(idx).ffill() / 10.0
    f["y10chg"] = tnx - tnx.shift(63)
    ffr = mdata.asof(mdata.fred("DFF"), idx, 1)
    f["ffrchg"] = ffr - ffr.shift(126)
    m2 = mdata.fred("M2SL"); m2g = (m2 / m2.shift(12) - 1) * 100
    f["m2yoy"] = mdata.asof(m2g.dropna(), idx, 45)
    f["nfci"] = mdata.asof(mdata.fred("NFCI"), idx, 8)
    gdp = mdata.asof(mdata.fred("GDP"), idx, 120)
    spx = mdata.yahoo("^GSPC", refresh_days=refresh_days).reindex(idx).ffill()
    vg = np.log(spx) - np.log(gdp)
    f["valgdp"] = (vg - vg.expanding(min_periods=750).mean()) / vg.expanding(min_periods=750).std()   # standardized against its own past only
    try:
        mg = mdata.fred("BOGZ1FL663067003Q"); mgg = (mg / mg.shift(4) - 1) * 100
        f["margin"] = mdata.asof(mgg.dropna(), idx, 160)
    except Exception:
        f["margin"] = np.nan
    f["price"] = ndx
    return f


def add_target(f, h=H, drop=DROP):
    """y = 1 if the Nasdaq-100 closes at least `drop` below today's close at any point in the next `h` trading days. NaN for the last h days."""
    p = f["price"]
    fmin = p[::-1].rolling(h, min_periods=h).min()[::-1].shift(-1)
    f = f.copy()
    f["fwd_min"] = fmin / p - 1
    f["y"] = np.where(f["fwd_min"].isna(), np.nan, (f["fwd_min"] <= -drop).astype(float))
    return f
