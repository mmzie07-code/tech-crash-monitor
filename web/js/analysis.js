// Full analysis page (#/analysis/SYM): a sticky scorecard + section list on the left; on the right, an overview and then Valuation, Past performance, Financial health,
// Dividends and buybacks, Management, Ownership, Company information and Similar companies. Each scored section has a pass/fail checklist (plain statements with the numbers) and charts.
// Everything comes from score/<SYM>.json (engine/scorecards.py: SEC filings, Nasdaq insider/13F tables, Yahoo profiles and prices; fixed rules). No analyst forecasts, ratings or price targets.
const AN_SECTIONS = [["overview", "Company overview"], ["valuation", "Valuation"], ["past", "Past performance"], ["health", "Financial health"], ["dividend", "Dividends & buybacks"], ["management", "Management"], ["ownership", "Ownership"], ["info", "Company information"], ["similar", "Similar companies"]];
const AN_VAL = { on: "pe" }, AN_SCORED = ["valuation", "past", "health", "dividend", "management", "ownership"];

const anChk = (c) => `<li class="${c.na ? "na" : c.ok ? "ok" : "no"}"><i>${c.na ? "–" : c.ok ? "✓" : "✕"}</i><span>${esc(c.t)}</span></li>`;
const anScore = (sec) => sec && sec.total ? `<span class="an-score ${sec.score >= sec.total * 0.67 ? "g" : sec.score <= sec.total * 0.34 ? "r" : "y"}">${sec.score}/${sec.total}</span>` : "";
const anN = (v) => (v == null ? "-" : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + "B" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v)));
const anD = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-");
const anUsd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const anPay = (v) => (v == null ? "-" : "$" + (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v).toLocaleString()));

