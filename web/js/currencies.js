// Currencies (Markets > Currencies): how the US dollar compares with every other currency. Every change is told from the dollar's side:
// "+3%" means the dollar now buys 3% more of that currency than it did. Facts and plain-English context only, no forecasts.
// Data: data/currencies.json (nightly): rates from open.er-api.com, history from Yahoo Finance, dollar index (DXY).
const FX = { sort: "name", q: "" };
const fxPer = (v) => (v == null ? "-" : v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 10 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v >= 1 ? v.toFixed(3) : v.toPrecision(3));
const fxDec = (v) => (v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 4);
const fxChg = (v) => (v == null ? '<span class="muted">-</span>' : `<span style="color:${v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)"};font-weight:600">${v > 0 ? "+" : ""}${Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)}%</span>`);
const fxFlag = (r) => (r.peg === "usd" ? '<span class="pill" style="font-size:10px">pegged to $</span>' : r.peg === "eur" ? '<span class="pill" style="font-size:10px">tied to euro</span>' : r.quirk ? '<span class="pill w" style="font-size:10px" title="Official and street rates can differ widely, so this figure may be unreliable">irregular</span>' : "");

function fxRows(rows) {
  return rows.map((r) => `<tr><td><a href="#/markets/currencies/${esc(r.code)}"><b>${esc(r.name)}</b></a> <span class="small muted">${esc(r.code)}</span> ${fxFlag(r)}</td><td>${fxPer(r.per)}</td>
    <td>${fxChg(r.d30)}</td><td>${fxChg(r.ytd)}</td><td>${fxChg(r.y1)}</td><td>${typeof cgSpark === "function" && r.spark ? cgSpark(r.spark, 80, 24) : ""}</td></tr>`).join("");
}
function fxFiltered(d, sub) {
  const q = FX.q.trim().toLowerCase();
  let rows = sub === "all" || q ? d.rows.slice() : d.rows.filter((r) => d.majors.includes(r.code));
  if (q) rows = rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  const key = { name: (a, b) => a.name.localeCompare(b.name), up: (a, b) => (b.ytd ?? -1e9) - (a.ytd ?? -1e9), down: (a, b) => (a.ytd ?? 1e9) - (b.ytd ?? 1e9) }[FX.sort];
  return rows.sort(key);
}

