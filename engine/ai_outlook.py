"""AI Watch outlook: what the evidence implies for the next weeks, and how the market is likely to react to the events coming up.
Three independent forecasters are combined for the crash question (Nasdaq-100, next 60 trading days), none of them fitted on the others:
  1. Historical analogs   - the 15 most similar past market states (Mahalanobis distance over 14 features, one per 60-day window), what happened next.
  2. Volatility barrier   - first-passage probability of touching the drawdown barrier, from EWMA volatility (reflection principle).
  3. The v2 ridge-logit crash model (data/model/market_now.json), validated walk-forward on its own page.
Event reactions: for each event type (company earnings from SEC 8-K Item 2.02 dates, FOMC decisions from the Fed calendar) the historical two-day (one-day for FOMC) reaction
is divided by the volatility going in, so past reactions can be rescaled to today's volatility and given a band.
Everything is descriptive and probabilistic. Nothing here is a price target or investment advice."""
import datetime as dt, json, math, os, re, urllib.request as ur
import numpy as np, pandas as pd
import mdata, mfeatures, mmodel, sec

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
H = 60
AF = ["ext200", "run24", "dd252", "vol20", "volratio", "sadf", "semi60", "breadth", "vixrel", "credit", "curve", "y10chg", "nfci", "valgdp"]
Phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))
CIK = {"MSFT": 789019, "GOOGL": 1652044, "AMZN": 1018724, "META": 1326801, "ORCL": 1341439, "NVDA": 1045810, "AMD": 2488, "AVGO": 1730168, "MU": 723125}
GROUPS = [("NVDA", "NVIDIA earnings", ["NVDA"]), ("HYPER", "Big-tech earnings (Microsoft, Alphabet, Amazon, Meta, Oracle)", ["MSFT", "GOOGL", "AMZN", "META", "ORCL"]), ("CHIPS", "Other AI-chip earnings (AMD, Broadcom, Micron)", ["AMD", "AVGO", "MU"])]


# ---------- analogs ----------
def first_passage(sig_ann, h=H, drop=0.10, mu_a=0.08):
    """P(price touches a drawdown of `drop` within h trading days): Brownian motion with drift, reflection principle."""
    if sig_ann is None or sig_ann <= 0 or sig_ann != sig_ann:
        return float("nan")
    mu = mu_a / 252.0; s = sig_ann / math.sqrt(252.0); b = math.log(1 - drop); m = mu * h; sd = s * math.sqrt(h)
    return float(Phi((b - m) / sd) + math.exp(2 * mu * b / (s * s)) * Phi((b + m) / sd))


def ewma_vol(logret, lam=0.94):
    v = logret.pow(2).ewm(alpha=1 - lam, adjust=False).mean()
    return np.sqrt(v * 252.0)


def prepare(F2):
    f = mfeatures.add_target(F2, h=H, drop=0.15)
    p = f["price"]
    for h in (5, 20, 60, 120):
        f["r%d" % h] = p.shift(-h) / p - 1
    f["y10"] = np.where(f["fwd_min"].isna(), np.nan, (f["fwd_min"] <= -0.10).astype(float))
    f["sig"] = ewma_vol(np.log(p).diff())
    f["p_vol10"] = [first_passage(x, drop=0.10) for x in f["sig"].values]
    f["p_vol15"] = [first_passage(x, drop=0.15) for x in f["sig"].values]
    return f


def analogs_at(f, X, valid, q, K=15, min_sep=60, lag=62):
    """Nearest past states to row q using only rows whose 60-day outcome was already known (<= q - lag). Returns (positions, distances) declustered."""
    cand = np.where(valid[: max(0, q - lag + 1)])[0]
    if len(cand) < 400 or not valid[q]:
        return None
    C = X[cand]; mu = C.mean(0); sd = C.std(0) + 1e-9
    Z = np.clip((C - mu) / sd, -4, 4); z = np.clip((X[q] - mu) / sd, -4, 4)
    cov = np.cov(Z.T); cov = 0.7 * cov + 0.3 * np.diag(np.diag(cov)); inv = np.linalg.inv(cov + 1e-6 * np.eye(len(cov)))
    d = Z - z; dist = np.sqrt(np.einsum("ij,jk,ik->i", d, inv, d))
    order = np.argsort(dist); acc = []
    for i in order:
        if all(abs(cand[i] - cand[a]) >= min_sep for a in acc):
            acc.append(i)
            if len(acc) == K:
                break
    return cand[acc], dist[acc]


