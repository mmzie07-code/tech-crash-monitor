// Oil (Markets > Oil): prices, the futures curve, US supply and demand, pump prices, refining margins and oil stocks. Facts and plain-English context only:
// no price targets, no forecasts. Data: data/oil.json (nightly + morning) from the US Energy Information Administration (via FRED and EIA), Yahoo Finance and BLS.
const OIL = { d: null, tab: "wti", sel: null };
const OIL_STOCKS = [["XOM", "Exxon Mobil", "Integrated major"], ["CVX", "Chevron", "Integrated major"], ["COP", "ConocoPhillips", "Producer"], ["EOG", "EOG Resources", "Shale producer"], ["OXY", "Occidental", "Producer"], ["DVN", "Devon Energy", "Shale producer"],
  ["SLB", "SLB (Schlumberger)", "Oilfield services"], ["HAL", "Halliburton", "Oilfield services"], ["MPC", "Marathon Petroleum", "Refiner"], ["VLO", "Valero", "Refiner"], ["PSX", "Phillips 66", "Refiner"], ["XLE", "Energy Select Sector SPDR", "Energy sector fund"]];
const oilUsd = (v, d = 2) => (v == null ? "-" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const oilPct = (v) => (v == null ? '<span class="muted">-</span>' : `<span style="color:${v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)"};font-weight:600">${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>`);
const oilDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
async function oilLoad() { if (!OIL.d) OIL.d = await loadJson("oil.json"); return OIL.d; }

// range-button line chart built on the site's chart (hover to read values)
function oilChart(boxSel, t, v, o = {}) {
  afterRender.push(() => {
    const box = $(boxSel); if (!box) return;
    const ranges = o.ranges || [["1Y", 365], ["5Y", 1826], ["10Y", 3652], ["Max", 0]], bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px";
    const holder = document.createElement("div"); box.innerHTML = ""; box.appendChild(bar); box.appendChild(holder);
    let cur = o.start != null ? o.start : ranges[1][1];
    const draw = () => {
      const last = t[t.length - 1], i0 = cur ? Math.max(0, t.findIndex((x) => x >= last - cur)) : 0;
      holder.innerHTML = ""; mountChart(holder, { t: t.slice(i0), c: v.slice(i0) }, { money: o.money !== false, decimals: o.dec != null ? o.dec : 2, noRanges: true, lineOnly: true, tone: o.tone || "neutral", rangeName: cur ? "last " + (cur >= 365 ? Math.round(cur / 365.25) + "Y" : Math.round(cur / 30) + "M") : o.maxName || "all time" });
      bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.n === cur));
    };
    ranges.forEach(([l, n]) => { const b = document.createElement("button"); b.className = "btn ghost"; b.dataset.n = n; b.textContent = l; b.style.cssText = "padding:4px 12px;font-size:13px"; b.onclick = () => { cur = n; draw(); }; bar.appendChild(b); });
    draw();
  });
}

