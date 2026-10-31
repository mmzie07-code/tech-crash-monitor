// Site-wide forecasts. One method everywhere (see engine/forecast.py): forecast HOW FAR a price can move, never which way.
// Ranges come from volatility and from how far that class of asset has actually moved in the past; odds from how deep paths really dipped.
// Pre-computed for every symbol in data/forecasts.json; fcCompute() is the identical math for tickers looked up live.
const FC_LABEL = { stock: "large US stocks", index: "stock indices", sector: "sector funds", crypto: "major coins", fx: "currencies", commodity: "commodities", rate: "Treasury yields" };
const FC_H = { std: { h5: 5, h21: 21, h63: 63 }, crypto: { h5: 7, h21: 30, h63: 90 } };
const fcPct = (x, d = 0) => (x == null ? "-" : (x > 0 ? "+" : "") + x.toFixed(d) + "%");

function fcKey(sym) {
  sym = String(sym || "");
  if (/^_/.test(sym)) return sym;
  if (sym.startsWith("^")) return "_" + sym.slice(1);
  if (/-USD$/.test(sym)) return "CRYPTO_" + sym.replace("-USD", "");
  if (/=F$/.test(sym)) return "COM_" + sym;
  return sym;
}
function fcGet(sym) { return state.fc && state.fc.f ? state.fc.f[fcKey(sym)] || null : null; }

function fcSigma(c) {   // same as sigma_daily() in Python: 75% EWMA(0.94) + 25% trailing-year variance, last value
  let ew = null, n = 0; const sq = [];
  for (let i = 1; i < c.length; i++) { const r = Math.log(c[i] / c[i - 1]); if (!isFinite(r)) continue; const v = r * r; ew = ew == null ? v : 0.06 * v + 0.94 * ew; sq.push(v); n++; }
  if (n < 60 || ew == null) return null;
  const yr = sq.slice(-250).reduce((a, b) => a + b, 0) / Math.min(250, sq.length);
  return Math.sqrt(0.75 * ew + 0.25 * yr);
}
function fcInterp(grid, vals, x) { if (x <= grid[0]) return vals[0]; for (let i = 1; i < grid.length; i++) if (x <= grid[i]) return vals[i - 1] + (vals[i] - vals[i - 1]) * (x - grid[i - 1]) / (grid[i] - grid[i - 1]); return vals[vals.length - 1]; }

function fcCompute(closes, cls, perYear) {
  const F = state.fc; if (!F || !F.calib || !F.calib[cls] || !closes || closes.length < 120) return null;
  const sg = fcSigma(closes); if (!sg) return null;
  const hm = cls === "crypto" ? FC_H.crypto : FC_H.std, cal = F.calib[cls], r = {};
  for (const hk of Object.keys(hm)) { const sd = sg * Math.sqrt(hm[hk]), q = cal[hk].q; r[hk] = [0, 1, 3, 4].map((i) => +((Math.exp(sd * q[i]) - 1) * 100).toFixed(2)); }
  const sd = sg * Math.sqrt(hm.h63), c63 = cal.h63;
  const down = (d) => fcInterp(F.xgrid, c63.dn, Math.abs(Math.log(1 - d)) / sd), up = (u) => 1 - fcInterp(F.zgrid, c63.cdf, Math.log(1 + u) / sd);
  return { c: cls, p: closes[closes.length - 1], s: +(sg * Math.sqrt(perYear || 252) * 100).toFixed(1), r, d10: down(0.1), d20: down(0.2), u10: up(0.1), u20: up(0.2), live: true };
}
function fcFor(sym, closes, cls, perYear) { return fcGet(sym) || fcCompute(closes, cls || "stock", perYear); }

// ---- compact chip for tiles and tables: the likely 1-month range ----
function fcChip(sym) {
  const e = fcGet(sym); if (!e || !e.r || !e.r.h21) return "";
  const [, lo, hi] = [0, e.r.h21[1], e.r.h21[2]];
  return `<div class="small muted" title="68% of the time a month's move has landed in this range, based on current volatility. It shows size, not direction.">1-month range <b style="color:var(--tx)">${fcPct(lo)} to ${fcPct(hi)}</b></div>`;
}