function fxView(sub) {
  const d = state.fx;
  if (!d) return `<div class="card muted">Currency data isn't available right now.</div>`;
  if (sub && sub !== "all") return fxCurrency(decodeURIComponent(sub).toUpperCase());
  const x = d.dxy, S = d.summary, R = Object.fromEntries(d.rows.map((r) => [r.code, r]));
  const lead = (codes) => codes.map((c) => R[c]).filter(Boolean);
  const mini = (r) => `<a class="card" href="#/markets/currencies/${esc(r.code)}" style="color:inherit;display:block;padding:12px"><div class="small muted">${esc(r.name)}</div><b style="font-size:19px">${fxPer(r.per)}</b> <span class="small muted">${esc(r.code)} per $1</span>
    <div class="small" style="margin-top:2px">${fxChg(r.ytd)} <span class="muted">this year</span></div>${typeof cgSpark === "function" && r.spark ? `<div style="margin-top:4px">${cgSpark(r.spark, 120, 28)}</div>` : ""}</a>`;
  const ranked = (codes, title, note) => `<div class="card"><h3>${title}</h3><p class="small muted" style="margin:0 0 4px">${note}</p>${lead(codes).map((r) => `<a class="item" href="#/markets/currencies/${esc(r.code)}" style="align-items:center;color:inherit"><div style="flex:1"><b>${esc(r.name)}</b> <span class="small muted">${esc(r.code)}</span></div><b>${fxChg(r.ytd)}</b></a>`).join("")}</div>`;
  const opts = d.rows.map((r) => `<option value="${esc(r.code)}">${esc(r.code)} – ${esc(r.name)}</option>`).join("");
  afterRender.push(() => fxWire(d, sub));
  const pos = x && x.pos52 != null ? x.pos52 : null;
  return `<div class="card big"><span class="pill g">The dollar</span>
    <h2 style="margin-top:8px">${x ? `The dollar index is <b>${x.level}</b>, ${x.ytd >= 0 ? "up" : "down"} ${Math.abs(x.ytd).toFixed(1)}% this year` : "How the dollar compares"}</h2>
    <p class="muted" style="margin:6px 0 0">${x ? `The dollar index (DXY) measures the dollar against six big currencies (mostly the euro, then the yen, pound, Canadian dollar, Swedish krona and Swiss franc). It is ${pos != null ? pos + "% of the way up its 52-week range (" + x.lo52.toFixed(1) + " to " + x.hi52.toFixed(1) + ")" : "shown here"}. ` : ""}Against the ${S.ytd_n} free-floating currencies we have a full year for, the dollar is <b>up against ${S.ytd_up}</b> and <b>down against ${S.ytd_down}</b> so far this year${S.ytd_median != null ? ` (typical change ${S.ytd_median > 0 ? "+" : ""}${S.ytd_median}%)` : ""}.</p>
    ${x ? `<div class="hz" style="margin-top:10px"><div class="card"><div class="small muted">Today</div><b>${fxChg(x.d1)}</b></div><div class="card"><div class="small muted">1 month</div><b>${fxChg(x.d30)}</b></div><div class="card"><div class="small muted">1 year</div><b>${fxChg(x.y1)}</b></div><div class="card"><div class="small muted">5 years</div><b>${fxChg(x.y5)}</b></div></div>` : ""}
    <p class="small muted" style="margin:10px 0 0">All changes are from the dollar's side: <b>+</b> means the dollar buys more of the other currency than before (the dollar got stronger against it), <b>−</b> means it buys less. Rates updated ${esc((d.rates_updated || d.generated || "").slice(0, 16))}.</p></div>
  ${fxCentury()}
  <div class="card"><h3>Currency converter</h3><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="fx-amt" type="number" min="0" step="any" value="100" style="width:120px" aria-label="Amount">
    <select id="fx-from" aria-label="From"><option value="USD">USD – US Dollar</option>${opts}</select><span>→</span><select id="fx-to" aria-label="To"><option value="USD">USD – US Dollar</option>${opts}</select></div>
   <p style="margin:10px 0 0;font-size:20px;font-weight:700" id="fx-out"></p><p class="small muted" style="margin:4px 0 0">Mid-market rates, updated daily. Banks, card networks and exchange kiosks add a margin, so what you actually get is usually a little less.</p></div>
  <h2>The big currencies against the dollar</h2><div class="hz">${lead(d.majors).map(mini).join("")}</div>
  <div class="cards">${ranked(S.dollar_strongest_vs, "Dollar's biggest gains this year", "The dollar bought the most extra of these (their currencies fell the most). Pegged and irregular currencies are left out.")}
   ${ranked(S.dollar_weakest_vs, "Dollar's biggest losses this year", "The dollar bought the least of these (their currencies rose the most).")}</div>
  <div class="card"><h3>Every currency</h3>
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><input id="fx-q" type="search" placeholder="Search a currency or country" style="flex:1;min-width:180px" value="${esc(FX.q)}" aria-label="Search currencies">
    <select id="fx-sort" aria-label="Sort"><option value="name">A to Z</option><option value="up">Dollar up most this year</option><option value="down">Dollar down most this year</option></select></div>
   <div class="tabs" style="margin:0 0 10px">${[["", "Major currencies"], ["all", "All " + S.n]].map(([k, l]) => `<a class="${(sub || "") === k ? "on" : ""}" href="#/markets/currencies${k ? "/" + k : ""}">${l}</a>`).join("")}</div>
   <div class="tw"><table><tr><th>Currency</th><th>$1 buys</th><th>1 month</th><th>This year</th><th>1 year</th><th>Last 90 days</th></tr><tbody id="fx-rows">${fxRows(fxFiltered(d, sub))}</tbody></table></div>
   <p class="small muted" style="margin:8px 0 0">${S.with_history} of ${S.n} currencies have price history here; the rest show today's rate only. <b>Pegged</b> currencies are fixed to the dollar (or euro) by their governments, so they barely move on purpose. <b>Irregular</b> ones have official and street rates that differ widely, so their changes can mislead.</p></div>
  <div class="card"><h3>What moves a currency, and what a strong dollar means</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>Interest rates.</b> Money flows to where it earns more. Higher US rates than elsewhere tend to pull money into dollars and lift the dollar.</li>
   <li><b>Inflation.</b> A currency that loses buying power faster than others tends to weaken over time. The most extreme falls in the table above are almost always high-inflation countries.</li>
   <li><b>Safe-haven demand.</b> In scares, investors often rush into dollars, Swiss francs and yen, so the dollar can rise when markets fall.</li>
   <li><b>Trade and investment flows.</b> Buying a country's goods or assets means buying its currency. Large, lasting trade deficits can weigh on a currency.</li>
   <li><b>Pegs and policy.</b> Some governments fix their currency to the dollar or euro, or step in to steer it, so the price reflects a decision, not a free market.</li></ul>
   <h4 style="margin:14px 0 4px">If the dollar gets stronger…</h4><ul class="small" style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>Americans traveling or buying imports</b> get more for their money.</li>
   <li><b>US exporters and multinational companies</b> earn less when foreign sales are converted back into dollars, which is one reason a strong dollar can show up in earnings reports.</li>
   <li><b>Countries that borrowed in dollars</b> find the debt harder to repay in their own currency.</li>
   <li><b>Oil, gold and many commodities</b> are priced in dollars, so they often fall when the dollar rises, and the other way round.</li></ul>
   <p class="small muted" style="margin:10px 0 0">None of this is a forecast. Currencies are hard to predict, even for professionals.</p></div>
  <p class="small muted">${esc(d.source)}. Educational information only. Not investment advice. Rates are mid-market and update daily.</p>`;
}

