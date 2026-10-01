// Explore tools: heat map, stock screener, compare. Shared tab bar.
function exploreTabs(cur) {
  return `<div class="tabs">${[["", "Sectors"], ["heatmap", "Heat map"], ["screener", "Screener"], ["compare", "Compare"]].map(([k, l]) => `<a class="${cur === k ? "on" : ""}" href="#/explore${k ? "/" + k : ""}">${l}</a>`).join("")}</div>`;
}

// ---------- squarified treemap ----------
function squarify(vals, x, y, w, h) {
  const total = vals.reduce((a, b) => a + b, 0), areas = vals.map((v) => (v / total) * w * h), rects = [];
  let row = [], idx = [], i = 0;
  const worst = (r, side) => { const s = r.reduce((a, b) => a + b, 0), mx = Math.max(...r), mn = Math.min(...r); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  const flush = () => {
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach((a, k) => { const rh = a / cw; rects.push({ x, y: cy, w: cw, h: rh, i: idx[k] }); cy += rh; }); x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; row.forEach((a, k) => { const rw = a / rh; rects.push({ x: cx, y, w: rw, h: rh, i: idx[k] }); cx += rw; }); y += rh; h -= rh; }
    row = []; idx = [];
  };
  while (i < areas.length) {
    const side = Math.min(w, h), a = areas[i];
    if (!row.length || worst(row.concat(a), side) <= worst(row, side)) { row.push(a); idx.push(i); i++; } else flush();
  }
  if (row.length) flush();
  return rects;
}

let heatRange = "1D";
const HEAT_PTS = { "1M": 21, "3M": 63, "1Y": 252 }, HEAT_SCALE = { "1D": 3, "1M": 15, "3M": 25, "1Y": 60 };
function heatColor(v, scale) {
  if (v == null) return "var(--card)";
  const t = Math.max(-1, Math.min(1, v / scale)), a = Math.round(14 + Math.abs(t) * 66);
  return `color-mix(in srgb, ${t >= 0 ? "var(--ok)" : "var(--bad)"} ${a}%, var(--card))`;
}