def analog_summary(f, pos, base10, base15, shrink=5):
    sub = f.iloc[pos]
    k = len(sub)
    p10 = (float((sub["fwd_min"] <= -0.10).sum()) + shrink * base10) / (k + shrink)
    p15 = (float((sub["fwd_min"] <= -0.15).sum()) + shrink * base15) / (k + shrink)
    return dict(p10=p10, p15=p15, r60_med=float(sub["r60"].median()), r60_q10=float(sub["r60"].quantile(0.1)), r60_q90=float(sub["r60"].quantile(0.9)), r20_med=float(sub["r20"].median()),
                r120_med=float(sub["r120"].median()) if sub["r120"].notna().any() else None, p_down=float((sub["r60"] < 0).mean()), dd_med=float(sub["fwd_min"].median()))


def band_coverage(f):
    """Do the +-1 sigma and 90% bands from EWMA volatility contain the realized 5-, 20- and 60-day Nasdaq-100 move as often as they should (68% and 90%)?"""
    out = {}
    lr = np.log(f["price"]); sg = f["sig"]
    for h in (5, 20, 60):
        real = (lr.shift(-h) - lr); sd = sg * math.sqrt(h / 252.0); z = (real / sd).replace([np.inf, -np.inf], np.nan)
        z = z[f.index >= "2003-01-01"].dropna().iloc[::h]            # non-overlapping
        row = {}
        for nm, m in (("design", z.index < "2018-01-01"), ("holdout", z.index >= "2018-01-01")):
            zz = z[m]
            row[nm] = dict(n=int(len(zz)), within68=round(float((zz.abs() <= 1).mean()), 2), within90=round(float((zz.abs() <= 1.645).mean()), 2))
        out["h%d" % h] = row
    return out


def backtest(f, X, valid):
    """Walk-forward: at each test date (every 5 trading days from 2003) use only analogs whose outcome was known then. Compare with the volatility barrier and their average."""
    idx = f.index; start = int(np.searchsorted(idx, pd.Timestamp("2003-01-01"))); rows = []
    for q in range(start, len(f) - H - 1, 5):
        if not valid[q] or np.isnan(f["y10"].iloc[q]):
            continue
        past = f.iloc[: q - 62]["y10"].dropna()
        b10 = float(past.mean()) if len(past) > 250 else 0.2; b15 = float(f.iloc[: q - 62]["y"].dropna().mean()) if len(past) > 250 else 0.1
        r = analogs_at(f, X, valid, q)
        if r is None:
            continue
        s = analog_summary(f, r[0], b10, b15)
        rows.append(dict(d=idx[q], y10=f["y10"].iloc[q], y15=f["y"].iloc[q], r60=f["r60"].iloc[q], a10=s["p10"], a15=s["p15"], amed=s["r60_med"], v10=f["p_vol10"].iloc[q], v15=f["p_vol15"].iloc[q], b10=b10, b15=b15))
    T = pd.DataFrame(rows).dropna(subset=["a10", "v10"])
    out = {}
    for name, sub in (("design 2003-2017", T[T["d"] < "2018-01-01"]), ("holdout 2018-2026", T[T["d"] >= "2018-01-01"]), ("all", T)):
        if len(sub) < 40:
            continue
        r = {"n": int(len(sub)), "base10": round(float(sub["y10"].mean()), 3)}
        for k, col in (("analog", "a10"), ("vol", "v10")):
            y = sub["y10"].values; p = sub[col].values
            lo, hi = mmodel.block_bootstrap_auc(y, p, block=12, reps=250)
            ref = np.full(len(y), float(sub["b10"].mean()))
            r[k] = dict(auc=round(mmodel.auc(y, p), 3), ci=[round(lo, 3), round(hi, 3)], brier=round(mmodel.brier(y, p), 4), skill=round(1 - mmodel.brier(y, p) / mmodel.brier(y, sub["b10"].values), 3))
        rk = pd.Series(sub["amed"].values).rank(); rr = pd.Series(sub["r60"].values).rank()
        r["rank_corr_return"] = round(float(np.corrcoef(rk, rr)[0, 1]), 3)
        out[name] = r
    return out


# ---------- events ----------
def get_sec_dates(sym):
    """Dates of 8-K Item 2.02 (results of operations) filings = earnings releases."""
    cik = CIK[sym]; dates = set()
    j = json.loads(sec.get("https://data.sec.gov/submissions/CIK%010d.json" % cik))["filings"]

    def take(sub):
        for form, date, items in zip(sub["form"], sub["filingDate"], sub.get("items", [""] * len(sub["form"]))):
            if form == "8-K" and "2.02" in (items or ""):
                dates.add(date)
    take(j["recent"])
    for fl in j.get("files", [])[:6]:
        try:
            take(json.loads(sec.get("https://data.sec.gov/submissions/" + fl["name"])))
        except Exception:
            pass
    return sorted(dates)


