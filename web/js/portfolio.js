// Portfolio analysis (Practice > Demo portfolio, and Practice > Analysis for your own trades).
// A portfolio is just a list of dated buys and sells; everything else (value over time, returns, dividends, scorecard, valuations, updates) is worked out from real historical
// closing prices (data/hist), the company scorecards (data/score) and snapshots (data/snap). Hypothetical or practice money only: not advice.
const PF_DEMO_BUYS = [["MSFT", 9000, "2022-01-18"], ["AAPL", 8000, "2022-01-18"], ["XOM", 8000, "2022-02-09"], ["JPM", 8000, "2022-03-08"], ["JNJ", 7000, "2022-05-05"], ["GOOGL", 7000, "2022-06-16"],
  ["KO", 5000, "2022-08-02"], ["V", 6000, "2022-09-27"], ["NVDA", 5000, "2022-10-14"], ["AMZN", 6000, "2022-11-10"], ["LLY", 6000, "2023-01-12"], ["LIN", 6000, "2023-03-02"],
  ["NEE", 5000, "2023-06-14"], ["CAT", 6000, "2023-09-07"], ["PLD", 7000, "2024-03-12"]];
const PF_DEMO_SELLS = [["NVDA", 0.4, "2024-06-20"]];   // sell this fraction of what was held that day
const PF_COLORS = ["#5b4bff", "#22d3a6", "#f5a524", "#3b82f6", "#e5484d", "#a855f7", "#14b8a6", "#f97316", "#64748b"];
const PF = { R: null, S: {}, N: {}, sel: null, tab: "holdings", range: "All", mine: false };

const pfDay = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 864e5);
const pfIso = (d) => new Date(Date.UTC(2000, 0, 1) + d * 864e5).toISOString().slice(0, 10);
const pfDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const pfM = (v, d = 0) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pfS = (v) => (v > 0 ? "+" : v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const pfP = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d) + "%";
const pfC = (v) => (v > 0.0005 ? "var(--ok)" : v < -0.0005 ? "var(--bad)" : "var(--mut)");

