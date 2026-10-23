// Crypto (Markets > Crypto): market overview, Fear & Greed, how crypto behaves next to stocks, a top-coins table with live refresh, and a page for each coin.
// Facts and plain-English context only: no ratings, no price targets, no advice. Data: data/crypto.json (nightly + morning), live prices from CoinGecko's public API.
const CRYPTO = { timer: null, live: null };
const cgBig = (v) => (v == null ? "-" : v >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v).toLocaleString());
const cgPrice = (v) => (v == null ? "-" : "$" + (v >= 100 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 1 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v >= 0.01 ? v.toFixed(4) : v.toPrecision(3)));
const cgNum = (v) => (v == null ? "-" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v).toLocaleString());

function cgSpark(a, w = 110, h = 32) {
  if (!a || a.length < 3) return "";
  const lo = Math.min(...a), hi = Math.max(...a), rng = hi - lo || 1, up = a[a.length - 1] >= a[0];
  const pts = a.map((v, i) => ((i / (a.length - 1)) * w).toFixed(1) + "," + (h - 2 - ((v - lo) / rng) * (h - 4)).toFixed(1)).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="display:block"><polyline points="${pts}" fill="none" stroke="var(${up ? "--ok" : "--bad"})" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const cgFng = (v) => (v <= 24 ? ["Extreme fear", "var(--bad)"] : v <= 44 ? ["Fear", "var(--warn)"] : v <= 55 ? ["Neutral", "var(--mut)"] : v <= 75 ? ["Greed", "var(--ok)"] : ["Extreme greed", "var(--ok)"]);

function cgRows(coins, n) {
  return coins.slice(0, n).map((c) => `<tr><td class="muted">${c.rank}</td><td><a href="#/markets/crypto/${esc(c.sym)}"><b>${esc(c.name)}</b></a> <span class="small muted">${esc(c.sym)}</span>${c.stable ? ' <span class="pill" style="font-size:10px">stablecoin</span>' : ""}</td>
    <td>${cgPrice(c.price)}</td><td>${pctTxt(c.d1)}</td><td>${pctTxt(c.d7)}</td><td>${pctTxt(c.d30)}</td><td>${cgBig(c.cap)}</td><td>${cgSpark(c.spark, 90, 26)}</td></tr>`).join("");
}

function cryptoView(sub) {
  clearInterval(CRYPTO.timer);
  const d = state.crypto;
  if (!d) return `<div class="card muted">Crypto data isn't available right now.</div>`;
  if (sub && !["all", "stable"].includes(sub)) return coinView(decodeURIComponent(sub));
  const M = d.market, bh = d.behave, f = d.fng && d.fng[0], coins = d.coins, by = (s) => coins.find((c) => c.sym === s);
  const fv = f ? cgFng(f.v) : null, hist30 = (d.fng || []).slice().reverse();
  const list = sub === "stable" ? coins.filter((c) => c.stable) : coins, shown = sub === "all" || sub === "stable" ? list : list.slice(0, 25);
  const gain = d.gainers.map(by).filter((c) => c && c.d1 > 0), lose = d.losers.map(by).filter((c) => c && c.d1 < 0), none = `<p class="small muted" style="margin:6px 0 0">None in this group right now.</p>`;
  const mv = (c) => `<a class="item" href="#/markets/crypto/${esc(c.sym)}" style="align-items:center;color:inherit"><div style="flex:1"><b>${esc(c.name)}</b> <span class="small muted">${esc(c.sym)}</span><div class="small muted">${cgPrice(c.price)}</div></div><b>${pctTxt(c.d1)}</b></a>`;
  const stocks = d.stocks.map((s) => { const r = state.search && state.search.stocks.find((x) => x[0] === s.sym); return `<tr><td><a href="#/stock/${esc(s.sym)}"><b>${esc(s.sym)}</b></a> <span class="small muted">${esc(s.name)}</span></td><td class="small">${esc(s.kind)}</td><td>${r ? "$" + r[4] : '<span class="muted">-</span>'}</td><td>${r ? pctTxt(r[5]) : '<span class="muted">-</span>'}</td></tr>`; }).join("");
  const bhCards = bh ? `<div class="hz">
    <div class="card"><div class="small muted">Bitcoin's swings (yearly pace, last 90 days)</div><b style="font-size:22px">${bh.vol_btc_90 != null ? bh.vol_btc_90 + "%" : "-"}</b><div class="small muted">The S&amp;P 500's was ${bh.vol_spy_90 != null ? bh.vol_spy_90 + "%" : "-"}${bh.vol_eth_90 != null ? "; Ether's was " + bh.vol_eth_90 + "%" : ""}</div></div>
    <div class="card"><div class="small muted">Worst fall from a peak (about ${bh.years} years)</div><b style="font-size:22px;color:var(--bad)">${bh.maxdd_btc}%</b><div class="small muted">Bitcoin. The S&amp;P 500's was ${bh.maxdd_spy != null ? bh.maxdd_spy + "%" : "-"}</div></div>
    <div class="card"><div class="small muted">Moves with the Nasdaq-100 (last 90 days)</div><b style="font-size:22px">${bh.corr_qqq_90 != null ? bh.corr_qqq_90 : "-"}</b><div class="small muted">Over a year: ${bh.corr_qqq_365 != null ? bh.corr_qqq_365 : "-"}. Scale: -1 to +1</div></div>
    <div class="card"><div class="small muted">Moves with gold (last 90 days)</div><b style="font-size:22px">${bh.corr_gld_90 != null ? bh.corr_gld_90 : "-"}</b><div class="small muted">Over a year: ${bh.corr_gld_365 != null ? bh.corr_gld_365 : "-"}</div></div></div>
    <p class="small muted" style="margin:10px 0 0">"Moves with" is the correlation of daily changes: +1 means the two rise and fall together every day, 0 means no link, -1 means opposite. Bitcoin is often called "digital gold", but these numbers show how much it has actually behaved like gold, and how much like tech stocks, recently. The link changes over time, so treat it as a snapshot, not a rule.</p>` : `<p class="muted small">Not enough price history yet to compare with stocks.</p>`;
  afterRender.push(() => cryptoLive(sub));
  return `<div class="card big"><span class="pill g">Crypto</span><h2 style="margin-top:8px">The crypto market is worth <span id="cg-cap">${cgBig(M.cap)}</span> <span id="cg-capd" style="font-size:.7em">${pctTxt(M.cap_d1)}</span> <span class="small muted" style="font-weight:400">24h</span></h2>
    <div class="hz" style="margin-top:10px"><div class="card"><div class="small muted">Bitcoin's share</div><b style="font-size:20px">${M.btc_dom}%</b></div><div class="card"><div class="small muted">Ether's share</div><b style="font-size:20px">${M.eth_dom}%</b></div>
     <div class="card"><div class="small muted">Stablecoins' share</div><b style="font-size:20px">${M.stable_share}%</b><div class="small muted">${cgBig(M.stable_cap)}</div></div><div class="card"><div class="small muted">Traded in 24 hours</div><b style="font-size:20px">${cgBig(M.volume)}</b></div></div>
    <p class="small muted" style="margin:10px 0 0" id="cg-live">Snapshot from ${esc((d.generated || "").slice(0, 10))}. Prices below refresh by themselves while you stay on this page.</p></div>
  ${f ? `<div class="card"><h3>Fear &amp; Greed index</h3><div class="strip"><div><div class="num" style="font-size:44px;color:${fv[1]}">${f.v}</div><div><b>${fv[0]}</b></div></div>
    <div style="flex:1;min-width:220px"><div style="display:flex;align-items:flex-end;gap:2px;height:48px">${hist30.map((x) => `<i title="${x.v}" style="flex:1;background:${cgFng(x.v)[1]};opacity:.75;height:${Math.max(6, x.v)}%;border-radius:2px"></i>`).join("")}</div><div class="small muted" style="display:flex;justify-content:space-between"><span>30 days ago</span><span>today</span></div></div></div>
    <p class="small muted" style="margin:8px 0 0">A 0-100 mood gauge built from price swings, trading volume, social media activity and surveys (from alternative.me). Low means fear, high means greed. It describes the mood. It is not a signal to buy or sell, and the mood can stay extreme for months.</p></div>` : ""}
  <div class="card"><h3>How crypto behaves compared with stocks</h3>${bhCards}</div>
  <div class="cards"><div class="card" style="border-top:4px solid var(--ok)"><h3>Biggest risers today</h3><p class="small muted" style="margin:0 0 4px">Coins worth over $1B, last 24 hours, stablecoins left out.</p><div id="cg-gain">${gain.map(mv).join("") || none}</div></div>
   <div class="card" style="border-top:4px solid var(--bad)"><h3>Biggest fallers today</h3><p class="small muted" style="margin:0 0 4px">Same group.</p><div id="cg-lose">${lose.map(mv).join("") || none}</div></div></div>
  <div class="card"><h3>Top coins</h3><div class="tabs" style="margin:6px 0 10px">${[["", "Top 25"], ["all", "Top 100"], ["stable", "Stablecoins"]].map(([k, l]) => `<a class="${(sub || "") === k ? "on" : ""}" href="#/markets/crypto${k ? "/" + k : ""}">${l}</a>`).join("")}</div>
   <div class="tw"><table><tr><th>#</th><th>Coin</th><th>Price</th><th>24h</th><th>7d</th><th>30d</th><th>Market value</th><th>Last 7 days</th></tr><tbody id="cg-rows">${cgRows(shown, shown.length)}</tbody></table></div>
   <p class="small muted" style="margin:8px 0 0">Market value = price × coins in circulation. Tap a coin for its chart and details. Prices from CoinGecko.</p></div>
  <div class="card"><h3>Crypto in the stock market</h3><p class="small muted" style="margin:0 0 8px">You can get crypto exposure without owning coins: through funds that hold Bitcoin or Ether, and through companies whose business depends on crypto. These move with crypto but carry their own risks (company debt, fees, fund structure). Tap one for its stock page.</p>
   <div class="tw"><table><tr><th>Name</th><th>What it is</th><th>Price</th><th>Today</th></tr>${stocks}</table></div></div>
  <div class="card"><h3>Five things to know first</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>It swings far more than stocks.</b> Falls of 70% or more from a peak have happened more than once to Bitcoin, and smaller coins have often fallen further or disappeared. Only money you could afford to lose belongs here.</li>
   <li><b>There are no earnings to value it by.</b> A stock is a share of a business with profits. Most coins produce no cash flow, so their price rests on belief, adoption and supply. That is why this site shows no "fair value" line for crypto. See <a href="#/learn/5">Lesson 5</a> for how stocks are valued.</li>
   <li><b>You are your own bank.</b> Lose your keys or send coins to a wrong address and there is usually no way to get them back. Exchanges can also fail or be hacked.</li>
   <li><b>Scams are common.</b> Promised returns, "guaranteed" yields, celebrity giveaways and pressure to act fast are the standard signs. See <a href="#/learn/7">Lesson 7</a>.</li>
   <li><b>Rules are still changing, and taxes apply.</b> In the US, selling or spending crypto is generally a taxable event, and regulation differs by country and keeps shifting. Check current rules or ask a tax professional.</li></ul></div>
  <p class="small muted">${esc(d.source)}. Educational information only. Not investment advice. This site cannot buy or sell crypto for you.</p>`;
}

// Live prices: one public CoinGecko call, refreshed every minute while the Crypto page is open. Falls back silently to the nightly snapshot.
async function cryptoLive(sub) {
  const d = state.crypto; if (!d) return;
  const tick = async () => {
    if (!(location.hash || "").startsWith("#/markets/crypto") || (sub && !["all", "stable"].includes(sub))) { clearInterval(CRYPTO.timer); return; }
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,7d,30d");
      if (!r.ok) return;
      const rows = await r.json(), idx = {}; rows.forEach((x) => { idx[x.id] = x; });
      d.coins.forEach((c) => { const x = idx[c.id]; if (!x) return; c.price = x.current_price; c.cap = x.market_cap; c.vol = x.total_volume; c.d1 = x.price_change_percentage_24h_in_currency; c.d7 = x.price_change_percentage_7d_in_currency; c.d30 = x.price_change_percentage_30d_in_currency; });
      const el = document.querySelector("#cg-rows"); if (!el) return;
      const list = sub === "stable" ? d.coins.filter((c) => c.stable) : d.coins;
      el.innerHTML = cgRows(list, sub === "all" || sub === "stable" ? list.length : 25);
      const mover = d.coins.filter((c) => !c.stable && c.d1 != null && (c.cap || 0) >= 1e9).sort((a, b) => b.d1 - a.d1);
      const mv = (c) => `<a class="item" href="#/markets/crypto/${esc(c.sym)}" style="align-items:center;color:inherit"><div style="flex:1"><b>${esc(c.name)}</b> <span class="small muted">${esc(c.sym)}</span><div class="small muted">${cgPrice(c.price)}</div></div><b>${pctTxt(c.d1)}</b></a>`;
      const g = document.querySelector("#cg-gain"), l = document.querySelector("#cg-lose"); const none = `<p class="small muted" style="margin:6px 0 0">None in this group right now.</p>`; if (g) g.innerHTML = mover.filter((c) => c.d1 > 0).slice(0, 5).map(mv).join("") || none; if (l) l.innerHTML = mover.filter((c) => c.d1 < 0).slice(-5).reverse().map(mv).join("") || none;
      const lv = document.querySelector("#cg-live"); if (lv) lv.textContent = "Live prices, updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + ". Refreshes every minute.";
    } catch (e) {}
  };
  tick(); CRYPTO.timer = setInterval(tick, 60000);
}

