"""Big remittance corridors (money sent home by workers abroad) -> data/world/money.json (the world-page Money flows layer).
Country shading (remittances and foreign investment as a share of GDP) comes from the World Bank via worldmacro.py; this file holds only the corridors
drawn as arcs. Hand-compiled: these are among the largest corridors in the World Bank / KNOMAD bilateral estimates, rounded, and amounts move from year to year.
Run: python3 engine/money.py"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "money.json")
# from, to, note
CORRIDORS = [
    ("USA", "MEX", "The biggest corridor in the world: workers in the US sending well over $50 billion a year home."),
    ("USA", "IND", "Indian workers in the US, mostly in tech and health care."),
    ("ARE", "IND", "Millions of Indian workers in the Gulf, with the UAE the second-biggest source of India's remittances."),
    ("USA", "PHL", "Filipino nurses, carers and others in the US."),
    ("USA", "CHN", "Chinese workers and families in the US."),
    ("SAU", "PAK", "Pakistani workers in Saudi Arabia, a key source of Pakistan's foreign currency."),
    ("ARE", "PAK", "Pakistani workers in the UAE."),
    ("SAU", "EGY", "Egyptians working in Saudi Arabia, among the biggest remittances to Egypt."),
    ("SAU", "BGD", "Bangladeshi workers in Saudi Arabia."),
    ("USA", "GTM", "Remittances equal to about a fifth of Guatemala's economy."),
]
FACTS = ["Remittances sent to poorer countries are bigger than foreign aid and, in many cases, bigger than foreign investment.",
         "For some countries, such as Nepal, Tajikistan and Tonga, money from workers abroad equals a quarter or more of the whole economy."]


def build():
    c = json.load(open(os.path.join(os.path.dirname(OUT), "countries.json")))
    bad = [k for a, b, _ in CORRIDORS for k in (a, b) if k not in c]
    if bad:
        raise SystemExit("unknown codes %s" % bad)
    out = {"source": "World Bank and KNOMAD bilateral remittance estimates (rounded)", "caveat": "Corridors are the ones usually reported as the biggest. Amounts differ by year and source, and informal transfers aren't counted.",
           "facts": FACTS, "corridors": [{"a": a, "b": b, "note": n} for a, b, n in CORRIDORS]}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("money: %d corridors" % len(CORRIDORS))


if __name__ == "__main__":
    build()
