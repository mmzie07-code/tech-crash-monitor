// Alerts (Plus). Checked when you open the site, against the data it just loaded, so there are no emails or push messages yet: those need an email service that isn't connected.
// Rules and the feed live in this browser (localStorage). Three kinds: a watched stock moves more than N% in a day, the AI & Tech Watch zone changes, a followed event is today or tomorrow.
const AL_RULES = "ml_alert_rules", AL_FEED = "ml_alert_feed", AL_SEEN = "ml_alert_seen";
const alGet = (k, d) => { try { return Object.assign(Array.isArray(d) ? [] : {}, JSON.parse(localStorage.getItem(k) || "null") || d); } catch (e) { return d; } };
const alSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const alRules = () => Object.assign({ move: 5, zone: true, events: true }, alGet(AL_RULES, {}));
const alFeed = () => { try { return JSON.parse(localStorage.getItem(AL_FEED) || "[]"); } catch (e) { return []; } };

function alBell() {
  const el = document.querySelector("#al"); if (!el) return;
  const n = alFeed().filter((x) => !x.read).length;
  el.querySelector("b").textContent = n || "";
  el.style.display = typeof planPaid === "function" && planPaid() && (typeof signedIn !== "function" || signedIn()) ? "" : "none";
}

async function alCheck() {
  if (typeof planLoad !== "function" || typeof signedIn !== "function" || !signedIn()) return alBell();
  await planLoad(); if (!planPaid()) return alBell();
  const rules = alRules(), seen = Object.assign({ keys: [] }, alGet(AL_SEEN, {})), feed = alFeed(), fresh = [], now = Date.now();
  const day = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const push = (key, text, link) => { if (seen.keys.includes(key) || feed.some((x) => x.k === key)) return; fresh.push({ k: key, t: now, text, link, read: false }); seen.keys.push(key); };
  if (rules.move > 0 && state.search) FOLLOWS.filter((f) => f.kind === "stock").forEach((f) => { const r = state.search.stocks.find((x) => x[0] === f.ref); if (r && r[5] != null && Math.abs(r[5]) >= rules.move) push("mv:" + f.ref + ":" + (state.quotes && state.quotes.date || day), `${f.ref} moved ${r[5] > 0 ? "+" : ""}${r[5].toFixed(1)}% in the latest session (now $${r[4].toLocaleString()}).`, "#/stock/" + f.ref); });
  const aiw = state.aiw && state.aiw.zone;
  if (rules.zone && aiw) { if (seen.zone && seen.zone !== aiw) push("zone:" + aiw + ":" + day, `AI & Tech Watch moved from "${seen.zone}" to "${aiw}".`, "#/watch"); seen.zone = aiw; }
  if (rules.events) FOLLOWS.filter((f) => f.kind === "event").forEach((f) => { const d = f.date || (f.ref || "").slice(0, 10); if (d === day || d === tomorrow) push("ev:" + f.ref + ":" + d, `${f.label || "An event you follow"} is ${d === day ? "today" : "tomorrow"}.`, "#/markets/calendar"); });
  seen.keys = seen.keys.slice(-300);
  alSet(AL_SEEN, seen);
  if (fresh.length) alSet(AL_FEED, fresh.concat(feed).slice(0, 60));
  alBell();
}

const AL_CONSENT_TEXT = "Yes, email me alerts about the stocks and events I follow. I can turn this off at any time on this page.";
async function alConsentGet() { if (typeof AUTH === "undefined" || !AUTH.sb || !AUTH.user) return null; try { const { data } = await AUTH.sb.from("email_consent").select("granted,granted_at").eq("user_id", AUTH.user.id).maybeSingle(); return data || { granted: false }; } catch (e) { return null; } }
async function alConsentSet(on) {
  const now = new Date().toISOString(), row = on ? { user_id: AUTH.user.id, granted: true, granted_at: now, withdrawn_at: null, consent_text: AL_CONSENT_TEXT, source: "alerts_page", updated_at: now } : { user_id: AUTH.user.id, granted: false, withdrawn_at: now, updated_at: now };
  try { const { error } = await AUTH.sb.from("email_consent").upsert(row, { onConflict: "user_id" }); return !error; } catch (e) { return false; }
}

