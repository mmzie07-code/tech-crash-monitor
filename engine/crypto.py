"""Crypto section -> data/crypto.json. Facts only: CoinGecko's public market data (top coins, global totals), the Fear & Greed index,
and how Bitcoin has moved alongside stocks (computed from our own stored price history). No ratings, no predictions."""
import datetime as dt, json, math, os, time
import urllib.request as urlreq

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
CG = "https://api.coingecko.com/api/v3"
EPOCH = dt.date(2000, 1, 1)

# Coins whose price history we store (Yahoo SYMBOL-USD), so their pages get a full chart. Imported by history.py.
HIST_COINS = ["BTC", "ETH", "XRP", "BNB", "SOL", "DOGE", "ADA", "TRX", "LINK", "AVAX", "XLM", "BCH", "LTC", "HBAR", "DOT", "SHIB", "UNI", "AAVE", "XMR", "ETC", "NEAR", "ATOM", "APT", "SUI", "ARB", "OP", "FIL", "ALGO", "ICP", "TON"]

STABLES = {"USDT", "USDC", "DAI", "USDE", "FDUSD", "PYUSD", "USDS", "TUSD", "USDD", "USD1", "BUIDL", "USDY", "GUSD", "FRAX", "LUSD", "USDP", "RLUSD", "USDF", "USDG", "USYC", "EURC", "EURS", "EURSAFO", "OUSD", "GHO"}
# One plain-English line on what each big coin is for. Hand-written, kept short; anything not listed is shown without a blurb.
ROLE = {
    "BTC": "The first and largest cryptocurrency. Often described as digital gold: a limited supply (21 million coins) and no company behind it.",
    "ETH": "A network that runs 'smart contracts': programs that other apps, tokens and stablecoins are built on. Its coin pays the fees.",
    "XRP": "The coin of the XRP Ledger, designed for fast, cheap payments between banks and firms. Tied to the company Ripple.",
    "BNB": "The coin of the BNB Chain, which began as the token of the Binance exchange. Used to pay fees on that network.",
    "SOL": "A fast smart-contract network that competes with Ethereum. Known for low fees and for past outages.",
    "DOGE": "Began as a joke in 2013. A 'meme coin': its value comes from attention and sentiment, not from any use.",
    "ADA": "A smart-contract network built around academic research. Slower to ship than rivals, with a loyal community.",
    "TRX": "A network heavily used to move stablecoins (especially USDT) between people and exchanges.",
    "LINK": "Delivers outside data, such as prices, to smart contracts, which cannot look things up on their own.",
    "AVAX": "A smart-contract network that lets projects launch their own connected chains.",
    "XLM": "A payments network aimed at cheap cross-border transfers and tokenized money.",
    "BCH": "A 2017 split from Bitcoin that favors bigger blocks and cheap everyday payments.",
    "LTC": "An early 'lighter' Bitcoin alternative from 2011, faster and cheaper but with far less use.",
    "HBAR": "The coin of Hedera, a network governed by a council of large companies.",
    "DOT": "A network that connects separate blockchains so they can pass data and value to each other.",
    "SHIB": "A meme coin that began as a Dogecoin copycat. Value rests on attention.",
    "UNI": "The governance token of Uniswap, a decentralized exchange where people trade tokens without a company in the middle.",
    "AAVE": "The token of Aave, a lending market where people borrow and lend crypto using smart contracts.",
    "XMR": "A privacy-focused coin that hides senders, receivers and amounts. Delisted from many exchanges because of that.",
    "ETC": "The original Ethereum chain, which kept running after the 2016 split that created today's Ethereum.",
    "NEAR": "A smart-contract network focused on easy-to-use apps and low fees.",
    "TON": "The network tied to the Telegram messaging app.",
    "SUI": "A newer smart-contract network designed for fast, low-cost apps and games.",
    "APT": "A newer smart-contract network built by former Meta engineers.",
    "USDT": "A stablecoin meant to stay at $1, issued by Tether and backed by reserves the company reports. The most traded coin of all.",
    "USDC": "A stablecoin meant to stay at $1, issued by Circle and backed by cash and Treasury bills.",
    "DAI": "A stablecoin meant to stay at $1, kept there by smart contracts and crypto collateral rather than a bank.",
}
# Crypto-linked companies and funds, so readers can see the stock-market side of crypto. Linked to the site's own stock pages.
STOCKS = [
    ("IBIT", "iShares Bitcoin Trust", "Spot Bitcoin ETF"), ("FBTC", "Fidelity Wise Origin Bitcoin Fund", "Spot Bitcoin ETF"), ("GBTC", "Grayscale Bitcoin Trust", "Spot Bitcoin ETF"),
    ("ETHA", "iShares Ethereum Trust", "Spot Ethereum ETF"), ("COIN", "Coinbase", "Exchange"), ("HOOD", "Robinhood", "Brokerage with crypto trading"),
    ("MSTR", "Strategy (MicroStrategy)", "Holds Bitcoin as its main asset"), ("MARA", "MARA Holdings", "Bitcoin miner"), ("RIOT", "Riot Platforms", "Bitcoin miner"),
    ("CLSK", "CleanSpark", "Bitcoin miner"), ("CIFR", "Cipher Mining", "Bitcoin miner"), ("CRCL", "Circle Internet Group", "Issues the USDC stablecoin"), ("GLXY", "Galaxy Digital", "Crypto financial services"),
]