def fed_dates():
    """FOMC decision days (the last day of each meeting) from the Federal Reserve's calendar page, 2021 to the latest published year."""
    html = ur.urlopen(ur.Request("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", headers={"User-Agent": "curl/8.4.0"}), timeout=30).read().decode("utf8", "replace")
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    months = "January|February|March|April|May|June|July|August|September|October|November|December"
    out = []
    for m in re.finditer(r"(\d{4}) FOMC Meetings", text):
        yr = int(m.group(1)); seg = text[m.end(): m.end() + 2600]
        nxt = re.search(r"\d{4} FOMC Meetings", seg)
        if nxt:
            seg = seg[: nxt.start()]
        for mm in re.finditer(r"\b(%s)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?\*?\s+Statement" % months, seg):
            mo = months.split("|").index(mm.group(1)) + 1; day = int(mm.group(3) or mm.group(2))
            try:
                out.append(dt.date(yr, mo, day))
            except ValueError:
                pass
    return sorted(set(out))


def next_earnings(sym):
    try:
        j = json.loads(ur.urlopen(ur.Request("https://api.nasdaq.com/api/analyst/%s/earnings-date" % sym, headers={"User-Agent": "Mozilla/5.0"}), timeout=25).read())["data"]
        m = re.search(r": (\w{3} \d{1,2}, \d{4})", j.get("announcement", ""))
        when = dt.datetime.strptime(m.group(1), "%b %d, %Y").date() if m else None
        txt = j.get("reportText", "")
        t = "after the close" if "after market" in txt else "before the open" if "before market" in txt else "time not stated"
        eps = re.search(r"consensus EPS forecast for the quarter is \$(-?\d+(?:\.\d+)?)", txt)
        return dict(date=when.isoformat() if when else None, when=t, eps=float(eps.group(1)) if eps else None)
    except Exception as e:
        print("  next earnings failed", sym, str(e)[:60])
        return None


def rsig(prices):
    """Daily volatility that ignores single-day jumps (median absolute deviation x 1.4826), so an earnings gap does not inflate the estimate of 'normal' volatility."""
    lr = np.log(prices).diff().dropna().values
    return float(1.4826 * np.median(np.abs(lr - np.median(lr))))


class Px:
    def __init__(self):
        self.c = {}

    def get(self, s):
        if s not in self.c:
            try:
                self.c[s] = mdata.yahoo(s, refresh_days=0).dropna()
            except Exception as e:
                print("  price failed", s, e); self.c[s] = None
        return self.c[s]


def reaction(series, d, days):
    """Log return across the event window and the volatility going in. days=2: close before the filing date -> close after it (covers after-close and before-open releases). days=1: previous close -> that day's close."""
    idx = series.index; t = pd.Timestamp(d)
    a = int(np.searchsorted(idx, t, side="left")) - 1            # last trading day before t
    b = a + days
    if a < 25 or b >= len(idx) or (idx[b] - t).days > 6:
        return None
    sg = rsig(series.iloc[a - 40: a + 1])
    if sg <= 0:
        return None
    ret = math.log(float(series.iloc[b]) / float(series.iloc[a]))
    return dict(d=str(d), end=idx[b].date().isoformat(), ret=ret, sg=sg, z=ret / (sg * math.sqrt(days)), ext=None)


def study(px, ext200, dates_by_sym, assets, days):
    """Per asset: list of reactions at those dates."""
    res = {a: [] for a in assets}
    for sym, dates in dates_by_sym.items():
        for d in dates:
            for a in assets:
                s = px.get(sym if a == "self" else a)
                if s is None:
                    continue
                r = reaction(s, d, days)
                if r:
                    r["sym"] = sym
                    pos = ext200.index.searchsorted(pd.Timestamp(d)) - 1
                    r["ext"] = float(ext200.iloc[pos]) if 0 <= pos < len(ext200) and ext200.iloc[pos] == ext200.iloc[pos] else None
                    res[a].append(r)
    return res


