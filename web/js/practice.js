// Paper trading: pretend money, real end-of-day prices, everything saved on this device only.
const START_CASH = 10000, BROAD = ["SPY", "VOO", "VTI", "VXUS"];
let P = null, storeOK = true, searchText = "", typeFilter = "all";
const sgn = (v, d = 2) => { if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0; return (v > 0 ? "+" : "") + v.toFixed(d); };
const colr = (v) => (v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)");
let _qMemo = null, _qSrc = null;
function liteFromSearch(r) { return { symbol: r[0], name: r[1], sector: (typeof SECTOR_NAME === "function" ? SECTOR_NAME(r[2]) : r[2]), price: r[4], date: state.quotes.date, d1: r[5], w1: null, m1: null, y1: null, lo52: null, hi52: null, etf: false, spark: [], lite: true }; }
function Q() {
  if (_qMemo && _qSrc === state.quotes) return _qMemo;
  const m = Object.fromEntries(((state.quotes && state.quotes.quotes) || []).map((q) => [q.symbol, q]));
  ((state.search && state.search.stocks) || []).forEach((r) => { if (!m[r[0]]) m[r[0]] = liteFromSearch(r); });
  _qSrc = state.quotes; return (_qMemo = m);
}

function loadP() {
  try { P = JSON.parse(localStorage.getItem("ml_paper") || "null"); } catch (e) { storeOK = false; }
  if (!P && state.quotes) {
    const spy = Q().SPY;
    P = { v: 1, start: state.quotes.date, cash: START_CASH, startSpy: spy ? spy.price : null, holdings: {}, trades: [], hist: [] };
    saveP();
  }
}
function saveP() { try { localStorage.setItem("ml_paper", JSON.stringify(P)); } catch (e) { storeOK = false; } }

function totals() {
  const q = Q(); let inv = 0, cost = 0;
  for (const [s, h] of Object.entries(P.holdings)) { const px = q[s] ? q[s].price : h.cost / h.sh; inv += h.sh * px; cost += h.cost; }
  return { inv, cost, cash: P.cash, total: P.cash + inv };
}
function recordHist() {
  const d = state.quotes.date, t = totals(), spy = Q().SPY, last = P.hist[P.hist.length - 1];
  const row = { d, v: Math.round(t.total * 100) / 100, spy: spy ? spy.price : null };
  if (last && last.d === d) P.hist[P.hist.length - 1] = row; else P.hist.push(row);
  saveP();
}
function weights() {
  const q = Q(), t = totals(), out = {};
  for (const [s, h] of Object.entries(P.holdings)) out[s] = h.sh * (q[s] ? q[s].price : h.cost / h.sh) / t.total;
  return out;
}

function goals() {
  const q = Q(), w = weights(), syms = Object.keys(P.holdings), t = totals();
  const sectors = new Set(syms.map((s) => q[s] && q[s].sector));
  return [
    ["Make your first trade", P.trades.length > 0, "Everyone starts somewhere.", null],
    ["Own 5 or more different holdings", syms.length >= 5, "One holding can ruin a portfolio; five starts to spread the risk.", 3],
    ["Spread across 3 or more sectors (a fund counts as one)", sectors.size >= 3, "Different sectors don't always fall together.", 3],
    ["No single position above 25% of your portfolio", syms.length > 0 && Math.max(...Object.values(w)) <= 0.25, "Concentration is how big losses happen (think Enron).", 3],
    ["Hold at least one broad market fund (SPY, VOO, VTI or VXUS)", syms.some((s) => BROAD.includes(s)), "Broad funds give instant diversification at low cost.", 4],
    ["Keep at least 5% in cash", P.trades.length > 0 && t.cash / t.total >= 0.05, "A cash buffer means you never have to sell in a panic.", 8],
    ["Write a reason for every trade", P.trades.length > 0 && P.trades.every((x) => x.note && x.note.trim().length > 3), "Writing it down is how you learn from mistakes and avoid FOMO.", 7],
  ];
}

function pTabs(cur) {
  return `<div class="tabs">${[["", "Portfolio"], ["trade", "Trade"], ["history", "History"], ["goals", "Goals"]].map(([k, l]) => `<a class="${cur === k ? "on" : ""}" href="#/practice${k ? "/" + k : ""}">${l}</a>`).join("")}</div>`;
}
const PNOTE = `<p class="small muted">Practice only: pretend money, no risk. Prices are each day's <b>closing</b> price and trades fill at the latest close, with no fees or bid-ask spread. Real trades fill at live prices and cost a little more. Saved on this device only.</p>`;

