"""AI Watch extension: three more groups of indicators, all free and daily or weekly.
  F  Macro, liquidity and policy   (the plumbing that feeds or starves a bubble)
  G  AI supply chain and leadership (prices of the chain: chips, equipment, servers, power, neoclouds, speculation)
  H  Attention and news             (how loudly the market is talking about a bubble)
Each indicator returns the same dict as aiwatch.ind(): a 0-100 heat, the rule that sets it, its as-of date and update rhythm."""
import datetime as dt, json, math, re, urllib.parse, urllib.request as ur
import numpy as np, pandas as pd
import mdata
from aiwatch import lin, pctile, ind

UA = {"User-Agent": "Mozilla/5.0"}


def _last(s):
    s = s.dropna()
    return float(s.iloc[-1]), s.index[-1].date().isoformat()


def _hist(s, n=120, step=1):
    s = s.dropna().iloc[-n * step:]
    return [round(float(x), 4) for x in s.values[::step]]


def _safe(fn, label):
    try:
        return fn()
    except Exception as e:
        print("  ext indicator failed:", label, str(e)[:100])
        return []


# ---------- F: macro, liquidity and policy ----------
def pillar_f():
    out = []

    def vix_term():
        a = mdata.yahoo("^VIX", refresh_days=0); b = mdata.yahoo("^VIX3M", refresh_days=0)
        r = (a / b.reindex(a.index).ffill()).dropna(); v, d = _last(r)
        return [ind("F", "f_vixterm", "VIX term structure (VIX divided by 3-month VIX)", v, "%.2f (above 1.00 = fear about the near term is higher than about next quarter)" % v, "x", d, "Cboe via Yahoo Finance", "daily",
                    lin(v, [(0.80, 8), (0.90, 25), (1.0, 70), (1.10, 95)]), "0.90 = 25, 1.00 = 70 (the curve flips upside down), 1.10 = 95.", "Normally near-term fear is lower than long-term. When it inverts, traders are paying up for protection right now.", hist=_hist(r, 120))]

    def move():
        s = mdata.yahoo("^MOVE", refresh_days=0); v, d = _last(s)
        return [ind("F", "f_move", "Bond-market volatility (MOVE index)", v, "%.0f" % v, "", d, "ICE BofA MOVE via Yahoo Finance", "daily", pctile(list(s.dropna().values[::3]), v, True),
                    "Heat = where today's MOVE ranks among every day since 2002.", "Rates volatility spills into equity valuations, especially for long-duration growth stocks.", hist=_hist(s, 120))]

    def skew():
        s = mdata.yahoo("^SKEW", refresh_days=0); v, d = _last(s)
        return [ind("F", "f_skew", "Tail-risk hedging demand (Cboe SKEW)", v, "%.0f (100 = no crash premium)" % v, "", d, "Cboe via Yahoo Finance", "daily", lin(v, [(115, 10), (130, 35), (145, 65), (160, 92)]),
                    "SKEW 130 = 35, 145 = 65, 160 = 92.", "A high SKEW means investors are paying extra for out-of-the-money puts: someone is positioned for a large fall even while the index rises.", hist=_hist(s, 120))]

    def stress():
        n = mdata.fred("NFCI", refresh_days=0); s = mdata.fred("STLFSI4", refresh_days=0)
        vn, dn = _last(n); vs, ds = _last(s)
        return [ind("F", "f_nfci", "Financial conditions (Chicago Fed NFCI)", vn, "%+.2f (negative = looser than average)" % vn, "", dn, "Chicago Fed via FRED", "weekly", lin(vn, [(-0.7, 8), (-0.4, 20), (-0.1, 50), (0.3, 85)]),
                    "-0.4 = 20, -0.1 = 50, +0.3 = 85. Tightening is what usually ends a boom.", "105 measures of risk, credit and leverage in one number.", hist=_hist(n, 120)),
                ind("F", "f_stl", "Financial stress (St. Louis Fed index)", vs, "%+.2f" % vs, "", ds, "St. Louis Fed via FRED", "weekly", lin(vs, [(-1.0, 8), (-0.5, 20), (0, 50), (1.5, 90)]),
                    "-0.5 = 20, 0 = 50, +1.5 = 90.", "18 market series (yields, spreads, volatility) combined; zero is average stress.", hist=_hist(s, 120))]

    def liquidity():
        w = mdata.fred("WALCL", refresh_days=0); r = mdata.fred("RRPONTSYD", refresh_days=0); t = mdata.fred("WTREGEN", refresh_days=0)
        idx = w.index
        net = w / 1e6 - r.reindex(idx).ffill() / 1e3 - t.reindex(idx).ffill() / 1e6        # $ trillions: Fed assets minus reverse repo minus Treasury cash
        net = net.dropna(); v, d = _last(net); ch = v - float(net.iloc[-14]); chw = (w.iloc[-1] / w.iloc[-14] - 1) * 100
        return [ind("F", "f_netliq", "Net liquidity (Fed assets minus reverse repo minus Treasury cash)", ch, "$%.2fT now, %+.2fT over 13 weeks" % (v, ch), "$T", d, "Federal Reserve and Treasury via FRED", "weekly",
                    lin(ch, [(-0.4, 88), (-0.15, 65), (0, 40), (0.2, 15)]), "A 13-week fall of $0.4T = 88, $0.15T = 65, flat = 40, +$0.2T = 15.", "The cash actually sloshing through markets. Asset booms tend to need it growing."
                    , hist=_hist(net, 120)),
                ind("F", "f_fedbs", "Fed balance sheet, 13-week change", chw, "%+.1f%%" % chw, "%", w.index[-1].date().isoformat(), "Federal Reserve via FRED", "weekly", lin(chw, [(-3, 85), (-1, 60), (0, 35), (2, 15)]),
                    "-3% = 85, -1% = 60, flat = 35, +2% = 15.", "Quantitative tightening drains reserves; easing adds them.", hist=_hist(w / 1e6, 120))]

    def rates():
        r = mdata.fred("DFII10", refresh_days=0); be = mdata.fred("T5YIFR", refresh_days=0); c = mdata.fred("T10Y3M", refresh_days=0)
        vr, dr = _last(r); vb, db = _last(be); vc, dc = _last(c)
        return [ind("F", "f_realy", "Real 10-year Treasury yield", vr, "%.2f%%" % vr, "%", dr, "US Treasury via FRED", "daily", lin(vr, [(0, 10), (1, 30), (2, 60), (2.5, 78), (3.2, 95)]),
                    "0% = 10, 1% = 30, 2% = 60, 2.5% = 78, 3.2% = 95.", "What safe money earns after inflation. High real yields shrink the present value of far-off profits, which is the whole case for AI stocks.", hist=_hist(r, 120)),
                ind("F", "f_infl", "Market-implied inflation (5-year, 5 years forward)", vb, "%.2f%%" % vb, "%", db, "Federal Reserve via FRED", "daily", lin(vb, [(1.8, 10), (2.3, 30), (2.8, 70), (3.3, 95)]),
                    "2.3% = 30, 2.8% = 70, 3.3% = 95.", "If investors stop trusting the Fed's inflation target, rates stay high and valuations compress.", hist=_hist(be, 120)),
                ind("F", "f_curve", "Yield curve (10-year minus 3-month)", vc, "%+.2f%%" % vc, "%", dc, "US Treasury via FRED", "daily", lin(vc, [(-1, 90), (0, 65), (0.5, 35), (1.5, 15), (2.5, 10)]),
                    "Inverted = 65 and up; +0.5 = 35; +1.5 = 15. (Curves usually un-invert just before downturns.)", "An inverted curve has preceded every US recession since the 1960s, with a long and variable lag.", hist=_hist(c, 120))]

    def credit():
        b = mdata.fred("BAA10Y", refresh_days=0); h = mdata.fred("BAMLH0A0HYM2", refresh_days=0)
        vb, db = _last(b); vh, dh = _last(h); ch = vh - float(h.iloc[-64])
        return [ind("F", "f_baa", "Corporate bond spread (Moody's Baa over 10-year Treasury)", vb, "%.2f%% (tight spreads = complacency)" % vb, "%", db, "Moody's via FRED", "daily", pctile(list(b.dropna().values[::5]), vb, False),
                    "Heat = how TIGHT the spread is compared with every day since 1986 (tight = nothing priced for trouble).", "Booms end with spreads at their narrowest. Complacency is a fragility signal, not a trigger.", hist=_hist(b, 120)),
                ind("F", "f_hy", "Junk-bond spread, 3-month widening", ch, "%.2f%% now, %+.2f pts over 3 months" % (vh, ch), "pts", dh, "ICE BofA via FRED", "daily", lin(ch, [(-0.5, 8), (0, 25), (0.5, 60), (1.5, 92)]),
                    "Widening of 0.5 pt = 60, 1.5 pts = 92.", "The credit market usually stops believing before the stock market does.", hist=_hist(h, 120))]

    def real_economy():
        c = mdata.fred("ICSA", refresh_days=0); ma = c.rolling(4).mean().dropna(); v = float(ma.iloc[-1]); lo = float(ma.iloc[-52:].min()); pct = (v / lo - 1) * 100
        u = mdata.fred("UMCSENT", refresh_days=0); vu, du = _last(u)
        mr = mdata.fred("MORTGAGE30US", refresh_days=0); vm, dm = _last(mr)
        dxy = mdata.fred("DTWEXBGS", refresh_days=0); dch = (dxy.iloc[-1] / dxy.iloc[-64] - 1) * 100
        return [ind("F", "f_claims", "Jobless claims vs their 1-year low (4-week average)", pct, "%s claims, %+.0f%% above the 1-year low" % (format(int(v), ","), pct), "%", ma.index[-1].date().isoformat(), "Department of Labor via FRED", "weekly",
                    lin(pct, [(0, 8), (10, 25), (20, 60), (35, 92)]), "10% above the low = 25, 20% = 60, 35% = 92 (the Sahm-rule neighbourhood).", "Layoffs are the earliest hard evidence that demand is turning.", hist=_hist(ma, 120)),
                ind("F", "f_sent", "Consumer sentiment (Michigan)", vu, "%.1f" % vu, "", du, "University of Michigan via FRED", "monthly", lin(vu, [(40, 82), (55, 55), (70, 30), (95, 12)]),
                    "40 = 82, 55 = 55, 70 = 30, 95 = 12.", "Weak households and strong stock prices is a gap that has historically closed from the stock side as often as the sentiment side.", hist=_hist(u, 60)),
                ind("F", "f_mort", "30-year mortgage rate", vm, "%.2f%%" % vm, "%", dm, "Freddie Mac via FRED", "weekly", lin(vm, [(4, 10), (6, 40), (7, 70), (8, 95)]),
                    "6% = 40, 7% = 70, 8% = 95.", "Housing is the economy's most rate-sensitive sector and a major source of household wealth.", hist=_hist(mr, 120)),
                ind("F", "f_dxy", "Broad US dollar, 3-month change", dch, "%+.1f%%" % dch, "%", dxy.index[-1].date().isoformat(), "Federal Reserve via FRED", "weekly", lin(dch, [(-3, 10), (0, 25), (3, 60), (6, 90)]),
                    "+3% = 60, +6% = 90.", "A rising dollar tightens global financial conditions and squeezes companies that borrow in dollars.", hist=_hist(dxy, 120))]

    for fn, lab in ((vix_term, "vix term"), (move, "move"), (skew, "skew"), (stress, "stress"), (liquidity, "liquidity"), (rates, "rates"), (credit, "credit"), (real_economy, "real economy")):
        out += _safe(fn, lab)
    return out


