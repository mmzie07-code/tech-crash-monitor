// Explore: sectors -> top 50 companies -> stock pages, plus global search.
const SECTOR_NAME = (key) => ((state.sectors && state.sectors.sectors.find((s) => s.key === key)) || {}).name || key;
const capStr = (b) => (b >= 1000 ? "$" + (b / 1000).toFixed(2) + "T" : b >= 1 ? "$" + b.toFixed(1) + "B" : "$" + (b * 1000).toFixed(0) + "M");
async function getHist(sym) {
  try { const r = await fetch((DATA_BASE || "data/") + "hist/" + sym.replace("^", "_") + ".json"); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}
const pctTxt = (v) => v == null ? "-" : `<span style="color:${v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)"};font-weight:600">${v > 0 ? "+" : ""}${v.toFixed(2)}%</span>`;
function retOver(d, n) { const c = d.c; return c.length > n ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null; }

// Live market data through the authenticated Supabase function (signed-in users and the owner only).
const liveOK = () => typeof AUTH !== "undefined" && AUTH.enabled && AUTH.ready && !AUTH.failed && signedIn();
async function liveGet(params) {
  const r = await fetch(fnUrl() + "?" + params, { headers: await apiHeaders() });
  if (!r.ok) throw new Error("live " + r.status);
  return r.json();
}
const liveChartFor = (sym) => liveOK() ? (range) => liveGet("action=chart&symbol=" + encodeURIComponent(sym) + "&range=" + range) : null;
const unixToDay = (ts) => Math.floor(ts / 86400) - 10957; // days since 2000-01-01

const SECTOR_INFO = {
  "technology": { type: "Growth", blurb: "Companies that make the software, chips, computers and online services the modern economy runs on, including Apple, Microsoft and NVIDIA.", drivers: "New products (like AI), business spending on technology, and interest rates, because investors pay high prices for fast growth.", watch: "Very high valuations and a few giant companies carrying the whole sector." },
  "health-care": { type: "Defensive", blurb: "Drugmakers, biotech firms, medical device makers, hospitals and health insurers.", drivers: "Drug approvals and patents, an aging population, and government pricing and insurance rules. People need care in good times and bad.", watch: "A single failed drug trial or a pricing rule change can hit a company hard." },
  "financials": { type: "Cyclical", blurb: "Banks, insurers, asset managers, and payment companies like Visa and Mastercard.", drivers: "Interest rates, how much people and companies borrow, loan defaults, and how active the markets are.", watch: "Credit losses in a recession, and sudden stress in the banking system." },
  "consumer-discretionary": { type: "Cyclical", blurb: "Things people want but can delay: cars, online and store shopping, restaurants, hotels and travel. Amazon and Tesla are the giants here.", drivers: "Consumer confidence, jobs, wages and borrowing costs. When people feel rich they spend; when worried they cut back first here.", watch: "Recessions hit this sector early and hard." },
  "communication": { type: "Growth", blurb: "Internet platforms, media, entertainment and phone carriers: Alphabet (Google), Meta, Netflix, Disney, Verizon.", drivers: "Advertising budgets, streaming and subscription growth, and mobile and internet usage.", watch: "Ad spending falls quickly in downturns, and regulators keep a close eye on the biggest platforms." },
  "industrials": { type: "Cyclical", blurb: "Aerospace and defense, machinery, construction equipment, railroads, airlines and shipping: the companies that build and move things.", drivers: "Factory and infrastructure spending, global trade, government contracts and the health of manufacturing.", watch: "Slowdowns in global trade and supply chain disruptions." },
  "consumer-staples": { type: "Defensive", blurb: "Everyday essentials: groceries, drinks, household goods and personal care, from Walmart and Costco to Coca-Cola and Procter & Gamble.", drivers: "Steady demand, pricing power and the cost of ingredients and shipping. People buy these no matter what the economy does.", watch: "Slow growth, and squeezed profits when costs rise faster than prices." },
  "energy": { type: "Cyclical", blurb: "Oil and gas producers, refiners and pipeline companies such as Exxon Mobil and Chevron.", drivers: "Oil and gas prices, which depend on global demand, OPEC decisions and geopolitics.", watch: "Sharp swings in commodity prices and the long-run shift toward cleaner energy." },
  "utilities": { type: "Defensive", blurb: "Companies that deliver electricity, natural gas and water. They are often regulated and pay steady dividends.", drivers: "Interest rates (utilities behave a bit like bonds), regulators' approved prices, and rising power demand from data centers.", watch: "Rising rates hurt utilities, and they carry a lot of debt." },
  "real-estate": { type: "Rate-sensitive", blurb: "Mostly REITs: companies that own properties like cell towers, data centers, warehouses, apartments and offices, and pay out most income as dividends.", drivers: "Interest rates, rents and how full their buildings are.", watch: "Higher rates raise borrowing costs and lower property values; offices have struggled." },
  "materials": { type: "Cyclical", blurb: "Chemicals, metals and mining, construction materials and packaging: the raw ingredients other industries use.", drivers: "Commodity prices, construction and manufacturing demand (especially in China), and the strength of the US dollar.", watch: "Prices swing with global growth, and mining carries operating and environmental risk." }
};
const TYPE_TIP = { Growth: "Tends to rise fastest in good times and fall hardest in bad", Cyclical: "Rises and falls with the economy", Defensive: "Tends to hold up better in downturns", "Rate-sensitive": "Moves a lot with interest rates" };
const PERF_RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["YTD", "ytd"], ["1Y", 365], ["5Y", "all"]];
const SEC_COLORS = ["#5b4bff", "#22d3a6", "#f5a524", "#e5484d", "#3b82f6", "#a855f7", "#14b8a6", "#f97316", "#64748b", "#ec4899", "#84cc16"];
let perfRange = "3M";
const rangeVal = (label) => (PERF_RANGES.find((x) => x[0] === label) || PERF_RANGES[1])[1];
const rangeRet = (h, label) => { const sl = sliceRange(h, rangeVal(label)); return { ret: (sl.c[sl.c.length - 1] / sl.c[0] - 1) * 100, sl }; };