function practice(tab, arg) {
  if (!state.quotes) return `<h1>Practice</h1><div class="card muted">Price data isn't available right now. Try again in a little while.</div>`;
  loadP();
  if (!P) return `<h1>Practice</h1><div class="card muted">Couldn't start your practice account.</div>`;
  recordHist();
  const stale = (new Date() - new Date(state.quotes.date + "T12:00:00")) / 864e5 > 5;
  const head = `<h1>Practice trading</h1>${pTabs(tab || "")}${stale ? `<div class="card" style="border-left:4px solid var(--warn)"><p class="small" style="margin:0">Prices are from ${state.quotes.date} and may be out of date.</p></div>` : ""}${storeOK ? "" : `<div class="card"><p class="small" style="margin:0">Your browser is blocking storage, so progress won't be saved.</p></div>`}`;
  if (tab === "trade") return head + tradeView(arg);
  if (tab === "history") return head + historyView();
  if (tab === "goals") return head + goalsView();
  return head + portfolioView();
}

function portfolioView() {
  const q = Q(), t = totals(), w = weights(), ret = (t.total / START_CASH - 1) * 100, spy = q.SPY;
  const spyRet = spy && P.startSpy ? (spy.price / P.startSpy - 1) * 100 : null;
  const cards = `<div class="hz"><div class="card"><div class="small muted">Total value</div><div class="big2">${money(t.total)}</div></div>
   <div class="card"><div class="small muted">Return since start (${esc(P.start)})</div><div class="big2" style="color:${colr(Math.abs(ret) < 0.005 ? 0 : ret)}">${sgn(ret)}%</div></div>
   <div class="card"><div class="small muted">S&amp;P 500 (SPY) same period</div><div class="big2">${spyRet == null ? "-" : sgn(spyRet) + "%"}</div></div>
   <div class="card"><div class="small muted">Cash</div><div class="big2">${money(t.cash)}</div></div></div>`;
  let chart = `<div class="card"><h3>Your line vs the S&amp;P 500</h3><p class="small muted">Both start at 100. Your chart fills in as days pass. Come back after the next market day.</p></div>`;
  if (P.hist.length >= 2 && P.hist[0].spy) {
    const a = P.hist.map((h) => h.v / P.hist[0].v * 100), b = P.hist.map((h) => h.spy / P.hist[0].spy * 100);
    chart = `<div class="card"><h3>Your line vs the S&amp;P 500</h3>${svgLines([a, b], ["var(--brand)", "var(--unk)"], 120)}<p class="small"><span style="color:var(--brand)">━</span> you &nbsp;<span style="color:var(--unk)">━</span> S&amp;P 500 (both start at 100)</p></div>`;
  }
  const rows = Object.entries(P.holdings).sort((x, y) => (w[y[0]] || 0) - (w[x[0]] || 0)).map(([s, h]) => {
    const px = q[s] ? q[s].price : 0, val = h.sh * px, pl = val - h.cost;
    return `<tr><td><a href="#/practice/trade/${s}"><b>${esc(s)}</b></a><div class="small muted">${esc(q[s] ? q[s].name : "")}</div></td><td>${+h.sh.toFixed(4)}</td><td>$${(h.cost / h.sh).toFixed(2)}</td><td>$${px.toFixed(2)}</td><td>${money(val)}</td><td style="color:${colr(Math.abs(pl) < 0.5 ? 0 : pl)}">${Math.abs(pl) < 0.5 ? "" : pl > 0 ? "+" : "-"}${money(Math.abs(pl))}<div class="small">${sgn(pl / h.cost * 100)}%</div></td><td>${(w[s] * 100).toFixed(0)}%</td></tr>`;
  }).join("");
  const hold = rows ? `<div class="card"><h3>Holdings</h3><div class="tw"><table><tr><th>Holding</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Value</th><th>Gain/loss</th><th>Weight</th></tr>${rows}</table></div></div>`
    : `<div class="card"><h3>Start here</h3><p>You have ${money(START_CASH)} of pretend cash. Before you trade, skim <a href="#/learn/3">Lesson 3 (risk)</a> and <a href="#/learn/4">Lesson 4 (index funds)</a>. Then <a href="#/practice/trade">make your first trade</a>.</p></div>`;
  const bySector = {}; Object.entries(w).forEach(([s, x]) => { const k = q[s] ? q[s].sector : "Other"; bySector[k] = (bySector[k] || 0) + x; });
  if (t.cash > 0) bySector.Cash = t.cash / t.total;
  const pal = ["#5b4bff", "#22d3a6", "#f5a524", "#e5484d", "#3b82f6", "#a855f7", "#14b8a6", "#f97316", "#64748b", "#ec4899", "#84cc16", "#0ea5e9"];
  const secs = Object.entries(bySector).sort((x, y) => y[1] - x[1]);
  const alloc = `<div class="card"><h3>Where your money is</h3><div style="display:flex;height:16px;border-radius:9px;overflow:hidden">${secs.map(([k, v], i) => `<div title="${esc(k)} ${(v * 100).toFixed(0)}%" style="width:${v * 100}%;background:${pal[i % pal.length]}"></div>`).join("")}</div>
   <p class="small" style="margin-top:8px">${secs.map(([k, v], i) => `<span style="color:${pal[i % pal.length]}">●</span> ${esc(k)} ${(v * 100).toFixed(0)}%`).join(" &nbsp; ")}</p></div>`;
  const ins = [], top = Object.entries(w).sort((x, y) => y[1] - x[1])[0], g = goals();
  if (top && top[1] > 0.25) ins.push(`<b>${esc(top[0])} is ${(top[1] * 100).toFixed(0)}% of your portfolio.</b> A big single bet can sink you. See <a href="#/learn/3">Lesson 3</a>.`);
  if (Object.keys(P.holdings).length === 1 && !BROAD.includes(Object.keys(P.holdings)[0])) ins.push(`All your money is in one holding. What happens if it falls 50%? You'd need a 100% gain to recover.`);
  if (t.cash / t.total < 0.05 && P.trades.length) ins.push(`You're nearly fully invested. Real investors keep a cash buffer.`);
  const done = g.filter((x) => x[1]).length;
  ins.push(`Practice goals: <b>${done} of ${g.length}</b> done. <a href="#/practice/goals">See the list</a>.`);
  const insights = `<div class="card"><h3>What your portfolio is telling you</h3><ul style="margin:.3em 0 0;padding-left:20px">${ins.map((x) => `<li class="small">${x}</li>`).join("")}</ul></div>`;
  return `${cards}${chart}${hold}${alloc}${insights}${PNOTE}<button class="btn ghost" id="reset">Reset practice account</button>`;
}

