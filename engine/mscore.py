"""Nightly scoring with the trained models (data/model/model.json): today's market crash probability and fragility index, and a 60-day crash-risk estimate for every stock.
Writes data/model/market_now.json and data/model/stocks.json. Needs only the stored stock histories (data/hist) plus a few index and macro series."""
import json, math, os, sys, time, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
import mdata, mfeatures as F, mstock as S

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "model")
EPOCH = pd.Timestamp("2000-01-01")
Phi = np.vectorize(lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2))))
sig_ = lambda z: 1 / (1 + np.exp(-z))


def first_passage(sig, h=60, drop=0.15, mu_a=0.10):
    mu = mu_a / 252; b = math.log(1 - drop); s = sig * math.sqrt(h); m = mu * h
    return Phi((b - m) / s) + np.exp(2 * mu * b / sig ** 2) * Phi((b + m) / s)


def market(model):
    eq, fr = model["market"]["equation"], model["market"]["fragility"]
    f = F.index_frame(refresh_days=0); price = f["price"]
    r = np.log(price).diff(); sigma = np.sqrt((r ** 2).ewm(alpha=eq["ewma_alpha"], adjust=False).mean())
    q = np.clip(first_passage(sigma.values, eq["h"], eq["drop"], eq["mu_annual"]), 1e-6, 0.999); lfp = pd.Series(np.log(q / (1 - q)), index=price.index)
    p_cal = pd.Series(sig_(eq["calib"]["a"] + eq["calib"]["c"] * lfp.values), index=price.index)
    cols = [x["name"] for x in fr["features"]]; mu = pd.Series({x["name"]: x["mu"] for x in fr["features"]}); sd = pd.Series({x["name"]: x["sd"] for x in fr["features"]}); coef = pd.Series({x["name"]: x["coef"] for x in fr["features"]})
    Z = ((f[cols] - mu) / sd).fillna(0.0)
    frag = pd.Series(sig_(fr["intercept"] + (Z * coef).sum(axis=1).values), index=price.index)
    last = price.index[-1]
    contrib = [dict(name=c, meaning=next(x["meaning"] for x in fr["features"] if x["name"] == c), raw=None if pd.isna(f[c].iloc[-1]) else round(float(f[c].iloc[-1]), 4), z=round(float(Z[c].iloc[-1]), 3), coef=coef[c], contribution=round(float(Z[c].iloc[-1] * coef[c]), 4)) for c in cols]
    wk = price.index[-1300:][::5]
    series = dict(d=[str(d.date()) for d in wk], price=[round(float(price[d]), 2) for d in wk], p=[round(float(p_cal[d]), 4) for d in wk], frag=[round(float(frag[d]), 4) for d in wk], sigma=[round(float(sigma[d] * math.sqrt(252)), 4) for d in wk])
    return dict(asof=str(last.date()), price=round(float(price.iloc[-1]), 2), sigma_ann=round(float(sigma.iloc[-1] * math.sqrt(252)), 4), p_fp=round(float(q[-1]), 4), p=round(float(p_cal.iloc[-1]), 4), lfp=round(float(lfp.iloc[-1]), 4),
                fragility=round(float(frag.iloc[-1]), 4), contributions=contrib, series=series, base_rate=model["market"]["event_rate"]), price, lfp


def load_hist(sym):
    p = os.path.join(DATA, "hist", sym + ".json")
    if not os.path.exists(p):
        return None
    j = json.load(open(p))
    return pd.Series(j["c"], index=EPOCH + pd.to_timedelta(j["t"], unit="D"), dtype=float)


