// Ticker across the top of the site: the 20 biggest risers among US stocks worth $2B+, measured from the first minute of trading while the market is open
// (refreshed every 5 minutes), and the day's top 20 once it has closed. Data comes from the edge function's "gainers" action; signed-in users only.
const TICK = { el: null, at: 0, session: null, busy: false, timer: null };
const TICK_OPEN_MS = 5 * 60 * 1000, TICK_CLOSED_MS = 30 * 60 * 1000;

function tickerMount() {
  if (TICK.el) return TICK.el;
  const header = document.querySelector("header.top"); if (!header) return null;
  const el = document.createElement("div");
  el.className = "ticker"; el.hidden = true; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Top rising stocks");
  header.prepend(el); TICK.el = el; return el;
}

function tickerRender(j) {
  const el = tickerMount(); if (!el || !j || !j.items || !j.items.length) return;
  const names = {}; (state.search && state.search.stocks || []).forEach((r) => { names[r[0]] = r[1]; });
  const open = j.session === "open";
  const et = (ts, o) => new Date(ts * 1000).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York" }, o));
  const when = open ? "updated " + et(j.asof, { hour: "numeric", minute: "2-digit" }) + " ET" : et(j.asof, { weekday: "short", month: "short", day: "numeric" });
  const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const item = (r) => `<a href="#/stock/${esc(r.s)}" title="${esc((names[r.s] || r.s) + " · $" + r.p.toLocaleString() + " · " + sign(r.o) + " since the open" + (r.d != null ? " · " + sign(r.d) + " vs yesterday's close" : "") + " · prices about 15 minutes delayed")}"><b>${esc(r.s)}</b> <span class="${r.o >= 0 ? "tk-up" : "tk-dn"}">${esc(sign(r.o))}</span></a>`;
  const strip = j.items.map(item).join("");
  el.innerHTML = `<div class="tk-label" title="${open ? "The 20 biggest risers since the market opened, among US stocks worth $2B or more. Refreshes every 5 minutes." : "The 20 biggest risers of the last trading day (open to close), among US stocks worth $2B or more."}">
    <i class="${open ? "tk-dot" : "tk-dot off"}"></i><span>${open ? "LIVE" : "CLOSED"}</span><span class="tk-long">${open ? " · top 20 since the open" : " · top 20 gainers · " + esc(when)}</span></div>
   <div class="tk-track"><div class="tk-move" id="tkmove">${strip}${strip}</div></div>`;
  el.hidden = false;
  const mv = el.querySelector("#tkmove");  // two copies side by side; scroll one copy's width at a steady speed so it loops seamlessly
  if (mv) mv.style.animationDuration = Math.max(20, Math.round(mv.scrollWidth / 2 / 55)) + "s";
  TICK.session = j.session; TICK.at = Date.now();
}

async function tickerLoad() {
  if (TICK.busy) return; TICK.busy = true;
  try { tickerRender(await liveGet("action=gainers")); }
  catch (e) { /* keep showing the last list; if there never was one, the ticker just stays hidden */ }
  TICK.busy = false;
}

// Called after every page render and when the tab becomes visible again: show/hide with sign-in, and refresh when the list is stale.
function tickerSync() {
  const el = tickerMount(); if (!el) return;
  if (typeof liveOK !== "function" || !liveOK()) { el.hidden = true; return; }
  if (!TICK.timer) TICK.timer = setInterval(() => { if (!document.hidden) tickerSync(); }, 60 * 1000);
  const age = Date.now() - TICK.at, limit = TICK.session === "open" || !TICK.session ? TICK_OPEN_MS : TICK_CLOSED_MS;
  if (!TICK.at || age > limit) tickerLoad(); else if (el.innerHTML) el.hidden = false;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) tickerSync(); });
