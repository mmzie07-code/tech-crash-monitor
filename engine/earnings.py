"""Daily earnings panel -> data/earnings.json: the 10 highest-valued companies that reported each day.
Facts only (EPS vs consensus, timing, stock move, filing link). AI_SUMMARIES is OFF until the owner enables it."""
import datetime as dt, json, os, re
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
AI_SUMMARIES = False  # owner decision: enable later (needs an Anthropic API key + press-release text from SEC EDGAR)
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
EPOCH = dt.date(2000, 1, 1)


def money(s):
    try:
        return float(re.sub(r"[^\d.\-]", "", s.replace("(", "-").replace(")", "")))
    except Exception:
        return None


def hist_move(sym, date_iso):
    """Stock move on the report day and the next session, from stored history (if we have it)."""
    p = os.path.join(DATA, "hist", sym + ".json")
    if not os.path.exists(p):
        return None
    j = json.load(open(p))
    d = (dt.date.fromisoformat(date_iso) - EPOCH).days
    if d not in j["t"]:
        return None
    i = j["t"].index(d)
    out = {}
    if i > 0:
        out["report_day"] = round((j["c"][i] / j["c"][i - 1] - 1) * 100, 2)
    if i + 1 < len(j["c"]):
        out["next_day"] = round((j["c"][i + 1] / j["c"][i] - 1) * 100, 2)
    return out


def day_entry(date):
    url = "https://api.nasdaq.com/api/calendar/earnings?date=" + date.isoformat()
    rows = json.loads(urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25).read())["data"]["rows"] or []
    out = []
    for r in rows:
        cap = money(r.get("marketCap") or "")
        if not cap or cap < 1e9:
            continue
        out.append((cap, r))
    out.sort(key=lambda x: -x[0])
    cos = []
    for cap, r in out[:10]:
        eps, est = money(r.get("eps") or ""), money(r.get("epsForecast") or "")
        sur = money(r.get("surprise") or "")
        when = {"time-pre-market": "before the open", "time-after-hours": "after the close"}.get(r.get("time"), None)
        b = []
        pending = eps is None
        b.append(("Scheduled to report %s." if pending else "Reported %s.") % when if when else "Report time wasn't listed by the data source.")
        if eps is not None and est is not None:
            diff = "beat" if eps > est else "missed" if eps < est else "matched"
            b.append("Earnings per share were $%.2f versus $%.2f expected, so the company %s estimates%s." % (eps, est, diff, (" by %.1f%%" % abs(sur)) if sur is not None and diff != "matched" else ""))
        elif eps is not None:
            b.append("Earnings per share were $%.2f (no analyst consensus available)." % eps)
        else:
            b.append("Results aren't posted in our data yet.%s" % ((" Analysts expected EPS of $%.2f." % est) if est is not None else ""))
        mv = hist_move(r["symbol"].replace("/", "-").replace(".", "-"), date.isoformat())
        if mv and "report_day" in mv and abs(mv["report_day"]) >= 0.05:
            s = "Stock moved %+.1f%% on %s" % (mv["report_day"], date.strftime("%b %-d"))
            if r.get("time") == "time-after-hours":
                s += " (before the report came out)" + ((", then %+.1f%% the next session" % mv["next_day"]) if "next_day" in mv else ". Reaction comes the next session")
            b.append(s + ".")
        if r.get("fiscalQuarterEnding"):
            b.append("Covers the quarter ending %s." % r["fiscalQuarterEnding"].replace("/", " "))
        cos.append(dict(symbol=r["symbol"], name=re.sub(r"\s+(Inc\.?|Corporation|Corp\.?|Company|Co\.|Ltd\.?|plc)$", "", r["name"]).strip(" ,"), market_cap_b=round(cap / 1e9, 1),
                        eps=eps, eps_estimate=est, surprise_pct=sur, timing=r.get("time"), bullets=b, ai_summary=None,
                        filings="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=%s&type=8-K&dateb=&owner=include&count=10" % r["symbol"].split("/")[0]))
    return dict(date=date.isoformat(), reported_total=len(rows), top=cos)


def build():
    path = os.path.join(DATA, "earnings.json")
    old = json.load(open(path)) if os.path.exists(path) else {"days": []}
    days = {d["date"]: d for d in old.get("days", [])}
    today = dt.date.today()
    for back in range(0, 4):  # re-fetch recent days so after-close results and moves fill in
        d = today - dt.timedelta(days=back)
        if d.weekday() >= 5:
            continue
        try:
            e = day_entry(d)
            if e["top"]:
                days[e["date"]] = e
        except Exception:
            pass
    kept = sorted(days.values(), key=lambda x: x["date"], reverse=True)[:20]
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", ai_summaries=AI_SUMMARIES, days=kept,
                note="Facts from public earnings data. AI-written summaries are not enabled yet.")


if __name__ == "__main__":
    e = build()
    json.dump(e, open(os.path.join(DATA, "earnings.json"), "w"), indent=1)
    for d in e["days"][:3]:
        print(d["date"], d["reported_total"], "reporters;", [(c["symbol"], c["market_cap_b"]) for c in d["top"][:4]])
    if e["days"]:
        for c in e["days"][0]["top"][:2]:
            print(c["symbol"], c["bullets"])
