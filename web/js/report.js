// Valuation workbench: a transparent 7-year DCF, "what's priced in" (reverse DCF), scenarios, sensitivity, and peer multiples.
// Everything is computed here by fixed rules (no AI, no hidden inputs). Educational model, not a prediction, rating, or price target.
const SECTOR_TG = { technology: 3.0, communication: 2.5, "health-care": 2.5, financials: 2.5, "consumer-discretionary": 2.5, industrials: 2.5, "consumer-staples": 2.0, energy: 1.5, utilities: 2.0, "real-estate": 2.0, materials: 2.0 };
const DCF_SPECIAL = { financials: "Banks, insurers and asset managers earn money from lending and investing, so free cash flow isn't a meaningful measure for them.", "real-estate": "Real estate companies (REITs) are usually valued on property income and payouts, not a standard DCF.", utilities: "Regulated utilities have capped, rate-based returns and heavy debt, so a standard DCF fits poorly." };
const lastIdx = (a) => { if (!a) return -1; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; };
const nz = (v) => (v == null ? 0 : v);
const fM = (v) => v == null || !isFinite(v) ? "-" : Math.abs(v) >= 1e6 ? (v < 0 ? "-" : "") + "$" + (Math.abs(v) / 1e6).toFixed(2) + "T" : Math.abs(v) >= 1e3 ? (v < 0 ? "-" : "") + "$" + (Math.abs(v) / 1e3).toFixed(1) + "B" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toFixed(0) + "M";
const pct1 = (v, d = 1) => v == null || !isFinite(v) ? "-" : (v * 100).toFixed(d) + "%";
const usd = (v) => v == null || !isFinite(v) ? "-" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- inputs: everything derived from filings, price history and the 10-year yield ----------
function modelInputs(sym) {
  const F = state.fund && state.fund.stocks[sym], row = state.search && state.search.stocks.find((r) => r[0] === sym);
  if (!row) return { error: "We couldn't find that company." };
  const [, name, sector, capB, price] = row;
  const out = { sym, name, sector, price, capM: capB * 1000, flags: [], notes: [] };
  if (DCF_SPECIAL[sector]) out.flags.push({ level: "warn", text: DCF_SPECIAL[sector] + " Treat the numbers below as an illustration, not a valuation." });
  if (!F || !F.rev) { out.error = F ? "This company's revenue isn't in the filings data we use." : "No SEC filing data is available for this company (foreign filers and very new listings are often missing)."; return out; }
  const ri = lastIdx(F.rev), rev = F.rev[ri], years = F.rev.map((v, i) => v == null ? null : v);
  const fcf = F.rev.map((_, i) => (F.ocf && F.ocf[i] != null ? F.ocf[i] - nz(F.capex && F.capex[i]) : null));
  const sbc = F.rev.map((_, i) => (F.sbc && F.sbc[i] != null ? F.sbc[i] : 0));
  const fcfA = fcf.map((v, i) => (v == null ? null : v - sbc[i]));
  const mg = (arr) => { const pts = []; for (let i = F.rev.length - 1; i >= 0 && pts.length < 2; i--) if (arr[i] != null && F.rev[i]) pts.push(arr[i] / F.rev[i]); return pts.length === 2 ? 0.6 * pts[0] + 0.4 * pts[1] : pts[0] != null ? pts[0] : null; };
  const first = F.rev.findIndex((v) => v != null && v > 0), n = ri - first;
  const cagr = n >= 1 && F.rev[first] > 0 ? Math.pow(rev / F.rev[first], 1 / n) - 1 : null;
  const sharesM = out.capM / price;
  const rf = (state.mk && state.mk.macro.find((m) => m.symbol === "^TNX") || { last: 4.5 }).last / 100;
  const rawBeta = F.beta != null ? F.beta : null, beta = rawBeta == null ? 1.0 : 0.67 * rawBeta + 0.33;
  Object.assign(out, { F, rev, ri, fcf, fcfA, sbc, cagr, sharesM, rf, rawBeta, beta, fyEnd: F.fy_end, cash: nz(F.cash) + nz(F.sti), debt: F.debt == null ? 0 : F.debt, interest: F.interest ? F.interest[lastIdx(F.interest)] : null, marginPre: mg(fcf), marginPost: mg(fcfA), years: F.rev });
  if (F.debt == null) out.flags.push({ level: "info", text: "We couldn't find this company's debt in the filings, so debt is assumed to be zero." });
  if (rawBeta == null) out.flags.push({ level: "info", text: "No long price history to measure beta, so a neutral beta of 1.0 is used." });
  if (out.fyEnd && (Date.now() - new Date(out.fyEnd)) / 864e5 > 560) out.flags.push({ level: "warn", text: "The latest annual filing we have ends " + out.fyEnd + ", which is getting old." });
  if (out.marginPre == null) { out.error = "Cash-flow figures are missing, so a DCF can't be built."; return out; }
  if (out.capM < 2000) out.flags.push({ level: "info", text: "Small companies are harder to value and to trade; wide error bars apply." });
  return out;
}

