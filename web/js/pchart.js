// Practice portfolio chart: your account's value day by day (rebuilt from your trades and real closing prices) against the same money in the S&P 500.
// Hover or touch to read any day. Range buttons: 1M, 3M, 6M, All. Practice money only.
const PC_RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["All", 0]];
const pcUsd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const pcSigned = (v) => (v >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US");
const pcPct = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1) + "%";
const pcDate = (t, long) => new Date(Date.UTC(2000, 0, 1) + t * 864e5).toLocaleDateString("en-US", long ? { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });

async function pcBuild() {
  if (!P || !P.trades || !P.trades.length) return null;
  const syms = [...new Set(P.trades.map((t) => t.sym))], { H } = await pfLoadData(syms);
  if (!H["^GSPC"]) return null;
  const start = Math.min(pfDay(P.start), pfDay(P.trades[0].d)), anchor = syms.find((s) => H[s]) || syms[0];
  const real = P.trades.filter((t) => H[t.sym]).map((t) => ({ sym: t.sym, day: pfDay(t.d), side: t.side === "sell" ? "sell" : "buy", sh: t.sh, px: t.px }));
  if (!real.length) return null;
  const events = [{ sym: anchor, day: start, side: "buy", sh: 0, px: 0 }].concat(real), R = pfCompute(events.map((e) => ({ ...e })), H);
  const cash = R.days.map((d) => START_CASH + real.reduce((a, e) => (e.day <= d ? a + (e.side === "sell" ? e.sh * e.px : -e.sh * e.px) : a), 0));
  const you = R.days.map((_, i) => R.total[i] + cash[i]), bench = R.days.map((_, i) => START_CASH * (R.mkt[i] / 100));
  // end on today's quoted value so the chart agrees with the cards above it
  const t = totals(), qd = state.quotes ? pfDay(state.quotes.date) : null, spy = Q().SPY;
  if (qd != null && qd >= R.days[R.days.length - 1]) {
    const b = spy && P.startSpy ? START_CASH * (spy.price / P.startSpy) : bench[bench.length - 1];
    if (qd === R.days[R.days.length - 1]) { you[you.length - 1] = t.total; bench[bench.length - 1] = b; } else { R.days.push(qd); you.push(t.total); bench.push(b); }
  }
  return { days: R.days, you, bench };
}

