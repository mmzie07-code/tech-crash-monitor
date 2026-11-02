"""Main sea trade routes, chokepoints and big ports -> data/world/trade.json (the world-page Trade routes layer).
Hand-compiled: the routes are the well-known shipping lanes (waypoints, not live ship positions), and every route is checked against the country
outlines so no lane cuts across land. Volume notes are rounded, widely quoted figures. Run: python3 engine/trade.py"""
import json, math, os, sys

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data", "world")
OUT = os.path.join(DATA, "trade.json")

# kind: box (containers and goods) | oil (crude and fuel) | bulk (grain, ore, coal)
# shared stretches (the lanes overlap in real life too)
SHANGHAI_SCS = [(31.0, 123.0), (28.5, 122.5), (26.5, 121.2), (25.2, 120.2), (24.3, 119.7), (22.8, 117.5), (20.5, 114.5), (14, 114.5), (7, 107.5), (1.2, 104.2)]   # Shanghai down the Taiwan Strait to Singapore
MALACCA_W = [(1.8, 102.6), (2.6, 100.9), (5.6, 97.8), (6.0, 96.0), (6.1, 94.0), (6.2, 82.5), (5.5, 79.8)]   # Singapore through Malacca to Sri Lanka
MED_W = [(35, 20), (37.3, 11.7), (37.4, 5), (37.2, 0), (36.4, -3), (35.95, -5.5), (36.3, -8), (37, -10), (43, -10.5), (46.5, -7), (48.7, -5.8), (49.6, -3), (50.0, -1), (50.8, 1.2), (51.8, 2.6), (52.0, 3.8)]   # Sicily to Rotterdam
CAPE_N = [(-35.5, 27), (-35.8, 21), (-35.5, 16), (-30, 12), (-20, 6), (-5, -2), (1, -5), (3.5, -9), (5, -13), (9, -18), (14.5, -19.5), (21, -19), (30, -18), (36.3, -10), (43, -10.5), (46.5, -7), (48.7, -5.8), (49.6, -3), (50.0, -1), (50.8, 1.2), (51.8, 2.6), (52.0, 3.8)]
SOUTH_INDIAN = [(5.5, 79.8), (-5, 68), (-12, 65), (-20, 54), (-27, 48), (-31.5, 36)]   # Sri Lanka to the bottom of Madagascar
JAPAN = [(14, 114.5), (20.5, 119), (21, 121), (24.5, 128), (31.5, 133), (32.6, 136), (33.6, 138.5), (34.6, 139.9)]
ROUTES = [
    ("suez", "Asia to Europe (Suez)", "box", "Containers and goods from China, Korea and Southeast Asia to Europe through the Red Sea and the Suez Canal.",
     SHANGHAI_SCS + MALACCA_W + [(9, 70), (13, 62), (14.5, 56), (13, 50.5), (12.5, 43.4), (15, 41.8), (20, 38.5), (24, 36.5), (27, 34.0), (29.9, 32.6), (31.4, 32.3), (33.5, 29)] + MED_W),
    ("gulf", "Persian Gulf oil to Asia", "oil", "Crude from Saudi Arabia, Iraq, the UAE and Kuwait to India, China, Japan and Korea, through the Strait of Hormuz.",
     [(26.7, 50.6), (26.6, 51.6), (26.0, 53.5), (26.4, 56.5), (26.0, 57.0), (24.8, 58.8), (22.5, 62), (16, 67), (8.5, 74.5), (5.5, 79.8)] + MALACCA_W[::-1][1:] + [(1.2, 104.2)] + JAPAN),
    ("pacific", "Trans-Pacific", "box", "Goods from East Asia to the US West Coast, one of the busiest container routes.",
     [(31.0, 123.0), (29.5, 128.5), (29.8, 131.5), (32.2, 135.5), (33.5, 139.5), (34.2, 140.4), (40, 160), (45, 180), (47, -160), (42, -140), (36, -125), (33.6, -118.3)]),
    ("cape", "Around the Cape of Good Hope", "box", "The long way round Africa between Asia and the Atlantic. Used by ships too big for Suez or avoiding it.",
     SOUTH_INDIAN + [(-35.5, 27)] + CAPE_N[1:]),
    ("atlantic", "North Atlantic", "box", "Goods, fuel and machinery between Europe and North America.",
     [(52.0, 3.8), (51.8, 2.6), (50.8, 1.2), (50.0, -1), (49.6, -3), (48.7, -5.8), (49.5, -9), (47, -30), (43, -50), (41, -62), (40.35, -73.7)]),
    ("panama", "US East Coast to Panama and the Pacific", "box", "Ships between the Atlantic and Pacific use the Panama Canal; goods head on to Asia.",
     [(40.35, -73.7), (34, -68), (26, -55), (15, -55), (11.8, -60.6), (12.3, -66), (13.3, -70), (13, -73), (12, -76), (10.5, -78), (9.55, -79.95)]),
    ("panama2", "Panama to Asia", "box", "From the Pacific end of the Panama Canal across the ocean to East Asia.",
     [(8.7, -79.4), (7.2, -79.5), (5.5, -81), (12, -110), (22, -140), (30, -170), (34, 175), (33.5, 150), (34.6, 139.9)]),
    ("brazil", "Brazil to China", "bulk", "Iron ore and soybeans from Brazil to China, around the Cape of Good Hope.",
     [(-24.2, -45.8), (-30, -38), (-37, -10), (-37, 15), (-35.8, 21), (-35.5, 27), (-33, 35), (-27, 48), (-20, 54), (-12, 65), (-3, 78), (5.5, 79.8)] + MALACCA_W[::-1][1:] + [(1.2, 104.2)] + SHANGHAI_SCS[::-1][1:]),
    ("gulfus", "US Gulf Coast to Europe", "oil", "US crude, fuel and gas exports to Europe, now among the world's biggest.",
     [(29.3, -94.2), (28, -90), (25.5, -85), (24.1, -82.0), (24.7, -80.2), (25.5, -79.5), (30, -78), (36, -68), (44, -45), (49, -20), (49.6, -8), (49.6, -3), (50.0, -1), (50.8, 1.2), (51.8, 2.6), (52.0, 3.8)]),
    ("blacksea", "Black Sea grain to the Mediterranean", "bulk", "Wheat, corn and sunflower oil from Ukraine, Russia and Romania via the Bosphorus.",
     [(46.2, 31.3), (44.5, 31.2), (42, 29.6), (41.2, 29.1), (40.9, 28.7), (40.4, 27.0), (39.6, 25.8), (38, 25.6), (36.5, 24.5), (35.6, 22.5), (35, 20)]),
]
# narrow straits and canals, where the country outlines are too coarse for a ship lane: lat range, lon range
NARROW = [(24.8, 27.3, 55.3, 58.3), (0.8, 4.5, 100.0, 104.6), (28.0, 31.6, 31.8, 33.8), (12.0, 13.6, 42.8, 44.2), (39.5, 41.5, 25.5, 29.6), (8.3, 9.8, -80.3, -79.2)]
# chokepoints: name, lat, lon, note
CHOKES = [
    ("Strait of Hormuz", 26.5, 56.3, "About a fifth of the world's oil passes through this narrow gap at the mouth of the Persian Gulf."),
    ("Strait of Malacca", 2.6, 100.9, "The short cut between the Indian and Pacific oceans; one of the busiest lanes in the world, and narrow."),
    ("Suez Canal", 30.2, 32.55, "Cuts out the trip round Africa; roughly one in eight of the world's traded goods by value uses it, normally."),
    ("Bab el-Mandeb", 12.6, 43.3, "The gate between the Red Sea and the Gulf of Aden. Attacks on ships here since late 2023 pushed many round Africa instead."),
    ("Panama Canal", 9.2, -79.8, "Links the Atlantic and Pacific; around 5% of world sea trade, and sensitive to drought."),
    ("Strait of Gibraltar", 35.95, -5.5, "The entrance to the Mediterranean from the Atlantic."),
    ("Bosphorus", 41.1, 29.05, "The only way out of the Black Sea; grain and oil pass through the heart of Istanbul."),
    ("Cape of Good Hope", -34.4, 18.5, "The route round Africa when Suez is closed or too small for the ship."),
    ("Taiwan Strait", 24.5, 119.6, "Much of the world's container traffic from East Asia passes through or beside it."),
    ("English Channel", 50.3, -0.5, "The busiest shipping lane in Europe, to the ports of Rotterdam, Antwerp and Hamburg."),
]
# ports: name, lat, lon
PORTS = [("Shanghai", 31.2, 121.9), ("Singapore", 1.26, 103.84), ("Ningbo-Zhoushan", 29.9, 121.9), ("Shenzhen", 22.5, 113.9), ("Busan", 35.1, 129.1), ("Hong Kong", 22.3, 114.2), ("Rotterdam", 51.95, 4.1),
         ("Los Angeles and Long Beach", 33.73, -118.25), ("Jebel Ali (Dubai)", 25.0, 55.05), ("Antwerp", 51.3, 4.3), ("Tokyo and Yokohama", 35.4, 139.7), ("New York and New Jersey", 40.6, -74.1),
         ("Hamburg", 53.55, 9.95), ("Santos (Brazil)", -23.97, -46.3), ("Port Said", 31.3, 32.3), ("Colombo", 6.95, 79.85), ("Tanjung Pelepas", 1.36, 103.55)]