function listRows() {
  const s = searchText.trim().toLowerCase(), q = s || typeFilter === "stock" ? Object.values(Q()) : state.quotes.quotes;
  const all = q.filter((x) => (typeFilter === "all" || (typeFilter === "etf") === x.etf) && (!s || x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)));
  return (all.length > 40 ? `<div class="small muted">Showing 40 of ${all.length}. Type in the search box to narrow it down.</div>` : "") + all
    .slice(0, 40).map((x) => `<a class="mod" href="#/practice/trade/${x.symbol}" style="padding:12px"><div class="t"><b>${esc(x.symbol)}</b> <span class="small muted">${esc(x.name)}</span><div class="small muted">${esc(x.sector)}</div></div>
    <div style="text-align:right"><b>$${x.price.toFixed(2)}</b><div class="small" style="color:${colr(x.d1)}">${x.d1 == null ? "" : sgn(x.d1) + "% today"}</div></div></a>`).join("") || `<div class="muted">No matches.</div>`;
}

function tradeView(sym) {
  const q = Q();
  if (!sym || !q[sym]) {
    return `<div class="ctl" style="grid-template-columns:1fr auto"><input id="ps" placeholder="Search a company or fund (Apple, SPY, bonds...)" value="${esc(searchText)}" style="padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:inherit">
     <select id="pf" style="padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:inherit"><option value="all">All</option><option value="stock" ${typeFilter === "stock" ? "selected" : ""}>Stocks</option><option value="etf" ${typeFilter === "etf" ? "selected" : ""}>Funds (ETFs)</option></select></div>
     <div class="mods" id="plist">${listRows()}</div><p class="small muted">Featured: ${state.quotes.quotes.length} well-known stocks and funds. Search to find any of ${(state.search ? state.search.stocks.length : 0).toLocaleString()} US-listed companies. New to funds? Read <a href="#/learn/4">Lesson 4</a>.</p>${PNOTE}`;
  }
  const x = q[sym], held = P.holdings[sym], t = totals();
  const span = x.hi52 - x.lo52, at = span ? (x.price - x.lo52) / span * 100 : 50;
  return `<a href="#/practice/trade" class="small">← All investments</a>
  <div class="card big"><span class="pill">${esc(x.sector)}</span>${x.etf ? '<span class="pill g">Fund</span>' : ""}<h2 style="margin-top:8px">${esc(x.name)} <span class="muted">(${esc(x.symbol)})</span></h2>
   <div class="strip"><div class="num" style="font-size:40px">$${x.price.toFixed(2)}</div><div class="small">${x.d1 != null ? `<span style="color:${colr(x.d1)}">${sgn(x.d1)}% today</span><br>` : ""}as of ${esc(x.date)} close</div></div>
   ${x.lite ? `<p class="small muted"><a href="#/stock/${esc(sym)}">See the full interactive chart and stats</a></p>` : `${svgLines([x.spark], ["var(--brand)"], 100)}
   <p class="small muted">Past 3 months. 1 week ${x.w1 == null ? "-" : sgn(x.w1) + "%"} · 1 month ${x.m1 == null ? "-" : sgn(x.m1) + "%"} · 1 year ${x.y1 == null ? "-" : sgn(x.y1) + "%"}</p>
   <div class="small muted">52-week range: $${x.lo52} to $${x.hi52}</div><div class="bar" style="margin:4px 0"><i style="width:${at.toFixed(0)}%"></i></div>`}
   ${held ? `<p class="small">You own ${+held.sh.toFixed(4)} shares (${money(held.sh * x.price)}).</p>` : ""}</div>
  <div class="card"><h3>Place a practice order</h3>
   <div class="tabs"><a href="#" id="sb" class="on">Buy</a><a href="#" id="ss">Sell</a></div>
   <div class="ctl"><label>Amount in <select id="mode"><option value="usd">dollars</option><option value="sh">shares</option></select>
   <input id="amt" type="number" min="0" step="any" placeholder="e.g. 500" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:inherit"></label>
   <label>Why are you making this trade? <span class="muted">(recommended)</span>
   <input id="why" maxlength="200" placeholder="e.g. Want broad diversification for the long term" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:inherit"></label></div>
   <div id="pv" class="small muted">Enter an amount to preview.</div><button class="btn" id="go" style="margin-top:12px">Place order</button><div id="err" class="small" style="color:var(--bad);margin-top:8px"></div>
   <p class="small muted" style="margin-top:10px">Cash available: ${money(t.cash)}. No shorting, margin or options: those are where beginners lose the most (see <a href="#/learn/7">Lesson 7</a>).</p></div>${PNOTE}`;
}

