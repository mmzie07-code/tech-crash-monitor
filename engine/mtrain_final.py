"""Fit the final models on all labeled data and write data/model/model.json (coefficients + the full validation record). Run by hand (monthly is plenty):
    python3 engine/mtrain_final.py
Needs ~800 stocks' long histories (downloaded and cached by mstock.load_prices) and the macro series (mdata)."""
import json, math, os, sys, time, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
import mfeatures as F, mmodel as M, mdata, mstock as S, mstock_train as ST, mtrain_index as TI, mexp

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "model", "model.json")
DESIGN_END = 2017
MU_ANNUAL, EWMA_ALPHA = 0.10, 0.03
Phi = np.vectorize(lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2))))


def first_passage(sig, h=60, drop=0.15, mu_d=MU_ANNUAL / 252):
    """P(min over h days of a Brownian motion with drift mu_d and daily volatility sig falls to ln(1-drop)): the reflection-principle formula."""
    b = math.log(1 - drop); s = sig * math.sqrt(h); m = mu_d * h
    return Phi((b - m) / s) + np.exp(2 * mu_d * b / sig ** 2) * Phi((b + m) / s)


def ewma_sigma(ndx):
    r = np.log(ndx).diff()
    return np.sqrt((r ** 2).ewm(alpha=EWMA_ALPHA, adjust=False).mean())


def summarize(y, p, mask=None):
    if mask is not None:
        y, p = y[mask], p[mask]
    return dict(n=int(len(y)), event_rate=round(float(np.mean(y)), 4), auc=round(M.auc(y, p), 3), brier=round(M.brier(y, p), 4), logloss=round(M.logloss(y, p), 4))


def episodes(price, series):
    """Nasdaq-100 peaks (highest close of the prior 120 days) followed by a fall of at least 15% within a year. Neighboring candidates are merged: the highest close in each cluster is the peak."""
    p = price.values; n = len(p); cand = []
    for t in range(120, n - 1):
        win = p[t + 1:t + 253]
        if len(win) < 20 or p[t] < p[t - 120:t].max():
            continue
        k = int(np.argmin(win)); depth = win[k] / p[t] - 1
        if depth <= -0.15:
            cand.append((t, t + 1 + k, depth))
    groups, cur = [], []
    for c in cand:
        if cur and c[0] - cur[-1][0] > 60:
            groups.append(cur); cur = []
        cur.append(c)
    if cur:
        groups.append(cur)
    picks = [max(g, key=lambda c: p[c[0]]) for g in groups]
    merged = []
    for c in picks:   # two peaks that bottom within a month of each other are one episode: keep the deeper
        if merged and abs(c[1] - merged[-1][1]) < 30:
            if c[2] < merged[-1][2]:
                merged[-1] = c
            continue
        merged.append(c)
    rows = []
    for t, k, depth in merged:
        if price.index[t].year < 1996:
            continue
        def at(lag):
            i = t - lag
            return None if i < 0 else round(float(series.iloc[i]), 3)
        rows.append(dict(peak=str(price.index[t].date()), trough=str(price.index[k].date()), depth=round(float(depth), 3), p_at_peak=at(0), p_30d_before=at(30), p_60d_before=at(60)))
    return rows


