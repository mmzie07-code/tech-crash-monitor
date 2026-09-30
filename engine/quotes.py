"""End-of-day prices for the paper-trading universe -> data/quotes.json
Educational only: daily closes, not live quotes."""
import datetime as dt, time
from providers import yahoo_closes

T, C, F, H, S, D, E, I, U, M, R, K = ("Technology", "Communication", "Financials", "Health Care", "Consumer Staples", "Consumer Discretionary",
                                      "Energy", "Industrials", "Utilities", "Materials", "Real Estate", "Diversified fund")
UNIVERSE = [
    ("AAPL", "Apple", T), ("MSFT", "Microsoft", T), ("NVDA", "NVIDIA", T), ("AVGO", "Broadcom", T), ("ORCL", "Oracle", T), ("AMD", "AMD", T),
    ("ADBE", "Adobe", T), ("CRM", "Salesforce", T), ("INTC", "Intel", T), ("CSCO", "Cisco", T), ("QCOM", "Qualcomm", T), ("IBM", "IBM", T), ("MU", "Micron", T),
    ("GOOGL", "Alphabet (Google)", C), ("META", "Meta Platforms", C), ("NFLX", "Netflix", C), ("DIS", "Disney", C), ("T", "AT&T", C), ("VZ", "Verizon", C), ("CMCSA", "Comcast", C),
    ("AMZN", "Amazon", D), ("TSLA", "Tesla", D), ("HD", "Home Depot", D), ("MCD", "McDonald's", D), ("NKE", "Nike", D), ("SBUX", "Starbucks", D),
    ("LOW", "Lowe's", D), ("BKNG", "Booking Holdings", D), ("TGT", "Target", D), ("UBER", "Uber", I),
    ("JPM", "JPMorgan Chase", F), ("BAC", "Bank of America", F), ("WFC", "Wells Fargo", F), ("GS", "Goldman Sachs", F), ("MS", "Morgan Stanley", F),
    ("V", "Visa", F), ("MA", "Mastercard", F), ("BRK-B", "Berkshire Hathaway", F), ("AXP", "American Express", F), ("BLK", "BlackRock", F), ("C", "Citigroup", F),
    ("LLY", "Eli Lilly", H), ("JNJ", "Johnson & Johnson", H), ("UNH", "UnitedHealth", H), ("PFE", "Pfizer", H), ("MRK", "Merck", H), ("ABBV", "AbbVie", H),
    ("TMO", "Thermo Fisher", H), ("ABT", "Abbott", H), ("AMGN", "Amgen", H),
    ("WMT", "Walmart", S), ("COST", "Costco", S), ("PG", "Procter & Gamble", S), ("KO", "Coca-Cola", S), ("PEP", "PepsiCo", S), ("MDLZ", "Mondelez", S),
    ("XOM", "Exxon Mobil", E), ("CVX", "Chevron", E), ("COP", "ConocoPhillips", E),
    ("CAT", "Caterpillar", I), ("BA", "Boeing", I), ("GE", "GE Aerospace", I), ("UPS", "UPS", I), ("HON", "Honeywell", I), ("RTX", "RTX", I), ("LMT", "Lockheed Martin", I), ("DE", "Deere", I),
    ("NEE", "NextEra Energy", U), ("DUK", "Duke Energy", U), ("SO", "Southern Company", U),
    ("LIN", "Linde", M), ("FCX", "Freeport-McMoRan", M), ("PLD", "Prologis", R), ("AMT", "American Tower", R),
    ("SPY", "S&P 500 ETF (SPY)", K), ("VOO", "S&P 500 ETF (Vanguard)", K), ("VTI", "Total US Market ETF", K), ("QQQ", "Nasdaq-100 ETF", K),
    ("DIA", "Dow Jones ETF", K), ("IWM", "Small-Cap ETF (Russell 2000)", K), ("VXUS", "International Stocks ETF", K), ("SCHD", "Dividend Stocks ETF", K),
    ("AGG", "US Bond Market ETF", K), ("TLT", "Long-Term Treasury ETF", K), ("GLD", "Gold ETF", K), ("VNQ", "Real Estate ETF", K),
    ("SMH", "Semiconductor ETF", K), ("XLK", "Technology Sector ETF", K), ("XLF", "Financials Sector ETF", K), ("XLE", "Energy Sector ETF", K),
    ("XLV", "Health Care Sector ETF", K), ("XLU", "Utilities Sector ETF", K),
]


def one(sym, name, sector):
    s = yahoo_closes(sym, "1y")
    v = [c for _, c in s]
    if len(v) < 30:
        raise ValueError("short history")
    ch = lambda n: round((v[-1] / v[-1 - n] - 1) * 100, 2) if len(v) > n else None
    return dict(symbol=sym, name=name, sector=sector, price=round(v[-1], 2), date=s[-1][0], d1=ch(1), w1=ch(5), m1=ch(21), y1=ch(len(v) - 1),
                lo52=round(min(v), 2), hi52=round(max(v), 2), etf=(sector == K), spark=[round(x, 2) for x in v[-90:]])


def build():
    out, failed = [], []
    for sym, name, sector in UNIVERSE:
        try:
            out.append(one(sym, name, sector))
        except Exception:
            failed.append(sym)
        time.sleep(0.15)
    date = max(q["date"] for q in out) if out else None
    return dict(generated=dt.datetime.utcnow().isoformat() + "Z", date=date, quotes=out, failed=failed)


if __name__ == "__main__":
    import json, os
    q = build()
    json.dump(q, open(os.path.join(os.path.dirname(__file__), "..", "data", "quotes.json"), "w"), separators=(",", ":"))
    print(len(q["quotes"]), "quotes, date", q["date"], "failed:", q["failed"])