function miniRadar(axes, size) {
  const R = size / 2 - 4, c = size / 2, pt = (i, f) => [c + R * f * Math.cos((-90 + i * 72) * Math.PI / 180), c + R * f * Math.sin((-90 + i * 72) * Math.PI / 180)];
  const key = ["value", "growth", "profit", "health", "payout"], poly = (f) => key.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = key.map((k, i) => pt(i, Math.max(0.05, (axes[k] == null ? 0 : axes[k]) / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${[0.5, 1].map((f) => `<polygon points="${poly(f)}" fill="none" stroke="var(--line)"/>`).join("")}<polygon points="${shape}" fill="var(--brand)" fill-opacity=".35" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function anBars(vals, labels, money) {
  const W = 300, H = 150, top = 22, n = vals.length, nn = vals.filter((v) => v != null), bot = nn.some((v) => v < 0) ? 40 : 24;   // negative bars carry their label underneath, so leave room above the year labels
  if (!nn.length) return `<p class="muted small">No data.</p>`;
  const lo = Math.min(0, ...nn), hi = Math.max(0, ...nn), y = (v) => top + ((hi - v) / (hi - lo || 1)) * (H - top - bot), slot = W / n, bw = slot * 0.56;
  const f = (v) => (money ? fM(v) : v.toLocaleString());
  const bars = vals.map((v, i) => { if (v == null) return `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${y(0) - 4}" text-anchor="middle" class="an-l">n/a</text>`;
    const y0 = y(0), y1 = y(v), x = i * slot + (slot - bw) / 2;
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="3" fill="${v >= 0 ? "var(--brand)" : "var(--bad)"}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(v >= 0 ? y1 - 5 : y1 + 12).toFixed(1)}" text-anchor="middle" class="an-l">${f(v)}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="an-bars" role="img"><line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--line)"/>${bars}${labels.map((l, i) => `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="an-x">${esc(l)}</text>`).join("")}</svg>`;
}

// Debt vs equity by year, with the debt-to-equity ratio under each year
function anDE(hist) {
  const rows = (hist || []).filter((h) => h.equity != null);
  if (rows.length < 2) return `<p class="muted small">Not enough balance-sheet history yet.</p>`;
  const W = 340, H = 190, top = 20, bot = 40, n = rows.length, slot = W / n, bw = slot * 0.3, mx = Math.max(1, ...rows.map((r) => Math.max(Math.abs(r.debt || 0), Math.abs(r.equity)))), y = (v) => top + (1 - Math.max(0, v) / mx) * (H - top - bot), y0 = y(0);
  const bar = (x, v, col) => v == null ? "" : `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y0 - y(v)).toFixed(1)}" rx="3" fill="${col}"/><text x="${(x + bw / 2).toFixed(1)}" y="${(y(v) - 4).toFixed(1)}" text-anchor="middle" class="an-l">${fM(v)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="an-bars" role="img" aria-label="Debt and equity by year"><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="var(--line)"/>
    ${rows.map((r, i) => { const x = i * slot + slot / 2; return bar(x - bw - 2, r.debt == null ? 0 : r.debt, "var(--bad)") + bar(x + 2, r.equity, "var(--brand)") + `<text x="${x.toFixed(1)}" y="${H - 22}" text-anchor="middle" class="an-x">${esc(r.p)}</text><text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="an-l">${r.ratio == null ? "n/a" : r.ratio + "% D/E"}</text>`; }).join("")}</svg>
   <p class="small muted" style="margin:4px 0 0"><span style="color:var(--bad)">■</span> Debt &nbsp; <span style="color:var(--brand)">■</span> Shareholders' equity. D/E = debt as a share of equity.</p>`;
}

// One stacked bar: [{label, v, cls}], widths proportional to v
function anStack(items, fmt = fM) {
  const tot = items.reduce((a, b) => a + Math.max(0, b.v || 0), 0) || 1;
  return `<div class="an-stack">${items.filter((i) => (i.v || 0) > 0).map((i) => `<span class="${i.cls}" style="flex:${(i.v / tot) * 100}" title="${esc(i.label)}: ${fmt(i.v)}">${(i.v / tot) > 0.12 ? `<b>${esc(i.label)}</b><small>${fmt(i.v)}</small>` : ""}</span>`).join("")}</div>`;
}

function anValueBars(sc, row) {
  const key = AN_VAL.on, names = { pe: "Price / earnings", pfcf: "Price / free cash flow", evebit: "EV / operating profit", pb: "Price / book value" };
  const me = sc.sec.valuation.metrics[key], rows = [{ s: row[0], v: me.v, me: true }].concat((sc.similar || []).map((p) => ({ s: p.s, v: p[key], me: false }))), ok = rows.filter((r) => r.v != null), med = me.med, mx = Math.max(1, ...ok.map((r) => r.v), med || 0) * 1.05;
  return `<div class="tabs" style="margin:6px 0 10px">${Object.entries(names).filter(([k]) => sc.sec.valuation.metrics[k]).map(([k, l]) => `<a href="#" data-vk="${k}" class="${k === key ? "on" : ""}">${l}</a>`).join("")}</div>
   <div class="an-vb">${rows.map((r) => `<div class="an-vr"><span class="an-vs ${r.me ? "me" : ""}">${r.me ? "<b>" + esc(r.s) + "</b>" : `<a href="#/analysis/${esc(r.s)}">${esc(r.s)}</a>`}</span>
      <span class="an-vt"><i style="width:${r.v == null ? 0 : Math.max(1.5, (r.v / mx) * 100).toFixed(1)}%" class="${r.me ? "me" : ""}"></i>${med ? `<u style="left:${((med / mx) * 100).toFixed(1)}%"></u>` : ""}</span><span class="an-vv">${r.v == null ? "n/a" : r.v.toFixed(1) + "×"}</span></div>`).join("")}</div>
   <p class="small muted" style="margin:6px 0 0">${med ? `The dashed line is the sector median (${med.toFixed(1)}×). ` : ""}Shorter bars mean cheaper. Other bars are similar companies; tap one to open its analysis.</p>`;
}

const anCard = (p) => `<a class="an-sc" href="#/analysis/${esc(p.s)}"><b>${esc(p.s)}</b><span class="small muted">${esc(p.name)}</span><span class="an-mr">${miniRadar(p.axes, 96)}</span><span class="small">${capStr(p.cap_b)} · ${anUsd(p.price)}</span></a>`;
const anDiscover = (title, note, list) => (list && list.length ? `<h3 style="margin:18px 0 2px">${title}</h3><p class="small muted" style="margin:0 0 8px">${note}</p><div class="an-sim">${list.map(anCard).join("")}</div>` : "");

// The paid parts of an analysis (past performance, financial health, dividends, ownership, management) come from the signed-in-only edge function, not from the public site.
const AN_PRO_KEYS = ["past", "health", "dividend", "ownership", "management"];
async function loadPro(sym) {
  if (!liveOK()) return null;
  try { return await liveGet("action=pro_data&symbol=" + encodeURIComponent(sym)); } catch (e) { return null; }
}
const anLock = (id, title, extra) => `<section class="card an-sec" id="an-${id}"><h2 style="margin:0 0 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${title} ${extra || ""}</h2>
  <div class="an-lock"><b>This section is part of the Pro plan.</b><p class="small muted" style="margin:4px 0 0">${liveOK() ? "Paid plans aren't open yet. When they are, Pro will unlock the balance sheet and debt history, insider trades and ownership, leadership and pay, and dividend history for every company." : "Sign in to see it."}</p></div></section>`;

async function analysisPage(sym) {
  sym = decodeURIComponent(sym || "").toUpperCase();
  const row = state.search && state.search.stocks.find((r) => r[0] === sym), sc = await loadScore(sym);
  if (!row || !sc) return `<a href="#/stock/${esc(sym)}" class="small">← ${esc(sym)}</a><h1>Full analysis</h1><div class="card"><p>We don't have a full analysis for this company. It needs filing data, so foreign companies and very new listings are often missing.</p></div>`;
  const [, name, sector, capB, price] = row, disc = sc.discover || {};
  const proDoc = AN_PRO_KEYS.some((k) => sc.sec[k] && sc.sec[k].locked) ? await loadPro(sym) : null, lockedPro = AN_PRO_KEYS.some((k) => sc.sec[k] && sc.sec[k].locked) && !proDoc;
  const S = Object.assign({}, sc.sec, proDoc || {});
  if (lockedPro) AN_PRO_KEYS.forEach((k) => { S[k] = Object.assign({ checks: [] }, S[k]); });
  let about = null; try { const r = await fetch((DATA_BASE || "data/") + "about/" + encodeURIComponent(sym) + ".json"); if (r.ok) about = await r.json(); } catch (e) {}
  afterRender.push(() => {
    document.querySelectorAll("[data-sec]").forEach((a) => a.onclick = (e) => { e.preventDefault(); const t = document.getElementById("an-" + a.dataset.sec); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    function bindVk() { document.querySelectorAll("[data-vk]").forEach((a) => a.onclick = (e) => { e.preventDefault(); AN_VAL.on = a.dataset.vk; document.getElementById("an-valbars").innerHTML = anValueBars(sc, row); bindVk(); }); }
    bindVk();
    document.querySelectorAll("[data-more]").forEach((b) => b.onclick = () => { document.querySelectorAll(b.dataset.more + " .an-hide").forEach((r) => r.classList.remove("an-hide")); b.remove(); });
    if ("IntersectionObserver" in window) {   // highlight the section being read
      const links = {}; document.querySelectorAll("[data-sec]").forEach((a) => { links[a.dataset.sec] = a; });
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { Object.values(links).forEach((l) => l.classList.remove("on")); const l = links[e.target.id.replace("an-", "")]; if (l) l.classList.add("on"); } }), { rootMargin: "-120px 0px -65% 0px" });
      AN_SECTIONS.forEach(([k]) => { const t = document.getElementById("an-" + k); if (t) io.observe(t); });
    }
  });
  const nav = AN_SECTIONS.map(([k, l], i) => { const n = AN_SCORED.indexOf(k); return `<a href="#" data-sec="${k}" class="${i === 0 ? "on" : ""}"><span>${n >= 0 ? n + 1 + " " : ""}${l}</span>${S[k] ? anScore(S[k]) : ""}</a>`; }).join("");
  const li = (k, t) => `<li><i class="${k}">${k === "ok" ? "✓" : "!"}</i><span>${esc(t)}</span></li>`;
  const pl = sc.peer, m = sc.model, gap = (v) => { const g = (price / v - 1) * 100; return `Today's price is <b>${Math.abs(g).toFixed(0)}% ${g >= 0 ? "above" : "below"}</b> it.`; };
  const sect = (id, title, extra, body) => lockedPro && AN_PRO_KEYS.includes(id) ? anLock(id, title, extra) : `<section class="card an-sec" id="an-${id}"><h2 style="margin:0 0 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${title} ${extra || ""}</h2>${body}</section>`;
  const checks = (sec, blank) => sec && sec.checks && sec.checks.length ? `<ul class="an-ck">${sec.checks.map(anChk).join("")}</ul>` : `<p class="muted small">${esc((sec && sec.note) || blank || "Nothing to check here.")}</p>`;

  // ---- 1 valuation ----
  const valuation = sect("valuation", "1 Valuation", anScore(S.valuation), `<p class="small muted" style="margin:0 0 8px">Is the stock cheap or expensive compared with its sector and with its own cash flows? Each line is a check; ticks are in the stock's favor.</p>${checks(S.valuation)}
    <h3 style="margin:16px 0 0">Valuation compared with similar companies</h3><div id="an-valbars">${anValueBars(sc, row)}</div>
    <div class="vstrip" style="margin-top:14px"><div><div class="small muted">Share price</div><b style="font-size:20px">${anUsd(price)}</b></div>
     ${pl ? `<div><div class="small muted">Value at sector-typical prices</div><b style="font-size:20px">${anUsd(pl.base)}</b><div class="small muted">Range ${anUsd(pl.low)} to ${anUsd(pl.high)}. ${gap(pl.base)}</div></div>` : ""}
     ${m && m.ok ? `<div><div class="small muted">Cash-flow model (DCF)</div><b style="font-size:20px">${anUsd(m.base)}</b><div class="small muted">Bear ${anUsd(m.bear)} to bull ${anUsd(m.bull)}. <a href="#/report/${esc(sym)}">Valuation report →</a></div></div>` : ""}</div>
    <p class="small muted" style="margin:10px 0 0">These are yardsticks, not price targets. We don't use analyst forecasts or targets (they are paid data), so "future growth" isn't scored; the sections below show what the filings say about the past and today.</p>
    ${anDiscover("Discover cheaper companies", "Companies in the same sector that score best on value.", disc.value)}`);

  // ---- 2 past performance ----
  const P = S.past, pb = P.periods || [];
  const past = sect("past", "2 Past performance", anScore(P), `<p class="small muted" style="margin:0 0 8px">How the business has actually performed, from its annual SEC filings.</p>${checks(P)}
    <div class="an-grid" style="margin-top:12px">${[["Revenue", P.rev], ["Net income", P.ni], ["Operating profit", P.opinc], ["Free cash flow", P.fcf]].map(([t, v]) => `<div><h4 style="margin:0 0 2px">${t}</h4>${anBars(v || [], pb, true)}</div>`).join("")}</div>
    ${P.surprises && P.surprises.length ? `<h3 style="margin:14px 0 4px">Recent earnings versus expectations</h3><div class="tw"><table><tr><th>Quarter</th><th>Reported EPS</th><th>Expected</th><th>Surprise</th></tr>${P.surprises.map((e) => `<tr><td>${esc(e.q || "")}</td><td>${esc(String(e.eps))}</td><td>${e.est == null ? "-" : "$" + e.est}</td><td>${pctTxt(e.pct)}</td></tr>`).join("")}</table></div>` : ""}
    ${anDiscover("Discover faster-growing companies", "Companies in the same sector that score best on growth.", disc.growth)}`);

  // ---- 3 financial health ----
  const H = S.health, sh = H.sheet;
  const sheet = sh ? `<h3 style="margin:16px 0 4px">Balance sheet</h3><p class="small muted" style="margin:0 0 8px">What the company owns on the left; what it owes and what belongs to shareholders on the right (latest year-end).</p>
     <div class="an-two"><div><div class="small" style="margin-bottom:4px"><b>Assets</b> ${fM(sh.assets)}</div>${anStack([{ label: "Cash & investments", v: sh.cash || 0, cls: "s1" }, { label: "Other short-term", v: Math.max(0, (sh.current_assets || 0) - (sh.cash || 0)), cls: "s2" }, { label: "Long-term", v: Math.max(0, sh.assets - (sh.current_assets || 0)), cls: "s3" }])}</div>
     <div><div class="small" style="margin-bottom:4px"><b>Liabilities + equity</b> ${fM(sh.assets)}</div>${anStack([{ label: "Short-term liabilities", v: sh.current_liab || 0, cls: "s4" }, { label: "Long-term liabilities", v: Math.max(0, (sh.liab || 0) - (sh.current_liab || 0)), cls: "s5" }, { label: "Shareholders' equity", v: Math.max(0, sh.equity || 0), cls: "s6" }])}</div></div>` : "";
  const health = sect("health", "3 Financial health", anScore(H), `<p class="small muted" style="margin:0 0 8px">Can the company comfortably pay its bills and its debt?</p>${checks(H)}
    ${H.debt_equity_history && H.debt_equity_history.length >= 2 ? `<h3 style="margin:16px 0 4px">Debt and equity over time</h3>${anDE(H.debt_equity_history)}` : ""}${sheet}
    ${anDiscover("Discover healthier companies", "Companies in the same sector with the strongest balance sheets.", disc.health)}`);

  // ---- 4 dividends & buybacks ----
  const D = S.dividend;
  const dividend = sect("dividend", "4 Dividends & buybacks", anScore(D), `<p class="small muted" style="margin:0 0 8px">How much of the profit comes back to shareholders, and whether it can last.</p>${checks(D)}
    <div class="hz" style="margin-top:10px"><div class="card"><div class="small muted">Dividend yield</div><b style="font-size:20px">${D.yield_pct}%</b></div><div class="card"><div class="small muted">Share of profit paid out</div><b style="font-size:20px">${D.payout_pct == null ? "-" : D.payout_pct + "%"}</b></div><div class="card"><div class="small muted">Dividends + buybacks / value</div><b style="font-size:20px">${D.shareholder_yield}%</b></div></div>
    <div class="an-grid" style="margin-top:12px"><div><h4 style="margin:0 0 2px">Dividends paid</h4>${anBars(D.div || [], D.periods || [], true)}</div><div><h4 style="margin:0 0 2px">Share buybacks</h4>${anBars(D.buy || [], D.periods || [], true)}</div></div>
    ${D.history && D.history.length ? `<h3 style="margin:14px 0 4px">Dividend payments per share</h3><div class="tw"><table><tr><th>Ex-dividend date</th><th>Amount per share</th><th>Paid</th></tr>${D.history.map((d) => `<tr><td>${esc(d.ex || "-")}</td><td>${d.amount == null ? "-" : "$" + d.amount}</td><td>${esc(d.paid || "-")}</td></tr>`).join("")}</table></div>` : ""}
    ${anDiscover("Discover companies that pay shareholders", "Companies in the same sector that return the most to shareholders.", disc.payout)}`);

  // ---- 5 management ----
  const Mg = S.management || { checks: [], officers: [], gov: {}, updates: [] }, gv = Mg.gov || {};
  const govBars = [["overallRisk", "Overall governance risk"], ["auditRisk", "Audit"], ["boardRisk", "Board structure"], ["compensationRisk", "Executive pay"], ["shareHolderRightsRisk", "Shareholder rights"]].filter(([k]) => gv[k] != null)
    .map(([k, l]) => `<div class="an-vr"><span class="an-vs" style="width:150px">${l}</span><span class="an-vt"><i style="width:${gv[k] * 10}%" class="${gv[k] <= 3 ? "g" : gv[k] <= 6 ? "" : "r"}"></i></span><span class="an-vv" style="width:56px">${gv[k]}/10</span></div>`).join("");
  const ceo = Mg.ceo;
  const management = sect("management", "5 Management", anScore(Mg), `<p class="small muted" style="margin:0 0 8px">Who runs the company, how they are paid, and independent ratings of how well it is governed.</p>${Mg.checks.length ? checks(Mg) : `<p class="muted small">${esc(Mg.note || "No governance ratings are available for this company.")}</p>`}
    ${ceo ? `<div class="vstrip" style="margin-top:12px"><div><div class="small muted">${esc(ceo.title || "Chief executive")}</div><b style="font-size:19px">${esc(ceo.name)}</b>${ceo.age ? `<div class="small muted">Age ${ceo.age}</div>` : ""}</div><div><div class="small muted">Total pay${ceo.year ? " (" + ceo.year + ")" : ""}</div><b style="font-size:20px">${anPay(ceo.pay)}</b></div></div>` : ""}
    ${Mg.officers && Mg.officers.length ? `<h3 style="margin:14px 0 4px">Leadership team</h3><div class="tw"><table><tr><th>Name</th><th>Role</th><th>Age</th><th>Total pay</th></tr>${Mg.officers.map((o) => `<tr><td><b>${esc(o.name)}</b></td><td class="small">${esc(o.title || "")}</td><td>${o.age || "-"}</td><td>${anPay(o.pay)}</td></tr>`).join("")}</table></div>` : ""}
    ${govBars ? `<h3 style="margin:14px 0 4px">Governance risk ratings</h3><p class="small muted" style="margin:0 0 6px">Independent governance scores, from 1 (lowest risk) to 10 (highest), compared with other large companies.</p><div class="an-vb">${govBars}</div>` : ""}
    ${Mg.updates && Mg.updates.length ? `<h3 style="margin:14px 0 4px">Recent management changes</h3><ul class="an-ul">${Mg.updates.map((u) => `<li><b>${anD(u.date)}</b> ${esc(u.what)} <a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">Read the filing →</a></li>`).join("")}</ul>` : ""}
    <p class="small muted" style="margin:10px 0 0">Pay and governance data come from company proxy filings via Yahoo Finance. Insiders' share trades are in the Ownership section.</p>`);

  // ---- 6 ownership ----
  const O = S.ownership, shOut = (O.shares_out_m || 0) * 1e6;
  const buys = O.tx || [], tcls = (t) => (/buy|purchase/i.test(t || "") ? "buy" : /sell|sale/i.test(t || "") ? "sell" : "oth");
  const vmax = Math.max(1, ...[O.bought, O.sold].filter(Boolean).flat());
  const vrow = (label, i) => `<div class="an-vr"><span class="an-vs" style="width:96px">${label}</span><span style="flex:1;display:flex;flex-direction:column;gap:5px"><span class="an-vt" style="flex:none;width:100%"><i class="o" style="width:${O.sold && O.sold[i] ? Math.max(1, O.sold[i] / vmax * 100) : 0}%"></i></span><span class="an-vt" style="flex:none;width:100%"><i class="g" style="width:${O.bought && O.bought[i] ? Math.max(1, O.bought[i] / vmax * 100) : 0}%"></i></span></span>
     <span class="small" style="width:150px;flex:none">${O.sold ? anN(O.sold[i]) : "-"} sold${O.sells ? " (" + O.sells[i] + " trades)" : ""}<br>${O.bought ? anN(O.bought[i]) : "-"} bought${O.buys ? " (" + O.buys[i] + " trades)" : ""}</span></div>`;
  const ownRows = (O.holders || []).map((h, i) => `<tr class="${i >= 8 ? "an-hide" : ""}"><td>${shOut && h.shares ? (h.shares / shOut * 100).toFixed(2) + "%" : "-"}</td><td><b>${esc(h.name)}</b><div class="small muted">as of ${esc(h.date || "-")}</div></td><td>${anN(h.shares)}</td><td>${h.value_k != null ? "$" + anN(h.value_k * 1000) : "-"}</td><td>${h.change_pct == null ? "-" : pctTxt(h.change_pct)}</td></tr>`).join("");
  const ownership = sect("ownership", "6 Ownership", anScore(O), `<p class="small muted" style="margin:0 0 8px">Who owns the company, and what insiders and big investors have been doing. A filing shows what happened, not whether it was wise: executives often sell on a schedule, and funds trade for many reasons.</p>${checks(O)}
    ${buys.length ? `<h3 style="margin:16px 0 4px">Recent insider transactions</h3><div class="tw"><table><tr><th>Date</th><th>Name</th><th>Type</th><th>Shares</th><th>Price</th></tr>${buys.map((t) => `<tr><td>${anD(t.date)}</td><td><b>${esc(t.who)}</b><div class="small muted">${esc(t.rel || "")}</div></td><td><span class="an-tag ${tcls(t.type)}">${esc((t.type || "").replace(/\s*\(.*\)/, ""))}</span></td><td>${t.shares == null ? "-" : t.shares.toLocaleString()}</td><td>${t.price ? anUsd(t.price) : "-"}</td></tr>`).join("")}</table></div><p class="small muted" style="margin:4px 0 0">From SEC Form 4 filings. Non-market items (gifts, tax withholding, option exercises) aren't buys or sells in the usual sense.</p>` : `<p class="muted small">Insider trades are added nightly for the largest companies. ${O.insider_filings_90d != null ? `<b>${O.insider_filings_90d}</b> insider reports were filed in the last 90 days.` : ""}</p>`}
    ${O.bought || O.sold ? `<h3 style="margin:16px 0 4px">Insider trading volume</h3><div class="an-vb">${vrow("Last 3 months", 0)}${vrow("Last 12 months", 1)}</div><p class="small muted" style="margin:4px 0 0"><span style="color:var(--warn)">■</span> shares sold &nbsp; <span style="color:var(--ok)">■</span> shares bought (open-market trades)</p>` : ""}
    ${O.inst_pct != null ? `<h3 style="margin:16px 0 4px">Ownership breakdown</h3>${anStack([{ label: "Insiders", v: O.insider_pct || 0, cls: "s7" }, { label: "Institutions", v: O.inst_pct || 0, cls: "s6" }, { label: "General public", v: O.public_pct || 0, cls: "s8" }], (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "%")}
      <p class="small" style="margin:6px 0 0"><b>Institutions</b> (funds, banks, pensions) hold <b>${O.inst_pct}%</b>${O.insider_pct != null ? `; <b>insiders</b> about <b>${O.insider_pct}%</b> (direct holdings in their latest filings)` : ""}; the rest, about <b>${O.public_pct}%</b>, is held by the general public.</p>` : ""}
    ${ownRows ? `<h3 style="margin:16px 0 4px">Top shareholders</h3><div class="tw" id="an-holders"><table><tr><th>Owns</th><th>Name</th><th>Shares</th><th>Value</th><th>Change in holding</th></tr>${ownRows}</table></div>${(O.holders || []).length > 8 ? `<p style="text-align:center;margin:8px 0 0"><button class="btn ghost" data-more="#an-holders">Show more</button></p>` : ""}<p class="small muted" style="margin:4px 0 0">From institutions' quarterly 13F filings, which arrive 45 days after each quarter ends.</p>` : ""}
    ${O.large_holder_filings && O.large_holder_filings.length ? `<h3 style="margin:16px 0 4px">Large-holder notices (5% or more)</h3><div class="tw"><table><tr><th>Filed</th><th>Form</th><th></th></tr>${O.large_holder_filings.map((f) => `<tr><td>${esc(f.date)}</td><td>${esc(f.form)}</td><td><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Read the filing →</a></td></tr>`).join("")}</table></div>` : ""}`);

  // ---- company information ----
  const I = S.info || {}, kv = (k, v) => (v ? `<div class="card"><div class="small muted">${k}</div><b>${esc(String(v))}</b></div>` : "");
  const info = sect("info", "Company information", "", `<p class="small muted" style="margin:0 0 8px">The basics, and where the data on this page comes from.</p><div class="hz">${kv("Industry", I.industry)}${kv("Listed on", I.exchange)}${kv("Employees", I.employees ? I.employees.toLocaleString() : null)}${kv("Headquarters", [I.city, I.state, I.country].filter(Boolean).join(", "))}${kv("SEC category", I.sic)}${kv("Fiscal year ends", I.fiscal_year_end ? I.fiscal_year_end.replace(/^(\d\d)(\d\d)$/, "$1/$2") : null)}${kv("Filer size", I.filer)}</div>
    <p class="small" style="margin:10px 0 0">${I.website ? `<a href="${esc(I.website)}" target="_blank" rel="noopener noreferrer">Company website →</a> · ` : ""}${I.cik ? `<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${I.cik}&type=&dateb=&owner=include&count=40" target="_blank" rel="noopener noreferrer">All SEC filings on EDGAR →</a> · ` : ""}<a href="#/report/${esc(sym)}/snapshot">Company snapshot →</a></p>
    <p class="small muted" style="margin:8px 0 0"><b>Data sources:</b> SEC EDGAR financial filings (financials, insider Form 4, large-holder notices), Nasdaq (insider and institutional tables, dividends, earnings), Yahoo Finance (prices, company profile, officers and governance scores). Updated nightly.</p>`);

  const similar = sect("similar", "Similar companies", "", `<p class="small muted" style="margin:0 0 10px">Companies in the same line of business and of a similar size, each with its own five-point scorecard. Tap one to compare.</p><div class="an-sim">${(sc.similar || []).map(anCard).join("") || `<p class="muted small">No similar companies found.</p>`}</div>`);
  const meta = about ? [about.industry, about.employees ? "about " + about.employees.toLocaleString() + " employees" : null, [about.city, about.country].filter(Boolean).join(", ") || null].filter(Boolean) : [];
  const overview = sect("overview", "Company overview", "", `${about && about.desc ? `<p style="margin:0 0 6px">${about.desc.map(esc).join(" ")}</p>${meta.length ? `<p class="small muted" style="margin:0 0 10px">${meta.map(esc).join(" · ")}</p>` : ""}` : `<p class="muted">${esc(name)} is in the ${esc(SECTOR_NAME(sector))} sector. A fuller description will appear here soon.</p>`}
    <div class="prof"><div><h3 style="margin:0 0 2px">Rewards</h3><ul class="rr">${sc.rewards.length ? sc.rewards.map((t) => li("ok", t)).join("") : `<li class="muted"><span>Nothing stands out as a clear strength.</span></li>`}</ul></div>
    <div><h3 style="margin:0 0 2px">Risks</h3><ul class="rr">${sc.risks.length ? sc.risks.map((r) => li(r.k, r.t)).join("") : `<li class="muted"><span>None of the risk checks fired.</span></li>`}</ul></div></div>`);
  return `<a href="#/stock/${esc(sym)}" class="small">← ${esc(name)} stock page</a>
   <div class="an-head"><div><span class="pill">Full analysis</span><h1 style="margin:6px 0 0">${esc(name)} <span class="muted">(${esc(sym)})</span></h1><div class="muted small">${esc(SECTOR_NAME(sector))} · ${anUsd(price)} · market value ${capStr(capB)}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${heartBtn("stock", sym, { label: name })}<a class="btn ghost" href="#/report/${esc(sym)}">Valuation report</a><a class="btn ghost" href="#/explore/compare/${esc(sym)}">Compare</a></div></div>
   <div class="an"><aside class="an-side"><div class="card" style="padding:14px">${radarSvg(sc.axes)}${sc.summary ? `<p class="small" style="margin:0;text-align:center"><b>${esc(sc.summary.split(" Scores compare")[0])}</b></p>` : ""}</div>
     <nav class="an-nav card" aria-label="Sections">${nav}</nav></aside>
    <div class="an-main">${overview}${valuation}${past}${health}${dividend}${management}${ownership}${info}${similar}
     <p class="small muted">Built from SEC filings, Nasdaq and Yahoo Finance data with fixed rules, updated nightly. Educational only: not investment advice, a rating, or a price target.</p></div></div>`;
}