def summarize(rows, sig_now, days, ext_now, label):
    if len(rows) < 8:
        return None
    z = np.array([r["z"] for r in rows]); ret = np.array([r["ret"] for r in rows]) * 100
    scale = sig_now * math.sqrt(days)
    q = np.percentile(z, [10, 50, 90]) * scale * 100
    out = dict(label=label, n=len(rows), sd_z=round(float(z.std()), 2), mean_abs_z=round(float(np.abs(z).mean()), 2), mean_abs_move_pct=round(float(np.abs(z).mean() * scale * 100), 2), band10=round(float(q[0]), 2), median=round(float(q[1]), 2), band90=round(float(q[2]), 2),
               share_up=round(float((ret > 0).mean()), 2), mean_z=round(float(z.mean()), 2), t_mean=round(float(z.mean() / (z.std() / math.sqrt(len(z)) + 1e-9)), 1), bigger_than_usual=None)
    rs = sorted(rows, key=lambda r: r["d"]); zs = np.array([r["z"] for r in rs]); hit = []
    for k in range(20, len(zs)):
        lo, hi = np.percentile(zs[:k], [10, 90]); hit.append((rs[k]["d"], lo <= zs[k] <= hi))
    if len(hit) >= 20:
        rec = [h for d, h in hit if d >= "2018-01-01"]
        out["coverage"] = dict(n=len(hit), all=round(float(np.mean([h for _, h in hit])), 2), recent=None if len(rec) < 10 else round(float(np.mean(rec)), 2), n_recent=len(rec))
    ex = [(r["ext"], r["z"]) for r in rows if r["ext"] is not None]
    if len(ex) >= 12 and ext_now is not None:
        med = float(np.median([e for e, _ in ex])); hi = np.array([zz for e, zz in ex if e >= med]); lo = np.array([zz for e, zz in ex if e < med])
        se = math.sqrt(hi.var() / len(hi) + lo.var() / len(lo)) + 1e-9
        out["regime"] = dict(stretched_now=bool(ext_now >= med), mean_z_stretched=round(float(hi.mean()), 2), mean_z_normal=round(float(lo.mean()), 2), t_diff=round(float((hi.mean() - lo.mean()) / se), 1),
                             move_stretched=round(float(np.abs(hi).mean()), 2), move_normal=round(float(np.abs(lo).mean()), 2))
    return out


def aftershock(px, dates, today):
    """Group AI earnings dates into reporting clusters (releases within 6 days of each other). For each cluster measure the semiconductor ETF's move from the close before the first release to the close after the last,
    in units of its prior volatility, then what SMH and the Nasdaq-100 did over the following 5, 20 and 60 trading days. Overlapping releases are one observation, so the sample is independent."""
    allp = sorted({d for ds in dates.values() for d in ds})
    cl = []
    for d in allp:
        if cl and (dt.date.fromisoformat(d) - dt.date.fromisoformat(cl[-1][-1])).days <= 6:
            cl[-1].append(d)
        else:
            cl.append([d])
    smh, ndx = px.get("SMH"), px.get("^NDX")
    rows = []
    for c in cl:
        i0 = int(np.searchsorted(smh.index, pd.Timestamp(c[0]), side="left")) - 1; i1 = int(np.searchsorted(smh.index, pd.Timestamp(c[-1]), side="left")) + 1
        if i0 < 25 or i1 >= len(smh):
            continue
        days = i1 - i0; sg = rsig(smh.iloc[i0 - 40: i0 + 1])
        ret = math.log(float(smh.iloc[i1]) / float(smh.iloc[i0])); z = ret / (sg * math.sqrt(days))
        row = dict(start=c[0], end=smh.index[i1].date().isoformat(), n=len(c), ret=ret, z=z)
        for h in (5, 20, 60):
            row["smh%d" % h] = float(smh.iloc[i1 + h] / smh.iloc[i1] - 1) if i1 + h < len(smh) else None
            j = int(np.searchsorted(ndx.index, smh.index[i1])); row["ndx%d" % h] = float(ndx.iloc[j + h] / ndx.iloc[j] - 1) if j + h < len(ndx) else None
        rows.append(row)
    done = [r for r in rows if r["smh20"] is not None]
    buckets = []
    for nm, lo, hi in (("Semis fell sharply (z <= -1)", -99, -1.0), ("Quiet (-1 to +1)", -1.0, 1.0), ("Semis rallied (z >= +1)", 1.0, 99)):
        sub = [r for r in done if lo <= r["z"] < hi] if hi < 99 else [r for r in done if r["z"] >= lo]
        if len(sub) < 6:
            continue
        b = dict(name=nm, n=len(sub))
        for h in (5, 20, 60):
            v = np.array([r["smh%d" % h] for r in sub if r["smh%d" % h] is not None]) * 100
            allv = np.array([r["smh%d" % h] for r in done if r["smh%d" % h] is not None]) * 100
            if len(v) >= 6:
                se = math.sqrt(v.var() / len(v) + allv.var() / len(allv)) + 1e-9
                b["h%d" % h] = dict(mean=round(float(v.mean()), 1), median=round(float(np.median(v)), 1), up=round(float((v > 0).mean()), 2), t_vs_all=round(float((v.mean() - allv.mean()) / se), 1), n=len(v))
        buckets.append(b)
    base = {}
    for h in (5, 20, 60):
        v = np.array([r["smh%d" % h] for r in done if r["smh%d" % h] is not None]) * 100
        base["h%d" % h] = dict(mean=round(float(v.mean()), 1), up=round(float((v > 0).mean()), 2), n=len(v))
    cur = next((r for r in reversed(rows) if (today - dt.date.fromisoformat(r["end"])).days <= 10), None)
    cur_out = None
    if cur:
        nm = "Semis fell sharply (z <= -1)" if cur["z"] <= -1 else "Semis rallied (z >= +1)" if cur["z"] >= 1 else "Quiet (-1 to +1)"
        cur_out = dict(start=cur["start"], end=cur["end"], n=cur["n"], ret=round(cur["ret"] * 100, 1), z=round(cur["z"], 1), bucket=nm)
    return dict(buckets=buckets, base=base, n=len(done), current=cur_out)


