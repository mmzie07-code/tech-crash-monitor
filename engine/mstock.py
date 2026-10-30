"""Stock-level crash-risk model: for each stock and date, the probability that it falls at least 20% (close to close) at some point in the next 60 trading days.
Cross-sectional features computed from daily closes only (momentum, volatility, extension, drawdown state, beta, AI-factor exposure) plus the market's own
structural crash probability. Walk-forward validated on up to 26 years of history for ~800 large US stocks (survivors: see the limits written on the page)."""
import json, math, os, sys, time
import numpy as np, pandas as pd
import mdata, mmodel as M

H, DROP = 60, 0.20
FEATS = [  # name, meaning, expected sign
    ("vol60", "Volatility, last 60 days (annualized, log)", "+"),
    ("vol252", "Volatility, last year (annualized, log)", "+"),
    ("volratio", "Recent volatility relative to last year's", "+"),
    ("ret1m", "Return, last month", "?"),
    ("ret3m", "Return, last 3 months", "?"),
    ("ret6m", "Return, last 6 months", "?"),
    ("ret12_1", "Return, months 2-12 back (momentum, skipping the latest month)", "?"),
    ("ret24", "Return, last 2 years (the run-up measure)", "+"),
    ("ext200", "How far above the 200-day average", "+"),
    ("dd252", "Drawdown from the 1-year high", "?"),
    ("maxret20", "Largest one-day gain in the last 20 days (lottery-like jumps)", "+"),
    ("skew120", "Skewness of daily returns, last 120 days", "?"),
    ("beta", "Sensitivity to the Nasdaq-100 (252-day beta)", "+"),
    ("aibeta", "Extra sensitivity to semiconductors beyond the Nasdaq-100 (AI-factor beta)", "+"),
    ("lnprice", "Share price (log): very low-priced stocks are crash-prone", "-"),
    ("mkt", "The market's structural crash probability today (logit)", "+"),
    ("mkt_beta", "Market crash probability x the stock's beta", "+"),
]
NAMES = [f[0] for f in FEATS]


def universe(n=800):
    s = json.load(open(os.path.join(os.path.dirname(__file__), "..", "data", "search.json")))["stocks"]
    rows = [r for r in s if r[4] and r[4] >= 5 and r[3] and "." not in r[0] and "^" not in r[0]]   # symbol, name, sector, cap_b, price
    rows.sort(key=lambda r: -r[3])
    return [r[0] for r in rows[:n]]


def load_prices(syms):
    out = {}
    for i, s in enumerate(syms):
        try:
            out[s] = mdata.yahoo(s, refresh_days=30)
        except Exception as e:
            print("skip", s, str(e)[:40])
        time.sleep(0.12)
        if (i + 1) % 100 == 0:
            print("  loaded %d/%d" % (i + 1, len(syms)), flush=True)
    return pd.DataFrame(out)


def wide_features(P, ndx, sox, mkt_logit):
    """Wide price frame P (dates x stocks) -> dict of wide feature frames (one per feature name). Used for training and for nightly scoring."""
    lp = np.log(P); r = lp.diff()
    rn = np.log(ndx).diff().reindex(P.index); rs = (np.log(sox).diff() - np.log(ndx).diff()).reindex(P.index)
    F = {}
    F["vol60"] = np.log(r.rolling(60, min_periods=50).std() * np.sqrt(252))
    F["vol252"] = np.log(r.rolling(252, min_periods=200).std() * np.sqrt(252))
    F["volratio"] = F["vol60"] - F["vol252"]
    F["ret1m"] = lp - lp.shift(21); F["ret3m"] = lp - lp.shift(63); F["ret6m"] = lp - lp.shift(126)
    F["ret12_1"] = lp.shift(21) - lp.shift(252); F["ret24"] = lp - lp.shift(504)
    F["ext200"] = lp - np.log(P.rolling(200, min_periods=180).mean())
    F["dd252"] = lp - np.log(P.rolling(252, min_periods=200).max())
    F["maxret20"] = r.rolling(20, min_periods=18).max()
    F["skew120"] = r.rolling(120, min_periods=100).skew()
    # two-factor rolling regression of each stock on (ndx, semis-minus-ndx): closed form from rolling covariances
    w = 252
    v1 = rn.rolling(w).var(); v2 = rs.rolling(w).var(); c12 = rn.rolling(w).cov(rs)
    c1 = r.rolling(w, min_periods=200).cov(rn); c2 = r.rolling(w, min_periods=200).cov(rs)
    det = (v1 * v2 - c12 ** 2)
    F["beta"] = c1.mul(v2, axis=0).sub(c2.mul(c12, axis=0)).div(det, axis=0)
    F["aibeta"] = c2.mul(v1, axis=0).sub(c1.mul(c12, axis=0)).div(det, axis=0)
    F["lnprice"] = lp
    ml = mkt_logit.reindex(P.index).ffill()
    F["mkt"] = pd.DataFrame({c: ml for c in P.columns})
    F["mkt_beta"] = F["mkt"] * F["beta"]
    return F


def feature_panel(P, ndx, sox, mkt_logit, every=5):
    """Long DataFrame of features sampled every `every` trading days, plus forward-return labels (for training and validation)."""
    F = wide_features(P, ndx, sox, mkt_logit)
    fmin = P[::-1].rolling(H, min_periods=H).min()[::-1].shift(-1)
    fwd = fmin / P - 1
    sample = P.index[260::every]
    long = []
    for name in NAMES:
        long.append(F[name].loc[sample].stack(future_stack=True).rename(name))
    D = pd.concat(long, axis=1)
    D["fwd"] = fwd.loc[sample].stack(future_stack=True).reindex(D.index)
    D["y"] = np.where(D["fwd"].isna(), np.nan, (D["fwd"] <= -DROP).astype(float))
    D.index.names = ["date", "sym"]
    return D


def xsec(D, cols=None):
    """Cross-sectional z-scores per date for the stock-specific features (market features are left as is). Winsorized at +/-3."""
    cols = cols or [c for c in NAMES if c not in ("mkt", "mkt_beta")]
    out = D.copy()
    g = D.groupby(level="date")[cols]
    z = (D[cols] - g.transform("mean")) / g.transform("std").replace(0, np.nan)
    out[cols] = z.clip(-3, 3)
    return out