def slerp(a, b, n):
    la, oa, lb, ob = map(math.radians, (a[0], a[1], b[0], b[1]))
    va = (math.cos(la) * math.cos(oa), math.sin(la), -math.cos(la) * math.sin(oa)); vb = (math.cos(lb) * math.cos(ob), math.sin(lb), -math.cos(lb) * math.sin(ob))
    th = math.acos(max(-1, min(1, sum(x * y for x, y in zip(va, vb)))))
    for i in range(n + 1):
        t = i / n; k1 = math.sin((1 - t) * th) / math.sin(th) if th else 1; k2 = math.sin(t * th) / math.sin(th) if th else 0
        v = [k1 * x + k2 * y for x, y in zip(va, vb)]; nn = math.sqrt(sum(x * x for x in v))
        yield math.degrees(math.asin(v[1] / nn)), math.degrees(math.atan2(-v[2] / nn, v[0] / nn))


def land_index():
    polys = []
    for co in json.load(open(os.path.join(DATA, "borders.json")))["c"]:
        for rings in co["p"]:
            un = []
            for r in rings:
                out, shift, prev = [], 0, None
                for i in range(0, len(r), 2):
                    lo = r[i]
                    if prev is not None:
                        if lo + shift - prev > 180: shift -= 360
                        elif lo + shift - prev < -180: shift += 360
                    lo += shift; prev = lo; out.append((lo, r[i + 1]))
                un.append(out)
            xs = [p[0] for p in un[0]]; ys = [p[1] for p in un[0]]
            polys.append((min(xs), min(ys), max(xs), max(ys), un, co.get("i") or co.get("n")))
    return polys


