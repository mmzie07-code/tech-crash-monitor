const $ = (s) => document.querySelector(s);
const state = { snap: null, mk: null, brief: null, done: {} };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
try { state.done = JSON.parse(localStorage.getItem("ml_done") || "{}"); } catch (e) {}
const saveDone = () => { try { localStorage.setItem("ml_done", JSON.stringify(state.done)); } catch (e) {} };
const DISC = "Educational content only. Not investment advice. Investing involves risk, including loss of money, and short-term forecasts, including ours, are frequently wrong.";
const COL = { warn: "var(--warn)", ok: "var(--ok)", unknown: "var(--unk)" };

async function loadJson(name) {
  for (const base of ["data/", "../data/"]) {
    try { const r = await fetch(base + name + "?" + Date.now()); if (r.ok) return await r.json(); } catch (e) {}
  }
  return null;
}
async function loadSnap() { [state.snap, state.mk, state.brief] = await Promise.all([loadJson("latest.json"), loadJson("markets.json"), loadJson("brief.json")]); }
const lvlColor = (l) => ({ Low: "var(--ok)", Elevated: "var(--warn)", High: "var(--bad)", Severe: "var(--bad)" })[l] || "var(--mut)";
const doneCount = () => MODULES.filter((m) => state.done[m.id]).length;

function snapCard(link) {
  const s = state.snap;
  if (!s) return `<div class="card"><div class="muted">Live monitor unavailable right now.</div></div>`;
  return `<div class="card big"><div class="strip"><div><div class="num" style="color:${lvlColor(s.level)}">${s.score}</div><div class="small muted">crash-risk score, ${s.date}</div></div>
  <div style="flex:1;min-width:200px"><h3>AI &amp; Tech Watch: ${s.level} risk</h3><p class="muted small" style="margin:0">${s.warnings} of ${s.evaluated} warning signs flashing. Stretch ${s.stretch ?? "-"} · Trigger ${s.trigger ?? "-"}</p></div>
  ${link ? `<a class="btn ghost" href="#/watch">Open AI &amp; Tech Watch</a>` : ""}</div></div>`;
}

function chg(v, kind) {
  if (v == null) return `<span class="muted">-</span>`;
  const u = kind === "yield" ? " pts" : "%", c = v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)";
  return `<span style="color:${c};font-weight:700">${v > 0 ? "+" : ""}${v.toFixed(2)}${u}</span>`;
}
function tiles(rows) {
  return rows && rows.length ? `<div class="hz">${rows.map((r) => `<div class="card"><div class="small muted">${r.name}</div><div style="font-size:22px;font-weight:800">${r.last.toLocaleString()}</div>
   <div class="small">${chg(r.d1, r.kind)} today · ${chg(r.ytd, r.kind)} YTD</div></div>`).join("")}</div>` : `<div class="card muted">Data unavailable.</div>`;
}

