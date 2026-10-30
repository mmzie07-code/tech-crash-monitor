import sys, time, math, numpy as np, pandas as pd
import mstock as S, mfeatures as F, mmodel as M, mdata

SIGN = {n: s for n, _, s in S.FEATS}
EMB = 100


def market_logit():
    ndx = mdata.yahoo("^NDX"); r = np.log(ndx).diff()
    sig = np.sqrt((r ** 2).ewm(alpha=0.03, adjust=False).mean()).values
    b = math.log(0.85); mu = 0.10 / 252; s = sig * math.sqrt(S.H); m = mu * S.H
    Phi = np.vectorize(lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2))))
    q = np.clip(Phi((b - m) / s) + np.exp(2 * mu * b / sig ** 2) * Phi((b + m) / s), 1e-6, 0.999)
    return pd.Series(np.log(q / (1 - q)), index=ndx.index)


def fit_signed(X, y, cols, lam):
    keep = list(range(len(cols)))
    for _ in range(8):
        b0, b = M.fit_logit(X[:, keep], y, lam)
        bad = [k for j, k in enumerate(keep) if SIGN[cols[k]] != "?" and ((SIGN[cols[k]] == "+" and b[j] < 0) or (SIGN[cols[k]] == "-" and b[j] > 0))]
        if not bad:
            break
        keep = [k for k in keep if k not in bad]
        if not keep:
            return b0, np.zeros(len(cols))
    full = np.zeros(len(cols)); full[keep] = b
    return b0, full


def build_panel():
    P = S.load_prices(S.universe(800))   # cached under data/model_cache after the first run
    P = P[P.index >= "1995-06-01"].astype(float)
    P = P.loc[:, P.notna().sum() > 800]
    ndx = mdata.yahoo("^NDX"); sox = mdata.yahoo("^SOX")
    D = S.feature_panel(P, ndx, sox, market_logit())
    return S.xsec(D)


def metrics(D, p, label):
    y = D["y"].values
    # within-date ranking skill: mean AUC across dates (needs both outcomes on that date)
    d = pd.DataFrame({"y": y, "p": p}, index=D.index)
    aucs = []
    for dt_, g in d.groupby(level="date"):
        if g["y"].sum() >= 3 and g["y"].sum() <= len(g) - 3:
            aucs.append(M.auc(g["y"].values, g["p"].values))
    # decile lift: realized crash frequency by predicted decile, averaged across dates
    d["dec"] = d.groupby(level="date")["p"].transform(lambda s: pd.qcut(s.rank(method="first"), 10, labels=False))
    dec = d.groupby("dec")["y"].mean()
    print("%-34s pooled AUC %.3f | within-date AUC %.3f (n=%d dates) | crash rate: bottom decile %.3f, top decile %.3f, all %.3f" % (label, M.auc(y, p), np.mean(aucs), len(aucs), dec.iloc[0], dec.iloc[-1], y.mean()), flush=True)
    return dec


if __name__ == "__main__":
    t = time.time(); D = build_panel(); print("panel", D.shape, round(time.time() - t), "s", flush=True)
    D = D[D["y"].notna()].copy()
    for c in S.NAMES:
        D[c] = D[c].fillna(0.0)
    years = D.index.get_level_values("date").year
    LADDER = [("S1 volatility", ["vol60", "vol252", "volratio"]), ("S2 + momentum/extension", ["vol60", "vol252", "volratio", "ret1m", "ret3m", "ret6m", "ret12_1", "ret24", "ext200", "dd252"]),
              ("S3 + beta, AI exposure, jumps", ["vol60", "vol252", "volratio", "ret1m", "ret3m", "ret6m", "ret12_1", "ret24", "ext200", "dd252", "maxret20", "skew120", "beta", "aibeta", "lnprice"]),
              ("S4 + market state (full)", S.NAMES)]
    for name, cols in LADDER:
        preds = []
        for yr in range(2005, 2018):   # design period only
            tr = D[(D.index.get_level_values("date") < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=EMB))]
            te = D[years == yr]
            if len(te) == 0 or len(tr) < 50000:
                continue
            mu = tr[cols].mean(); sd = tr[cols].std().replace(0, 1)
            b0, b = fit_signed(((tr[cols] - mu) / sd).values, tr["y"].values, cols, 0.001)
            preds.append(pd.Series(M.predict(((te[cols] - mu) / sd).values, b0, b), index=te.index))
        p = pd.concat(preds); metrics(D.loc[p.index], p.values, name + " [design 2005-17]")
