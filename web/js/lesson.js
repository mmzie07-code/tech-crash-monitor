// Lesson renderer: turns the block lists in js/lessons/*.js into pages, and wires quizzes + interactive tools.
const getModule = (id) => Object.assign({}, MODULES.find((x) => x.id === +id), LESSONS[+id]);
const money = (n) => "$" + Math.round(n).toLocaleString();

function block(b) {
  const [t, x, y] = b;
  switch (t) {
    case "h": return `<h2>${x}</h2>`;
    case "p": return `<p>${x}</p>`;
    case "c": return `<div class="callout">${x}</div>`;
    case "story": return `<div class="story"><span class="pill">${x}</span>${y}</div>`;
    case "list": return `<ul>${x.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    case "steps": return `<ol>${x.map((i) => `<li>${i}</li>`).join("")}</ol>`;
    case "table": return `<div class="tw"><table><tr>${x.map((h) => `<th>${h}</th>`).join("")}</tr>${y.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
    case "try": return `<div class="try"><b>✋ Try it</b>${x}</div>`;
    case "mistake": return `<div class="mistakes"><b>⚠️ Common mistakes</b><ul>${x.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
    case "take": return `<div class="take"><b>Key takeaways</b><ul>${x.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
    case "calc": return `<div class="wid" data-w="growth"></div>`;
    case "chart": return `<div class="wid" data-w="ma"></div>`;
    case "plan": return `<div class="wid" data-w="plan"></div>`;
    case "snap": return snapCard(true);
    default: return "";
  }
}

function lesson(id) {
  const m = getModule(id);
  if (!m || !m.body) return `<p>That lesson isn't ready yet. <a href="#/learn">Back to the course</a></p>`;
  const quiz = m.quiz.map((q, i) => `<div class="q" data-i="${i}"><b>${i + 1}. ${q.q}</b>${q.o.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join("")}<div class="small muted fb"></div></div>`).join("");
  const next = MODULES.find((x) => x.id === m.id + 1);
  return `<div class="lesson"><a href="#/learn" class="small">← Course</a><h1 style="font-size:clamp(28px,5vw,40px)">${m.id}. ${m.title}</h1>
  <p class="muted">${m.mins} min read · By the end you'll be able to:</p><ul class="goals">${m.goals.map((g) => `<li>${g}</li>`).join("")}</ul>
  ${m.body.map(block).join("")}
  <h2>Check yourself</h2><p class="muted small">Get ${Math.ceil(m.quiz.length * 0.6)} of ${m.quiz.length} to complete the lesson. Every answer is explained.</p>${quiz}
  <div id="res" class="card" style="display:none"></div>
  <p class="small muted" style="margin-top:26px">Figures are historical and approximate. Rules for accounts and taxes vary by country and change over time. Check Investor.gov or ask a parent or professional before acting. This is education, not advice.</p>
  ${next ? `<a class="btn ghost" href="#/learn/${next.id}">Next: ${next.title} →</a>` : ""}</div>`;
}

function wireQuiz(id) {
  const m = getModule(id); if (!m || !m.quiz) return;
  const got = {};
  document.querySelectorAll(".q").forEach((box) => {
    const i = +box.dataset.i;
    box.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (got[i] !== undefined) return;
      const ok = +b.dataset.j === m.quiz[i].a; got[i] = ok;
      b.classList.add(ok ? "right" : "wrong");
      if (!ok) box.querySelectorAll(".opt")[m.quiz[i].a].classList.add("right");
      box.querySelector(".fb").textContent = (ok ? "Correct. " : "Not quite. ") + m.quiz[i].why;
      if (Object.keys(got).length === m.quiz.length) {
        const n = Object.values(got).filter(Boolean).length, pass = n >= Math.ceil(m.quiz.length * 0.6), r = $("#res");
        if (pass) { state.done[m.id] = true; saveDone(); }
        r.style.display = "block";
        r.innerHTML = `<h3>${n} of ${m.quiz.length} correct ${pass ? "· Lesson complete 🎉" : "· Give the lesson another read"}</h3><a class="btn" href="#/learn">${pass ? "Back to the course" : "Review"}</a>`;
      }
    });
  });
}

