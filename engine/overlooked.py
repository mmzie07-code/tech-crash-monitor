"""Overlooked stocks -> data/overlooked.json. A screen, not a recommendation: companies that look cheap against their sector peers
AND whose share price hasn't kept up with a business that kept growing, after a quality filter that removes most obvious junk.
Inputs: data/fundamentals.json (SEC filings), data/search.json (price, size, sector), Yahoo weekly closes (batch 'spark' endpoint)."""
import datetime as dt, json, os, statistics, sys, time
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SPECIAL = {"financials", "real-estate", "utilities"}  # cash-flow multiples don't describe these (same rule as the valuation report)
MIN_CAP_M, MIN_PRICE = 300.0, 3.0
KEEP = 250


def clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def last(a):
    """(index, value) of the last non-null entry."""
    for i in range(len(a or []) - 1, -1, -1):
        if a[i] is not None:
            return i, a[i]
    return None, None


def at(a, i):
    return a[i] if a and 0 <= i < len(a) else None


def metrics(row, F):
    sym, name, sector, cap_b, price = row[0], row[1], row[2], row[3], row[4]
    cap = cap_b * 1000.0
    ri, rev = last(F.get("rev"))
    if rev is None or rev <= 0:
        return None
    ni, ocf, opinc, capex = at(F.get("ni"), ri), at(F.get("ocf"), ri), at(F.get("opinc"), ri), at(F.get("capex"), ri) or 0.0
    ocf_prev, capex_prev = at(F.get("ocf"), ri - 1), at(F.get("capex"), ri - 1) or 0.0
    first = next((i for i, v in enumerate(F["rev"]) if v is not None and v > 0), None)
    n = ri - first if first is not None else 0
    cagr = (rev / F["rev"][first]) ** (1.0 / n) - 1 if n >= 1 else None
    fcf = ocf - capex if ocf is not None else None
    fcf_prev = ocf_prev - capex_prev if ocf_prev is not None else None
    debt, cash = (F.get("debt") or 0.0), (F.get("cash") or 0.0) + (F.get("sti") or 0.0)
    ev = cap + debt - cash
    return dict(sym=sym, name=name, sector=sector, cap_b=cap_b, price=price, cap=cap, rev=rev, cagr=cagr, ni=ni, fcf=fcf, fcf_prev=fcf_prev,
                fcf_margin=(fcf / rev) if fcf is not None else None, debt=debt, cash=cash,
                debt_cover=(debt / ocf) if (ocf and ocf > 0 and debt) else 0.0,
                pe=cap / ni if ni and ni > 0 else None,
                pfcf=cap / fcf if fcf and fcf > 0 else None,
                evebit=ev / opinc if opinc and opinc > 0 and ev > 0 else None)


def spark(symbols):
    req = urlreq.Request("https://query1.finance.yahoo.com/v8/finance/spark?symbols=%s&range=5y&interval=1wk" % ",".join(symbols), headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urlreq.urlopen(req, timeout=30).read())


def prices(symbols):
    out = {}
    for i in range(0, len(symbols), 20):
        for attempt in range(3):
            try:
                d = spark(symbols[i:i + 20])
                for s, v in d.items():
                    c = [x for x in (v.get("close") or []) if x is not None]
                    if len(c) >= 60:
                        out[s] = c
                break
            except Exception:
                time.sleep(1.5 * (attempt + 1))
        time.sleep(0.25)
    return out