def build_events(px, f, today):
    ext200 = f["ext200"]; ext_now = float(ext200.dropna().iloc[-1])
    sigma = {}
    for s in ["^NDX", "SMH"] + list(CIK):
        series = px.get(s)
        if series is not None:
            sigma[s] = rsig(series.iloc[-41:])
    dates = {}
    for sym in CIK:
        try:
            dates[sym] = [d for d in get_sec_dates(sym) if d >= "2005-01-01" and d <= today.isoformat()]
        except Exception as e:
            print("  8-K dates failed", sym, e); dates[sym] = []
    try:
        fomc = fed_dates()
    except Exception as e:
        print("  fomc failed", e); fomc = []
    studies, recent = [], []
    for key, label, syms in GROUPS:
        dd = {s: dates.get(s, []) for s in syms}
        res = study(px, ext200, dd, ["^NDX", "SMH", "self"], 2)
        entry = dict(key=key, label=label, assets=[])
        for a, nm in (("self", "the stock itself"), ("SMH", "semiconductors (SMH)"), ("^NDX", "the Nasdaq-100")):
            if a == "self":
                by = {}
                for r in res[a]:
                    by.setdefault(r["sym"], []).append(r)
                sg = float(np.mean([sigma[s] for s in syms if s in sigma])) if syms else 0.02
                rows = res[a]
            else:
                sg = sigma.get("SMH" if a == "SMH" else "^NDX"); rows = res[a]
            sm = summarize(rows, sg, 2, ext_now, nm)
            if sm:
                entry["assets"].append(dict(asset=a, **sm))
        studies.append(entry)
        # recent reactions
        for a in ("self",):
            for r in sorted(res[a], key=lambda x: x["d"]):
                if (today - dt.date.fromisoformat(r["d"])).days <= 75:
                    smh = reaction(px.get("SMH"), r["d"], 2); ndx = reaction(px.get("^NDX"), r["d"], 2)
                    recent.append(dict(kind=key, what="%s earnings" % r["sym"], date=r["d"], ret=round(r["ret"] * 100, 1), z=round(r["z"], 1), smh=None if not smh else round(smh["ret"] * 100, 1), smh_z=None if not smh else round(smh["z"], 1), ndx=None if not ndx else round(ndx["ret"] * 100, 1)))
    # FOMC
    fres = study(px, ext200, {"FOMC": [d.isoformat() for d in fomc if d <= today]}, ["^NDX", "SMH"], 1)
    fe = dict(key="FOMC", label="Federal Reserve rate decisions", assets=[])
    for a, nm in (("^NDX", "the Nasdaq-100"), ("SMH", "semiconductors (SMH)")):
        sm = summarize(fres[a], sigma.get(a), 1, ext_now, nm)
        if sm:
            fe["assets"].append(dict(asset=a, **sm))
    studies.append(fe)
    for r in sorted(fres["^NDX"], key=lambda x: x["d"]):
        if (today - dt.date.fromisoformat(r["d"])).days <= 75:
            recent.append(dict(kind="FOMC", what="Fed decision", date=r["d"], ret=round(r["ret"] * 100, 1), z=round(r["z"], 1), smh=None, smh_z=None, ndx=round(r["ret"] * 100, 1)))
    recent.sort(key=lambda x: x["date"], reverse=True)
    # upcoming
    up = []
    for sym in CIK:
        e = next_earnings(sym)
        if e and e["date"] and e["date"] >= today.isoformat() and (dt.date.fromisoformat(e["date"]) - today).days <= 75:
            grp = "NVDA" if sym == "NVDA" else "HYPER" if sym in ("MSFT", "GOOGL", "AMZN", "META", "ORCL") else "CHIPS"
            st = next(s for s in studies if s["key"] == grp)
            self_ = next((a for a in st["assets"] if a["asset"] == "self"), None)
            gs = [sigma[x] for x in [g[2] for g in GROUPS if g[0] == grp][0] if x in sigma]
            k = (sigma.get(sym) or 0.02) / (float(np.mean(gs)) if gs else 0.02)      # rescale the group's historical band to this company's current volatility
            band = None if not self_ else dict(stock=[round(self_["band10"] * k, 1), round(self_["band90"] * k, 1)], mean_abs=round(self_["mean_abs_move_pct"] * k, 1))
            smh_ = next((a for a in st["assets"] if a["asset"] == "SMH"), None)
            up.append(dict(what="%s earnings" % sym, sym=sym, date=e["date"], when=e["when"], eps=e["eps"], days=(dt.date.fromisoformat(e["date"]) - today).days, group=grp, stock=band, smh=None if not smh_ else [smh_["band10"], smh_["band90"], smh_["mean_abs_move_pct"]]))
    nxt = [d for d in fomc if d > today]
    if nxt:
        n_ = next((a for a in fe["assets"] if a["asset"] == "^NDX"), None)
        up.append(dict(what="Fed rate decision", sym="FOMC", date=nxt[0].isoformat(), when="2:00 pm ET", eps=None, days=(nxt[0] - today).days, group="FOMC", stock=None, smh=None if not n_ else [n_["band10"], n_["band90"], n_["mean_abs_move_pct"]]))
    up.sort(key=lambda x: x["date"])
    after = aftershock(px, {k: v for k, v in dates.items() if v}, today)
    return dict(studies=studies, recent=recent[:14], upcoming=up, aftershock=after, sigma={k: round(v * math.sqrt(252) * 100, 1) for k, v in sigma.items()}, ext_now=round(ext_now, 3))


