"""The AI-run practice portfolio -> data/ai_fund.json.  Three managers on the same stock list, from cautious to hedge-fund style.
Hypothetical money only. Long-only (practice accounts cannot short), price returns only (dividends are left out for the fund and the S&P 500 alike),
0.10% cost on every trade, idle cash earns a flat 3.5% a year.

Every rule uses prices up to the signal date only; orders fill at the NEXT day's close. Nothing here looks at company scorecards or news, so the same
rules can be replayed on history without hindsight in the signals. Two honest limits on that replay, both flagged on the page:
  * the stock list is today's ~550 largest companies, so past winners are over-represented (survivorship),
  * rules were chosen by me knowing the last few years happened.
So the replay (Nov 2022 to inception) is a sanity check on the rules; only the live record, which starts on INCEPTION and is frozen night by night, counts as evidence.

  beginner      big, steady companies, about 10, equal weights, 10% always in cash, reviewed twice a year, no trading in between
  intermediate  15 companies chosen on trend + calm, equal weights, reviewed quarterly, cuts exposure when the market is below its 200-day average
  experienced   the hedge-fund style: ranks everything on trend and calm, 20 positions at most 4 per sector, weights by inverse volatility with a risk target,
                monthly review, trailing 18% stop-loss, halves exposure in a downtrend and cuts it again when market volatility spikes"""
import datetime as dt, json, math, os
import numpy as np, pandas as pd

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")
EPOCH = dt.date(2000, 1, 1)
OUT = os.path.join(DATA, "ai_fund.json")
RF = 0.035
COST = 0.001
WARM = 273                 # 252 trading days for the 12-month trend skipping the last month, plus a little slack

LEVELS = {
    "beginner": dict(label="Beginner", n=10, per_sector=2, months={1, 7}, cap_min=100, vol_max=0.40, w_each=0.09, stop=None, regime=False,
                     mix=dict(m12=0.4, m6=0.0, lowvol=0.6, near=0.0), need_trend=False),
    "intermediate": dict(label="Intermediate", n=15, per_sector=4, months={1, 4, 7, 10}, cap_min=0, vol_max=0.45, w_each=None, gross=0.95, gross_down=0.75, stop=None, regime=True,
                         mix=dict(m12=0.4, m6=0.2, lowvol=0.3, near=0.1), need_trend=False),
    "experienced": dict(label="Experienced", n=20, per_sector=4, months=set(range(1, 13)), cap_min=0, vol_max=0.70, w_each=None, stop=0.18, regime=True, target_vol=0.20, wcap=0.08,
                        mix=dict(m12=0.45, m6=0.25, lowvol=0.20, near=0.10), need_trend=True),
}
BLURB = {
    "beginner": "Ten large, steady companies, equal weights, a tenth always in cash. Looks at the list twice a year and otherwise does nothing.",
    "intermediate": "Fifteen companies picked for trend and calm, equal weights. Reviews every three months and holds more cash when the whole market is in a downtrend.",
    "experienced": "Run like a hedge fund. Ranks every stock on trend and calm, holds up to 20 (no more than 4 per sector), sizes each by how bumpy it is to hit a risk target, reviews monthly, cuts any position that falls 18% from its high, and shrinks the whole book in a downtrend or when market volatility spikes.",
}
RULES = {
    "beginner": ["Universe: companies worth over $100B, with volatility under 40% a year.", "Picks the 10 with the best mix of calm (60%) and 12-month trend (40%), at most 2 per sector.", "Equal 9% weights; 10% stays in cash.", "Reviewed in January and July only. No stops, no market timing."],
    "intermediate": ["Skips anything with volatility over 45% a year. Picks the 15 best on 12-month trend (40%), 6-month trend (20%), calm (30%) and nearness to the 52-week high (10%), at most 4 per sector.", "Equal weights, 95% invested.", "If the S&P 500 is below its 200-day average, only 75% invested.", "Reviewed in January, April, July and October."],
    "experienced": ["Only considers stocks above their own 200-day average with a positive 12-month trend and volatility under 70% a year.", "Ranks them: 12-month trend 45%, 6-month trend 25%, calm 20%, nearness to the 52-week high 10%. Takes the top 20, at most 4 per sector, and keeps current holdings unless they slip well down the ranking.", "Weights by 1 / volatility, no more than 8% each, then scales the whole book so its estimated volatility is about 20% a year (never more than 100% invested).", "Halves the book if the S&P 500 is below its 200-day average; cuts it 25% more when the S&P's 3-month volatility is above 25%.", "Sells any position that closes 18% below its highest close since it was bought, and waits for the next monthly review to reconsider it.", "Reviewed on the first trading day of every month."],
}