def market_part():
    f = F.add_target(F.index_frame()); df = f[f.index >= TI.START].copy()
    sig = ewma_sigma(df["price"]); q = np.clip(first_passage(sig.values), 1e-6, 0.999)
    df["lfp"] = np.log(q / (1 - q)); df["lfp"] = df["lfp"].fillna(df["lfp"].mean())
    lab = df[df["y"].notna()]
    # --- structural model, recalibrated (two parameters) with a walk-forward check
    mexp.SIGN["lfp"] = "+"
    pred = []
    for yr in range(2003, df.index[-1].year + 1):
        te = lab[lab.index.year == yr]; tr = lab[lab.index < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=TI.EMBARGO)]
        if te.empty or len(tr) < 1200:
            continue
        mu, sd = tr["lfp"].mean(), tr["lfp"].std(); b0, b = M.fit_logit(((tr[["lfp"]] - mu) / sd).values, tr["y"].values, 0.0005)
        pred.append(pd.Series(M.predict(((te[["lfp"]] - mu) / sd).values, b0, b), index=te.index))
    ps = pd.concat(pred); y = lab.loc[ps.index, "y"].values
    d = ps.index.year <= DESIGN_END
    base = pd.Series({yr: lab[lab.index < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=TI.EMBARGO)]["y"].mean() for yr in sorted(set(ps.index.year))}).reindex(ps.index.year).values
    struct = dict(design=summarize(y, ps.values, d), holdout=summarize(y, ps.values, ~d), all=summarize(y, ps.values),
                  base_design=summarize(y, base, d), base_holdout=summarize(y, base, ~d), calibration=[dict(pred=round(a, 3), obs=round(b, 3), n=n) for a, b, n in M.calibration(y, ps.values, 10)])
    # final calibration constants: logit(p_cal) = a + c * logit(p_fp)   (fit on everything labeled)
    mu, sd = lab["lfp"].mean(), lab["lfp"].std(); b0, b = M.fit_logit(((lab[["lfp"]] - mu) / sd).values, lab["y"].values, 0.0005)
    calib = dict(a=float(b0 - b[0] * mu / sd), c=float(b[0] / sd))
    # --- the fragility index (theory-signed ridge logistic on all 21 features) and its honest record
    cols = F.NAMES; lams = [0.0005, 0.002, 0.01, 0.05, 0.2]
    oos = mexp.wf(df, cols, lams, True)
    yf = df.loc[oos.index, "y"].values; dd = oos.index.year <= DESIGN_END
    TI.LAMS = lams; lam = TI.pick_lambda(lab, cols)
    Xtr, mu_f, sd_f = TI.standardize(lab, cols, lab); b0f, bf = mexp.fit_constrained(Xtr, lab["y"].values, cols, lam, True)
    uni = {}
    for c in cols:
        x = df[c].fillna(df[c].mean()); yy = df["y"]; ok = yy.notna(); sgn = -1 if mexp.SIGN[c] == "-" else 1
        res = {}
        for lbl, m in (("design", df.index.year <= DESIGN_END), ("holdout", df.index.year > DESIGN_END)):
            mm = ok & m; res[lbl] = round(M.auc(yy[mm].values, sgn * x[mm].values), 3)
        uni[c] = res
    feats = []
    for j, c in enumerate(cols):
        meaning = next(m for n, m, s in F.FEATURES if n == c)
        feats.append(dict(name=c, meaning=meaning, sign=mexp.SIGN[c], mu=round(float(mu_f[c]), 6), sd=round(float(sd_f[c]), 6), coef=round(float(bf[j]), 5), auc_design=uni[c]["design"], auc_holdout=uni[c]["holdout"]))
    frag = dict(intercept=round(float(b0f), 5), lam=lam, features=feats, design=summarize(yf, oos.values, dd), holdout=summarize(yf, oos.values, ~dd))
    # the earlier complexity ladder (free logistic models), for the record
    ladder = []
    for name, c2 in TI.LADDER[1:]:
        p = mexp.wf(df, c2, lams, False); yl = df.loc[p.index, "y"].values; dm = p.index.year <= DESIGN_END
        ladder.append(dict(model=name, n_features=len(c2), design=summarize(yl, p.values, dm), holdout=summarize(yl, p.values, ~dm)))
    ps_all = pd.Series(M.predict(((df[["lfp"]] - mu) / sd).values, b0, b), index=df.index)
    eps = episodes(df["price"], ps_all)
    for e in eps:
        pk = pd.Timestamp(e["peak"])
        e["fragility_at_peak"] = round(float(oos.iloc[oos.index.searchsorted(pk)]), 3) if pk >= oos.index[0] and oos.index.searchsorted(pk) < len(oos) else None   # out-of-sample values exist from 2003
    return dict(equation=dict(h=60, drop=0.15, mu_annual=MU_ANNUAL, ewma_alpha=EWMA_ALPHA, calib=calib, mu_lfp=float(mu), sd_lfp=float(sd), base_rate=round(float(lab["y"].mean()), 4)),
                structural=struct, fragility=frag, ladder=ladder, episodes=eps, trained_through=str(lab.index[-1].date()), n_days=int(len(lab)), event_rate=round(float(lab["y"].mean()), 4))


