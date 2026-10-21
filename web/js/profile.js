// Company profile on the stock page: a five-axis scorecard (radar), rewards and risks with the numbers behind them, and the value yardsticks under the price chart.
// Data: score/<SYM>.json, built when the site is assembled (engine/scorecards.py) from SEC filings and prices. Facts and fixed rules only: no AI, no ratings, no price targets.
const SCORE_CACHE = {};
async function loadScore(sym) {
  if (sym in SCORE_CACHE) return SCORE_CACHE[sym];
  try { const r = await fetch((DATA_BASE || "data/") + "score/" + encodeURIComponent(sym) + ".json"); SCORE_CACHE[sym] = r.ok ? await r.json() : null; } catch (e) { SCORE_CACHE[sym] = null; }
  return SCORE_CACHE[sym];
}
const PROFILE_AXES = [["value", "Value", "How cheap it is compared with other companies in its sector (price against earnings, cash flow and profit)."],
  ["growth", "Growth", "How fast revenue and profit have grown over the last few years, compared with its sector."],
  ["profit", "Profitability", "Profit margins and return on shareholders' money, compared with its sector."],
  ["health", "Health", "How little debt it carries compared with its cash flow, and whether profit covers interest."],
  ["payout", "Payouts", "How much of its value comes back to shareholders through dividends and buybacks, and whether cash flow covers it."]];

function radarSvg(axes) {
  const cx = 184, cy = 150, R = 100, ang = (i) => (-90 + i * 72) * Math.PI / 180, pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const ring = (f) => PROFILE_AXES.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = PROFILE_AXES.map(([k], i) => pt(i, R * Math.max(0.04, (axes[k] == null ? 0 : axes[k]) / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = PROFILE_AXES.map(([k], i) => axes[k] == null ? "" : `<circle cx="${pt(i, R * Math.max(0.04, axes[k] / 100))[0].toFixed(1)}" cy="${pt(i, R * Math.max(0.04, axes[k] / 100))[1].toFixed(1)}" r="3.5" fill="var(--brand)"/>`).join("");
  const labels = PROFILE_AXES.map(([k, name], i) => {
    const [x, y] = pt(i, R + 26), dy = i === 0 ? -6 : i === 2 || i === 3 ? 12 : 0, anchor = i === 0 ? "middle" : i === 1 || i === 2 ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${name.toUpperCase()}</text><text class="sv" x="${x.toFixed(1)}" y="${(y + dy + 13).toFixed(1)}" text-anchor="${anchor}">${axes[k] == null ? "n/a" : axes[k]}</text>`;
  }).join("");
  const aria = PROFILE_AXES.map(([k, n]) => n + " " + (axes[k] == null ? "not available" : axes[k] + " out of 100")).join(", ");
  return `<svg class="radar" viewBox="0 0 364 310" role="img" aria-label="Scorecard: ${esc(aria)}"><defs><linearGradient id="rdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".6"/><stop offset="1" stop-color="var(--brand2)" stop-opacity=".6"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" stroke="var(--line)" stroke-width="${f === 0.5 ? 1.6 : 1}"${f === 0.5 ? ' stroke-dasharray="4 3"' : ""}/>`).join("")}
    ${PROFILE_AXES.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" stroke="var(--line)"/>`).join("")}
    <polygon points="${shape}" fill="url(#rdg)" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

async function fillProfile(sym, price) {
  const box = document.querySelector("#stkprofile"), val = document.querySelector("#stkval"); if (!box) return;
  const sc = await loadScore(sym);
  if (!sc) { box.hidden = true; if (val) val.hidden = true; return; }
  const have = PROFILE_AXES.filter(([k]) => sc.axes[k] != null).length;
  const li = (k, t) => `<li><i class="${k}">${k === "ok" ? "✓" : "!"}</i><span>${esc(t)}</span></li>`;
  const rewards = sc.rewards.length ? sc.rewards.map((t) => li("ok", t)).join("") : `<li class="muted"><span>Nothing stands out as a clear strength in the numbers we check.</span></li>`;
  const risks = sc.risks.length ? sc.risks.map((r) => li(r.k, r.t)).join("") : `<li class="muted"><span>None of the risk checks fired.</span></li>`;
  const all = sc.all.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700">See every check (${sc.all.length})</summary><ul class="rr">${sc.all.map((c) => li(c.k === "good" ? "ok" : c.k, c.t)).join("")}</ul></details>` : "";
  const legend = PROFILE_AXES.map(([k, name, tip]) => `<div class="small" style="margin:4px 0"><b>${name}</b> <span class="muted">${sc.axes[k] == null ? "not scored for this type of company" : sc.axes[k] + " out of 100"}. ${esc(tip)}</span></div>`).join("");
  box.innerHTML = `<div class="prof"><div><h3 style="margin:0 0 2px">Rewards</h3><ul class="rr">${rewards}</ul><h3 style="margin:14px 0 2px">Risks</h3><ul class="rr">${risks}</ul>${all}</div>
    <div>${have >= 3 ? radarSvg(sc.axes) : ""}${sc.summary ? `<p class="small" style="margin:6px 0 0;text-align:center"><b>${esc(sc.summary.split(" Scores compare")[0])}</b></p>` : ""}
    <details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">What the five scores mean</summary>${legend}<p class="small muted" style="margin:6px 0 0">Each score compares this company with the ${sc.peers ? sc.peers.toLocaleString() + " others" : "others"} in its sector: 50 is typical, 100 is better than all of them. Built from SEC filings and prices, using fixed rules. Not a rating or advice.</p></details></div></div>`;
  box.hidden = false;
  // value yardsticks under the chart
  if (!val) return;
  const p = sc.peer, m = sc.model, usd2 = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gap = (v) => { const g = (price / v - 1) * 100; return `Today's price is <b>${Math.abs(g).toFixed(0)}% ${g >= 0 ? "above" : "below"}</b> it.`; };
  const tiles = [`<div><div class="small muted">Share price</div><b style="font-size:20px">${usd2(price)}</b></div>`];
  tiles.push(p ? `<div title="What the stock would trade at if it were priced like the median company in its sector on earnings, cash flow and operating profit."><div class="small muted"><span style="color:var(--brand2)">▬ ▬</span> Value at sector-typical prices</div><b style="font-size:20px">${usd2(p.base)}</b><div class="small muted">Range ${usd2(p.low)} to ${usd2(p.high)}. ${gap(p.base)}</div></div>`
    : `<div><div class="small muted">Value at sector-typical prices</div><b>Not available</b><div class="small muted">Needs positive earnings or cash flow to compare with peers.</div></div>`);
  tiles.push(m && m.ok ? `<div><div class="small muted">Cash-flow model (DCF)</div><b style="font-size:20px">${usd2(m.base)}</b><div class="small muted">Bear ${usd2(m.bear)} to bull ${usd2(m.bull)}. <a href="#/report/${esc(sym)}">Full valuation report →</a></div></div>`
    : `<div><div class="small muted">Cash-flow model (DCF)</div><b>Not available</b><div class="small muted">${esc((m && m.note) || "Not enough cash-flow data.")}</div></div>`);
  val.innerHTML = `<div class="vstrip">${tiles.join("")}</div><p class="small muted" style="margin:10px 0 0">These are yardsticks, not price targets. The dashed line and band on the chart show the value at sector-typical prices (it appears on the daily views when it is near the price). Sector-typical value tells you how the market prices this company <i>relative to its peers</i>; the cash-flow model asks what its future cash is worth and, in today's high-interest-rate market, tends to come out well below prices for most large companies. Neither says who is right.</p>`;
  val.hidden = false;
}
