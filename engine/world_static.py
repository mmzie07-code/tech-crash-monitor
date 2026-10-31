"""One-off builder for the globe's STATIC data (run by hand when needed, output is committed):
  data/world/borders.json   - country outlines (Natural Earth 1:50m via world-atlas), simplified, with a label point per country
  data/world/countries.json - name, codes, capital, currency codes, IANA time zone (from the tz database) and region for each country
Sources: Natural Earth (public domain), mledoze/countries (ODbL), World Bank country list, IANA tz database."""
import json, math, os, re, sys, urllib.request as ur

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world")
UA = {"User-Agent": "Mozilla/5.0"}


def get(url):
    return json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=90).read())


def decode_arcs(topo):
    sc, tr = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for a in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)
    return arcs


def ring_pts(arcs, idxs):
    out = []
    for i in idxs:
        seg = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(seg if not out else seg[1:])
    return out


def ring_area_centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r) - 1):
        x0, y0 = r[i]
        x1, y1 = r[i + 1]
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    a *= 0.5
    if abs(a) < 1e-12:
        return 0, r[0][0], r[0][1]
    return a, cx / (6 * a), cy / (6 * a)


def km2(ring):
    """Approximate area in square km (equirectangular at the ring's mean latitude)."""
    lat = sum(p[1] for p in ring) / len(ring)
    k = 111.32
    return abs(ring_area_centroid([(x * k * math.cos(math.radians(lat)), y * k) for x, y in ring])[0])


def point_in(r, x, y):
    ins = False
    j = len(r) - 1
    for i in range(len(r)):
        if (r[i][1] > y) != (r[j][1] > y) and x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]:
            ins = not ins
        j = i
    return ins


def zone_for(cc, lat, lon):
    """IANA zone for a country: the zone.tab entry nearest the capital."""
    best, bd = None, 1e9
    for line in open("/usr/share/zoneinfo/zone.tab"):
        if line.startswith("#"):
            continue
        p = line.rstrip("\n").split("\t")
        if p[0] != cc:
            continue
        m = re.match(r"([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?", p[1])
        s1, d1, m1, x1, s2, d2, m2, x2 = m.groups()
        zl = (1 if s1 == "+" else -1) * (int(d1) + int(m1) / 60 + int(x1 or 0) / 3600)
        zo = (1 if s2 == "+" else -1) * (int(d2) + int(m2) / 60 + int(x2 or 0) / 3600)
        d = (zl - lat) ** 2 + (zo - lon) ** 2
        if d < bd:
            best, bd = p[2], d
    return best


# Overseas parts of a country (French Guiana is France, but it sits in South America): give each its own outline and record, so hovering one never says "France is in South America".
# (iso3, name, iso2, capital, cap lat/lon, region, sub, currency, tz, parent) and the box (lon0, lat0, lon1, lat1) that its polygons fall in
OVERSEAS = [
    ("GUF", "French Guiana", "GF", "Cayenne", [4.94, -52.33], "Americas", "South America", "EUR", "America/Cayenne", "FRA", (-56, 1, -50, 7)),
    ("GLP", "Guadeloupe", "GP", "Basse-Terre", [16.0, -61.73], "Americas", "Caribbean", "EUR", "America/Guadeloupe", "FRA", (-62.5, 15.5, -60.5, 16.8)),
    ("MTQ", "Martinique", "MQ", "Fort-de-France", [14.6, -61.07], "Americas", "Caribbean", "EUR", "America/Martinique", "FRA", (-61.5, 14, -60.5, 15)),
    ("REU", "Réunion", "RE", "Saint-Denis", [-20.88, 55.45], "Africa", "Eastern Africa", "EUR", "Indian/Reunion", "FRA", (54.5, -22, 56.5, -20)),
    ("MYT", "Mayotte", "YT", "Mamoudzou", [-12.78, 45.23], "Africa", "Eastern Africa", "EUR", "Indian/Mayotte", "FRA", (44.5, -13.5, 45.5, -12)),
    ("XCN", "Canary Islands", "ES", "Las Palmas / Santa Cruz", [28.29, -16.63], "Africa", "Atlantic Ocean", "EUR", "Atlantic/Canary", "ESP", (-19, 27, -13, 29.6)),
    ("XMD", "Madeira", "PT", "Funchal", [32.65, -16.91], "Africa", "Atlantic Ocean", "EUR", "Atlantic/Madeira", "PRT", (-17.5, 32, -16, 33.5)),
    ("XAZ", "Azores", "PT", "Ponta Delgada", [37.74, -25.67], "Europe", "Atlantic Ocean", "EUR", "Atlantic/Azores", "PRT", (-32, 36.5, -24.5, 40)),
    ("BES", "Caribbean Netherlands", "BQ", "Kralendijk", [12.14, -68.27], "Americas", "Caribbean", "USD", "America/Kralendijk", "NLD", (-70, 11.5, -62, 18.5)),
]


