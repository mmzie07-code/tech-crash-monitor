const $ = (s) => document.querySelector(s);
const state = { snap: null, mk: null, brief: null, cal: null, outlook: null, quotes: null, earnings: null, recaps: null, sectors: null, search: null, keepScroll: false, done: {} };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
try { state.done = JSON.parse(localStorage.getItem("ml_done") || "{}"); } catch (e) {}
const saveDone = () => { try { localStorage.setItem("ml_done", JSON.stringify(state.done)); } catch (e) {} if (typeof queueSync === "function") queueSync(); };
const DISC = "Educational content only. Not investment advice. Investing involves risk, including loss of money, and short-term forecasts, including ours, are frequently wrong.";
const COL = { warn: "var(--warn)", ok: "var(--ok)", unknown: "var(--unk)" };

let DATA_BASE = null; // "data/" on the live site, "../data/" in the local preview; found once, then reused
async function loadJson(name) {
  for (const base of DATA_BASE ? [DATA_BASE] : ["data/", "../data/"]) {
    try { const r = await fetch(base + name + "?" + Date.now()); if (r.ok) { DATA_BASE = base; return await r.json(); } } catch (e) {}
  }
  return null;
}
async function loadSnap() { [state.snap, state.mk, state.brief, state.cal, state.outlook, state.quotes, state.sectors, state.search, state.earnings, state.recaps] = await Promise.all([loadJson("latest.json"), loadJson("markets.json"), loadJson("brief.json"), loadJson("calendar.json"), loadJson("outlook.json"), loadJson("quotes.json"), loadJson("sectors.json"), loadJson("search.json"), loadJson("earnings.json"), loadJson("recaps.json")]); }
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
  return rows && rows.length ? `<div class="hz">${rows.map((r) => `<a class="card" href="#/market/${encodeURIComponent(r.symbol)}" style="color:inherit;display:block"><div class="small muted">${r.name}</div><div style="font-size:22px;font-weight:800">${r.last.toLocaleString()}</div>
   <div class="small">${chg(r.d1, r.kind)} today · ${chg(r.ytd, r.kind)} YTD</div><div class="small" style="color:var(--brand);margin-top:4px">View chart →</div></a>`).join("")}</div>` : `<div class="card muted">Data unavailable.</div>`;
}

