// The AI-run practice portfolios (public). Three managers on the same stock list, from cautious to hedge-fund style; the numbers come from engine/ai_fund.py (data/ai_fund.json).
// Hypothetical money only. The replay before the live start date is a sanity check and is flattered by hindsight (see the page); only the live record counts.
let FUND = { level: "experienced", d: null };
const fdIso = (t) => new Date(Date.UTC(2000, 0, 1) + t * 864e5).toISOString().slice(0, 10);
const fdDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fdP = (v, d = 1) => (v == null ? "-" : (v > 0 ? "+" : "") + (v * 100).toFixed(d) + "%");
const fdC = (v) => (v > 0.0005 ? "var(--ok)" : v < -0.0005 ? "var(--bad)" : "var(--mut)");

function fdChart(L, d) {
  const W = 600, H = 220, top = 12, bot = 22, n = d.t.length, step = Math.max(1, Math.ceil(n / 260));
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const all = L.nav.concat(d.bench), lo = Math.min(...all), hi = Math.max(...all);
  const X = (i) => (i / (n - 1)) * W, Y = (v) => top + (1 - (v - lo) / (hi - lo || 1)) * (H - top - bot);
  const live0 = Math.max(0, d.t.findIndex((t) => fdIso(t) >= d.inception)), hasLive = live0 > 0 && live0 < n - 1;
  const line = (arr, from, to) => idx.filter((i) => i >= from && i <= to).map((i) => X(i).toFixed(1) + "," + Y(arr[i]).toFixed(1)).join(" ");
  const x0 = X(live0).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart: the practice manager's value over time against the S&amp;P 500" preserveAspectRatio="none" class="pf-chart" style="height:220px">
    <line x1="0" x2="${W}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <polyline points="${line(d.bench, 0, n - 1)}" fill="none" stroke="var(--mut)" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <polyline points="${line(L.nav, 0, hasLive ? live0 : n - 1)}" fill="none" stroke="var(--brand)" stroke-opacity="${hasLive ? 0.45 : 1}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"${hasLive ? ' stroke-dasharray="5 4"' : ""}/>
    ${hasLive ? `<polyline points="${line(L.nav, live0, n - 1)}" fill="none" stroke="var(--brand)" stroke-width="2.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><line x1="${x0}" x2="${x0}" y1="${top}" y2="${H - bot}" stroke="var(--ok)" stroke-dasharray="3 3"/><text x="${(+x0 - 4).toFixed(1)}" y="${top + 10}" text-anchor="end" class="pf-ax">live record starts</text>` : ""}
    <text x="4" y="${(Y(hi) + 11).toFixed(1)}" class="pf-ax">${hi.toFixed(0)}</text><text x="4" y="${(Y(lo) - 4).toFixed(1)}" class="pf-ax">${lo.toFixed(0)}</text></svg>
   <p class="small" style="margin:6px 0 0"><span style="color:var(--brand)">━</span> ${esc(L.label)} manager &nbsp; <span style="color:var(--mut)">━</span> S&amp;P 500 (price only) <span class="muted">(both start at 100 on ${esc(fdDate(d.start))}${hasLive ? "; faded = replay, solid = live" : ""})</span></p>`;
}

function fdStats(s, caveat) {
  if (!s) return "";
  const tile = (lab, v, sub) => `<div class="card" style="padding:12px"><div class="small muted">${lab}</div><b style="font-size:20px">${v}</b>${sub ? `<div class="small muted">${sub}</div>` : ""}</div>`;
  return `<div class="hz">${tile("Return", `<span style="color:${fdC(s.ret)}">${fdP(s.ret)}</span>`, `S&amp;P 500 ${fdP(s.bench)}`)}${tile("Worst drop from a peak", fdP(s.maxdd), `S&amp;P 500 ${fdP(s.bench_maxdd)}`)}
   ${s.vol != null ? tile("Ups and downs (a year)", (s.vol * 100).toFixed(0) + "%", `S&amp;P 500 ${(s.bench_vol * 100).toFixed(0)}%`) : ""}${s.beta != null ? tile("Moves with the market (beta)", s.beta.toFixed(2), "1.00 = same as the S&P 500") : ""}</div>`;
}

async function fundPage() {
  if (!FUND.d) FUND.d = await loadJson("ai_fund.json");
  const d = FUND.d;
  if (!d) return `<h1>Practice fund managers</h1><div class="card muted">The portfolios haven't been generated yet. They appear after the next nightly run.</div>`;
  const L = d.levels[FUND.level] || d.levels.experienced;
  afterRender.push(() => document.querySelectorAll("[data-fl]").forEach((b) => b.onclick = (e) => { e.preventDefault(); FUND.level = b.dataset.fl; state.keepScroll = true; route(); }));
  const liveDays = L.stats_live ? L.stats_live.days : 0, bySec = {}; L.holdings.forEach((h) => { bySec[h.sector] = (bySec[h.sector] || 0) + h.w; });
  const secs = Object.entries(bySec).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(typeof SECTOR_NAME === "function" ? SECTOR_NAME(k) : k)} ${(v * 100).toFixed(0)}%`).join(" · ");
  const rows = L.holdings.map((h) => `<tr><td><a href="#/stock/${esc(h.sym)}"><b>${esc(h.sym)}</b></a><div class="small muted">${esc(h.name)}</div></td><td>${(h.w * 100).toFixed(1)}%</td><td>${h.since ? esc(fdDate(h.since)) : "-"}</td>
    <td style="color:${fdC(h.ret)}">${fdP(h.ret)}</td><td class="small muted">${esc(h.why || "")}</td></tr>`).join("");
  const trade = (x) => `<tr><td class="small">${esc(fdDate(x.d))}</td><td><b style="color:${x.side === "buy" ? "var(--ok)" : "var(--bad)"}">${x.side === "buy" ? "Bought" : "Sold"}</b> <a href="#/stock/${esc(x.sym)}">${esc(x.sym)}</a></td><td>${(x.w * 100).toFixed(1)}%</td><td class="small muted">${esc(x.why || "")}</td></tr>`;
  const reg = L.regime;
  return `<h1>Practice fund managers</h1>
  <p class="muted" style="margin-top:0">Three managers working the same list of ${d.universe} large US companies, from cautious to hedge-fund style. Pretend money, long-only, a 0.1% cost on every trade. Run by a rules-based program, not a person, and not advice: use it to see how different styles of investing behave.</p>
  <div class="tabs">${["beginner", "intermediate", "experienced"].map((k) => `<a href="#" data-fl="${k}" class="${FUND.level === k ? "on" : ""}">${esc(d.levels[k].label)}</a>`).join("")}</div>
  <div class="card"><p style="margin:0 0 6px">${esc(L.blurb)}</p>
   <p class="small muted" style="margin:0">Invested ${((1 - L.cash) * 100).toFixed(0)}%, cash ${(L.cash * 100).toFixed(0)}%. The S&amp;P 500 is ${reg.down ? "<b>below</b>" : "above"} its 200-day average and its 3-month volatility is ${(reg.vol * 100).toFixed(0)}%. Next review: ${L.next_review ? esc(fdDate(L.next_review)) : "-"}.</p></div>
  <div class="card"><h3 style="margin:0 0 2px">Live record</h3>
   ${L.stats_live ? `<p class="small muted" style="margin:0 0 8px">Since ${esc(fdDate(d.inception))}, ${liveDays} trading days. Frozen night by night: past days are never rewritten.</p>${fdStats(L.stats_live)}` :
     `<p style="margin:0">The live record starts on <b>${esc(fdDate(d.inception))}</b>. Numbers appear after a week of trading. A fair judgement of any manager needs 6 to 12 months, including some weak weeks for the market.</p>`}</div>
  <div class="card"><h3 style="margin:0 0 2px">Value over time</h3><div style="margin-top:6px">${fdChart(L, d)}</div></div>
  <div class="card" style="border-left:4px solid var(--warn)"><h3 style="margin:0 0 4px">Why the replay can't be trusted</h3>
   <p class="small" style="margin:0 0 6px">Before ${esc(fdDate(d.inception))} this is a <b>replay</b>: the same rules run over past prices, using only prices known on each day and filling orders the next day. It is flattered in two ways. The stock list is today's largest companies, so stocks that went on to win are over-represented. And I chose the rules knowing how the last few years went.</p>
   <p class="small" style="margin:0 0 8px">So read the replay for <i>behaviour</i> (how big the drops were, how much it trades), not for the size of the return.</p>${fdStats(d.levels[FUND.level].stats_replay)}
   <p class="small muted" style="margin:8px 0 0">Replay from ${esc(fdDate(d.start))}. Price returns only: dividends are left out for the fund and the S&amp;P 500 alike. Idle cash earns a flat ${(d.rf * 100).toFixed(1)}% a year.</p></div>
  <div class="card"><h3 style="margin:0 0 2px">What it holds now</h3><p class="small muted" style="margin:0 0 8px">${secs || "No positions."}</p>
   <div class="tw"><table><tr><th>Stock</th><th>Weight</th><th>Bought</th><th>Since bought</th><th>Why it's here</th></tr>${rows || '<tr><td colspan="5" class="muted">Nothing held.</td></tr>'}</table></div></div>
  <div class="card"><h3 style="margin:0 0 4px">How this manager decides</h3><ul style="margin:0;padding-left:20px">${L.rules.map((r) => `<li class="small" style="margin:4px 0">${esc(r)}</li>`).join("")}</ul>
   <p class="small muted" style="margin:8px 0 0">The rules look only at prices (trend, volatility, distance from the high, the market's own trend). They don't read company scorecards or news, and there's no language model deciding trades. That keeps the replay free of hindsight in the signals and makes every trade explainable.</p></div>
  <div class="card"><h3 style="margin:0 0 4px">Trades</h3>${L.trades.length ? `<div class="tw"><table><tr><th>Date</th><th>Trade</th><th>New weight</th><th>Why</th></tr>${L.trades.slice().reverse().slice(0, 25).map(trade).join("")}</table></div>` : `<p class="small muted" style="margin:0">No live trades yet.</p>`}
   <details style="margin-top:8px"><summary class="small">Most recent replay trades</summary><div class="tw"><table><tr><th>Date</th><th>Trade</th><th>New weight</th><th>Why</th></tr>${L.replay_trades.slice().reverse().map(trade).join("")}</table></div></details></div>
  <p class="small muted">Hypothetical results have many limits. They don't reflect real trading, slippage, taxes or fees beyond the 0.1% assumed, and past results don't predict future ones. Not investment advice.</p>`;
}
