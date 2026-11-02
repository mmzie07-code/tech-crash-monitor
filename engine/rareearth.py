"""Rare earth elements: where they are mined, where reserves sit, where they are refined -> data/world/rare.json (the world-page Rare earths layer).
Hand-compiled and rounded from the US Geological Survey Mineral Commodity Summaries (mine output in tonnes of rare earth oxide, 2024; reserves) plus public
company and IEA material on refining. Output by field region is an estimate: published figures exist by country, not by mine. Run: python3 engine/rareearth.py"""
import json, os

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "data", "world", "rare.json")

# mine output, thousand tonnes of rare earth oxide, 2024
PROD = {"CHN": 270, "USA": 45, "MMR": 31, "AUS": 13, "NGA": 13, "THA": 13, "IND": 2.9, "RUS": 2.5, "MDG": 2.0, "VNM": 0.3, "MYS": 0.13, "BRA": 0.02}
# reserves, million tonnes of rare earth oxide
RES = {"CHN": 44, "BRA": 21, "IND": 6.9, "AUS": 5.7, "RUS": 3.8, "VNM": 3.5, "USA": 1.9, "GRL": 1.5, "TZA": 0.89, "ZAF": 0.86, "CAN": 0.83}

# producing regions: name, lat, lon, rough output in thousand tonnes a year, what's special
FIELDS = [
    ("Bayan Obo (Inner Mongolia, China)", 41.8, 110.0, 130, "The world's biggest rare earth mine, mostly the 'light' elements used in magnets."),
    ("Southern ionic clays (Jiangxi, Guangdong, Fujian, China)", 25.3, 115.2, 70, "Clay deposits rich in the scarcer 'heavy' elements (dysprosium, terbium)."),
    ("Maoniuping (Sichuan, China)", 28.5, 102.2, 40, "Second main source of light rare earths in China."),
    ("Kachin State (Myanmar)", 25.6, 97.6, 31, "Heavy rare earths dug from clay, mostly small mines, nearly all sent on to China for refining."),
    ("Mountain Pass (California, USA)", 35.47, -115.53, 45, "The main US mine. Its ore has long been sent to China for refining, though US refining and magnet plants are being built."),
    ("Mount Weld (Western Australia)", -28.86, 122.55, 13, "A very rich deposit; the main source outside China and the US."),
    ("Jos Plateau (Nigeria)", 9.9, 8.9, 9, "Small-scale mining, mostly as a by-product."),
    ("Kerala and Odisha beach sands (India)", 12.5, 79.5, 2.9, "Rare earths in monazite sand, a by-product of mineral sands mining."),
    ("Lovozero (Russia)", 67.9, 34.8, 2.5, "Kola Peninsula."),
    ("South-east Madagascar", -24.9, 47.0, 2.0, "Monazite from mineral sands and clay deposits."),
]
# refining, magnets and projects: name, lat, lon, kind (process | project), note
SITES = [
    ("Baotou, China", 40.65, 109.8, "process", "China's rare earth capital: refines Bayan Obo ore and makes many of the world's magnets."),
    ("Ganzhou, China", 25.85, 114.95, "process", "Hub for the heavy rare earths and magnets."),
    ("Kuantan, Malaysia", 3.97, 103.43, "process", "Lynas separation plant, the biggest refining site outside China."),
    ("Kalgoorlie, Australia", -30.75, 121.45, "process", "Lynas plant that cracks and leaches Mount Weld concentrate before it is shipped on."),
    ("La Rochelle, France", 46.16, -1.15, "process", "Europe's separation plant."),
    ("Sillamäe, Estonia", 59.4, 27.8, "process", "Separation and metals plant, one of the few in Europe."),
    ("Kvanefjeld and Tanbreez, Greenland", 61.0, -45.6, "project", "Huge deposits that aren't being mined yet."),
    ("Kiruna, Sweden", 67.85, 20.2, "project", "A large deposit found near the iron mine, still at an early stage."),
    ("Fen, Norway", 59.3, 9.3, "project", "Europe's biggest known deposit, still in development."),
    ("Nechalacho, Canada", 62.1, -112.6, "project", "Early-stage mine in the Northwest Territories."),
    ("Ngualla, Tanzania", -6.1, 33.0, "project", "A rich deposit at the development stage."),
    ("Araxá and Serra Verde, Brazil", -17.5, -48.0, "project", "Brazil holds the world's second-biggest reserves; mining has only just begun."),
]
KIND = {"process": "Refining and magnets", "project": "Deposit or project, little or no output yet"}


def rank(d):
    o = sorted(d, key=lambda k: -d[k])
    return {k: i + 1 for i, k in enumerate(o)}


def build():
    countries = json.load(open(os.path.join(HERE, "..", "data", "world", "countries.json")))
    bad = [k for k in list(PROD) + list(RES) if k not in countries]
    if bad:
        raise SystemExit("unknown country codes: %s" % bad)
    pr, rr, tot = rank(PROD), rank(RES), sum(PROD.values())
    c = {}
    for k in set(PROD) | set(RES):
        c[k] = {k2: v for k2, v in (("kt", PROD.get(k)), ("kt_r", pr.get(k)), ("sh", round(PROD[k] / tot * 100, 1) if k in PROD else None), ("res", RES.get(k)), ("res_r", rr.get(k))) if v is not None}
    out = {"asof": "2024", "source": "US Geological Survey Mineral Commodity Summaries (rounded); refining from IEA and company reports", "n": {"kt": len(PROD), "res": len(RES)},
           "top": {"mine": round(PROD["CHN"] / tot * 100), "res": round(RES["CHN"] / sum(RES.values()) * 100)},
           "caveat": "Rounded and approximate. Output is published by country, not by mine, so the glow by region is an estimate. Refining is much more concentrated than mining: China does roughly 90% of it. Projects can change quickly.",
           "uses": "Rare earths are 17 metals that go into the strongest magnets (electric cars, wind turbines, phones, drones, jets and missiles), plus lasers, catalysts and glass.",
           "fields": [{"n": n, "lat": la, "lon": lo, "kt": kt, "note": nt} for n, la, lo, kt, nt in FIELDS],
           "sites": [{"n": n, "lat": la, "lon": lo, "k": k, "kind": KIND[k], "note": nt} for n, la, lo, k, nt in SITES], "c": c}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("rare earths: %d producers, %d with reserves, %d regions, %d sites" % (len(PROD), len(RES), len(FIELDS), len(SITES)))


if __name__ == "__main__":
    build()