function wireTrade(sym) {
  const q = Q();
  if (!sym || !q[sym]) {
    const ps = $("#ps"), pf = $("#pf");
    if (ps) ps.oninput = () => { searchText = ps.value; $("#plist").innerHTML = listRows(); };
    if (pf) pf.onchange = () => { typeFilter = pf.value; $("#plist").innerHTML = listRows(); };
    return;
  }
  const x = q[sym]; let side = "buy";
  const calc = () => {
    const a = +$("#amt").value, mode = $("#mode").value;
    if (!(a > 0)) return null;
    const sh = mode === "usd" ? Math.floor(a / x.price * 10000) / 10000 : a;
    return { sh, usd: sh * x.price };
  };
  const preview = () => {
    const c = calc(), t = totals(), el = $("#pv"); $("#err").textContent = "";
    if (!c) { el.textContent = "Enter an amount to preview."; return; }
    let msg = `${side === "buy" ? "Buy" : "Sell"} ${+c.sh.toFixed(4)} shares for about ${money(c.usd)} at $${x.price.toFixed(2)}.`;
    if (side === "buy") {
      const held = P.holdings[sym] ? P.holdings[sym].sh * x.price : 0, wt = (held + c.usd) / t.total * 100;
      msg += ` This would make ${esc(sym)} ${wt.toFixed(0)}% of your portfolio.` + (wt > 25 && !x.etf ? ` <b style="color:var(--warn)">That's a lot in one company. See Lesson 3.</b>` : "");
    }
    el.innerHTML = msg;
  };
  $("#amt").oninput = preview; $("#mode").onchange = preview;
  $("#sb").onclick = (e) => { e.preventDefault(); side = "buy"; $("#sb").classList.add("on"); $("#ss").classList.remove("on"); preview(); };
  $("#ss").onclick = (e) => { e.preventDefault(); side = "sell"; $("#ss").classList.add("on"); $("#sb").classList.remove("on"); preview(); };
  $("#go").onclick = () => {
    const c = calc(), err = $("#err"); if (!c || c.sh <= 0) { err.textContent = "Enter an amount greater than zero."; return; }
    const cost = Math.round(c.sh * x.price * 100) / 100, h = P.holdings[sym];
    const note = $("#why").value.trim();
    if (side === "buy") {
      if (cost > P.cash + 0.005) { err.textContent = `Not enough cash: this costs ${money(cost)} and you have ${money(P.cash)}.`; return; }
      P.cash = Math.round((P.cash - cost) * 100) / 100;
      P.holdings[sym] = h ? { sh: h.sh + c.sh, cost: h.cost + cost } : { sh: c.sh, cost };
      P.trades.push({ t: new Date().toISOString(), d: state.quotes.date, sym, side, sh: c.sh, px: x.price, note });
    } else {
      if (!h || c.sh > h.sh + 1e-6) { err.textContent = `You only own ${h ? +h.sh.toFixed(4) : 0} shares of ${sym}. There's no short selling here.`; return; }
      const sh = Math.min(c.sh, h.sh), avg = h.cost / h.sh, proceeds = Math.round(sh * x.price * 100) / 100;
      P.cash = Math.round((P.cash + proceeds) * 100) / 100;
      if (h.sh - sh < 1e-6) delete P.holdings[sym]; else P.holdings[sym] = { sh: h.sh - sh, cost: h.cost - avg * sh };
      P.trades.push({ t: new Date().toISOString(), d: state.quotes.date, sym, side, sh, px: x.price, avg, note });
    }
    recordHist(); saveP(); location.hash = "#/practice";
  };
}