async function heatmapPage() {
  if (!state.sectors) return `<h1>Explore</h1>${exploreTabs("heatmap")}<div class="card muted">Data isn't available right now.</div>`;
  const secs = state.sectors.sectors;
  let perf = null;  // symbol -> % over the chosen range (when not "today")
  if (heatRange !== "1D") {
    perf = {};
    const bundles = await Promise.all(secs.map((s) => fetch((DATA_BASE || "data/") + "sparks/" + s.key + ".json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))));
    bundles.forEach((b) => Object.entries(b).forEach(([sym, o]) => { const c = o.c, n = Math.min(HEAT_PTS[heatRange], c.length - 1); perf[sym] = (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100; }));
  }
  const W = 1000, H = 640, scale = HEAT_SCALE[heatRange];
  const sectorTiles = secs.map((s) => ({ s, value: s.top.reduce((a, t) => a + t.cap_b, 0) })).sort((a, b) => b.value - a.value);
  const outer = squarify(sectorTiles.map((t) => t.value), 0, 0, W, H);
  let tiles = "", labels = "";
  outer.forEach((r) => {
    const { s } = sectorTiles[r.i], pad = 2, lab = r.h > 60 && r.w > 90 ? 16 : 0;
    const stocks = [...s.top].sort((a, b) => b.cap_b - a.cap_b);
    const inner = squarify(stocks.map((t) => t.cap_b), r.x + pad, r.y + pad + lab, Math.max(r.w - pad * 2, 1), Math.max(r.h - pad * 2 - lab, 1));
    if (lab) labels += `<a href="#/explore/${s.key}" class="hm-lab" style="left:${r.x / W * 100}%;top:${r.y / H * 100}%;width:${r.w / W * 100}%">${esc(s.name)}</a>`;
    inner.forEach((q) => {
      const t = stocks[q.i], v = perf ? perf[t.symbol] : t.d1, big = q.w * q.h > 3200, mid = q.w * q.h > 1500 && q.w > 34;
      tiles += `<a href="#/stock/${esc(t.symbol)}" class="hm-t" title="${esc(t.symbol)} · ${esc(t.name)} · ${capStr(t.cap_b)} · ${v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(2) + "%"}" style="left:${q.x / W * 100}%;top:${q.y / H * 100}%;width:${q.w / W * 100}%;height:${q.h / H * 100}%;background:${heatColor(v, scale)}">${mid ? `<b>${esc(t.symbol)}</b>${big && v != null ? `<span>${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>` : ""}` : ""}</a>`;
    });
  });
  afterRender.push(() => document.querySelectorAll("[data-hr]").forEach((b) => b.onclick = (e) => { e.preventDefault(); heatRange = b.dataset.hr; state.keepScroll = true; route(); }));
  return `<h1>Explore</h1>${exploreTabs("heatmap")}
  <div class="card"><h3 style="margin-bottom:2px">Market heat map</h3><p class="small muted" style="margin-top:0">Each box is a company; bigger box = bigger company. Green = up, red = down. Tap any box for its chart, or a sector name to open the sector.</p>
   <div class="tabs" style="margin-top:6px">${[["1D", "Today"], ["1M", "1 month"], ["3M", "3 months"], ["1Y", "1 year"]].map(([k, l]) => `<a href="#" data-hr="${k}" class="${heatRange === k ? "on" : ""}">${l}</a>`).join("")}</div>
   <div class="hm" style="position:relative;width:100%;padding-bottom:${H / W * 100}%;border-radius:12px;overflow:hidden;background:var(--line)"><div style="position:absolute;inset:0">${tiles}${labels}</div></div>
   <p class="small muted" style="margin-bottom:0">Color scale: full green or red at ±${scale}%. Shows the 50 largest companies in each sector.</p></div>`;
}

// ---------- screener ----------
const CAP_BUCKETS = { any: [0, 1e9], mega: [200, 1e9], large: [10, 200], mid: [2, 10], small: [0.3, 2] };
let SCR = { q: "", sector: "", cap: "any", move: "any", pmin: "", pmax: "", sort: "cap", dir: "desc", shown: 50 };
function screenerResults() {
  const rows = state.search.stocks, [cl, ch] = CAP_BUCKETS[SCR.cap], q = SCR.q.trim().toLowerCase();
  let r = rows.filter((x) => (!q || x[0].toLowerCase().includes(q) || x[1].toLowerCase().includes(q)) && (!SCR.sector || x[2] === SCR.sector) && x[3] >= cl && x[3] < ch
    && (SCR.move === "any" || (SCR.move === "up" && x[5] > 0) || (SCR.move === "down" && x[5] < 0) || (SCR.move === "up2" && x[5] >= 2) || (SCR.move === "down2" && x[5] <= -2))
    && (SCR.pmin === "" || x[4] >= +SCR.pmin) && (SCR.pmax === "" || x[4] <= +SCR.pmax));
  const key = { cap: 3, move: 5, price: 4, name: 1 }[SCR.sort], sgn = SCR.dir === "desc" ? -1 : 1;
  r.sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * sgn);
  return r;
}
function screenerTable() {
  const r = screenerResults(), shown = r.slice(0, SCR.shown);
  return `<p class="small muted">${r.length.toLocaleString()} matching companies${r.length > SCR.shown ? `, showing the first ${SCR.shown}` : ""}.</p>
  <div class="tw"><table><tr><th>Company</th><th>Sector</th><th>Value</th><th>Price</th><th>Today</th></tr>${shown.map((x) => `<tr style="cursor:pointer" onclick="location.hash='#/stock/${esc(x[0])}'"><td><a href="#/stock/${esc(x[0])}"><b>${esc(x[0])}</b></a><div class="small muted">${esc(x[1])}</div></td>
   <td class="small muted">${esc(SECTOR_NAME(x[2]))}</td><td>${capStr(x[3])}</td><td>$${x[4].toLocaleString()}</td><td>${pctTxt(x[5])}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No companies match. Try loosening a filter.</td></tr>'}</table></div>
  ${r.length > SCR.shown ? `<button class="btn ghost" id="scrmore">Show 50 more</button>` : ""}`;
}
function screenerPage() {
  if (!state.search) return `<h1>Explore</h1>${exploreTabs("screener")}<div class="card muted">Data isn't available right now.</div>`;
  afterRender.push(() => {
    const out = $("#scrout"), redraw = () => { out.innerHTML = screenerTable(); const m = $("#scrmore"); if (m) m.onclick = () => { SCR.shown += 50; redraw(); }; };
    const bind = (id, key, ev = "input") => { const el = $("#" + id); if (el) el.addEventListener(ev, () => { SCR[key] = el.value; SCR.shown = 50; redraw(); }); };
    bind("scq", "q"); bind("scs", "sector", "change"); bind("scc", "cap", "change"); bind("scm", "move", "change"); bind("scmin", "pmin"); bind("scmax", "pmax"); bind("sso", "sort", "change"); bind("ssd", "dir", "change");
    redraw();
  });
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return `<h1>Explore</h1>${exploreTabs("screener")}
  <div class="card"><h3 style="margin-bottom:2px">Stock screener</h3><p class="small muted" style="margin-top:0">Filter ${state.search.stocks.length.toLocaleString()} US-listed companies. Tap a row to open its chart.</p>
   <div class="scr"><label>Search<input id="scq" placeholder="name or ticker" value="${esc(SCR.q)}"></label>
   <label>Sector${sel("scs", [["", "All sectors"], ...state.sectors.sectors.map((s) => [s.key, s.name])], SCR.sector)}</label>
   <label>Company size${sel("scc", [["any", "Any"], ["mega", "Mega (over $200B)"], ["large", "Large ($10B to $200B)"], ["mid", "Mid ($2B to $10B)"], ["small", "Small ($300M to $2B)"]], SCR.cap)}</label>
   <label>Today's move${sel("scm", [["any", "Any"], ["up", "Up"], ["down", "Down"], ["up2", "Up 2% or more"], ["down2", "Down 2% or more"]], SCR.move)}</label>
   <label>Price from $<input id="scmin" type="number" min="0" step="any" value="${esc(SCR.pmin)}"></label><label>to $<input id="scmax" type="number" min="0" step="any" value="${esc(SCR.pmax)}"></label>
   <label>Sort by${sel("sso", [["cap", "Market value"], ["move", "Today's move"], ["price", "Price"], ["name", "Name"]], SCR.sort)}</label><label>Order${sel("ssd", [["desc", "High to low"], ["asc", "Low to high"]], SCR.dir)}</label></div>
   <div id="scrout"></div></div>`;
}

// ---------- compare ----------
const CMP_COLORS = ["#5b4bff", "#22d3a6", "#f5a524", "#e5484d", "#3b82f6"];
let cmpRange = "1Y";
async function histFor(sym) {
  let h = await getHist(sym);
  if (!h && typeof liveOK === "function" && liveOK()) {
    try { const j = await liveGet("action=chart&symbol=" + encodeURIComponent(sym) + "&range=1y"); if (j.c && j.c.length > 20) h = { t: j.t.map(unixToDay), c: j.c }; } catch (e) {}
  }
  return h;
}
async function comparePage(list) {
  const syms = (list ? decodeURIComponent(list).toUpperCase().split(",") : []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const data = await Promise.all(syms.map(histFor));
  const items = syms.map((s, i) => ({ sym: s, h: data[i], name: ((state.search && state.search.stocks.find((r) => r[0] === s)) || [s, s])[1], color: CMP_COLORS[i] }));
  const ok = items.filter((x) => x.h);
  const nav = (arr) => "#/explore/compare/" + arr.join(",");
  afterRender.push(() => {
    const inp = $("#cmpin"), res = $("#cmpres");
    if (inp) {
      inp.addEventListener("input", () => {
        const q = inp.value.trim().toLowerCase(); if (!q || !state.search) { res.style.display = "none"; return; }
        const m = state.search.stocks.filter((r) => r[0].toLowerCase().startsWith(q) || r[1].toLowerCase().includes(q)).slice(0, 6);
        res.innerHTML = m.map((r) => `<a href="${nav([...syms.filter((x) => x !== r[0]), r[0]])}"><b>${esc(r[0])}</b> <span class="small muted">${esc(r[1])}</span></a>`).join("") || '<div class="small muted" style="padding:10px">No matches.</div>'; res.style.display = "block";
      });
    }
    document.querySelectorAll("[data-cr]").forEach((b) => b.onclick = (e) => { e.preventDefault(); cmpRange = b.dataset.cr; state.keepScroll = true; route(); });
    if (ok.length >= 1) mountMultiChart($("#cmpchart"), ok, cmpRange);
  });
  const rets = (h, n) => (h.c.length > n ? (h.c[h.c.length - 1] / h.c[h.c.length - 1 - n] - 1) * 100 : null);
  const table = ok.length ? `<div class="tw"><table><tr><th>Stock</th><th>Price</th><th>1 month</th><th>3 months</th><th>1 year</th><th>Value</th></tr>${ok.map((x) => {
    const row = state.search && state.search.stocks.find((r) => r[0] === x.sym);
    return `<tr><td><span style="color:${x.color}">●</span> <a href="#/stock/${esc(x.sym)}"><b>${esc(x.sym)}</b></a><div class="small muted">${esc(x.name)}</div></td><td>$${x.h.c[x.h.c.length - 1].toLocaleString()}</td><td>${pctTxt(rets(x.h, 21))}</td><td>${pctTxt(rets(x.h, 63))}</td><td>${pctTxt(rets(x.h, 252))}</td><td>${row ? capStr(row[3]) : "-"}</td></tr>`;
  }).join("")}</table></div>` : "";
  return `<h1>Explore</h1>${exploreTabs("compare")}
  <div class="card"><h3 style="margin-bottom:2px">Compare stocks</h3><p class="small muted" style="margin-top:0">Put up to 5 companies on one chart. Each line shows % change from the start of the period, so a $20 stock and a $2,000 stock can be compared fairly.</p>
   <div class="gsw" style="max-width:420px;margin:0 0 10px"><input id="cmpin" placeholder="${syms.length >= 5 ? "Remove one to add another" : "Add a company (name or ticker)…"}" autocomplete="off" ${syms.length >= 5 ? "disabled" : ""} style="width:100%"><div id="cmpres" style="display:none;position:absolute;top:44px;left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;z-index:30"></div></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${items.map((x) => `<span class="pill" style="background:color-mix(in srgb,${x.color} 16%,transparent);color:var(--tx)"><span style="color:${x.color}">●</span> ${esc(x.sym)}${x.h ? "" : " (no data)"} <a href="${nav(syms.filter((s) => s !== x.sym))}" style="margin-left:4px" title="Remove">✕</a></span>`).join("") || '<span class="small muted">No companies yet. Try the search box, or <a href="#/explore/compare/NVDA,AMD,AVGO">NVIDIA vs AMD vs Broadcom</a> or <a href="#/explore/compare/AAPL,MSFT,GOOGL">Apple vs Microsoft vs Alphabet</a>.</span>'}</div>
   ${ok.length ? `<div class="tabs" style="margin-top:0">${["1M", "3M", "6M", "YTD", "1Y", "5Y"].map((l) => `<a href="#" data-cr="${l}" class="${cmpRange === l ? "on" : ""}">${l}</a>`).join("")}</div><div id="cmpchart"></div>${table}` : ""}</div>`;
}

function mountMultiChart(el, items, label) {
  const RANGE = { "1M": 30, "3M": 91, "6M": 182, "YTD": "ytd", "1Y": 365, "5Y": "all" }[label] || 365;
  const sl = items.map((x) => sliceRange(x.h, RANGE));
  // common start: latest of the individual starts, so every line begins at 0%
  const start = Math.max(...sl.map((s) => s.t[0])), series = items.map((x, i) => { const k = sl[i].t.findIndex((t) => t >= start); const t = sl[i].t.slice(k), c = sl[i].c.slice(k); return { ...x, t, pct: c.map((v) => (v / c[0] - 1) * 100) }; });
  const ref = series.reduce((a, b) => (b.t.length > a.t.length ? b : a)), all = series.flatMap((s) => s.pct), lo = Math.min(...all, 0), hi = Math.max(...all, 0), pad = (hi - lo) * 0.08 || 1, H = 240;
  const Y = (v) => H - 8 - ((v - lo + pad * 0.5) / (hi - lo + pad)) * (H - 16), X = (i, n) => (n > 1 ? (i / (n - 1)) * 600 : 0);
  el.innerHTML = `<div class="chh"><div id="mchead" class="small"></div></div><svg viewBox="0 0 600 ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;touch-action:pan-y;cursor:crosshair">
   <line x1="0" x2="600" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--mut)" stroke-opacity=".5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
   ${series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${s.pct.map((v, i) => `${X(i, s.pct.length).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}"/>`).join("")}
   <line id="mcx" y1="0" y2="${H}" stroke="var(--mut)" vector-effect="non-scaling-stroke" style="display:none"/></svg>`;
  const head = el.querySelector("#mchead"), svg = el.querySelector("svg"), line = el.querySelector("#mcx");
  const show = (frac) => {
    const rows = series.map((s) => { const i = Math.round(frac * (s.pct.length - 1)); return { s, v: s.pct[i], d: s.t[i] }; });
    head.innerHTML = (frac == null ? "" : `<span class="muted">${fmtDate(rows[0].d)}</span> `) + rows.map((r) => `<span style="margin-right:12px"><span style="color:${r.s.color}">●</span> <b>${esc(r.s.sym)}</b> <span style="color:${r.v >= 0 ? "var(--ok)" : "var(--bad)"};font-weight:700">${r.v >= 0 ? "+" : ""}${r.v.toFixed(1)}%</span></span>`).join("");
  };
  show(1);
  svg.addEventListener("pointermove", (ev) => { const r = svg.getBoundingClientRect(), f = Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1); line.setAttribute("x1", f * 600); line.setAttribute("x2", f * 600); line.style.display = ""; show(f); });
  svg.addEventListener("pointerleave", () => { line.style.display = "none"; show(1); });
}