async function exploreHome() {
  if (!state.sectors) return `<h1>Explore</h1><div class="card muted">Sector data isn't available right now.</div>`;
  const secs = state.sectors.sectors, hists = await Promise.all(secs.map((s) => getHist("_S_" + s.key)));
  const rows = secs.map((s, i) => hists[i] ? { s, h: hists[i], ...rangeRet(hists[i], perfRange) } : null).filter(Boolean).sort((a, b) => b.ret - a.ret);
  afterRender.push(() => document.querySelectorAll("[data-pr]").forEach((b) => b.onclick = (e) => { e.preventDefault(); perfRange = b.dataset.pr; state.keepScroll = true; route(); }));
  const colorOf = (key) => SEC_COLORS[secs.findIndex((s) => s.key === key) % SEC_COLORS.length];
  let perf = "";
  if (rows.length) {
    const lines = rows.map((r) => r.sl.c.map((v) => (v / r.sl.c[0]) * 100)), all = lines.flat(), lo = Math.min(...all), hi = Math.max(...all), H = 240;
    const Y = (v) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16), maxAbs = Math.max(...rows.map((r) => Math.abs(r.ret)), 1);
    perf = `<div class="card"><h3 style="margin-bottom:2px">How the sectors are performing</h3><p class="small muted" style="margin-top:0">Each line starts at 100. Higher = that sector gained more over the period.</p>
     <div class="tabs" style="margin-top:6px">${PERF_RANGES.map(([l]) => `<a href="#" data-pr="${l}" class="${l === perfRange ? "on" : ""}">${l}</a>`).join("")}</div>
     <svg viewBox="0 0 600 ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px"><line x1="0" x2="600" y1="${Y(100)}" y2="${Y(100)}" stroke="var(--mut)" stroke-opacity=".4" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
     ${rows.map((r, i) => `<polyline fill="none" stroke="${colorOf(r.s.key)}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${lines[i].map((v, k) => `${(k / (lines[i].length - 1) * 600).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}"/>`).join("")}</svg>
     <div style="margin-top:10px">${rows.map((r) => `<a href="#/explore/${r.s.key}" style="display:flex;align-items:center;gap:10px;padding:5px 0;color:var(--tx)"><span style="flex:none;width:10px;height:10px;border-radius:50%;background:${colorOf(r.s.key)}"></span>
      <span style="width:190px;flex:none" class="small">${esc(r.s.name)}</span><span style="flex:1;height:10px;background:var(--line);border-radius:9px;position:relative;overflow:hidden"><i style="position:absolute;left:0;top:0;bottom:0;width:${(Math.abs(r.ret) / maxAbs * 100).toFixed(0)}%;background:${r.ret >= 0 ? "var(--ok)" : "var(--bad)"};opacity:.75"></i></span>
      <span style="width:70px;text-align:right">${pctTxt(r.ret)}</span></a>`).join("")}</div></div>`;
  }
  const cards = secs.map((s, i) => {
    const h = hists[i], y1 = h ? retOver(h, 252) : null, m1 = h ? retOver(h, 21) : null, spark = h ? h.c.slice(-126) : null, up = spark && spark[spark.length - 1] >= spark[0];
    return `<div class="card" style="cursor:pointer" onclick="if(!event.target.closest('a'))location.hash='#/explore/${s.key}'"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h3 style="margin:0"><a href="#/explore/${s.key}" style="color:inherit">${esc(s.name)}</a></h3>
     <div class="small muted">${s.companies.toLocaleString()} companies · ${capStr(s.total_cap_b)}</div></div><div class="small" style="text-align:right">1M ${pctTxt(m1)}<br>1Y ${pctTxt(y1)}</div></div>
     ${spark ? svgLines([spark], [up ? "var(--ok)" : "var(--bad)"], 60) : ""}
     <div class="small muted">${(SECTOR_INFO[s.key] || {}).type || ""} · Top: ${s.top.slice(0, 3).map((t) => `<a href="#/stock/${esc(t.symbol)}" title="${esc(t.name)}">${esc(t.symbol)}</a>`).join(", ")}</div></div>`;
  }).join("");
  return `<h1>Explore</h1><p class="muted">See how each part of the market is doing, then tap a sector to read about it and browse its 50 largest companies.</p>${perf}
  <h2 style="margin-top:1.2em">All sectors</h2><div class="cards">${cards}</div>
  <p class="small muted">Sectors follow the standard S&amp;P GICS classification. Sector lines are market-cap-weighted indexes built from each sector's 50 largest companies, in price terms (dividends excluded). Not investment advice.</p>`;
}