# ---------- G: AI supply chain and market leadership ----------
def _px(sym):
    return mdata.yahoo(sym, refresh_days=0).dropna()


def pillar_g():
    out = []

    def rel(a, b, n):
        sa, sb = _px(a), _px(b); sb = sb.reindex(sa.index).ffill(); r = np.log(sa / sb).dropna()
        return r, (math.exp(float(r.iloc[-1] - r.iloc[-1 - n])) - 1) * 100

    def leadership():
        o = []
        r, ch = rel("SMH", "SPY", 60); d = r.index[-1].date().isoformat()
        o.append(ind("G", "g_smh", "Semiconductors vs the S&P 500, 3 months", ch, "%+.1f pts" % ch, "pts", d, "Yahoo Finance (SMH, SPY)", "daily", lin(-ch, [(-12, 15), (-3, 30), (2, 60), (8, 90)]),
                     "Chips lagging the market by 2 pts = 60, by 8 = 90. The AI trade leads on the way up and has led on the way down.", "If semiconductors stop outperforming, the AI narrative is losing its marginal buyer.", hist=_hist(r, 120, 1)))
        r2, ch2 = rel("NVDA", "SMH", 20); d2 = r2.index[-1].date().isoformat()
        o.append(ind("G", "g_nvda_rel", "NVIDIA vs its own sector, 1 month", ch2, "%+.1f pts" % ch2, "pts", d2, "Yahoo Finance", "daily", lin(-ch2, [(-10, 15), (-2, 30), (3, 60), (10, 90)]),
                     "NVIDIA lagging the semiconductor index by 3 pts = 60, 10 = 90.", "The bellwether tends to stumble before the sector.", hist=_hist(r2, 120, 1)))
        return o

    def dd(sym):
        s = _px(sym); hi = float(s.iloc[-252:].max()); v = float(s.iloc[-1]) / hi - 1; return v * 100, s.index[-1].date().isoformat(), s

    def chain():
        o = []
        for sym, nm, why in (("TSM", "TSMC (chip manufacturing)", "Makes nearly every leading AI chip."), ("ASML", "ASML (chip equipment)", "Sells the machines that make the chips, so it sees orders first."), ("CRWV", "CoreWeave (GPU cloud, heavily indebted)", "The most leveraged pure AI-infrastructure stock; it is the canary for the debt-funded part of the buildout.")):
            try:
                v, d, s = dd(sym); steep = sym == "CRWV"
                o.append(ind("G", "g_dd_" + sym.lower(), nm + ": distance below 1-year high", v, "%.0f%% below its high" % -v if v < -0.05 else "at its high", "%", d, "Yahoo Finance", "daily",
                             lin(-v, [(0, 10), (12, 40), (25, 70), (40, 95)]) if steep else lin(-v, [(0, 10), (8, 40), (15, 70), (25, 95)]),
                             "Within a few %% of the high = 10; %s below = 40; %s = 70." % (("12%", "25%") if steep else ("8%", "15%")), why, hist=_hist(s, 120)))
            except Exception as e:
                print("  chain", sym, e)
        return o

    def basket(name, key, syms, why):
        vals, ext, below50 = [], [], 0
        d = None
        for s_ in syms:
            try:
                s = _px(s_); vals.append(float(s.iloc[-1]) / float(s.iloc[-252:].max()) - 1); ext.append(float(s.iloc[-1]) / float(s.iloc[-200:].mean()) - 1); below50 += float(s.iloc[-1]) < float(s.iloc[-50:].mean()); d = s.index[-1].date().isoformat()
            except Exception:
                continue
        if not vals:
            return []
        m = float(np.mean(vals)) * 100; share = below50 / len(vals) * 100
        return [ind("G", key, name, m, "average %.0f%% below 1-year high; %.0f%% of names below their 50-day average" % (-m, share), "%", d, "Yahoo Finance (%s)" % ", ".join(syms), "daily",
                    0.6 * lin(-m, [(0, 10), (8, 40), (18, 70), (30, 95)]) + 0.4 * lin(share, [(0, 10), (40, 40), (70, 75), (100, 95)]),
                    "60% weight: average distance below the 1-year high (8% = 40, 18% = 70, 30% = 95); 40% weight: share of names below their 50-day average (40% = 40, 70% = 75).", why)]

    def froth():
        syms = ["NVDA", "AVGO", "AMD", "TSM", "MU", "ASML", "ORCL", "ANET", "VRT", "SMCI", "DELL"]
        ext = []; d = None
        for s_ in syms:
            try:
                s = _px(s_); ext.append(float(s.iloc[-1]) / float(s.iloc[-200:].mean()) - 1); d = s.index[-1].date().isoformat()
            except Exception:
                continue
        m = float(np.mean(ext)) * 100
        return [ind("G", "g_froth", "How far the AI basket is stretched above its 200-day average", m, "%+.0f%% on average across %d AI leaders" % (m, len(ext)), "%", d, "Yahoo Finance", "daily", lin(m, [(0, 12), (15, 35), (30, 65), (50, 92)]),
                    "+15% = 35, +30% = 65, +50% = 92.", "Extension above long-run trend is the most dependable sign that expectations have run ahead of delivery, and the worst timer.")]

    def spec():
        return basket("Speculative assets: how far below their highs (ARKK, Bitcoin)", "g_spec", ["ARKK", "BTC-USD"], "Risk appetite shows up first in the most speculative corners.") 

    def semis_ip():
        s = mdata.fred("IPG3344S", refresh_days=0); yoy = (s / s.shift(12) - 1) * 100; yoy = yoy.dropna(); v, d = _last(yoy)
        return [ind("G", "g_semi_ip", "US semiconductor production, year over year", v, "%+.1f%%" % v, "%", d, "Federal Reserve via FRED", "monthly", pctile(list(yoy.values), v, True),
                    "Heat = where this growth rate ranks since 1972 (booms in output are what overbuilding looks like from the inside).", "Real factory output: the physical side of the buildout.", hist=_hist(yoy, 60))]

    for fn, lab in ((leadership, "leadership"), (chain, "chain"), (froth, "froth"), (spec, "spec"), (semis_ip, "semis ip"),
                    (lambda: basket("AI infrastructure picks and shovels (power, cooling, servers, networking)", "g_infra", ["VRT", "ETN", "DELL", "SMCI", "ANET"], "These are the companies selling into data-center construction; they roll over when orders slow."), "infra")):
        out += _safe(fn, lab)
    return out