def d2(t):
    return EPOCH + dt.timedelta(days=int(t))


def load():
    meta = {r[0]: dict(name=r[1], sector=r[2], cap=r[3]) for r in json.load(open(os.path.join(DATA, "search.json")))["stocks"]}
    g = json.load(open(os.path.join(DATA, "hist", "_GSPC.json"))); days = list(g["t"])
    idx = pd.Index(days)
    cols, syms = [], []
    for s in sorted(meta):
        p = os.path.join(DATA, "hist", s + ".json")
        if not os.path.exists(p):
            continue
        h = json.load(open(p))
        if len(h["c"]) < WARM + 60:
            continue
        ser = pd.Series(h["c"], index=h["t"], dtype=float)
        ser = ser[~ser.index.duplicated(keep="last")].reindex(idx).ffill(limit=5)
        cols.append(ser.values); syms.append(s)
    P = np.array(cols).T
    return days, np.array(g["c"], dtype=float), P, syms, meta


def zs(x, mask):
    out = np.full(len(x), -9.0)
    ok = mask & np.isfinite(x)
    if ok.sum() < 5:
        return out
    m, s = x[ok].mean(), x[ok].std() or 1.0
    out[ok] = np.clip((x[ok] - m) / s, -3, 3)
    return out


def signals(P, t):
    c = P[t]
    m12 = P[t - 21] / P[t - 252] - 1
    m6 = P[t - 21] / P[t - 126] - 1
    lr = np.diff(np.log(P[t - 63: t + 1]), axis=0)
    vol = lr.std(axis=0, ddof=1) * math.sqrt(252)
    hi = np.nanmax(P[t - 251: t + 1], axis=0)
    sma200 = np.nanmean(P[t - 199: t + 1], axis=0)
    return dict(m12=m12, m6=m6, vol=vol, near=c / hi, trend=c > sma200)


def regime(G, t):
    sma = G[t - 199: t + 1].mean(); lr = np.diff(np.log(G[t - 63: t + 1]))
    return dict(down=bool(G[t] < sma), vol=float(lr.std(ddof=1) * math.sqrt(252)))


def pick(cfg, sg, sym, sector, cap, held):
    N = len(sym)
    ok = np.isfinite(sg["m12"]) & np.isfinite(sg["m6"]) & np.isfinite(sg["vol"]) & (sg["vol"] > 0)
    ok &= sg["vol"] <= cfg["vol_max"]
    if cfg["cap_min"]:
        ok &= np.array([(cap[i] or 0) >= cfg["cap_min"] for i in range(N)])
    if cfg["need_trend"]:
        ok &= sg["trend"] & (sg["m12"] > 0)
    mix = cfg["mix"]
    score = mix["m12"] * zs(sg["m12"], ok) + mix["m6"] * zs(sg["m6"], ok) + mix["lowvol"] * zs(-sg["vol"], ok) + mix["near"] * zs(sg["near"], ok)
    score = np.where(ok, score, -99.0) + np.where(held > 0, 0.4, 0.0)
    chosen, per = [], {}
    for i in np.argsort(-score):
        if score[i] < -50 or len(chosen) >= cfg["n"]:
            break
        if per.get(sector[i], 0) >= cfg["per_sector"]:
            continue
        chosen.append(int(i)); per[sector[i]] = per.get(sector[i], 0) + 1
    return chosen, score, ok