def split_overseas(borders, ctry):
    """Move each overseas polygon out of its parent's outline into a feature of its own (idempotent)."""
    have = {o["i"] for o in borders if o["i"]}
    for iso, name, iso2, cap, ll, reg, sub, cur, tz, parent, box in OVERSEAS:
        if iso in have:
            continue
        par = next((o for o in borders if o["i"] == parent), None)
        if not par:
            continue
        inside = lambda pr: box[0] <= sum(pr[0][0::2]) / len(pr[0][0::2]) <= box[2] and box[1] <= sum(pr[0][1::2]) / len(pr[0][1::2]) <= box[3]
        mine = [pr for pr in par["p"] if inside(pr)]
        if not mine:
            continue
        par["p"] = [pr for pr in par["p"] if not inside(pr)]
        bx = lambda polys: [round(min(x for pr in polys for x in pr[0][0::2]), 2), round(min(y for pr in polys for y in pr[0][1::2]), 2), round(max(x for pr in polys for x in pr[0][0::2]), 2), round(max(y for pr in polys for y in pr[0][1::2]), 2)]
        par["b"] = bx(par["p"])
        big = max(mine, key=lambda pr: km2(list(zip(pr[0][0::2], pr[0][1::2]))))
        rx, ry = big[0][0::2], big[0][1::2]
        borders.append(dict(i=iso, n=name, ar=round(sum(km2(list(zip(pr[0][0::2], pr[0][1::2]))) for pr in mine)), lp=[round(sum(rx) / len(rx), 2), round(sum(ry) / len(ry), 2)], b=bx(mine), p=mine))
        pm = ctry.get(parent, {})
        ctry[iso] = dict(iso3=iso, iso2=iso2, name=name, official=name, capital=cap, cap=ll, region=reg, sub=sub, cur=[cur], tz=tz, area=None, income=pm.get("income"), parent=parent, parentName=pm.get("name"))


def fix_outlines(borders):
    """Drop dateline slivers (a 0.05-degree strip that spans the whole map, which put Fiji's label in the Atlantic) and give label points a spot that is really inside the country."""
    for o in borders:
        keep = []
        for pr in o["p"]:
            r = pr[0]; xs = r[0::2]; ys = r[1::2]
            if max(xs) - min(xs) > 300 and max(ys) - min(ys) < 1:
                continue
            keep.append(pr)
        if len(keep) != len(o["p"]):
            o["p"] = keep
            xs = [x for pr in keep for x in pr[0][0::2]]; ys = [y for pr in keep for y in pr[0][1::2]]
            o["b"] = [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)]
            big = max(keep, key=lambda pr: km2(list(zip(pr[0][0::2], pr[0][1::2]))))
            bx, by = big[0][0::2], big[0][1::2]
            o["lp"] = [round(sum(bx) / len(bx), 2), round(sum(by) / len(by), 2)]
    for o in borders:   # label points that land outside the outline (Russia's centroid is in the Arctic gap, Israel's in the West Bank)
        if o["i"] in LP_FIX:
            o["lp"] = LP_FIX[o["i"]]


LP_FIX = {"RUS": [95.0, 62.0], "ISR": [34.9, 31.0]}


