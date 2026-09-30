"""Replay the checklist over history and measure how well it warned before QQQ drawdowns.
Event = QQQ falls >= DROP from a day's close at some point within the next HORIZON trading days.
Run: python3 engine/backtest.py [drop] [horizon]"""
import json, os, sys, bisect
sys.path.insert(0, os.path.dirname(__file__))
import checks as C

ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
DROP = float(sys.argv[1]) if len(sys.argv) > 1 else 0.15
H = int(sys.argv[2]) if len(sys.argv) > 2 else 60
KEEP = 300  # checks never look back more than ~252 bars


def load(sym):
    return [tuple(x) for x in json.load(open(os.path.join(ROOT, "cache", sym.replace("^", "") + ".json")))]


def main():
    S = {k: load(k) for k in ["QQQ", "QQQE", "SMH", "^TNX", "^VIX", "HYG", "IEF"]}
    dates = {k: [d for d, _ in v] for k, v in S.items()}
    q = S["QQQ"]
    rows = []
    for i in range(260, len(q) - 1):
        day = q[i][0]
        d = {}
        for k, v in S.items():
            j = bisect.bisect_right(dates[k], day)
            d[k] = v[max(0, j - KEEP):j]
        res = {c["id"]: c["status"] for c in C.run_all(d)}
        fut = [c for _, c in q[i + 1:i + 1 + H]]
        ev = (min(fut) / q[i][1] - 1) <= -DROP if len(fut) == H else None
        rows.append((day, res, ev))
    json.dump([(d, r, e) for d, r, e in rows], open(os.path.join(ROOT, "cache", "bt_rows.json"), "w"))
    report(rows)


def stats(sel):
    n = len(sel)
    ev = [r for r in sel if r[2] is not None]
    if not ev:
        return None
    return n, sum(1 for r in ev if r[2]) / len(ev)


def score(res):
    k = [(C.WEIGHTS[i], v) for i, v in res.items() if v != "unknown" and C.WEIGHTS[i] > 0]
    w = sum(x for x, _ in k)
    return 100 * sum(x for x, v in k if v == "warn") / w if w else 0


def report(rows):
    rows = [r for r in rows if r[2] is not None]
    base = sum(r[2] for r in rows) / len(rows)
    print("Event: QQQ drops >= %d%% within %d trading days.  Days tested: %d  Base rate: %.1f%%" % (DROP * 100, H, len(rows), base * 100))
    for label, sub in [("ALL", rows), ("TRAIN <=2014", [r for r in rows if r[0] < "2015"]), ("TEST 2015+", [r for r in rows if r[0] >= "2015"])]:
        b = sum(r[2] for r in sub) / len(sub)
        print("\n== %s  (base %.1f%%, n=%d)" % (label, b * 100, len(sub)))
        print("%-32s %8s %10s %6s" % ("signal", "%days on", "P(event)", "lift"))
        for cid in [1, 2, 5, 6, 7, 8, 10]:
            on = [r for r in sub if r[1].get(cid) == "warn"]
            if len(on) < 20:
                print("%-32s %8s" % ("check #%d" % cid, "n/a")); continue
            p = sum(r[2] for r in on) / len(on)
            print("%-32s %7.0f%% %9.1f%% %5.2fx" % ("check #%d warn" % cid, 100 * len(on) / len(sub), p * 100, p / b))
        for th in [20, 25, 40, 50]:
            on = [r for r in sub if score(r[1]) >= th]
            if len(on) < 20:
                print("%-32s %8s" % ("score >= %d" % th, "n/a")); continue
            p = sum(r[2] for r in on) / len(on)
            rec = sum(r[2] for r in on) / max(1, sum(r[2] for r in sub))
            print("%-32s %7.0f%% %9.1f%% %5.2fx   recall %.0f%%" % ("score >= %d" % th, 100 * len(on) / len(sub), p * 100, p / b, rec * 100))


if __name__ == "__main__":
    main()
