// Plans: Free, Student and Plus. Billing is not wired yet, so enforcement is OFF (everyone has everything) until the edge function runs with PAYWALL=on.
// Until then the pricing page records who would sign up for what (table plan_interest), which is the demand check before connecting Stripe.
// The static data files stay public: these locks are a product boundary, not a security one. Only the Pro analysis sections are enforced server-side (see analysis.js).
const PLANS = [
  { id: "free", name: "Free", mo: 0, yr: 0, tag: "Learn and look around", feats: ["The 8-lesson crash course", "AI & Tech Watch crash monitor", "Markets: overview, daily brief, economy, calendar", "Stock pages, charts and the practice portfolio", "The public practice fund managers", "The whole globe: every layer, from health and conflict to oil, minerals, debt, chips, cables and trade routes"] },
  { id: "student", name: "Student", mo: 3, yr: 30, tag: "Everything in Plus, for ages 16 to 22", feats: ["Everything in Plus", "For ages 16 to 22, confirmed when you subscribe", "Costs about a coffee a month"] },
  { id: "plus", name: "Plus", mo: 12, yr: 99, tag: "The full toolkit", feats: ["Everything in Free", "Full company analysis: balance sheet, insider trades, ownership, leadership, dividends", "Stock screener and the Overlooked stocks screen, with a forecast range for every company", "Portfolio analysis for your own practice portfolio, with its forecast range", "Alerts: big moves in stocks you watch, AI Watch zone changes, followed events", "CSV export of the screener, your holdings, trades and watchlist"] },
];
const PAID_LAYERS = [];   // the globe is free: every layer
const PLAN = { id: "free", paywall: false, loaded: false };

function planReset() { PLAN.loaded = false; PLAN.id = "free"; }
async function planLoad() {
  if (PLAN.loaded) return PLAN;
  PLAN.paywall = !!(window.ANALYTIC && window.ANALYTIC.paywall);
  if (typeof AUTH !== "undefined" && AUTH.owner) PLAN.id = "owner";
  else if (typeof liveOK === "function" && liveOK()) { try { const j = await liveGet("action=plan"); PLAN.id = j.plan || "free"; PLAN.paywall = !!j.paywall; } catch (e) {} }
  PLAN.loaded = true;
  return PLAN;
}
const planPaid = () => !PLAN.paywall || PLAN.id !== "free";

const planLock = (title, what) => `<section class="card pl-lock"><span class="pill w">Plus</span><h2 style="margin:6px 0 4px">${esc(title)}</h2><p class="muted" style="margin:0 0 12px">${esc(what)}</p><a class="btn" href="#/pricing">See plans</a></section>`;

// Pages that need a paid plan. Returns a promise of the lock page, or of null when the visitor may go on.
function planGate(a, h) {
  const pages = { screener: ["Stock screener", "Filter every company on value, quality, growth and size."], overlooked: ["Overlooked stocks", "Companies that look cheap against their peers while the business keeps growing."] };
  if (a === "practice" && h[1] === "analysis") return planLoad().then(() => (planPaid() ? null : `<h1>Practice</h1>${planLock("Portfolio analysis is part of Plus", "Value over time, returns, dividends, scorecard and a forecast range for your own practice portfolio. The demo portfolio stays free so you can see what it looks like.")}`));
  if (a === "alerts") return planLoad().then(() => (planPaid() ? null : `<h1>Alerts</h1>${planLock("Alerts are part of Plus", "Get told about big moves in stocks you watch, changes in the AI & Tech Watch zone and followed events coming up.")}`));
  if (a !== "explore" || !pages[h[1]]) return null;
  return planLoad().then(() => (planPaid() ? null : `<h1>${esc(pages[h[1]][0])}</h1>${planLock(pages[h[1]][0] + " is part of Plus", pages[h[1]][1])}`));
}