def main():
    os.makedirs(OUT, exist_ok=True)
    topo = get("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json")
    mle = get("https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json")
    wb = get("https://api.worldbank.org/v2/country?format=json&per_page=400")[1]
    by_ccn = {c["ccn3"]: c for c in mle if c.get("ccn3")}
    wbm = {c["id"]: c for c in wb if c["region"]["value"] != "Aggregates"}
    arcs = decode_arcs(topo)
    out, seen = [], set()
    for g in topo["objects"]["countries"]["geometries"]:
        name = g["properties"]["name"]
        m = by_ccn.get(str(g.get("id", "")).zfill(3)) if g.get("id") is not None else None
        iso3 = m["cca3"] if m else {"Kosovo": "XKX"}.get(name)
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]] if g["type"] == "Polygon" else []
        rings = []
        for poly in polys:
            pr = [ring_pts(arcs, r) for r in poly]
            rings.append(pr)
        if not rings:
            continue
        # label point: centroid of the biggest polygon (falls back to a point inside if the centroid lands outside it)
        big = max(rings, key=lambda pr: km2(pr[0]))
        a, cx, cy = ring_area_centroid(big[0])
        if not point_in(big[0], cx, cy):
            cx, cy = big[0][len(big[0]) // 2]
        xs = [p[0] for pr in rings for p in pr[0]]
        ys = [p[1] for pr in rings for p in pr[0]]
        out.append(dict(i=iso3, n=name, ar=round(sum(km2(pr[0]) for pr in rings)), lp=[round(cx, 2), round(cy, 2)], b=[round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
                        p=[[[round(c, 2) for pt in ring for c in pt] for ring in pr] for pr in rings]))
        if iso3:
            seen.add(iso3)
    json.dump(dict(c=out), open(os.path.join(OUT, "borders.json"), "w"), separators=(",", ":"))   # (overseas parts are split out below, after the country records exist)
    print("borders:", len(out), "countries,", os.path.getsize(os.path.join(OUT, "borders.json")) // 1024, "KB")
    ctry = {}
    for c in mle:
        iso3 = c["cca3"]
        if iso3 not in seen:
            continue
        w = wbm.get(iso3, {})
        try:
            clat, clon = float(w.get("latitude")), float(w.get("longitude"))
        except (TypeError, ValueError):
            clat, clon = c["latlng"]
        ctry[iso3] = dict(iso3=iso3, iso2=c["cca2"], name=c["name"]["common"], official=c["name"]["official"], capital=(w.get("capitalCity") or (c.get("capital") or [""])[0]),
                          cap=[round(clat, 2), round(clon, 2)], region=c.get("region"), sub=c.get("subregion"), cur=list((c.get("currencies") or {}).keys()),
                          tz=zone_for(c["cca2"], clat, clon), area=c.get("area"), income=(w.get("incomeLevel") or {}).get("value"))
    ctry["XKX"] = dict(iso3="XKX", iso2="XK", name="Kosovo", official="Republic of Kosovo", capital="Pristina", cap=[42.67, 21.17], region="Europe", sub="Southeast Europe", cur=["EUR"], tz="Europe/Belgrade", area=10887, income="Upper middle income")
    split_overseas(out, ctry)
    fix_outlines(out)
    json.dump(dict(c=out), open(os.path.join(OUT, "borders.json"), "w"), separators=(",", ":"))
    json.dump(ctry, open(os.path.join(OUT, "countries.json"), "w"), separators=(",", ":"))
    miss = [o["n"] for o in out if not o["i"] or o["i"] not in ctry]
    print("countries:", len(ctry), "| borders without a country record:", miss)


if __name__ == "__main__" and len(sys.argv) == 1:
    main()


def _dp(pts, tol):
    """Douglas-Peucker simplification of an open polyline [(x, y), ...]."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def timezones():
    """Real (irregular) time-zone areas from Natural Earth's 1:10m time-zone polygons, simplified. Written to data/world/timezones.json."""
    g = get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_time_zones.geojson")
    out = []
    for f in g["features"]:
        pr = f["properties"]
        polys = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]
        rings = []
        for poly in polys:
            rr = []
            for ring in poly:
                s = _dp([(x, y) for x, y in ring], 0.05)
                if len(s) >= 4:
                    rr.append([round(c, 2) for p in s for c in p])
            if rr:
                rings.append(rr)
        out.append(dict(o=pr["zone"], c=pr.get("map_color6") or 1, p=rings))
    json.dump(dict(z=out), open(os.path.join(OUT, "timezones.json"), "w"), separators=(",", ":"))
    print("timezones:", len(out), "zones,", os.path.getsize(os.path.join(OUT, "timezones.json")) // 1024, "KB")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "tz":
    timezones()