function defaultAssumptions(m) {
  const growth = m.cagr == null ? 0.05 : Math.max(-0.1, Math.min(0.4, m.cagr));
  const kd = m.debt > 0 && m.interest ? Math.max(m.rf, Math.min(m.rf + 0.04, m.interest / m.debt)) : m.rf + 0.015;
  return { g1: growth, margin: m.marginPost, erp: 0.05, tg: (SECTOR_TG[m.sector] || 2.5) / 100, sbcCost: true, kd, tax: 0.21, wacc: null };
}
function waccOf(m, A) {
  const ke = m.rf + m.beta * A.erp, E = m.capM, D = m.debt, w = D > 0 ? E / (E + D) : 1;
  const w1 = w * ke + (1 - w) * A.kd * (1 - A.tax);
  return { ke, wacc: Math.max(0.06, Math.min(0.15, w1)), we: w };
}

// ---------- the DCF itself ----------
function runDCF(m, A, over = {}) {
  const g1 = over.g1 ?? A.g1, margin = over.margin ?? A.margin, tg = over.tg ?? A.tg, wacc = over.wacc ?? (A.wacc ?? waccOf(m, A).wacc);
  const rows = []; let rev = m.rev, pvSum = 0;
  for (let t = 1; t <= 7; t++) {
    const g = g1 + (tg - g1) * (t - 1) / 6; rev *= 1 + g;
    const f = rev * margin, pv = f / Math.pow(1 + wacc, t); pvSum += pv; rows.push({ t, g, rev, fcf: f, pv });
  }
  const spread = Math.max(wacc - tg, 0.02), tv = rows[6].fcf * (1 + tg) / spread, pvTv = tv / Math.pow(1 + wacc, 7);
  const ev = pvSum + pvTv, equity = ev - m.debt + m.cash, perShare = equity / m.sharesM;
  return { rows, pvSum, tv, pvTv, ev, equity, perShare, wacc, g1, margin, tg, tvShare: pvTv / ev };
}
// What growth does today's price imply? (bisection on first-year growth, same margin / WACC / fade)
function impliedGrowth(m, A) {
  const f = (g) => runDCF(m, A, { g1: g }).perShare - m.price;
  let lo = -0.2, hi = 0.8; if (f(lo) > 0) return { below: true }; if (f(hi) < 0) return { above: true };
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return { g: (lo + hi) / 2 };
}
function peerMultiples(m) {
  const ev = (cap, F) => cap + nz(F.debt) - nz(F.cash) - nz(F.sti);
  const rows = [];
  for (const r of state.search.stocks) {
    const [s, nm, sec, cb, px] = r; if (s === m.sym || sec !== m.sector) continue;
    const F = state.fund.stocks[s]; if (!F || !F.rev) continue;
    const ri = lastIdx(F.rev), rev = F.rev[ri], ni = F.ni ? F.ni[lastIdx(F.ni)] : null, ocf = F.ocf ? F.ocf[lastIdx(F.ocf)] : null, cx = F.capex ? nz(F.capex[lastIdx(F.capex)]) : 0;
    if (!rev || rev <= 0) continue; const cap = cb * 1000, fcf = ocf != null ? ocf - cx : null;
    rows.push({ sym: s, name: nm, cap, evSales: ev(cap, F) / rev, pe: ni > 0 ? cap / ni : null, pfcf: fcf > 0 ? cap / fcf : null, dist: Math.abs(Math.log(cap / m.capM)) });
  }
  rows.sort((a, b) => a.dist - b.dist);
  return rows.slice(0, 12);
}
const median = (a) => { const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
// Context for any single result: where does this same model land, on average, for the largest companies today?
function marketGap() {
  if (state.gap !== undefined) return state.gap;
  const ratios = [];
  for (const r of state.search.stocks.slice(0, 50)) {
    if (DCF_SPECIAL[r[2]]) continue;
    const m = modelInputs(r[0]); if (m.error) continue;
    const A = initA(m); if (!(A.margin > 0.005)) continue;
    const v = runDCF(m, A).perShare; if (v > 0) ratios.push(v / m.price);
  }
  return (state.gap = ratios.length >= 10 ? { n: ratios.length, med: median(ratios) } : null);
}

// ---------- the page ----------
let RPT = null;
async function reportPage(sym, tab) {
  sym = decodeURIComponent(sym || "").toUpperCase();
  if (!state.fund) state.fund = await loadJson("fundamentals.json");
  if (!state.fund || !state.search) return `<h1>Valuation report</h1><div class="card muted">Company financials aren't available right now.</div>`;
  const m = modelInputs(sym);
  const tabs = `<div class="tabs noprint" style="margin-top:12px"><a class="${tab === "snapshot" ? "" : "on"}" href="#/report/${esc(sym)}">Valuation</a><a class="${tab === "snapshot" ? "on" : ""}" href="#/report/${esc(sym)}/snapshot">Company snapshot</a></div>`;
  if (tab === "snapshot" && m.name) return await snapshotPage(m, tabs);
  if (m.error && !m.F) return `<a href="#/stock/${esc(sym)}" class="small">← Back</a><h1>${esc(m.name || sym)}</h1><div class="card"><p>${esc(m.error)}</p><p class="small muted">Try a large US-listed company, such as <a href="#/report/AAPL">Apple</a> or <a href="#/report/KO">Coca-Cola</a>.</p></div>`;
  RPT = { m, A: m.error ? null : initA(m), peers: m.error ? [] : peerMultiples(m) };
  afterRender.push(() => { if (!m.error) { drawSliders(); drawResults(); } });
  const head = `<a href="#/stock/${esc(sym)}" class="small noprint">← ${esc(m.name)} stock page</a>
   <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><span class="pill">Valuation report</span><h1 style="margin:6px 0 0">${esc(m.name)} <span class="muted">(${esc(sym)})</span></h1>
    <div class="muted small">${esc(SECTOR_NAME(m.sector))} · market price ${usd(m.price)} · market value ${fM(m.capM)}${m.fyEnd ? " · latest fiscal year ends " + esc(m.fyEnd) : ""}</div></div>
    <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" onclick="window.print()">Print / save as PDF</button><a class="btn ghost" href="#/methodology">Methodology</a></div></div>
   ${tabs}
   ${m.flags.map((f) => `<div class="card" style="border-left:4px solid ${f.level === "warn" ? "var(--warn)" : "var(--line)"};margin-top:12px"><p class="small" style="margin:0">${f.level === "warn" ? "<b>Heads up:</b> " : ""}${esc(f.text)}</p></div>`).join("")}`;
  if (m.error) return head + `<div class="card"><p>${esc(m.error)}</p></div>`;
  return head + `<div id="rptres1"></div><div id="rptsliders"></div><div id="rptres2"></div>
   <p class="small muted" style="margin-top:18px">This is an educational model built from public filings and market data. Every number comes from the rules on the <a href="#/methodology">Methodology page</a> and your slider settings, not from a forecast by the company or an analyst. It is not investment advice, a rating, or a price target. Models like this are very sensitive to their assumptions.</p>`;
}

const SLIDERS = [["g1", "First-year revenue growth", -0.1, 0.4, 0.005, (v) => pct1(v)], ["margin", "Free-cash-flow margin", -0.1, 0.6, 0.005, (v) => pct1(v)], ["wacc", "Discount rate (WACC)", 0.06, 0.15, 0.0025, (v) => pct1(v, 2)], ["tg", "Long-run growth (after year 7)", 0.0, 0.04, 0.0025, (v) => pct1(v, 2)]];
function initA(m) { const A = defaultAssumptions(m); A.wacc = waccOf(m, A).wacc; return A; }
// one global listener: sliders update only the results, never themselves, so dragging stays smooth
document.addEventListener("input", (e) => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.k || !RPT || !RPT.A) return;
  const A = RPT.A, k = t.dataset.k;
  if (t.type === "checkbox") {
    A[k] = t.checked;
    if (k === "sbcCost") { A.margin = t.checked ? RPT.m.marginPost : RPT.m.marginPre; const mi = document.querySelector('input[data-k="margin"]'), sv = document.querySelector("#sv_margin"); if (mi) mi.value = A.margin; if (sv) sv.textContent = pct1(A.margin); }
  } else { A[k] = +t.value; const sv = document.querySelector("#sv_" + k), sl = SLIDERS.find((x) => x[0] === k); if (sv && sl) sv.textContent = sl[5](A[k]); }
  drawResults();
});
function drawSliders() {
  const box = document.querySelector("#rptsliders"); if (!box || !RPT) return;
  const { m, A } = RPT, w = waccOf(m, A);
  box.innerHTML = `<div class="card noprint"><h3 style="margin-bottom:2px">Try your own assumptions</h3><p class="small muted" style="margin-top:0">Move the sliders and every number on this page updates. Defaults come from the company's own history.</p>
   <div class="scr" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${SLIDERS.map(([k, label, a, b, st, f]) => `<div><label class="small" style="display:flex;justify-content:space-between"><span>${label}</span><b id="sv_${k}">${f(A[k])}</b></label><input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${A[k]}" style="width:100%"></div>`).join("")}</div>
   <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" data-k="sbcCost" ${A.sbcCost ? "checked" : ""}> Count stock-based pay as a cost (recommended)</label>
   <p class="small muted" style="margin:8px 0 0">Starting discount rate: risk-free (10-year Treasury) ${pct1(m.rf, 2)} + beta ${m.beta.toFixed(2)}${m.rawBeta != null ? " (measured " + m.rawBeta.toFixed(2) + ", pulled toward 1 as is standard)" : " (assumed)"} × equity premium ${pct1(A.erp)} = cost of equity ${pct1(w.ke, 2)}; blended with debt costing about ${pct1(A.kd * (1 - A.tax), 2)} after tax.
   <button class="btn ghost" style="padding:4px 10px;font-size:12px;margin-left:6px" id="rptreset">Reset sliders</button></p></div>`;
  const rs = box.querySelector("#rptreset"); if (rs) rs.onclick = () => { RPT.A = initA(RPT.m); drawSliders(); drawResults(); };
}
function drawResults() {
  const top = document.querySelector("#rptres1"), bot = document.querySelector("#rptres2"); if (!top || !bot || !RPT) return;
  const { m, A, peers } = RPT;
  const base = runDCF(m, A), imp = impliedGrowth(m, A);
  const bear = runDCF(m, A, { g1: A.g1 - 0.05, margin: A.margin * 0.85, wacc: A.wacc + 0.01 }), bull = runDCF(m, A, { g1: A.g1 + 0.05, margin: A.margin * 1.1, wacc: A.wacc - 0.005 });
  const vals = [bear.perShare, base.perShare, bull.perShare], lo = Math.min(...vals), hi = Math.max(...vals), special = !!DCF_SPECIAL[m.sector], meaningful = !special && A.margin > 0.005 && base.perShare > 0;
  const vsBase = (m.price / base.perShare - 1) * 100, histG = m.cagr, nYears = Math.max(1, m.ri - m.years.findIndex((v) => v != null));
  let story;
  if (!meaningful) story = special ? `A standard cash-flow model doesn't fit this kind of company, so we can't say what the market is pricing in. The peer comparison below is a better guide.` : `This company's free cash flow is negative or very small right now, so a cash-flow model can't tell us much. The peer comparison below is a better guide, or try raising the margin slider to test an "if it becomes profitable" case.`;
  else if (imp.g != null) { const need = Math.pow(runDCF(m, A, { g1: imp.g }).rows[6].rev / m.rev, 1 / 7) - 1;
    story = `At ${usd(m.price)}, the market is pricing in revenue growth averaging about <b>${pct1(need)} a year for the next seven years</b> (starting near ${pct1(imp.g)} and fading to ${pct1(A.tg)}), with a ${pct1(A.margin)} free-cash-flow margin. ${histG != null ? `Over the last ${nYears} years, its revenue actually grew about ${pct1(histG)} a year, so the market is assuming growth that is <b>${need > histG + 0.02 ? "faster than" : need < histG - 0.02 ? "slower than" : "similar to"} its recent record</b>.` : ""}`; }
  else if (imp.above) story = `Even with very fast growth (up to 80% in year one), this model can't reach today's price at these margins and discount rate. The market is pricing in more than these inputs allow, such as higher margins or a lower discount rate.`;
  else story = `Even with revenue shrinking 20% a year, this model values the company above today's price at these inputs. Either the market is very pessimistic, or the cash-flow inputs aren't reliable.`;
  const range = meaningful ? (() => { const L = Math.min(lo, m.price) * 0.85, H = Math.max(hi, m.price) * 1.1, pos = (v) => ((v - L) / (H - L) * 100).toFixed(1);
    return `<div style="position:relative;height:58px;margin:16px 6px 6px"><div style="position:absolute;top:24px;left:0;right:0;height:10px;background:var(--line);border-radius:9px"></div>
     <div style="position:absolute;top:24px;height:10px;border-radius:9px;background:color-mix(in srgb,var(--brand) 40%,transparent);left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></div>
     <div style="position:absolute;top:18px;height:22px;width:3px;background:var(--brand);left:${pos(base.perShare)}%" title="Base case"></div>
     <div style="position:absolute;top:0;left:${pos(m.price)}%;transform:translateX(-50%);text-align:center;font-size:11px;font-weight:800;color:var(--tx)">Price<br>${usd(m.price)}<div style="width:2px;height:16px;background:var(--tx);margin:0 auto"></div></div></div>
     <div class="hz"><div class="card" style="padding:12px"><div class="small muted">Bear case</div><b>${usd(bear.perShare)}</b></div><div class="card" style="padding:12px;border:2px solid var(--brand)"><div class="small muted">Base case (your sliders)</div><b>${usd(base.perShare)}</b></div><div class="card" style="padding:12px"><div class="small muted">Bull case</div><b>${usd(bull.perShare)}</b></div></div>
     <p class="small" style="margin:10px 0 0">The market price is <b style="color:${vsBase > 0 ? "var(--bad)" : "var(--ok)"}">${Math.abs(vsBase).toFixed(0)}% ${vsBase > 0 ? "above" : "below"}</b> this model's base case. That only tells you the market and this model disagree. It does not say who is right.</p>`; })()
    : `<p class="muted" style="margin:0">${special ? "We don't show a cash-flow value for this type of company." : "The model can't produce a meaningful value with these inputs (free cash flow is negative or very small)."} Read the peer multiples below${special ? "." : ", or raise the margin slider to test a profitable-future case."}</p>`;
  const warn = []; if (meaningful && base.tvShare > 0.75) warn.push(`About ${Math.round(base.tvShare * 100)}% of this value comes from the years after year 7 (the terminal value), which makes it very sensitive to long-run assumptions.`);
  if (meaningful && (base.perShare > m.price * 5 || base.perShare < m.price * 0.2)) warn.push("The model lands very far from the market price. A gap that big usually reflects an assumption, not a bargain.");
  if (m.rf > 0.048) warn.push(`Treasury yields are high right now (${pct1(m.rf, 2)}). A high risk-free rate raises the discount rate and lowers every cash-flow value, which is one reason most stocks look expensive in this model today.`);
  const gap = meaningful ? marketGap() : null;
  if (gap && (gap.med < 0.8 || gap.med > 1.25)) warn.push(`For context: across the ${gap.n} largest US companies this model can value, its default value is typically about ${Math.round(gap.med * 100)}% of the market price today. A gap on its own is not unusual, so compare this company with the peers below rather than with the price alone.`);
  if (m.beta < 0.5) warn.push("Measured beta is low, which pushes the discount rate down and values up. Defensive stocks can look cheaper in a DCF than they really are.");
  top.innerHTML = `<div class="card big" style="margin-top:14px"><span class="pill g">What's priced in</span><p style="font-size:18px;margin:8px 0 0">${story}</p></div>
   <div class="card"><h3>Valuation range</h3>${range}${warn.map((t) => `<p class="small" style="color:var(--warn);margin:8px 0 0">⚠ ${esc(t)}</p>`).join("")}</div>`;
  const rows = base.rows.map((r) => `<tr><td>Year ${r.t}</td><td>${pct1(r.g)}</td><td>${fM(r.rev)}</td><td>${fM(r.fcf)}</td><td>${fM(r.pv)}</td></tr>`).join("");
  const wc = [-0.02, -0.01, 0, 0.01, 0.02], tgs = [-0.01, -0.005, 0, 0.005, 0.01];
  const heat = `<div class="tw"><table><tr><th>WACC ↓ / long-run growth →</th>${tgs.map((d) => `<th>${pct1(A.tg + d, 1)}</th>`).join("")}</tr>${wc.map((dw) => `<tr><td><b>${pct1(A.wacc + dw, 2)}</b></td>${tgs.map((dg) => { const v = (A.wacc + dw) - (A.tg + dg) < 0.01 ? null : runDCF(m, A, { wacc: A.wacc + dw, tg: A.tg + dg }).perShare; const b0 = dw === 0 && dg === 0; return `<td style="${b0 ? "outline:2px solid var(--brand);" : ""}background:${v == null ? "var(--line)" : v > m.price ? "color-mix(in srgb,var(--ok) 18%,var(--card))" : "color-mix(in srgb,var(--bad) 14%,var(--card))"}">${v == null ? "n/a" : usd(v)}</td>`; }).join("")}</tr>`).join("")}</table></div><p class="small muted" style="margin:6px 0 0">Green = value above today's price, red = below. The outlined cell is your base case.</p>`;
  const med = { evs: median(peers.map((p) => p.evSales)), pe: median(peers.map((p) => p.pe)), pfcf: median(peers.map((p) => p.pfcf)) };
  const F = m.F, lastNI = F.ni ? F.ni[lastIdx(F.ni)] : null, lastFCF = m.fcf[lastIdx(m.fcf)];
  const my = { evs: (m.capM + m.debt - m.cash) / m.rev, pe: lastNI > 0 ? m.capM / lastNI : null, pfcf: lastFCF > 0 ? m.capM / lastFCF : null };
  const impl = { evs: med.evs != null ? (med.evs * m.rev - m.debt + m.cash) / m.sharesM : null, pe: med.pe != null && lastNI > 0 ? med.pe * lastNI / m.sharesM : null, pfcf: med.pfcf != null && lastFCF > 0 ? med.pfcf * lastFCF / m.sharesM : null };
  const x = (v) => (v == null ? "-" : v.toFixed(1) + "×");
  const comps = peers.length >= 3 ? `<div class="tw"><table><tr><th>Multiple</th><th>${esc(m.sym)}</th><th>Peer median (${peers.length} similar-size ${esc(SECTOR_NAME(m.sector))} companies)</th><th>Value per share at peer median</th></tr>
    <tr><td>Enterprise value / sales</td><td>${x(my.evs)}</td><td>${x(med.evs)}</td><td>${usd(impl.evs)}</td></tr><tr><td>Price / earnings</td><td>${x(my.pe)}</td><td>${x(med.pe)}</td><td>${usd(impl.pe)}</td></tr><tr><td>Price / free cash flow</td><td>${x(my.pfcf)}</td><td>${x(med.pfcf)}</td><td>${usd(impl.pfcf)}</td></tr></table></div>
    <p class="small muted" style="margin:6px 0 0">Peers: ${peers.map((p) => `<a href="#/report/${esc(p.sym)}">${esc(p.sym)}</a>`).join(", ")}. Cheaper than peers can mean undervalued, or just a weaker business.</p>` : `<p class="muted small" style="margin:0">Not enough similar companies with filing data to compare.</p>`;
  const hist = `<div class="tw"><table><tr><th></th>${m.years.map((_, i) => `<th>${state.fund.periods[i].replace("CY", "")}</th>`).join("")}</tr>
    <tr><td>Revenue</td>${m.years.map((v) => `<td>${fM(v)}</td>`).join("")}</tr><tr><td>Free cash flow (operating cash flow − capex)</td>${m.fcf.map((v) => `<td>${fM(v)}</td>`).join("")}</tr>
    <tr><td>Stock-based pay (treated as a cost)</td>${m.sbc.map((v) => `<td>${fM(v)}</td>`).join("")}</tr><tr><td>FCF margin after stock pay</td>${m.fcfA.map((v, i) => `<td>${v == null || !m.years[i] ? "-" : pct1(v / m.years[i])}</td>`).join("")}</tr></table></div>`;
  bot.innerHTML = `<div class="card"><h3>The seven-year cash-flow forecast</h3><div class="tw"><table><tr><th>Year</th><th>Revenue growth</th><th>Revenue</th><th>Free cash flow</th><th>Worth today</th></tr>${rows}</table></div>
    <p class="small" style="margin:8px 0 0">Value of years 1 to 7: <b>${fM(base.pvSum)}</b> · Value beyond year 7: <b>${fM(base.pvTv)}</b> · Enterprise value: <b>${fM(base.ev)}</b> − debt ${fM(m.debt)} + cash &amp; investments ${fM(m.cash)} = <b>${fM(base.equity)}</b> for shareholders ÷ ${(m.sharesM / 1000).toFixed(2)}B shares = <b>${usd(base.perShare)}</b> per share.</p></div>
   <div class="card"><h3>Sensitivity: what if the discount rate or long-run growth is different?</h3>${heat}</div>
   <div class="card"><h3>Cross-check: how do similar companies trade?</h3>${comps}</div>
   <div class="card"><h3>The company's recent record</h3>${hist}<p class="small muted" style="margin:6px 0 0">From the company's annual SEC filings (XBRL data). Figures in US dollars.</p></div>`;
}

