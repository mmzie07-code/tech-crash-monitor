"""The chip supply chain -> data/world/chips.json (the world-page Chips layer).
Hand-compiled and rounded from public industry reports (SIA, SEMI, TrendForce, company filings). 'size' is a rough relative index of chip-making capacity in each
cluster (not a measured number). The chokepoints are widely reported: Taiwan makes roughly 90% of the most advanced chips, ASML of the Netherlands is the only maker
of the extreme-ultraviolet machines, and South Korea makes most memory. Run: python3 engine/chips.py"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "chips.json")

# chip-making clusters: name, lat, lon, relative size (1 to 10), what
FABS = [
    ("Hsinchu, Taichung and Tainan (Taiwan)", 24.8, 120.95, 10, "TSMC's home: roughly 90% of the world's most advanced chips (below 7 nanometres) come from Taiwan."),
    ("Southern Taiwan (Kaohsiung)", 22.7, 120.3, 5, "Newer TSMC and packaging plants."),
    ("Gyeonggi province (South Korea)", 37.1, 127.1, 8, "Samsung and SK Hynix: most of the world's memory chips."),
    ("Shanghai and the Yangtze delta (China)", 31.3, 121.2, 4, "SMIC, Hua Hong and many others, mostly older-generation chips."),
    ("Wuhan, Beijing and Shenzhen (China)", 30.5, 114.3, 3, "Memory (YMTC) and chips for cars, phones and appliances."),
    ("Kumamoto and Kyushu (Japan)", 32.8, 130.8, 3, "TSMC's Japanese plant and Sony image sensors."),
    ("Mie and Tohoku (Japan)", 35.0, 136.5, 2, "Kioxia flash memory."),
    ("Phoenix, Arizona (USA)", 33.5, -112.1, 3, "TSMC and Intel plants, part of a push to bring advanced chip-making back to the US."),
    ("Hillsboro, Oregon (USA)", 45.5, -122.9, 3, "Intel's main development fabs."),
    ("Austin and Taylor, Texas (USA)", 30.4, -97.7, 2, "Samsung's US plants."),
    ("Malta, New York (USA)", 42.97, -73.8, 2, "GlobalFoundries."),
    ("Boise, Idaho (USA)", 43.6, -116.2, 1.5, "Micron, the main US memory maker."),
    ("Singapore", 1.35, 103.7, 3, "Many plants making chips for cars, industry and phones."),
    ("Penang and Kulim (Malaysia)", 5.4, 100.4, 2, "A big hub for testing and packaging chips."),
    ("Dresden (Germany)", 51.05, 13.7, 2.5, "Europe's biggest chip cluster: Bosch, GlobalFoundries, Infineon, and TSMC's new plant."),
    ("Leixlip (Ireland)", 53.36, -6.5, 2, "Intel's European plant."),
    ("Kiryat Gat (Israel)", 31.6, 34.8, 1.5, "Intel's Israeli plant."),
]
# key sites: name, lat, lon, kind, note
KINDS = {"tool": "Machines and tools", "design": "Chip design", "material": "Key materials"}
SITES = [
    ("ASML, Veldhoven (Netherlands)", 51.41, 5.4, "tool", "The only company that makes extreme-ultraviolet lithography machines, which every advanced chip needs. Export rules limit who may buy them."),
    ("Zeiss, Oberkochen (Germany)", 48.8, 10.1, "tool", "Makes the mirrors and lenses inside ASML's machines."),
    ("Applied Materials and Lam Research, California", 37.45, -121.97, "tool", "Two of the biggest makers of chip-making equipment."),
    ("Tokyo Electron, Japan", 35.67, 139.74, "tool", "Equipment for coating and etching chips; Japan supplies many key tools and chemicals."),
    ("NVIDIA, Santa Clara (USA)", 37.37, -121.96, "design", "Designs the AI chips most in demand. It makes none itself: TSMC does."),
    ("Arm, Cambridge (UK)", 52.2, 0.12, "design", "Designs the processor blueprints used in nearly every phone."),
    ("Qualcomm, San Diego (USA)", 32.9, -117.2, "design", "Phone chips."),
    ("Spruce Pine, North Carolina (USA)", 35.9, -82.07, "material", "Source of the ultra-pure quartz used to make the crucibles that grow silicon crystals, a little-known single point of failure."),
    ("Gallium and germanium, China", 25.0, 105.0, "material", "China produces most of the world's gallium and germanium, used in chips and optics. It restricted exports in 2023 and later."),
    ("Silicon wafers, Japan", 36.5, 139.5, "material", "Shin-Etsu and Sumco make a large share of the world's silicon wafers."),
]
FACTS = ["Taiwan makes roughly 90% of the most advanced chips; South Korea and Taiwan together make most of the rest of the leading chips.",
         "A single advanced chip may cross borders a dozen times between design, materials, machines, manufacture, packaging and testing.",
         "The US, Netherlands and Japan restrict sales of the most advanced machines and AI chips to China; China restricts some key metals."]


def build():
    out = {"asof": "2025", "source": "SIA, SEMI, TrendForce and company reports (rounded)",
           "caveat": "Hand-compiled and approximate. The glow shows relative chip-making size by cluster, not measured capacity. New plants open and old ones close, so check current figures before relying on them.",
           "facts": FACTS, "fields": [{"n": n, "lat": la, "lon": lo, "w": w, "note": t} for n, la, lo, w, t in FABS],
           "sites": [{"n": n, "lat": la, "lon": lo, "k": k, "kind": KINDS[k], "note": t} for n, la, lo, k, t in SITES]}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("chips: %d clusters, %d sites" % (len(FABS), len(SITES)))


if __name__ == "__main__":
    build()
