// Ask the site (Plus). A small chat that answers from what the site already shows. It sends the model the current page's facts (never anyone's holdings or practice trades),
// and the server-side rules stop it giving personal advice or predicting prices. Needs the edge function's ANTHROPIC_API_KEY; shown when config.ask is true (or to the owner).
const ASK = { open: false, hist: [], busy: false, left: null };
const ASK_SITE = "The Analytic pages: Home (a globe of the world: economic health, conflict, goods, food, spending, oil, rare earths, critical minerals, debt and prices, chips, cables and internet, money flows, trade routes); Explore (11 sectors, top 50 companies each, stock pages with charts, a five-score scorecard, a full analysis page); Markets (overview, daily brief, economy dashboard, oil, earnings, calendar, crypto, currencies, housing, IPOs, outlook); AI Watch (a 62-indicator crash-risk monitor; the score describes conditions and is not a timing tool); Learn (8 short lessons); Practice (a pretend-money portfolio, a demo portfolio, the AI practice fund managers). Forecast ranges show the likely SIZE of a move over a period (about 68% of the time inside the range), never its direction.";

async function askContext() {
  const parts = [ASK_SITE], h = (location.hash || "#/").slice(2).split("/"), a = h[0] || "home", n = (v, d = 1) => (v == null || isNaN(v) ? "n/a" : (+v).toFixed(d));
  parts.push("Current page: " + (location.hash || "#/"));
  try {
    const w = state.aiw; if (w && w.health != null) parts.push(`AI & Tech Watch: health score ${w.health}/100, zone "${w.zone}", ${w.coverage ? w.coverage.n + " of " + w.coverage.total + " indicators live" : ""}. Lowest-scoring (hottest) indicators: ${(w.indicators || []).slice().sort((x, y) => (y.heat || 0) - (x.heat || 0)).slice(0, 5).map((i) => i.name + " " + (i.display || "")).join("; ")}.`);
    const qs = state.quotes && state.quotes.quotes; if (qs && qs.length) parts.push("Market quotes (" + (state.quotes.date || "latest") + "): " + qs.slice(0, 14).map((r) => `${r.symbol} ${n(r.price, 2)} (${n(r.d1)}% today)`).join("; "));
    if ((a === "stock" || a === "analysis" || a === "report") && h[1]) {
      const sym = decodeURIComponent(h[1]).toUpperCase(), row = state.search && state.search.stocks.find((r) => r[0] === sym);
      if (row) parts.push(`${sym} (${row[1]}): sector ${typeof SECTOR_NAME === "function" ? SECTOR_NAME(row[2]) : row[2]}, market cap $${n(row[3])}B, price $${row[4]}, ${n(row[5])}% in the latest session.`);
      const f = typeof fcGet === "function" ? fcGet(sym) : null; if (f && f.r && f.r.h21) parts.push(`${sym} forecast range, next ~month (size of move only): ${n(f.r.h21[1])}% to +${n(f.r.h21[2])}%.`);
      const sc = typeof loadScore === "function" ? await loadScore(sym) : null; if (sc && sc.summary) parts.push(`${sym} scorecard: ${sc.summary} Axes: ${JSON.stringify(sc.axes || {})}. Rewards: ${(sc.rewards || []).slice(0, 4).join("; ")}. Risks: ${(sc.risks || []).slice(0, 4).map((r) => r.t).join("; ")}.`);
    }
    if (a === "markets" && state.brief && state.brief.headline) parts.push("Daily brief headline: " + state.brief.headline);
  } catch (e) {}
  return parts.join("\n").slice(0, 9000);
}

const askFmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\((#\/[^)\s]*)\)/g, '<a href="$2">$1</a>').replace(/^- (.+)$/gm, "• $1").replace(/\n/g, "<br>");
function askRender() {
  const box = document.querySelector("#askpanel"); if (!box) return;
  const log = box.querySelector(".ask-log");
  log.innerHTML = (ASK.hist.length ? "" : `<div class="ask-m a">Hi! Ask me about what's on your screen, how a number is worked out, or a market idea you've seen here. I explain; I don't give personal advice or predict prices.</div><div class="ask-ex">${["What does this page show?", "How is the AI Watch score worked out?", "What is a forecast range?"].map((x) => `<button data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div>`)
    + ASK.hist.map((m) => `<div class="ask-m ${m.role === "user" ? "u" : "a"}">${m.role === "user" ? esc(m.content) : askFmt(m.content)}</div>`).join("") + (ASK.busy ? `<div class="ask-m a muted">Thinking…</div>` : "");
  log.scrollTop = log.scrollHeight;
  box.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => askSend(b.dataset.ex));
  box.querySelector(".ask-left").textContent = ASK.left != null ? ASK.left + " questions left today" : "";
}
async function askSend(q) {
  q = (q || "").trim(); if (!q || ASK.busy) return;
  await planLoad(); if (!planPaid()) { ASK.hist.push({ role: "user", content: q }, { role: "assistant", content: "The assistant is part of Plus. [See plans](#/pricing)" }); askRender(); return; }
  const hist = ASK.hist.slice(-6); ASK.hist.push({ role: "user", content: q }); ASK.busy = true; askRender();
  let ans = "Something went wrong. Please try again.";
  try {
    const r = await fetch(fnUrl() + "?action=ask", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, await apiHeaders()), body: JSON.stringify({ q, ctx: await askContext(), hist }) }), j = await r.json().catch(() => ({}));
    if (r.ok) { ans = j.a; ASK.left = j.left; }
    else if (j.error === "not_configured") ans = "The assistant isn't switched on yet.";
    else if (r.status === 429 && j.error === "limit") ans = "You've used today's " + j.cap + " questions. They reset at midnight UTC.";
    else if (r.status === 402) ans = "The assistant is part of Plus. [See plans](#/pricing)";
  } catch (e) {}
  ASK.hist.push({ role: "assistant", content: ans }); ASK.busy = false; askRender();
}
function askMount() {
  if (document.querySelector("#askbtn") || !(window.ANALYTIC && window.ANALYTIC.ask || (typeof AUTH !== "undefined" && AUTH.owner))) return;
  if (typeof signedIn !== "function" || !signedIn()) return;
  const b = document.createElement("button"); b.id = "askbtn"; b.className = "ask-btn"; b.textContent = "✦ Ask"; b.setAttribute("aria-label", "Ask the assistant");
  const p = document.createElement("div"); p.id = "askpanel"; p.className = "ask-panel"; p.hidden = true; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Ask The Analytic");
  p.innerHTML = `<div class="ask-h"><b>Ask The Analytic</b><button class="ask-x" aria-label="Close">×</button></div><div class="ask-log" aria-live="polite"></div>
    <form class="ask-f"><input maxlength="600" placeholder="Ask a question…" autocomplete="off"><button class="btn" style="padding:8px 14px;font-size:14px">Send</button></form>
    <div class="ask-foot"><span class="ask-left"></span> Educational, not investment advice. It can be wrong.</div>`;
  document.body.append(b, p);
  const toggle = () => { p.hidden = !p.hidden; b.style.display = p.hidden ? "" : "none"; if (!p.hidden) { askRender(); p.querySelector("input").focus(); } };
  b.onclick = toggle; p.querySelector(".ask-x").onclick = () => { toggle(); b.focus(); };
  p.addEventListener("keydown", (e) => { if (e.key === "Escape") { toggle(); b.focus(); } });
  p.querySelector("form").onsubmit = (e) => { e.preventDefault(); const i = p.querySelector("input"), q = i.value; i.value = ""; askSend(q); };
}