// ---- the full panel ----
function fcPanel(o) {
  const e = o.entry; if (!e) return "";
  const pre = o.pre != null ? o.pre : "$", hz = o.crypto ? FC_H.crypto : FC_H.std, P = o.price || e.p, ev = state.fc && state.fc.evidence && state.fc.evidence[e.c] ? state.fc.evidence[e.c].h21 : null;
  const row = (hk, lab) => { const r = e.r[hk]; return `<tr><td>${lab}</td><td>${fcPct(r[1], 1)} to ${fcPct(r[2], 1)}<div class="small muted">${pre}${(P * (1 + r[1] / 100)).toLocaleString(undefined, { maximumFractionDigits: P < 10 ? (o.dec != null ? o.dec : 2) : 0 })} to ${pre}${(P * (1 + r[2] / 100)).toLocaleString(undefined, { maximumFractionDigits: P < 10 ? (o.dec != null ? o.dec : 2) : 0 })}${o.post || ""}</div></td><td>${fcPct(r[0], 1)} to ${fcPct(r[3], 1)}</td></tr>`; };
  const pr = (x) => (x == null ? "-" : x < 0.01 ? "under 1%" : Math.round(x * 100) + "%");
  const em = o.em;
  const earn = em ? `<div class="card" style="padding:14px;margin:10px 0 0"><b>Earnings reactions</b><div class="small" style="margin-top:4px">${em.next ? `Next report: <b>${esc(em.next.date)}</b> ${esc(em.next.when || "")}. ` : ""}Over its last ${em.n} reports the stock typically moved <b>±${em.typ}%</b> across the two days around the release; the likely range is <b>${fcPct(em.lo, 1)} to ${fcPct(em.hi, 1)}</b>. It rose after ${Math.round(em.up * 100)}% of them${em.up > 0.35 && em.up < 0.65 ? ", close to a coin flip" : ""}.</div>
   ${state.em && state.em.meta ? `<div class="small muted" style="margin-top:4px">Tested walk-forward across ${state.em.meta.stocks} stocks since 2023, this kind of range held ${Math.round(state.em.meta.coverage80 * 100)}% of the time (aimed at 80%).</div>` : ""}</div>` : "";
  const data = JSON.stringify({ r: e.r, P, hist: o.hist ? o.hist.slice(-Math.min(o.hist.length, hz.h63)) : null, hz: [hz.h5, hz.h21, hz.h63], crypto: !!o.crypto });
  afterRender.push(fcDraw);
  return `<div class="card fcard" id="${o.id || "fcpanel"}"><span class="pill">Likely range</span><h3 style="margin-top:6px">${esc(o.title || "Where could it be?")}</h3>
   <p class="small muted" style="margin:0 0 6px">How far it could move, from today's volatility and how far ${FC_LABEL[e.c] || "assets like it"} have really moved before. <b>It shows size, not direction.</b></p>
   <div class="fcfan" data-fan='${esc(data)}'></div>
   <div class="tw" style="margin:8px 0"><table><tr><th>Horizon</th><th>Likely range (68%)</th><th>Wide range (90%)</th></tr>${row("h5", o.crypto ? "1 week" : "1 week")}${row("h21", "1 month")}${row("h63", "3 months")}</table></div>
   <div class="hz" style="margin-top:6px"><div class="card" style="padding:12px"><div class="small muted">Falls 10% or more, some time in the next ${o.crypto ? "3 months" : "3 months"}</div><b style="font-size:20px;color:var(--bad)">${pr(e.d10)}</b></div>
    <div class="card" style="padding:12px"><div class="small muted">Falls 20% or more</div><b style="font-size:20px;color:var(--bad)">${pr(e.d20)}</b></div>
    <div class="card" style="padding:12px"><div class="small muted">Ends 3 months up 10%+</div><b style="font-size:20px;color:var(--ok)">${pr(e.u10)}</b></div>
    <div class="card" style="padding:12px"><div class="small muted">Volatility (a year)</div><b style="font-size:20px">${e.s}%</b></div></div>
   ${earn}
   <p class="small muted" style="margin:10px 0 0">${ev ? `Tested on ${state.fc.evidence[e.c].symbols} ${FC_LABEL[e.c] || "assets"} since 2018, using only information available at each date: the 68% range held <b>${Math.round(ev.band68 * 100)}%</b> of the time and the 90% range <b>${Math.round(ev.band90 * 100)}%</b>.` : "Method tested across stocks, indices, funds, currencies and commodities."} Direction cannot be forecast reliably, and neither can the day a drop happens: <a href="#/watch">how we test this</a>. Not investment advice.</p></div>`;
}