def on_land(polys, lat, lon):
    for off in (-360, 0, 360):
        x = lon + off
        for x0, y0, x1, y1, rings, name in polys:
            if x < x0 or x > x1 or lat < y0 or lat > y1: continue
            ins = False
            for r in rings:
                j = len(r) - 1
                for i in range(len(r)):
                    if (r[i][1] > lat) != (r[j][1] > lat) and x < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]: ins = not ins
                    j = i
            if ins: return name
    return None


def check():
    polys = land_index(); bad = []
    for rid, name, kind, what, pts in ROUTES:
        for a, b in zip(pts, pts[1:]):
            for la, lo in slerp(a, b, 60):
                if any(r[0] <= la <= r[1] and r[2] <= lo <= r[3] for r in NARROW): continue
                w = on_land(polys, la, lo)
                if w: bad.append((rid, a, b, round(la, 2), round(lo, 2), w)); break
    for n, la, lo, _ in CHOKES:
        pass
    return bad


def build():
    bad = check()
    for b in bad: print("LAND:", b)
    if bad and "force" not in sys.argv: raise SystemExit("routes cross land")
    out = {"source": "Hand-compiled from public shipping and trade summaries (UNCTAD, EIA, canal authorities); rounded", "caveat": "The lanes are the usual routes, not live ship positions. Volumes are rough, widely quoted figures.",
           "routes": [{"id": i, "n": n, "k": k, "what": w, "pts": [[round(a, 2), round(b, 2)] for a, b in p]} for i, n, k, w, p in ROUTES],
           "chokes": [{"n": n, "lat": la, "lon": lo, "note": t} for n, la, lo, t in CHOKES], "ports": [{"n": n, "lat": la, "lon": lo} for n, la, lo in PORTS]}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("trade: %d routes, %d chokepoints, %d ports" % (len(ROUTES), len(CHOKES), len(PORTS)))


if __name__ == "__main__":
    build()
