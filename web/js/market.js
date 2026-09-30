// Detail pages for the items on the Markets overview: indices, global markets, rates, currency, commodities, crypto.
const MARKET_INFO = {
  "^GSPC": { name: "S&P 500", group: "US index", etf: "SPY", lesson: 4, what: "The 500 largest US companies, weighted by size. It covers roughly 80% of the US stock market's value, so it's the standard gauge of how US stocks are doing.", read: "Up means large US companies, on average, became worth more. The biggest companies (mostly tech) move it the most." },
  "^DJI": { name: "Dow Jones Industrial Average", group: "US index", etf: "DIA", lesson: 2, what: "30 large, well-known US companies. Unusually, it's weighted by share price rather than company size, so a high-priced stock moves it more than a bigger, cheaper one.", read: "A quick read on big, established US companies. It's narrower and less tech-heavy than the S&P 500, so the two can diverge." },
  "^IXIC": { name: "Nasdaq Composite", group: "US index", etf: "QQQ", lesson: 6, what: "Over 3,000 stocks listed on the Nasdaq exchange. It is heavy in technology and growth companies, and tends to swing more than the S&P 500.", read: "When it beats the S&P 500, investors are favoring growth and tech. The QQQ fund tracks the related Nasdaq-100 index." },
  "^RUT": { name: "Russell 2000", group: "US index", etf: "IWM", lesson: 3, what: "2,000 smaller US companies ('small caps'). They are more tied to the US economy and to borrowing costs than giant multinationals.", read: "Strength here suggests confidence in the domestic economy; weakness often shows up when credit is tight." },
  "^FTSE": { name: "FTSE 100", group: "World index", etf: null, lesson: 3, what: "The 100 largest companies listed in London, heavy in energy, banks, mining and consumer goods. Many earn most of their money overseas.", read: "A gauge of UK-listed global companies more than of the UK economy itself." },
  "^STOXX50E": { name: "Euro Stoxx 50", group: "World index", etf: null, lesson: 3, what: "50 leading companies from countries that use the euro, such as France, Germany and the Netherlands.", read: "A snapshot of big eurozone businesses and of European economic sentiment." },
  "^N225": { name: "Nikkei 225", group: "World index", etf: null, lesson: 3, what: "225 large Japanese companies. It is price-weighted, like the Dow.", read: "Reflects Japanese exporters and the value of the yen: a weaker yen often lifts it." },
  "^HSI": { name: "Hang Seng Index", group: "World index", etf: null, lesson: 3, what: "The largest companies listed in Hong Kong, many of them Chinese.", read: "A window into Chinese and Hong Kong business sentiment, including property, finance and tech." },
  "^VIX": { name: "VIX (fear gauge)", group: "Volatility", etf: null, lesson: 5, kind: "level", what: "Measures how much the market expects the S&P 500 to swing over the next 30 days. It is calculated from the prices of S&P 500 options.", read: "Under about 15 is calm, 20 to 30 is nervous, and over 30 means real fear. It usually spikes when stocks fall fast. Our testing found that a <i>jump</i> in the VIX was more useful than a low reading." },
  "^TNX": { name: "10-Year Treasury yield", group: "Interest rates", etf: "TLT", lesson: 3, kind: "yield", what: "The interest rate the US government pays to borrow money for 10 years. It sets the baseline for mortgage rates and most other borrowing costs.", read: "Rising yields make safer bonds more attractive and can pressure stocks, especially expensive growth stocks. Falling yields usually ease that pressure." },
  "DX-Y.NYB": { name: "US Dollar Index", group: "Currency", etf: null, lesson: 2, what: "The dollar's value against a basket of major currencies (euro, yen, pound and others).", read: "A strong dollar makes US exports pricier and shrinks the overseas profits of US multinationals. A weak dollar tends to help them." },
  "CL=F": { name: "Crude oil (WTI)", group: "Commodity", etf: null, lesson: 3, what: "The price of a barrel of West Texas Intermediate crude oil.", read: "Oil feeds into inflation because it affects fuel and shipping costs. Rising oil helps energy companies and hurts airlines and consumers." },
  "GC=F": { name: "Gold", group: "Commodity", etf: "GLD", lesson: 3, what: "The price of an ounce of gold, traditionally a store of value.", read: "Investors often buy gold when they worry about inflation, currency weakness or turmoil. It doesn't pay interest, so rising yields can weigh on it." },
  "BTC-USD": { name: "Bitcoin", group: "Crypto", etf: null, lesson: 7, what: "The largest cryptocurrency. It is not backed by a company or government and trades around the clock.", read: "A barometer of appetite for speculative assets. It is extremely volatile and has fallen 70% or more several times. See Lesson 7 before treating it as an investment." }
};