function home() {
  return `<section class="hero"><span class="pill">For ages 16+</span><h1>Understand the market.<br><span class="grad">Follow it every day.</span></h1>
  <p class="lead">Plain-English lessons for people starting out, and a daily view of the whole market for people who already are: stocks, sectors, rates, and the risks building underneath. Real data, honest limits, no hype.</p>
  <a class="btn" href="#/learn">Start the crash course</a><a class="btn ghost" href="#/markets">See today's markets</a></section>
  <h2 style="margin-top:1.2em">Markets today</h2>${tiles(state.mk && state.mk.indices)}
  ${state.brief ? `<a class="card" href="#/markets/brief" style="color:inherit;display:block;margin-top:14px"><span class="pill g">Daily brief</span><h3>${esc(state.brief.headline)}</h3><p class="small muted" style="margin:0">Read today's full brief →</p></a>` : ""}
  <div class="cards">
   <a class="card" href="#/learn" style="color:inherit"><span class="pill">Learn</span><h3>A crash course in 8 short lessons</h3><p class="muted">From "what is a stock?" to spotting bubbles. Quizzes, a glossary, and practice trading with fake money.</p><div class="bar"><i style="width:${doneCount() / MODULES.length * 100}%"></i></div><p class="small muted" style="margin:6px 0 0">${doneCount()} of ${MODULES.length} complete</p></a>
   <a class="card" href="#/markets" style="color:inherit"><span class="pill g">Markets</span><h3>The whole market, daily</h3><p class="muted">Indices, all 11 sectors, rates, the dollar, oil, gold and more, plus a daily briefing and outlooks from today to next year.</p></a></div>
  <h2>Featured: AI &amp; Tech Watch</h2><p class="muted">One of the biggest questions in markets right now is whether AI and tech stocks are in a bubble. We track ten warning signs and test them against history.</p>${snapCard(true)}
  <h2 style="margin-top:1.4em">Why trust this?</h2>
  <div class="cards"><div class="card"><h3>We show our homework</h3><p class="muted small">Every number links to its data source, and we backtested our warning signs. Some of our own ideas failed, and we say so.</p></div>
  <div class="card"><h3>No stock tips</h3><p class="muted small">We teach how things work. We never tell you what to buy or sell.</p></div>
  <div class="card"><h3>Honest about limits</h3><p class="muted small">Nobody can reliably predict the market, and neither can we. Forecasts here are scenarios, not promises.</p></div></div>`;
}

function learn() {
  const rows = MODULES.map((m) => `<a class="mod ${state.done[m.id] ? "done" : ""} ${m.live ? "" : "soon"}" href="${m.live ? "#/learn/" + m.id : "#/learn"}">
   <div class="n">${state.done[m.id] ? "✓" : m.id}</div><div class="t"><b>${m.title}</b><span class="small muted">${m.blurb}</span></div>
   <span class="small muted">${m.live ? m.mins + " min" : "Coming soon"}</span></a>`).join("");
  return `<h1>Crash course</h1><p class="lead muted">Eight short lessons. Go at your own pace; progress saves on this device.</p>
  <div class="bar" style="margin:14px 0 22px"><i style="width:${doneCount() / MODULES.length * 100}%"></i></div><div class="mods">${rows}</div>
  <h2 style="margin-top:1.6em">Glossary</h2><div class="cards">${GLOSSARY.map(([t, d]) => `<div class="card"><b>${t}</b><p class="muted small" style="margin:4px 0 0">${d}</p></div>`).join("")}</div>
  <div class="card"><span class="pill w">Coming soon</span><h3>Paper trading</h3><p class="muted" style="margin:0">Practice with $10,000 of pretend money and real prices. No risk, real lessons.</p></div>`;
}

function mTabs(cur) {
  return `<div class="tabs">${[["overview", "Overview"], ["brief", "Daily brief"], ["outlook", "Outlook"]].map(([k, l]) => `<a class="${cur === k ? "on" : ""}" href="#/markets/${k}">${l}</a>`).join("")}</div>`;
}
function heat(v) {
  if (v == null) return "var(--card)";
  const a = Math.min(Math.abs(v) / 2.5, 1) * 0.55 + 0.08;
  return `color-mix(in srgb, ${v >= 0 ? "var(--ok)" : "var(--bad)"} ${Math.round(a * 100)}%, var(--card))`;
}
function rowList(rows) {
  return rows && rows.length ? rows.map((r) => `<div class="item" style="align-items:center"><div style="flex:1"><b>${r.name}</b><div class="small muted">${r.last.toLocaleString()}${r.from_high < -0.5 ? " · " + r.from_high + "% from 1y high" : " · near 1y high"}</div></div>
   <div class="small" style="text-align:right;min-width:150px">${chg(r.d1, r.kind)} 1d<br>${chg(r.m1, r.kind)} 1m · ${chg(r.ytd, r.kind)} YTD</div></div>`).join("") : `<div class="muted">Data unavailable.</div>`;
}

function briefView() {
  const d = state.brief;
  if (!d) return `<div class="card muted">Today's brief isn't available yet.</div>`;
  const link = (h) => /^https?:\/\//.test(h.link) ? `<a href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : esc(h.title);
  return `<div class="card big"><span class="pill g">Market close ${esc(d.date)}</span><h2 style="margin-top:8px">${esc(d.headline)}</h2>
   ${d.summary ? `<p>${esc(d.summary)}</p><p class="small muted">Summary written by AI from the data below. It can contain mistakes.</p>` : ""}</div>
   ${d.sections.map((s) => `<div class="card"><h3>${esc(s.title)}</h3><ul style="margin:.3em 0 0;padding-left:20px">${s.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
   <div class="card"><h3>Headlines</h3><p class="small muted">Titles and links only. Click through to read the full story at the source.</p>
   ${d.headlines.map((h) => `<div class="item"><div><div>${link(h)}</div><div class="small muted">${esc(h.source)}</div></div></div>`).join("")}</div>
   <p class="small muted">${esc(d.disclaimer)} New here? Start with the <a href="#/learn">crash course</a>.</p>`;
}

function markets(tab) {
  tab = tab || "overview"; const m = state.mk; let b = "";
  if (tab === "overview") {
    const sec = m && m.sectors ? [...m.sectors].sort((a, b) => b.d1 - a.d1) : [];
    b = `<h2>Major indices</h2>${tiles(m && m.indices)}
    <h2>Sectors today</h2><p class="muted small">Which parts of the economy are leading or lagging. Green is up, red is down.</p>
    <div class="hz">${sec.map((r) => `<div class="card" style="background:${heat(r.d1)}"><div class="small">${r.name}</div><div style="font-weight:800;font-size:20px">${chg(r.d1, r.kind)}</div><div class="small muted">${chg(r.ytd, r.kind)} YTD</div></div>`).join("")}</div>
    <h2>Rates, currencies &amp; commodities</h2><div class="card">${rowList(m && m.macro)}</div>
    <h2>Around the world</h2><div class="card">${rowList(m && m.global)}</div>
    <p class="small muted">Prices from Yahoo Finance, updated each trading day after the close${m ? " (snapshot " + m.indices[0].date + ")" : ""}. Sector figures use the SPDR sector ETFs.</p>
    <a class="card" href="#/watch" style="color:inherit;display:block"><span class="pill w">Featured</span><h3>AI &amp; Tech Watch</h3><p class="muted small" style="margin:0">Is there an AI bubble? Ten warning signs, tracked daily.</p></a>`;
  } else if (tab === "brief") {
    b = briefView();
  } else {
    b = `<p class="muted">How current events could affect the market, by time horizon. These will be <b>scenarios with stated assumptions</b>, not predictions, and each will say what would prove it wrong.</p>
    <div class="hz">${HORIZONS.map(([h, d]) => `<div class="card"><h3>${h}</h3><p class="muted small">${d}</p><div class="ph">Not built yet</div></div>`).join("")}</div>`;
  }
  return `<h1>Markets</h1>${mTabs(tab)}${b}`;
}

function watch() {
  const s = state.snap;
  return `<span class="pill w">Featured section</span><h1>AI &amp; Tech Watch</h1>
  <p class="muted">Are AI and tech stocks in a bubble, and are the warning signs of a crash flashing? Ten signs, checked every trading day.</p>` + (!s ? `<div class="card">Data unavailable.</div>` : `${snapCard(false)}
    <div class="card"><h3>QQQ (Nasdaq-100), 1 year</h3>${spark(s.qqq_series.map((x) => x[1]))}</div>
    <div class="card"><h3>The checklist</h3>${s.checks.map((c) => `<div class="item"><div class="dot" style="background:${COL[c.status]}"></div><div>
     <b>${c.id}. ${c.name}</b> <span class="pill">${c.group}</span>${c.proxy ? '<span class="pill w">proxy</span>' : ""}${c.weight === 0 ? '<span class="pill">context only</span>' : ""}
     <div class="small muted">${c.detail}</div>${c.threshold ? `<div class="small muted">Warns at: ${c.threshold}</div>` : ""}</div></div>`).join("")}</div>
    <p class="small muted">${s.evaluated} of ${s.total} checks are live. Thresholds were tested on 1999–2026 history: the combined score raised crash odds only about 1.7–2x. See <a href="#/about">how it works</a>.</p>`);
}

function spark(v) {
  const lo = Math.min(...v), hi = Math.max(...v);
  return `<svg class="spark" viewBox="0 0 600 110" preserveAspectRatio="none"><polyline fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${v.map((y, i) => `${i / (v.length - 1) * 600},${105 - (y - lo) / (hi - lo) * 100}`).join(" ")}"/></svg>`;
}

function about() {
  return `<div class="lesson"><h1>How it works</h1><p class="muted">${BRAND} is an educational project. It is not a broker, adviser, or source of trading signals.</p>
  <h2>Markets</h2><p>The Markets section tracks major indices, the 11 stock sectors, rates, the dollar, oil, gold and bitcoin from Yahoo Finance, updated each trading day.</p><h2>AI &amp; Tech Watch</h2><p>Ten warning signs for AI and tech stocks: valuation, concentration, the AI spending gap, earnings, rates, credit, fear, trend, insider selling, and chip-stock weakness. Each turns "warning" or "clear", and a weighted score summarises them.</p>
  <div class="callout"><b>We tested it.</b> Replaying 1999–2026, the combined score made a 15%+ drop in the next 60 days about 1.7–2x as likely as normal. That is a modest tilt, not a prediction. Two of our original ideas (low VIX and stretched prices as warnings) did not work, so we dropped or down-weighted them.</div>
  <h2>Data sources</h2><p>Market prices (Yahoo Finance), company filings and insider trades (SEC EDGAR). Updated each trading day.</p>
  <h2>Who it's for</h2><p>Ages 16 and up. We collect no personal information and show no ads.</p><h2>Important</h2><p>${DISC}</p></div>`;
}

function route() {
  const h = (location.hash || "#/").slice(2).split("/"), a = h[0] || "home";
  const views = { home: () => home(), learn: () => (h[1] ? lesson(h[1]) : learn()), markets: () => markets(h[1]), watch: () => watch(), about: () => about() };
  $("#view").innerHTML = (views[a] || views.home)();
  document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("on", n.dataset.nav === (a === "home" ? "" : a)));
  if (a === "learn" && h[1]) { wireQuiz(h[1]); wireWidgets(); }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
loadSnap().then(() => { $("#brand").textContent = BRAND; $("#disc").textContent = DISC; document.title = BRAND; route(); });