# ---------- scenarios ----------
BUCKETS = [("Sharp fall", "down 15% or more", -9, -0.15), ("Pullback", "down 5% to 15%", -0.15, -0.05), ("Range", "between -5% and +8%", -0.05, 0.08), ("Advance", "up more than 8%", 0.08, 9)]


def lognormal_bucket(sig_ann, mu_a=0.08, h=H):
    T = h / 252.0; m = (mu_a - sig_ann ** 2 / 2) * T; sd = sig_ann * math.sqrt(T); out = []
    for _, _, lo, hi in BUCKETS:
        a = Phi((math.log(1 + max(lo, -0.9999)) - m) / sd) if lo > -1 else 0.0
        b = Phi((math.log(1 + hi) - m) / sd) if hi < 9 else 1.0
        out.append(max(0.0, b - a))
    return out


NAME = {"MSFT": "Microsoft", "GOOGL": "Alphabet", "AMZN": "Amazon", "META": "Meta", "ORCL": "Oracle", "NVDA": "NVIDIA", "AMD": "AMD", "AVGO": "Broadcom", "MU": "Micron", "FOMC": "the Fed"}


def narrative(o, ai):
    """Plain-language read of the numbers above, written by rule from the data (no model, no editorial)."""
    it = []; c = o["crash"]; ev = o["events"]; sc = {s["name"]: s["p"] for s in o["scenarios"]}
    pc = lambda x: "%d%%" % int(x * 100 + 0.5)
    if ai and ai.get("health") is not None:
        top = [i for i in ai["indicators"] if i["key"] in ai["drivers"]][:3]
        by = {i["key"]: i for i in ai["indicators"]}
        dd = []
        for k, nm in (("g_dd_crwv", "CoreWeave"), ("g_dd_asml", "ASML"), ("g_dd_tsm", "TSMC")):
            m = re.search(r"(\d+)% below", by.get(k, {}).get("display", ""))
            if m:
                dd.append("%s is %s%% below its 1-year high" % (nm, m.group(1)))
        m = re.search(r"average (\d+)% below", by.get("g_infra", {}).get("display", ""))
        if m:
            dd.append("the power, cooling and server suppliers average %s%% below theirs" % m.group(1))
        it.append(("Where things stand", "The AI-buildout score is %d out of 100 (%s). The fragile parts are spending and financing (%s). Prices have already started to give way: %s." % (
            ai["health"], ai["zone"], "; ".join("%s %s" % (i["name"].lower(), i["display"].split(" (")[0]) for i in top), "; ".join(dd) or "see the supply-chain group below")))
    rec = [r for r in ev["recent"] if r["kind"] != "FOMC" and (dt.date.today() - dt.date.fromisoformat(r["date"])).days <= 14]
    cur = ev["aftershock"].get("current")
    mz = {st["key"]: next((x["mean_abs_z"] for x in st["assets"] if x["asset"] == "self"), None) for st in ev["studies"]}
    if rec:
        parts = []
        for r in rec[:5]:
            m = mz.get(r["kind"]); ratio = abs(r["z"]) / m if m else None
            parts.append("%s %+.1f%%%s" % (NAME.get(r["what"].split()[0], r["what"].split()[0]), r["ret"], (" (%.1fx a normal reaction)" % ratio) if ratio is not None and ratio >= 1.5 else ""))
        txt = "Companies that just reported moved (two days around the release): " + ", ".join(parts) + "."
        if cur:
            txt += (" Semiconductors fell %.1f%% across the reporting window, %.1fx what their recent volatility would predict." % (-cur["ret"], abs(cur["z"]))) if cur["ret"] < 0 else (" Semiconductors rose %.1f%% across the window." % cur["ret"])
        it.append(("What the latest events did", txt))
    a = ev["aftershock"]
    if cur and a["buckets"]:
        b = next((x for x in a["buckets"] if x["name"] == cur["bucket"]), None)
        if b and "h20" in b:
            h = b["h20"]; bs = a["base"]["h20"]
            it.append(("What usually follows", "There have been %d past earnings seasons like this one (semis %s). Over the next 20 trading days semis were up in %s of them, median %+.1f%%, versus %s and %+.1f%% after all seasons. The gap is %s (t = %.1f). Earnings shocks change how big the next moves are, but we cannot show that they change the direction." % (
                b["n"], "down sharply" if "fell" in b["name"] else "up sharply" if "rallied" in b["name"] else "quiet", pc(h["up"]), h["median"], pc(bs["up"]), bs["mean"], "statistically indistinguishable from zero" if abs(h["t_vs_all"]) < 2 else "statistically meaningful", h["t_vs_all"])))
    it.append(("The odds of a deeper fall", "Over the next 60 trading days the Nasdaq-100 has a %s chance of falling 15%% from here at some point (volatility model %s, crash model %s; a typical stretch is %s). Scenario odds for where it stands 60 days from now: sharp fall %s, pullback %s, range %s, advance %s. %s" % (
        pc(c["ens15"]), pc(c["vol15"]), pc(c["v2_15"]) if c["v2_15"] is not None else "n/a", pc(o["base15"]), pc(sc["Sharp fall"]), pc(sc["Pullback"]), pc(sc["Range"]), pc(sc["Advance"]),
        ("If you weight the AI-Watch score as a modifier (our judgment, untested), the fall odds become %s." % pc(c["ai_adjusted15"])) if c.get("ai_adjusted15") else "")))
    up = ev["upcoming"][:4]
    if up:
        bits = []
        for u in up:
            if u["sym"] == "FOMC":
                bits.append("the Fed decides on %s (Nasdaq-100 usually moves about %.1f%%)" % (u["date"], u["smh"][2] if u["smh"] else 1.5))
            else:
                st = u.get("stock")
                bits.append("%s reports on %s %s (its stock typically moves about %.0f%%; semiconductors about %.1f%%)" % (NAME[u["sym"]], u["date"], u["when"], st["mean_abs"] if st else 0, u["smh"][2] if u["smh"] else 0))
        it.append(("What is coming", "; ".join(bits) + "."))
    return it