async function marketPage(sym) {
  sym = decodeURIComponent(sym || "");
  const info = MARKET_INFO[sym];
  if (!info) return `<p>We couldn't find that market. <a href="#/markets">Back to Markets</a></p>`;
  const row = state.mk && ["indices", "global", "macro"].flatMap((g) => state.mk[g] || []).find((r) => r.symbol === sym);
  const h = await getHist(sym);
  const kind = info.kind || "price", isYield = kind === "yield";
  const last = h ? h.c[h.c.length - 1] : row ? row.last : null;
  if (last == null) return `<p>No data for ${esc(info.name)} right now. <a href="#/markets">Back to Markets</a></p>`;
  const spx = sym !== "^GSPC" && kind === "price" ? await getHist("^GSPC") : null;
  afterRender.push(() => { if (h) mountChart($("#mktchart"), h, { money: false, unit: isYield ? "yield" : "level", live: liveChartFor(sym), compare: spx ? { name: "S&P 500", data: spx } : null }); });
  const ret = (n) => { if (!h || h.c.length <= n) return null; const a = h.c[h.c.length - 1], b = h.c[h.c.length - 1 - n]; return isYield ? a - b : (a / b - 1) * 100; };
  const fmtR = (v) => v == null ? "-" : isYield ? `<span style="color:${v > 0 ? "var(--bad)" : v < 0 ? "var(--ok)" : "var(--mut)"};font-weight:600">${v > 0 ? "+" : ""}${v.toFixed(2)} pts</span>` : pctTxt(v);
  let stats = "";
  if (h) {
    const y = h.c.slice(-252);
    stats = `<div class="hz"><div class="card"><div class="small muted">52-week range</div><b>${Math.min(...y).toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${Math.max(...y).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
     <div class="card"><div class="small muted">1 month</div><b>${fmtR(ret(21))}</b></div><div class="card"><div class="small muted">3 months</div><b>${fmtR(ret(63))}</b></div>
     <div class="card"><div class="small muted">1 year</div><b>${fmtR(ret(252))}</b></div>${h.c.length > 400 ? `<div class="card"><div class="small muted">5 years</div><b>${fmtR(ret(h.c.length - 1))}</b></div>` : ""}</div>`;
  }
  return `<a href="#/markets" class="small">← Markets</a>
  <div style="margin-top:6px"><span class="pill">${esc(info.group)}</span><h1 style="margin:6px 0 0">${esc(info.name)}</h1></div>
  <div class="card" style="margin-top:14px">${h ? '<div id="mktchart"></div>' : `<div class="num" style="font-size:40px">${isYield ? last.toFixed(2) + "%" : last.toLocaleString()}</div>`}</div>${stats}
  <div class="card"><h3>What is it?</h3><p style="margin:0 0 10px">${info.what}</p><h3>How to read it</h3><p style="margin:0">${info.read}</p></div>
  ${info.etf ? `<div class="card"><h3>Want to follow it in practice?</h3><p class="small muted" style="margin:0 0 8px">You can't buy an index directly, but funds track it. <a href="#/stock/${info.etf}">${info.etf}</a> is a popular one, and you can try it in <a href="#/practice/trade/${info.etf}">practice trading</a>.</p></div>` : ""}
  <p class="small muted">Levels are closing values; 1D and 1W charts are live (about 15 minutes delayed) for signed-in users. New to this? <a href="#/learn/${info.lesson}">Lesson ${info.lesson}</a> explains the ideas. Educational only, not investment advice.</p>`;
}

// ---- link helpers: turn plain-text names/tickers into links so there are no dead ends ----
function nameLinkTable() {
  const out = [];
  const mk = state.mk || {};
  ["indices", "global", "macro"].forEach((g) => (mk[g] || []).forEach((r) => { out.push([r.name, "#/market/" + encodeURIComponent(r.symbol)]); }));
  Object.entries(MARKET_INFO).forEach(([sym, i]) => out.push([i.name, "#/market/" + encodeURIComponent(sym)]));
  (mk.sectors || []).forEach((r) => { const k = SECTOR_ETF_KEY[r.symbol]; if (k) out.push([r.name, "#/explore/" + k]); });
  if (state.sectors) state.sectors.sectors.forEach((s) => out.push([s.name, "#/explore/" + s.key]));
  return out.sort((a, b) => b[0].length - a[0].length);
}
function linkNames(text) {
  let html = esc(text); const held = [];
  const seen = new Set();
  for (const [name, href] of nameLinkTable()) {
    if (seen.has(name)) continue; seen.add(name);
    const en = esc(name);
    if (!html.includes(en)) continue;
    html = html.split(en).join("\u0000" + (held.push(`<a href="${href}">${en}</a>`) - 1) + "\u0000");
  }
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => held[+i]);
}
const LINKABLE_TICKERS = ["MSFT", "GOOGL", "AMZN", "META", "NVDA", "AVGO", "QQQ", "SMH"];
function linkTickers(text) {
  return esc(text).replace(new RegExp("\\b(" + LINKABLE_TICKERS.join("|") + ")\\b", "g"), (m) => `<a href="#/stock/${m}">${m}</a>`);
}
