// "Your setup guide": a small floating checklist (bottom right) that walks a new user through the site's best features and ticks items off as they do them.
// Progress is kept in this browser (localStorage). Shown to signed-in users and the owner only; can be hidden for good.
const SETUP_ITEMS = [
  { id: "idea", t: "Find a new idea", s: "Screen for stocks that look cheap and out of favor", href: "#/explore/overlooked" },
  { id: "value", t: "Quickly check a valuation", s: "See how a stock is priced against its peers in under a minute", href: "#/report/MSFT" },
  { id: "follow", t: "Follow a company", s: "Tap the heart on any stock to start a watchlist", href: "#/explore" },
  { id: "practice", t: "Try practice trading", s: "Invest $10,000 of pretend money, no risk", href: "#/practice" },
  { id: "learn", t: "Learn the basics", s: "Open a lesson from the 8-part investing course", href: "#/learn/1" },
];
const SETUP = { open: false };
const setupLoad = () => { try { return JSON.parse(localStorage.getItem("ml_setup") || "{}"); } catch (e) { return {}; } };
const setupSave = (o) => { try { localStorage.setItem("ml_setup", JSON.stringify(o)); } catch (e) {} };

function setupDone(st) {
  const d = Object.assign({}, st.done || {});
  if (typeof FOLLOWS !== "undefined" && FOLLOWS.length) d.follow = true;
  return d;
}

// Called after every page render with the route: ticks off the items this page completes, then redraws.
function setupSync(a, h) {
  if (typeof signedIn !== "function" || !signedIn()) { const el = document.querySelector("#setup"); if (el) el.hidden = true; return; }
  const st = setupLoad(); st.done = st.done || {};
  if (a === "explore" && (h[1] === "overlooked" || h[1] === "screener")) st.done.idea = true;
  if (a === "report" && h[1] && h[2] !== "snapshot") st.done.value = true;
  if (a === "practice") st.done.practice = true;
  if (a === "learn" && h[1]) st.done.learn = true;
  setupSave(st); setupDraw(st);
}

function setupDraw(st) {
  st = st || setupLoad();
  let el = document.querySelector("#setup");
  if (st.hidden) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement("div"); el.id = "setup"; el.className = "setup noprint"; document.body.appendChild(el); }
  const done = setupDone(st), n = SETUP_ITEMS.filter((i) => done[i.id]).length, total = SETUP_ITEMS.length, finished = n === total;
  const row = (i) => `<a class="setup-row ${done[i.id] ? "on" : ""}" href="${i.href}" data-sid="${i.id}"><i>${done[i.id] ? "✓" : ""}</i><span><b>${esc(i.t)}</b><small>${esc(i.s)}</small></span><em>›</em></a>`;
  el.hidden = false;
  el.innerHTML = `<div class="setup-panel" ${SETUP.open ? "" : "hidden"} role="dialog" aria-label="Your setup guide">
      <div class="setup-head"><b>${finished ? "You're all set" : "Your setup guide"}</b><button class="setup-x" id="setupHide" title="Hide this guide" aria-label="Hide this guide">✕</button></div>
      <p class="setup-sub">${finished ? "You've tried the main features. Keep exploring any time." : `${n} of ${total} done. Each one takes about a minute.`}</p>${SETUP_ITEMS.map(row).join("")}</div>
    <button class="setup-pill" id="setupToggle" aria-expanded="${SETUP.open}"><span class="setup-ring" style="--p:${Math.round((n / total) * 100)}">${n}/${total}</span><b>Your setup guide</b><em>${SETUP.open ? "⌄" : "⌃"}</em></button>`;
  el.querySelector("#setupToggle").onclick = () => { SETUP.open = !SETUP.open; setupDraw(); };
  el.querySelector("#setupHide").onclick = () => { const s = setupLoad(); s.hidden = true; setupSave(s); setupDraw(s); };
  el.querySelectorAll(".setup-row").forEach((a) => a.addEventListener("click", () => { SETUP.open = false; }));
}
