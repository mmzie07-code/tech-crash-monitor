// Plans: Free, Student and Plus. Billing is not wired yet, so enforcement is OFF (everyone has everything) until the edge function runs with PAYWALL=on.
// Until then the pricing page records who would sign up for what (table plan_interest), which is the demand check before connecting Stripe.
// The static data files stay public: these locks are a product boundary, not a security one. Only the Pro analysis sections are enforced server-side (see analysis.js).
const PLANS = [
  { id: "free", name: "Free", mo: 0, yr: 0, tag: "Learn and look around", feats: ["The 8-lesson crash course", "AI & Tech Watch crash monitor", "Markets: overview, daily brief, economy, calendar", "Stock pages, charts and the practice portfolio", "The public practice fund managers", "The globe: economic health, conflict, goods, food and spending"] },
  { id: "student", name: "Student", mo: 3, yr: 30, tag: "Everything in Plus, for ages 16 to 22", feats: ["Everything in Plus", "For ages 16 to 22, confirmed when you subscribe", "Costs about a coffee a month"] },
  { id: "plus", name: "Plus", mo: 12, yr: 99, tag: "The full toolkit", feats: ["Everything in Free", "Full company analysis: balance sheet, insider trades, ownership, leadership, dividends", "Stock screener and the Overlooked stocks screen", "Every globe layer: oil, rare earths, minerals, debt, chips, cables, money flows and trade routes"] },
];
const PAID_LAYERS = ["oil", "rare", "min", "macro", "chips", "net", "money", "trade"];
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
  if (a !== "explore" || !pages[h[1]]) return null;
  return planLoad().then(() => (planPaid() ? null : `<h1>${esc(pages[h[1]][0])}</h1>${planLock(pages[h[1]][0] + " is part of Plus", pages[h[1]][1])}`));
}

async function recordInterest(plan, interval) {
  if (typeof AUTH === "undefined" || !AUTH.sb || !AUTH.user) return false;
  try { const { error } = await AUTH.sb.from("plan_interest").upsert({ user_id: AUTH.user.id, plan, interval }, { onConflict: "user_id,plan" }); return !error; } catch (e) { return false; }
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
      msg.textContent = ok ? "Thanks, noted. We'll email you when " + (b.dataset.want === "pro" ? "Pro tools" : "paid plans") + " open. Nothing is charged." : "Couldn't save that just now. Please try again later.";
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
  <div class="card"><h3 style="margin:0 0 4px">Who is Student for?</h3><p class="small" style="margin:0">Anyone aged 16 to 22. When payments open you'll confirm your age (and, for 18 and over, a school email also works). It has the same features as Plus. Plus is for everyone else.</p></div>
  <div class="card"><h3 style="margin:0 0 4px">Need exports or data access?</h3><p class="small muted" style="margin:0 0 10px">If you'd use CSV exports or an API, say so. We only build a professional tier if enough people want it.</p><button class="btn ghost" data-want="pro" data-interval="${yearly ? "year" : "month"}">I'd use pro tools</button></div>
  <p class="small muted">Prices are in US dollars and may change before payments open. The Analytic is educational and does not give investment advice. See the <a href="#/terms">Terms</a>.</p>`;
}
