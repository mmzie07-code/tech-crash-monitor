"""Run once per day after US close. Writes data/latest.json and appends data/history.json."""
import json, os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from checks import load_data, run_all
import markets, brief, calendar_feed, outlook, quotes

DATA = os.path.join(os.path.dirname(__file__), "..", "data")


def level(score):
    return "Low" if score < 25 else "Elevated" if score < 50 else "High" if score < 75 else "Severe"


def summarize(checks):
    known = [c for c in checks if c["status"] != "unknown"]

    def sc(group=None):
        # stretch = fragility, unweighted (it can't be timed); overall/trigger = weighted by backtest evidence
        k = [c for c in known if (group is None or c["group"] == group) and (c["weight"] > 0 or group == "stretch")]
        wt = (lambda c: 1) if group == "stretch" else (lambda c: c["weight"])
        w = sum(wt(c) for c in k)
        return round(100 * sum(wt(c) for c in k if c["status"] == "warn") / w) if w else None
    return dict(score=sc(), stretch=sc("stretch"), trigger=sc("trigger"),
                warnings=sum(c["status"] == "warn" for c in known), evaluated=len(known), total=len(checks))


def main():
    d = load_data()
    checks = run_all(d)
    s = summarize(checks)
    q = d["QQQ"]
    snap = dict(date=q[-1][0], generated=dt.datetime.utcnow().isoformat() + "Z", level=level(s["score"]),
                **s, checks=checks, qqq_last=round(q[-1][1], 2),
                qqq_series=[[x, round(c, 2)] for x, c in q[-250:]],
                disclaimer="Educational analysis only. Not investment advice. Past signals do not predict future returns.")
    os.makedirs(DATA, exist_ok=True)
    json.dump(snap, open(os.path.join(DATA, "latest.json"), "w"), indent=1)
    hp = os.path.join(DATA, "history.json")
    hist = json.load(open(hp)) if os.path.exists(hp) else []
    hist = [h for h in hist if h["date"] != snap["date"]] + [dict(
        date=snap["date"], score=s["score"], stretch=s["stretch"], trigger=s["trigger"], level=snap["level"])]
    json.dump(hist, open(hp, "w"), indent=1)
    try:
        mk = markets.build()
        json.dump(mk, open(os.path.join(DATA, "markets.json"), "w"), indent=1)
        print("markets: %s" % {k: len(v) for k, v in mk.items() if isinstance(v, list)})
    except Exception as e:
        print("markets snapshot failed:", e)
    try:
        json.dump(quotes.build(), open(os.path.join(DATA, "quotes.json"), "w"), separators=(",", ":"))
        print("quotes written")
    except Exception as e:
        print("quotes failed:", e)
    try:
        json.dump(calendar_feed.build(), open(os.path.join(DATA, "calendar.json"), "w"), indent=1)
        print("calendar written")
    except Exception as e:
        print("calendar failed:", e)
    try:
        json.dump(outlook.build(), open(os.path.join(DATA, "outlook.json"), "w"), indent=1)
        print("outlook written")
    except Exception as e:
        print("outlook failed:", e)
    try:
        json.dump(brief.build(), open(os.path.join(DATA, "brief.json"), "w"), indent=1)
        print("brief written")
    except Exception as e:
        print("brief failed:", e)
    print("%s  score=%s (%s)  stretch=%s trigger=%s  %d/%d warnings" % (
        snap["date"], s["score"], snap["level"], s["stretch"], s["trigger"], s["warnings"], s["evaluated"]))
    for c in checks:
        print("  #%-2d %-8s %-7s %s" % (c["id"], c["status"].upper(), c["group"], c["detail"]))


if __name__ == "__main__":
    main()