# ---------- H: attention and news ----------
NEG = re.compile(r"\b(bubble|crash|plunge|plunges|slump|selloff|sell-off|tumble|tumbles|fears|fear|warns|warning|worry|worries|risk|risks|burst|panic|drop|drops|falls|sinks|slide)\b", re.I)
POS = re.compile(r"\b(record|surge|surges|rally|rallies|soar|soars|beats|boom|jumps|gains|rises|strong|optimism|breakout)\b", re.I)


def news(q, days, limit=100):
    url = "https://news.google.com/rss/search?q=%s+when:%dd&hl=en-US&gl=US&ceid=US:en" % (urllib.parse.quote_plus(q), days)
    xml = ur.urlopen(ur.Request(url, headers=UA), timeout=30).read().decode("utf8", "replace")
    items = []
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        b = m.group(1)
        t = re.search(r"<title>(.*?)</title>", b, re.S); l = re.search(r"<link>(.*?)</link>", b, re.S); dte = re.search(r"<pubDate>(.*?)</pubDate>", b, re.S); src = re.search(r"<source[^>]*>(.*?)</source>", b, re.S)
        if t:
            tt = re.sub(r"<!\[CDATA\[|\]\]>", "", t.group(1)).strip().replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", '"')
            items.append(dict(title=tt, link=(l.group(1).strip() if l else ""), date=(dte.group(1)[:16] if dte else ""), source=(re.sub(r"<[^>]+>", "", src.group(1)) if src else "")))
    return items[:limit]