def stocks(model, ndx, lfp):
    st = model["stock"]; feats = st["features"]; cols = [x["name"] for x in feats]
    names = {r[0]: r for r in json.load(open(os.path.join(DATA, "search.json")))["stocks"]}   # symbol, name, sector, cap_b, price, d1
    ser = {}
    for s in names:
        h = load_hist(s.replace("^", "_"))
        if h is not None and len(h) >= 300:
            ser[s] = h
    P = pd.DataFrame(ser).sort_index().ffill(limit=5); P = P[P.index >= P.index[-1] - pd.Timedelta(days=1200)]   # a stock that hasn't printed yet today keeps its last close
    sox = mdata.yahoo("^SOX", refresh_days=0)
    W = S.wide_features(P, ndx, sox, lfp)
    last = P.index[-1]
    raw = pd.DataFrame({c: W[c].iloc[-1] for c in cols})
    raw["bars"] = P.notna().sum()
    # standardize against today's cross-section of the ~800 largest stocks (what the model was trained on); smaller names are extrapolated and clipped at +/-3
    ref = sorted(raw.index, key=lambda s: -(names[s][3] or 0))[:800]
    mu_ref, sd_ref = raw.loc[ref, cols].mean(), raw.loc[ref, cols].std().replace(0, 1)
    Z = ((raw[cols] - mu_ref) / sd_ref).clip(-3, 3)
    z_missing = Z.isna()
    Zf = Z.fillna(0.0)
    mu = pd.Series({x["name"]: x["mu"] for x in feats}); sd = pd.Series({x["name"]: x["sd"] for x in feats}); coef = pd.Series({x["name"]: x["coef"] for x in feats})
    lin = st["intercept"] + (((Zf - mu) / sd) * coef).sum(axis=1)
    p = sig_(lin.values)
    pct = pd.Series(p, index=Zf.index).rank(pct=True)
    pct_ref = pd.Series(p, index=Zf.index).loc[ref]
    out = {}
    for s in Zf.index:
        contrib = (((Zf.loc[s] - mu) / sd) * coef).sort_values(ascending=False)
        drivers = [[c, round(float(v), 3)] for c, v in contrib.head(3).items() if v > 0.02]
        cap = names[s][3] or 0
        out[s] = dict(p=round(float(pd.Series(p, index=Zf.index)[s]), 4), pct=round(float(pct[s]), 3), drivers=drivers, cap_b=round(float(cap), 2), limited=bool(raw.loc[s, "bars"] < 520 or z_missing.loc[s].any()),
                      vol=round(float(math.exp(raw.loc[s, "vol60"])), 3) if not pd.isna(raw.loc[s, "vol60"]) else None, beta=None if pd.isna(raw.loc[s, "beta"]) else round(float(raw.loc[s, "beta"]), 2),
                      aibeta=None if pd.isna(raw.loc[s, "aibeta"]) else round(float(raw.loc[s, "aibeta"]), 2), dd=None if pd.isna(raw.loc[s, "dd252"]) else round(float(raw.loc[s, "dd252"]), 3))
    deciles = [round(float(x), 4) for x in np.percentile(pct_ref.values, [10, 25, 50, 75, 90, 99])]
    return dict(asof=str(last.date()), n=len(out), universe_ref=len(ref), p_percentiles_large_caps=deciles, stocks=out)


def main():
    model = json.load(open(os.path.join(OUT, "model.json")))
    m, ndx_price, lfp = market(model)
    ndx = ndx_price
    json.dump(m, open(os.path.join(OUT, "market_now.json"), "w"), separators=(",", ":"))
    print("market: asof %s  P(NDX -15%% in 60d) = %.1f%% (volatility formula %.1f%%), fragility index %.1f%%" % (m["asof"], 100 * m["p"], 100 * m["p_fp"], 100 * m["fragility"]))
    s = stocks(model, ndx, lfp)
    json.dump(s, open(os.path.join(OUT, "stocks.json"), "w"), separators=(",", ":"))
    top = sorted(s["stocks"].items(), key=lambda kv: -kv[1]["p"] if s["stocks"][kv[0]]["cap_b"] >= 10 else 0)[:8]
    low = sorted([kv for kv in s["stocks"].items() if kv[1]["cap_b"] >= 10], key=lambda kv: kv[1]["p"])[:8]
    print("stocks scored:", s["n"], "| large-cap p percentiles (10,25,50,75,90,99):", s["p_percentiles_large_caps"])
    print("highest risk (cap>=$10B):", [(k, v["p"]) for k, v in top])
    print("lowest risk (cap>=$10B):", [(k, v["p"]) for k, v in low])
    for sym in ("NVDA", "MSFT", "KO", "AAPL", "PLTR", "TSLA"):
        if sym in s["stocks"]:
            print(sym, s["stocks"][sym])


if __name__ == "__main__":
    main()
