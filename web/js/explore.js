// Explore: sectors -> top 50 companies -> stock pages, plus global search.
const SECTOR_NAME = (key) => ((state.sectors && state.sectors.sectors.find((s) => s.key === key)) || {}).name || key;
const capStr = (b) => (b >= 1000 ? "$" + (b / 1000).toFixed(2) + "T" : b >= 1 ? "$" + b.toFixed(1) + "B" : "$" + (b * 1000).toFixed(0) + "M");
async function getHist(sym) {
  try { const r = await fetch((DATA_BASE || "data/") + "hist/" + sym.replace("^", "_") + ".json"); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}
const pctTxt = (v) => v == null ? "-" : `<span style="color:${v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)"};font-weight:600">${v > 0 ? "+" : ""}${v.toFixed(2)}%</span>`;
function retOver(d, n) { const c = d.c; return c.length > n ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null; }

async function exploreHome() {
  if (!state.sectors) return `<h1>Explore</h1><div class="card muted">Sector data isn't available right now.</div>`;
  const hists = await Promise.all(state.sectors.sectors.map((s) => getHist("_S_" + s.key)));
  const cards = state.sectors.sectors.map((s, i) => {
    const h = hists[i], y1 = h ? retOver(h, 252) : null, m1 = h ? retOver(h, 21) : null, spark = h ? h.c.slice(-126) : null;
    const up = spark && spark[spark.length - 1] >= spark[0];
    return `<a class="card" href="#/explore/${s.key}" style="color:inherit;display:block"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h3 style="margin:0">${esc(s.name)}</h3>
     <div class="small muted">${s.companies.toLocaleString()} companies · ${capStr(s.total_cap_b)}</div></div><div class="small" style="text-align:right">1M ${pctTxt(m1)}<br>1Y ${pctTxt(y1)}</div></div>
     ${spark ? svgLines([spark], [up ? "var(--ok)" : "var(--bad)"], 60) : ""}
     <div class="small muted">Top: ${s.top.slice(0, 3).map((t) => esc(t.symbol)).join(", ")}</div></a>`;
  }).join("");
  return `<h1>Explore</h1><p class="muted">Tap a sector to see its 50 largest companies and how the sector has moved. Sectors follow the standard S&amp;P GICS classification.</p><div class="cards">${cards}</div>
  <p class="small muted">Sector lines are market-cap-weighted indexes built from each sector's 50 largest companies, in price terms (dividends excluded). Not investment advice.</p>`;
}

let sortKey = "cap", industryFilter = "";
async function sectorPage(key) {
  const s = state.sectors && state.sectors.sectors.find((x) => x.key === key);
  if (!s) return `<p>Sector not found. <a href="#/explore">Back to Explore</a></p>`;
  const h = await getHist("_S_" + key);
  const inds = {}; s.top.forEach((t) => { if (t.industry) inds[t.industry] = (inds[t.industry] || 0) + 1; });
  const chips = Object.entries(inds).sort((a, b) => b[1] - a[1]).slice(0, 10);
  let rows = s.top.filter((t) => !industryFilter || t.industry === industryFilter);
  rows = [...rows].sort((a, b) => sortKey === "d1" ? b.d1 - a.d1 : b.cap_b - a.cap_b);
  afterRender.push(() => {
    if (h) mountChart($("#secchart"), h, { money: false });
    document.querySelectorAll("[data-ind]").forEach((b) => b.onclick = (e) => { e.preventDefault(); industryFilter = b.dataset.ind === industryFilter ? "" : b.dataset.ind; state.keepScroll = true; route(); });
    document.querySelectorAll("[data-sort]").forEach((b) => b.onclick = (e) => { e.preventDefault(); sortKey = b.dataset.sort; state.keepScroll = true; route(); });
  });
  return `<a href="#/explore" class="small">← All sectors</a><h1 style="margin-top:6px">${esc(s.name)}</h1>
  <p class="muted small">${s.companies.toLocaleString()} companies · ${capStr(s.total_cap_b)} combined market value. Chart: market-cap-weighted index of the top 50 (starts at 100).</p>
  <div class="card">${h ? '<div id="secchart"></div>' : '<p class="muted">Chart not available yet.</p>'}</div>
  <div class="card"><h3>Top 50 companies by market value</h3>
   <div class="tabs" style="margin-top:0"><a href="#" data-sort="cap" class="${sortKey === "cap" ? "on" : ""}">Largest first</a><a href="#" data-sort="d1" class="${sortKey === "d1" ? "on" : ""}">Top movers today</a></div>
   <div class="tabs" style="margin-top:0">${chips.map(([n, c]) => `<a href="#" data-ind="${esc(n)}" class="${industryFilter === n ? "on" : ""}">${esc(n)} (${c})</a>`).join("")}</div>
   <div class="tw"><table><tr><th>#</th><th>Company</th><th>Industry</th><th>Mkt cap</th><th>Price</th><th>Today</th></tr>
   ${rows.map((t, i) => `<tr style="cursor:pointer" onclick="location.hash='#/stock/${esc(t.symbol)}'"><td class="muted">${i + 1}</td><td><a href="#/stock/${esc(t.symbol)}"><b>${esc(t.symbol)}</b></a><div class="small muted">${esc(t.name)}</div></td>
   <td class="small muted">${esc(t.industry)}</td><td>${capStr(t.cap_b)}</td><td>$${t.price.toLocaleString()}</td><td>${pctTxt(t.d1)}</td></tr>`).join("")}</table></div></div>`;
}

async function stockPage(sym) {
  sym = decodeURIComponent(sym).toUpperCase();
  const row = state.search && state.search.stocks.find((r) => r[0] === sym);
  const top = state.sectors && state.sectors.sectors.flatMap((s) => s.top.map((t) => ({ ...t, sector: s.key }))).find((t) => t.symbol === sym);
  const q = Q()[sym], h = await getHist(sym);
  const name = (top && top.name) || (row && row[1]) || (q && q.name) || sym;
  const secKey = (top && top.sector) || (row && row[2]) || null;
  const price = h ? h.c[h.c.length - 1] : top ? top.price : row ? row[4] : q ? q.price : null;
  if (price == null) return `<p>We couldn't find “${esc(sym)}”. <a href="#/explore">Browse sectors</a> or try the search box.</p>`;
  const cap = top ? top.cap_b : row ? row[3] : null, d1 = top ? top.d1 : row ? row[5] : q ? q.d1 : null;
  afterRender.push(() => { if (h) mountChart($("#stkchart"), h, { money: true }); });
  let stats = "";
  if (h) {
    const c = h.c, last252 = c.slice(-252);
    stats = `<div class="hz"><div class="card"><div class="small muted">52-week range</div><b>$${Math.min(...last252).toFixed(2)} – $${Math.max(...last252).toFixed(2)}</b></div>
     <div class="card"><div class="small muted">1 month</div><b>${pctTxt(retOver(h, 21))}</b></div><div class="card"><div class="small muted">3 months</div><b>${pctTxt(retOver(h, 63))}</b></div>
     <div class="card"><div class="small muted">1 year</div><b>${pctTxt(retOver(h, 252))}</b></div><div class="card"><div class="small muted">5 years</div><b>${pctTxt(retOver(h, c.length - 1))}</b></div></div>`;
  }
  const peers = secKey && state.sectors ? state.sectors.sectors.find((s) => s.key === secKey).top.filter((t) => t.symbol !== sym).slice(0, 6) : [];
  return `<a href="#/explore${secKey ? "/" + secKey : ""}" class="small">← ${secKey ? esc(SECTOR_NAME(secKey)) : "Explore"}</a>
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><h1 style="margin:0">${esc(name)}</h1>
   <div class="muted">${esc(sym)}${secKey ? ` · <a href="#/explore/${secKey}">${esc(SECTOR_NAME(secKey))}</a>` : ""}${top && top.industry ? ` · ${esc(top.industry)}` : ""}</div></div>
   <a class="btn" href="#/practice/trade/${esc(sym)}">Practice trading</a></div>
  <div class="card" style="margin-top:14px">${h ? '<div id="stkchart"></div>' : `<div class="strip"><div class="num" style="font-size:40px">$${price.toLocaleString()}</div><div class="small">${d1 != null ? pctTxt(d1) + " today<br>" : ""}Price history isn't loaded for this company yet. Live charts for every stock arrive with accounts.</div></div>`}</div>
  ${cap ? `<div class="hz"><div class="card"><div class="small muted">Market value</div><b>${capStr(cap)}</b></div><div class="card"><div class="small muted">Today</div><b>${pctTxt(d1)}</b></div></div>` : ""}${stats}
  ${peers.length ? `<div class="card"><h3>Other big names in ${esc(SECTOR_NAME(secKey))}</h3>${peers.map((t) => `<div class="item" style="align-items:center"><a href="#/stock/${esc(t.symbol)}" style="flex:1"><b>${esc(t.symbol)}</b> <span class="small muted">${esc(t.name)}</span></a><span class="small">${capStr(t.cap_b)} ${pctTxt(t.d1)}</span></div>`).join("")}</div>` : ""}
  <p class="small muted">Prices are end-of-day. Learn what these numbers mean in <a href="#/learn/1">Lesson 1</a> and <a href="#/learn/5">Lesson 5</a>. Not investment advice.</p>`;
}

// ---- global search ----
function wireSearch() {
  const box = $("#gs"), out = $("#gsr");
  if (!box || box._w) return; box._w = true;
  const run = () => {
    const q = box.value.trim().toLowerCase();
    if (!q || !state.search) { out.style.display = "none"; return; }
    const rows = state.search.stocks, res = [];
    for (const r of rows) if (r[0].toLowerCase() === q) res.push(r);
    for (const r of rows) if (res.length < 8 && r[0].toLowerCase().startsWith(q) && !res.includes(r)) res.push(r);
    for (const r of rows) if (res.length < 8 && r[1].toLowerCase().includes(q) && !res.includes(r)) res.push(r);
    out.innerHTML = res.slice(0, 8).map((r) => `<a href="#/stock/${encodeURIComponent(r[0])}" data-sym="${esc(r[0])}"><b>${esc(r[0])}</b> <span class="small muted">${esc(r[1])}</span><span class="small" style="float:right">$${r[4]}</span></a>`).join("") || `<div class="small muted" style="padding:10px">No matches.</div>`;
    out.style.display = "block";
  };
  box.addEventListener("input", run); box.addEventListener("focus", run);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = out.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); box.blur(); out.style.display = "none"; } } if (e.key === "Escape") { out.style.display = "none"; box.blur(); } });
  out.addEventListener("click", () => { out.style.display = "none"; box.value = ""; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".gsw")) out.style.display = "none"; });
}