async function coinView(symRaw) {
  const d = state.crypto, sym = symRaw.toUpperCase(), c = d.coins.find((x) => x.sym === sym);
  if (!c) return `<a href="#/markets/crypto" class="small">← Crypto</a><div class="card"><p>We don't track “${esc(symRaw)}” here. This page covers the 100 largest coins. <a href="#/markets/crypto/all">See them all</a>.</p></div>`;
  const ys = sym + "-USD";
  let h = c.hist ? await getHist(ys) : null, liveOhlc = null;
  if (!h && liveOK()) {   // not one of the stored coins: pull a year of daily prices on demand
    try { const j = await liveGet("action=chart&symbol=" + encodeURIComponent(ys) + "&range=1y"); if (j.c && j.c.length > 20) { h = { t: j.t.map(unixToDay), c: j.c }; if (j.o) liveOhlc = { t: h.t, o: j.o, h: j.h, l: j.l, c: j.c }; } } catch (e) {}
  }
  afterRender.push(() => { const box = $("#coinchart"); if (h && box) mountChart(box, h, { money: true, live: liveOK() ? liveChartFor(ys) : null, ohlcSym: liveOhlc ? null : (c.hist ? ys : null), ohlcData: liveOhlc }); });
  afterRender.push(() => fillHeadlines("#coinnews", c.name + " crypto", 5));
  const pct = (v) => (v == null ? "-" : pctTxt(v)), k = (a, b) => `<div class="card"><div class="small muted">${a}</div><b>${b}</b></div>`;
  const supplyPct = c.max_supply && c.supply ? Math.round((c.supply / c.max_supply) * 100) : null;
  const kind = c.stable
    ? `<p class="small" style="margin:0"><b>A stablecoin is built to hold one price, usually $1.</b> It is used to move money between crypto trades, not to grow. Risks: the issuer may not hold what it says, the coin can slip below $1 (it has happened), and rules for issuers are still being written. Its price here should barely move; if it does, that is the news.</p>`
    : `<p class="small" style="margin:0"><b>How to read this price.</b> A coin has no profits to value it by, so its price reflects what buyers will pay today. Look at how far it has fallen before (${c.ath_pct != null ? Math.abs(Math.round(c.ath_pct)) + "% below its all-time high" : "see the high above"}), how big it is (smaller coins swing more), and whether you understand what it is for. Not advice.</p>`;
  return `<a href="#/markets/crypto" class="small">← Crypto</a>
   <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><h1 style="margin:0">${esc(c.name)}</h1><div class="muted">${esc(c.sym)} · ranked #${c.rank} by market value${c.stable ? " · stablecoin" : ""}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:34px">${cgPrice(c.price)}</div><div>${pct(c.d1)} <span class="small muted">24h</span></div></div></div>
   <div class="card" style="margin-top:14px">${h ? '<div id="coinchart"></div>' : `<div class="strip"><div style="flex:1;min-width:200px">${cgSpark(c.spark, 360, 90)}</div><div class="small muted">Last 7 days.${liveOK() ? " A longer chart isn't available for this coin." : " Sign in for longer charts."}</div></div>`}</div>
   ${c.role ? `<div class="card"><h3>What it is</h3><p style="margin:0">${esc(c.role)}</p></div>` : ""}
   <div class="hz">${k("Market value", cgBig(c.cap))}${k("Traded in 24 hours", cgBig(c.vol))}${k("24h range", cgPrice(c.low24) + " – " + cgPrice(c.high24))}${k("1 hour", pct(c.h1))}${k("7 days", pct(c.d7))}${k("30 days", pct(c.d30))}${k("1 year", pct(c.y1))}
    ${k("All-time high", cgPrice(c.ath) + (c.ath_date ? `<div class="small muted">${esc(c.ath_date)} · ${pct(c.ath_pct)} from it</div>` : ""))}${k("In circulation", cgNum(c.supply) + (supplyPct != null ? `<div class="small muted">${supplyPct}% of the ${cgNum(c.max_supply)} that will ever exist</div>` : c.max_supply ? "" : '<div class="small muted">No fixed maximum</div>'))}</div>
   <div class="card">${kind}</div>
   <div class="card"><h3>Recent headlines</h3><div id="coinnews"><p class="small muted" style="margin:0">Loading…</p></div></div>
   <p class="small muted">Snapshot ${esc((d.generated || "").slice(0, 10))}${h ? "; the chart is live while the market moves (sign in for 1D and 1W). " : ". "}Prices from CoinGecko and Yahoo Finance. Educational information only. Not investment advice.</p>`;
}
