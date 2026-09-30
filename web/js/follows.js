// Hearts: follow stocks and events. Stored locally, and in the user's account (table "follows") when signed in.
const FOLLOW_KEY = "ml_follows";
let FOLLOWS = (() => { try { return JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]"); } catch (e) { return []; } })();
const saveFollows = () => { try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(FOLLOWS)); } catch (e) {} };
const isFollowing = (kind, ref) => FOLLOWS.some((f) => f.kind === kind && f.ref === ref);

async function toggleFollow(kind, ref, meta) {
  const i = FOLLOWS.findIndex((f) => f.kind === kind && f.ref === ref);
  if (i >= 0) {
    FOLLOWS.splice(i, 1); saveFollows();
    if (canSync()) try { await AUTH.sb.from("follows").delete().match({ user_id: AUTH.user.id, kind, ref }); } catch (e) {}
    return false;
  }
  FOLLOWS.push({ kind, ref, ...meta }); saveFollows();
  if (canSync()) try { await AUTH.sb.from("follows").upsert({ user_id: AUTH.user.id, kind, ref, label: meta.label || null, event_date: meta.date || null, event_time: meta.time || null }); } catch (e) {}
  return true;
}

async function pullFollows() {
  if (!canSync()) return;
  try {
    const { data, error } = await AUTH.sb.from("follows").select("kind,ref,label,event_date,event_time");
    if (error || !data) return;
    const server = new Map(data.map((r) => [r.kind + "|" + r.ref, { kind: r.kind, ref: r.ref, label: r.label, date: r.event_date, time: r.event_time }]));
    const localOnly = FOLLOWS.filter((f) => !server.has(f.kind + "|" + f.ref));
    FOLLOWS = [...server.values(), ...localOnly]; saveFollows();
    if (localOnly.length) await AUTH.sb.from("follows").upsert(localOnly.map((f) => ({ user_id: AUTH.user.id, kind: f.kind, ref: f.ref, label: f.label || null, event_date: f.date || null, event_time: f.time || null })));
  } catch (e) {}
}

function heartBtn(kind, ref, meta) {
  const on = isFollowing(kind, ref);
  return `<button class="heart ${on ? "on" : ""}" data-k="${kind}" data-r="${esc(ref)}" data-m='${esc(JSON.stringify(meta || {}))}' aria-pressed="${on}" title="${on ? "Remove from watchlist" : "Add to watchlist"}">${on ? "♥" : "♡"}<span>${on ? " Following" : kind === "event" ? " Follow event" : " Watch"}</span></button>`;
}
function wireHearts() {
  document.querySelectorAll(".heart").forEach((b) => b.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = await toggleFollow(b.dataset.k, b.dataset.r, JSON.parse(b.dataset.m || "{}"));
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    b.innerHTML = `${on ? "♥" : "♡"}<span>${on ? " Following" : b.dataset.k === "event" ? " Follow event" : " Watch"}</span>`;
    const c = document.querySelector("#wl b"); if (c) c.textContent = FOLLOWS.length || "";
  });
}

async function watchlistPage() {
  const stocks = FOLLOWS.filter((f) => f.kind === "stock"), events = FOLLOWS.filter((f) => f.kind === "event");
  const hists = await Promise.all(stocks.map((f) => getHist(f.ref)));
  const q = typeof Q === "function" ? Q() : {};
  const rows = stocks.map((f, i) => {
    const h = hists[i], srch = state.search && state.search.stocks.find((r) => r[0] === f.ref), price = h ? h.c[h.c.length - 1] : srch ? srch[4] : q[f.ref] ? q[f.ref].price : null;
    const d1 = srch ? srch[5] : q[f.ref] ? q[f.ref].d1 : h && h.c.length > 1 ? (h.c[h.c.length - 1] / h.c[h.c.length - 2] - 1) * 100 : null;
    const sp = h ? h.c.slice(-63) : null, up = sp && sp[sp.length - 1] >= sp[0];
    return `<div class="item" style="align-items:center"><a href="#/stock/${esc(f.ref)}" style="flex:1;color:inherit"><b>${esc(f.ref)}</b> <span class="small muted">${esc(f.label || (srch && srch[1]) || "")}</span></a>
      <span style="width:90px">${sp ? svgLines([sp], [up ? "var(--ok)" : "var(--bad)"], 34) : ""}</span><span style="min-width:120px;text-align:right"><b>${price != null ? "$" + price.toLocaleString() : "-"}</b><br>${pctTxt(d1)}</span>${heartBtn("stock", f.ref, { label: f.label })}</div>`;
  }).join("");
  const today = new Date().toISOString().slice(0, 10), cal = (state.cal && state.cal.events) || [];
  const evRows = events.map((f) => {
    const c = cal.find((x) => x.id === f.ref), r = recapFor(f.ref), date = (c && c.date) || f.date || f.ref.slice(0, 10), past = date < today;
    return { f, c, r, date, past, row: `<div class="item" style="align-items:center"><div style="flex:1"><b>${esc((c && c.title) || f.label || f.ref)}</b><div class="small muted">${new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${c ? " · " + esc(c.time) + (/^\d/.test(c.time) ? " ET" : "") : ""}</div>
      <div class="small">${r ? `<a href="#/recap/${encodeURIComponent(f.ref)}"><b>Read the recap →</b></a>` : past ? '<span class="muted">Recap coming soon</span>' : '<a href="#/markets/calendar">On the calendar →</a>'}</div></div>${heartBtn("event", f.ref, { label: f.label, date, time: c && c.time })}</div>` };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = evRows.filter((x) => !x.past), done = evRows.filter((x) => x.past).reverse();
  return `<h1>Watchlist</h1><p class="muted">Stocks and events you're following, in one place. Tap the heart on any stock page, calendar event or recap to add it.</p>
  <div class="card"><h3>Stocks</h3>${rows || '<p class="small muted" style="margin:0">Nothing yet. Open any stock and tap <b>♡ Watch</b>. Try <a href="#/explore">Explore</a>.</p>'}</div>
  <div class="card"><h3>Upcoming events</h3>${upcoming.map((x) => x.row).join("") || '<p class="small muted" style="margin:0">No followed events coming up. Open the <a href="#/markets/calendar">calendar</a>, expand an event and tap <b>♡ Follow event</b>.</p>'}</div>
  ${done.length ? `<div class="card"><h3>Past events</h3>${done.map((x) => x.row).join("")}</div>` : ""}
  <div class="card" style="border-left:4px solid var(--brand)"><b>Email alerts are coming.</b><p class="small muted" style="margin:4px 0 0">Soon, events you follow will email you an hour before they start and again when the recap is ready. ${typeof AUTH !== "undefined" && AUTH.enabled && !AUTH.user ? "Create an account so your watchlist follows you across devices." : ""}</p></div>`;
}
