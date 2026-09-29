// All course text lives here. Edit freely; the app renders whatever is in these lists.
const BRAND = "Market Lab"; // working name

const LESSONS = {}; // filled in by js/lessons/l1.js ... l8.js

const MODULES = [
  { id: 1, title: "What is a stock?", mins: 10, live: true, blurb: "Ownership, prices, and why companies sell shares." },
  { id: 2, title: "How markets work", mins: 12, live: true, blurb: "Exchanges, brokers, orders, and who is on the other side of your trade." },
  { id: 3, title: "Risk and diversification", mins: 13, live: true, blurb: "Why not to put everything in one place, and what 'risk' really means." },
  { id: 4, title: "Index funds and ETFs", mins: 12, live: true, blurb: "The simple, low-cost way most long-term investors start." },
  { id: 5, title: "Reading charts and indicators", mins: 13, live: true, blurb: "Trends, averages, and what a chart can and cannot tell you." },
  { id: 6, title: "Bubbles and crashes", mins: 15, live: true, blurb: "2000, 2008, 2022: what happened, and how our AI & Tech Watch monitors it." },
  { id: 7, title: "Scams, hype, and your own brain", mins: 13, live: true, blurb: "Meme stocks, pump-and-dumps, FOMO, and how to protect yourself." },
  { id: 8, title: "Building your plan", mins: 15, live: true, blurb: "Goals, time horizon, and a one-page plan you can actually follow." }];

const GLOSSARY = [
  ["Share", "One unit of ownership in a company."], ["Index fund", "A fund that holds many stocks to track a market index."],
  ["Diversification", "Spreading money across many investments to reduce risk."], ["Dividend", "A payment some companies make to shareholders from profits."],
  ["Bull / bear market", "Prices rising broadly / falling 20%+ from a peak."], ["Volatility (VIX)", "How much prices swing. The VIX measures expected swings in the S&P 500."],
  ["Valuation (P/E)", "Price divided by earnings. High P/E means investors pay a lot per dollar of profit."], ["Drawdown", "How far a price has fallen from its recent high."]];

const HORIZONS = [
  ["Today", "News, earnings, and data releases that hit the market right now."], ["Tomorrow", "What is scheduled next and how positioning could react."],
  ["Next week", "Fed speakers, economic data, and earnings on the calendar."], ["Next month", "Rate decisions, earnings season, and trend shifts."],
  ["Next year", "Valuation, earnings growth, and the rate path. Largest uncertainty."]];