// ---------- interactive tools ----------
function fv(monthly, years, annual) {
  const r = annual / 100 / 12, n = years * 12;
  return r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r);
}
function svgLines(series, colors, h) {
  const all = series.flat().filter((v) => v != null), lo = Math.min(...all), hi = Math.max(...all), n = series[0].length;
  return `<svg class="spark" style="height:${h}px" viewBox="0 0 600 ${h}" preserveAspectRatio="none">${series.map((s, k) =>
    `<polyline fill="none" stroke="${colors[k]}" stroke-width="2" vector-effect="non-scaling-stroke" points="${s.map((y, i) => y == null ? "" : `${i / (n - 1) * 600},${h - 5 - (y - lo) / (hi - lo) * (h - 10)}`).filter(Boolean).join(" ")}"/>`).join("")}</svg>`;
}

function wireWidgets() {
  document.querySelectorAll(".wid").forEach((el) => {
    if (el.dataset.w === "growth") growthWidget(el);
    if (el.dataset.w === "ma") maWidget(el);
    if (el.dataset.w === "plan") planWidget(el);
  });
}

function growthWidget(el) {
  el.innerHTML = `<h3>💰 The compounding &amp; fees calculator</h3><p class="small muted">Move the sliders. Assumed returns are not a forecast; they are an illustration. Real returns vary a lot year to year.</p>
  <div class="ctl"><label>Invest per month: $<b id="gm">200</b><input type="range" id="m" min="25" max="1000" step="25" value="200"></label>
  <label>Years: <b id="gy">40</b><input type="range" id="y" min="1" max="50" value="40"></label>
  <label>Yearly return before fees: <b id="gr">7</b>%<input type="range" id="r" min="0" max="12" step="0.5" value="7"></label>
  <label>Fund fee (expense ratio): <b id="gf">1.0</b>%<input type="range" id="f" min="0" max="2" step="0.05" value="1"></label></div><div id="out"></div>`;
  const g = (i) => +el.querySelector("#" + i).value;
  const upd = () => {
    const m = g("m"), y = g("y"), r = g("r"), f = g("f");
    el.querySelector("#gm").textContent = m; el.querySelector("#gy").textContent = y; el.querySelector("#gr").textContent = r; el.querySelector("#gf").textContent = f.toFixed(2);
    const put = m * 12 * y, withFee = fv(m, y, r - f), cheap = fv(m, y, r - 0.05);
    el.querySelector("#out").innerHTML = `<div class="hz"><div class="card"><div class="small muted">You put in</div><div class="big2">${money(put)}</div></div>
    <div class="card"><div class="small muted">With your fee (${f.toFixed(2)}%)</div><div class="big2">${money(withFee)}</div></div>
    <div class="card"><div class="small muted">With a cheap index fund (0.05%)</div><div class="big2">${money(cheap)}</div></div></div>
    <p class="small">${cheap - withFee > 1 ? `The fee difference costs you about <b>${money(cheap - withFee)}</b> (${Math.round((cheap - withFee) / cheap * 100)}% of your final balance).` : "No fee gap at this setting."} Of your ${money(cheap)}, about <b>${money(cheap - put)}</b> is growth you didn't have to deposit.</p>`;
  };
  el.querySelectorAll("input").forEach((i) => i.oninput = upd); upd();
}

