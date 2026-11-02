"""Critical minerals (lithium, cobalt, nickel, copper): where they are mined, where reserves are, and where they are refined -> data/world/minerals.json
(the world-page Critical minerals layer). Hand-compiled and rounded from the US Geological Survey Mineral Commodity Summaries (mine output 2024, in thousand
tonnes of contained metal; reserves in million tonnes of metal) plus public IEA and company material on refining. Output by field region is an estimate:
published figures exist by country, not by mine. Run: python3 engine/minerals.py"""
import json, os

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "data", "world", "minerals.json")

M = {
    "li": dict(n="Lithium", uses="Rechargeable batteries (electric cars, phones, grid storage), plus glass and ceramics.",
        prod={"AUS": 88, "CHL": 49, "CHN": 41, "ZWE": 28, "ARG": 18, "BRA": 10, "CAN": 4},
        res={"CHL": 9.3, "AUS": 7.0, "ARG": 4.0, "CHN": 3.0, "USA": 1.9, "CAN": 1.2, "ZWE": 0.48, "BRA": 0.39},
        note="Bolivia and Argentina hold some of the biggest resources, but 'reserves' only count what is proven and workable today, so Bolivia (little output so far) barely shows.",
        ramp=[[120, 20, 70], [230, 50, 120], [255, 140, 190], [255, 230, 240]], tint=[240, 80, 150],
        fields=[("Greenbushes (Western Australia)", -33.86, 116.06, 35, "The world's biggest hard-rock lithium mine."), ("Pilbara (Western Australia)", -21.0, 118.9, 35, "Several large spodumene mines."),
                ("Goldfields (Western Australia)", -31.2, 119.4, 18, "Mt Marion, Mt Holland and others."), ("Salar de Atacama (Chile)", -23.5, -68.3, 49, "Lithium from brine, the lowest-cost source in the world."),
                ("Puna salt flats (Argentina)", -24.6, -66.9, 18, "Brine operations on the Argentine side of the 'lithium triangle'."), ("Yichun (Jiangxi, China)", 27.8, 114.4, 15, "Lithium from mica rock."),
                ("Qinghai salt lakes (China)", 36.8, 95.3, 14, "Brine lakes high on the plateau."), ("Jiajika (Sichuan, China)", 30.3, 101.5, 12, "Hard-rock mines."),
                ("Bikita and Sandawana (Zimbabwe)", -20.1, 31.7, 28, "Fast-growing Chinese-owned hard-rock mines."), ("Minas Gerais (Brazil)", -16.8, -42.0, 10, "The 'lithium valley'.")],
        sites=[("Ganzhou and Yichun, China", 27.0, 115.0, "process", "China makes roughly two-thirds of the world's battery-grade lithium chemicals, a lot of it from ore mined elsewhere."),
               ("Kwinana, Australia", -32.2, 115.77, "process", "One of the few big lithium hydroxide plants outside China."),
               ("Salar de Uyuni, Bolivia", -20.3, -67.6, "project", "One of the largest lithium resources on earth, with almost no output so far."),
               ("Thacker Pass, USA", 41.7, -118.0, "project", "The biggest US lithium project, under construction.")]),
    "co": dict(n="Cobalt", uses="Battery cathodes, jet engines, magnets and hard steels.",
        prod={"COD": 220, "IDN": 28, "RUS": 8.7, "AUS": 4.6, "PHL": 3.8, "CUB": 3.3, "MDG": 3.0, "CAN": 3.0, "PNG": 3.0, "MAR": 2.3},
        res={"COD": 6.0, "AUS": 1.7, "IDN": 0.64, "CUB": 0.5, "PHL": 0.26, "RUS": 0.25, "CAN": 0.22},
        note="Cobalt is mostly a by-product of copper and nickel mining, so its supply follows those markets. A large part of Congo's output comes from small-scale and artisanal miners.",
        ramp=[[20, 30, 120], [50, 90, 230], [110, 170, 255], [225, 238, 255]], tint=[70, 120, 255],
        fields=[("Katanga Copperbelt (DR Congo)", -10.8, 26.0, 190, "Kolwezi, Likasi and Lubumbashi: copper-cobalt mines that supply most of the world."), ("Sulawesi and Halmahera (Indonesia)", -1.5, 124.5, 28, "By-product of nickel processing."),
                ("Norilsk (Russia)", 69.35, 88.2, 8.7, "From the big nickel-copper complex."), ("Murrin Murrin (Western Australia)", -28.8, 121.9, 4.6, "Nickel-cobalt laterite."),
                ("Surigao (Philippines)", 9.7, 125.6, 3.8, "Nickel laterite by-product."), ("Moa (Cuba)", 20.67, -74.9, 3.3, "Nickel-cobalt plant."), ("Ambatovy (Madagascar)", -18.8, 48.3, 3.0, "Nickel-cobalt mine."),
                ("Sudbury and Voisey's Bay (Canada)", 46.5, -81.0, 3.0, "By-product of nickel."), ("Ramu (Papua New Guinea)", -5.8, 145.7, 3.0, "Nickel-cobalt mine."), ("Bou Azzer (Morocco)", 30.4, -6.9, 2.3, "A rare primary cobalt mine.")],
        sites=[("Huaiyin and Ganzhou, China", 33.6, 119.0, "process", "China refines roughly three-quarters of the world's cobalt, much of it from Congo concentrate."),
               ("Kokkola, Finland", 63.84, 23.13, "process", "Europe's main cobalt refinery."),
               ("Kolwezi, DR Congo", -10.7, 25.5, "project", "Heart of the mining area. Congo introduced export limits in 2025, so supply can change fast.")]),
    "ni": dict(n="Nickel", uses="Stainless steel and battery cathodes.",
        prod={"IDN": 2200, "PHL": 330, "RUS": 200, "CAN": 190, "AUS": 160, "CHN": 110, "BRA": 80},
        res={"IDN": 55, "AUS": 24, "BRA": 16, "RUS": 8.3, "PHL": 4.8, "CHN": 4.2, "CAN": 2.2},
        note="New Caledonia (France) is also a big producer (about 190 thousand tonnes) and holds about 7 million tonnes of reserves, but it isn't a separate country on this map.",
        ramp=[[90, 90, 20], [220, 210, 40], [255, 245, 130], [255, 255, 230]], tint=[235, 220, 50],
        fields=[("Morowali and Sulawesi (Indonesia)", -2.5, 122.0, 1400, "Huge Chinese-built smelters turn laterite ore into nickel; Indonesia's output has exploded since 2020."), ("Halmahera and Obi (Indonesia)", 0.4, 127.8, 800, "Another cluster of nickel processing parks."),
                ("Surigao (Philippines)", 9.6, 125.6, 330, "Mostly raw ore shipped to China."), ("Norilsk (Russia)", 69.35, 88.2, 200, "The biggest Russian nickel and palladium complex."),
                ("New Caledonia (France)", -21.5, 165.8, 190, "Big nickel mines and plants, struggling with costs and unrest."), ("Sudbury (Canada)", 46.5, -81.0, 190, "A century-old mining district."),
                ("Kambalda (Western Australia)", -31.2, 121.7, 160, "Hit by low prices and mine closures since 2024."), ("Jinchuan (Gansu, China)", 38.5, 102.2, 110, "China's main nickel mine."), ("Goiás and Pará (Brazil)", -15.0, -49.5, 80, "Laterite mines.")],
        sites=[("Morowali Industrial Park, Indonesia", -2.8, 122.2, "process", "The world's biggest nickel processing site, built with Chinese money.")]),
    "cu": dict(n="Copper", uses="Power grids, wiring, motors, EVs and buildings. It is often watched as a gauge of the economy, 'Dr Copper'.",
        prod={"CHL": 5300, "COD": 3300, "PER": 2600, "CHN": 1800, "USA": 1100, "RUS": 930, "IDN": 920, "AUS": 800, "ZMB": 750, "MEX": 750, "CAN": 720},
        res={"CHL": 190, "PER": 120, "AUS": 100, "COD": 80, "RUS": 80, "MEX": 53, "USA": 45, "CHN": 41, "IDN": 24},
        note="Grasberg (Indonesia) had a mud-rush accident in 2025 that cut output, and big mines lose ore grade over time.",
        ramp=[[10, 90, 80], [30, 190, 150], [130, 240, 190], [235, 255, 240]], tint=[40, 210, 170],
        fields=[("Northern Chile (Escondida, Chuquicamata)", -23.5, -68.9, 4200, "The world's richest copper belt, in the Atacama Desert."), ("Central Chile (El Teniente)", -34.1, -70.4, 1100, "The biggest underground copper mine."),
                ("Katanga Copperbelt (DR Congo)", -10.8, 26.0, 3300, "Growing very fast, often together with cobalt."), ("Southern Peru", -15.5, -72.0, 1500, "Cuajone, Cerro Verde and Las Bambas."), ("Antamina and central Peru", -9.5, -77.0, 1100, "Big open-pit mines in the Andes."),
                ("Tibet and Yunnan (China)", 29.3, 91.5, 900, "High-altitude mines."), ("Dexing (Jiangxi, China)", 28.9, 117.7, 900, "Asia's biggest open-pit copper mine."), ("Arizona and Utah (USA)", 33.4, -111.0, 1100, "Most US copper."),
                ("Urals and Norilsk (Russia)", 62.0, 60.0, 930, "Spread across several districts."), ("Grasberg (Indonesia)", -4.05, 137.1, 920, "One of the world's biggest copper and gold mines."), ("Olympic Dam (South Australia)", -30.4, 136.9, 800, "Copper, uranium and gold."),
                ("Zambian Copperbelt", -12.8, 28.2, 750, "Zambia's main industry."), ("Sonora (Mexico)", 30.2, -110.3, 750, "Cananea and other mines."), ("British Columbia (Canada)", 50.5, -120.5, 720, "Open-pit mines.")],
        sites=[("Guixi and Jiangxi smelters, China", 28.3, 117.2, "process", "China smelts and refines about 40% of the world's copper, more than it mines.")]),
}


