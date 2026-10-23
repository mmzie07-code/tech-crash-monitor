"""Run once per day after US close. Writes data/latest.json and appends data/history.json."""
import json, os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from checks import load_data, run_all
import crypto, currencies, economy, world, markets, brief, calendar_feed, outlook, quotes, earnings, universe, history, recaps, fundamentals, snapshots, ipos, overlooked, housing, about

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


def morning():
    """Early-morning refresh: only the pieces that change overnight (after-close earnings results, today's calendar, recaps). Market numbers stay as of last night's close."""
    for name, path, make, fmt in (("earnings", "earnings.json", earnings.build, dict(indent=1)), ("ipos", "ipos.json", ipos.build, dict(indent=1)),
                                  ("calendar", "calendar.json", calendar_feed.build, dict(indent=1)), ("outlook", "outlook.json", outlook.build, dict(indent=1))):
        try:
            json.dump(make(), open(os.path.join(DATA, path), "w"), **fmt)
            print(name, "written")
        except Exception as e:
            print(name, "failed:", e)
    try:
        rc, tried, done = recaps.build()
        json.dump(rc, open(os.path.join(DATA, "recaps.json"), "w"), indent=1)
        print("recaps written (%d new)" % done)
    except Exception as e:
        print("recaps failed:", e)
    write_crypto()
    write_economy()


def write_economy():
    try:
        json.dump(economy.build(), open(os.path.join(DATA, "economy.json"), "w"), separators=(",", ":"))
        print("economy written")
    except Exception as e:
        print("economy failed:", e)


def write_crypto():
    try:
        json.dump(crypto.build(), open(os.path.join(DATA, "crypto.json"), "w"), separators=(",", ":"))
        print("crypto written")
    except Exception as e:
        print("crypto failed:", e)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "morning":
        return morning()
    d = load_data()
    checks = run_all(d)
    s = summarize(checks)
    q = d["QQQ"]
    snap = dict(date=q[-1][0], generated=dt.datetime.utcnow().isoformat() + "Z", level=level(s["score"]), health=100 - s["score"],
                **s, checks=checks, qqq_last=round(q[-1][1], 2),
                qqq_series=[[x, round(c, 2)] for x, c in q[-250:]],
                disclaimer="Educational analysis only. Not investment advice. Past signals do not predict future returns.")
    os.makedirs(DATA, exist_ok=True)
    json.dump(snap, open(os.path.join(DATA, "latest.json"), "w"), indent=1)
    hp = os.path.join(DATA, "history.json")
    hist = json.load(open(hp)) if os.path.exists(hp) else []
    hist = [h for h in hist if h["date"] != snap["date"]] + [dict(
        date=snap["date"], score=s["score"], health=100 - s["score"], stretch=s["stretch"], trigger=s["trigger"], level=snap["level"])]
    json.dump(hist, open(hp, "w"), indent=1)
    try:
        mk = markets.build()
        json.dump(mk, open(os.path.join(DATA, "markets.json"), "w"), indent=1)
        print("markets: %s" % {k: len(v) for k, v in mk.items() if isinstance(v, list)})
    except Exception as e:
        print("markets snapshot failed:", e)
    try:
        sec, srch = universe.build()
        json.dump(sec, open(os.path.join(DATA, "sectors.json"), "w"), separators=(",", ":"))
        json.dump(srch, open(os.path.join(DATA, "search.json"), "w"), separators=(",", ":"))
        print("sectors + search written")
        history.main()
    except Exception as e:
        print("universe/history failed:", e)
    try:
        fo, missing, bs = fundamentals.build()
        json.dump(fo, open(os.path.join(DATA, "fundamentals.json"), "w"), separators=(",", ":"))
        if bs.get("stocks"):
            json.dump(bs, open(os.path.join(DATA, "balance.json"), "w"), separators=(",", ":"))
        print("fundamentals written: %d companies" % len(fo["stocks"]))
    except Exception as e:
        print("fundamentals failed:", e)
    try:
        snapshots.main()
    except Exception as e:
        print("snapshots failed:", e)
    try:
        about.main()
    except Exception as e:
        print("about failed:", e)
    try:
        json.dump(earnings.build(), open(os.path.join(DATA, "earnings.json"), "w"), indent=1)
        print("earnings written")
    except Exception as e:
        print("earnings failed:", e)
    try:
        json.dump(quotes.build(), open(os.path.join(DATA, "quotes.json"), "w"), separators=(",", ":"))
        print("quotes written")
    except Exception as e:
        print("quotes failed:", e)
    try:
        json.dump(housing.build(), open(os.path.join(DATA, "housing.json"), "w"), separators=(",", ":"))
        print("housing written")
    except Exception as e:
        print("housing failed:", e)
    try:
        json.dump(overlooked.build(), open(os.path.join(DATA, "overlooked.json"), "w"), separators=(",", ":"))
        print("overlooked written")
    except Exception as e:
        print("overlooked failed:", e)
    try:
        json.dump(ipos.build(), open(os.path.join(DATA, "ipos.json"), "w"), indent=1)
        print("ipos written")
    except Exception as e:
        print("ipos failed:", e)
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
        rc, tried, done = recaps.build()
        json.dump(rc, open(os.path.join(DATA, "recaps.json"), "w"), indent=1)
        print("recaps written (%d new)" % done)
    except Exception as e:
        print("recaps failed:", e)
    write_crypto()
    write_economy()
    try:
        json.dump(currencies.build(), open(os.path.join(DATA, "currencies.json"), "w"), separators=(",", ":"))
        print("currencies written")
    except Exception as e:
        print("currencies failed:", e)
    try:
        w, ws = world.build()
        os.makedirs(os.path.join(DATA, "world"), exist_ok=True)
        json.dump(w, open(os.path.join(DATA, "world", "world.json"), "w"), separators=(",", ":"))
        json.dump(ws, open(os.path.join(DATA, "world", "world-series.json"), "w"), separators=(",", ":"))
        print("world written")
    except Exception as e:
        print("world failed:", e)
    try:
        json.dump(currencies.build_dollar100(), open(os.path.join(DATA, "dollar100.json"), "w"), separators=(",", ":"))
        print("dollar100 written")
    except Exception as e:
        print("dollar100 failed:", e)
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