function historyView() {
  const q = Q();
  if (!P.trades.length) return `<div class="card"><p class="muted" style="margin:0">No trades yet. Your journal of decisions will appear here.</p></div>`;
  const rows = [...P.trades].reverse().map((t) => {
    const cur = q[t.sym] ? q[t.sym].price : t.px, since = (cur / t.px - 1) * 100;
    const extra = t.side === "sell" ? `Realized ${sgn((t.px / t.avg - 1) * 100)}% vs your average cost` : `Since then: ${sgn(since)}%`;
    return `<div class="item" style="display:block"><b>${t.side === "buy" ? "Bought" : "Sold"} ${+t.sh.toFixed(4)} ${esc(t.sym)}</b> at $${t.px.toFixed(2)} <span class="small muted">· ${esc(t.d)} · ${money(t.sh * t.px)}</span>
     <div class="small" style="color:${colr(t.side === "sell" ? t.px / t.avg - 1 : since)}">${extra}</div>${t.note ? `<div class="small muted">"${esc(t.note)}"</div>` : `<div class="small muted">No reason written.</div>`}</div>`;
  }).join("");
  return `<div class="card"><h3>Your trade journal</h3>${rows}</div><div class="try"><b>✋ Review habit</b>Pick your worst trade. Was the reason you wrote down still true when you were wrong? Did you buy because of a fact, or because of FOMO? (See <a href="#/learn/7">Lesson 7</a>.)</div>`;
}

function goalsView() {
  const g = goals(), n = g.filter((x) => x[1]).length;
  return `<div class="card"><div class="bar"><i style="width:${n / g.length * 100}%"></i></div><p class="small muted" style="margin:6px 0 0">${n} of ${g.length} goals complete</p></div>
  ${g.map(([t, ok, why, les]) => `<div class="card" style="display:flex;gap:12px;align-items:flex-start"><div class="dot" style="width:22px;height:22px;margin-top:2px;background:${ok ? "var(--ok)" : "var(--unk)"};color:#fff;display:grid;place-items:center;font-size:13px">${ok ? "✓" : ""}</div>
   <div><b>${esc(t)}</b><div class="small muted">${esc(why)}${les ? ` <a href="#/learn/${les}">Lesson ${les}</a>` : ""}</div></div></div>`).join("")}`;
}

function wirePractice(tab, arg) {
  if (tab === "trade") wireTrade(arg);
  const r = $("#reset");
  if (r) r.onclick = () => { if (confirm("Reset your practice account? This deletes your holdings and history on this device.")) { try { localStorage.removeItem("ml_paper"); } catch (e) {} P = null; route(); } };
}
