"""Where oil is pumped, where it sits in the ground, and where it is stored -> data/world/oilmap.json (the world-page Oil layer).
Hand-compiled and rounded from public summaries (US EIA, Energy Institute Statistical Review, OPEC bulletin). Estimates differ between sources and
definitions (crude only vs all liquids, 'proven' vs 'recoverable'), so everything here is approximate and the page says so. Run: python3 engine/oilmap.py"""
import json, os

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "data", "world", "oilmap.json")

# crude oil + condensate, million barrels a day, about 2024
PROD = {"USA": 13.2, "SAU": 9.0, "RUS": 9.3, "CAN": 4.6, "IRQ": 4.2, "CHN": 4.2, "ARE": 3.4, "IRN": 3.3, "BRA": 3.4, "KWT": 2.5, "KAZ": 1.8, "NOR": 1.9, "MEX": 1.6,
        "NGA": 1.5, "LBY": 1.2, "AGO": 1.1, "OMN": 1.0, "DZA": 0.97, "VEN": 0.9, "COL": 0.77, "ARG": 0.7, "GBR": 0.7, "GUY": 0.65, "QAT": 0.6, "IND": 0.6, "IDN": 0.6,
        "EGY": 0.55, "AZE": 0.5, "ECU": 0.47, "MYS": 0.35, "SSD": 0.15, "GAB": 0.2, "GHA": 0.15, "SDN": 0.06, "TCD": 0.1, "AUS": 0.3, "THA": 0.15, "VNM": 0.1, "CMR": 0.07, "COG": 0.28}
# proven reserves, billion barrels, recent years
RES = {"VEN": 303, "SAU": 267, "IRN": 209, "CAN": 163, "IRQ": 145, "ARE": 113, "KWT": 101, "RUS": 80, "USA": 74, "LBY": 48, "NGA": 37, "KAZ": 30, "CHN": 26, "QAT": 25,
       "BRA": 15, "DZA": 12, "GUY": 11, "ECU": 8, "NOR": 8, "AGO": 7, "AZE": 7, "MEX": 6, "OMN": 5, "IND": 4.6, "SSD": 3.5, "EGY": 3.3, "MYS": 2.7, "GBR": 2.5, "ARG": 2.5,
       "IDN": 2.4, "COL": 2, "SDN": 1.5, "GAB": 2, "COG": 1.8, "AUS": 2.4}

