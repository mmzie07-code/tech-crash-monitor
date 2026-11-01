"""Where armed conflict is, and who is fighting whom -> data/world/conflict.json.
Hand-compiled from public trackers (Warmonit's conflict list, dated 31 Oct 2026, cross-checked against Crisis Group's CrisisWatch / 10 Conflicts to Watch and UCDP's definitions)
because the open UCDP feed needs an access token. Intensity follows UCDP's thresholds: "war" = 1,000+ battle deaths in a year, "minor" = 25 to 999.
Conflicts change fast, so this is a snapshot with a date on it, not a live feed. Edit CONFLICTS below and re-run: python3 engine/conflict.py
`arcs` are the country-to-country links drawn on the globe (state vs state, or a state accused of backing a side); purely internal conflicts only shade the country."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "world", "conflict.json")
ASOF = "2026-10-31"
SOURCES = ["Warmonit conflict tracker (31 Oct 2026)", "Crisis Group, CrisisWatch and 10 Conflicts to Watch 2026", "UCDP definitions (war = 1,000+ battle deaths a year; minor = 25 to 999)"]

# (id, name, kind, level, countries where fighting happens, who vs whom, since, note, arcs)
CONFLICTS = [
    ("ukr", "Russia and Ukraine", "state", "war", ["UKR", "RUS"], "Russia vs Ukraine", "2022", "The largest war in Europe since 1945.", [["RUS", "UKR"]]),
    ("irn", "Iran and Israel / United States", "state", "war", ["IRN", "ISR"], "Iran vs Israel and the United States", "2025", "Strikes and counter-strikes between Iran, Israel and the US.", [["IRN", "ISR"], ["USA", "IRN"]]),
    ("gaza", "Israel and Gaza", "state", "war", ["PSE", "ISR"], "Israel vs Hamas and other armed groups", "2023", "A fragile pause in the fighting; the situation changes quickly.", [["ISR", "PSE"]]),
    ("lbn", "Israel and Lebanon", "state", "minor", ["LBN", "ISR"], "Israel vs Hezbollah", "2023", "Talks continue; strikes and clashes on the border.", [["ISR", "LBN"]]),
    ("yem", "Yemen and the Red Sea", "state", "minor", ["YEM", "SAU"], "Houthis vs Yemen's government and Saudi-backed forces; Houthi attacks on shipping, answered by the US and Israel", "2014", "Houthis have widened attacks, including on Saudi Arabia.", [["SAU", "YEM"], ["USA", "YEM"], ["ISR", "YEM"]]),
    ("indpak", "India and Pakistan (Kashmir)", "state", "minor", ["IND", "PAK"], "India vs Pakistan", "1947", "Border clashes over Kashmir, most recently flaring in 2025.", [["IND", "PAK"]]),
    ("pakafg", "Pakistan and Afghanistan", "state", "minor", ["PAK", "AFG"], "Pakistan vs Afghanistan's Taliban government", "2025", "Fighting on the border in October, then a ceasefire agreed in Doha.", [["PAK", "AFG"]]),
    ("thakhm", "Thailand and Cambodia", "state", "minor", ["THA", "KHM"], "Thailand vs Cambodia", "2025", "Fighting around the disputed border.", [["THA", "KHM"]]),
    ("cod", "Eastern DR Congo (M23)", "internal", "war", ["COD"], "Congo's army and allied militias vs M23 rebels, which Rwanda is accused of backing", "2022", "The UN and several governments say Rwanda supports M23; Rwanda denies it.", [["RWA", "COD"]]),
    ("sdn", "Sudan", "internal", "war", ["SDN"], "Sudan's army vs the Rapid Support Forces", "2023", "One of the world's worst humanitarian crises.", []),
    ("syr", "Syria", "internal", "war", ["SYR"], "Transitional government vs Islamic State, Kurdish-led forces and local groups", "2011", "Also hit by Israeli strikes.", []),
    ("mmr", "Myanmar", "internal", "war", ["MMR"], "Military government vs resistance forces and ethnic armed groups", "2021", "", []),
    ("som", "Somalia", "internal", "war", ["SOM"], "Government and African Union forces vs al-Shabaab and Islamic State", "2006", "", []),
    ("bfa", "Burkina Faso", "internal", "war", ["BFA"], "Army and militias vs JNIM and Islamic State Sahel", "2015", "", []),
    ("nga", "Nigeria and Lake Chad", "internal", "war", ["NGA"], "Nigeria and neighbours vs Boko Haram and ISWAP", "2009", "", []),
    ("pak", "Pakistan (Taliban and separatists)", "internal", "war", ["PAK"], "Pakistan's forces vs the Pakistani Taliban (TTP) and Baloch separatists", "2007", "", []),
    ("hti", "Haiti", "internal", "war", ["HTI"], "Police and an international mission vs gang coalitions", "2021", "", []),
    ("mex", "Mexico", "internal", "war", ["MEX"], "Drug cartels against each other and against security forces", "2006", "", []),
    ("eth", "Ethiopia", "internal", "war", ["ETH"], "Federal forces vs Fano militias (Amhara) and the Oromo Liberation Army; Tigray tensions", "2023", "", []),
    ("ssd", "South Sudan", "internal", "minor", ["SSD"], "Government vs SPLA-IO and allied militias", "2013", "", []),
    ("caf", "Central African Republic", "internal", "minor", ["CAF"], "Government and Russian forces vs armed rebel groups", "2012", "", []),
    ("mli", "Mali", "internal", "minor", ["MLI"], "Army and Russia's Africa Corps vs JNIM and Islamic State Sahel", "2012", "", []),
    ("ner", "Niger", "internal", "minor", ["NER"], "Army vs Islamic State Sahel, JNIM and Boko Haram", "2015", "", []),
    ("cmr", "Cameroon", "internal", "minor", ["CMR"], "Army vs Anglophone separatists", "2017", "", []),
    ("bentgo", "Benin and Togo (north)", "internal", "minor", ["BEN", "TGO"], "National armies vs JNIM", "2021", "", []),
    ("moz", "Mozambique (Cabo Delgado)", "internal", "minor", ["MOZ"], "Mozambique and Rwanda's forces vs Islamic State Mozambique", "2017", "", []),
    ("afg", "Afghanistan", "internal", "minor", ["AFG"], "Taliban government vs Islamic State Khorasan and resistance groups", "2021", "", []),
    ("ind", "India (Maoist insurgency)", "internal", "minor", ["IND"], "Security forces vs Maoist (Naxalite) rebels", "1967", "", []),
    ("thai", "Thailand (Deep South)", "internal", "minor", ["THA"], "Thai forces vs Malay-Muslim insurgents", "2004", "", []),
    ("phl", "Philippines", "internal", "minor", ["PHL"], "Armed forces vs the New People's Army and Islamist groups", "1969", "", []),
    ("idn", "Indonesia (Papua)", "internal", "minor", ["IDN"], "Indonesian forces vs West Papua separatists", "1963", "", []),
    ("col", "Colombia", "internal", "minor", ["COL"], "Armed forces vs the ELN, FARC dissidents and Clan del Golfo", "1964", "", []),
    ("ecu", "Ecuador", "internal", "minor", ["ECU"], "Armed forces vs organised-crime groups", "2024", "", []),
]


def build():
    conflicts, countries = [], {}
    for cid, name, kind, lvl, where, sides, since, note, arcs in CONFLICTS:
        conflicts.append(dict(id=cid, n=name, kind=kind, lvl=lvl, where=where, sides=sides, since=since, note=note, arcs=arcs))
        for iso in where:
            c = countries.setdefault(iso, dict(lvl="minor", c=[]))
            if lvl == "war":
                c["lvl"] = "war"
            c["c"].append(cid)
    return dict(asof=ASOF, sources=SOURCES, caveat="A dated snapshot compiled from public trackers. Parties and intensity are simplified, and who is 'fighting whom' is often disputed.", conflicts=conflicts, countries=countries)


if __name__ == "__main__":
    d = build(); json.dump(d, open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)
    print("conflict.json:", len(d["conflicts"]), "conflicts,", len(d["countries"]), "countries,", sum(len(c["arcs"]) for c in d["conflicts"]), "arcs")