function pcSvg(D, from, W) {
  const Hh = Math.round(Math.max(210, W * 0.38)), pad = { l: W < 480 ? 48 : 56, r: 14, t: 14, b: 28 }, days = D.days.slice(from), a = D.you.slice(from), s0 = D.bench[from], b = D.bench.slice(from).map((v) => (a[0] * v) / s0);
  const all = a.concat(b); let lo = Math.min(...all), hi = Math.max(...all); const m = (hi - lo || hi * 0.02) * 0.12; lo -= m; hi += m;
  const X = (i) => pad.l + (i / Math.max(1, days.length - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (Hh - pad.t - pad.b);
  const step = (() => { const r = (hi - lo) / 4, p = Math.pow(10, Math.floor(Math.log10(r))); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= r) || r; })(), grid = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const n = days.length, pts = (arr) => arr.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" "), up = a[n - 1] >= a[0], col = up ? "var(--ok)" : "var(--bad)";
  const xt = []; const k = Math.min(W < 480 ? 4 : 5, n); for (let j = 0; j < k; j++) xt.push(Math.round((j / Math.max(1, k - 1)) * (n - 1)));
  return { svg: `<svg viewBox="0 0 ${W} ${Hh}" class="pc-svg" role="img" aria-label="Your practice portfolio against the S&amp;P 500">
    <defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${grid.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--mut)">${pcUsd(v)}</text>`).join("")}
    ${xt.map((i) => `<text x="${X(i).toFixed(1)}" y="${Hh - 8}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" font-size="11" fill="var(--mut)">${pcDate(days[i])}</text>`).join("")}
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(a[0]).toFixed(1)}" y2="${Y(a[0]).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="2 4" opacity=".55"/>
    <polygon points="${X(0).toFixed(1)},${Y(lo).toFixed(1)} ${pts(a)} ${X(n - 1).toFixed(1)},${Y(lo).toFixed(1)}" fill="url(#pcg)"/>
    <polyline points="${pts(b)}" fill="none" stroke="var(--mut)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>
    <polyline points="${pts(a)}" fill="none" stroke="${col}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(n - 1).toFixed(1)}" cy="${Y(a[n - 1]).toFixed(1)}" r="4.5" fill="${col}" stroke="var(--card)" stroke-width="2"/>
    <g class="pc-g" style="display:none"><line y1="${pad.t}" y2="${Hh - pad.b}" stroke="var(--tx)" opacity=".35"/><circle class="pc-d1" r="5" fill="${col}" stroke="var(--card)" stroke-width="2"/><circle class="pc-d2" r="4" fill="var(--mut)" stroke="var(--card)" stroke-width="2"/></g>
    <rect class="pc-hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${Hh - pad.t - pad.b}" fill="transparent" style="touch-action:none"/></svg>`, days, a, b, X, Y, W, Hh, pad };
}

function pcDraw(box, D, from) {
  const c = pcSvg(D, from, Math.max(280, Math.min(780, Math.round(box.clientWidth || 720)))), { days, a, b } = c, n = days.length, ret = a[n - 1] - a[0], rp = (a[n - 1] / a[0] - 1) * 100, bp = (b[n - 1] / b[0] - 1) * 100, ahead = a[n - 1] - b[n - 1];
  box.querySelector(".pc-body").innerHTML = `<div class="pc-head"><div><div class="small muted">Total value${from ? "" : " (since you started)"}</div><b class="pc-big">${pcUsd(a[n - 1])}</b> <span style="color:${ret >= 0 ? "var(--ok)" : "var(--bad)"};font-weight:700">${pcSigned(ret)} (${pcPct(rp)})</span></div>
    <div class="pc-vs"><div class="small muted">Same money in the S&amp;P 500</div><b>${pcPct(bp)}</b> <span class="small" style="color:${ahead >= 0 ? "var(--ok)" : "var(--bad)"}">${ahead >= 0 ? "you're ahead by " : "you're behind by "}${pcUsd(Math.abs(ahead))}</span></div></div>
    <div class="pc-wrap">${c.svg}<div class="pc-tip" hidden></div></div>
    <div class="small pc-leg"><span><i style="background:${ret >= 0 ? "var(--ok)" : "var(--bad)"}"></i> Your account</span><span><i class="dash"></i> S&amp;P 500 (same start, same money)</span></div>`;
  const svg = box.querySelector(".pc-svg"), tip = box.querySelector(".pc-tip"), g = svg.querySelector(".pc-g"), hit = svg.querySelector(".pc-hit");
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * c.W, f = Math.min(1, Math.max(0, (x - c.pad.l) / (c.W - c.pad.l - c.pad.r))), i = Math.round(f * (n - 1)), px = c.X(i);
    g.style.display = ""; g.querySelector("line").setAttribute("x1", px); g.querySelector("line").setAttribute("x2", px);
    g.querySelector(".pc-d1").setAttribute("cx", px); g.querySelector(".pc-d1").setAttribute("cy", c.Y(a[i])); g.querySelector(".pc-d2").setAttribute("cx", px); g.querySelector(".pc-d2").setAttribute("cy", c.Y(b[i]));
    const r0 = (a[i] / a[0] - 1) * 100, s0 = (b[i] / b[0] - 1) * 100;
    tip.innerHTML = `<b>${pcDate(days[i], true)}</b><div><span style="color:${ret >= 0 ? "var(--ok)" : "var(--bad)"}">●</span> You <b>${pcUsd(a[i])}</b> <span class="muted">${pcPct(r0)}</span></div><div><span style="color:var(--mut)">●</span> S&amp;P 500 <b>${pcUsd(b[i])}</b> <span class="muted">${pcPct(s0)}</span></div>`;
    tip.hidden = false; const tw = tip.offsetWidth, left = (px / c.W) * r.width; tip.style.left = Math.max(4, Math.min(r.width - tw - 4, left - tw / 2)) + "px";
  };
  const leave = () => { g.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave);
}

async function pcMount(box) {
  if (!box) return;
  let D = null; try { D = await pcBuild(); } catch (e) { console.error(e); }
  if (!box.isConnected) return;
  if (!D || D.days.length < 2) { box.innerHTML = `<p class="small muted" style="margin:0">Your chart appears after your first trade and grows with every market day. It shows your account's value against the same money in the S&amp;P 500.</p>`; return; }
  box.innerHTML = `<div class="pc-ranges"></div><div class="pc-body"></div>`;
  const bar = box.querySelector(".pc-ranges"), last = D.days[D.days.length - 1];
  const draw = (days) => { const from = days ? Math.max(0, D.days.findIndex((d) => d >= last - days)) : 0; pcDraw(box, D, from); bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.n === days)); };
  PC_RANGES.forEach(([l, n]) => { if (n && D.days[0] > last - n * 0.9 && n !== 30) return; const b = document.createElement("button"); b.className = "btn ghost"; b.dataset.n = n; b.textContent = l; b.onclick = () => draw(n); bar.appendChild(b); });
  draw(0);
}
