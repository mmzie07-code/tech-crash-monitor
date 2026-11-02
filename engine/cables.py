"""Undersea internet cables, landing hubs, data-centre hubs and cable-damage incidents -> data/world/cables.json (the world-page Cables and internet layer).
Hand-compiled: a selection of well-known systems drawn as simplified routes between their landing points (not the exact seabed path), checked against the
country outlines so none crosses land. Hundreds of cables exist; this is a sample of the main corridors. Run: python3 engine/cables.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from trade import land_index, on_land, slerp, NARROW

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "cables.json")

# name, owners/notes, waypoints [(lat, lon)]
CABLES = [
    ("MAREA", "Virginia Beach to Bilbao. Built by Microsoft, Meta and Telxius; one of the highest-capacity cables across the Atlantic.",
     [(36.8, -75.4), (37.5, -60), (43, -35), (46, -20), (44.5, -8), (43.8, -3.1)]),
    ("Grace Hopper", "New York to the UK and Spain. Google's cable.",
     [(40.4, -73.6), (44, -40), (50, -12), (50.5, -6.3), (50.95, -4.7)]),
    ("Dunant", "Virginia Beach to the French Atlantic coast. Google's cable.",
     [(36.8, -75.4), (38, -60), (43, -35), (46.5, -15), (46.4, -2.3)]),
    ("FASTER", "Oregon to Japan, across the north Pacific. Google and Asian partners.",
     [(45.9, -124.0), (45, -160), (42, 178), (36, 152), (34.7, 140.2)]),
    ("Jupiter", "California to Japan and the Philippines. Amazon, Meta and Asian partners.",
     [(33.8, -118.4), (34, -150), (31, 175), (25, 150), (24, 140), (18, 130), (14.0, 123.6)]),
    ("Southern Cross NEXT", "Sydney to New Zealand, Fiji, Hawaii and California.",
     [(-33.9, 152.5), (-33.0, 165), (-33.5, 173.5), (-34.6, 176.2), (-20, 178.5), (21, -158), (36.9, -123.0)]),
    ("SEA-ME-WE 6", "Singapore to France via India, the Gulf, the Red Sea and Egypt: a main route between Asia and Europe.",
     [(1.3, 104.3), (1.8, 102.6), (2.6, 100.9), (5.6, 97.8), (6.0, 96.0), (6.1, 94.0), (5.0, 87), (5.0, 79.0), (9, 70), (13, 62), (14.5, 56), (13, 50.5), (12.5, 43.4), (15, 41.8), (20, 38.5), (24, 36.5), (27, 34.0), (29.9, 32.6), (31.4, 32.3), (33.5, 29), (35, 20), (37.3, 11.7), (38.5, 7), (42.0, 5.0), (43.0, 5.3)]),
    ("2Africa", "Loops round Africa from Europe to the Gulf, led by Meta. One of the longest cable systems ever built.",
     [(50.4, -5.6), (46, -9), (38, -10.5), (28, -17.5), (14.5, -19.5), (9, -18), (5, -13), (3, -5), (4.3, 3.0), (-5, 7), (-17, 10), (-22.9, 13), (-33.2, 16.5), (-35.6, 19.5), (-35.5, 27), (-30, 32.2), (-25, 36), (-15, 42), (-4.5, 40.0), (-1, 44.5), (5, 52.5), (12.3, 53.5), (12.5, 43.5)]),
    ("Monet", "Florida to Brazil. Google and partners.",
     [(26.4, -79.6), (29, -77), (28, -65), (16, -55), (5, -43), (-2, -34), (-6, -33), (-12, -35), (-22, -38), (-25.0, -42.0), (-24.6, -45.8)]),
    ("Curie", "California to Chile. Google's cable.",
     [(33.8, -118.4), (30, -120), (20, -112), (12, -100), (3, -86), (-10, -82), (-25, -73.5), (-33.0, -72.3)]),
    ("C-Lion1", "Finland to Germany across the Baltic. Damaged in November 2024.",
     [(60.0, 25.0), (59.5, 22), (56.8, 19.8), (54.8, 16.3), (54.85, 13.4), (54.6, 12.4), (54.2, 12.1)]),
]
# cable landing hubs and data-centre hubs: name, lat, lon, kind, note
HUBS = [
    ("Marseille, France", 43.3, 5.3, "land", "Europe's gateway for cables from Asia and Africa, with a major data-centre cluster."),
    ("Virginia Beach, USA", 36.85, -75.98, "land", "Where several of the biggest Atlantic cables come ashore."),
    ("Singapore", 1.3, 104.0, "land", "The main hub of Southeast Asia, where cables from Asia, Europe and Australia meet."),
    ("Zafarana and Suez, Egypt", 29.5, 32.6, "land", "Most cables between Asia and Europe pass through Egypt, a major chokepoint."),
    ("Fujairah, UAE", 25.1, 56.4, "land", "Cables from the Gulf and India land here."),
    ("Mumbai, India", 19.0, 72.8, "land", "India's main landing point."),
    ("Lagos, Nigeria", 6.4, 3.4, "land", "West Africa's main landing hub."),
    ("Cape Town, South Africa", -33.9, 18.4, "land", "South Africa's main landing point."),
    ("Hong Kong", 22.3, 114.2, "land", "A key hub for China and the region."),
    ("Los Angeles, USA", 33.8, -118.4, "land", "Where Pacific cables from Asia and Australia land."),
    ("Ashburn, Virginia (USA)", 39.04, -77.49, "dc", "The world's biggest data-centre cluster; a large part of internet traffic passes through."),
    ("Dublin, Ireland", 53.35, -6.26, "dc", "Europe's cloud hub, with strained power supply."),
    ("Frankfurt, Germany", 50.1, 8.68, "dc", "Home of the world's biggest internet exchange."),
    ("London, UK", 51.5, -0.1, "dc", "Europe's largest data-centre market."),
    ("Tokyo, Japan", 35.7, 139.7, "dc", "Asia's biggest cloud and exchange hub together with Singapore."),
    ("Beijing and Shanghai, China", 31.2, 121.5, "dc", "The largest cloud markets in China."),
    ("Phoenix and Dallas, USA", 33.4, -112.0, "dc", "Fast-growing AI data-centre regions."),
]
# damage incidents: name, lat, lon, note
INCIDENTS = [
    ("Tonga, January 2022", -21.1, -175.2, "A volcanic eruption cut the only cable to the islands, taking the country offline for weeks."),
    ("Matsu islands, February 2023", 26.16, 119.95, "Two cables linking Taiwan's Matsu islands were damaged; Taiwan suspected ships from China."),
    ("Red Sea, February 2024", 14.0, 42.6, "Several cables were damaged after a ship hit by Houthi missiles sank and dragged its anchor, hitting traffic between Asia and Europe."),
    ("Baltic Sea, November 2024", 57.3, 19.5, "Two cables were cut. Investigators suspected a ship's dragged anchor; no intent was established."),
    ("Gulf of Finland, December 2024", 59.9, 25.5, "The Estlink 2 power cable and several data cables were damaged; Finland detained a ship."),
]
FACTS = ["Roughly 95% or more of the world's international data travels through undersea cables, not satellites.",
         "Cables are about as thick as a garden hose. Most faults are caused by ship anchors and fishing, not attacks.",
         "Cable systems cluster through a few chokepoints: the Red Sea and Egypt, the Strait of Malacca, the Channel and the Baltic."]


def build():
    polys = land_index(); bad = []
    for name, _, pts in CABLES:
        for a, b in zip(pts, pts[1:]):
            for la, lo in slerp(a, b, 60):
                if any(r[0] <= la <= r[1] and r[2] <= lo <= r[3] for r in NARROW):
                    continue
                w = on_land(polys, la, lo)
                if w:
                    bad.append((name, a, b, round(la, 2), round(lo, 2), w)); break
    for b in bad: print("LAND:", b)
    if bad and "force" not in sys.argv:
        raise SystemExit("cables cross land")
    out = {"source": "Hand-compiled from public cable maps and news reports (rounded; TeleGeography, operators)", "caveat": "A sample of the main corridors with simplified routes, not the exact seabed paths. Hundreds of cables exist.",
           "facts": FACTS, "cables": [{"n": n, "note": t, "pts": [[round(a, 2), round(b, 2)] for a, b in p]} for n, t, p in CABLES],
           "hubs": [{"n": n, "lat": la, "lon": lo, "k": k, "note": t} for n, la, lo, k, t in HUBS], "incidents": [{"n": n, "lat": la, "lon": lo, "note": t} for n, la, lo, t in INCIDENTS]}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("cables: %d systems, %d hubs, %d incidents" % (len(CABLES), len(HUBS), len(INCIDENTS)))


if __name__ == "__main__":
    build()
