// Economy (Markets > Economy): inflation tracker, Treasury yields and the yield curve, jobs, growth and market stress, from public FRED data.
// Each indicator has its latest reading, history, a plain-English explanation and a status from a simple fixed rule shown on the page.
// Statuses are yardsticks, not forecasts. No ratings, no predictions.
const ECON_GROUPS = [
  ["inflation", "Inflation", "Are prices rising too fast? The Federal Reserve aims for 2% a year."],
  ["rates", "Interest rates & yields", "What it costs to borrow, and what the bond market is saying about the road ahead."],
  ["jobs", "Jobs", "Can people who want work find it?"],
  ["growth", "Growth & spending", "Is the economy expanding, and are people spending?"],
  ["stress", "Market stress", "Are financial markets calm or under strain?"],
];
const ECON_STATE = { ok: ["Healthy", "var(--ok)"], watch: ["Watch", "var(--warn)"], bad: ["Strained", "var(--bad)"] };
const ECON_RANGES = [["1Y", 365], ["5Y", 1826], ["10Y", 3652], ["25Y", 9131]];
const ECON = { d: null };
// Whether a rise is good, bad or neither, so charts are colored by meaning (a spike in unemployment is red, not green)
const ECON_UP_BAD = new Set(["cpi", "core_cpi", "pce", "core_pce", "shelter", "food", "energy", "mich", "mortgage", "hy", "unrate", "u6", "claims", "sahm", "vix", "nfci", "stlfsi"]);
const ECON_UP_GOOD = new Set(["wages_x", "payrolls", "openings", "lfpr", "gdp", "indpro", "retail", "sentiment", "t10y2y", "t10y3m"]);
const econTone = (k) => (ECON_UP_BAD.has(k) ? "upBad" : ECON_UP_GOOD.has(k) ? "upGood" : "neutral");
const econMonth = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const econDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const econDate = (it) => (it.freq === "M" || it.freq === "Q" ? econMonth(it.date) : econDay(it.date));