// ---------- company snapshot (facts only, no AI) ----------
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
async function snapshotPage(m, tabs) {
  let snap = null;
  try { const r = await fetch((DATA_BASE || "data/") + "snap/" + m.sym + ".json"); if (r.ok) snap = await r.json(); } catch (e) {}
  const F = m.F, fa = (snap && snap.facts) || {}, pr = (v, d = 1) => (v == null || !isFinite(v) ? "-" : (v * 100).toFixed(d) + "%");
  const li = F ? lastIdx(F.rev) : -1, prev = F && li > 0 ? F.rev[li - 1] : null, rev = F ? F.rev[li] : null;
  const at = (arr) => (F && F[arr] ? F[arr][lastIdx(F[arr])] : null);
  const opinc = at("opinc"), ni = at("ni"), ocf = at("ocf"), capex = at("capex"), sbc = at("sbc"), buyback = at("buyback"), divs = at("dividends");
  const fcf = ocf != null ? ocf - nz(capex) : null, cash = F ? nz(F.cash) + nz(F.sti) : null, debt = F ? F.debt : null;
  const tile = (label, value, note) => `<div class="card" style="padding:14px"><div class="small muted">${label}</div><b style="font-size:20px">${value}</b>${note ? `<div class="small muted" style="margin-top:2px">${note}</div>` : ""}</div>`;
  const glance = F && rev ? `<div class="hz">${tile("Revenue (last fiscal year)", fM(rev), prev ? (rev / prev - 1 >= 0 ? "▲ " : "▼ ") + pr(Math.abs(rev / prev - 1)) + " vs the year before" : "")}
    ${tile("Operating profit margin", opinc != null ? pr(opinc / rev) : "-", "Profit from running the business, per $1 of sales")}${tile("Net profit margin", ni != null ? pr(ni / rev) : "-", ni != null && ni < 0 ? "The company lost money" : "What's left after all costs and taxes")}
    ${tile("Free cash flow", fcf != null ? fM(fcf) : "-", fcf != null && rev ? pr(fcf / rev) + " of revenue" : "")}${tile("Capital spending", capex != null ? fM(capex) : "-", capex != null && rev ? pr(capex / rev) + " of revenue" : "")}${tile("Cash & investments", cash != null ? fM(cash) : "-", "")}
    ${tile("Debt", debt != null ? fM(debt) : "None found", debt != null && cash != null ? (cash >= debt ? "More cash than debt" : "Net debt " + fM(debt - cash)) : "No borrowings in its filings data")}${tile("Returned to shareholders", buyback != null || divs != null ? fM(nz(buyback) + nz(divs)) : "-", "Buybacks + dividends last year" + (fcf > 0 && (buyback != null || divs != null) ? " (" + pr((nz(buyback) + nz(divs)) / fcf, 0) + " of free cash flow)" : ""))}</div>
    <p class="small muted" style="margin:6px 0 0">From the company's latest annual filing${m.fyEnd ? " (fiscal year ended " + esc(m.fyEnd) + ")" : ""}.</p>` : `<p class="muted small" style="margin:0">Annual financial figures aren't available for this company in our filings data.</p>`;
  const fye = fa.fiscal_year_end ? MONTHS3[+fa.fiscal_year_end.slice(0, 2) - 1] + " " + +fa.fiscal_year_end.slice(2) : null;
  const facts = `<div class="hz">${[["Sector", esc(SECTOR_NAME(m.sector))], ["Industry", esc(fa.industry || "-")], ["SEC category", esc(fa.sic || "-")], ["Listed on", esc(fa.exchange || "-")], ["Fiscal year ends", fye || "-"], ["Incorporated in", esc(fa.state || "-")], ["Company size (SEC)", esc(fa.filer_category || "-")],
    ["Average daily volume", fa.avg_volume ? Math.round(fa.avg_volume).toLocaleString() + " shares" : "-"], ["52-week range", fa.week52_low ? usd(fa.week52_low) + " – " + usd(fa.week52_high) : "-"], ["Market value", fM(m.capM)]].map(([k, v]) => `<div class="card" style="padding:12px"><div class="small muted">${k}</div><b>${v}</b></div>`).join("")}</div>`;
  const chip = (e) => e.estimate == null || e.eps == null ? "" : e.eps > e.estimate ? `<span class="pill g">Beat</span>` : e.eps < e.estimate ? `<span class="pill" style="background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)">Missed</span>` : `<span class="pill">Matched</span>`;
  const earn = snap && snap.earnings.length ? `<div class="tw"><table><tr><th>Quarter</th><th>Reported</th><th>EPS</th><th>Analysts expected</th><th>Surprise</th><th></th></tr>${snap.earnings.map((e) => `<tr><td>${esc(e.quarter)}</td><td>${esc(e.reported)}</td><td>${e.eps != null ? "$" + e.eps : "-"}</td><td>${e.estimate != null ? "$" + e.estimate : "-"}</td><td>${e.surprise_pct != null ? (e.surprise_pct > 0 ? "+" : "") + e.surprise_pct + "%" : "-"}</td><td>${chip(e)}</td></tr>`).join("")}</table></div><p class="small muted" style="margin:6px 0 0">EPS = earnings per share. A "beat" means profit per share came in above what analysts forecast. Stocks often move on the gap between results and expectations. See the <a href="#/markets/earnings">daily earnings panel</a>.</p>` : `<p class="muted small" style="margin:0">No recent earnings history in our data.</p>`;
  const dv = fa.dividend_annual ? `<p style="margin:0 0 8px">Pays <b>${usd(fa.dividend_annual)}</b> per share a year${fa.dividend_yield != null ? " (a <b>" + fa.dividend_yield + "%</b> yield at today's price)" : ""}. Last ex-dividend date: ${esc(fa.ex_dividend || "-")}.</p>${snap && snap.dividends.length ? `<div class="tw"><table><tr><th>Ex-dividend date</th><th>Amount</th><th>Paid</th></tr>${snap.dividends.map((d) => `<tr><td>${esc(d.ex)}</td><td>${d.amount != null ? "$" + d.amount : "-"}</td><td>${esc(d.paid || "-")}</td></tr>`).join("")}</table></div>` : ""}` : `<p class="muted small" style="margin:0">This company doesn't currently pay a regular dividend.</p>`;
  const files = snap && snap.filings.length ? `<div class="tw"><table><tr><th>Date</th><th>Form</th><th>What it is</th></tr>${snap.filings.map((x) => `<tr><td>${esc(x.date)}</td><td><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.form)}</b></a></td><td class="small">${esc(x.what)}</td></tr>`).join("")}</table></div>` : `<p class="muted small" style="margin:0">No recent filings in our data.</p>`;
  const insider = snap && snap.insider_filings_90d != null ? `<p style="margin:0"><b>${snap.insider_filings_90d}</b> insider transaction reports (SEC Form 4) were filed in the last 90 days. They show when executives and directors buy or sell shares. A lot of selling is common at large companies (often pre-scheduled), so read the details before drawing conclusions. <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${fa.cik || ""}&type=4&dateb=&owner=include&count=40" target="_blank" rel="noopener noreferrer">See them on EDGAR →</a></p>` : `<p class="muted small" style="margin:0">Insider filing data isn't available.</p>`;
  const peers = state.search.stocks.filter((r) => r[0] !== m.sym && r[2] === m.sector).sort((a, b) => Math.abs(Math.log(a[3] / (m.capM / 1000))) - Math.abs(Math.log(b[3] / (m.capM / 1000)))).slice(0, 8);
  afterRender.push(() => fillHeadlines("#snapnews", m.name));
  afterRender.push(() => fillAbout(m.sym, m.name, m.sector, m.capM / 1000));   // headlines load after the page paints
  return `<a href="#/stock/${esc(m.sym)}" class="small noprint">← ${esc(m.name)} stock page</a>
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px"><div><span class="pill">Company snapshot</span><h1 style="margin:6px 0 0">${esc(m.name)} <span class="muted">(${esc(m.sym)})</span></h1><div class="muted small">${esc(SECTOR_NAME(m.sector))} · ${usd(m.price)} · market value ${fM(m.capM)}</div></div>
   <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" onclick="window.print()">Print / save as PDF</button><a class="btn ghost" href="#/stock/${esc(m.sym)}">Price chart</a></div></div>${tabs}
  <div class="card" id="stkabout" style="margin-top:14px"><p class="small muted" style="margin:0">Loading…</p></div><div class="card" id="stkeco"></div>
  <div class="card"><h3>Key facts</h3>${facts}${snap ? "" : `<p class="small muted" style="margin:8px 0 0">Some of these details are refreshed each night and aren't available for this company yet, so a few boxes are empty for now.</p>`}</div><div class="card"><h3>The latest year at a glance</h3>${glance}</div>
  <div class="card"><h3>Recent earnings: results vs expectations</h3>${earn}</div><div class="card"><h3>Dividends</h3>${dv}</div>
  <div class="card"><h3>Recent SEC filings</h3><p class="small muted" style="margin-top:0">Companies must file these with the SEC. <b>10-K</b> is the annual report, <b>10-Q</b> the quarterly report, and an <b>8-K</b> announces something important, like earnings, a deal or an executive change.</p>${files}
   <p class="small" style="margin:8px 0 0"><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${fa.cik || ""}&type=&dateb=&owner=include&count=40" target="_blank" rel="noopener noreferrer">All filings on EDGAR →</a></p></div>
  <div class="card"><h3>Insider activity</h3>${insider}</div><div class="card"><h3>Recent headlines</h3><div id="snapnews"><p class="small muted" style="margin:0">Loading…</p></div></div>
  <div class="card"><h3>Similar-size companies in ${esc(SECTOR_NAME(m.sector))}</h3>${peers.map((r) => `<div class="item" style="align-items:center"><a href="#/report/${esc(r[0])}/snapshot" style="flex:1"><b>${esc(r[0])}</b> <span class="small muted">${esc(r[1])}</span></a><span class="small">${capStr(r[3])}</span></div>`).join("")}</div>
  <p class="small muted">Facts come from SEC filings and Nasdaq's public data. Educational only; not investment advice, and we don't publish ratings or price targets.</p>`;
}

// ---------- methodology page ----------
function methodologyPage() {
  return `<div class="lesson legal"><h1>How our valuations work</h1><p class="muted">A plain-English guide to the Valuation report on every stock page: what we calculate, where the numbers come from, and where the method breaks down.</p>
  <div class="callout"><b>The one-line version:</b> we estimate what a company's future cash is worth in today's money, then compare that with the market price. The point is to show you what you would have to believe, not to tell you what to buy.</div>
  <h2>1. A business is worth its future cash</h2><p>A share price is an opinion. Underneath it, a company generates cash for its owners. A <b>discounted cash flow (DCF)</b> counts that cash over the next seven years plus a long-run value after that, and shrinks each future dollar to today's value, because a dollar next year is worth less than a dollar now.</p>
  <h2>2. Where each input comes from</h2>
  <ul><li><b>Revenue, cash flow, capital spending, stock-based pay, debt, cash:</b> the company's own annual reports filed with the SEC (XBRL data).</li>
  <li><b>First-year growth:</b> the company's own revenue growth over its recent years (a 3-year compound rate where we have it), capped between −10% and +40%. We do not use analyst forecasts, which are paid data.</li>
  <li><b>Free-cash-flow margin:</b> operating cash flow minus capital spending, minus stock-based pay by default (it is a real cost to shareholders), averaged over the last two years with more weight on the latest.</li>
  <li><b>Discount rate (WACC):</b> the 10-year Treasury yield, plus the company's beta times a 5% equity risk premium, blended with the after-tax cost of its debt. Beta is measured from three years of weekly price moves against the S&amp;P 500, then pulled one-third of the way toward 1, a standard adjustment that stops low readings from flattering the result.</li>
  <li><b>Long-run growth:</b> 1.5% to 3% depending on the sector, never above long-run economic growth.</li>
  <li><b>Shares:</b> market value divided by share price, so every class of stock is counted.</li></ul>
  <h2>3. The calculation</h2>
  <ol><li>Revenue grows at the first-year rate, fading in a straight line to the long-run rate by year 7.</li><li>Each year's free cash flow is revenue × margin, discounted at the WACC.</li><li>After year 7 we add a terminal value: year-7 cash flow growing forever at the long-run rate.</li><li>Add it up, subtract debt, add cash and short-term investments, and divide by shares.</li></ol>
  <h2>4. "What's priced in" (the reverse DCF)</h2><p>Instead of guessing a value, we ask the opposite question: <b>what first-year growth would make this model's value equal today's price?</b> Compare that with the company's real record. If the market needs far more growth than the company has ever delivered, expectations are high; if far less, they are low.</p>
  <h2>5. Scenarios, sensitivity and peers</h2><ul><li><b>Bear and bull cases:</b> growth 5 points lower or higher, margin 15% lower or 10% higher, and a discount rate 1 point higher or 0.5 lower.</li><li><b>Sensitivity table:</b> the base case across a range of discount rates and long-run growth rates.</li><li><b>Peer multiples:</b> price/earnings, price/free-cash-flow and enterprise-value/sales for up to twelve similar-size companies in the same sector, as a cross-check that does not depend on a forecast.</li></ul>
  <h2>Where DCF struggles, and what we do about it</h2>
  <ul><li><b>Banks, insurers, REITs and regulated utilities</b> are normally valued other ways, so we flag them.</li><li><b>Companies with negative or tiny free cash flow</b> produce meaningless DCFs. We say so and show peer multiples instead.</li><li><b>Fast-growing companies:</b> most of the value sits beyond year 7, so results swing wildly with small changes. We warn when more than 75% of the value is terminal.</li><li><b>Stale data:</b> we flag filings that are more than about 18 months old.</li><li><b>Missing data:</b> if debt or beta is missing, we say what we assumed.</li></ul>
  <h2>What this is not</h2><p>We do not give ratings, buy or sell calls, or price targets. The model is only as good as its inputs, and small changes in the discount rate or growth can move a DCF by 30% or more, which is why you can move the sliders and see for yourself. Every number is computed by fixed rules in your browser, with no AI involved in the math.</p>
  <p class="small muted">Educational only. Not investment advice. See also <a href="#/terms">Terms</a> and <a href="#/about">How the site works</a>.</p></div>`;
}
