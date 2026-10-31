"""Economy forecasts -> data/econ_forecast.json.
For each gauge on the Economy page: what is the next reading likely to be, and how sure can anyone be?
Two candidates are scored walk-forward (each prediction uses only data available then):
  naive  next reading = latest reading ("no change")
  model  next change = ridge regression on [last change, 3-period change, distance from the 3-year average]  (momentum + mean reversion), refit as data arrives
The model is shipped for a gauge only if it beat naive by more than 3% on 2000-2017 data AND also beat it from 2018 on (so the 2018+ record informed that choice and is not a clean test); both records are shown. The 2020-21 pandemic shock is left out of fitting and error bands.
The band is the 10th-90th percentile of the chosen method's own past errors over the previous 8 years, and its coverage is tested the same way."""
import datetime as dt, json, os, math
import numpy as np

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
EPOCH = dt.date(2000, 1, 1)
HZ = {"M": [(1, "next reading"), (3, "in 3 months")], "Q": [(1, "next quarter")], "W": [(1, "next week"), (4, "in 4 weeks")], "D": [(5, "in a week"), (21, "in a month")]}
MINN = {"M": 100, "Q": 30, "W": 260, "D": 400}
WIN = {"M": 96, "Q": 32, "W": 416, "D": 1500}          # error window ~8 years in the series' own steps


def features(v, i):
    return [v[i] - v[i - 1], v[i] - v[i - 3], float(np.mean(v[i - 35: i + 1])) - v[i]]


def ridge(X, y, lam=10.0):
    mu, sd = X.mean(0), X.std(0) + 1e-9; Z = (X - mu) / sd
    w = np.linalg.solve(Z.T @ Z + lam * np.eye(Z.shape[1]), Z.T @ (y - y.mean()))
    return mu, sd, w, float(y.mean())


def predict(m, x):
    mu, sd, w, b = m
    return b + float(((np.asarray(x) - mu) / sd) @ w)


def run_item(t, v, freq, h):
    v = np.asarray(v, dtype=float); n = len(v)
    idx = list(range(36, n - h)); X = np.array([features(v, i) for i in idx]); y = np.array([v[i + h] - v[i] for i in idx])
    if len(idx) < MINN[freq] + 20:
        return None
    date = [EPOCH + dt.timedelta(days=int(t[i])) for i in idx]
    covid = np.array([dt.date(2020, 3, 1) <= d <= dt.date(2021, 6, 30) for d in date])      # the pandemic shock is excluded from fitting and from error bands
    pm = np.full(len(idx), np.nan)                              # model prediction of the change, using only rows whose target was known by then
    m = None
    for r in range(MINN[freq], len(idx)):
        if m is None or (r - MINN[freq]) % 6 == 0:
            known = [k for k in range(r) if idx[k] + h <= idx[r] and not covid[k]]
            if len(known) >= 60:
                m = ridge(X[known], y[known])
        if m is not None:
            pm[r] = predict(m, X[r])
    ok = ~np.isnan(pm) & ~covid; err_n = y; err_m = y - pm
    d_des = np.array([d < dt.date(2018, 1, 1) for d in date]) & ok; d_hol = np.array([d >= dt.date(2018, 1, 1) for d in date]) & ok
    mae = lambda e, msk: float(np.abs(e[msk]).mean()) if msk.sum() >= 10 else None
    des_n, des_m, hol_n, hol_m = mae(err_n, d_des), mae(err_m, d_des), mae(err_n, d_hol), mae(err_m, d_hol)
    use_model = des_n is not None and des_m is not None and des_m < 0.97 * des_n and hol_m is not None and hol_n is not None and hol_m < hol_n
    err = err_m if use_model else err_n
    # coverage of the 80% band on 2018-onward, bands built from the previous ~8 years of this method's errors
    hits = []
    for r in np.where(d_hol)[0]:
        past = [k for k in range(r) if idx[k] + h <= idx[r] and ok[k]][-WIN[freq]:]
        if len(past) >= 40:
            lo, hi = np.percentile(err[past], [10, 90]); hits.append(lo <= err[r] <= hi)
    # today's forecast
    i = n - 1; xnow = features(v, i)
    known = [k for k in range(len(idx)) if not covid[k]]
    mnow = ridge(X[known], y[known]); chg = predict(mnow, xnow) if use_model else 0.0
    recent = [k for k in range(len(idx)) if ok[k]][-WIN[freq]:]
    lo, hi = np.percentile(err[recent], [10, 90])
    pred = float(v[i] + chg)
    return dict(steps=h, pred=round(pred, 4), lo=round(pred + float(lo), 4), hi=round(pred + float(hi), 4), method="model" if use_model else "naive",
                skill_design=None if not (des_n and des_m) else round(1 - des_m / des_n, 3), skill_holdout=None if not (hol_n and hol_m) else round(1 - hol_m / hol_n, 3),
                mae_naive=None if hol_n is None else round(hol_n, 4), mae_model=None if hol_m is None else round(hol_m, 4), n_test=int(d_hol.sum()), cov80=None if len(hits) < 20 else round(float(np.mean(hits)), 3), n_cov=len(hits))


def main():
    ec = json.load(open(os.path.join(DATA, "economy.json"))); out = {}
    for key, it in ec["items"].items():
        if it["freq"] not in HZ or key in ("sahm",):
            continue
        res = []
        for h, label in HZ[it["freq"]]:
            try:
                r = run_item(it["t"], it["v"], it["freq"], h)
            except Exception as e:
                print("  failed", key, h, str(e)[:60]); r = None
            if r:
                r["label"] = label; res.append(r)
        if res:
            out[key] = res
    json.dump(dict(generated=dt.datetime.utcnow().isoformat() + "Z", items=out), open(os.path.join(DATA, "econ_forecast.json"), "w"), separators=(",", ":"))
    print("econ forecasts:", len(out), "gauges")
    for k, r in out.items():
        a = r[0]; print("  %-10s h%-2d %-6s pred %9.3f [%9.3f, %9.3f]  skill design %s holdout %s  cov80 %s (n %d)" % (k, a["steps"], a["method"], a["pred"], a["lo"], a["hi"], a["skill_design"], a["skill_holdout"], a["cov80"], a["n_cov"]))


if __name__ == "__main__":
    main()