def weights(cfg, chosen, sg, reg):
    if not chosen:
        return {}
    if cfg["w_each"]:
        return {i: cfg["w_each"] for i in chosen}
    if "target_vol" in cfg:
        inv = np.array([1 / sg["vol"][i] for i in chosen]); w = inv / inv.sum()
        for _ in range(6):
            over = w > cfg["wcap"]
            if not over.any():
                break
            ex = (w[over] - cfg["wcap"]).sum(); w[over] = cfg["wcap"]; room = ~over
            if room.any():
                w[room] += ex * w[room] / w[room].sum()
        v = np.array([sg["vol"][i] for i in chosen]); rho = 0.35
        sp = math.sqrt(rho * (w * v).sum() ** 2 + (1 - rho) * ((w * v) ** 2).sum())
        gross = min(1.0, cfg["target_vol"] / sp) if sp > 0 else 1.0
        if reg["down"]:
            gross *= 0.5
        if reg["vol"] > 0.25:
            gross *= 0.75
        return {i: float(w[k] * gross) for k, i in enumerate(chosen)}
    gross = cfg["gross_down"] if (cfg["regime"] and reg["down"]) else cfg["gross"]
    return {i: gross / len(chosen) for i in chosen}


def why(i, sg, score, ok, sector_name):
    top = max(1, int(math.ceil(100 * (score > score[i]).sum() / max(1, ok.sum()))))
    bits = []
    if sg["m12"][i] > 0.25:
        bits.append("strong 12-month trend (%+.0f%%)" % (sg["m12"][i] * 100))
    elif sg["m12"][i] > 0:
        bits.append("positive 12-month trend (%+.0f%%)" % (sg["m12"][i] * 100))
    else:
        bits.append("12-month %+.0f%%, held for steadiness" % (sg["m12"][i] * 100))
    bits.append("volatility %.0f%%" % (sg["vol"][i] * 100))
    if sg["near"][i] > 0.95:
        bits.append("near its 52-week high")
    return "Ranks in the top %d%% of the list: %s." % (top, ", ".join(bits))


