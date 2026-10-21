// Full analysis page (#/analysis/SYM): a sticky scorecard + section list on the left; on the right, an overview and then Valuation, Past performance, Financial health,
// Dividends and buybacks, Insiders and ownership, and Similar companies. Each section has a pass/fail checklist (plain statements with the numbers) and charts.
// Everything comes from score/<SYM>.json (engine/scorecards.py: SEC filings + prices, fixed rules). No analyst forecasts, ratings or price targets.
const AN_SECTIONS = [["overview", "Company overview"], ["valuation", "Valuation"], ["past", "Past performance"], ["health", "Financial health"], ["dividend", "Dividends & buybacks"], ["ownership", "Insiders & ownership"], ["similar", "Similar companies"]];
const AN_VAL = { on: "pe" };

const anChk = (c) => `<li class="${c.na ? "na" : c.ok ? "ok" : "no"}"><i>${c.na ? "–" : c.ok ? "✓" : "✕"}</i><span>${esc(c.t)}</span></li>`;
const anScore = (sec, label) => sec && sec.total ? `<span class="an-score ${sec.score >= sec.total * 0.67 ? "g" : sec.score <= sec.total * 0.34 ? "r" : "y"}">${sec.score}/${sec.total}</span>` : "";

function miniRadar(axes, size) {
  const R = size / 2 - 4, c = size / 2, pt = (i, f) => [c + R * f * Math.cos((-90 + i * 72) * Math.PI / 180), c + R * f * Math.sin((-90 + i * 72) * Math.PI / 180)];
  const key = ["value", "growth", "profit", "health", "payout"], poly = (f) => key.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = key.map((k, i) => pt(i, Math.max(0.05, (axes[k] == null ? 0 : axes[k]) / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${[0.5, 1].map((f) => `<polygon points="${poly(f)}" fill="none" stroke="var(--line)"/>`).join("")}<polygon points="${shape}" fill="var(--brand)" fill-opacity=".35" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function anBars(vals, labels, money) {
  const W = 300, H = 150, top = 22, bot = 24, n = vals.length, nn = vals.filter((v) => v != null);
  if (!nn.length) return `<p class="muted small">No data.</p>`;
  const lo = Math.min(0, ...nn), hi = Math.max(0, ...nn), y = (v) => top + ((hi - v) / (hi - lo || 1)) * (H - top - bot), slot = W / n, bw = slot * 0.56;
  const f = (v) => (money ? fM(v) : v.toLocaleString());
  const bars = vals.map((v, i) => { if (v == null) return `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${y(0) - 4}" text-anchor="middle" class="an-l">n/a</text>`;
    const y0 = y(0), y1 = y(v), x = i * slot + (slot - bw) / 2;
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="3" fill="${v >= 0 ? "var(--brand)" : "var(--bad)"}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(v >= 0 ? y1 - 5 : y1 + 12).toFixed(1)}" text-anchor="middle" class="an-l">${f(v)}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="an-bars" role="img"><line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--line)"/>${bars}${labels.map((l, i) => `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="an-x">${esc(l)}</text>`).join("")}</svg>`;
}

function anValueBars(sc, row) {
  const key = AN_VAL.on, names = { pe: "Price / earnings", pfcf: "Price / free cash flow", evebit: "EV / operating profit", pb: "Price / book value" };
  const me = sc.sec.valuation.metrics[key], rows = [{ s: row[0], v: me.v, me: true }].concat((sc.similar || []).map((p) => ({ s: p.s, v: p[key], me: false })));
  const ok = rows.filter((r) => r.v != null), med = me.med, mx = Math.max(1, ...ok.map((r) => r.v), med || 0) * 1.05;
  return `<div class="tabs" style="margin:6px 0 10px">${Object.entries(names).filter(([k]) => sc.sec.valuation.metrics[k]).map(([k, l]) => `<a href="#" data-vk="${k}" class="${k === key ? "on" : ""}">${l}</a>`).join("")}</div>
   <div class="an-vb">${rows.map((r) => `<div class="an-vr"><span class="an-vs ${r.me ? "me" : ""}">${r.me ? "<b>" + esc(r.s) + "</b>" : `<a href="#/analysis/${esc(r.s)}">${esc(r.s)}</a>`}</span>
      <span class="an-vt"><i style="width:${r.v == null ? 0 : Math.max(1.5, (r.v / mx) * 100).toFixed(1)}%" class="${r.me ? "me" : ""}"></i>${med ? `<u style="left:${((med / mx) * 100).toFixed(1)}%"></u>` : ""}</span><span class="an-vv">${r.v == null ? "n/a" : r.v.toFixed(1) + "×"}</span></div>`).join("")}</div>
   <p class="small muted" style="margin:6px 0 0">${med ? `The dashed line is the sector median (${med.toFixed(1)}×). ` : ""}Shorter bars mean cheaper. Other bars are similar companies; tap one to open its analysis.</p>`;
}

async function analysisPage(sym) {
  sym = decodeURIComponent(sym || "").toUpperCase();
  const row = state.search && state.search.stocks.find((r) => r[0] === sym), sc = await loadScore(sym);
  if (!row || !sc) return `<a href="#/stock/${esc(sym)}" class="small">← ${esc(sym)}</a><h1>Full analysis</h1><div class="card"><p>We don't have a full analysis for this company. It needs filing data, so foreign companies and very new listings are often missing.</p></div>`;
  const [, name, sector, capB, price] = row, S = sc.sec, usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let about = null; try { const r = await fetch((DATA_BASE || "data/") + "about/" + encodeURIComponent(sym) + ".json"); if (r.ok) about = await r.json(); } catch (e) {}
  afterRender.push(() => {
    document.querySelectorAll("[data-sec]").forEach((a) => a.onclick = (e) => { e.preventDefault(); const t = document.getElementById("an-" + a.dataset.sec); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    function bindVk() { document.querySelectorAll("[data-vk]").forEach((a) => a.onclick = (e) => { e.preventDefault(); AN_VAL.on = a.dataset.vk; document.getElementById("an-valbars").innerHTML = anValueBars(sc, row); bindVk(); }); }
    bindVk();
    if ("IntersectionObserver" in window) {   // highlight the section being read
      const links = {}; document.querySelectorAll("[data-sec]").forEach((a) => { links[a.dataset.sec] = a; });
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { Object.values(links).forEach((l) => l.classList.remove("on")); const l = links[e.target.id.replace("an-", "")]; if (l) l.classList.add("on"); } }), { rootMargin: "-120px 0px -65% 0px" });
      AN_SECTIONS.forEach(([k]) => { const t = document.getElementById("an-" + k); if (t) io.observe(t); });
    }
  });
  const scoreFor = { overview: "", valuation: anScore(S.valuation), past: anScore(S.past), health: anScore(S.health), dividend: anScore(S.dividend), ownership: "", similar: "" };
  const nav = AN_SECTIONS.map(([k, l], i) => `<a href="#" data-sec="${k}" class="${i === 0 ? "on" : ""}"><span>${i ? i + " " : ""}${l}</span>${scoreFor[k]}</a>`).join("");
  const li = (k, t) => `<li><i class="${k}">${k === "ok" ? "✓" : "!"}</i><span>${esc(t)}</span></li>`;
  const pl = sc.peer, m = sc.model, gap = (v) => { const g = (price / v - 1) * 100; return `Today's price is <b>${Math.abs(g).toFixed(0)}% ${g >= 0 ? "above" : "below"}</b> it.`; };
  const sect = (id, title, extra, body) => `<section class="card an-sec" id="an-${id}"><h2 style="margin:0 0 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${title} ${extra || ""}</h2>${body}</section>`;
  const checks = (sec, blank) => sec && sec.checks && sec.checks.length ? `<ul class="an-ck">${sec.checks.map(anChk).join("")}</ul>` : `<p class="muted small">${esc((sec && sec.note) || blank || "Nothing to check here.")}</p>`;
  const valuation = sect("valuation", "1 Valuation", anScore(S.valuation), `<p class="small muted" style="margin:0 0 8px">Is the stock cheap or expensive compared with its sector and with its own cash flows? Each line is a check; ticks are in the stock's favor.</p>${checks(S.valuation)}
    <h3 style="margin:16px 0 0">Valuation compared with similar companies</h3><div id="an-valbars">${anValueBars(sc, row)}</div>
    <div class="vstrip" style="margin-top:14px"><div><div class="small muted">Share price</div><b style="font-size:20px">${usd(price)}</b></div>
     ${pl ? `<div><div class="small muted">Value at sector-typical prices</div><b style="font-size:20px">${usd(pl.base)}</b><div class="small muted">Range ${usd(pl.low)} to ${usd(pl.high)}. ${gap(pl.base)}</div></div>` : ""}
     ${m && m.ok ? `<div><div class="small muted">Cash-flow model (DCF)</div><b style="font-size:20px">${usd(m.base)}</b><div class="small muted">Bear ${usd(m.bear)} to bull ${usd(m.bull)}. <a href="#/report/${esc(sym)}">Valuation report →</a></div></div>` : ""}</div>
    <p class="small muted" style="margin:10px 0 0">These are yardsticks, not price targets. We don't use analyst forecasts or targets (they are paid data), so "future growth" isn't scored; the sections below show what the filings say about the past and today.</p>`);
  const P = S.past, pb = P.periods || [];
  const past = sect("past", "2 Past performance", anScore(P), `<p class="small muted" style="margin:0 0 8px">How the business has actually performed, from its annual SEC filings.</p>${checks(P)}
    <div class="an-grid" style="margin-top:12px">${[["Revenue", P.rev], ["Net income", P.ni], ["Operating profit", P.opinc], ["Free cash flow", P.fcf]].map(([t, v]) => `<div><h4 style="margin:0 0 2px">${t}</h4>${anBars(v || [], pb, true)}</div>`).join("")}</div>
    ${P.surprises && P.surprises.length ? `<h3 style="margin:14px 0 4px">Recent earnings versus expectations</h3><div class="tw"><table><tr><th>Quarter</th><th>Reported EPS</th><th>Expected</th><th>Surprise</th></tr>${P.surprises.map((e) => `<tr><td>${esc(e.q || "")}</td><td>${esc(String(e.eps))}</td><td>${e.est == null ? "-" : "$" + e.est}</td><td>${pctTxt(e.pct)}</td></tr>`).join("")}</table></div>` : ""}`);
  const H = S.health, hmax = Math.max(1, H.cash || 0, H.debt || 0, H.equity > 0 ? H.equity : 0);
  const bar = (label, v, cls) => `<div class="an-vr"><span class="an-vs" style="width:110px">${label}</span><span class="an-vt"><i style="width:${v == null ? 0 : Math.max(1.5, (Math.max(0, v) / hmax) * 100).toFixed(1)}%" class="${cls}"></i></span><span class="an-vv" style="width:90px">${v == null ? "n/a" : fM(v)}</span></div>`;
  const health = sect("health", "3 Financial health", anScore(H), `<p class="small muted" style="margin:0 0 8px">Can the company comfortably pay its bills and its debt?</p>${checks(H)}
    ${H.total ? `<div class="an-vb" style="margin-top:12px">${bar("Cash & investments", H.cash, "g")}${bar("Debt", H.debt, "r")}${bar("Shareholders' equity", H.equity, "me")}</div>` : ""}`);
  const D = S.dividend;
  const dividend = sect("dividend", "4 Dividends & buybacks", anScore(D), `<p class="small muted" style="margin:0 0 8px">How much of the profit comes back to shareholders, and whether it can last.</p>${checks(D)}
    <div class="hz" style="margin-top:10px"><div class="card"><div class="small muted">Dividend yield</div><b style="font-size:20px">${D.yield_pct}%</b></div><div class="card"><div class="small muted">Share of profit paid out</div><b style="font-size:20px">${D.payout_pct == null ? "-" : D.payout_pct + "%"}</b></div><div class="card"><div class="small muted">Dividends + buybacks / value</div><b style="font-size:20px">${D.shareholder_yield}%</b></div></div>
    <div class="an-grid" style="margin-top:12px"><div><h4 style="margin:0 0 2px">Dividends paid</h4>${anBars(D.div || [], D.periods || [], true)}</div><div><h4 style="margin:0 0 2px">Share buybacks</h4>${anBars(D.buy || [], D.periods || [], true)}</div></div>`);
  const O = S.ownership;
  const ownership = sect("ownership", "5 Insiders & ownership", "", `<p class="small muted" style="margin:0 0 8px">What insiders and big investors have told the SEC. A filing shows what happened, not whether it was a good sign: executives often sell on a schedule, and big holders file for many reasons.</p>
    ${O.insider_filings_90d != null ? `<p style="margin:0 0 8px"><b>${O.insider_filings_90d}</b> insider transaction reports (Form 4) were filed in the last 90 days. <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(sym)}&type=4&dateb=&owner=include&count=40" target="_blank" rel="noopener noreferrer">See them on EDGAR →</a></p>` : `<p class="muted small">Insider filing counts are added nightly for the largest companies.</p>`}
    ${O.large_holder_filings && O.large_holder_filings.length ? `<h4 style="margin:8px 0 4px">Large-holder notices (5% or more)</h4><div class="tw"><table><tr><th>Filed</th><th>Form</th><th></th></tr>${O.large_holder_filings.map((f) => `<tr><td>${esc(f.date)}</td><td>${esc(f.form)}</td><td><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Read the filing →</a></td></tr>`).join("")}</table></div>` : ""}
    <p class="small muted" style="margin:8px 0 0">The company snapshot has the full list of recent filings. <a href="#/report/${esc(sym)}/snapshot">Open the snapshot →</a></p>`);
  const similar = sect("similar", "Similar companies", "", `<p class="small muted" style="margin:0 0 10px">Companies in the same line of business and of a similar size, each with its own five-point scorecard. Tap one to compare.</p>
    <div class="an-sim">${(sc.similar || []).map((p) => `<a class="an-sc" href="#/analysis/${esc(p.s)}"><b>${esc(p.s)}</b><span class="small muted">${esc(p.name)}</span><span class="an-mr">${miniRadar(p.axes, 96)}</span><span class="small">${capStr(p.cap_b)} · ${usd(p.price)}</span></a>`).join("") || `<p class="muted small">No similar companies found.</p>`}</div>`);
  const meta = about ? [about.industry, about.employees ? "about " + about.employees.toLocaleString() + " employees" : null, [about.city, about.country].filter(Boolean).join(", ") || null].filter(Boolean) : [];
  const overview = sect("overview", "Company overview", "", `${about && about.desc ? `<p style="margin:0 0 6px">${about.desc.map(esc).join(" ")}</p>${meta.length ? `<p class="small muted" style="margin:0 0 10px">${meta.map(esc).join(" · ")}</p>` : ""}` : `<p class="muted">${esc(name)} is in the ${esc(SECTOR_NAME(sector))} sector. A fuller description will appear here soon.</p>`}
    <div class="prof"><div><h3 style="margin:0 0 2px">Rewards</h3><ul class="rr">${sc.rewards.length ? sc.rewards.map((t) => li("ok", t)).join("") : `<li class="muted"><span>Nothing stands out as a clear strength.</span></li>`}</ul></div>
    <div><h3 style="margin:0 0 2px">Risks</h3><ul class="rr">${sc.risks.length ? sc.risks.map((r) => li(r.k, r.t)).join("") : `<li class="muted"><span>None of the risk checks fired.</span></li>`}</ul></div></div>`);
  return `<a href="#/stock/${esc(sym)}" class="small">← ${esc(name)} stock page</a>
   <div class="an-head"><div><span class="pill">Full analysis</span><h1 style="margin:6px 0 0">${esc(name)} <span class="muted">(${esc(sym)})</span></h1><div class="muted small">${esc(SECTOR_NAME(sector))} · ${usd(price)} · market value ${capStr(capB)}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${heartBtn("stock", sym, { label: name })}<a class="btn ghost" href="#/report/${esc(sym)}">Valuation report</a><a class="btn ghost" href="#/explore/compare/${esc(sym)}">Compare</a></div></div>
   <div class="an"><aside class="an-side"><div class="card" style="padding:14px">${radarSvg(sc.axes)}${sc.summary ? `<p class="small" style="margin:0;text-align:center"><b>${esc(sc.summary.split(" Scores compare")[0])}</b></p>` : ""}</div>
     <nav class="an-nav card" aria-label="Sections">${nav}</nav></aside>
    <div class="an-main">${overview}${valuation}${past}${health}${dividend}${ownership}${similar}
     <p class="small muted">Built from SEC filings and Yahoo Finance prices with fixed rules, updated nightly. Educational only: not investment advice, a rating, or a price target.</p></div></div>`;
}
