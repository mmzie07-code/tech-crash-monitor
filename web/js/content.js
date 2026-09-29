// All course text lives here. Edit freely; the app renders whatever is in these lists.
const BRAND = "Market Lab"; // working name

const MODULES = [
  { id: 1, title: "What is a stock?", mins: 8, live: true, blurb: "Ownership, prices, and why companies sell shares.",
    goals: ["Explain what owning a share means", "Say why stock prices move", "Tell a stock from an index fund"],
    body: [
      ["h", "You own a slice of a business"],
      ["p", "A company is worth some amount of money. To raise cash, it can cut itself into millions of tiny pieces called <b>shares</b> and sell them. If you buy one share, you own a very small piece of that company. You share in its success, and in its problems."],
      ["h", "Why do prices move?"],
      ["p", "Prices are set by buyers and sellers agreeing on a number, all day long. If more people want to buy than sell, the price rises. If more want to sell, it falls. What drives that? Mostly <b>expectations about the company's future profits</b>, plus interest rates, news, and plain human emotion."],
      ["c", "<b>Key idea:</b> a stock price is not what a company is worth today. It is what people <i>expect</i> it to be worth later. That is why prices can jump on news and why they can be wrong for a long time."],
      ["h", "Stocks vs. index funds"],
      ["p", "A single stock is a bet on one company. An <b>index fund</b> holds hundreds of companies at once (for example the S&amp;P 500 holds 500 large US companies). If one company fails, it barely dents the fund. That is called <b>diversification</b>, and it is the main tool beginners have against risk."],
      ["h", "How people make and lose money"],
      ["p", "You can earn from the price rising over time, and from <b>dividends</b> (a share of profits some companies pay out). You can lose money if the price falls, and you can lose <i>all</i> of it if a company goes to zero. Nobody, including professionals and this app, can reliably predict short-term moves."]],
    quiz: [
      { q: "If you own one share of a company, you own...", o: ["A loan to the company", "A small piece of the company", "A guaranteed profit"], a: 1, why: "A share is partial ownership. Nothing about it is guaranteed." },
      { q: "A stock price mostly reflects...", o: ["What the company is worth today, exactly", "What people expect about future profits", "What the CEO says it should be"], a: 1, why: "Prices are expectations, which is why news moves them." },
      { q: "Why do many beginners start with an index fund?", o: ["It can never lose value", "It spreads risk across many companies", "It always beats single stocks"], a: 1, why: "Diversification lowers the damage if any one company fails. It can still lose value." }] },
  { id: 2, title: "How markets work", mins: 9, blurb: "Exchanges, brokers, orders, and who is on the other side of your trade." },
  { id: 3, title: "Risk and diversification", mins: 10, blurb: "Why not to put everything in one place, and what 'risk' really means." },
  { id: 4, title: "Index funds and ETFs", mins: 8, blurb: "The simple, low-cost way most long-term investors start." },
  { id: 5, title: "Reading charts and indicators", mins: 10, blurb: "Trends, averages, and what a chart can and cannot tell you." },
  { id: 6, title: "Bubbles and crashes", mins: 12, blurb: "2000, 2008, 2022: what happened, and how our live monitor watches for warning signs." },
  { id: 7, title: "Scams, hype, and your own brain", mins: 9, blurb: "Meme stocks, pump-and-dumps, FOMO, and how to protect yourself." },
  { id: 8, title: "Building your plan", mins: 10, blurb: "Goals, time horizon, and practicing with paper trading before real money." }];

const GLOSSARY = [
  ["Share", "One unit of ownership in a company."], ["Index fund", "A fund that holds many stocks to track a market index."],
  ["Diversification", "Spreading money across many investments to reduce risk."], ["Dividend", "A payment some companies make to shareholders from profits."],
  ["Bull / bear market", "Prices rising broadly / falling 20%+ from a peak."], ["Volatility (VIX)", "How much prices swing. The VIX measures expected swings in the S&P 500."],
  ["Valuation (P/E)", "Price divided by earnings. High P/E means investors pay a lot per dollar of profit."], ["Drawdown", "How far a price has fallen from its recent high."]];

const HORIZONS = [
  ["Today", "News, earnings, and data releases that hit the market right now."], ["Tomorrow", "What is scheduled next and how positioning could react."],
  ["Next week", "Fed speakers, economic data, and earnings on the calendar."], ["Next month", "Rate decisions, earnings season, and trend shifts."],
  ["Next year", "Valuation, earnings growth, and the rate path. Largest uncertainty."]];
