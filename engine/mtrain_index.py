"""Train and honestly validate the market-level (Nasdaq-100) crash-risk model.
Walk-forward: for each test year, fit only on data that ended at least `EMBARGO` days earlier, pick the ridge penalty by chronological cross-validation
inside the training window, predict the test year. Everything reported is out of sample."""
import json, sys
import numpy as np, pandas as pd
import mfeatures as F, mmodel as M

START = "1996-01-01"
FIRST_TEST = 2003
EMBARGO = 100          # calendar days between the end of training data and the first test day (labels look 60 trading days ahead)
LAMS = [0.0005, 0.002, 0.01, 0.05, 0.2]
LADDER = [
    ("M0 base rate", []),
    ("M1 volatility", ["vol20", "volratio", "vixlvl"]),
    ("M2 + price action", ["vol20", "volratio", "vixlvl", "ext200", "run24", "mom12", "dd252", "sadf"]),
    ("M3 + market structure", ["vol20", "volratio", "vixlvl", "ext200", "run24", "mom12", "dd252", "sadf", "semi10", "semi60", "breadth"]),
    ("M4 + credit, rates, liquidity", ["vol20", "volratio", "vixlvl", "ext200", "run24", "mom12", "dd252", "sadf", "semi10", "semi60", "breadth", "vixrel", "credit", "credit60", "curve", "y10chg", "ffrchg", "m2yoy", "nfci"]),
    ("M5 full (+ valuation, margin debt)", F.NAMES),
]


def standardize(train, cols, apply):
    mu = train[cols].mean(); sd = train[cols].std().replace(0, 1)
    return ((apply[cols] - mu) / sd).fillna(0.0).values, mu, sd


def pick_lambda(tr, cols, nfold=5):
    """Chronological blocked CV inside the training window (with gaps), choosing the penalty with the best out-of-fold log loss."""
    n = len(tr); edges = np.linspace(0, n, nfold + 1).astype(int); best = (None, 1e9)
    for lam in LAMS:
        losses = []
        for k in range(1, nfold):   # first block is only ever training data
            te = np.arange(edges[k], edges[k + 1]); trn = np.arange(0, max(0, edges[k] - 70))
            if len(trn) < 500 or tr["y"].iloc[trn].sum() < 20:
                continue
            Xtr, mu, sd = standardize(tr.iloc[trn], cols, tr.iloc[trn]); Xte, _, _ = standardize(tr.iloc[trn], cols, tr.iloc[te])
            b0, b = M.fit_logit(Xtr, tr["y"].iloc[trn].values, lam)
            losses.append(M.logloss(tr["y"].iloc[te].values, M.predict(Xte, b0, b)))
        if losses and np.mean(losses) < best[1]:
            best = (lam, float(np.mean(losses)))
    return best[0] or 0.01


def walk_forward(df, cols, label):
    preds = []
    for yr in range(FIRST_TEST, df.index[-1].year + 1):
        te = df[(df.index.year == yr) & df["y"].notna()]
        if te.empty:
            continue
        tr = df[(df.index < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=EMBARGO)) & df["y"].notna()]
        if len(tr) < 1200 or tr["y"].sum() < 25:
            continue
        if not cols:
            p = np.full(len(te), tr["y"].mean())
        else:
            lam = pick_lambda(tr, cols)
            Xtr, mu, sd = standardize(tr, cols, tr); Xte, _, _ = standardize(tr, cols, te)
            b0, b = M.fit_logit(Xtr, tr["y"].values, lam)
            p = M.predict(Xte, b0, b)
        preds.append(pd.Series(p, index=te.index))
    return pd.concat(preds)


def run(verbose=True):
    f = F.add_target(F.index_frame())
    df = f[f.index >= START].copy()
    out = {}
    base = df[df["y"].notna() & (df.index.year >= FIRST_TEST)]
    for name, cols in LADDER:
        p = walk_forward(df, cols, name)
        y = df.loc[p.index, "y"].values
        out[name] = dict(p=p, y=y, auc=M.auc(y, p.values), brier=M.brier(y, p.values), logloss=M.logloss(y, p.values), ci=M.block_bootstrap_auc(y, p.values) if cols else (0.5, 0.5))
    if verbose:
        print("Out-of-sample %d-%s, n=%d days, event rate %.1f%%" % (FIRST_TEST, df.index[-1].year, len(out[LADDER[0][0]]["y"]), 100 * out[LADDER[0][0]]["y"].mean()))
        b = out[LADDER[0][0]]
        for name, _ in LADDER:
            r = out[name]
            print("%-36s AUC %.3f (90%% CI %.3f-%.3f)  Brier %.4f (%+.1f%% vs base)  logloss %.4f" % (name, r["auc"], r["ci"][0], r["ci"][1], r["brier"], 100 * (r["brier"] / b["brier"] - 1), r["logloss"]))
    return df, out


if __name__ == "__main__":
    run()