def run(F2=None, ai=None):
    today = dt.date.today()
    if F2 is None:
        F2 = mfeatures.index_frame(refresh_days=0)
    f = prepare(F2)
    X = f[AF].values.astype(float); valid = ~np.isnan(X).any(axis=1)
    q = len(f) - 1
    while not valid[q]:
        q -= 1
    base10 = float(f["y10"].dropna().mean()); base15 = float(f["y"].dropna().mean())
    pos, dist = analogs_at(f, X, valid, q)
    sm = analog_summary(f, pos, base10, base15)
    sig_now = float(f["sig"].iloc[-1]); p_vol10 = first_passage(sig_now, drop=0.10); p_vol15 = first_passage(sig_now, drop=0.15)
    try:
        mn = json.load(open(os.path.join(DATA, "model", "market_now.json"))); p_v2 = float(mn["p"]); v2_base = float(mn["base_rate"])
    except Exception:
        p_v2 = None; v2_base = None
    ens15 = float(np.mean([x for x in (p_vol15, p_v2) if x is not None]))
    heat = ai.get("heat") if ai else None
    tilt = None if heat is None else max(0.75, min(1.3, 1 + 0.4 * (heat - 50) / 50))
    # scenarios
    r60 = f.iloc[pos]["r60"].values
    a_p = [float(((r60 > lo) & (r60 <= hi)).mean()) if lo > -1 else float((r60 <= hi).mean()) for _, _, lo, hi in BUCKETS]
    a_p[0] = float((r60 <= -0.15).mean()); a_p[3] = float((r60 > 0.08).mean())
    v_p = lognormal_bucket(sig_now)
    sc = []
    for (nm, desc, _, _), a, v in zip(BUCKETS, a_p, v_p):
        sc.append(dict(name=nm, desc=desc, analog=round(a, 3), vol=round(v, 3), p=round((a + v) / 2, 3)))
    tot = sum(s["p"] for s in sc)
    for s in sc:
        s["p"] = round(s["p"] / tot, 3)
    # horizons
    hz = []
    for h in (5, 20, 60):
        sd = sig_now * math.sqrt(h / 252.0)
        hz.append(dict(days=h, band68=[round((math.exp(-sd) - 1) * 100, 1), round((math.exp(sd) - 1) * 100, 1)], band90=[round((math.exp(-1.645 * sd) - 1) * 100, 1), round((math.exp(1.645 * sd) - 1) * 100, 1)],
                       analog_med=round(float(f.iloc[pos]["r%d" % h].median()) * 100, 1) if h in (5, 20, 60) else None))
    px = Px()
    for s in ["^NDX", "SMH"] + list(CIK):
        px.get(s)
    ev = build_events(px, f, today)
    bt = backtest(f, X, valid); bt["bands"] = band_coverage(f)
    cur = f.iloc[q]
    analog_rows = [dict(d=f.index[p].date().isoformat(), dist=round(float(dd), 2), r20=round(float(f["r20"].iloc[p]) * 100, 1), r60=round(float(f["r60"].iloc[p]) * 100, 1), dd=round(float(f["fwd_min"].iloc[p]) * 100, 1)) for p, dd in zip(pos, dist)]
    out = dict(generated=dt.datetime.utcnow().isoformat() + "Z", asof=f.index[q].date().isoformat(), sigma_ann=round(sig_now, 4), base10=round(base10, 3), base15=round(base15, 3),
               crash=dict(analog10=round(sm["p10"], 3), vol10=round(p_vol10, 3), analog15=round(sm["p15"], 3), vol15=round(p_vol15, 3), v2_15=None if p_v2 is None else round(p_v2, 3), ens15=round(ens15, 3),
                          ai_tilt=None if tilt is None else round(tilt, 2), ai_adjusted15=None if tilt is None else round(min(0.9, ens15 * tilt), 3)),
               analogs=dict(summary={k: (round(v, 3) if isinstance(v, float) else v) for k, v in sm.items()}, rows=analog_rows, features=AF, spread=round(float(np.mean(dist)), 2)),
               scenarios=sc, horizons=hz, events=ev, backtest=bt,
               state={k: round(float(cur[k]), 3) for k in AF if cur[k] == cur[k]})
    out["narrative"] = narrative(out, ai)
    return out


if __name__ == "__main__":
    o = run()
    json.dump(o, open(os.path.join(DATA, "ai_outlook.json"), "w"), separators=(",", ":"))
    c = o["crash"]
    print("asof", o["asof"], "sigma", o["sigma_ann"])
    print("crash 15%%: analog %.3f vol %.3f v2 %s ens %.3f (base %.3f)" % (c["analog15"], c["vol15"], c["v2_15"], c["ens15"], o["base15"]))
    print("AFTERSHOCK", json.dumps(o["events"]["aftershock"], indent=1))
    print("scenarios", [(s["name"], s["p"]) for s in o["scenarios"]])
    print("analogs", [(r["d"], r["r60"], r["dd"]) for r in o["analogs"]["rows"]])
    print("backtest", json.dumps(o["backtest"], indent=1))
    for s in o["events"]["studies"]:
        for a in s["assets"]:
            print(s["key"], a["asset"], {k: a[k] for k in ("n", "mean_abs_move_pct", "band10", "band90")}, a.get("coverage"))
    for u in o["events"]["upcoming"]:
        print("UP", u)
    for r in o["events"]["recent"]:
        print("REC", r)