def get(url, tries=4):
    last = None
    for i in range(tries):
        try:
            return json.loads(urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=30).read())
        except Exception as e:
            last = e
            time.sleep(8 * (i + 1) if "429" in str(e) else 3 * (i + 1))   # CoinGecko's free tier rate-limits; wait and retry
    raise RuntimeError("%s: %s" % (url.split("?")[0], last))


def r(v, n=2):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(v, n)


def hist(sym):
    p = os.path.join(DATA, "hist", sym + ".json")
    if not os.path.exists(p):
        return None
    j = json.load(open(p))
    return dict(zip(j["t"], j["c"]))


def corr(a, b, days):
    """Correlation of daily returns over the last `days` shared trading days (None if too little data)."""
    ks = sorted(set(a) & set(b))[-(days + 1):]
    if len(ks) < days * 0.7:
        return None
    ra = [a[ks[i]] / a[ks[i - 1]] - 1 for i in range(1, len(ks))]
    rb = [b[ks[i]] / b[ks[i - 1]] - 1 for i in range(1, len(ks))]
    n = len(ra)
    ma, mb = sum(ra) / n, sum(rb) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va, vb = sum((x - ma) ** 2 for x in ra), sum((y - mb) ** 2 for y in rb)
    return round(cov / math.sqrt(va * vb), 2) if va > 0 and vb > 0 else None


def vol(a, days, per_year=365):
    """Annualized volatility from daily returns over the last `days` points."""
    ks = sorted(a)[-(days + 1):]
    rs = [a[ks[i]] / a[ks[i - 1]] - 1 for i in range(1, len(ks))]
    if len(rs) < days * 0.7:
        return None
    m = sum(rs) / len(rs)
    return round(math.sqrt(sum((x - m) ** 2 for x in rs) / (len(rs) - 1)) * math.sqrt(per_year) * 100, 0)


def drawdown(a):
    """Largest peak-to-trough fall in the stored history, and how far the latest price is below its peak."""
    peak, worst = 0, 0
    for k in sorted(a):
        peak = max(peak, a[k])
        worst = min(worst, a[k] / peak - 1)
    return round(worst * 100, 0)