function maWidget(el) {
  const s = state.snap;
  if (!s) { el.innerHTML = `<div class="card muted">Live chart unavailable right now.</div>`; return; }
  const v = s.qqq_series.map((x) => x[1]);
  const sma = (n) => v.map((_, i) => (i + 1 >= n ? v.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n : null));
  const m50 = sma(50), m200 = sma(200), last = v[v.length - 1];
  el.innerHTML = `<h3>📈 Live example: QQQ with moving averages</h3>${svgLines([v, m50, m200], ["var(--tx)", "var(--brand)", "var(--warn)"], 150)}
  <p class="small"><span style="color:var(--tx)">━</span> price &nbsp;<span style="color:var(--brand)">━</span> 50-day average &nbsp;<span style="color:var(--warn)">━</span> 200-day average</p>
  <p class="small muted">Today QQQ is ${last > m50[m50.length - 1] ? "above" : "below"} its 50-day average (${m50[m50.length - 1].toFixed(0)}) and ${m200[m200.length - 1] == null ? "" : last > m200[m200.length - 1] ? "above" : "below"} its 200-day average${m200[m200.length - 1] == null ? " isn't shown (needs more history)" : " (" + m200[m200.length - 1].toFixed(0) + ")"}. Price is ${last.toFixed(0)}. Updates daily.</p>`;
}

function planWidget(el) {
  let p = { goal: "College or first car", years: 5, monthly: 100, drop: 30, ...(() => { try { return JSON.parse(localStorage.getItem("ml_plan") || "{}"); } catch (e) { return {}; } })() };
  el.innerHTML = `<h3>🧭 Build your one-page plan</h3><p class="small muted">Answer four questions. Your answers save on this device only.</p>
  <div class="ctl"><label>What are you investing for?<select id="goal">${["College or first car", "First home", "Retirement (far away)", "Building wealth over time", "Not sure yet"].map((o) => `<option ${o === p.goal ? "selected" : ""}>${o}</option>`).join("")}</select></label>
  <label>Years until you need the money: <b id="py">${p.years}</b><input type="range" id="years" min="1" max="50" value="${p.years}"></label>
  <label>Monthly amount: $<b id="pm">${p.monthly}</b><input type="range" id="monthly" min="10" max="1000" step="10" value="${p.monthly}"></label>
  <label>Biggest one-year loss you could stomach without panic-selling: <b id="pd">${p.drop}</b>%<input type="range" id="drop" min="5" max="60" step="5" value="${p.drop}"></label></div><div id="pout"></div>`;
  const upd = () => {
    p = { goal: el.querySelector("#goal").value, years: +el.querySelector("#years").value, monthly: +el.querySelector("#monthly").value, drop: +el.querySelector("#drop").value };
    try { localStorage.setItem("ml_plan", JSON.stringify(p)); } catch (e) {}
    el.querySelector("#py").textContent = p.years; el.querySelector("#pm").textContent = p.monthly; el.querySelector("#pd").textContent = p.drop;
    // Stocks have historically fallen ~50% in the worst crashes. Cap stock share so a 50% stock crash stays within the tolerated loss.
    const cap = Math.min(100, Math.round(p.drop / 50 * 100)), short = p.years < 5;
    const total = p.monthly * 12 * p.years, mid = fv(p.monthly, p.years, 6);
    el.querySelector("#pout").innerHTML = `<div class="card"><h3>Your plan</h3><ul>
    <li><b>Goal:</b> ${p.goal}, in ${p.years} year${p.years > 1 ? "s" : ""}.</li>
    <li><b>Contribution:</b> ${money(p.monthly)} a month = ${money(total)} put in. At an illustrative 6% a year that could grow to about <b>${money(mid)}</b> (not guaranteed).</li>
    <li><b>Risk check:</b> ${short ? "With less than 5 years to go, money you'll need is usually kept in savings or very low-risk assets, because stocks can fall 30–50% and take years to recover. " : ""}In past crashes stocks have fallen up to about 50%. To keep a crash within your ${p.drop}% limit, a rough ceiling is <b>${short ? "a small share" : cap + "% in stocks"}</b> with the rest in bonds or cash.</li>
    <li><b>Rule for a bad year:</b> If markets fall 30%, I will not sell in panic. I'll check this plan first.</li></ul>
    <p class="small muted">This is a learning exercise built on a simple rule of thumb, not personal advice. Talk it through with a parent or trusted adult.</p></div>`;
  };
  el.querySelectorAll("input,select").forEach((i) => i.oninput = upd); upd();
}