def rank(d):
    o = sorted(d, key=lambda k: -d[k])
    return {k: i + 1 for i, k in enumerate(o)}


def build():
    countries = json.load(open(os.path.join(HERE, "..", "data", "world", "countries.json")))
    bad = sorted({k for m in M.values() for k in list(m["prod"]) + list(m["res"]) if k not in countries})
    if bad:
        raise SystemExit("unknown country codes: %s" % bad)
    c, out = {}, {}
    for key, m in M.items():
        pr, rr, tot, rtot = rank(m["prod"]), rank(m["res"]), sum(m["prod"].values()), sum(m["res"].values())
        for k in set(m["prod"]) | set(m["res"]):
            row = c.setdefault(k, {})[key] = {}
            if k in m["prod"]: row.update(p=m["prod"][k], pr=pr[k], sh=round(m["prod"][k] / tot * 100, 1))
            if k in m["res"]: row.update(r=m["res"][k], rr=rr[k])
        top = max(m["prod"], key=m["prod"].get)
        out[key] = {"n": m["n"], "uses": m["uses"], "note": m["note"], "ramp": m["ramp"], "tint": m["tint"], "np": len(m["prod"]), "nr": len(m["res"]), "top": top, "top_sh": round(m["prod"][top] / tot * 100), "rtop": max(m["res"], key=m["res"].get),
                    "rtop_sh": round(max(m["res"].values()) / rtot * 100),
                    "fields": [{"n": n, "lat": la, "lon": lo, "t": t, "note": nt} for n, la, lo, t, nt in m["fields"]], "sites": [{"n": n, "lat": la, "lon": lo, "k": k, "note": nt} for n, la, lo, k, nt in m["sites"]]}
    data = {"asof": "2024", "source": "US Geological Survey Mineral Commodity Summaries (rounded); refining from IEA and company reports", "order": list(M), "m": out, "c": c,
            "caveat": "Rounded and approximate. Mine output is published by country, not by mine, so the glow by region is an estimate. Refining is more concentrated than mining, and export rules or accidents can change supply quickly."}
    json.dump(data, open(OUT, "w"), separators=(",", ":"))
    print("minerals:", {k: (len(m["prod"]), len(m["fields"])) for k, m in M.items()}, "countries", len(c))


if __name__ == "__main__":
    build()