async function recordInterest(plan, interval) {
  if (typeof AUTH === "undefined" || !AUTH.sb || !AUTH.user) return false;
  try { let { error } = await AUTH.sb.from("plan_interest").upsert({ user_id: AUTH.user.id, plan, interval, email_consent_at: new Date().toISOString() }, { onConflict: "user_id,plan" }); if (error) ({ error } = await AUTH.sb.from("plan_interest").upsert({ user_id: AUTH.user.id, plan, interval }, { onConflict: "user_id,plan" })); return !error; } catch (e) { return false; }
}

const plPrice = (p, yearly) => (p.mo === 0 ? "$0" : yearly ? "$" + p.yr + "<small>/year</small>" : "$" + p.mo + "<small>/month</small>");
const plSave = (p) => (p.mo ? Math.round((1 - p.yr / (p.mo * 12)) * 100) : 0);

async function pricingPage() {
  await planLoad();
  const yearly = (() => { try { return localStorage.getItem("ml_plan_yearly") !== "0"; } catch (e) { return true; } })();
  afterRender.push(() => {
    document.querySelectorAll("[data-pint]").forEach((b) => b.onclick = (e) => { e.preventDefault(); try { localStorage.setItem("ml_plan_yearly", b.dataset.pint); } catch (x) {} state.keepScroll = true; route(); });
    document.querySelectorAll("[data-want]").forEach((b) => b.onclick = async () => {
      const msg = document.querySelector("#plmsg");
      if (AUTH.owner && !AUTH.user) { msg.textContent = "You're in owner mode, which has no account to save this against. Sign out and sign in with a regular account to record interest."; msg.style.color = "var(--mut)"; return; }
      if (!AUTH.user) { msg.textContent = "Sign in first, then tell us which plan you want."; msg.style.color = "var(--mut)"; return; }
      b.disabled = true;
      const ok = await recordInterest(b.dataset.want, b.dataset.interval);
      msg.textContent = ok ? "Thanks, noted. You'll get one email when " + (b.dataset.want === "pro" ? "Pro tools" : "paid plans") + " open, and nothing else. Nothing is charged." : "Couldn't save that just now. Please try again later.";
      msg.style.color = ok ? "var(--ok)" : "var(--bad)";
      if (ok) b.textContent = "Noted";
    });
  });
  const open = !PLAN.paywall;
  const card = (p) => {
    const mine = PLAN.id === p.id;
    const cta = p.id === "free" ? `<span class="small muted">${mine || open ? "Your plan today" : "Always free"}</span>` : mine ? `<span class="pill g">Your plan</span>` : `<button class="btn" data-want="${p.id}" data-interval="${yearly ? "year" : "month"}" style="width:100%">Notify me when it opens</button>`;
    return `<div class="card pl-card${p.id === "plus" ? " pl-hot" : ""}"><h3 style="margin:0">${p.name}${p.id === "plus" ? ' <span class="pill">Most complete</span>' : ""}</h3><p class="small muted" style="margin:2px 0 10px">${esc(p.tag)}</p>
      <div class="pl-price">${plPrice(p, yearly)}</div>${p.mo && yearly ? `<p class="small" style="margin:0 0 10px;color:var(--ok)">Save ${plSave(p)}% against monthly</p>` : '<p class="small" style="margin:0 0 10px">&nbsp;</p>'}
      <ul class="pl-list">${p.feats.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><div style="margin-top:14px">${cta}</div></div>`;
  };
  return `<h1>Plans</h1>
  <p class="muted" style="margin-top:0">Learning stays free. Paid plans add depth for people who use the tools every week.</p>
  ${open ? `<div class="card" style="border-left:4px solid var(--ok)"><b>Early access:</b> every feature is unlocked for everyone while we finish setting up payments. Nothing is charged. Tell us which plan you'd pick so we price it right.</div>` : ""}
  <div class="tabs"><a href="#" data-pint="1" class="${yearly ? "on" : ""}">Yearly</a><a href="#" data-pint="0" class="${yearly ? "" : "on"}">Monthly</a></div>
  <div class="pl-grid">${PLANS.map(card).join("")}</div>
  <p id="plmsg" class="small" style="min-height:20px"></p>
  <p class="small muted" style="margin-top:-8px">Pressing a "Notify me" or "pro tools" button means you agree to one email when that plan opens. We send no other email, and no texts, unless you agree to them separately.</p>
  <div class="card"><h3 style="margin:0 0 4px">Who is Student for?</h3><p class="small" style="margin:0">Anyone aged 16 to 22. When payments open you'll confirm your age (and, for 18 and over, a school email also works). It has the same features as Plus. Plus is for everyone else.</p></div>
  <div class="card"><h3 style="margin:0 0 4px">Need exports or data access?</h3><p class="small muted" style="margin:0 0 10px">If you'd use CSV exports or an API, say so. We only build a professional tier if enough people want it.</p><button class="btn ghost" data-want="pro" data-interval="${yearly ? "year" : "month"}">I'd use pro tools</button></div>
  <p class="small muted">Prices are in US dollars and may change before payments open. The Analytic is educational and does not give investment advice. See the <a href="#/terms">Terms</a>.</p>`;
}

// ---- CSV export (Plus) ----
const csvCell = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function csvSave(name, rows) {
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const exportBtn = (kind, label) => (planPaid() ? `<button class="btn ghost" data-csv="${kind}" style="font-size:13px;padding:7px 12px">⬇ ${label || "Export CSV"}</button>` : `<a class="btn ghost" href="#/pricing" style="font-size:13px;padding:7px 12px">🔒 ${label || "Export CSV"} (Plus)</a>`);
function csvExport(kind) {
  if (!planPaid()) { location.hash = "#/pricing"; return; }
  const rng = (sym) => { const f = typeof fcGet === "function" ? fcGet(sym) : null; return f && f.r && f.r.h21 ? [f.r.h21[1], f.r.h21[2]] : ["", ""]; };
  if (kind === "screener" && typeof screenerResults === "function") {
    csvSave("screener", [["Symbol", "Company", "Sector", "Market cap ($B)", "Price ($)", "Today (%)", "1-month range low (%)", "1-month range high (%)"]].concat(screenerResults().map((x) => [x[0], x[1], typeof SECTOR_NAME === "function" ? SECTOR_NAME(x[2]) : x[2], x[3], x[4], x[5]].concat(rng(x[0])))));
  } else if (kind === "holdings" && typeof PF !== "undefined" && PF.R) {
    const R = PF.R;
    csvSave("holdings", [["Symbol", "Company", "Shares", "Average cost ($)", "Price ($)", "Value ($)", "Cost ($)", "Unrealized ($)", "Unrealized (%)", "1-month range low (%)", "1-month range high (%)"]].concat(R.order.filter((s) => R.pos[s].sh > 1e-7).map((s) => { const q = R.pos[s]; return [s, pfName(s), +q.sh.toFixed(4), q.sh ? +(q.cost / q.sh).toFixed(2) : "", +q.price.toFixed(2), +q.value.toFixed(2), +q.cost.toFixed(2), +(q.value - q.cost).toFixed(2), q.cost ? +((q.value / q.cost - 1) * 100).toFixed(2) : ""].concat(rng(s)); })));
  } else if (kind === "trades" && typeof P !== "undefined" && P && P.trades) {
    csvSave("trades", [["Date", "Side", "Symbol", "Shares", "Price ($)", "Note"]].concat(P.trades.map((t) => [t.d, t.side, t.sym, t.sh, t.px, t.note || ""])));
  } else if (kind === "watchlist") {
    const rows = state.search ? state.search.stocks : [];
    csvSave("watchlist", [["Symbol", "Company", "Price ($)", "Today (%)", "1-month range low (%)", "1-month range high (%)"]].concat(FOLLOWS.filter((f) => f.kind === "stock").map((f) => { const r = rows.find((x) => x[0] === f.ref); return [f.ref, f.label || (r && r[1]) || "", r ? r[4] : "", r ? r[5] : ""].concat(rng(f.ref)); })));
  }
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-csv]"); if (b) { e.preventDefault(); csvExport(b.dataset.csv); } });