def build():
    F = json.load(open(os.path.join(DATA, "fundamentals.json")))["stocks"]
    S = json.load(open(os.path.join(DATA, "search.json")))["stocks"]
    pool = []
    for r in S:
        if r[2] in SPECIAL or r[0] not in F or r[3] * 1000 < MIN_CAP_M or r[4] < MIN_PRICE:
            continue
        m = metrics(r, F[r[0]])
        if m:
            pool.append(m)
    # peer ranks: share of same-sector peers that are MORE expensive on each multiple
    by = {}
    for m in pool:
        by.setdefault(m["sector"], []).append(m)
    med = {}
    for sec, ms in by.items():
        med[sec] = {k: round(statistics.median(x[k] for x in ms if x[k]), 1) for k in ("pe", "pfcf", "evebit") if sum(1 for x in ms if x[k]) >= 5}
        for m in ms:
            ranks = []
            for k in ("pe", "pfcf", "evebit"):
                vals = [x[k] for x in ms if x[k]]
                if m[k] and len(vals) >= 8:
                    ranks.append(100.0 * sum(1 for v in vals if v > m[k]) / len(vals))
            m["value"] = round(sum(ranks) / len(ranks), 1) if len(ranks) >= 2 else None
    # quality gate: positive free cash flow two years running, profitable, not shrinking, debt that cash flow can cover
    cand = [m for m in pool if m["value"] is not None and m["value"] >= 55 and m["fcf"] and m["fcf"] > 0 and m["fcf_prev"] and m["fcf_prev"] > 0
            and m["ni"] and m["ni"] > 0 and m["cagr"] is not None and m["cagr"] >= 0 and m["debt_cover"] <= 6]
    px = prices([m["sym"] for m in cand])
    rows = []
    for m in cand:
        c = px.get(m["sym"])
        if not c:
            continue
        last_p = c[-1]
        drop52 = last_p / max(c[-52:]) - 1
        ch1 = last_p / c[-53] - 1 if len(c) >= 53 else None
        ch3 = last_p / c[-157] - 1 if len(c) >= 157 else None
        pcagr = (1 + ch3) ** (1 / 3.0) - 1 if ch3 is not None and ch3 > -1 else None
        gap = (m["cagr"] - pcagr) if pcagr is not None else None
        n_drop = clip((-drop52 - 0.10) / 0.40)
        n_gap = clip(gap / 0.25) if gap is not None else None
        neglect = 100.0 * (0.5 * n_drop + 0.5 * n_gap if n_gap is not None else n_drop)
        quality = 100.0 * (0.4 * clip(m["fcf_margin"] / 0.20) + 0.3 * clip(m["cagr"] / 0.12) + 0.3 * (1 - clip(m["debt_cover"] / 6.0)))
        if neglect < 30:
            continue
        score = 0.40 * m["value"] + 0.40 * neglect + 0.20 * quality
        rows.append(dict(sym=m["sym"], name=m["name"], sector=m["sector"], cap_b=m["cap_b"], price=m["price"], score=round(score, 1), value=m["value"],
                         neglect=round(neglect, 1), quality=round(quality, 1), pe=round(m["pe"], 1) if m["pe"] else None,
                         pfcf=round(m["pfcf"], 1) if m["pfcf"] else None, evebit=round(m["evebit"], 1) if m["evebit"] else None,
                         rev_cagr=round(m["cagr"] * 100, 1), fcf_margin=round(m["fcf_margin"] * 100, 1), debt_cover=round(m["debt_cover"], 1),
                         drop52=round(drop52 * 100, 1), ch1y=round(ch1 * 100, 1) if ch1 is not None else None, ch3y=round(ch3 * 100, 1) if ch3 is not None else None))
    rows.sort(key=lambda r: -r["score"])
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", rows=rows[:KEEP], sector_medians=med,
                counts=dict(pool=len(pool), cheap_and_sound=len(cand), shown=min(len(rows), KEEP), screened_out_special=sum(1 for r in S if r[2] in SPECIAL)),
                disclaimer="A screen built from public filings and prices. It finds candidates to research, not recommendations. We have not shown that it beats the market, and cheap stocks are often cheap for a reason.")


if __name__ == "__main__":
    out = build()
    json.dump(out, open(os.path.join(DATA, "overlooked.json"), "w"), separators=(",", ":"))
    c = out["counts"]
    print("overlooked: pool %d, cheap-and-sound %d, shown %d" % (c["pool"], c["cheap_and_sound"], c["shown"]))
    for r in out["rows"][:25]:
        print("%-6s %-30s %-22s cap$%5.1fB score %4.1f val %4.1f neg %4.1f q %4.1f | P/E %s P/FCF %s | rev %+.1f%%/y  from52wk-high %+.0f%%  3y %s%%" % (
            r["sym"], r["name"][:30], r["sector"][:22], r["cap_b"], r["score"], r["value"], r["neglect"], r["quality"], r["pe"], r["pfcf"], r["rev_cagr"], r["drop52"], r["ch3y"]))