function pfPx(h, day) {   // close on or before `day`
  let lo = 0, hi = h.t.length - 1, a = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (h.t[m] <= day) { a = m; lo = m + 1; } else hi = m - 1; }
  return h.c[a < 0 ? 0 : a];
}
function pfXirr(flows) {   // money-weighted annual return; negative amounts = money in
  if (flows.length < 2) return null;
  const d0 = flows[0].d, f = (r) => flows.reduce((s, x) => s + x.a / Math.pow(1 + r, (x.d - d0) / 365), 0);
  let lo = -0.95, hi = 10; if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

// ---- load everything the portfolio needs ----
async function pfLoadData(syms) {
  const base = DATA_BASE || "data/", H = {}, S = {}, N = {};
  await Promise.all([...syms.map(async (s) => { const h = await getHist(s); if (h) H[s] = h; }), ...syms.map(async (s) => { S[s] = await loadScore(s); }),
    ...syms.map(async (s) => { try { const r = await fetch(base + "snap/" + encodeURIComponent(s) + ".json"); if (r.ok) N[s] = await r.json(); } catch (e) {} }),
    (async () => { const g = await getHist("^GSPC"); if (g) H["^GSPC"] = g; })()]);
  return { H, S, N };
}

// events: [{sym, day, side:'buy'|'sell', sh, px}] sorted by day
function pfCompute(events, H) {
  events.sort((a, b) => a.day - b.day);
  const cal = H["^GSPC"], first = events[0].day, days = cal.t.filter((d) => d >= first);
  const syms = [...new Set(events.map((e) => e.sym))], pos = {}, layers = {}, flowAt = {};
  syms.forEach((s) => { pos[s] = { sh: 0, cost: 0, realized: 0, soldCost: 0, firstDay: null, buys: 0 }; layers[s] = new Array(days.length).fill(0); });
  const total = new Array(days.length).fill(0), costArr = new Array(days.length).fill(0), flow = new Array(days.length).fill(0);
  let ei = 0;
  const px = {}; syms.forEach((s) => { px[s] = H[s] ? days.map((d) => pfPx(H[s], d)) : null; });
  for (let i = 0; i < days.length; i++) {
    while (ei < events.length && events[ei].day <= days[i]) {
      const e = events[ei++], p = pos[e.sym];
      if (e.side === "buy") { p.sh += e.sh; p.cost += e.sh * e.px; p.buys += 1; if (p.firstDay == null) p.firstDay = e.day; flow[i] += e.sh * e.px; }
      else { const avg = p.sh ? p.cost / p.sh : e.px, sh = Math.min(e.sh, p.sh); p.realized += (e.px - avg) * sh; p.soldCost += avg * sh; p.cost -= avg * sh; p.sh -= sh; flow[i] -= sh * e.px; }
    }
    let v = 0, c = 0;
    for (const s of syms) { const price = px[s] ? px[s][i] : (pos[s].sh ? pos[s].cost / pos[s].sh : 0), val = pos[s].sh * price; layers[s][i] = val; v += val; c += pos[s].cost; }
    total[i] = v; costArr[i] = c;
  }
  const L = days.length - 1, last = {};
  syms.forEach((s) => { last[s] = px[s] ? px[s][L] : (pos[s].sh ? pos[s].cost / pos[s].sh : 0); });
  const order = syms.filter((s) => pos[s].sh > 0.0000001).sort((a, b) => layers[b][L] - layers[a][L]);
  syms.filter((s) => !order.includes(s)).forEach((s) => order.push(s));
  const groups = order.slice(0, 8).map((s, i) => ({ key: s, label: s, color: PF_COLORS[i], vals: layers[s] }));
  if (order.length > 8) groups.push({ key: "Other", label: "Other", color: PF_COLORS[8], vals: days.map((_, i) => order.slice(8).reduce((a, s) => a + layers[s][i], 0)) });
  // time-weighted index (ignores when money was added) vs the S&P 500
  const twr = [100];
  for (let i = 1; i < days.length; i++) { const prev = total[i - 1]; twr.push(twr[i - 1] * (1 + (prev > 0 ? (total[i] - flow[i] - prev) / prev : 0))); }
  const gs = days.map((d) => pfPx(cal, d)), mkt = gs.map((v) => (v / gs[0]) * 100);
  const flows = []; events.forEach((e) => flows.push({ d: e.day, a: e.side === "buy" ? -e.sh * e.px : e.sh * e.px }));
  flows.push({ d: days[L], a: total[L] });
  const hold = Object.fromEntries(syms.map((s) => [s, { ...pos[s], price: last[s], value: pos[s].sh * last[s] }]));
  return { days, syms, order, pos: hold, total, cost: costArr, groups, twr, mkt, irr: pfXirr(flows), events, L, hasHist: (s) => !!H[s] };
}

// What the same money would be worth if every purchase (and sale) had gone into the S&P 500 instead, on the same days.
function pfBench(R) {
  if (R.bench) return R.bench;
  const flow = new Array(R.days.length).fill(0);
  R.events.forEach((e) => { let i = R.days.findIndex((d) => d >= e.day); if (i < 0) return; flow[i] += e.side === "buy" ? e.sh * e.px : -e.sh * e.px; });
  const out = []; let prev = 0;
  for (let i = 0; i < R.days.length; i++) { const g = i ? R.mkt[i] / R.mkt[i - 1] : 1; prev = Math.max(0, prev * g + flow[i]); out.push(prev); }
  return (R.bench = out);
}

// ---- small views ----
const pfName = (s) => { const q = (typeof Q === "function" && Q()[s]) || null, r = state.search && state.search.stocks.find((x) => x[0] === s); return (q && q.name) || (r && r[1]) || s; };
const pfSector = (s) => { const r = state.search && state.search.stocks.find((x) => x[0] === s); return r ? r[2] : null; };
const pfD1 = (s) => { const q = (typeof Q === "function" && Q()[s]) || null; return q && q.d1 != null ? q.d1 : 0; };

function pfStackSvg(R, from) {
  const to = R.L, n = to - from + 1, step = Math.max(1, Math.ceil(n / 240)), idx = [];
  for (let i = from; i <= to; i += step) idx.push(i);
  if (idx[idx.length - 1] !== to) idx.push(to);
  const W = 600, H = 240, top = 10, bot = 22, maxV = Math.max(1, ...idx.map((i) => R.total[i]), ...idx.map((i) => R.cost[i])) * 1.08;
  const X = (k) => (k / (idx.length - 1)) * W, Y = (v) => top + (1 - v / maxV) * (H - top - bot);
  let acc = idx.map(() => 0);
  const paths = R.groups.map((g) => { const lower = acc, upper = acc.map((a, k) => a + g.vals[idx[k]]);
    const d = "M" + upper.map((v, k) => X(k).toFixed(1) + "," + Y(v).toFixed(1)).join(" L") + " L" + lower.map((v, k) => X(k).toFixed(1) + "," + Y(v).toFixed(1)).reverse().join(" L") + " Z"; acc = upper;
    return `<path d="${d}" fill="${g.color}" fill-opacity=".88"/>`; }).join("");
  const costLine = `<polyline points="${idx.map((i, k) => X(k).toFixed(1) + "," + Y(R.cost[i]).toFixed(1)).join(" ")}" fill="none" stroke="var(--tx)" stroke-width="1.8" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => { return `<line x1="0" x2="${W}" y1="${Y(maxV * f).toFixed(1)}" y2="${Y(maxV * f).toFixed(1)}" stroke="var(--line)"/>`; }).join("");
  const labs = [0.25, 0.5, 0.75].map((f) => `<text x="4" y="${(Y(maxV * f) - 3).toFixed(1)}" class="pf-ax">${pfM(maxV * f / 1000)}K</text>`).join("");
  const xl = [0, 0.33, 0.66, 1].map((f) => { const k = Math.round(f * (idx.length - 1)), a = f === 0 ? "start" : f === 1 ? "end" : "middle"; return `<text x="${X(k).toFixed(1)}" y="${H - 5}" text-anchor="${a}" class="pf-ax">${pfDate(pfIso(R.days[idx[k]])).replace(/, /, " ")}</text>`; }).join("");
  return { svg: `<svg id="pfsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pf-chart">${ticks}${paths}${costLine}<line id="pfx" y1="0" y2="${H}" stroke="var(--tx)" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/>${labs}${xl}</svg>`, idx };
}
// "Value over time" chart: stacked by holding, sized to its container so text stays sharp, with a hover tooltip listing the day's value, cost basis, gain and each holding.
function pfDrawStack(box, from) {
  const wrap = box.querySelector("#pfchw"); if (!wrap) return;
  const R = PF.R, W = Math.max(300, Math.min(820, Math.round(wrap.clientWidth || 600))), H = Math.round(Math.max(260, W * 0.46)), pad = { l: W < 480 ? 46 : 54, r: 12, t: 12, b: 28 };
  const to = R.L, n0 = to - from + 1, step = Math.max(1, Math.ceil(n0 / 260)), idx = []; for (let i = from; i <= to; i += step) idx.push(i); if (idx[idx.length - 1] !== to) idx.push(to);
  const B = pfBench(R), peak = Math.max(1, ...idx.map((i) => R.total[i]), ...idx.map((i) => R.cost[i]), ...idx.map((i) => B[i])), nice = (() => { const r = (peak * 1.06) / 4, p = Math.pow(10, Math.floor(Math.log10(r))); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= r) || r; })(), maxV = nice * 4;
  const X = (k) => pad.l + (k / Math.max(1, idx.length - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);
  const short = (v) => (v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M" : v >= 1000 ? "$" + (v / 1000).toFixed(v % 1000 ? 1 : 0).replace(/\.0$/, "") + "K" : "$" + Math.round(v));
  let acc = idx.map(() => 0);
  const paths = R.groups.map((g) => { const lower = acc, upper = acc.map((a, k) => a + g.vals[idx[k]]);
    const d = "M" + upper.map((v, k) => X(k).toFixed(1) + "," + Y(v).toFixed(1)).join(" L") + " L" + lower.map((v, k) => X(k).toFixed(1) + "," + Y(v).toFixed(1)).reverse().join(" L") + " Z"; acc = upper;
    return `<path d="${d}" fill="${g.color}" fill-opacity=".9" stroke="var(--card)" stroke-width=".7"/>`; }).join("");
  const top = idx.map((i, k) => X(k).toFixed(1) + "," + Y(R.total[i]).toFixed(1)).join(" "), cost = idx.map((i, k) => X(k).toFixed(1) + "," + Y(R.cost[i]).toFixed(1)).join(" ");
  const grid = [0, 1, 2, 3, 4].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(nice * f).toFixed(1)}" y2="${Y(nice * f).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 7}" y="${(Y(nice * f) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--mut)">${short(nice * f)}</text>`).join("");
  const kx = Math.min(W < 480 ? 3 : 4, idx.length - 1), xl = Array.from({ length: kx + 1 }, (_, j) => Math.round((j / Math.max(1, kx)) * (idx.length - 1))).map((k, j, a) => `<text x="${X(k).toFixed(1)}" y="${H - 8}" text-anchor="${j === 0 ? "start" : j === a.length - 1 ? "end" : "middle"}" font-size="11" fill="var(--mut)">${esc(pfDate(pfIso(R.days[idx[k]])).replace(/, /, " "))}</text>`).join("");
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="pf-svg" role="img" aria-label="Value of your portfolio over time">${grid}${xl}${paths}<polyline points="${top}" fill="none" stroke="var(--tx)" stroke-width="1.6" stroke-linejoin="round" opacity=".55"/>
    <polyline points="${cost}" fill="none" stroke="var(--tx)" stroke-width="2" stroke-dasharray="1.5 4" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${idx.map((i, k) => X(k).toFixed(1) + "," + Y(B[i]).toFixed(1)).join(" ")}" fill="none" stroke="var(--card)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    <polyline points="${idx.map((i, k) => X(k).toFixed(1) + "," + Y(B[i]).toFixed(1)).join(" ")}" fill="none" stroke="var(--tx)" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="pf-g" style="display:none"><line y1="${pad.t}" y2="${H - pad.b}" stroke="var(--tx)" opacity=".45"/><circle r="5" fill="var(--card)" stroke="var(--tx)" stroke-width="2"/></g>
    <rect class="pf-hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent" style="touch-action:pan-y"/></svg><div class="pf-tip" hidden></div>`;
  const svg = wrap.querySelector("svg"), tip = wrap.querySelector(".pf-tip"), g = svg.querySelector(".pf-g"), hit = svg.querySelector(".pf-hit");
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * W, f = Math.min(1, Math.max(0, (x - pad.l) / (W - pad.l - pad.r))), k = Math.round(f * (idx.length - 1)), i = idx[k], px = X(k);
    g.style.display = ""; const ln = g.querySelector("line"); ln.setAttribute("x1", px); ln.setAttribute("x2", px); const c = g.querySelector("circle"); c.setAttribute("cx", px); c.setAttribute("cy", Y(R.total[i]));
    const rows = R.groups.filter((gr) => gr.vals[i] > 0.5).sort((a, b) => b.vals[i] - a.vals[i]).slice(0, 6).map((gr) => `<div class="pf-tr"><span><i style="background:${gr.color}"></i>${esc(gr.label)}</span><b>${pfM(gr.vals[i])}</b></div>`).join("");
    const gain = R.total[i] - R.cost[i];
    tip.innerHTML = `<b>${esc(pfDate(pfIso(R.days[i])))}</b><div class="pf-tr big"><span>Value</span><b>${pfM(R.total[i])}</b></div><div class="pf-tr"><span>Cost basis</span><b>${pfM(R.cost[i])}</b></div><div class="pf-tr"><span>Gain</span><b style="color:${pfC(gain)}">${pfS(gain)}</b></div><div class="pf-tr"><span>S&amp;P 500 (same money)</span><b>${pfM(B[i])}</b></div><div class="pf-sep"></div>${rows}`;
    tip.hidden = false; const tw = tip.offsetWidth, left = (px / W) * r.width, right = left + 14 + tw > r.width; tip.style.left = Math.max(4, right ? left - tw - 14 : left + 14) + "px";
  };
  const leave = () => { g.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave);
}
function pfLines(series, colors, labels) {   // 2 or more normalized lines (start = 100)
  const W = 600, H = 200, top = 12, bot = 22, all = series.flat(), lo = Math.min(...all), hi = Math.max(...all), n = series[0].length, step = Math.max(1, Math.ceil(n / 240));
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const X = (k) => (k / (idx.length - 1)) * W, Y = (v) => top + (1 - (v - lo) / (hi - lo || 1)) * (H - top - bot);
  const y100 = Y(100);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pf-chart" style="height:200px"><line x1="0" x2="${W}" y1="${y100.toFixed(1)}" y2="${y100.toFixed(1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
    ${series.map((s, j) => `<polyline points="${idx.map((i, k) => X(k).toFixed(1) + "," + Y(s[i]).toFixed(1)).join(" ")}" fill="none" stroke="${colors[j]}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("")}
    <text x="4" y="${(Y(hi) + 11).toFixed(1)}" class="pf-ax">${hi.toFixed(0)}</text><text x="4" y="${(Y(lo) - 4).toFixed(1)}" class="pf-ax">${lo.toFixed(0)}</text></svg>
   <p class="small" style="margin:6px 0 0">${labels.map((l, j) => `<span style="color:${colors[j]}">━</span> ${l}`).join(" &nbsp; ")} <span class="muted">(both start at 100)</span></p>`;
}

function pfAgg() {
  const R = PF.R, S = PF.S, ax = {}, w = {}, keys = ["value", "growth", "profit", "health", "payout"];
  const totalV = R.syms.reduce((a, s) => a + R.pos[s].value, 0) || 1;
  keys.forEach((k) => { let sum = 0, wt = 0; R.syms.forEach((s) => { const a = S[s] && S[s].axes[k]; if (a != null && R.pos[s].value > 0) { sum += a * R.pos[s].value; wt += R.pos[s].value; } }); ax[k] = wt > 0 ? Math.round(sum / wt) : null; });
  let rew = 0, risk = 0, bad = 0;
  R.syms.forEach((s) => { if (S[s] && R.pos[s].value > 0) { rew += S[s].rewards.length; risk += S[s].risks.length; bad += S[s].risks.filter((r) => r.k === "bad").length; } });
  return { axes: ax, rew, risk, bad, totalV };
}
function pfSummary(ax) {
  const names = { value: "reasonably priced holdings", growth: "growth", profit: "profitability", health: "balance-sheet strength", payout: "shareholder payouts" }, have = Object.entries(ax).filter(([, v]) => v != null);
  if (have.length < 3) return "";
  const hi = have.slice().sort((a, b) => b[1] - a[1])[0], lo = have.slice().sort((a, b) => a[1] - b[1])[0];
  return `Strongest on ${names[hi[0]]} (${hi[1]}); weakest on ${names[lo[0]]} (${lo[1]}).`;
}

function pfHeader(R, agg) {
  const t = R.total[R.L], cost = R.cost[R.L], unreal = t - cost;
  let d1 = 0; R.syms.forEach((s) => { const v = R.pos[s].value, p = pfD1(s); d1 += v - v / (1 + p / 100); });
  const realized = R.syms.reduce((a, s) => a + R.pos[s].realized, 0), soldCost = R.syms.reduce((a, s) => a + R.pos[s].soldCost, 0), totalRet = unreal + realized;
  const n = R.syms.filter((s) => R.pos[s].sh > 0.0000001).length;
  const B = pfBench(R), bv = B[R.L], ahead = t - bv, totPct = R.events.length ? totalRet / (cost + soldCost || 1) * 100 : 0, bPct = cost + soldCost ? (bv - (cost + soldCost)) / (cost + soldCost) * 100 : 0;
  return `<div class="pc-head" style="margin-top:6px"><div><div class="small muted">Total value · ${n} holdings</div><b class="pc-big">${pfM(t)}</b> <span style="color:${pfC(totalRet)};font-weight:700">${pfS(totalRet)} (${pfP(totPct)})</span></div>
    <div class="pc-vs"><div class="small muted">Same money in the S&amp;P 500</div><b>${pfP(bPct)}</b> <span class="small" style="color:${pfC(ahead)}">${ahead >= 0 ? "you're ahead by " : "you're behind by "}${pfM(Math.abs(ahead))}</span></div></div>
    <div class="pf-stats" style="margin-top:10px"><div><b style="color:${pfC(d1)}">${pfS(d1)}</b><span>1-day return <i style="color:${pfC(d1)}">${pfP(t - d1 > 0 ? d1 / (t - d1) * 100 : 0, 2)}</i></span></div><div><b>${R.irr == null ? "-" : pfP(R.irr * 100)}</b><span>Annualized (IRR)</span></div><div><b>${pfM(cost)}</b><span>Cost basis</span></div><div><b>${R.events.length}</b><span>Trades</span></div></div>`;
}
function pfDivs(s) {   // dividends per share over the last year: from the snapshot's payment history when we have it, else the filings-based yield on the scorecard; plus the next ex-dividend date
  const rows = (PF.N[s] && PF.N[s].dividends) || [], today = new Date(), yr = new Date(today - 365 * 864e5);
  const parsed = rows.map((d) => { const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(d.ex || ""); return m && d.amount ? { date: new Date(+m[3], +m[1] - 1, +m[2]), amount: d.amount } : null; }).filter(Boolean);
  const past = parsed.filter((d) => d.date <= today && d.date > yr), upcoming = parsed.filter((d) => d.date > today);
  let perShare = past.reduce((a, d) => a + d.amount, 0);
  if (!perShare) { const sc = PF.S[s], y = sc && sc.sec && sc.sec.dividend ? sc.sec.dividend.yield_pct : 0, px = PF.R && PF.R.pos[s] ? PF.R.pos[s].price : 0; perShare = px * (y || 0) / 100; }
  return { perShare, upcoming: upcoming[upcoming.length - 1] || null };
}

function pfRender() {
  const R = PF.R, agg = pfAgg(), box = document.querySelector("#pfroot"); if (!box) return;
  const rangeDays = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "2Y": 730, All: 1e9 }, ytd = new Date().getFullYear();
  const from = (() => { if (PF.range === "All") return 0; if (PF.range === "YTD") { const j = R.days.findIndex((d) => new Date(pfIso(d)).getUTCFullYear() === ytd); return Math.max(0, j - 1); } const cut = R.days[R.L] - rangeDays[PF.range]; const j = R.days.findIndex((d) => d >= cut); return Math.max(0, j); })();
  const rewards = agg.rew, risks = agg.risk;
  const unreal = R.total[R.L] - R.cost[R.L], realized = R.syms.reduce((a, s) => a + R.pos[s].realized, 0), soldCost = R.syms.reduce((a, s) => a + R.pos[s].soldCost, 0);
  let divYr = 0, divRec = 0; R.syms.forEach((s) => { const d = pfDivs(s); divYr += d.perShare * R.pos[s].sh; });
  const tiles = `<div class="pf-tiles"><div><span>Unrealized returns</span><b>${pfS(unreal)}</b><i style="color:${pfC(unreal)}">${pfP(R.cost[R.L] ? unreal / R.cost[R.L] * 100 : 0)}</i></div>
    <div><span>Realized returns</span><b>${pfS(realized)}</b><i style="color:${pfC(realized)}">${soldCost ? pfP(realized / soldCost * 100) : "No sales yet"}</i></div>
    <div><span>Dividends, last 12 months</span><b>${pfM(divYr)}</b><i class="muted">${R.total[R.L] ? (divYr / R.total[R.L] * 100).toFixed(1) : 0}% of value</i></div>
    <div><span>Cost basis</span><b>${pfM(R.cost[R.L])}</b><i class="muted">what you paid for what you hold</i></div></div>`;
  const top = `<div class="pf-top"><div class="card"><div class="tabs" style="margin:0 0 8px"><a class="on" href="#" onclick="return false">Value over time</a></div>${pfHeader(R, agg)}
      <div class="pc-ranges" id="pfrange">${["1M", "3M", "YTD", "1Y", "2Y", "All"].map((r) => `<button data-r="${r}" class="btn ghost ${PF.range === r ? "on" : ""}">${r}</button>`).join("")}</div>
      <div class="chw" id="pfchw" style="position:relative;min-height:260px;margin-top:6px"></div>
      <div class="pf-legend" style="margin-top:8px">${R.groups.map((g) => `<span><i style="background:${g.color}"></i>${esc(g.label)}</span>`).join("")}<span><u></u>Cost basis</span><span><u class="dash"></u>S&amp;P 500 (same money)</span></div></div>
    <div class="card"><h3 style="margin:0 0 2px">Portfolio scorecard</h3><p class="small muted" style="margin:0">Each holding's five scores, averaged by how much of your money is in it.</p>${radarSvg(Object.fromEntries(Object.entries(agg.axes)))}
      <p class="small" style="text-align:center;margin:0 0 8px"><b>${esc(pfSummary(agg.axes))}</b></p>
      <div class="pf-badges"><span class="bad">! ${risks} risks</span><span class="good">★ ${rewards} rewards</span><span class="muted">${R.syms.length} holdings</span></div></div></div>`;
  const tabs = [["holdings", "Holdings"], ["analysis", "Analysis"], ["valuations", "Valuations"], ["dividends", "Dividends"], ["returns", "Returns"], ["updates", "Updates"]];
  box.innerHTML = `${top}${tiles}<div class="tabs pf-tabs">${tabs.map(([k, l]) => `<a href="#" data-pt="${k}" class="${PF.tab === k ? "on" : ""}">${l}</a>`).join("")}</div><div id="pftab">${pfTab(agg)}</div>`;
  // wiring
  box.querySelectorAll("[data-pt]").forEach((a) => a.onclick = (e) => { e.preventDefault(); PF.tab = a.dataset.pt; box.querySelectorAll("[data-pt]").forEach((x) => x.classList.toggle("on", x === a)); document.querySelector("#pftab").innerHTML = pfTab(agg); pfWireTab(); });
  box.querySelectorAll("#pfrange button").forEach((b) => b.onclick = () => { PF.range = b.dataset.r; pfRender(); });
  pfDrawStack(box, from);
  pfWireTab();
}

function pfWireTab() {
  document.querySelectorAll("[data-sel]").forEach((tr) => tr.onclick = () => { PF.sel = tr.dataset.sel; document.querySelectorAll("[data-sel]").forEach((x) => x.classList.toggle("sel", x === tr)); const p = document.querySelector("#pfpanel"); if (p) p.innerHTML = pfPanel(); });
}

function pfPanel() {
  const s = PF.sel, R = PF.R, p = R.pos[s], sc = PF.S[s], sn = PF.N[s] || {}; if (!s || !p) return "";
  const upd = pfUpdates([s]).slice(0, 3), gap = sc && sc.peer ? (p.price / sc.peer.base - 1) * 100 : null, m = sc && sc.model && sc.model.ok ? sc.model.base : null;
  const fa = sn.facts || {}, d = pfDivs(s), yld = p.price ? d.perShare / p.price * 100 : 0, gain = p.value - p.cost, ret = p.cost ? gain / p.cost * 100 : 0;
  return `<div class="card pf-panel"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><b style="font-size:18px">${esc(s)}</b> <span class="muted">${pfM(p.price, 2)}</span><div class="small muted">${esc(pfName(s))}</div></div><a href="#/analysis/${esc(s)}" class="btn ghost" style="padding:6px 12px;font-size:13px">Full analysis →</a></div>
    <h4 style="margin:12px 0 4px">Your holding</h4><div class="pf-kv"><span>Shares</span><b>${+p.sh.toFixed(3)}</b><span>Average cost</span><b>${p.sh ? pfM(p.cost / p.sh, 2) : "-"}</b><span>Value</span><b>${pfM(p.value)}</b><span>Unrealized</span><b style="color:${pfC(gain)}">${pfS(gain)} (${pfP(ret)})</b>${p.realized ? `<span>Realized</span><b style="color:${pfC(p.realized)}">${pfS(p.realized)}</b>` : ""}<span>First bought</span><b>${p.firstDay ? pfDate(pfIso(p.firstDay)) : "-"}</b></div>
    ${sc ? `<h4 style="margin:12px 0 0">Scorecard</h4><div style="display:flex;gap:10px;align-items:center">${miniRadar(sc.axes, 92)}<div class="small">${esc((sc.summary || "").split(" Scores compare")[0])}<div class="muted" style="margin-top:4px">${sc.rewards.length} rewards · ${sc.risks.length} risks</div></div></div>` : ""}
    <h4 style="margin:12px 0 4px">Key numbers</h4><div class="pf-kv"><span>Sector-typical value</span><b>${sc && sc.peer ? pfM(sc.peer.base, 2) : "-"}${gap != null ? ` <i class="small" style="color:${gap > 0 ? "var(--bad)" : "var(--ok)"}">${Math.abs(gap).toFixed(0)}% ${gap > 0 ? "above" : "below"}</i>` : ""}</b><span>Cash-flow model</span><b>${m ? pfM(m, 2) : "-"}</b><span>Dividend yield</span><b>${yld ? yld.toFixed(2) + "%" : "None"}</b><span>Exchange</span><b>${esc(fa.exchange || "-")}</b></div>
    <h4 style="margin:12px 0 4px">Recent updates</h4>${upd.length ? upd.map(pfUpdRow).join("") : `<p class="small muted" style="margin:0">Nothing recent.</p>`}</div>`;
}

function pfUpdates(syms) {
  const out = [], today = new Date().toISOString().slice(0, 10);
  syms.forEach((s) => { const n = PF.N[s] || {};
    const d = pfDivs(s); if (d.upcoming) out.push({ s, date: d.upcoming.date.toISOString().slice(0, 10), kind: "Upcoming dividend", text: `Dividend of $${d.upcoming.amount} per share (ex-dividend date)`, up: true });
    (n.filings || []).filter((f) => f.form === "8-K" || f.form === "10-K" || f.form === "10-Q").slice(0, 3).forEach((f) => out.push({ s, date: f.date, kind: f.form === "8-K" ? "Company report" : f.form === "10-K" ? "Annual report" : "Quarterly report", text: f.what, url: f.url }));
    (n.earnings || []).slice(0, 1).forEach((e) => { const dm = /^(\d+)\/(\d+)\/(\d+)$/.exec(e.reported || ""); const date = dm ? `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}` : null; if (date) out.push({ s, date, kind: "Earnings", text: `Reported EPS ${e.eps}${e.surprise_pct != null ? ` (${pfP(e.surprise_pct)} vs expectations)` : ""}` }); });
  });
  return out.sort((a, b) => (b.up ? 1 : 0) - (a.up ? 1 : 0) || (a.date < b.date ? 1 : -1));
}
const pfUpdRow = (u) => `<div class="pf-upd"><div class="small muted">${esc(u.kind)} · ${pfDate(u.date)}${u.up ? ` · <b style="color:var(--warn)">upcoming</b>` : ""}</div><div class="small"><b>${esc(u.s)}</b> ${esc(u.text)} ${u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">Read →</a>` : ""}</div></div>`;

function pfTab(agg) {
  const R = PF.R, S = PF.S, syms = R.order.filter((s) => R.pos[s].sh > 0.0000001), tv = syms.reduce((a, s) => a + R.pos[s].value, 0) || 1;
  if (!PF.sel || !R.pos[PF.sel]) PF.sel = syms[0];
  if (PF.tab === "holdings") {
    const rows = syms.map((s) => { const p = R.pos[s], sc = S[s], gap = sc && sc.peer ? (p.price / sc.peer.base - 1) * 100 : null, d1 = pfD1(s), gain = p.value - p.cost;
      return `<tr data-sel="${esc(s)}" class="${PF.sel === s ? "sel" : ""}" style="cursor:pointer"><td><div style="display:flex;gap:10px;align-items:center">${sc ? miniRadar(sc.axes, 36) : ""}<div><b>${esc(s)}</b><div class="small muted">${esc(pfName(s).slice(0, 22))}</div></div></div></td>
        <td>${pfM(p.price, 2)}<div class="small" style="color:${gap == null ? "var(--mut)" : gap > 0 ? "var(--bad)" : "var(--ok)"}">${gap == null ? "" : Math.abs(gap).toFixed(0) + "% " + (gap > 0 ? "above" : "below") + " typical"}</div></td>
        <td style="color:${pfC(d1)}">${pfP(d1, 1)}<div class="small">${pfS(p.value - p.value / (1 + d1 / 100))}</div></td><td style="color:${pfC(gain)}">${pfP(p.cost ? gain / p.cost * 100 : 0)}<div class="small">${pfS(gain)}</div></td><td>${pfM(p.value)}<div class="small muted">${pfM(p.cost)}</div></td></tr>`; }).join("");
    return `<div class="pf-grid"><div><div class="tw"><table class="pf-table"><tr><th>Holding</th><th>Price (vs sector-typical value)</th><th>1 day</th><th>Total return</th><th>Value / cost</th></tr>${rows}</table></div>
      <p class="small muted" style="margin:6px 0 0">"Sector-typical value" is what the stock would trade at if priced like the median company in its sector. A yardstick, not a price target. Tap a row for details.</p></div><aside id="pfpanel">${pfPanel()}</aside></div>`;
  }
  if (PF.tab === "analysis") {
    const bySec = {}; syms.forEach((s) => { const k = typeof SECTOR_NAME === "function" ? SECTOR_NAME(pfSector(s)) : pfSector(s); bySec[k] = (bySec[k] || 0) + R.pos[s].value / tv; });
    const secs = Object.entries(bySec).sort((a, b) => b[1] - a[1]), topH = syms[0], topW = R.pos[topH].value / tv;
    const ins = [`You hold <b>${syms.length}</b> companies across <b>${secs.length}</b> sectors.`, `${esc(topH)} is the largest holding at <b>${(topW * 100).toFixed(0)}%</b> of the portfolio${topW > 0.25 ? ", which is a lot to rest on one company (Lesson 3)" : ", a sensible size"}.`, `${secs[0] ? `<b>${esc(secs[0][0])}</b> is the biggest sector at ${(secs[0][1] * 100).toFixed(0)}%.` : ""}`];
    const allRisks = [], allRew = []; syms.forEach((s) => { if (S[s]) { S[s].risks.forEach((r) => allRisks.push({ s, t: r.t, k: r.k, w: R.pos[s].value })); S[s].rewards.forEach((t) => allRew.push({ s, t, w: R.pos[s].value })); } });
    allRisks.sort((a, b) => (a.k === "bad" ? 0 : 1) - (b.k === "bad" ? 0 : 1) || b.w - a.w);
    return `<div class="card"><h3 style="margin:0 0 6px">Where the money is</h3><div class="an-stack">${secs.map(([k, v], i) => `<span style="flex:${v * 100};background:${PF_COLORS[i % 9]}" title="${esc(k)} ${(v * 100).toFixed(0)}%">${v > 0.1 ? `<b>${esc(k)}</b><small>${(v * 100).toFixed(0)}%</small>` : ""}</span>`).join("")}</div>
      <p class="small" style="margin:8px 0 0">${secs.map(([k, v], i) => `<span style="color:${PF_COLORS[i % 9]}">●</span> ${esc(k)} ${(v * 100).toFixed(0)}%`).join(" &nbsp; ")}</p></div>
     <div class="card"><h3 style="margin:0 0 6px">What stands out</h3><ul style="margin:0;padding-left:20px">${ins.filter(Boolean).map((t) => `<li class="small" style="margin:5px 0">${t}</li>`).join("")}</ul></div>
     <div class="an-two"><div class="card"><h3 style="margin:0 0 4px">Biggest risks (${agg.risk})</h3><ul class="rr">${allRisks.slice(0, 8).map((r) => `<li><i class="${r.k}">!</i><span><b>${esc(r.s)}</b> ${esc(r.t)}</span></li>`).join("") || "<li class='muted'><span>None flagged.</span></li>"}</ul></div>
     <div class="card"><h3 style="margin:0 0 4px">Biggest rewards (${agg.rew})</h3><ul class="rr">${allRew.sort((a, b) => b.w - a.w).slice(0, 8).map((r) => `<li><i class="ok">✓</i><span><b>${esc(r.s)}</b> ${esc(r.t)}</span></li>`).join("")}</ul></div></div>`;
  }
  if (PF.tab === "valuations") {
    let gw = 0, gt = 0; const rows = syms.map((s) => { const p = R.pos[s], sc = S[s], pv = sc && sc.peer ? sc.peer.base : null, gap = pv ? (p.price / pv - 1) * 100 : null, dcf = sc && sc.model && sc.model.ok ? sc.model.base : null, pe = sc && sc.sec && sc.sec.valuation.metrics.pe;
      if (gap != null) { gw += gap * p.value; gt += p.value; }
      return `<tr><td><b>${esc(s)}</b><div class="small muted">${esc(pfName(s).slice(0, 24))}</div></td><td>${pfM(p.price, 2)}</td><td>${pv ? pfM(pv, 2) : "-"}</td><td style="color:${gap == null ? "var(--mut)" : gap > 0 ? "var(--bad)" : "var(--ok)"}">${gap == null ? "-" : Math.abs(gap).toFixed(0) + "% " + (gap > 0 ? "above" : "below")}</td><td>${dcf ? pfM(dcf, 2) : "-"}</td><td>${pe && pe.v ? pe.v.toFixed(1) + "× <span class='small muted'>(sector " + (pe.med ? pe.med.toFixed(1) : "-") + "×)</span>" : "-"}</td></tr>`; }).join("");
    const wg = gt ? gw / gt : null;
    return `<div class="card"><h3 style="margin:0 0 2px">How the holdings are priced</h3><p class="small" style="margin:0 0 8px">${wg == null ? "" : `Weighted by size, the portfolio trades about <b>${Math.abs(wg).toFixed(0)}% ${wg > 0 ? "above" : "below"}</b> the value its holdings would have at their sectors' typical prices. `}This is a yardstick for how the market prices these companies against their peers, not a prediction or price target. The cash-flow model asks a different question and, with interest rates high, tends to come out well below market prices.</p>
      <div class="tw"><table><tr><th>Holding</th><th>Price</th><th>Sector-typical value</th><th>Gap</th><th>Cash-flow model</th><th>P/E</th></tr>${rows}</table></div></div>`;
  }
  if (PF.tab === "dividends") {
    let tot = 0, payers = 0; const rows = syms.map((s) => { const p = R.pos[s], d = pfDivs(s), inc = d.perShare * p.sh, y = p.price ? d.perShare / p.price * 100 : 0, yc = p.cost ? inc / p.cost * 100 : 0; tot += inc; if (inc > 0) payers++;
      return { s, inc, y, yc, ps: d.perShare, up: d.upcoming }; }).sort((a, b) => b.inc - a.inc), mx = Math.max(1, ...rows.map((r) => r.inc));
    return `<div class="card"><h3 style="margin:0 0 2px">Dividend income</h3><p class="small" style="margin:0 0 8px">About <b>${pfM(tot)}</b> in the last 12 months from <b>${payers}</b> of ${syms.length} holdings (${R.total[R.L] ? (tot / R.total[R.L] * 100).toFixed(2) : 0}% of the portfolio's value, ${R.cost[R.L] ? (tot / R.cost[R.L] * 100).toFixed(2) : 0}% of what you paid). Based on the dividends each company paid per share over the last year times the shares you hold.</p>
      <div class="an-vb">${rows.map((r) => `<div class="an-vr"><span class="an-vs" style="width:56px"><b>${esc(r.s)}</b></span><span class="an-vt"><i class="g" style="width:${r.inc ? Math.max(1.5, r.inc / mx * 100) : 0}%"></i></span><span class="an-vv" style="width:130px;text-align:right">${r.inc ? pfM(r.inc) + " · " + r.y.toFixed(1) + "%" : "No dividend"}</span></div>`).join("")}</div></div>
      <div class="card"><div class="tw"><table><tr><th>Holding</th><th>Per share (12 mo)</th><th>Yield</th><th>Yield on your cost</th><th>Next ex-dividend</th></tr>${rows.map((r) => `<tr><td><b>${esc(r.s)}</b></td><td>${r.ps ? "$" + r.ps.toFixed(2) : "-"}</td><td>${r.y ? r.y.toFixed(2) + "%" : "-"}</td><td>${r.yc ? r.yc.toFixed(2) + "%" : "-"}</td><td>${r.up ? pfDate(r.up.date.toISOString().slice(0, 10)) + " ($" + r.up.amount + ")" : "-"}</td></tr>`).join("")}</table></div></div>`;
  }
  if (PF.tab === "returns") {
    const rows = R.syms.filter((s) => R.pos[s].cost > 0 || R.pos[s].realized !== 0).map((s) => { const p = R.pos[s], g = p.value - p.cost + p.realized, base = p.cost + p.soldCost; return { s, g, pct: base ? g / base * 100 : 0 }; }).sort((a, b) => b.g - a.g), mx = Math.max(1, ...rows.map((r) => Math.abs(r.pct)));
    const tw = R.twr[R.L] - 100, mk = R.mkt[R.L] - 100;
    return `<div class="card"><h3 style="margin:0 0 2px">Portfolio vs the S&amp;P 500</h3><p class="small" style="margin:0 0 6px">Since the first purchase, the portfolio's time-weighted return (which ignores when money was added) is <b style="color:${pfC(tw)}">${pfP(tw)}</b>, against <b>${pfP(mk)}</b> for the S&amp;P 500. That's <b>${tw >= mk ? "ahead of" : "behind"}</b> the market by ${Math.abs(tw - mk).toFixed(1)} points.</p>${pfLines([R.twr, R.mkt], ["var(--brand)", "var(--unk)"], ["Your portfolio", "S&P 500"])}</div>
     <div class="card"><h3 style="margin:0 0 6px">Return by holding</h3><p class="small muted" style="margin:0 0 8px">Gain or loss, including anything already sold, as a share of what was paid.</p><div class="an-vb">${rows.map((r) => `<div class="an-vr"><span class="an-vs" style="width:56px"><b>${esc(r.s)}</b></span><span class="an-vt" style="background:var(--bg)"><i style="width:${Math.max(1.5, Math.abs(r.pct) / mx * 100)}%;background:${r.g >= 0 ? "var(--ok)" : "var(--bad)"}"></i></span><span class="an-vv" style="width:150px;text-align:right;color:${pfC(r.g)}">${pfP(r.pct, 0)} · ${pfS(r.g)}</span></div>`).join("")}</div></div>`;
  }
  const ups = pfUpdates(syms).slice(0, 30);
  return `<div class="card"><h3 style="margin:0 0 2px">Updates</h3><p class="small muted" style="margin:0 0 8px">Upcoming dividends, recent company reports and earnings across your holdings (from SEC filings and Nasdaq).</p>${ups.length ? ups.map(pfUpdRow).join("") : `<p class="muted small">Nothing recent. Updates are added nightly for the largest companies.</p>`}</div>`;
}

// ---- entry points ----
async function pfPage(events, mine) {
  const syms = [...new Set(events.map((e) => e.sym))], { H, S, N } = await pfLoadData(syms);
  const usable = events.filter((e) => H[e.sym] || mine);
  if (!H["^GSPC"] || !usable.length) return `<div class="card muted">Price history isn't available right now, so the portfolio can't be drawn. Try again in a little while.</div>`;
  PF.S = S; PF.N = N; PF.mine = mine; PF.R = pfCompute(usable, H); if (!PF.sel || !PF.R.pos[PF.sel]) PF.sel = null;
  afterRender.push(pfRender);
  return `<div id="pfroot"><div class="card muted">Loading…</div></div>`;
}
async function demoPage() {
  const H0 = {}; await Promise.all(PF_DEMO_BUYS.map(async ([s]) => { const h = await getHist(s); if (h) H0[s] = h; }));
  const events = PF_DEMO_BUYS.filter(([s]) => H0[s]).map(([s, amt, d]) => { const day = pfDay(d), px = pfPx(H0[s], day); return { sym: s, day, side: "buy", sh: amt / px, px }; });
  const held = {};
  events.slice().sort((a, b) => a.day - b.day);
  PF_DEMO_SELLS.forEach(([s, frac, d]) => { if (!H0[s]) return; const day = pfDay(d), sh = events.filter((e) => e.sym === s && e.day <= day).reduce((a, e) => a + e.sh, 0) * frac; events.push({ sym: s, day, side: "sell", sh, px: pfPx(H0[s], day) }); });
  PF.range = "All"; PF.tab = "holdings";
  const body = await pfPage(events, false);
  return `<div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><b>A sample portfolio to explore</b><div class="small muted">15 well-known companies across all 11 sectors, bought between 2022 and 2024 at real closing prices (hypothetical, for learning). Click around: every tab works.</div></div><a class="btn" href="#/practice/trade">Create my own portfolio</a></div>${body}
    <p class="small muted">The demo is hypothetical: purchases are simulated at real past closing prices, with no fees. It is not a recommendation to buy any stock. Past results don't predict future ones.</p>`;
}
async function minePage() {
  if (!P || !P.trades || !P.trades.length) return `<div class="card"><h3>Your analysis appears here</h3><p>Make a practice trade and this page will show your portfolio's value over time, returns, dividends and scorecard, just like the <a href="#/practice/demo">demo portfolio</a>.</p><p><a class="btn" href="#/practice/trade">Make your first trade</a></p></div>`;
  const events = P.trades.map((t) => ({ sym: t.sym, day: pfDay(t.d), side: t.side === "sell" ? "sell" : "buy", sh: t.sh, px: t.px }));
  PF.range = "All"; PF.tab = "holdings";
  return await pfPage(events, true) + `<p class="small muted">Built from your practice trades. Practice money only; not advice.</p>`;
}
