"""Candidate signal exploration. Pick rules on TRAIN (<=2014), confirm on TEST (2015+)."""
import json, os, bisect, sys
R = os.path.join(os.path.dirname(__file__), "..", "data", "cache")
L = lambda s: [tuple(x) for x in json.load(open(os.path.join(R, s + ".json")))]
Q, S, T, V = L("QQQ"), L("SMH"), L("TNX"), L("VIX")
DROP, H = 0.15, 60
def at(series, dates, day, back=0):
    j = bisect.bisect_right(dates, day) - 1 - back
    return series[j][1] if j >= 0 else None
dS, dT, dV = [d for d, _ in S], [d for d, _ in T], [d for d, _ in V]
qc = [c for _, c in Q]
sig = {}
rows = []
for i in range(next(k for k, (d, _) in enumerate(Q) if d >= "2001-06-01"), len(Q) - H):
    day, p = Q[i]
    fut = min(qc[i + 1:i + 1 + H]); ev = fut / p - 1 <= -DROP
    hi = max(qc[i - 251:i + 1]); dd = p / hi - 1
    m50 = sum(qc[i - 49:i + 1]) / 50; m200 = sum(qc[i - 199:i + 1]) / 200
    vix = at(V, dV, day); vix5 = at(V, dV, day, 5); vmean = sum(v for _, v in V[bisect.bisect_right(dV, day) - 50:bisect.bisect_right(dV, day)]) / 50
    s10 = at(S, dS, day); s10b = at(S, dS, day, 10); q10 = qc[i - 10]
    tn = at(T, dT, day); tn63 = at(T, dT, day, 63)
    f = {
        "near-high (base subset)": dd > -0.05,
        "VIX>20": vix > 20, "VIX>25": vix > 25,
        "VIX up >30% in 5d": vix / vix5 > 1.3,
        "VIX > 1.25x its 50d avg": vix > 1.25 * vmean,
        "below 50DMA": p < m50, "50DMA<200DMA": m50 < m200,
        "semis -8% in 10d": s10 / s10b - 1 < -0.08,
        "semis lag QQQ >5pts/10d": (s10 / s10b - 1) - (p / q10 - 1) < -0.05,
        ">25% above 200DMA": p / m200 - 1 > 0.25, ">15% above 200DMA": p / m200 - 1 > 0.15,
        "10Y +0.4 in 3mo": tn - tn63 > 0.4,
    }
    rows.append((day, ev, dd, f))
def rep(name, pred, sub_filter=lambda r: True):
    out = []
    for lab, sel in [("train", lambda r: r[0] < "2015"), ("test", lambda r: r[0] >= "2015")]:
        sub = [r for r in rows if sel(r) and sub_filter(r)]
        b = sum(r[1] for r in sub) / len(sub); on = [r for r in sub if pred(r)]
        if len(on) < 30: out.append("%s n/a(%d)" % (lab, len(on))); continue
        p = sum(r[1] for r in on) / len(on)
        out.append("%s on=%2.0f%% P=%4.1f%% base=%4.1f%% lift=%.2f" % (lab, 100 * len(on) / len(sub), 100 * p, 100 * b, p / b))
    print("%-28s | %s" % (name, " | ".join(out)))
for title, flt in [("ALL DAYS", lambda r: True), ("ONLY WHEN QQQ WITHIN 5% OF 1Y HIGH (predicting the START)", lambda r: r[2] > -0.05)]:
    print("\n### " + title)
    for k in list(rows[0][3])[1:]:
        rep(k, lambda r, k=k: r[3][k], flt)
