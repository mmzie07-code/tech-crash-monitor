const $ = (s) => document.querySelector(s);
const state = { snap: null, done: {} };
try { state.done = JSON.parse(localStorage.getItem("ml_done") || "{}"); } catch (e) {}
const saveDone = () => { try { localStorage.setItem("ml_done", JSON.stringify(state.done)); } catch (e) {} };
const DISC = "Educational content only. Not investment advice. Investing involves risk, including loss of money, and short-term forecasts, including ours, are frequently wrong.";
const COL = { warn: "var(--warn)", ok: "var(--ok)", unknown: "var(--unk)" };

async function loadSnap() {
  for (const u of ["data/latest.json", "../data/latest.json"]) {
    try { const r = await fetch(u + "?" + Date.now()); if (r.ok) { state.snap = await r.json(); return; } } catch (e) {}
  }
}
const lvlColor = (l) => ({ Low: "var(--ok)", Elevated: "var(--warn)", High: "var(--bad)", Severe: "var(--bad)" })[l] || "var(--mut)";
const doneCount = () => MODULES.filter((m) => state.done[m.id]).length;

function snapCard(link) {
  const s = state.snap;
  if (!s) return `<div class="card"><div class="muted">Live monitor unavailable right now.</div></div>`;
  return `<div class="card big"><div class="strip"><div><div class="num" style="color:${lvlColor(s.level)}">${s.score}</div><div class="small muted">crash-risk score, ${s.date}</div></div>
  <div style="flex:1;min-width:200px"><h3>${s.level} risk in AI &amp; tech stocks</h3><p class="muted small" style="margin:0">${s.warnings} of ${s.evaluated} warning signs flashing. Stretch ${s.stretch ?? "-"} · Trigger ${s.trigger ?? "-"}</p></div>
  ${link ? `<a class="btn ghost" href="#/pro/monitor">Open monitor</a>` : ""}</div></div>`;
}

function home() {
  return `<section class="hero"><span class="pill">For ages 16+</span><h1>Learn the market.<br><span class="grad">Then watch it like a pro.</span></h1>
  <p class="lead">Plain-English lessons for people starting out, and a daily briefing for people who already are. Real data, honest limits, no hype.</p>
  <a class="btn" href="#/learn">Start the crash course</a><a class="btn ghost" href="#/pro">See the daily briefing</a></section>
  <div class="cards">
   <a class="card" href="#/learn" style="color:inherit"><span class="pill">Learn</span><h3>A crash course in 8 short lessons</h3><p class="muted">From "what is a stock?" to spotting bubbles. Quizzes, a glossary, and practice trading with fake money.</p><div class="bar"><i style="width:${doneCount() / MODULES.length * 100}%"></i></div><p class="small muted" style="margin:6px 0 0">${doneCount()} of ${MODULES.length} complete</p></a>
   <a class="card" href="#/pro" style="color:inherit"><span class="pill g">Pro</span><h3>Daily market briefing</h3><p class="muted">A crash-risk monitor for AI and tech stocks, updated every trading day, plus outlooks from today to next year.</p></a></div>
  <h2>Live right now</h2>${snapCard(true)}
  <h2 style="margin-top:1.4em">Why trust this?</h2>
  <div class="cards"><div class="card"><h3>We show our homework</h3><p class="muted small">Every warning sign links to the data behind it, and we backtested them. Some of our own ideas failed, and we say so.</p></div>
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

function lesson(id) {
  const m = MODULES.find((x) => x.id === +id);
  if (!m || !m.live) return `<p>That lesson isn't ready yet. <a href="#/learn">Back to the course</a></p>`;
  const body = m.body.map(([t, x]) => t === "h" ? `<h2>${x}</h2>` : t === "c" ? `<div class="callout">${x}</div>` : `<p>${x}</p>`).join("");
  const quiz = m.quiz.map((q, i) => `<div class="q" data-i="${i}"><b>${i + 1}. ${q.q}</b>${q.o.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join("")}<div class="small muted fb"></div></div>`).join("");
  return `<div class="lesson"><a href="#/learn" class="small">← Course</a><h1 style="font-size:clamp(28px,5vw,40px)">${m.id}. ${m.title}</h1>
  <p class="muted">${m.mins} min · You'll learn to: ${m.goals.join("; ")}.</p>${body}<h2>Check yourself</h2>${quiz}
  <div id="res" class="card" style="display:none"></div>
  <div class="ph" style="margin-top:22px">Live example: <a href="#/pro/monitor">see how the crash-risk monitor uses these ideas today</a></div></div>`;
}

