"""Who makes things and who buys them -> data/world/mix.json (World Bank, latest year each country reports).
  manf   manufacturing value added (US$)       "goods makers"
  agr    agriculture, forestry, fishing value added (US$)   "food growers"
  cons   household consumption spending (US$)  "big spenders"
  ex     what the country SELLS abroad, as % of its goods exports: manufactures, food, fuels, ores and metals, farm raw materials
Shares are of the total across the countries that report, so they are shares of the reporting world, not of an exact world total."""
import json, os, time, urllib.request as ur

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "mix.json")
UA = {"User-Agent": "Mozilla/5.0"}
LEVELS = {"manf": "NV.IND.MANF.CD", "agr": "NV.AGR.TOTL.CD", "cons": "NE.CON.PRVT.CD"}
EXPORTS = {"manuf": "TX.VAL.MANF.ZS.UN", "food": "TX.VAL.FOOD.ZS.UN", "fuel": "TX.VAL.FUEL.ZS.UN", "ore": "TX.VAL.MMTL.ZS.UN", "farm": "TX.VAL.AGRI.ZS.UN"}
EX_LABEL = {"manuf": "manufactured goods", "food": "food", "fuel": "oil, gas and coal", "ore": "ores and metals", "farm": "farm raw materials"}


def wb(code, tries=4):
    url = "https://api.worldbank.org/v2/country/all/indicator/%s?format=json&date=2018:2026&per_page=20000&mrnev=1" % code
    for i in range(tries):
        try:
            d = json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=40).read().decode("utf-8-sig"))[1]
            return {x["countryiso3code"]: (x["date"], x["value"]) for x in d if x.get("value") is not None and len(x.get("countryiso3code") or "") == 3}
        except Exception as e:
            time.sleep(2 * (i + 1))
    raise RuntimeError("World Bank " + code)


def build():
    lv = {k: wb(c) for k, c in LEVELS.items()}
    ex = {k: wb(c) for k, c in EXPORTS.items()}
    countries = json.load(open(os.path.join(os.path.dirname(OUT), "countries.json")))
    isos = [i for i in countries if not countries[i].get("parent")]
    tot = {k: sum(v[1] for i, v in lv[k].items() if i in countries and not countries[i].get("parent")) for k in LEVELS}
    out = {}
    for iso in isos:
        row = {}
        for k in LEVELS:
            if iso in lv[k]:
                y, v = lv[k][iso]; row[k] = round(v / tot[k] * 100, 3); row[k + "_y"] = int(y)
        e = {k: round(ex[k][iso][1], 1) for k in EXPORTS if iso in ex[k]}
        if len(e) >= 3:
            row["ex"] = e
        if row:
            out[iso] = row
    for k in LEVELS:   # rank 1 = biggest
        order = sorted([i for i in out if k in out[i]], key=lambda i: -out[i][k])
        for r, i in enumerate(order, 1):
            out[i][k + "_r"] = r
    top = {k: round(sum(out[i][k] for i in sorted([i for i in out if k in out[i]], key=lambda i: -out[i][k])[:10]), 1) for k in LEVELS}
    return dict(source="World Bank (latest year each country reports, 2018 on)", label=EX_LABEL, top10=top, n={k: sum(1 for i in out if k in out[i]) for k in LEVELS}, c=out)


if __name__ == "__main__":
    d = build(); json.dump(d, open(OUT, "w"), separators=(",", ":"))
    print("mix.json:", d["n"], "top-10 share of each:", d["top10"])
    for k in LEVELS:
        print(" ", k, [(i, d["c"][i][k], d["c"][i].get(k + "_y")) for i in sorted(d["c"], key=lambda i: -d["c"][i].get(k, 0))[:6]])