function fcDraw() {
  document.querySelectorAll(".fcfan:not([data-done])").forEach((el) => {
    let d; try { d = JSON.parse(el.dataset.fan); } catch (e) { return; }
    el.dataset.done = "1";
    const W = Math.max(280, el.clientWidth || 600), H = W < 420 ? 190 : 230, m = { l: 8, r: 64, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const [s5, s21, s63] = d.hz, sq = [0, Math.sqrt(s5), Math.sqrt(s21), Math.sqrt(s63)];
    const bound = (idx, step) => { const x = Math.sqrt(step), b = [0, d.r.h5[idx], d.r.h21[idx], d.r.h63[idx]]; for (let i = 1; i < 4; i++) if (x <= sq[i]) return b[i - 1] + (b[i] - b[i - 1]) * (x - sq[i - 1]) / (sq[i] - sq[i - 1]); return b[3]; };
    const hist = d.hist && d.hist.length > 5 ? d.hist : null, hn = hist ? hist.length : 0, split = hist ? 0.36 : 0.04;
    const steps = Array.from({ length: s63 + 1 }, (_, i) => i), P = d.P;
    const lo95 = steps.map((s) => P * (1 + bound(0, s) / 100)), hi95 = steps.map((s) => P * (1 + bound(3, s) / 100)), lo68 = steps.map((s) => P * (1 + bound(1, s) / 100)), hi68 = steps.map((s) => P * (1 + bound(2, s) / 100));
    let ymin = Math.min(...lo95, ...(hist || [P])), ymax = Math.max(...hi95, ...(hist || [P])); const pad = (ymax - ymin) * 0.06; ymin -= pad; ymax += pad;
    const X = (i) => m.l + iw * (split + (1 - split) * i / s63), Y = (v) => m.t + ih * (1 - (v - ymin) / (ymax - ymin)), X0 = m.l + iw * split;
    const poly = (a, b) => steps.map((s, i) => (i ? "L" : "M") + X(s).toFixed(1) + "," + Y(a[i]).toFixed(1)).join("") + steps.slice().reverse().map((s) => "L" + X(s).toFixed(1) + "," + Y(b[s]).toFixed(1)).join("") + "Z";
    const line = hist ? hist.map((v, i) => (i ? "L" : "M") + (m.l + (X0 - m.l) * i / Math.max(1, hn - 1)).toFixed(1) + "," + Y(v).toFixed(1)).join("") : "";
    const fmt = (v) => "$" + (v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(v < 10 ? 2 : 0));
    const grid = [0.2, 0.5, 0.8].map((f) => ymin + (ymax - ymin) * f).map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${W - m.r + 6}" y="${(Y(v) + 4).toFixed(1)}" fill="var(--mut)" font-size="11">${fmt(v)}</text>`).join("");
    const lab = (v, c) => `<text x="${W - m.r + 6}" y="${(Y(v) + 4).toFixed(1)}" fill="${c}" font-size="11" font-weight="600">${fmt(v)}</text>`;
    const u = d.crypto ? ["now", "1 wk", "1 mo", "3 mo"] : ["now", "1 wk", "1 mo", "3 mo"];
    const ticks = [[0, u[0]], [s5, u[1]], [s21, u[2]], [s63, u[3]]].map(([s, t]) => `<text x="${X(s).toFixed(1)}" y="${H - 8}" fill="var(--mut)" font-size="11" text-anchor="${s === 0 ? "start" : s === s63 ? "end" : "middle"}">${t}</text>`).join("");
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Range of likely prices over the next three months" style="display:block;overflow:visible">${grid}
      <path d="${poly(lo95, hi95)}" fill="var(--acc, #3ee0b5)" fill-opacity=".10"/><path d="${poly(lo68, hi68)}" fill="var(--acc, #3ee0b5)" fill-opacity=".22"/>
      ${hist ? `<path d="${line}" fill="none" stroke="var(--tx)" stroke-width="1.6" stroke-linejoin="round"/>` : ""}
      <line x1="${X(0).toFixed(1)}" x2="${X(s63).toFixed(1)}" y1="${Y(P).toFixed(1)}" y2="${Y(P).toFixed(1)}" stroke="var(--tx)" stroke-opacity=".45" stroke-dasharray="3 4"/>
      <circle cx="${X(0).toFixed(1)}" cy="${Y(P).toFixed(1)}" r="3.5" fill="var(--tx)"/>${lab(hi68[s63], "var(--tx)")}${lab(lo68[s63], "var(--tx)")}${ticks}</svg>
      <div class="small muted" style="display:flex;gap:14px;margin-top:4px"><span><i style="display:inline-block;width:10px;height:10px;background:var(--acc,#3ee0b5);opacity:.5;margin-right:5px"></i>68% of the time</span><span><i style="display:inline-block;width:10px;height:10px;background:var(--acc,#3ee0b5);opacity:.2;margin-right:5px"></i>90% of the time</span></div>`;
  });
}

// ---- economy: next-reading forecast under each gauge ----
function fcEcon(key, dec) {
  const f = state.ef && state.ef.items && state.ef.items[key]; if (!f) return "";
  const a = f[0], fmt = (v) => (dec != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : String(v));
  const better = a.method === "model" && a.skill_holdout != null;
  return `<div class="small" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)" title="Tested walk-forward: each prediction used only data available at the time.">
   <span class="muted">${esc(a.label[0].toUpperCase() + a.label.slice(1))}:</span> <b>${fmt(a.pred)}</b> <span class="muted">(80% range ${fmt(a.lo)} to ${fmt(a.hi)})</span>
   <div class="muted" style="margin-top:2px">${better ? `Beat "no change" by ${Math.round(a.skill_holdout * 100)}% on average since 2018.` : `Best guess is "no change": nothing we tested beat it reliably.`}${a.cov80 != null ? ` The range held ${Math.round(a.cov80 * 100)}% of the time (aimed at 80%).` : ""}</div></div>`;
}
