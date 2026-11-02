"""Where cyber attacks come from, and who they hit -> data/world/cyber.json (the world-page Cyber layer). Refreshed with the nightly run, so it is recent, not live.
Sources (each is optional; the layer only shows what was actually collected):
  1. SANS Internet Storm Center (DShield): the most active attacking addresses seen by a worldwide network of sensors, placed on the map by the country of their network.
  2. abuse.ch Feodo Tracker: servers that control botnets and banking malware, by country.
  3. Cloudflare Radar (needs a free API token in CLOUDFLARE_API_TOKEN): the biggest attack routes from one country to another over the last week, and the countries
     attacked most. This is the only one that says who is targeted.
Where an attack comes from is where the machine that sent it sits, which is often a hijacked computer or rented server, not where the attacker lives. Run: python3 engine/cyber.py"""
import json, os, time, urllib.request as ur

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "data", "world", "cyber.json")
UA = {"User-Agent": "the-analytic-cyber-map/1.0 (education site)"}


def get(url, headers=None, timeout=30):
    return json.loads(ur.urlopen(ur.Request(url, headers=dict(UA, **(headers or {}))), timeout=timeout).read().decode("utf-8-sig"))


def iso3_map():
    c = json.load(open(os.path.join(HERE, "..", "data", "world", "countries.json")))
    return {v["iso2"]: k for k, v in c.items() if v.get("iso2") and not v.get("parent")}


def dshield(m, n=60):
    top = get("https://isc.sans.edu/api/sources/attacks/%d?json" % n)
    by, total = {}, 0
    for r in top:
        try:
            info = get("https://isc.sans.edu/api/ip/%s?json" % r["ip"])["ip"]
            iso = m.get(info.get("ascountry"))
        except Exception:
            iso = None
        time.sleep(1.0)
        if iso:
            by[iso] = by.get(iso, 0) + int(r.get("attacks") or 0); total += int(r.get("attacks") or 0)
    return {k: round(v / total * 100, 1) for k, v in by.items()} if total else {}


def feodo(m):
    by = {}
    for r in get("https://feodotracker.abuse.ch/downloads/ipblocklist.json"):
        iso = m.get(r.get("country"))
        if iso and r.get("status") == "online":
            by[iso] = by.get(iso, 0) + 1
    return by


def radar(m):
    tok = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not tok:
        return None
    h = {"Authorization": "Bearer " + tok}
    out = {"pairs": [], "targets": {}}
    for layer in ("layer7", "layer3"):
        try:
            res = get("https://api.cloudflare.com/client/v4/radar/attacks/%s/top/attacks?limit=15&dateRange=7d&format=json" % layer, h)["result"]
            for r in (res.get("top_0") or []):
                a, b = m.get(r.get("originCountryAlpha2")), m.get(r.get("targetCountryAlpha2"))
                if a and b and a != b:
                    out["pairs"].append([a, b, float(r.get("value") or 0), layer])
        except Exception as e:
            print("radar", layer, "pairs failed:", e)
        try:
            res = get("https://api.cloudflare.com/client/v4/radar/attacks/%s/top/locations/target?limit=20&dateRange=7d&format=json" % layer, h)["result"]
            for r in (res.get("top_0") or []):
                iso = m.get(r.get("targetCountryAlpha2"))
                if iso:
                    out["targets"][iso] = max(out["targets"].get(iso, 0), float(r.get("value") or 0))
        except Exception as e:
            print("radar", layer, "targets failed:", e)
    return out if out["pairs"] or out["targets"] else None


def build():
    m = iso3_map(); out = {"asof": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), "sources": [], "origin": {}, "c2": {}, "pairs": [], "targets": {}}
    for name, fn, key in (("SANS Internet Storm Center", lambda: dshield(m), "origin"), ("abuse.ch Feodo Tracker", lambda: feodo(m), "c2")):
        try:
            out[key] = fn(); out["sources"].append(name); print(name, "ok", len(out[key]))
        except Exception as e:
            print(name, "failed:", e)
    try:
        r = radar(m)
        if r:
            out["pairs"], out["targets"] = r["pairs"], r["targets"]; out["sources"].append("Cloudflare Radar")
    except Exception as e:
        print("radar failed:", e)
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for k in ("origin", "c2", "pairs", "targets"):
        if not out[k] and old.get(k):
            out[k] = old[k]   # keep the last good copy if a source is down tonight
    out["caveat"] = "A recent snapshot, not a live feed. Where an attack comes from is where the sending machine sits, often a hijacked computer or rented server, not where the attacker lives. Countries that host lots of internet capacity show up more."
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    return out


if __name__ == "__main__":
    build()