// What the dollar has been worth over time: its purchasing power since 1913, from the US consumer price index.
function fxCentury() {
  const D = state.dollar100;
  if (!D || !D.cpi || D.cpi.length < 1000) return "";
  const n = D.cpi.length, last = D.cpi[n - 1], yr = (t) => new Date(Date.UTC(2000, 0, 1) + t * 864e5).getUTCFullYear();
  const power = D.cpi.map((c) => (D.cpi[0] / c) * 100);   // cents of 1913 buying power
  const first = new Map(); D.t.forEach((t, i) => { const y = yr(t); if (!first.has(y)) first.set(y, D.cpi[i]); });
  const avg = (y) => { const v = D.cpi.filter((_, i) => yr(D.t[i]) === y); return v.reduce((a, b) => a + b, 0) / v.length; };
  const today = (y) => 100 * last / avg(y);
  const yoy = D.cpi.map((c, i) => (i >= 12 ? { t: D.t[i], v: (c / D.cpi[i - 12] - 1) * 100 } : null)).filter(Boolean);
  const hi = yoy.reduce((a, b) => (b.v > a.v ? b : a)), lo = yoy.reduce((a, b) => (b.v < a.v ? b : a)), mo = (t) => new Date(Date.UTC(2000, 0, 1) + t * 864e5).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const years = [1913, 1926, 1950, 1970, 1980, 2000, 2020].filter((y) => first.has(y));
  const cagr = (Math.pow(last / D.cpi[0], 1 / ((D.t[n - 1] - D.t[0]) / 365.25)) - 1) * 100;
  afterRender.push(() => { const box = $("#fxcentury"); if (box) mountChart(box, { t: D.t, c: power }, { money: false, decimals: 1, lineOnly: true, noRanges: true, rangeName: "1913 to now" }); });
  return `<div class="card"><h3>What a dollar has been worth, 1913 to today</h3>
   <p style="margin:0 0 8px">A dollar from 1913 buys about <b>${power[n - 1].toFixed(1)} cents</b> of what it bought then. Put the other way, goods that cost $1 in 1913 cost about <b>$${(last / D.cpi[0]).toFixed(2)}</b> today. Prices have risen by about <b>${cagr.toFixed(1)}% a year</b> on average since.</p>
   <div id="fxcentury"></div><p class="small muted" style="margin:6px 0 0">Purchasing power of the US dollar, in cents of 1913 buying power. The line falls when prices rise.</p>
   <div class="tw" style="margin-top:10px"><table><tr><th>If you had $100 in</th><th>it would take about this much to buy the same things today</th></tr>${years.map((y) => `<tr><td>${y}</td><td><b>$${today(y).toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></td></tr>`).join("")}</table></div>
   <div class="hz" style="margin-top:10px"><div class="card"><div class="small muted">Fastest price rise (12 months)</div><b>+${hi.v.toFixed(1)}%</b><div class="small muted">to ${mo(hi.t)}</div></div><div class="card"><div class="small muted">Steepest price fall (12 months)</div><b>${lo.v.toFixed(1)}%</b><div class="small muted">to ${mo(lo.t)}</div></div></div>
   <p class="small muted" style="margin:10px 0 0">Measured with the US consumer price index (CPI), which tracks a typical basket of what households buy. It is not exact for any one person: housing, health care, education and electronics have all moved very differently. Since the dollar left the gold standard in 1971, it has not been tied to any metal, and its value rests on the Federal Reserve's policy and on people's trust in it. ${esc(D.source)}.</p></div>`;
}

function fxWire(d, sub) {
  const q = $("#fx-q"), sort = $("#fx-sort"), rows = $("#fx-rows"); if (!q || !rows) return;
  sort.value = FX.sort;
  const redraw = () => { rows.innerHTML = fxRows(fxFiltered(d, sub)) || `<tr><td colspan="6" class="muted">No currency matches.</td></tr>`; };
  q.oninput = () => { FX.q = q.value; redraw(); };
  sort.onchange = () => { FX.sort = sort.value; redraw(); };
  const rate = (c) => (c === "USD" ? 1 : (d.rows.find((r) => r.code === c) || {}).per), amt = $("#fx-amt"), from = $("#fx-from"), to = $("#fx-to"), out = $("#fx-out");
  from.value = "USD"; to.value = "EUR";
  const calc = () => {
    const a = parseFloat(amt.value), f = rate(from.value), t = rate(to.value);
    out.textContent = !(a >= 0) || !f || !t ? "" : `${a.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${from.value} = ${(a / f * t).toLocaleString("en-US", { maximumFractionDigits: fxDec(t / f) < 3 ? 2 : 4 })} ${to.value}`;
  };
  [amt, from, to].forEach((e) => { e.oninput = calc; e.onchange = calc; }); calc();
}

async function fxCurrency(code) {
  const d = state.fx, r = d.rows.find((x) => x.code === code);
  if (!r) return `<a href="#/markets/currencies" class="small">← Currencies</a><div class="card"><p>We don't have “${esc(code)}”. <a href="#/markets/currencies/all">See every currency</a>.</p></div>`;
  const h = r.hist ? await getHist("FX_" + code) : null;
  afterRender.push(() => { const box = $("#fxchart"); if (h && box) mountChart(box, h, { money: false, decimals: fxDec(r.per), lineOnly: true, noRanges: false }); });
  const k = (a, b, s) => `<div class="card"><div class="small muted">${a}</div><b>${b}</b>${s ? `<div class="small muted">${s}</div>` : ""}</div>`;
  const ytd = r.ytd, word = (v) => (v > 0 ? "more" : "less");
  const story = r.peg === "usd" ? `<p style="margin:0"><b>${esc(r.name)} is pegged to the dollar.</b> Its government holds the rate close to a fixed level, so it barely moves by design. Pegs can end: if a country runs short of dollars it may be forced to let the currency fall (Argentina's collapsed dollar peg in 2002 is the classic example).</p>`
    : r.peg === "eur" ? `<p style="margin:0"><b>${esc(r.name)} is tied to the euro,</b> so against the dollar it moves almost exactly as the euro does.</p>`
    : r.quirk ? `<p style="margin:0"><b>Treat this one with caution.</b> The quoted rate has moved in extreme or irregular steps over the past year. In countries with tight currency controls, the official rate and the street rate can be very far apart, and the number here may reflect a change in which rate is quoted, not just a market move.</p>`
    : ytd != null ? `<p style="margin:0">So far this year the dollar buys <b>${Math.abs(ytd).toFixed(1)}% ${word(ytd)}</b> ${esc(r.name)} than it did on 1 January${r.y1 != null ? `, and ${Math.abs(r.y1).toFixed(1)}% ${word(r.y1)} than a year ago` : ""}. A rising line means a stronger dollar against it (and a weaker ${esc(r.code)}).</p>` : `<p style="margin:0" class="muted">There isn't enough price history for this currency to say how it has moved.</p>`;
  return `<a href="#/markets/currencies" class="small">← Currencies</a>
   <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><h1 style="margin:0">${esc(r.name)}</h1><div class="muted">${esc(r.code)} ${fxFlag(r)}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:30px">${fxPer(r.per)}</div><div class="small muted">${esc(r.code)} per US dollar</div></div></div>
   <div class="card" style="margin-top:14px">${h ? '<div id="fxchart"></div><p class="small muted" style="margin:6px 0 0">How many ' + esc(r.code) + ' one US dollar buys. Up = stronger dollar, down = weaker dollar.</p>' : `<p class="muted small" style="margin:0">No price history is available for this currency yet.</p>`}</div>
   <div class="card">${story}</div>
   <div class="hz">${k("$1 buys", fxPer(r.per) + " " + esc(r.code))}${k("1 " + esc(r.code) + " costs", "$" + (r.per ? (1 / r.per >= 1 ? (1 / r.per).toFixed(2) : (1 / r.per).toPrecision(3)) : "-"))}${k("Dollar, 1 month", fxChg(r.d30))}${k("Dollar, this year", fxChg(r.ytd))}${k("Dollar, 1 year", fxChg(r.y1))}${r.y5 != null ? k("Dollar, 5 years", fxChg(r.y5)) : ""}
    ${r.lo52 != null ? k("52-week range", fxPer(r.lo52) + " – " + fxPer(r.hi52), r.pos52 != null ? "Today is " + r.pos52 + "% of the way up it" : "") : ""}</div>
   <p class="small muted">Mid-market rate, updated daily. ${esc(d.source)}. Educational information only. Not investment advice.</p>`;
}