async function alertsPage() {
  const consent = await alConsentGet();
  const rules = alRules(), feed = alFeed(), ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? Math.max(1, m) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  afterRender.push(() => {
    const save = () => { alSet(AL_RULES, { move: +document.querySelector("#alm").value, zone: document.querySelector("#alz").checked, events: document.querySelector("#ale").checked }); };
    ["#alm", "#alz", "#ale"].forEach((id) => { const e = document.querySelector(id); if (e) e.onchange = save; });
    const c = document.querySelector("#alclear"); if (c) c.onclick = () => { alSet(AL_FEED, []); state.keepScroll = true; route(); };
    const f = alFeed(); f.forEach((x) => { x.read = true; }); alSet(AL_FEED, f); alBell();
  });
  afterRender.push(() => { const c = document.querySelector("#alemail"); if (c) c.onchange = async () => { const m = document.querySelector("#alemsg"); c.disabled = true; const ok = await alConsentSet(c.checked); c.disabled = false; if (!ok) c.checked = !c.checked; m.textContent = ok ? (c.checked ? "Saved. You opted in on " + new Date().toLocaleDateString() + ". Email alerts aren't switched on yet; we'll only email once they are." : "Done. We won't email you.") : "Couldn't save that. Nothing changed."; m.style.color = ok ? "var(--ok)" : "var(--bad)"; }; });
  return `<h1>Alerts</h1><p class="muted" style="margin-top:0">Checked each time you open The Analytic, using the latest data. Email and phone alerts aren't set up yet.</p>
  <div class="card"><h3 style="margin:0 0 8px">What to alert me about</h3>
   <label style="display:flex;gap:10px;align-items:center;margin:8px 0;font-weight:400">A stock on my watchlist moves more than <select id="alm">${[[0, "never"], [3, "3%"], [5, "5%"], [8, "8%"], [10, "10%"]].map(([v, l]) => `<option value="${v}" ${v === rules.move ? "selected" : ""}>${l}</option>`).join("")}</select> in a day</label>
   <label style="display:flex;gap:10px;align-items:center;margin:8px 0;font-weight:400"><input id="alz" type="checkbox" ${rules.zone ? "checked" : ""}> The AI &amp; Tech Watch changes zone</label>
   <label style="display:flex;gap:10px;align-items:center;margin:8px 0;font-weight:400"><input id="ale" type="checkbox" ${rules.events ? "checked" : ""}> An event I follow is today or tomorrow</label>
   <p class="small muted" style="margin:8px 0 0">Add stocks and events with the ♡ <a href="#/watchlist">on your watchlist</a>. Settings save on this device.</p></div>
  <div class="card"><h3 style="margin:0 0 6px">Email (optional)</h3>${consent ? `<label style="display:flex;gap:10px;align-items:flex-start;font-weight:400"><input id="alemail" type="checkbox" style="margin-top:4px" ${consent.granted ? "checked" : ""}><span>${esc(AL_CONSENT_TEXT)}</span></label><p id="alemsg" class="small" style="min-height:18px;margin:6px 0 0"></p>` : `<p class="small muted" style="margin:0">Sign in with an account to choose email alerts.</p>`}<p class="small muted" style="margin:6px 0 0">Off unless you tick it. We never send texts.</p></div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Recent alerts</h3>${feed.length ? `<button class="btn ghost" id="alclear" style="font-size:13px;padding:6px 12px">Clear</button>` : ""}</div>
   ${feed.length ? feed.map((x) => `<a class="item" href="${esc(x.link)}" style="align-items:center;color:inherit"><span style="flex:1">${esc(x.text)}${x.read ? "" : ' <span class="pill g">new</span>'}</span><span class="small muted">${ago(x.t)}</span></a>`).join("") : `<p class="small muted" style="margin:8px 0 0">Nothing yet. Alerts show up here when something you asked about happens.</p>`}</div>`;
}
