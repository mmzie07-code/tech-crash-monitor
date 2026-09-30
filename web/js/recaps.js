// Event recap pages (facts-only analysis of what happened and how markets reacted).
const recapFor = (id) => state.recaps && state.recaps.recaps.find((r) => r.id === id && r.status === "final");
const KIND_LABEL = { fed: "Fed", data: "Economic data", treasury: "Treasury", earnings: "Earnings" };

function moveCell(r) {
  const v = r.move, good = r.unit === "pts" ? null : v > 0, c = v === 0 ? "var(--mut)" : r.unit === "pts" ? "var(--tx)" : v > 0 ? "var(--ok)" : "var(--bad)";
  return `<span style="color:${c};font-weight:700">${v > 0 ? "+" : ""}${r.unit === "pts" ? v.toFixed(2) + " pts" : v.toFixed(2) + "%"}</span>`;
}

function recapPage(id) {
  id = decodeURIComponent(id || "");
  const r = state.recaps && state.recaps.recaps.find((x) => x.id === id);
  if (!r) return `<p>We couldn't find that event recap. <a href="#/markets/calendar">Back to the calendar</a></p>`;
  const when = new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (r.status !== "final") return `<a href="#/markets/calendar" class="small">← Calendar</a><span class="pill w" style="margin-left:8px">Recap coming soon</span><h1 style="margin-top:8px">${esc(r.title)}</h1><p class="muted">${when} · ${esc(r.time)}${/^\d/.test(r.time) ? " ET" : ""}</p>
   <div class="card">${r.bullets.map((b) => `<p class="small muted" style="margin:0">${esc(b)}</p>`).join("")}<p class="small muted">We publish a recap once the official results are out, usually by the end of the market day.</p></div>`;
  const ch = r.changes && (r.changes.added.length || r.changes.removed.length) ? `<div class="card"><h3>What changed in the statement</h3><p class="small muted" style="margin-top:0">Compared with the previous statement (${new Date(r.changes.since + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}). Central banks choose words carefully, so small edits are closely watched.</p>
    <div class="cards" style="margin:0"><div><b class="small" style="color:var(--ok)">New or reworded</b>${r.changes.added.map((s) => `<p class="small" style="border-left:3px solid var(--ok);padding-left:10px;margin:6px 0">${esc(s)}</p>`).join("") || '<p class="small muted">Nothing new.</p>'}</div>
    <div><b class="small" style="color:var(--bad)">Dropped or reworded</b>${r.changes.removed.map((s) => `<p class="small" style="border-left:3px solid var(--bad);padding-left:10px;margin:6px 0">${esc(s)}</p>`).join("") || '<p class="small muted">Nothing dropped.</p>'}</div></div></div>` : "";
  const react = r.reaction && r.reaction.length ? `<div class="card"><h3>How markets reacted</h3><p class="small muted" style="margin-top:0">Change from the previous close to the close on ${when.split(",")[1].trim()}.</p>
    <div class="hz">${r.reaction.map((x) => `<a class="card" href="#/market/${encodeURIComponent(x.symbol)}" style="padding:12px;color:inherit;display:block"><div class="small muted">${esc(x.name)}</div>${moveCell(x)}</a>`).join("")}</div>
    ${r.sectors ? `<p class="small" style="margin:10px 0 0">Best sector: <b>${linkNames(r.sectors.best.name)}</b> ${pctTxt(r.sectors.best.move)} · Weakest: <b>${linkNames(r.sectors.worst.name)}</b> ${pctTxt(r.sectors.worst.move)}</p>` : ""}</div>`
    : `<div class="card"><h3>How markets reacted</h3><p class="small muted" style="margin:0">Markets were closed or we don't have price data for this date.</p></div>`;
  return `<a href="#/markets/calendar" class="small">← Calendar</a><div style="margin-top:6px"><span class="pill">${esc(KIND_LABEL[r.kind] || r.kind)}</span><span class="pill g">Recap</span></div>
  <h1 style="margin:6px 0 0">${esc(r.title)}</h1><p class="muted">${when} · ${esc(r.time)}${/^\d/.test(r.time) ? " ET" : ""}</p>
  <div class="card big"><h2 style="margin:0 0 8px">${esc(r.headline)}</h2>${r.bullets.map((b) => `<p style="margin:0 0 8px">${linkNames(b)}</p>`).join("")}</div>
  ${ch}${react}
  ${r.context && r.context.length ? `<div class="card"><h3>Putting it in context</h3>${r.context.map((c) => `<p class="small" style="margin:0 0 8px">${esc(c)}</p>`).join("")}</div>` : ""}
  <div class="card"><h3>Sources and learning</h3><ul style="margin:.3em 0 0;padding-left:20px">${(r.sources || []).map((s) => `<li class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join("")}${r.stock ? `<li class="small"><a href="#/stock/${esc(r.stock)}">${esc(r.stock)} chart</a></li>` : ""}
   <li class="small"><a href="#/learn/${r.lesson || 3}">Lesson ${r.lesson || 3}: the ideas behind this</a></li></ul></div>
  <div class="card"><span class="pill w">Coming soon</span><h3>In-depth analysis</h3><p class="small muted" style="margin:0">A written explanation of what this means for markets and why, in plain English. The facts above come straight from official sources.</p></div>
  <p class="small muted">Automatically assembled from official releases and market data. Educational only, not investment advice; market moves on an event day can have many causes.</p>`;
}

function recentRecapsCard() {
  const rs = state.recaps ? state.recaps.recaps.filter((r) => r.status === "final").slice(0, 8) : [];
  if (!rs.length) return "";
  return `<div class="card"><h3>Just happened: recaps</h3><p class="small muted" style="margin-top:0">What was announced, how markets reacted, and what changed.</p>
   ${rs.map((r) => `<a class="item" href="#/recap/${encodeURIComponent(r.id)}" style="align-items:center;color:inherit"><span class="dot" style="background:${r.kind === "fed" ? "var(--brand)" : r.kind === "treasury" ? "var(--warn)" : "var(--ok)"}"></span><div style="flex:1"><b>${esc(r.title.split(" (")[0])}</b><div class="small muted">${esc(r.headline)}</div></div><span class="small muted">${new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></a>`).join("")}</div>`;
}