function econFmt(it, v, sign) {
  if (v == null) return "-";
  const s = sign && v > 0 ? "+" : "", d = it.dec;
  if (it.unit === "%") return s + v.toFixed(d) + "%";
  if (it.unit === "pts") return s + v.toFixed(d) + " pts";
  if (it.unit === "thousand") return it.key === "payrolls" ? s + Math.round(v).toLocaleString() + "K" : v >= 1000 ? (v / 1000).toFixed(2) + "M" : Math.round(v).toLocaleString() + "K";
  return s + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const econChip = (st, rule) => (st && ECON_STATE[st] ? `<span class="pill" title="${esc(rule || "")}" style="font-size:11px;background:color-mix(in srgb,${ECON_STATE[st][1]} 18%,transparent);color:${ECON_STATE[st][1]};font-weight:700">${ECON_STATE[st][0]}</span>` : "");
function econSpark(it, w = 120, h = 30, days = 1826) {
  const last = it.t[it.t.length - 1], idx = it.t.map((t, i) => (t >= last - days ? i : -1)).filter((i) => i >= 0), a = idx.map((i) => it.v[i]);
  const tone = econTone(it.key), up = a[a.length - 1] >= a[0], color = tone === "neutral" ? "var(--brand)" : (tone === "upBad") === up ? "var(--bad)" : "var(--ok)";
  return typeof cgSpark === "function" ? cgSpark(a.length > 80 ? a.filter((_, i) => i % Math.ceil(a.length / 80) === 0).concat([a[a.length - 1]]) : a, w, h, color) : "";
}
function econCard(it) {
  const ch = it.latest - it.prev, up = ch > 0;
  return `<a class="card" href="#/markets/economy/${esc(it.key)}" style="color:inherit;display:block;padding:14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="small muted">${esc(it.label)}</div>${econChip(it.state, it.rule)}</div>
    <b style="font-size:24px">${econFmt(it, it.latest)}</b> <span class="small muted">${esc(econDate(it))}</span>
    <div class="small muted">Before: ${econFmt(it, it.prev)} <span style="color:${Math.abs(ch) < 1e-9 ? "var(--mut)" : up ? "var(--tx)" : "var(--tx)"}">(${up ? "▲" : ch < 0 ? "▼" : "•"})</span></div><div style="margin-top:6px">${econSpark(it)}</div></a>`;
}

// ---- generic multi-line chart (inflation measures with the Fed's 2% line) ----
function econMulti(lines, { years = 10, ref = null, w = 640, h = 240 } = {}) {
  const pad = { l: 40, r: 12, t: 14, b: 26 }, last = Math.max(...lines.map((l) => l.it.t[l.it.t.length - 1])), from = last - years * 365.25;
  const pts = lines.map((l) => l.it.t.map((t, i) => [t, l.it.v[i]]).filter(([t]) => t >= from));
  const all = pts.flat().map((p) => p[1]).concat(ref != null ? [ref] : []);
  let lo = Math.min(...all), hi = Math.max(...all); lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const X = (t) => pad.l + ((t - from) / (last - from)) * (w - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b);
  const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1, grid = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const yrs = []; const y0 = new Date(Date.UTC(2000, 0, 1) + from * 864e5).getUTCFullYear() + 1, y1 = new Date(Date.UTC(2000, 0, 1) + last * 864e5).getUTCFullYear();
  for (let y = y0; y <= y1; y += Math.max(1, Math.round(years / 6))) yrs.push(y);
  const tOf = (y) => (Date.UTC(y, 0, 1) - Date.UTC(2000, 0, 1)) / 864e5;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img" aria-label="Inflation measures over the last ${years} years">
    ${grid.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--mut)">${v}%</text>`).join("")}
    ${yrs.map((y) => `<text x="${X(tOf(y)).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="var(--mut)">${y}</text>`).join("")}
    ${ref != null ? `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(ref).toFixed(1)}" y2="${Y(ref).toFixed(1)}" stroke="var(--tx)" stroke-dasharray="5 4" opacity=".6"/><text x="${w - pad.r}" y="${(Y(ref) - 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--tx)">Fed's 2% goal</text>` : ""}
    ${lines.map((l, i) => `<polyline points="${pts[i].map(([t, v]) => X(t).toFixed(1) + "," + Y(v).toFixed(1)).join(" ")}" fill="none" stroke="${l.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join("")}
    ${lines.map((l, i) => { const p = pts[i][pts[i].length - 1]; return `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.5" fill="${l.color}"/>`; }).join("")}</svg>
   <div class="small" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">${lines.map((l) => `<span><i style="display:inline-block;width:14px;height:3px;background:${l.color};vertical-align:middle;margin-right:5px;border-radius:2px"></i>${esc(l.it.label)} <b>${l.it.latest.toFixed(1)}%</b></span>`).join("")}</div>`;
}

// ---- the yield curve: yield by length of loan, today vs a month ago vs a year ago ----
function econCurve(c) {
  const w = 640, h = 250, pad = { l: 40, r: 14, t: 14, b: 28 }, labs = c.labels, series = [["year", "A year ago", "var(--mut)"], ["month", "A month ago", "var(--brand2, var(--brand))"], ["now", "Latest", "var(--brand)"]];
  const vals = series.flatMap(([k]) => labs.map((l) => c[k][l])).filter((v) => v != null);
  const lo = Math.floor(Math.min(...vals) - 0.25), hi = Math.ceil(Math.max(...vals) + 0.25);
  const X = (i) => pad.l + (i / (labs.length - 1)) * (w - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b);
  const grid = []; for (let v = lo; v <= hi; v += 1) grid.push(v);
  const path = (k) => labs.map((l, i) => (c[k][l] == null ? null : X(i).toFixed(1) + "," + Y(c[k][l]).toFixed(1))).filter(Boolean).join(" ");
  const short = c.now["2Y"], long = c.now["10Y"];
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img" aria-label="Treasury yield curve">
    ${grid.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--mut)">${v}%</text>`).join("")}
    ${labs.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${h - 9}" text-anchor="middle" font-size="10" fill="var(--mut)">${l}</text>`).join("")}
    ${series.map(([k, , col]) => `<polyline points="${path(k)}" fill="none" stroke="${col}" stroke-width="${k === "now" ? 2.6 : 1.8}" ${k === "year" ? 'stroke-dasharray="4 3"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`).join("")}
    ${labs.map((l, i) => (c.now[l] == null ? "" : `<circle cx="${X(i).toFixed(1)}" cy="${Y(c.now[l]).toFixed(1)}" r="3.5" fill="var(--brand)"/>`)).join("")}</svg>
   <div class="small" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">${series.map(([, l, col]) => `<span><i style="display:inline-block;width:14px;height:3px;background:${col};vertical-align:middle;margin-right:5px;border-radius:2px"></i>${l}</span>`).reverse().join("")}</div>
   <p class="small" style="margin:8px 0 0">${short != null && long != null ? (short > long ? `<b>The curve is inverted</b> between 2 and 10 years: the 2-year pays ${short.toFixed(2)}% and the 10-year ${long.toFixed(2)}%. Short loans paying more than long ones has often come before recessions.` : `<b>The curve slopes upward</b> between 2 and 10 years: the 2-year pays ${short.toFixed(2)}% and the 10-year ${long.toFixed(2)}%, the normal shape, where lenders ask for more to lend for longer.`) : ""} Data for ${esc(econDay(c.date))}.</p>`;
}

async function econLoad() {
  if (!ECON.d) ECON.d = await loadJson("economy.json");
  return ECON.d;
}

async function econView(sub) {
  const d = await econLoad();
  if (!d) return `<div class="card muted">Economy data isn't available right now.</div>`;
  const I = d.items;
  if (sub && I[sub]) return econDetail(I[sub], d);
  if (sub && ECON_GROUPS.some((g) => g[0] === sub)) return econGroup(sub, d);
  // ---- overview ----
  const S = d.summary, rated = d.order.filter((k) => I[k].state);
  const row = (k) => { const it = I[k]; return `<a class="item" href="#/markets/economy/${esc(k)}" style="align-items:center;color:inherit"><div style="flex:1"><b>${esc(it.label)}</b><div class="small muted">${esc(econDate(it))}</div></div><b style="margin-right:10px">${econFmt(it, it.latest)}</b>${econChip(it.state, it.rule)}</a>`; };
  const heads = ["cpi", "unrate", "y10", "ffr", "gdp", "payrolls"].filter((k) => I[k]);
  const tabs = `<div class="tabs" style="margin:0 0 12px">${[["", "Overview"]].concat(ECON_GROUPS.map((g) => [g[0], g[1]])).map(([k, l]) => `<a class="${(sub || "") === k ? "on" : ""}" href="#/markets/economy${k ? "/" + k : ""}">${l}</a>`).join("")}</div>`;
  return `${tabs}<div class="card big"><span class="pill g">US economy</span><h2 style="margin-top:8px">${S.ok} of ${S.n} gauges look healthy, ${S.watch} say watch, ${S.bad} are strained</h2>
    <p class="muted" style="margin:6px 0 0">Prices are rising ${I.cpi ? "<b>" + I.cpi.latest.toFixed(1) + "%</b> a year" : ""}${I.core_pce ? ` (the Fed's own gauge reads <b>${I.core_pce.latest.toFixed(1)}%</b> against a 2% goal)` : ""}, unemployment is <b>${I.unrate ? I.unrate.latest.toFixed(1) : "-"}%</b>, and the 10-year Treasury pays <b>${I.y10 ? I.y10.latest.toFixed(2) : "-"}%</b>. Tap any gauge for its history and what it means.</p>
    <div style="display:flex;height:12px;border-radius:8px;overflow:hidden;margin-top:12px"><i style="flex:${S.ok};background:var(--ok)"></i><i style="flex:${S.watch};background:var(--warn)"></i><i style="flex:${S.bad};background:var(--bad)"></i></div>
    <p class="small muted" style="margin:10px 0 0">Each status comes from a simple rule you can read on the gauge's page (for example, "healthy: unemployment 4.5% or less"). They are yardsticks for where things stand today. They are not forecasts, and a single reading can mislead. Data: ${esc(d.source)}. Updated ${esc((d.generated || "").slice(0, 10))}.</p></div>
  <h2>The headline numbers</h2><div class="hz">${heads.map((k) => econCard(I[k])).join("")}</div>
  ${d.curve ? `<div class="card"><h3>The Treasury yield curve</h3><p class="small muted" style="margin:0 0 8px">What the US government pays to borrow for 1 month up to 30 years. <a href="#/markets/economy/rates">More on yields and rates →</a></p>${econCurve(d.curve)}</div>` : ""}
  ${ECON_GROUPS.map(([g, name, blurb]) => { const ks = rated.filter((k) => I[k].group === g); return ks.length ? `<div class="card"><h3><a href="#/markets/economy/${g}" style="color:inherit">${name} →</a></h3><p class="small muted" style="margin:0 0 4px">${blurb}</p>${ks.map(row).join("")}</div>` : ""; }).join("")}
  <p class="small muted">Educational information only. Not investment advice. Past patterns, such as an inverted yield curve or a rise in unemployment, have not always been followed by a recession and do not predict what happens next.</p>`;
}

function econGroup(g, d) {
  const I = d.items, [, name, blurb] = ECON_GROUPS.find((x) => x[0] === g), ks = d.order.filter((k) => I[k].group === g);
  const tabs = `<div class="tabs" style="margin:0 0 12px">${[["", "Overview"]].concat(ECON_GROUPS.map((x) => [x[0], x[1]])).map(([k, l]) => `<a class="${g === k ? "on" : ""}" href="#/markets/economy${k ? "/" + k : ""}">${l}</a>`).join("")}</div>`;
  let top = "";
  if (g === "inflation") {
    const L = [["cpi", "var(--bad)"], ["core_cpi", "var(--warn)"], ["pce", "var(--brand)"], ["core_pce", "var(--ok)"]].filter(([k]) => I[k]).map(([k, color]) => ({ it: I[k], color }));
    top = `<div class="card"><h3>Inflation: the four main measures</h3><p class="small muted" style="margin:0 0 8px">How much higher prices are than a year earlier, last 10 years. The dashed line is the Fed's 2% goal.</p>${econMulti(L, { years: 10, ref: 2 })}</div>`;
  } else if (g === "rates" && d.curve) {
    top = `<div class="card"><h3>The Treasury yield curve</h3><p class="small muted" style="margin:0 0 8px">What the US government pays to borrow for different lengths of time. Normally longer loans pay more. When the line tilts down the other way, it is called an <b>inversion</b>.</p>${econCurve(d.curve)}</div>
     <div class="card"><h3>How to read it</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.55"><li><b>Treasury yields</b> are what investors earn lending to the US government, the safest borrower. They set the floor for nearly every other interest rate.</li><li><b>When yields rise,</b> existing bonds fall in price, mortgages and business loans get more expensive, and stocks face a higher hurdle.</li><li><b>The short end follows the Fed;</b> the long end follows expectations for growth, inflation and government borrowing.</li></ul></div>`;
  }
  return `${tabs}<h2 style="margin-top:0">${name}</h2><p class="muted" style="margin-top:-6px">${blurb}</p>${top}<div class="hz">${ks.map((k) => econCard(I[k])).join("")}</div>
    <p class="small muted">Tap a card for the full history and what it means. Educational information only. Not investment advice.</p>`;
}

function econDetail(it, d) {
  const [, gname] = ECON_GROUPS.find((x) => x[0] === it.group), ch = it.latest - it.prev, yrch = it.year_ago != null ? it.latest - it.year_ago : null;
  const days = (id) => `${ECON_RANGES.map(([l, n]) => `<button class="btn ghost" data-er="${n}" style="padding:4px 12px;font-size:13px">${l}</button>`).join("")}<button class="btn ghost" data-er="0" style="padding:4px 12px;font-size:13px">Max</button>`;
  afterRender.push(() => {
    const box = $("#econchart"); if (!box) return;
    let cur = it.freq === "D" ? 1826 : 3652;
    const draw = () => {
      const last = it.t[it.t.length - 1], i0 = cur ? it.t.findIndex((t) => t >= last - cur) : 0, a = Math.max(0, i0);
      box.innerHTML = ""; mountChart(box, { t: it.t.slice(a), c: it.v.slice(a) }, { money: false, decimals: it.dec, noRanges: true, lineOnly: true, unit: it.unit === "%" ? "yield" : undefined, tone: econTone(it.key), rangeName: cur ? "last " + Math.round(cur / 365.25) + "Y" : "all time" });
      document.querySelectorAll("[data-er]").forEach((b) => b.classList.toggle("on", +b.dataset.er === cur));
    };
    document.querySelectorAll("[data-er]").forEach((b) => (b.onclick = () => { cur = +b.dataset.er; draw(); }));
    draw();
  });
  const same = d.order.filter((k) => d.items[k].group === it.group && k !== it.key).slice(0, 6);
  return `<a href="#/markets/economy/${it.group}" class="small">← ${esc(gname)}</a>
   <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><h1 style="margin:0">${esc(it.label)}</h1><div class="muted">${econChip(it.state, it.rule)} ${esc(econDate(it))}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:36px">${econFmt(it, it.latest)}</div></div></div>
   <div class="card" style="margin-top:14px"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${days()}</div><div id="econchart"></div></div>
   <div class="hz"><div class="card"><div class="small muted">Previous reading</div><b>${econFmt(it, it.prev)}</b><div class="small muted">${esc(econDate({ freq: it.freq, date: it.prev_date }))}</div></div>
    ${it.year_ago != null ? `<div class="card"><div class="small muted">A year ago</div><b>${econFmt(it, it.year_ago)}</b>${yrch != null ? `<div class="small muted">${yrch > 0 ? "Up" : "Down"} ${Math.abs(yrch).toFixed(it.dec)}${it.unit === "%" ? " pts" : ""}</div>` : ""}</div>` : ""}
    <div class="card"><div class="small muted">Highest since 2000</div><b>${econFmt(it, it.hi)}</b></div><div class="card"><div class="small muted">Lowest since 2000</div><b>${econFmt(it, it.lo)}</b></div></div>
   <div class="card"><h3>What it is</h3><p style="margin:0">${esc(it.what)}</p><h3 style="margin-top:14px">Why it matters</h3><p style="margin:0">${esc(it.why)}</p>
    ${it.rule ? `<h3 style="margin-top:14px">How we rate it</h3><p style="margin:0" class="small">${esc(it.rule)} <span class="muted">These cut-offs are a simple yardstick we chose, not an official standard, and not a forecast.</span></p>` : ""}</div>
   ${same.length ? `<h2>Related</h2><div class="hz">${same.map((k) => econCard(d.items[k])).join("")}</div>` : ""}
   <p class="small muted">${esc(d.source)}. Educational information only. Not investment advice.</p>`;
}