def run_level(key, cfg, days, G, P, sym, meta):
    T, N = P.shape; sector = [meta[s]["sector"] for s in sym]; cap = [meta[s]["cap"] for s in sym]
    dates = [d2(t) for t in days]
    cash, sh = 1.0, np.zeros(N); hi_since = np.zeros(N); entry = np.zeros(N); entry_day = [None] * N
    nav = np.full(T, np.nan); pend = None; trades = []; reasons = {}; plan = None
    dcash = (1 + RF) ** (1 / 252) - 1

    def trade_to(t, target, tag):
        nonlocal cash
        val = cash + float(np.nansum(sh * P[t]))
        want = np.zeros(N)
        for i, w in target.items():
            want[i] = w * val / P[t, i]
        for i in range(N):                                   # sells first
            if sh[i] > want[i] + 1e-12 and np.isfinite(P[t, i]):
                q = sh[i] - want[i]; cash += q * P[t, i] * (1 - COST)
                trades.append(dict(d=str(dates[t]), sym=sym[i], side="sell", w=round(want[i] * P[t, i] / val, 4), px=round(float(P[t, i]), 2), why=tag.get(i, "Dropped out of the group the manager wants to hold at this review.")))
                sh[i] = want[i]
                if want[i] <= 1e-12:
                    sh[i] = 0.0; entry[i] = 0; hi_since[i] = 0; entry_day[i] = None
        need = sum(max(0.0, want[i] - sh[i]) * P[t, i] for i in range(N) if np.isfinite(P[t, i]))
        scale = min(1.0, cash / (need * (1 + COST))) if need > 0 else 1.0
        for i in range(N):
            if want[i] > sh[i] + 1e-12 and np.isfinite(P[t, i]):
                q = (want[i] - sh[i]) * scale; cash -= q * P[t, i] * (1 + COST)
                if sh[i] <= 1e-12:
                    entry[i] = P[t, i]; hi_since[i] = P[t, i]; entry_day[i] = str(dates[t])
                sh[i] += q
                trades.append(dict(d=str(dates[t]), sym=sym[i], side="buy", w=round(sh[i] * P[t, i] / val, 4), px=round(float(P[t, i]), 2), why=reasons.get(i, "")))

    for t in range(WARM, T):
        cash *= 1 + dcash
        val = cash + float(np.nansum(sh * P[t]))
        if cfg["stop"]:
            held = sh > 1e-12
            hi_since[held] = np.maximum(hi_since[held], P[t, held])
            hit = held & (P[t] < hi_since * (1 - cfg["stop"]))
            for i in np.where(hit)[0]:
                cash += sh[i] * P[t, i] * (1 - COST)
                trades.append(dict(d=str(dates[t]), sym=sym[i], side="sell", w=0.0, px=round(float(P[t, i]), 2), why="Stop-loss: closed %.0f%% below its highest close since it was bought." % (cfg["stop"] * 100)))
                sh[i] = 0.0; entry[i] = 0; hi_since[i] = 0; entry_day[i] = None
        if pend is not None and pend["t"] == t:
            trade_to(t, pend["target"], pend["tag"]); pend = None
        nav[t] = cash + float(np.nansum(sh * P[t]))
        first = t == WARM
        rb = first or (dates[t].month != dates[t - 1].month and dates[t].month in cfg["months"])
        if rb:
            sg = signals(P, t); reg = regime(G, t)
            chosen, score, ok = pick(cfg, sg, sym, sector, cap, sh)
            w = weights(cfg, chosen, sg, reg)
            tag = {}
            for i in range(N):
                if sh[i] > 1e-12 and i not in w:
                    tag[i] = "Dropped out of the top group at the scheduled review%s." % ("" if ok[i] else " (no longer passes the trend filter)" if cfg["need_trend"] else "")
            for i in w:
                reasons[i] = why(i, sg, score, ok, sector[i])
            if t + 1 < T:
                pend = dict(t=t + 1, target=w, tag=tag)
            else:
                plan = dict(target=w, reg=reg, sg=sg, score=score, ok=ok)
    L = T - 1; sg = signals(P, L); reg = regime(G, L); val = nav[L]
    holds = []
    def last_px(i):   # a stock whose price feed has gone quiet is valued at its last known close, so its weight is a number, not NaN
        col = P[:L + 1, i]; ok = np.flatnonzero(np.isfinite(col)); return float(col[ok[-1]]) if len(ok) else 0.0
    for i in np.argsort(-(sh * np.nan_to_num(P[L]))):
        if sh[i] > 1e-12:
            px = last_px(i)
            holds.append(dict(sym=sym[i], name=meta[sym[i]]["name"], sector=sector[i], w=round(float(sh[i] * px / val), 4), since=entry_day[i], ret=round(float(px / entry[i] - 1), 4) if entry[i] and px else None,
                              why=reasons.get(i, ""), vol=round(float(sg["vol"][i]), 3) if np.isfinite(sg["vol"][i]) else None))
    cashw = round(float(cash / val), 4)
    nxt = None; y, m = dates[L].year, dates[L].month
    for _ in range(12):
        m += 1
        if m > 12:
            y, m = y + 1, 1
        if m in cfg["months"]:
            d = dt.date(y, m, 1)
            while d.weekday() > 4:
                d += dt.timedelta(days=1)
            nxt = str(d); break
    return dict(nav=nav, dates=dates, holds=holds, cash=cashw, trades=trades, regime=reg, next_review=nxt, planned=bool(plan))


def stats(nav, bench, days, i0):
    n = nav[i0:]; b = bench[i0:]; k = len(n)
    if k < 6 or not np.isfinite(n).all():
        return None
    r = np.diff(n) / n[:-1]; rb = np.diff(b) / b[:-1]; yrs = max(k / 252, 1e-9)
    mdd = float((n / np.maximum.accumulate(n) - 1).min()); mb = float((b / np.maximum.accumulate(b) - 1).min())
    cov = float(np.cov(r, rb)[0, 1]) if k > 20 else 0; var = float(rb.var(ddof=1)) if k > 20 else 0
    out = dict(days=k, ret=round(float(n[-1] / n[0] - 1), 4), bench=round(float(b[-1] / b[0] - 1), 4), maxdd=round(mdd, 4), bench_maxdd=round(mb, 4))
    if k > 60:
        out.update(cagr=round(float((n[-1] / n[0]) ** (1 / yrs) - 1), 4), bench_cagr=round(float((b[-1] / b[0]) ** (1 / yrs) - 1), 4), vol=round(float(r.std(ddof=1) * math.sqrt(252)), 4), bench_vol=round(float(rb.std(ddof=1) * math.sqrt(252)), 4),
                   sharpe=round(float((r.mean() * 252 - RF) / (r.std(ddof=1) * math.sqrt(252))), 2) if r.std() > 0 else None, beta=round(cov / var, 2) if var > 0 else None)
    return out