def stock_part():
    D = ST.build_panel()
    D = D[D["y"].notna()].copy()
    for c in S.NAMES:
        D[c] = D[c].fillna(0.0)
    cols = ["vol60", "vol252", "volratio", "ret1m", "ret3m", "ret6m", "ret12_1", "ret24", "ext200", "dd252", "maxret20", "skew120", "beta", "aibeta", "lnprice"]
    yrs = D.index.get_level_values("date").year
    lad = [("S1 volatility", cols[:3]), ("S2 + momentum and extension", cols[:10]), ("S3 + beta, AI exposure, jumps, price", cols)]
    rows, decs = [], {}
    def dec_table(Dd, p):
        d = pd.DataFrame({"y": Dd["y"].values, "p": p}, index=Dd.index)
        d["dec"] = d.groupby(level="date")["p"].transform(lambda s: pd.qcut(s.rank(method="first"), 10, labels=False))
        return [round(float(v), 4) for v in d.groupby("dec")["y"].mean().values]
    def within(Dd, p):
        d = pd.DataFrame({"y": Dd["y"].values, "p": p}, index=Dd.index); a = []
        for _, g in d.groupby(level="date"):
            if 3 <= g["y"].sum() <= len(g) - 3:
                a.append(M.auc(g["y"].values, g["p"].values))
        return round(float(np.mean(a)), 3)
    byyear = {}
    for name, cc in lad:
        res = {}
        for lbl, rng_ in (("design", range(2005, DESIGN_END + 1)), ("holdout", range(DESIGN_END + 1, 2027))):
            preds = []
            for yr in rng_:
                tr = D[D.index.get_level_values("date") < pd.Timestamp(yr, 1, 1) - pd.Timedelta(days=100)]; te = D[yrs == yr]
                if len(te) == 0 or len(tr) < 50000:
                    continue
                mu = tr[cc].mean(); sd = tr[cc].std().replace(0, 1)
                b0, b = ST.fit_signed(((tr[cc] - mu) / sd).values, tr["y"].values, cc, 0.001)
                preds.append(pd.Series(M.predict(((te[cc] - mu) / sd).values, b0, b), index=te.index))
            p = pd.concat(preds); Dd = D.loc[p.index]
            dt_ = dec_table(Dd, p.values)
            res[lbl] = dict(n=int(len(Dd)), crash_rate=round(float(Dd["y"].mean()), 4), pooled_auc=round(M.auc(Dd["y"].values, p.values), 3), within_date_auc=within(Dd, p.values), deciles=dt_)
            if name.startswith("S3"):
                yy = Dd["y"].values; dd_ = pd.DataFrame({"y": yy, "p": p.values, "yr": Dd.index.get_level_values("date").year})
                for yr, g in dd_.groupby("yr"):
                    byyear[int(yr)] = round(M.auc(g["y"].values, g["p"].values), 3)
        rows.append(dict(model=name, n_features=len(cc), **res))
    # final fit
    mu = D[cols].mean(); sd = D[cols].std().replace(0, 1)   # features are already z-scored per date, so this is ~0 / ~1; kept for exact reproducibility
    lam = 0.001
    b0, b = ST.fit_signed(((D[cols] - mu) / sd).values, D["y"].values, cols, lam)
    meaning = {n: m for n, m, s in S.FEATS}; sign = {n: s for n, m, s in S.FEATS}
    feats = [dict(name=c, meaning=meaning[c], sign=sign[c], mu=round(float(mu[c]), 6), sd=round(float(sd[c]), 6), coef=round(float(b[j]), 5)) for j, c in enumerate(cols)]
    return dict(intercept=round(float(b0), 5), lam=lam, horizon=60, drop=0.20, features=feats, ladder=rows, by_year_auc=byyear, n_obs=int(len(D)), n_stocks=int(D.index.get_level_values("sym").nunique()),
                first_date=str(D.index.get_level_values("date").min().date()), last_label_date=str(D.index.get_level_values("date").max().date()), base_rate=round(float(D["y"].mean()), 4))


if __name__ == "__main__":
    t = time.time(); m = market_part(); print("market part", round(time.time() - t), "s", flush=True)
    s = stock_part(); print("stock part", round(time.time() - t), "s", flush=True)
    out = dict(version=2, trained=time.strftime("%Y-%m-%d"), design_end=DESIGN_END, market=m, stock=s)
    json.dump(out, open(OUT, "w"), indent=1)
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
    st = m["structural"]; print("structural  design", st["design"], "\n            holdout", st["holdout"], "\n            base-rate holdout", st["base_holdout"])
    print("fragility  design", m["fragility"]["design"], "holdout", m["fragility"]["holdout"])
    print("episodes", len(m["episodes"])); [print("  ", e) for e in m["episodes"]]
    for r in s["ladder"]:
        print(r["model"], "design wd-AUC", r["design"]["within_date_auc"], "holdout", r["holdout"]["within_date_auc"], "top/bottom decile holdout", r["holdout"]["deciles"][-1], r["holdout"]["deciles"][0])