def news_rate(items, days):
    """Articles per day. Google News returns at most 100 items, so when the list is full the rate comes from the time span it covers."""
    from email.utils import parsedate_to_datetime
    if len(items) < 100:
        return len(items) / float(days), False
    ts = []
    for x in items:
        try:
            ts.append(parsedate_to_datetime(x["date"] + " 00:00:00 GMT") if x.get("date") else None)
        except Exception:
            pass
    ts = [t for t in ts if t]
    span = max(0.5, (max(ts) - min(ts)).total_seconds() / 86400.0) if ts else days
    return len(items) / min(span, days), True


def wiki(article, days=120):
    end = dt.date.today() - dt.timedelta(days=1); start = end - dt.timedelta(days=days)
    url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/%s/daily/%s/%s" % (article, start.strftime("%Y%m%d"), end.strftime("%Y%m%d"))
    j = json.loads(ur.urlopen(ur.Request(url, headers=UA), timeout=30).read())["items"]
    return pd.Series([x["views"] for x in j], index=pd.to_datetime([x["timestamp"][:8] for x in j]))


def pillar_h():
    out = []
    heads = []
    try:
        s = wiki("AI_bubble"); v7 = float(s.iloc[-7:].mean()); base = float(s.iloc[-97:-7].mean()); ratio = v7 / max(base, 1)
        out.append(ind("H", "h_wiki", "Reader interest in the 'AI bubble' Wikipedia article", ratio, "%.0f views a day this week, %.1fx the prior three months" % (v7, ratio), "x", s.index[-1].date().isoformat(), "Wikimedia pageviews", "daily",
                       lin(ratio, [(0.6, 10), (1.0, 30), (2.0, 65), (4.0, 92)]), "Same as usual = 30, double = 65, quadruple = 92.", "Public attention to the bubble question. Spikes often follow sell-offs, and the first big spike has often marked late-stage booms.", hist=_hist(s, 90)))
    except Exception as e:
        print("  wiki failed", e)
    try:
        t = news("Nvidia OR \"AI stocks\" OR Nasdaq", 3); heads = t
        neg = sum(1 for x in t if NEG.search(x["title"])); pos = sum(1 for x in t if POS.search(x["title"]))
        if t:
            share = neg / max(1, neg + pos) * 100
            out.append(ind("H", "h_tone", "Headline tone on AI stocks (last 3 days)", share, "%d of %d tagged headlines lean negative (%d negative, %d positive)" % (neg, neg + pos, neg, pos), "%", dt.date.today().isoformat(), "Google News headlines, simple word list", "daily",
                           lin(share, [(20, 15), (40, 35), (60, 65), (80, 90)]), "A crude word-list score. 40% negative = 35, 60% = 65, 80% = 90.", "Rough and noisy. It records the mood of the coverage, not whether it is right."))
    except Exception as e:
        print("  news failed", e)
    return out, heads
