import sys, numpy as np, pandas as pd
import mfeatures as F, mmodel as M, mtrain_index as T

SIGN = {n: s for n, _, s in F.FEATURES}
for _c in ["nearhigh"]+[c+"_nh" for c in ["ext200","run24","sadf","vol20","credit","valgdp","breadth"]]:
    SIGN[_c] = "?"

def fit_constrained(Xtr, y, cols, lam, constrain):
    """Ridge logit; features whose fitted sign contradicts the theory-based expected sign are dropped and the model refit (no use of test data)."""
    keep = list(range(len(cols)))
    for _ in range(6):
        b0, b = M.fit_logit(Xtr[:, keep], y, lam)
        bad = [k for j, k in enumerate(keep) if constrain and SIGN[cols[k]] != "?" and ((SIGN[cols[k]] == "+" and b[j] < 0) or (SIGN[cols[k]] == "-" and b[j] > 0))]
        if not bad:
            break
        keep = [k for k in keep if k not in bad]
        if not keep:
            return b0, np.zeros(len(cols))
    full = np.zeros(len(cols)); full[keep] = b
    return b0, full

def wf(df, cols, lams, constrain=False, years=None, extra=None):
    preds = []
    for yr in (years or range(T.FIRST_TEST, df.index[-1].year + 1)):
        te = df[(df.index.year == yr) & df["y"].notna()]
        tr = df[(df.index < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=T.EMBARGO)) & df["y"].notna()]
        if te.empty or len(tr) < 1200 or tr["y"].sum() < 25:
            continue
        T.LAMS = lams
        lam = T.pick_lambda(tr, cols)
        Xtr, mu, sd = T.standardize(tr, cols, tr); Xte, _, _ = T.standardize(tr, cols, te)
        b0, b = fit_constrained(Xtr, tr["y"].values, cols, lam, constrain)
        preds.append(pd.Series(M.predict(Xte, b0, b), index=te.index))
    return pd.concat(preds)

def report(name, p, df):
    y = df.loc[p.index, "y"].values; sel = p.index.year <= 2017
    r = lambda m: (M.auc(y[m], p.values[m]), M.brier(y[m], p.values[m]), M.logloss(y[m], p.values[m]))
    a, b = r(sel), r(~sel)
    base = [df.loc[p.index[m], "y"].mean() for m in (sel, ~sel)]
    print("%-34s design(2003-17) AUC %.3f Brier %.4f | event %.3f" % (name, a[0], a[1], base[0]), flush=True)
    return p

if __name__ == "__main__":
    f = F.add_target(F.index_frame()); df = f[f.index >= T.START].copy()
    nh = (df["dd252"] > -0.05).astype(float)
    for c in ["ext200", "run24", "sadf", "vol20", "credit", "valgdp", "breadth"]:
        df[c + "_nh"] = (df[c].fillna(df[c].mean()) - df[c].mean()) * nh
    df["nearhigh"] = nh
    ALL = F.NAMES
    base_lams = [0.0005, 0.002, 0.01, 0.05, 0.2]; big = [0.01, 0.05, 0.2, 1.0, 5.0]
    # restrict test years to the design period only
    yrs = range(2003, 2018)
    report("M2 price action (reference)", wf(df, T.LADDER[2][1], base_lams, years=yrs), df)
    report("M5 full", wf(df, ALL, base_lams, years=yrs), df)
    report("M5 heavier penalty", wf(df, ALL, big, years=yrs), df)
    report("M5 sign-constrained", wf(df, ALL, base_lams, True, years=yrs), df)
    report("M5 sign-constr + heavy", wf(df, ALL, big, True, years=yrs), df)
    ia = ALL + ["nearhigh"] + [c + "_nh" for c in ["ext200", "run24", "sadf", "vol20", "credit", "valgdp", "breadth"]]
    report("M5 + near-high interactions", wf(df, ia, big, False, years=yrs), df)