function wireQuiz(id) {
  const m = MODULES.find((x) => x.id === +id); if (!m || !m.quiz) return;
  const got = {};
  document.querySelectorAll(".q").forEach((box) => {
    const i = +box.dataset.i;
    box.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (got[i] !== undefined) return;
      const j = +b.dataset.j, ok = j === m.quiz[i].a; got[i] = ok;
      b.classList.add(ok ? "right" : "wrong");
      if (!ok) box.querySelectorAll(".opt")[m.quiz[i].a].classList.add("right");
      box.querySelector(".fb").textContent = (ok ? "Correct. " : "Not quite. ") + m.quiz[i].why;
      if (Object.keys(got).length === m.quiz.length) {
        const n = Object.values(got).filter(Boolean).length, pass = n >= 2, r = $("#res");
        if (pass) { state.done[m.id] = true; saveDone(); }
        r.style.display = "block";
        r.innerHTML = `<h3>${n} of ${m.quiz.length} correct ${pass ? "· Lesson complete 🎉" : "· Try reading it again"}</h3><a class="btn" href="#/learn">${pass ? "Back to the course" : "Review"}</a>`;
      }
    });
  });
}

function proTabs(cur) {
  return `<div class="tabs">${[["brief", "Daily brief"], ["outlook", "Outlook"], ["monitor", "Crash monitor"]].map(([k, l]) => `<a class="${cur === k ? "on" : ""}" href="#/pro/${k}">${l}</a>`).join("")}</div>`;
}

function pro(tab) {
  tab = tab || "brief";
  let b = "";
  if (tab === "brief") {
    b = `${snapCard(true)}<div class="card"><span class="pill w">Coming next</span><h3>Today's briefing</h3>
    <div class="ph">Each trading day, an AI-written summary of the biggest news, what moved, and why it may matter, with sources linked. Not built yet.</div></div>
    <div class="card"><h3>What's on the calendar</h3><div class="ph">Fed meetings, CPI, jobs data, and major earnings for the week ahead. Not built yet.</div></div>`;
  } else if (tab === "outlook") {
    b = `<p class="muted">How current events could affect the market, by time horizon. These will be <b>scenarios with stated assumptions</b>, not predictions, and each will say what would prove it wrong.</p>
    <div class="hz">${HORIZONS.map(([h, d]) => `<div class="card"><h3>${h}</h3><p class="muted small">${d}</p><div class="ph">Not built yet</div></div>`).join("")}</div>`;
  } else {
    const s = state.snap;
    b = !s ? `<div class="card">Data unavailable.</div>` : `${snapCard(false)}
    <div class="card"><h3>QQQ, 1 year</h3>${spark(s.qqq_series.map((x) => x[1]))}</div>
    <div class="card"><h3>The checklist</h3>${s.checks.map((c) => `<div class="item"><div class="dot" style="background:${COL[c.status]}"></div><div>
     <b>${c.id}. ${c.name}</b> <span class="pill">${c.group}</span>${c.proxy ? '<span class="pill w">proxy</span>' : ""}${c.weight === 0 ? '<span class="pill">context only</span>' : ""}
     <div class="small muted">${c.detail}</div>${c.threshold ? `<div class="small muted">Warns at: ${c.threshold}</div>` : ""}</div></div>`).join("")}</div>
    <p class="small muted">${s.evaluated} of ${s.total} checks are live. Thresholds were tested on 1999–2026 history: the combined score raised crash odds only about 1.7–2x. See <a href="#/about">how it works</a>.</p>`;
  }
  return `<h1>Pro</h1>${proTabs(tab)}${b}`;
}

function spark(v) {
  const lo = Math.min(...v), hi = Math.max(...v);
  return `<svg class="spark" viewBox="0 0 600 110" preserveAspectRatio="none"><polyline fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${v.map((y, i) => `${i / (v.length - 1) * 600},${105 - (y - lo) / (hi - lo) * 100}`).join(" ")}"/></svg>`;
}

function about() {
  return `<div class="lesson"><h1>How it works</h1><p class="muted">${BRAND} is an educational project. It is not a broker, adviser, or source of trading signals.</p>
  <h2>The crash monitor</h2><p>Ten warning signs for AI and tech stocks: valuation, concentration, the AI spending gap, earnings, rates, credit, fear, trend, insider selling, and chip-stock weakness. Each turns "warning" or "clear", and a weighted score summarises them.</p>
  <div class="callout"><b>We tested it.</b> Replaying 1999–2026, the combined score made a 15%+ drop in the next 60 days about 1.7–2x as likely as normal. That is a modest tilt, not a prediction. Two of our original ideas (low VIX and stretched prices as warnings) did not work, so we dropped or down-weighted them.</div>
  <h2>Data sources</h2><p>Market prices (Yahoo Finance), company filings and insider trades (SEC EDGAR). Updated each trading day.</p>
  <h2>Who it's for</h2><p>Ages 16 and up. We collect no personal information and show no ads.</p><h2>Important</h2><p>${DISC}</p></div>`;
}

function route() {
  const h = (location.hash || "#/").slice(2).split("/"), a = h[0] || "home";
  const views = { home: () => home(), learn: () => (h[1] ? lesson(h[1]) : learn()), pro: () => pro(h[1]), about: () => about() };
  $("#view").innerHTML = (views[a] || views.home)();
  document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("on", n.dataset.nav === (a === "home" ? "" : a)));
  if (a === "learn" && h[1]) wireQuiz(h[1]);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
loadSnap().then(() => { $("#brand").textContent = BRAND; $("#disc").textContent = DISC; document.title = BRAND; route(); });