def main():
    days, G, P, syms, meta = load()
    prev = json.load(open(OUT)) if os.path.exists(OUT) else {}
    inception = prev.get("inception") or str(dt.date.today())
    asof = str(d2(days[-1]))
    res = {k: run_level(k, cfg, days, G, P, syms, meta) for k, cfg in LEVELS.items()}
    dates = res["beginner"]["dates"]; i0 = WARM
    bench = G / G[i0] * 100
    out = dict(generated=dt.datetime.utcnow().isoformat() + "Z", asof=asof, inception=inception, start=str(dates[i0]), universe=len(syms), rf=RF, cost=COST,
               t=[int(x) for x in days[i0:]], bench=[round(float(x), 2) for x in bench[i0:]], levels={})
    live0 = next((i for i, d in enumerate(dates) if str(d) >= inception), len(dates) - 1)
    for k, r in res.items():
        nav = r["nav"] / r["nav"][i0] * 100
        old = prev.get("levels", {}).get(k, {})
        frozen = {d: v for d, v in (old.get("live_nav") or {}).items()}   # live record: values from earlier nights are never rewritten
        liveseries = {}
        for i in range(live0, len(dates)):
            d = str(dates[i])
            if d in frozen:
                liveseries[d] = frozen[d]
            else:
                liveseries[d] = round(float(nav[i]), 3)
        old_tr = [x for x in (old.get("trades") or []) if x["d"] <= (max(frozen) if frozen else "0000")]
        new_tr = [x for x in r["trades"] if x["d"] >= inception and x["d"] > (max(frozen) if frozen else "0000")]
        trades = (old_tr + new_tr)[-60:] if (old_tr or new_tr) else []
        recent = [x for x in r["trades"] if x["d"] < inception][-25:]
        out["levels"][k] = dict(label=LEVELS[k]["label"], blurb=BLURB[k], rules=RULES[k], nav=[round(float(x), 2) for x in nav[i0:]], live_nav=liveseries, holdings=r["holds"], cash=r["cash"],
                                trades=trades, replay_trades=recent, regime=dict(down=r["regime"]["down"], vol=round(r["regime"]["vol"], 3)), next_review=r["next_review"],
                                stats_replay=stats(nav[i0:], bench[i0:], days, 0),
                                stats_live=stats(np.array(list(liveseries.values())), bench[live0:live0 + len(liveseries)], days, 0) if len(liveseries) > 5 else None)
    def clean(x):   # browsers reject NaN and Infinity in JSON, so any that slip through become null
        if isinstance(x, float): return x if np.isfinite(x) else None
        if isinstance(x, dict): return {k: clean(v) for k, v in x.items()}
        if isinstance(x, (list, tuple)): return [clean(v) for v in x]
        return x
    json.dump(clean(out), open(OUT, "w"), separators=(",", ":"), allow_nan=False)
    for k, v in out["levels"].items():
        s = v["stats_replay"] or {}
        print("%-12s replay %s -> return %+.1f%% vs S&P %+.1f%%, max drawdown %.1f%% (S&P %.1f%%), vol %s, %d holdings, cash %.0f%%" % (k, out["start"], 100 * s.get("ret", 0), 100 * s.get("bench", 0), 100 * s.get("maxdd", 0), 100 * s.get("bench_maxdd", 0), s.get("vol"), len(v["holdings"]), 100 * v["cash"]))


if __name__ == "__main__":
    main()