function home() {
  return `<section class="hero"><span class="pill">For ages 16+</span><h1>Understand the market.<br><span class="grad">Follow it every day.</span></h1>
  <p class="lead">A daily view of the whole market: stocks, sectors, rates, the economic calendar, and the risks building underneath. Real data, honest limits, no hype.</p>
  <a class="btn" href="#/markets">See today's markets</a><a class="btn ghost" href="#/explore">Explore sectors &amp; stocks</a>
  <p class="small" style="margin-top:14px">New to investing? <a href="#/learn">Take the crash course</a> or <a href="#/practice">try practice trading</a>.</p>
  ${typeof AUTH !== "undefined" && AUTH.enabled && window.ANALYTIC.requireLogin && !signedIn() ? `<p class="small muted" style="margin-top:14px">Free account required · <a href="#/login">Sign in or create one</a> · ages 16+</p>` : ""}</section>
  <h2 style="margin-top:1.2em">Markets today</h2>${tiles(state.mk && state.mk.indices)}
  ${state.brief ? `<a class="card" href="#/markets/brief" style="color:inherit;display:block;margin-top:14px"><span class="pill g">Daily brief</span><h3>${esc(state.brief.headline)}</h3><p class="small muted" style="margin:0">Read today's full brief →</p></a>` : ""}
  <div class="cards">
   <a class="card" href="#/markets" style="color:inherit"><span class="pill g">Markets</span><h3>The whole market, daily</h3><p class="muted">Indices, all 11 sectors, rates, the dollar, oil, gold and more, plus a daily briefing and outlooks from today to next year.</p></a>
   <a class="card" href="#/learn" style="color:inherit"><span class="pill">Learn</span><h3>A crash course in 8 short lessons</h3><p class="muted">From "what is a stock?" to spotting bubbles. Quizzes, a glossary, and practice trading with fake money.</p><div class="bar"><i style="width:${doneCount() / MODULES.length * 100}%"></i></div><p class="small muted" style="margin:6px 0 0">${doneCount()} of ${MODULES.length} complete</p></a></div>
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
  <a class="card" href="#/practice" style="color:inherit;display:block"><span class="pill g">New</span><h3>Practice trading</h3><p class="muted" style="margin:0">Try investing with $10,000 of pretend money and real prices. No risk, real lessons, and goals that test what you learned.</p></a>`;
}

function mTabs(cur) {
  return `<div class="tabs">${[["overview", "Overview"], ["brief", "Daily brief"], ["earnings", "Earnings"], ["calendar", "Calendar"], ["outlook", "Outlook"]].map(([k, l]) => `<a class="${cur === k ? "on" : ""}" href="#/markets/${k}">${l}</a>`).join("")}</div>`;
}
const SECTOR_ETF_KEY = { XLK: "technology", XLC: "communication", XLY: "consumer-discretionary", XLP: "consumer-staples", XLF: "financials", XLV: "health-care", XLI: "industrials", XLE: "energy", XLU: "utilities", XLB: "materials", XLRE: "real-estate" };
function heat(v) {
  if (v == null) return "var(--card)";
  const a = Math.min(Math.abs(v) / 2.5, 1) * 0.55 + 0.08;
  return `color-mix(in srgb, ${v >= 0 ? "var(--ok)" : "var(--bad)"} ${Math.round(a * 100)}%, var(--card))`;
}
function rowList(rows) {
  return rows && rows.length ? rows.map((r) => `<a class="item" href="#/market/${encodeURIComponent(r.symbol)}" style="align-items:center;color:inherit"><div style="flex:1"><b>${r.name}</b><div class="small muted">${r.last.toLocaleString()}${r.from_high < -0.5 ? " · " + r.from_high + "% from 1y high" : " · near 1y high"}</div></div>
   <div class="small" style="text-align:right;min-width:150px">${chg(r.d1, r.kind)} 1d<br>${chg(r.m1, r.kind)} 1m · ${chg(r.ytd, r.kind)} YTD</div></a>`).join("") : `<div class="muted">Data unavailable.</div>`;
}

function rangeBar(st, thr) {
  const lo = Math.min(st.p10, -thr) * 1.15, hi = Math.max(st.p90, thr) * 1.15, pos = (v) => ((v - lo) / (hi - lo) * 100).toFixed(1);
  return `<div style="position:relative;height:34px;margin:14px 0 6px"><div style="position:absolute;top:14px;height:6px;left:0;right:0;background:var(--line);border-radius:9px"></div>
  <div title="Middle 80% of outcomes" style="position:absolute;top:10px;height:14px;border-radius:9px;background:color-mix(in srgb,var(--brand) 28%,transparent);left:${pos(st.p10)}%;width:${pos(st.p90) - pos(st.p10)}%"></div>
  <div title="Middle 50% of outcomes" style="position:absolute;top:7px;height:20px;border-radius:9px;background:color-mix(in srgb,var(--brand) 55%,transparent);left:${pos(st.p25)}%;width:${pos(st.p75) - pos(st.p25)}%"></div>
  <div style="position:absolute;top:2px;height:30px;width:3px;background:var(--tx);border-radius:2px;left:${pos(st.median)}%" title="Median"></div>
  <div style="position:absolute;top:0;bottom:0;width:1px;background:var(--mut);left:${pos(0)}%;opacity:.5"></div></div>
  <div class="small muted" style="display:flex;justify-content:space-between"><span>${st.p10 > 0 ? "+" : ""}${st.p10}%</span><span>median ${st.median > 0 ? "+" : ""}${st.median}%</span><span>+${st.p90}%</span></div>`;
}

function outlookView(key) {
  const o = state.outlook;
  if (!o) return `<div class="card muted">The outlook isn't available right now.</div>`;
  key = o.horizons[key] ? key : "month";
  const h = o.horizons[key], a = h.all, s = h.similar, thr = h.threshold, yrs = o.history_from.slice(0, 4);
  const pills = Object.entries(o.horizons).map(([k, v]) => `<a class="${k === key ? "on" : ""}" href="#/markets/outlook/${k}">${esc(v.label)}</a>`).join("");
  const span = h.trading_days === 1 ? "single trading days" : h.trading_days === 5 ? "weeks (5 trading days)" : h.trading_days === 21 ? "months (21 trading days)" : "years (252 trading days)";
  const dist = (st, title, sub) => st ? `<div class="card"><h3>${title}</h3><p class="small muted">${sub}</p><div class="strip"><div><div class="num" style="font-size:40px">${st.up}%</div><div class="small muted">of periods ended higher</div></div>
   <div style="flex:1;min-width:220px">${rangeBar(st, thr)}<p class="small muted" style="margin:6px 0 0">Darker band = middle 50% of outcomes; lighter = middle 80%. Worst ${st.worst}%, best +${st.best}%.</p></div></div>
   <div class="hz" style="margin-top:12px"><div class="card" style="padding:12px"><div class="small muted">Fell more than ${thr}%</div><b style="font-size:20px;color:var(--bad)">${st.below}%</b></div>
   <div class="card" style="padding:12px"><div class="small muted">Stayed within ±${thr}%</div><b style="font-size:20px">${100 - st.below - st.above}%</b></div>
   <div class="card" style="padding:12px"><div class="small muted">Rose more than ${thr}%</div><b style="font-size:20px;color:var(--ok)">${st.above}%</b></div></div></div>` : "";
  const evs = h.events.length ? h.events.map((e) => `<div class="item"><span class="dot" style="background:${e.importance === "high" ? "var(--bad)" : "var(--warn)"}"></span><div><b>${esc(e.title)}</b><div class="small muted">${new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${esc(e.time)}${/^\d/.test(e.time) ? " ET" : ""}</div></div></div>`).join("") : `<p class="small muted">No major scheduled events found in this window.</p>`;
  const lst = (arr, c) => arr.length ? `<ul style="margin:.3em 0 0;padding-left:18px">${arr.map((x) => `<li class="small" style="color:var(--tx)">${linkNames(x)}</li>`).join("")}</ul>` : `<p class="small muted">Nothing notable right now.</p>`;
  return `<p class="muted">How markets <i>have behaved</i> over each time horizon, and what's pushing on them right now. <b>This is not a forecast.</b> Nobody can reliably predict price moves, including us.</p>
  <div class="tabs">${pills}</div>
  <div class="card big"><span class="pill">${esc(h.label)}</span><h2 style="margin-top:8px">${key === "today" || key === "tomorrow" ? "One trading day" : "Over the next " + (key === "week" ? "week" : key === "month" ? "month" : "year")}: what history says</h2>
   <p style="margin:0">Across all ${span} since ${yrs}, the S&amp;P 500 rose ${a.up}% of the time. When conditions matched today's (${esc(o.regime)}), it rose ${s ? s.up + "%" : "n/a"} of the time${s ? ` (${s.n.toLocaleString()} similar days).` : "."}</p>
   ${key === "today" || key === "tomorrow" ? `<p class="small muted" style="margin:8px 0 0">Today and tomorrow share the same one-day history. What differs is what's scheduled.</p>` : ""}</div>
  ${dist(s, "In conditions like today", esc(o.regime))}
  ${dist(a, "All conditions, since " + yrs, "Every " + (h.trading_days === 1 ? "trading day" : span.split(" (")[0].replace(/s$/, "")) + " in the data")}
  <div class="cards"><div class="card" style="border-top:4px solid var(--ok)"><h3>Factors pushing higher</h3>${lst(h.bull)}</div><div class="card" style="border-top:4px solid var(--bad)"><h3>Factors pushing lower</h3>${lst(h.bear)}</div></div>
  <div class="card"><h3>${key === "year" ? "Fed meetings ahead" : "On the calendar"}</h3>${evs}<p class="small muted" style="margin:10px 0 0"><a href="#/markets/calendar">See the full calendar</a></p></div>
  <div class="card"><h3>How to read this</h3><ul class="small muted" style="margin:0;padding-left:18px"><li>These are <b>historical frequencies</b>, not probabilities of what will happen next. Markets can behave very differently from their past.</li>
   <li>Returns are S&amp;P 500 price changes (dividends excluded). Periods overlap, so "${s ? s.n.toLocaleString() : "thousands of"} days" is far fewer independent observations than it looks.</li>
   <li>Since ${yrs} includes one of the strongest stretches in market history, so the "rose X%" figures may flatter the future. The worst case in the data is ${a.worst}%.</li>
   <li>Lists of "factors" are live readings from our own data, not a verdict. Most of the time the factors on both sides are present and the market does something unremarkable.</li>
   <li>New to this? <a href="#/learn/3">Lesson 3 (risk)</a> and <a href="#/learn/6">Lesson 6 (bubbles and crashes)</a> explain why time horizon matters more than predictions.</li></ul></div>`;
}

function earningsView(date) {
  const e = state.earnings;
  if (!e || !e.days.length) return `<div class="card muted">No earnings data yet. Check back after the next reporting day.</div>`;
  const day = e.days.find((d) => d.date === date) || e.days[0];
  const pills = e.days.slice(0, 7).map((d) => `<a class="${d.date === day.date ? "on" : ""}" href="#/markets/earnings/${d.date}">${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</a>`).join("");
  const chip = (c) => c.eps == null ? `<span class="pill w">Pending</span>` : c.eps_estimate == null ? `<span class="pill">Reported</span>` : c.eps > c.eps_estimate ? `<span class="pill g">Beat</span>` : c.eps < c.eps_estimate ? `<span class="pill" style="background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)">Missed</span>` : `<span class="pill">Matched</span>`;
  return `<p class="muted">The 10 highest-valued companies that reported earnings each day, with the key facts. "Beat" or "missed" compares earnings per share (profit per share) to what analysts expected. A beat doesn't guarantee the stock rises: what matters most is how results compare to <i>expectations</i> and what the company says about the future.</p>
  <div class="tabs">${pills}</div>
  <p class="small muted">${day.reported_total} companies reported on ${new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Showing the ${day.top.length} largest by market value.</p>
  ${day.top.map((c, i) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><span class="small muted">#${i + 1} by market value</span><h3 style="margin:2px 0"><a href="#/stock/${esc(c.symbol)}">${esc(c.name)}</a> <span class="muted">(${esc(c.symbol)})</span></h3>
   <div class="small muted">Market value ${capStr(c.market_cap_b)}</div></div>${chip(c)}</div>
   <ul style="margin:.5em 0 0;padding-left:20px">${c.bullets.map((x) => `<li class="small">${esc(x)}</li>`).join("")}</ul>
   <p class="small muted" style="margin:10px 0 0">${e.ai_summaries && c.ai_summary ? esc(c.ai_summary) : "AI-written summary of the full report: coming soon."} · <a href="${esc(c.filings)}" target="_blank" rel="noopener noreferrer">SEC filings</a></p></div>`).join("")}
  <p class="small muted">${esc(e.note)} Educational only, not investment advice.</p>`;
}

function calView(filter) {
  const c = state.cal;
  if (!c) return `<div class="card muted">The calendar isn't available right now.</div>`;
  filter = filter || "all";
  const chips = [["all", "All"], ["fed", "Fed"], ["data", "Economic data"], ["treasury", "Treasury"], ["earnings", "Earnings"]].map(([k, l]) => `<a class="${filter === k ? "on" : ""}" href="#/markets/calendar/${k}">${l}</a>`).join("");
  const today = new Date(c.today + "T12:00:00"), day = 864e5;
  const label = (iso) => { const d = new Date(iso + "T12:00:00"), n = Math.round((d - today) / day);
    return (n === 0 ? "Today · " : n === 1 ? "Tomorrow · " : "") + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); };
  const evs = c.events.filter((e) => filter === "all" || e.kind === filter);
  const groups = {}; evs.forEach((e) => (groups[e.date] = groups[e.date] || []).push(e));
  const col = { high: "var(--bad)", medium: "var(--warn)", low: "var(--unk)" }, kind = { fed: "Fed", data: "Data", treasury: "Treasury", earnings: "Earnings" };
  const list = Object.keys(groups).sort().map((d) => `<div class="card"><h3>${label(d)}</h3>${groups[d].map((e) => `<details class="item" style="display:block"><summary style="cursor:pointer;list-style:none;display:flex;gap:10px;align-items:center">
    <span class="dot" style="background:${col[e.importance]};margin:0" title="${e.importance} importance"></span><span style="flex:1"><b>${esc(e.title)}</b><br><span class="small muted">${esc(e.time)}${/^\d/.test(e.time) ? " ET" : ""}</span></span><span class="pill">${kind[e.kind]}</span></summary>
    <p class="small muted" style="margin:8px 0 0 22px">${esc(e.why)}</p><p style="margin:6px 0 0 22px">${heartBtn("event", e.id, { label: e.title, date: e.date, time: e.time })}</p>${recapFor(e.id) ? `<p class="small" style="margin:4px 0 0 22px"><a href="#/recap/${encodeURIComponent(e.id)}"><b>Read the recap →</b></a></p>` : ""}${e.link && e.source ? `<p class="small" style="margin:4px 0 0 22px"><a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(e.source)} →</a></p>` : ""}${(() => { const m = /\(([A-Z.\-]+)\) reports/.exec(e.title); return m ? `<p class="small" style="margin:4px 0 0 22px"><a href="#/stock/${esc(m[1])}">View ${esc(m[1])} chart →</a> · <a href="#/markets/earnings">Earnings results</a></p>` : e.kind === "fed" ? `<p class="small" style="margin:4px 0 0 22px"><a href="#/market/%5ETNX">10-year yield chart →</a> · <a href="#/learn/3">Why rates matter</a></p>` : ""; })()}</details>`).join("")}</div>`).join("");
  return `<p class="muted">What's scheduled that could move markets. Tap an event to see why it matters. Times are US Eastern. <span class="dot" style="display:inline-block;background:var(--bad)"></span> high <span class="dot" style="display:inline-block;background:var(--warn)"></span> medium <span class="dot" style="display:inline-block;background:var(--unk)"></span> low importance</p>
  ${filter === "all" ? recentRecapsCard() : ""}<div class="tabs">${chips}</div>${list || `<div class="card muted">Nothing scheduled in this category.</div>`}
  <details class="card"><summary style="cursor:pointer"><b>Key releases explained</b> <span class="small muted">(what each one is and why traders care)</span></summary>
   ${c.key_releases.map((k) => `<div class="item" style="display:block"><b>${esc(k.name)}</b><div class="small">${esc(k.what)}</div><div class="small muted"><b>Why it matters:</b> ${esc(k.why)}</div></div>`).join("")}</details>
  <div class="card"><p class="small muted" style="margin:0">${c.notes.map(esc).join(" ")} <a href="https://www.bls.gov/schedule/news_release/" target="_blank" rel="noopener noreferrer">BLS release schedule</a>${c.failed.length ? " · Some sources failed to load today: " + esc(c.failed.join(", ")) : ""}</p></div>`;
}

function briefView() {
  const d = state.brief;
  if (!d) return `<div class="card muted">Today's brief isn't available yet.</div>`;
  const link = (h) => /^https?:\/\//.test(h.link) ? `<a href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : esc(h.title);
  return `<div class="card big"><span class="pill g">Market close ${esc(d.date)}</span><h2 style="margin-top:8px">${esc(d.headline)}</h2>
   ${d.summary ? `<p>${esc(d.summary)}</p><p class="small muted">Summary written by AI from the data below. It can contain mistakes.</p>` : ""}</div>
   ${d.sections.map((s) => `<div class="card"><h3>${esc(s.title)}</h3><ul style="margin:.3em 0 0;padding-left:20px">${s.bullets.map((x) => `<li>${linkNames(x)}</li>`).join("")}</ul></div>`).join("")}
   <div class="card"><h3>Headlines</h3><p class="small muted">Titles and links only. Click through to read the full story at the source.</p>
   ${d.headlines.map((h) => `<div class="item"><div><div>${link(h)}</div><div class="small muted">${esc(h.source)}</div></div></div>`).join("")}</div>
   <p class="small muted">${esc(d.disclaimer)} New here? Start with the <a href="#/learn">crash course</a>.</p>`;
}

function markets(tab, sub) {
  tab = tab || "overview"; const m = state.mk; let b = "";
  if (tab === "overview") {
    const sec = m && m.sectors ? [...m.sectors].sort((a, b) => b.d1 - a.d1) : [];
    b = `<h2>Major indices</h2>${tiles(m && m.indices)}
    <h2>Sectors today</h2><p class="muted small">Which parts of the economy are leading or lagging. Green is up, red is down.</p>
    <div class="hz">${sec.map((r) => `<a class="card" href="#/explore/${SECTOR_ETF_KEY[r.symbol] || ""}" style="background:${heat(r.d1)};color:inherit;display:block"><div class="small">${r.name}</div><div style="font-weight:800;font-size:20px">${chg(r.d1, r.kind)}</div><div class="small muted">${chg(r.ytd, r.kind)} YTD</div><div class="small" style="margin-top:4px;color:var(--brand)">See sector →</div></a>`).join("")}</div>
    <h2>Rates, currencies &amp; commodities</h2><div class="card">${rowList(m && m.macro)}</div>
    <h2>Around the world</h2><div class="card">${rowList(m && m.global)}</div>
    <p class="small muted">Prices from Yahoo Finance, updated each trading day after the close${m ? " (snapshot " + m.indices[0].date + ")" : ""}. Sector figures use the SPDR sector ETFs.</p>
    <a class="card" href="#/watch" style="color:inherit;display:block"><span class="pill w">Featured</span><h3>AI &amp; Tech Watch</h3><p class="muted small" style="margin:0">Is there an AI bubble? Ten warning signs, tracked daily.</p></a>`;
  } else if (tab === "brief") {
    b = briefView();
  } else if (tab === "earnings") {
    b = earningsView(sub);
  } else if (tab === "calendar") {
    b = calView(sub);
  } else {
    b = outlookView(sub);
  }
  return `<h1>Markets</h1>${mTabs(tab)}${b}`;
}

function watch() {
  const s = state.snap;
  return `<span class="pill w">Featured section</span><h1>AI &amp; Tech Watch</h1>
  <p class="muted">Are AI and tech stocks in a bubble, and are the warning signs of a crash flashing? Ten signs, checked every trading day.</p>` + (!s ? `<div class="card">Data unavailable.</div>` : `${snapCard(false)}
    <div class="card"><h3><a href="#/stock/QQQ" style="color:inherit">QQQ (Nasdaq-100)</a>, 1 year</h3>${spark(s.qqq_series.map((x) => x[1]))}</div>
    <div class="card"><h3>The checklist</h3>${s.checks.map((c) => `<div class="item"><div class="dot" style="background:${COL[c.status]}"></div><div>
     <b>${c.id}. ${c.name}</b> <span class="pill">${c.group}</span>${c.proxy ? '<span class="pill w">proxy</span>' : ""}${c.weight === 0 ? '<span class="pill">context only</span>' : ""}
     <div class="small muted">${linkTickers(c.detail)}</div>${c.threshold ? `<div class="small muted">Warns at: ${c.threshold}</div>` : ""}</div></div>`).join("")}</div>
    <p class="small muted">${s.evaluated} of ${s.total} checks are live. Thresholds were tested on 1999–2026 history: the combined score raised crash odds only about 1.7–2x. See <a href="#/about">how it works</a>.</p>`);
}

function spark(v) {
  const lo = Math.min(...v), hi = Math.max(...v);
  return `<svg class="spark" viewBox="0 0 600 110" preserveAspectRatio="none"><polyline fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${v.map((y, i) => `${i / (v.length - 1) * 600},${105 - (y - lo) / (hi - lo) * 100}`).join(" ")}"/></svg>`;
}

function about() {
  return `<div class="lesson"><h1>How it works</h1><p class="muted">${BRAND} is an educational project. It is not a broker, adviser, or source of trading signals.</p>
  <h2>Markets</h2><p>The Markets section tracks major indices, the 11 stock sectors, rates, the dollar, oil, gold and bitcoin from Yahoo Finance, updated each trading day.</p><h2>The Outlook</h2><p>For each time horizon (today to next year) we show what the S&amp;P 500 has actually done in the past since 1985, and what it did in conditions like today's (same trend and fear level). We do not forecast prices. The lists of factors pushing up or down are live readings from our data, and the calendar shows what's scheduled.</p><h2>AI &amp; Tech Watch</h2><p>Ten warning signs for AI and tech stocks: valuation, concentration, the AI spending gap, earnings, rates, credit, fear, trend, insider selling, and chip-stock weakness. Each turns "warning" or "clear", and a weighted score summarises them.</p>
  <div class="callout"><b>We tested it.</b> Replaying 1999–2026, the combined score made a 15%+ drop in the next 60 days about 1.7–2x as likely as normal. That is a modest tilt, not a prediction. Two of our original ideas (low VIX and stretched prices as warnings) did not work, so we dropped or down-weighted them.</div>
  <h2>Data sources</h2><p>Market prices (Yahoo Finance), company filings and insider trades (SEC EDGAR). Updated each trading day.</p>
  <h2>Who it's for</h2><p>Ages 16 and up. We collect no personal information and show no ads.</p><h2>Important</h2><p>${DISC}</p></div>`;
}

const afterRender = [];
let routeToken = 0;
async function route() {
  const token = ++routeToken, keepScroll = state.keepScroll; state.keepScroll = false;
  const h = (location.hash || "#/").slice(2).split("/"), a = h[0] || "home";
  const views = { home: () => home(), learn: () => (h[1] ? lesson(h[1]) : learn()), markets: () => markets(h[1], h[2]), practice: () => practice(h[1] || "", h[2]),
    explore: () => (h[1] === "heatmap" ? heatmapPage() : h[1] === "screener" ? screenerPage() : h[1] === "compare" ? comparePage(h[2]) : h[1] ? sectorPage(h[1]) : exploreHome()), stock: () => stockPage(h[1] || ""), watch: () => watch(), about: () => about(), market: () => marketPage(h[1]), watchlist: () => watchlistPage(), recap: () => recapPage(h[1]), terms: () => termsPage(), privacy: () => privacyPage(), login: () => loginView() };
  afterRender.length = 0;
  if (typeof AUTH !== "undefined" && !AUTH.ready) { $("#view").innerHTML = `<div class="card muted">Loading…</div>`; return; }
  const pending = (typeof gateView === "function" && gateView(a)) || (views[a] || views.home)();
  if (pending && pending.then) $("#view").innerHTML = `<div class="card muted">Loading…</div>`;
  const html = await pending;
  if (token !== routeToken) return; // a newer navigation won
  $("#view").innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("on", n.dataset.nav === (a === "home" ? "" : a === "stock" ? "explore" : a)));
  if (a === "learn" && h[1]) { wireQuiz(h[1]); wireWidgets(); }
  if (a === "practice") wirePractice(h[1] || "", h[2]);
  afterRender.forEach((fn) => fn());
  wireSearch();
  wireHearts();
  const wlc = document.querySelector("#wl b"); if (wlc) wlc.textContent = FOLLOWS.length || "";
  if (!keepScroll) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
Promise.all([loadSnap(), authInit()]).then(() => { $("#brand").textContent = BRAND; $("#disc").textContent = DISC; document.title = BRAND; route(); });

// Stale-page guard: GitHub Pages lets browsers cache index.html for ~10 minutes. If a newer build exists, offer a refresh.
(function checkVersion() {
  if (!window.BUILD || window.BUILD.indexOf("__") === 0) return;
  fetch("version.json?" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (j.v && j.v !== window.BUILD) {
      const b = document.createElement("div");
      b.style.cssText = "position:fixed;left:12px;right:12px;bottom:76px;z-index:50;background:var(--tx);color:var(--bg);padding:12px 16px;border-radius:12px;display:flex;gap:12px;align-items:center;justify-content:space-between;box-shadow:var(--shadow)";
      b.innerHTML = '<span>A new version of The Analytic is available.</span><button class="btn" style="padding:8px 14px">Refresh</button>';
      b.querySelector("button").onclick = () => { location.href = location.pathname + "?v=" + j.v + location.hash; };
      document.body.appendChild(b);
    }
  }).catch(() => {});
})();
