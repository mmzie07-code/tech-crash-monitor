// Explore > Overlooked: stocks that look cheap against their sector peers and whose price hasn't kept up with a business that kept growing.
// A screen for research, not a recommendation or a rating. Built nightly by engine/overlooked.py from SEC filings and Yahoo prices.
const OL = { size: "all", sector: "", sort: "score", shown: 50 };
const OL_SIZES = [["all", "Any size", 0, 1e9], ["large", "Large (over $10B)", 10, 1e9], ["mid", "Mid ($2B to $10B)", 2, 10], ["small", "Small (under $2B)", 0, 2]];
const OL_SORTS = [["score", "Overlooked score"], ["value", "Cheapest vs peers"], ["drop", "Biggest drop from high"], ["growth", "Fastest revenue growth"]];

function olWhy(r, med) {
  const m = med[r.sector] || {}, out = [];
  if (r.pfcf && m.pfcf) out.push(`Pays ${r.pfcf}× its cash flow (sector typical ${m.pfcf}×)`);
  else if (r.pe && m.pe) out.push(`Earnings multiple ${r.pe}× (sector typical ${m.pe}×)`);
  out.push(`${Math.abs(r.drop52).toFixed(0)}% below its 52-week high`);
  if (r.ch3y != null) out.push(`Revenue ${r.rev_cagr >= 0 ? "+" : ""}${r.rev_cagr}% a year, but the price is ${r.ch3y >= 0 ? "+" : ""}${r.ch3y.toFixed(0)}% over 3 years`);
  return out;
}

function olTable() {
  const d = state.ol, med = d.sector_medians || {}, sz = OL_SIZES.find((x) => x[0] === OL.size);
  let rows = d.rows.filter((r) => r.cap_b >= sz[2] && r.cap_b < sz[3] && (!OL.sector || r.sector === OL.sector));
  const key = { score: (r) => -r.score, value: (r) => -r.value, drop: (r) => r.drop52, growth: (r) => -r.rev_cagr }[OL.sort];
  rows = rows.sort((a, b) => key(a) - key(b));
  if (!rows.length) return `<p class="muted small">No companies match those filters.</p>`;
  const body = rows.slice(0, OL.shown).map((r) => `<tr style="cursor:pointer" onclick="location.hash='#/stock/${esc(r.sym)}'">
    <td><a href="#/stock/${esc(r.sym)}"><b>${esc(r.sym)}</b></a><div class="small muted">${esc(r.name)}</div><div class="small muted">${esc(SECTOR_NAME(r.sector))} · ${capStr(r.cap_b)}</div></td>
    <td><span class="pill ${r.score >= 80 ? "g" : ""}" title="40% cheapness vs peers, 40% price lag, 20% business quality">${Math.round(r.score)}</span></td>
    <td class="small">${olWhy(r, med).map((t) => `<div>${esc(t)}</div>`).join("")}</td>
    <td>$${r.price.toLocaleString()}</td><td>${pctTxt(r.ch1y)}</td><td>${r.fcf_margin}%</td></tr>`).join("");
  return `<div class="tw"><table><tr><th>Company</th><th>Score</th><th>Why it surfaced</th><th>Price</th><th>1 year</th><th>Cash-flow margin</th></tr>${body}</table></div>
   ${rows.length > OL.shown ? `<p style="text-align:center"><button class="btn ghost" id="olmore">Show 50 more (${rows.length - OL.shown} left)</button></p>` : ""}
   <p class="small muted" style="margin:8px 0 0">${rows.length} match${rows.length === 1 ? "es" : ""}. Tap a company to open its chart, headlines and valuation report.</p>`;
}

async function overlookedPage() {
  if (!state.ol) state.ol = await loadJson("overlooked.json");
  const d = state.ol;
  if (!d || !d.rows) return `<h1>Explore</h1>${exploreTabs("overlooked")}<div class="card muted">The overlooked-stocks screen isn't available yet. It's built each night.</div>`;
  afterRender.push(() => {
    const out = $("#olout"), redraw = () => { out.innerHTML = olTable(); const m = $("#olmore"); if (m) m.onclick = () => { OL.shown += 50; redraw(); }; };
    [["olsz", "size"], ["olsec", "sector"], ["olso", "sort"]].forEach(([id, k]) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { OL[k] = el.value; OL.shown = 50; redraw(); }); });
    redraw();
  });
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const secs = [...new Set(d.rows.map((r) => r.sector))].sort().map((k) => [k, SECTOR_NAME(k)]);
  const c = d.counts;
  return `<h1>Explore</h1>${exploreTabs("overlooked")}
  <div class="card big"><span class="pill g">Overlooked stocks</span><h2 style="margin-top:8px">Cheap, still growing, and out of favor</h2>
   <p class="muted" style="margin:6px 0 0">From ${c.pool.toLocaleString()} companies, ${c.cheap_and_sound} were cheaper than most of their sector peers and passed a basic quality check. ${c.shown} of those also have a share price that has fallen behind the business. They're ranked below.</p></div>
  <div class="card"><h3>How to read this</h3>
   <p class="small" style="margin:0 0 8px"><b>What it looks for.</b> (1) A low price compared with cash flow and profit, measured against companies in the <i>same sector</i>. (2) A share price well below its 52-week high, while revenue kept growing. (3) A quality check: positive free cash flow two years running, profitable, revenue not shrinking, and debt that cash flow can cover.</p>
   <p class="small" style="margin:0 0 8px"><b>What it doesn't tell you.</b> Cheap stocks are often cheap for a reason: a business losing its edge, a one-off boom in earnings that is ending, or news the numbers haven't caught up with. Use the stock page's headlines and valuation report to find out <i>why</i> the market lost interest. We haven't shown that this screen beats the market, and it isn't a recommendation.</p>
   <p class="small muted" style="margin:0">Not scored: banks, insurers, real estate companies and utilities, because cash-flow measures don't describe them (${c.screened_out_special.toLocaleString()} companies). Score = 40% cheapness vs peers + 40% how far the price lags the business + 20% quality.</p></div>
  <div class="card"><div class="scr"><label>Size${sel("olsz", OL_SIZES.map((x) => [x[0], x[1]]), OL.size)}</label><label>Sector${sel("olsec", [["", "All sectors"], ...secs], OL.sector)}</label><label>Sort by${sel("olso", OL_SORTS, OL.sort)}</label></div>
   <div id="olout"></div></div>
  <p class="small muted">${esc(d.disclaimer)} Updated ${esc((d.generated || "").slice(0, 10))}. Data: SEC filings and Yahoo Finance.</p>`;
}