function oilCurve(c, color, label) {
  const w = 600, h = 220, pad = { l: 46, r: 14, t: 14, b: 30 }; if (!c || c.length < 4) return `<p class="small muted">The futures curve isn't available right now.</p>`;
  const lo = Math.floor(Math.min(...c.map((x) => x.p)) - 2), hi = Math.ceil(Math.max(...c.map((x) => x.p)) + 2);
  const X = (i) => pad.l + (i / (c.length - 1)) * (w - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b), step = hi - lo > 40 ? 10 : hi - lo > 16 ? 5 : 2, g = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g.push(v);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(label)} futures prices by delivery month">${g.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--mut)">$${v}</text>`).join("")}
    ${c.map((x, i) => (i % 3 === 0 || i === c.length - 1 ? `<text x="${X(i).toFixed(1)}" y="${h - 9}" text-anchor="middle" font-size="10" fill="var(--mut)">${esc(x.l.replace(" 20", " '"))}</text>` : "")).join("")}
    <polyline points="${c.map((x, i) => X(i).toFixed(1) + "," + Y(x.p).toFixed(1)).join(" ")}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${c.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="${i === 0 ? 4.5 : 3}" fill="${color}"><title>${esc(x.l)}: $${x.p}</title></circle>`).join("")}</svg>`;
}

async function oilView() {
  const d = await oilLoad();
  if (!d) return `<div class="card muted">Oil data isn't available right now.</div>`;
  const S = d.spot, W = d.weekly, wti = S.wti, br = S.brent, gas = S.gas, dsl = S.diesel, ng = S.natgas;
  const spread = wti && br ? br.latest - wti.latest : null;
  const fc = (k) => { const c = (d.futures || {})[k]; if (!c || c.length < 6) return null; const far = c[Math.min(12, c.length - 1)], pct = (far.p / c[0].p - 1) * 100; return { near: c[0], far, pct }; };
  const wf = fc("wti");
  const tile = (it, big) => `<div class="card"><div class="small muted">${esc(it.label)}</div><b style="font-size:${big ? 24 : 20}px">${oilUsd(it.latest, it.dec === 3 ? 2 : it.dec)}</b> <span class="small muted">${esc(it.unit)}</span><div class="small">${oilPct(it.d1)} <span class="muted">day</span> · ${oilPct(it.m1)} <span class="muted">month</span> · ${oilPct(it.y1)} <span class="muted">year</span></div></div>`;
  // chart tabs
  const series = { wti: [wti, "WTI crude", true], brent: [br, "Brent crude", true], real: [d.real, "WTI in today's dollars", false] }, cur = series[OIL.tab] ? OIL.tab : "wti", [cs, , ] = series[cur];
  if (cs) oilChart("#oilchart", cs.t, cs.v, { start: cur === "real" ? 0 : 1826 });
  const tabs = `<div class="tabs" style="margin:0 0 10px">${[["wti", "WTI (US)"], ["brent", "Brent (world)"], ["real", "Adjusted for inflation"]].map(([k, l]) => `<a href="#" data-ot="${k}" class="${cur === k ? "on" : ""}">${l}</a>`).join("")}</div>`;
  afterRender.push(() => document.querySelectorAll("[data-ot]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); OIL.tab = a.dataset.ot; state.keepScroll = true; route(); })));
  const real = d.real;
  const wcard = (k) => { const w = W[k]; if (!w) return ""; const ch = w.latest - w.prev, u = w.unit, dec = u === "% of capacity" ? 1 : 1;
    const vs = w.vs5 == null ? "" : w.kind === "level" ? `${Math.abs(w.vs5).toFixed(1)} pts ${w.vs5 >= 0 ? "above" : "below"} the 5-year average for this week` : `${Math.abs(w.vs5).toFixed(1)}% ${w.vs5 >= 0 ? "above" : "below"} the 5-year average for this week`;
    return `<div class="card" style="padding:14px"><div class="small muted">${esc(w.label)}</div><b style="font-size:23px">${w.latest.toFixed(dec)}</b> <span class="small muted">${esc(u)}</span>
      <div class="small">${ch === 0 ? "Unchanged" : (ch > 0 ? "▲ " : "▼ ") + Math.abs(ch).toFixed(2)} <span class="muted">vs. last week</span></div><div class="small muted">${vs}</div>
      <div style="margin-top:6px">${typeof cgSpark === "function" ? cgSpark(w.v.filter((_, i) => i % 3 === 0).concat([w.v[w.v.length - 1]]), 200, 34, "var(--brand)") : ""}</div>
      <p class="small muted" style="margin:6px 0 0"><b>What it is:</b> ${esc(w.what)} <b>Why it matters:</b> ${esc(w.why)}</p></div>`; };
  const cr = d.crack;
  if (cr) oilChart("#oilcrack", cr.t, cr.v, { start: 1826, ranges: [["1Y", 365], ["3Y", 1095], ["5Y", 0]], maxName: "5 years" });
  oilChart("#oilgas", gas.t, gas.v, { dec: 2, start: 3652, ranges: [["1Y", 365], ["5Y", 1826], ["10Y", 3652], ["Max", 0]], maxName: "since 1990" });
  const b = d.behave, eventsHtml = (d.events || []).map((e) => `<div class="item" style="align-items:flex-start"><div style="min-width:94px" class="small muted">${esc(oilDay(e.d))}${e.wti != null ? `<div><b style="color:var(--tx)">${oilUsd(e.wti)}</b></div>` : ""}</div><div><b>${esc(e.title)}</b><div class="small muted">${esc(e.text)}</div></div></div>`).join("");
  const stocks = OIL_STOCKS.map(([s, n, k]) => { const r = state.search && state.search.stocks.find((x) => x[0] === s); return `<tr><td><a href="#/stock/${s}"><b>${s}</b></a> <span class="small muted">${esc(n)}</span></td><td class="small">${esc(k)}</td><td>${r ? "$" + r[4] : '<span class="muted">-</span>'}</td><td>${r ? pctTxt(r[5]) : '<span class="muted">-</span>'}</td></tr>`; }).join("");
  const ctrl = (v) => (v == null ? "-" : v.toFixed(2));
  return `<div class="card big"><span class="pill g">Oil</span><h2 style="margin-top:8px">WTI crude is <b>${oilUsd(wti.latest)}</b> a barrel, ${wti.ytd >= 0 ? "up" : "down"} ${Math.abs(wti.ytd)}% this year</h2>
    <p class="muted" style="margin:6px 0 0">Brent, the world benchmark, is <b>${oilUsd(br.latest)}</b>${spread != null ? ` (${spread >= 0 ? "$" + spread.toFixed(2) + " above" : "$" + Math.abs(spread).toFixed(2) + " below"} WTI)` : ""}. At the pump, a gallon of regular gasoline averages <b>${oilUsd(gas.latest)}</b> and diesel <b>${oilUsd(dsl.latest)}</b>. A year ago WTI was ${oilUsd(wti.latest / (1 + wti.y1 / 100))}.</p>
    <div class="hz" style="margin-top:10px">${tile(wti, true)}${tile(br, true)}${tile(gas)}${tile(dsl)}${ng ? tile(ng) : ""}</div>
    <p class="small muted" style="margin:10px 0 0">Spot prices as of ${esc(oilDay(wti.date))} (pump prices ${esc(oilDay(gas.date))}). Updated ${esc((d.generated || "").slice(0, 10))}. "Month" and "year" are changes from a month and a year earlier.</p></div>
  <div class="card"><h3>Price history</h3>${tabs}<div id="oilchart"></div>
   <p class="small muted" style="margin:8px 0 0">${cur === "real" ? `Every price converted to today's dollars with the consumer price index, so a barrel in 2008 and a barrel now can be compared fairly. ${real && real.hi ? `In real terms the highest price in this data was <b>${oilUsd(real.hi.v, 0)}</b> (${esc(oilDay(real.hi.d))}).` : ""}` : `Daily prices since ${cur === "brent" ? "1987" : "1986"}. WTI (West Texas Intermediate) is the US benchmark; Brent, from the North Sea, prices most of the world's oil. The two usually differ by a few dollars.`}</p></div>
  <div class="card"><h3>Moments that moved oil</h3>${eventsHtml}${d.moves && d.moves.length ? `<h4 style="margin:14px 0 4px">Biggest one-day moves in WTI</h4><div class="tw"><table><tr><th>Date</th><th>Price</th><th>Change</th></tr>${d.moves.map((m) => `<tr><td>${esc(oilDay(m.d))}</td><td>${oilUsd(m.v)}</td><td>${oilPct(m.pct)}</td></tr>`).join("")}</table></div>` : ""}
   <p class="small muted" style="margin:10px 0 0">Prices come from the data; the stories behind them are widely documented summaries. Many things move oil at once, so no single cause fully explains a price.</p></div>
  <div class="card"><h3>The futures curve: what the market pays for oil later</h3><p class="small muted" style="margin:0 0 8px">Each dot is the price today for oil delivered in that future month. ${wf ? (wf.pct < -1 ? `The curve slopes <b>down</b> (called <b>backwardation</b>): oil for delivery in ${esc(wf.far.l)} costs <b>${Math.abs(wf.pct).toFixed(0)}% less</b> than the nearest month. Buyers are paying a premium to have oil now, which usually means supply is tight today.` : wf.pct > 1 ? `The curve slopes <b>up</b> (called <b>contango</b>): oil for delivery in ${esc(wf.far.l)} costs <b>${wf.pct.toFixed(0)}% more</b> than the nearest month. That usually means supply is ample today and storing oil pays.` : `The curve is roughly flat.`) : ""}</p>
   <div class="cards"><div><h4 style="margin:0 0 4px">WTI</h4>${oilCurve((d.futures || {}).wti, "var(--brand)", "WTI")}</div><div><h4 style="margin:0 0 4px">Brent</h4>${oilCurve((d.futures || {}).brent, "var(--brand2)", "Brent")}</div></div>
   <p class="small muted" style="margin:8px 0 0">The curve describes what traders are pricing today. It is not a forecast of where the spot price will go.</p></div>
  <h2>US supply and demand</h2><p class="muted" style="margin-top:-6px">From the Energy Information Administration's weekly report, for the week ending ${esc(oilDay((W.crude || {}).date || d.generated.slice(0, 10)))}. Each line shows how this week compares with the average of the same week over the past five years.</p>
  <div class="hz" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))">${["crude", "gasstock", "diststock", "spr", "prod", "demand", "refutil", "imports", "exports"].map(wcard).join("")}</div>
  <div class="card"><h3>Pump prices</h3><p class="small muted" style="margin:0 0 8px">US average retail price of regular gasoline (weekly, since 1990).</p><div id="oilgas"></div>
   <p class="small" style="margin:8px 0 0"><b>Rule of thumb:</b> a barrel holds 42 gallons, so every $1 on a barrel of crude adds roughly 2.4 cents to a gallon of fuel, before refining costs, taxes and retail margins. Crude is typically around half of what you pay at the pump, which is why gasoline follows oil with a lag of a week or two.</p></div>
  ${cr ? `<div class="card"><h3>Refining margin (the 3-2-1 crack spread)</h3><div class="strip"><div><div class="num" style="font-size:36px">${oilUsd(cr.latest)}</div><div class="small muted">per barrel</div></div><div class="small muted" style="flex:1;min-width:200px">The 5-year average is <b>${oilUsd(cr.avg5)}</b>. Refiners buy crude and sell gasoline and diesel. This is the gap between the value of the fuels (2 barrels of gasoline and 1 of diesel) and the cost of 3 barrels of crude, divided by three.</div></div><div id="oilcrack" style="margin-top:8px"></div>
   <p class="small muted" style="margin:8px 0 0">A wide margin means fuel is expensive compared with crude, so refiners earn more and pump prices can rise even when crude is steady. Built from NYMEX crude, gasoline and heating-oil futures.</p></div>` : ""}
  <div class="card"><h3>Oil and the rest of the market</h3>${b ? `<div class="hz"><div class="card"><div class="small muted">Moves with the S&amp;P 500</div><b style="font-size:22px">${ctrl(b.sp500)}</b></div><div class="card"><div class="small muted">Moves with the dollar</div><b style="font-size:22px">${ctrl(b.dollar)}</b></div><div class="card"><div class="small muted">Moves with gold</div><b style="font-size:22px">${ctrl(b.gold)}</b></div></div>
   <p class="small muted" style="margin:10px 0 0">Correlation of daily changes over the last 90 days: +1 means they rise and fall together every day, 0 means no link, -1 means opposite. Oil is priced in dollars, so a stronger dollar tends to make it costlier for the rest of the world and pushes oil down; the link changes over time, so treat it as a snapshot.</p>` : `<p class="muted small">Not enough price history yet to compare.</p>`}</div>
  <div class="card"><h3>Oil companies</h3><p class="small muted" style="margin:0 0 8px">Producers earn more when oil is high; refiners care about the margin; service companies depend on drilling activity. Tap one for its stock page.</p><div class="tw"><table><tr><th>Company</th><th>Type</th><th>Price</th><th>Today</th></tr>${stocks}</table></div></div>
  <div class="card"><h3>What moves the price of oil</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>OPEC+ decisions.</b> A group of producers, led by Saudi Arabia and Russia, agrees on output targets. Cuts tighten supply; increases loosen it.</li>
   <li><b>US shale.</b> Shale wells can be drilled in months, so high prices tend to bring more supply, which limits how long they stay high.</li>
   <li><b>The economy.</b> Factories, trucks and planes burn oil, so growth lifts demand and recessions cut it (see <a href="#/markets/economy">the economy dashboard</a>).</li>
   <li><b>Inventories and spare capacity.</b> When stored oil is low and producers have little spare capacity to add, even small disruptions move prices a lot.</li>
   <li><b>The dollar.</b> Oil is priced in dollars, so a stronger dollar tends to push oil lower, all else equal (see <a href="#/markets/currencies">currencies</a>).</li>
   <li><b>Geopolitics.</b> Wars, sanctions and attacks on shipping routes or facilities can change supply expectations overnight.</li></ul>
   <p class="small muted" style="margin:10px 0 0">None of these is a forecast. Oil is among the hardest prices to predict.</p></div>
  <p class="small muted">${esc(d.source)}. Educational information only. Not investment advice.</p>`;
}
