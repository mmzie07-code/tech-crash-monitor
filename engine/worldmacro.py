"""Debt, prices, borrowing costs, money flows, internet use and high-tech exports by country -> data/world/macro.json (World Bank, latest year each country reports).
  debt   general government gross debt, % of GDP (IMF)         pol   central bank policy rate, % (IMF)
  infl  consumer price inflation, % a year
  lend   bank lending rate, %                                  rr    real interest rate, %
  rem    money sent home by workers abroad, % of GDP          remd  the same in US$
  fdi    foreign direct investment coming in, % of GDP        net   people using the internet, %
  tech   high-technology goods, % of manufactured exports      techd the same in US$"""
import json, os, time, urllib.parse, urllib.request as ur

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "macro.json")
UA = {"User-Agent": "Mozilla/5.0"}
IND = {"infl": "FP.CPI.TOTL.ZG", "lend": "FR.INR.LEND", "rr": "FR.INR.RINR", "rem": "BX.TRF.PWKR.DT.GD.ZS", "remd": "BX.TRF.PWKR.CD.DT",
       "fdi": "BX.KLT.DINV.WD.GD.ZS", "net": "IT.NET.USER.ZS", "tech": "TX.VAL.TECH.MF.ZS", "techd": "TX.VAL.TECH.CD"}


def wb(code, tries=4):
    url = "https://api.worldbank.org/v2/country/all/indicator/%s?format=json&date=2018:2026&per_page=20000&mrnev=1" % code
    for i in range(tries):
        try:
            d = json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=40).read().decode("utf-8-sig"))[1]
            return {x["countryiso3code"]: (x["date"], x["value"]) for x in d if x.get("value") is not None and len(x.get("countryiso3code") or "") == 3}
        except Exception:
            time.sleep(2 * (i + 1))
    raise RuntimeError("World Bank " + code)


def dbn(path, dims):
    """IMF series through DBnomics (an open mirror: the IMF's own API blocks scripts). It lags the IMF's newest release."""
    url = "https://api.db.nomics.world/v22/series/IMF/%s?dimensions=%s&observations=1&limit=400" % (path, urllib.parse.quote(json.dumps(dims)))
    for i in range(4):
        try:
            return json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=60).read())["series"]["docs"]
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("DBnomics " + path)


def imf(countries):
    iso2 = {v.get("iso2"): k for k, v in countries.items() if v.get("iso2")}
    out = {}
    for s in dbn("WEO:2025-04", {"weo-subject": ["GGXWDG_NGDP"]}):
        iso = s["dimensions"]["weo-country"]
        for p, v in zip(s["period"], s["value"]):
            if p == "2024" and isinstance(v, (int, float)): out.setdefault(iso, {}).update(debt=round(v, 1), debt_y=2024)
    for s in dbn("IFS", {"INDICATOR": ["FPOLM_PA"], "FREQ": ["M"]}):
        iso = iso2.get(s["dimensions"].get("REF_AREA"))
        last = [(p, v) for p, v in zip(s["period"], s["value"]) if isinstance(v, (int, float))]
        if iso and last and last[-1][0] >= "2025-01":
            out.setdefault(iso, {}).update(pol=round(last[-1][1], 2), pol_d=last[-1][0])
    return out


def build():
    data = {k: wb(c) for k, c in IND.items()}
    countries = json.load(open(os.path.join(os.path.dirname(OUT), "countries.json")))
    extra = imf(countries)
    out = {}
    for iso in countries:
        if countries[iso].get("parent"):
            continue
        row = {}
        for k in IND:
            if iso in data[k]:
                y, v = data[k][iso]
                row[k] = round(v, 1) if k not in ("remd", "techd") else round(v / 1e9, 2)   # US$ billions
                row[k + "_y"] = int(y)
        row.update(extra.get(iso, {}))
        if row:
            out[iso] = row
    res = {"source": "World Bank (latest year each country reports); debt and policy rates from the IMF", "n": {k: sum(1 for r in out.values() if k in r) for k in list(IND) + ["debt", "pol"]}, "imf": "IMF World Economic Outlook (April 2025) and International Financial Statistics, through DBnomics", "c": out}
    json.dump(res, open(OUT, "w"), separators=(",", ":"))
    print("macro written:", res["n"])
    return res


if __name__ == "__main__":
    build()