# oilfields and producing regions: name, lat, lon, rough output in million barrels a day, onshore/offshore
FIELDS = [
    ("Permian Basin (Texas, New Mexico)", 31.9, -102.2, 6.3, "on"), ("US Gulf of Mexico", 27.8, -90.5, 1.8, "off"), ("Bakken (North Dakota)", 48.2, -102.7, 1.2, "on"),
    ("Eagle Ford (Texas)", 28.6, -98.4, 1.1, "on"), ("DJ Basin (Colorado)", 40.3, -104.8, 0.8, "on"), ("Alaska North Slope", 70.2, -148.9, 0.45, "on"),
    ("Alberta oil sands", 57.0, -111.6, 3.4, "on"), ("Campeche Bay (Mexico)", 19.6, -92.3, 1.0, "off"), ("Orinoco Belt (Venezuela)", 8.4, -64.5, 0.8, "on"),
    ("Brazil pre-salt (Santos and Campos)", -24.5, -41.5, 3.0, "off"), ("Stabroek (Guyana)", 7.8, -57.5, 0.65, "off"), ("Llanos Basin (Colombia)", 4.5, -72.0, 0.6, "on"),
    ("Oriente Basin (Ecuador)", -0.6, -76.7, 0.4, "on"), ("Vaca Muerta (Argentina)", -38.5, -69.5, 0.5, "on"), ("North Sea (Norway, UK)", 59.8, 2.5, 2.4, "off"),
    ("West Siberia", 61.5, 72.5, 5.5, "on"), ("Volga-Urals", 54.5, 54.0, 2.0, "on"), ("East Siberia", 62.0, 107.0, 0.7, "on"), ("Sakhalin", 52.5, 143.3, 0.25, "off"),
    ("Tengiz and Kashagan (Kazakhstan)", 46.2, 52.0, 1.7, "on"), ("Azeri fields (Caspian)", 40.2, 51.2, 0.5, "off"),
    ("Ghawar and Eastern Province (Saudi Arabia)", 25.5, 49.2, 6.5, "on"), ("Safaniya and Gulf offshore (Saudi Arabia)", 28.2, 48.8, 2.2, "off"), ("Burgan (Kuwait)", 29.2, 47.9, 2.4, "on"),
    ("Rumaila and West Qurna (southern Iraq)", 30.5, 47.3, 3.4, "on"), ("Kirkuk and Kurdistan (northern Iraq)", 35.5, 44.0, 0.9, "on"), ("Khuzestan (Iran)", 31.0, 49.5, 3.1, "on"),
    ("Abu Dhabi fields (UAE)", 23.8, 53.7, 2.9, "on"), ("Oman interior", 21.5, 56.3, 1.0, "on"), ("Sirte Basin (Libya)", 29.5, 18.5, 1.2, "on"), ("Hassi Messaoud (Algeria)", 31.7, 6.1, 0.9, "on"),
    ("Niger Delta (Nigeria)", 5.0, 6.4, 1.3, "on"), ("Offshore Angola", -8.0, 12.0, 1.0, "off"), ("Sudan and South Sudan", 9.0, 29.5, 0.2, "on"), ("Gulf of Suez and Western Desert (Egypt)", 28.8, 31.0, 0.5, "on"),
    ("Daqing (China)", 46.6, 125.0, 0.8, "on"), ("Shengli and Bohai Bay (China)", 38.0, 118.5, 1.0, "on"), ("Ordos Basin (China)", 36.5, 108.0, 0.5, "on"), ("Tarim and Xinjiang (China)", 41.0, 85.0, 0.4, "on"),
    ("Sumatra and Kalimantan (Indonesia)", 0.5, 101.8, 0.5, "on"), ("Offshore Malaysia", 5.0, 104.8, 0.3, "off"), ("Bombay High (India)", 19.4, 71.3, 0.3, "off"),
    ("North West Shelf (Australia)", -19.5, 115.5, 0.2, "off"), ("Gulf of Guinea (Gabon, Congo, Ghana)", -1.5, 8.5, 0.6, "off"),
]
# where it is kept or loaded: name, lat, lon, kind (emergency | hub | terminal), note
STORES = [
    ("US Strategic Petroleum Reserve", 29.74, -94.62, "emergency", "Salt caverns along the Gulf Coast: the world's largest government stockpile. It has held roughly 400 million barrels in recent years."),
    ("Cushing, Oklahoma", 35.98, -96.77, "hub", "Huge tank farms and the delivery point for the main US oil futures contract."),
    ("Rotterdam, Antwerp, Amsterdam", 51.95, 4.1, "hub", "Europe's main oil storage, refining and trading hub."),
    ("Fujairah, UAE", 25.12, 56.35, "hub", "Storage and ship-fuel hub on the far side of the Strait of Hormuz, with pipelines that bypass it."),
    ("Singapore", 1.28, 103.8, "hub", "Asia's trading and storage centre, at the end of the Malacca Strait."),
    ("Zhoushan and Ningbo, China", 30.0, 122.1, "emergency", "Coastal tank farms and state stockpile sites. China doesn't publish how full its reserves are."),
    ("Kiire, Japan", 31.4, 130.7, "emergency", "One of Japan's national stockpile bases; Japan holds government and industry stocks of many months."),
    ("Ras Tanura, Saudi Arabia", 26.64, 50.16, "terminal", "One of the world's largest oil export terminals."),
    ("Kharg Island, Iran", 29.25, 50.32, "terminal", "Handles most of Iran's crude exports."),
    ("Basra oil terminal, Iraq", 29.7, 48.8, "terminal", "Offshore loading platforms that ship most of Iraq's oil."),
    ("Novorossiysk, Russia", 44.7, 37.8, "terminal", "Main Black Sea export port for Russian and Kazakh crude."),
    ("Houston and the Texas coast", 29.3, -94.9, "terminal", "The US's biggest oil export region, and a major refining centre."),
]
KIND = {"emergency": "Emergency stockpile", "hub": "Trading and storage hub", "terminal": "Export terminal"}


def rank(d):
    o = sorted(d, key=lambda k: -d[k])
    return {k: i + 1 for i, k in enumerate(o)}


def build():
    countries = json.load(open(os.path.join(HERE, "..", "data", "world", "countries.json")))
    bad = [k for k in list(PROD) + list(RES) if k not in countries]
    if bad:
        raise SystemExit("unknown country codes: %s" % bad)
    pr, rr = rank(PROD), rank(RES)
    c = {}
    for k in set(PROD) | set(RES):
        c[k] = {k2: v for k2, v in (("prod", PROD.get(k)), ("prod_r", pr.get(k)), ("res", RES.get(k)), ("res_r", rr.get(k))) if v is not None}
    out = {"asof": "2024", "source": "US EIA, Energy Institute Statistical Review, OPEC (rounded)", "n": {"prod": len(PROD), "res": len(RES)},
           "top5": {"prod": round(sum(sorted(PROD.values())[-5:]) / sum(PROD.values()) * 100), "res": round(sum(sorted(RES.values())[-5:]) / sum(RES.values()) * 100)},
           "caveat": "Rounded and approximate. Crude oil and condensate only; sources differ on definitions, and the map shows regions, not exact field outlines.",
           "fields": [{"n": n, "lat": la, "lon": lo, "mbd": m, "t": t} for n, la, lo, m, t in FIELDS],
           "stores": [{"n": n, "lat": la, "lon": lo, "k": k, "kind": KIND[k], "note": nt} for n, la, lo, k, nt in STORES], "c": c}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("oilmap: %d producers, %d with reserves, %d fields, %d storage sites" % (len(PROD), len(RES), len(FIELDS), len(STORES)))
    return out


if __name__ == "__main__":
    build()