def build():
    coins = get(CG + "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d,1y")
    time.sleep(2)
    glob = get(CG + "/global")["data"]
    try:
        fng = get("https://api.alternative.me/fng/?limit=30")["data"]
    except Exception:
        fng = []
    rows = []
    for c in coins:
        sym = c["symbol"].upper()
        sp = (c.get("sparkline_in_7d") or {}).get("price") or []
        step = max(1, len(sp) // 42)
        rows.append(dict(
            id=c["id"], sym=sym, name=c["name"], rank=c["market_cap_rank"], price=c["current_price"], cap=c["market_cap"], vol=c["total_volume"],
            h1=r(c.get("price_change_percentage_1h_in_currency")), d1=r(c.get("price_change_percentage_24h_in_currency", c.get("price_change_percentage_24h"))),
            d7=r(c.get("price_change_percentage_7d_in_currency")), d30=r(c.get("price_change_percentage_30d_in_currency")), y1=r(c.get("price_change_percentage_1y_in_currency")),
            ath=c.get("ath"), ath_pct=r(c.get("ath_change_percentage")), ath_date=(c.get("ath_date") or "")[:10], atl_pct=r(c.get("atl_change_percentage"), 0),
            supply=c.get("circulating_supply"), max_supply=c.get("max_supply"), total_supply=c.get("total_supply"), high24=c.get("high_24h"), low24=c.get("low_24h"),
            stable=sym in STABLES or "USD" in sym or (0.97 <= (c["current_price"] or 0) <= 1.03 and abs(c.get("price_change_percentage_7d_in_currency") or 0) < 2 and abs(c.get("price_change_percentage_1y_in_currency") or 0) < 6), role=ROLE.get(sym), hist=sym in HIST_COINS, spark=[r(x, 6 if (x or 0) < 1 else 2) for x in sp[::step]]))
    stable_cap = sum(x["cap"] or 0 for x in rows if x["stable"])
    movers = [x for x in rows if not x["stable"] and x["d1"] is not None and (x["cap"] or 0) >= 1e9]
    movers.sort(key=lambda x: -x["d1"])
    btc, eth = hist("BTC-USD"), hist("ETH-USD")
    qqq, spy, gld = hist("QQQ"), hist("SPY"), hist("GLD")
    behave = None
    if btc:
        behave = dict(
            corr_qqq_90=corr(btc, qqq, 90) if qqq else None, corr_qqq_365=corr(btc, qqq, 365) if qqq else None,
            corr_gld_90=corr(btc, gld, 90) if gld else None, corr_gld_365=corr(btc, gld, 365) if gld else None,
            vol_btc_90=vol(btc, 90), vol_spy_90=(vol(spy, 62, 252) if spy else None), vol_eth_90=vol(eth, 90) if eth else None,
            maxdd_btc=drawdown(btc), maxdd_spy=drawdown(spy) if spy else None, years=round(len(btc) / 365, 1))
    cap = glob["total_market_cap"]["usd"]
    return dict(
        generated=dt.datetime.utcnow().isoformat() + "Z",
        market=dict(cap=cap, cap_d1=r(glob.get("market_cap_change_percentage_24h_usd")), volume=glob["total_volume"]["usd"], btc_dom=r(glob["market_cap_percentage"].get("btc"), 1),
                     eth_dom=r(glob["market_cap_percentage"].get("eth"), 1), stable_share=r(stable_cap / cap * 100, 1) if cap else None, stable_cap=stable_cap, coins=glob.get("active_cryptocurrencies")),
        fng=[dict(v=int(x["value"]), label=x["value_classification"], t=int(x["timestamp"])) for x in fng],
        coins=rows,
        gainers=[x["sym"] for x in movers[:5]], losers=[x["sym"] for x in movers[::-1][:5]],
        behave=behave,
        stocks=[dict(sym=s, name=n, kind=k) for s, n, k in STOCKS],
        source="CoinGecko (prices, supply, global totals), alternative.me (Fear & Greed), Yahoo Finance (history)")


if __name__ == "__main__":
    d = build()
    json.dump(d, open(os.path.join(DATA, "crypto.json"), "w"), separators=(",", ":"))
    g = d["market"]
    print("crypto: %d coins, total cap $%.2fT, BTC %.1f%%, F&G %s, behave %s" % (len(d["coins"]), g["cap"] / 1e12, g["btc_dom"], d["fng"][0]["v"] if d["fng"] else None, d["behave"]))