let sortKey = "cap", industryFilter = "", rowRange = "3M";
const ROW_PTS = { "1M": 21, "3M": 63, "1Y": 252 };
async function sectorPage(key) {
  const s = state.sectors && state.sectors.sectors.find((x) => x.key === key);
  if (!s) return `<p>Sector not found. <a href="#/explore">Back to Explore</a></p>`;
  const info = SECTOR_INFO[key] || {};
  let sparks = {};
  try { const r = await fetch((DATA_BASE || "data/") + "sparks/" + key + ".json"); if (r.ok) sparks = await r.json(); } catch (e) {}
  const h = await getHist("_S_" + key);
  const n = ROW_PTS[rowRange];
  const perfOf = (sym) => { const c = sparks[sym] && sparks[sym].c; if (!c || c.length < 30) return null; const k = Math.min(n, c.length - 1); return (c[c.length - 1] / c[c.length - 1 - k] - 1) * 100; };
  const inds = {}; s.top.forEach((t) => { if (t.industry) inds[t.industry] = (inds[t.industry] || 0) + 1; });
  const chips = Object.entries(inds).sort((a, b) => b[1] - a[1]).slice(0, 10);
  let rows = s.top.filter((t) => !industryFilter || t.industry === industryFilter).map((t) => ({ ...t, perf: perfOf(t.symbol) }));
  const all50 = s.top.map((t) => ({ ...t, perf: perfOf(t.symbol) })).filter((t) => t.perf != null).sort((a, b) => b.perf - a.perf);
  rows.sort((a, b) => sortKey === "d1" ? b.d1 - a.d1 : sortKey === "best" ? (b.perf ?? -999) - (a.perf ?? -999) : sortKey === "worst" ? (a.perf ?? 999) - (b.perf ?? 999) : b.cap_b - a.cap_b);
  afterRender.push(() => {
    if (h) mountChart($("#secchart"), h, { money: false });
    const again = () => { state.keepScroll = true; route(); };
    document.querySelectorAll("[data-ind]").forEach((b) => b.onclick = (e) => { e.preventDefault(); industryFilter = b.dataset.ind === industryFilter ? "" : b.dataset.ind; again(); });
    document.querySelectorAll("[data-sort]").forEach((b) => b.onclick = (e) => { e.preventDefault(); sortKey = b.dataset.sort; again(); });
    document.querySelectorAll("[data-rr]").forEach((b) => b.onclick = (e) => { e.preventDefault(); rowRange = b.dataset.rr; again(); });
  });
  const stat = (label, label2) => { if (!h) return ""; const { ret } = rangeRet(h, label); return `<div class="card"><div class="small muted">${label2 || label}</div><b style="font-size:20px">${pctTxt(ret)}</b></div>`; };
  const spark = (sym) => { const c = sparks[sym] && sparks[sym].c; if (!c) return `<span class="small muted">-</span>`; const v = c.slice(-Math.min(n, c.length - 1) - 1), lo = Math.min(...v), hi = Math.max(...v), up = v[v.length - 1] >= v[0];
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:96px;height:30px;display:block"><polyline fill="none" stroke="${up ? "var(--ok)" : "var(--bad)"}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${v.map((y, i) => `${(i / (v.length - 1) * 100).toFixed(1)},${(28 - ((y - lo) / (hi - lo || 1)) * 26).toFixed(1)}`).join(" ")}"/></svg>`; };
  return `<a href="#/explore" class="small">← All sectors</a><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><h1 style="margin:0">${esc(s.name)}</h1>${info.type ? `<span class="pill" title="${esc(TYPE_TIP[info.type] || "")}">${esc(info.type)}</span>` : ""}</div>
  <div class="card" style="margin-top:12px"><p style="margin:0 0 8px">${esc(info.blurb || "")}</p>
   <p class="small" style="margin:0 0 4px"><b>What moves it:</b> ${esc(info.drivers || "")}</p><p class="small" style="margin:0 0 4px"><b>Watch out for:</b> ${esc(info.watch || "")}</p>
   ${info.type ? `<p class="small muted" style="margin:6px 0 0">${esc(info.type)}: ${esc(TYPE_TIP[info.type])}.</p>` : ""}</div>
  <div class="card">${h ? '<h3 style="margin-bottom:2px">Sector performance</h3><p class="small muted" style="margin-top:0">Index of the 50 largest companies, starting at 100. Hover or drag to explore.</p><div id="secchart"></div>' : '<p class="muted">Chart not available yet.</p>'}</div>
  <div class="hz">${stat("1M", "Past month")}${stat("3M", "Past 3 months")}${stat("YTD", "This year")}${stat("1Y", "Past year")}
   <div class="card"><div class="small muted">Companies · combined value</div><b>${s.companies.toLocaleString()} · ${capStr(s.total_cap_b)}</b></div>
   ${all50.length ? `<div class="card"><div class="small muted">Best of the 50 (${rowRange})</div><b><a href="#/stock/${esc(all50[0].symbol)}">${esc(all50[0].symbol)}</a> ${pctTxt(all50[0].perf)}</b></div><div class="card"><div class="small muted">Weakest of the 50 (${rowRange})</div><b><a href="#/stock/${esc(all50[all50.length - 1].symbol)}">${esc(all50[all50.length - 1].symbol)}</a> ${pctTxt(all50[all50.length - 1].perf)}</b></div>` : ""}</div>
  <div class="card"><h3>The 50 largest companies</h3><p class="small muted" style="margin-top:0">Ranked by market value (share price × number of shares). Tap any row to open its full chart.</p>
   <div class="tabs" style="margin-top:0"><span class="small muted" style="align-self:center">Trend chart:</span>${Object.keys(ROW_PTS).map((l) => `<a href="#" data-rr="${l}" class="${rowRange === l ? "on" : ""}">${l === "1M" ? "1 month" : l === "3M" ? "3 months" : "1 year"}</a>`).join("")}</div>
   <div class="tabs" style="margin-top:0"><span class="small muted" style="align-self:center">Sort:</span><a href="#" data-sort="cap" class="${sortKey === "cap" ? "on" : ""}">Largest</a><a href="#" data-sort="d1" class="${sortKey === "d1" ? "on" : ""}">Today's movers</a><a href="#" data-sort="best" class="${sortKey === "best" ? "on" : ""}">Best ${rowRange}</a><a href="#" data-sort="worst" class="${sortKey === "worst" ? "on" : ""}">Weakest ${rowRange}</a></div>
   <div class="tabs" style="margin-top:0">${chips.map(([nm, c]) => `<a href="#" data-ind="${esc(nm)}" class="${industryFilter === nm ? "on" : ""}">${esc(nm)} (${c})</a>`).join("")}</div>
   <div class="tw"><table><tr><th>#</th><th>Company</th><th>Trend</th><th>${rowRange}</th><th>Value</th><th>Price</th><th>Today</th></tr>
   ${rows.map((t, i) => `<tr style="cursor:pointer" onclick="location.hash='#/stock/${esc(t.symbol)}'"><td class="muted">${i + 1}</td><td><a href="#/stock/${esc(t.symbol)}"><b>${esc(t.symbol)}</b></a><div class="small muted">${esc(t.name)}${t.industry ? " · " + esc(t.industry) : ""}</div></td>
   <td>${spark(t.symbol)}</td><td>${pctTxt(t.perf)}</td><td>${capStr(t.cap_b)}</td><td>$${t.price.toLocaleString()}</td><td>${pctTxt(t.d1)}</td></tr>`).join("")}</table></div></div>`;
}

async function stockPage(sym) {
  sym = decodeURIComponent(sym).toUpperCase();
  const row = state.search && state.search.stocks.find((r) => r[0] === sym);
  const top = state.sectors && state.sectors.sectors.flatMap((s) => s.top.map((t) => ({ ...t, sector: s.key }))).find((t) => t.symbol === sym);
  const q = Q()[sym];
  let h = await getHist(sym), liveName = null;
  const secForCompare = (top && top.sector) || (row && row[2]) || null;
  const secHist = secForCompare ? await getHist("_S_" + secForCompare) : null;
  if (!h && liveOK()) {  // not one of the pre-loaded stocks: pull a year of daily prices on demand
    try { const j = await liveGet("action=chart&symbol=" + encodeURIComponent(sym) + "&range=1y"); if (j.c && j.c.length > 20) { h = { t: j.t.map(unixToDay), c: j.c }; liveName = j.name; } } catch (e) {}
  }
  const name = (top && top.name) || (row && row[1]) || (q && q.name) || liveName || sym;
  const secKey = (top && top.sector) || (row && row[2]) || null;
  const price = h ? h.c[h.c.length - 1] : top ? top.price : row ? row[4] : q ? q.price : null;
  if (price == null) return `<p>We couldn't find “${esc(sym)}”. ${liveOK() ? "" : "Sign in to look up any listed stock. "}<a href="#/explore">Browse sectors</a> or try the search box.</p>`;
  const cap = top ? top.cap_b : row ? row[3] : null, d1 = top ? top.d1 : row ? row[5] : q ? q.d1 : null;
  afterRender.push(() => { if (h) mountChart($("#stkchart"), h, { money: true, live: liveChartFor(sym), compare: secHist ? { name: SECTOR_NAME(secForCompare) + " sector", data: secHist } : null }); });
  let stats = "";
  if (h) {
    const c = h.c, last252 = c.slice(-252);
    stats = `<div class="hz"><div class="card"><div class="small muted">52-week range</div><b>$${Math.min(...last252).toFixed(2)} – $${Math.max(...last252).toFixed(2)}</b></div>
     <div class="card"><div class="small muted">1 month</div><b>${pctTxt(retOver(h, 21))}</b></div><div class="card"><div class="small muted">3 months</div><b>${pctTxt(retOver(h, 63))}</b></div>
     <div class="card"><div class="small muted">1 year</div><b>${pctTxt(retOver(h, 252))}</b></div>${h.c.length > 400 ? `<div class="card"><div class="small muted">5 years</div><b>${pctTxt(retOver(h, c.length - 1))}</b></div>` : ""}</div>`;
  }
  const peers = secKey && state.sectors ? state.sectors.sectors.find((s) => s.key === secKey).top.filter((t) => t.symbol !== sym).slice(0, 6) : [];
  return `<a href="#/explore${secKey ? "/" + secKey : ""}" class="small">← ${secKey ? esc(SECTOR_NAME(secKey)) : "Explore"}</a>
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><h1 style="margin:0">${esc(name)}</h1>
   <div class="muted">${esc(sym)}${secKey ? ` · <a href="#/explore/${secKey}">${esc(SECTOR_NAME(secKey))}</a>` : ""}${top && top.industry ? ` · ${esc(top.industry)}` : ""}</div></div>
   <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${heartBtn("stock", sym, { label: name })}<a class="btn" href="#/practice/trade/${esc(sym)}">Practice trading</a></div></div>
  <div class="card" style="margin-top:14px">${h ? '<div id="stkchart"></div>' : `<div class="strip"><div class="num" style="font-size:40px">$${price.toLocaleString()}</div><div class="small">${d1 != null ? pctTxt(d1) + " today<br>" : ""}${liveOK() ? "Live chart unavailable for this stock right now." : "Sign in to see the full interactive chart for every stock."}</div></div>`}</div>
  ${cap ? `<div class="hz"><div class="card"><div class="small muted">Market value</div><b>${capStr(cap)}</b></div><div class="card"><div class="small muted">Today</div><b>${pctTxt(d1)}</b></div></div>` : ""}${stats}
  ${peers.length ? `<div class="card"><h3>Other big names in ${esc(SECTOR_NAME(secKey))}</h3>${peers.map((t) => `<div class="item" style="align-items:center"><a href="#/stock/${esc(t.symbol)}" style="flex:1"><b>${esc(t.symbol)}</b> <span class="small muted">${esc(t.name)}</span></a><span class="small">${capStr(t.cap_b)} ${pctTxt(t.d1)}</span></div>`).join("")}</div>` : ""}
  <p class="small muted">Prices are end-of-day unless you open a 1D or 1W chart (live, about 15 minutes delayed). Learn what these numbers mean in <a href="#/learn/1">Lesson 1</a> and <a href="#/learn/5">Lesson 5</a>. Not investment advice.</p>`;
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
    if (res.length < 3 && q.length >= 2 && liveOK()) { clearTimeout(box._t); box._t = setTimeout(() => liveSearch(q, out, box), 350); }
    out.innerHTML = res.slice(0, 8).map((r) => `<a href="#/stock/${encodeURIComponent(r[0])}" data-sym="${esc(r[0])}"><b>${esc(r[0])}</b> <span class="small muted">${esc(r[1])}</span><span class="small" style="float:right">$${r[4]}</span></a>`).join("") || `<div class="small muted" style="padding:10px">No matches.</div>`;
    out.style.display = "block";
  };
  box.addEventListener("input", run); box.addEventListener("focus", run);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = out.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); box.blur(); out.style.display = "none"; } } if (e.key === "Escape") { out.style.display = "none"; box.blur(); } });
  out.addEventListener("click", () => { out.style.display = "none"; box.value = ""; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".gsw")) out.style.display = "none"; });
}

async function liveSearch(q, out, box) {
  if (box.value.trim().toLowerCase() !== q) return;
  try {
    const j = await liveGet("action=search&q=" + encodeURIComponent(q));
    const have = new Set([...out.querySelectorAll("a")].map((a) => a.dataset.sym));
    const more = (j.results || []).filter((r) => !have.has(r.symbol)).slice(0, 6);
    if (!more.length) return;
    out.insertAdjacentHTML("beforeend", more.map((r) => `<a href="#/stock/${encodeURIComponent(r.symbol)}" data-sym="${esc(r.symbol)}"><b>${esc(r.symbol)}</b> <span class="small muted">${esc(r.name)}</span><span class="small muted" style="float:right">live</span></a>`).join(""));
    out.style.display = "block";
  } catch (e) {}
}
