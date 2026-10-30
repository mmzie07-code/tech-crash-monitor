// AI & Tech Watch, v3: one composite score built from ~36 indicators in five groups (AI spending, NVIDIA and chips, financing and credit, market structure, validated models),
// each with its source, as-of date, update rhythm and the rule that turns it into "heat". Data: data/aiwatch.json (nightly and every weekday morning).
// The score is DESCRIPTIVE. Groups A-C use judgment weights because their series are too short to fit; only part of D and all of E have been tested out of sample.
const AIW_HEAT = (h) => (h == null ? "var(--unk)" : h < 35 ? "var(--ok)" : h < 55 ? "#d4b106" : h < 75 ? "#f97316" : "var(--bad)");
const aiwAge = (d) => (d == null ? "" : d === 0 ? "today" : d === 1 ? "yesterday" : d + " days ago");
const aiwDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const aiwBar = (h) => `<span class="aiw-bar"><i style="width:${h == null ? 0 : Math.max(2, h)}%;background:${AIW_HEAT(h)}"></i></span>`;
const AIW_COVER = {
  A: "What the biggest buyers of AI hardware are spending, earning and contracting. Source: their quarterly SEC filings.",
  B: "NVIDIA's own books (customers' payment speed, inventory, borrowing, insiders) and the wider chip industry. Source: SEC filings, Form 4s, production data.",
  C: "How the buildout is being paid for: bonds, bank loans, credit spreads, and filings that tie GPUs to debt. Source: SEC, Federal Reserve, ICE.",
  D: "Prices, valuation and sentiment: the original ten checks plus long-history valuation, margin debt and breadth.",
  E: "Our statistical crash-probability model, tested out of sample. It has the smallest weight because its skill faded after 2017.",
};

function aiWatchView() {
  const a = state.aiw, s = state.snap;
  const h = a.health, z = healthZone(h), v1 = s ? healthOf(s.score) : null;
  const ch = a.changes || {}, d7 = ch.d7, d30 = ch.d30;
  const delta = (c) => (c == null ? "" : `<span style="color:${c.heat > 0.4 ? "var(--bad)" : c.heat < -0.4 ? "var(--ok)" : "var(--mut)"};font-weight:700">${c.heat > 0.4 ? "hotter by " + c.heat.toFixed(1) : c.heat < -0.4 ? "cooler by " + Math.abs(c.heat).toFixed(1) : "little changed"}</span> <span class="muted">since ${aiwDate(c.since)}</span>`);
  const byKey = Object.fromEntries(a.indicators.map((i) => [i.key, i]));
  const drivers = a.drivers.map((k) => byKey[k]).filter(Boolean);
  const ser = (a.series || []).filter((x) => x.heat != null);
  const gen = new Date(a.generated), upd = gen.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const pillarCards = a.pillars.map((p) => `<a class="card aiw-pill" href="#" data-aiw="${p.key}" style="color:inherit"><div class="small muted">${p.key} · weight ${p.weight}%</div><b>${esc(p.name)}</b><div style="display:flex;align-items:center;gap:8px;margin:6px 0 4px"><b style="font-size:24px;color:${AIW_HEAT(p.heat)}">${p.heat == null ? "-" : Math.round(p.heat)}</b><span class="small muted">heat</span>${aiwBar(p.heat)}</div>
    <div class="small muted">${p.n} of ${p.n_total} indicators counted${d7 && d7.pillars[p.key] != null ? ` · ${d7.pillars[p.key] > 0 ? "▲" : d7.pillars[p.key] < 0 ? "▼" : "•"} ${Math.abs(d7.pillars[p.key])} this week` : ""}</div></a>`).join("");
  const row = (i) => `<tr class="${i.stale ? "aiw-stale" : ""}"><td style="min-width:200px"><b>${esc(i.name)}</b>${i.kind === "v1" ? ' <span class="pill" style="font-size:10px">original check</span>' : i.kind === "v2" ? ' <span class="pill w" style="font-size:10px">tested model</span>' : ""}${i.stale ? ' <span class="pill w" style="font-size:10px">out of date: not counted</span>' : ""}
      <div class="small muted">${esc(i.detail)}</div><details class="small"><summary class="muted" style="cursor:pointer">How its heat is set</summary><div style="margin-top:4px">${esc(i.rule)}</div><div class="muted" style="margin-top:2px">Source: ${esc(i.source)}</div></details></td>
    <td style="min-width:150px">${esc(i.display)}${i.hist && typeof cgSpark === "function" && i.hist.length > 3 ? `<div>${cgSpark(i.hist, 100, 24, "var(--brand)")}</div>` : ""}</td>
    <td style="min-width:90px"><b style="color:${AIW_HEAT(i.heat)}">${i.heat == null ? "-" : Math.round(i.heat)}</b> ${aiwBar(i.heat)}</td>
    <td class="small" style="min-width:110px">${esc(aiwDate(i.asof))}<div class="muted">${esc(aiwAge(i.age))} · ${esc(i.cadence)}</div></td></tr>`;
  const sections = a.pillars.map((p) => `<h2 id="aiw-${p.key}" style="margin-top:1.4em">${p.key}. ${esc(p.name)} <span style="color:${AIW_HEAT(p.heat)}">${p.heat == null ? "" : Math.round(p.heat)}</span></h2><p class="muted" style="margin-top:-4px">${esc(AIW_COVER[p.key])}</p>
    <div class="card"><div class="tw"><table class="aiw-t"><tr><th>Indicator</th><th>Reading</th><th>Heat</th><th>Data as of</th></tr>${a.indicators.filter((i) => i.pillar === p.key).map(row).join("")}</table></div></div>`).join("");
  const filings = (a.filings || []).map((f) => `<div class="item" style="align-items:flex-start"><div class="small muted" style="min-width:48px">${esc(aiwDate(f.date))}</div><div style="flex:1"><b>${esc(f.company)}</b> <span class="small">${esc(f.what)}</span> <a class="small" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.form)} ↗</a></div></div>`).join("") || `<p class="small muted">No notable filings in the last 45 days.</p>`;
  const fin = (a.financing_filings || []).map((f) => `<div class="item" style="align-items:flex-start"><div class="small muted" style="min-width:48px">${esc(aiwDate(f.date))}</div><div style="flex:1"><b>${esc(f.company)}</b> <a class="small" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.form)} ↗</a></div></div>`).join("") || `<p class="small muted">None found.</p>`;
  afterRender.push(() => document.querySelectorAll("[data-aiw]").forEach((el) => (el.onclick = (e) => { e.preventDefault(); const t = document.getElementById("aiw-" + el.dataset.aiw); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); })));
  return `<span class="pill w">Featured section</span><h1>AI &amp; Tech Watch</h1>
  <p class="muted">Is there an AI bubble, and how hot is it? ${a.coverage.n} indicators in five groups, from chipmaker receivables to bank loans to SEC filings, refreshed after every close and every weekday morning. Higher is healthier.</p>
  <div class="card big"><div class="strip" style="align-items:center;gap:26px"><div style="width:300px;max-width:100%">${gauge(h)}</div>
   <div style="flex:1;min-width:240px"><h2 style="margin:0 0 4px">${z[1]}: AI-buildout score ${h}</h2><p style="margin:0 0 8px">Heat is <b>${a.heat}</b> out of 100 (100 = every indicator at its most bubble-like). ${d7 ? delta(d7) + "." : "Trend history starts with today's reading."}${d30 ? " Month: " + delta(d30) + "." : ""}</p>
    <div class="small muted" style="margin-bottom:6px">What is pushing it up most:</div><div style="display:flex;gap:6px;flex-wrap:wrap">${drivers.map((i) => `<span class="pill" style="font-size:11.5px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${AIW_HEAT(i.heat)};margin-right:5px"></i>${esc(i.name)} ${Math.round(i.heat)}</span>`).join("")}</div>
    <p class="small muted" style="margin:10px 0 0">Updated ${esc(upd)}. ${a.coverage.n} of ${a.coverage.total} indicators are counted${a.stale && a.stale.length ? "; " + a.stale.length + " shown but not counted because their data is out of date" : ""}. Every indicator below shows when its data was last published.</p></div></div>
   ${ser.length > 3 ? `<div style="margin-top:10px"><div class="small muted">Heat over time (daily readings since ${esc(aiwDate(ser[0].d))})</div>${spark(ser.map((x) => x.heat))}</div>` : ""}</div>
  <div class="hz" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))">${pillarCards}</div>
  <div class="cards"><div class="card"><h3>Newest filings from the buildout</h3><p class="small muted" style="margin:0 0 6px">Earnings, bond offerings, major agreements and leadership changes from Microsoft, Alphabet, Amazon, Meta, Oracle, NVIDIA, AMD, Broadcom, Micron and CoreWeave, straight from the SEC in the last 45 days.</p>${filings}</div>
   <div class="card"><h3>New filings that tie GPUs to borrowing</h3><p class="small muted" style="margin:0 0 6px">Prospectuses and 8-Ks where GPUs sit next to collateral, term loans or credit facilities. These are keyword matches; some are incidental.</p>${fin}</div></div>
  ${sections}
  <div class="card"><h3>How the score is built, and what it is not</h3><ol class="small" style="margin:.3em 0 0;padding-left:20px;line-height:1.55"><li>Each indicator becomes a <b>heat</b> from 0 (calm) to 100 (most bubble-like) by a rule written next to it: where today ranks in its own history, or a stated threshold.</li>
   <li>Heat is averaged within each group, then the five groups are combined with weights of ${a.pillars.map((p) => p.key + " " + p.weight + "%").join(", ")}. The score you see is <b>100 minus the combined heat</b>, so higher is healthier.</li>
   <li>Indicators whose data is too old are shown but not counted. New quarterly figures appear within a day of the company's filing, because the engine checks the SEC every weekday morning and after the close.</li></ol>
   <p class="small" style="margin:10px 0 0"><b>Be clear about what is tested.</b> Groups A, B and C measure the real AI buildout (spending, supplier books, financing), but those series are only a few years long, so their weights are judgment, not statistics. Group D includes the original ten checks, which were backtested 1999-2026 (the old score: ${v1 == null ? "-" : v1}/100; when it fell to 75 or below, a 15%+ drop within 60 days was only about 1.7-2x as likely as normal). Group E is a statistical model that worked before 2018 and not after. <b>A hot score means the structure is fragile. It does not say when, or whether, anything breaks.</b> Bubbles can run for years.</p>
   ${typeof AUTH !== "undefined" && AUTH.owner ? `<p class="small" style="margin:8px 0 0"><a href="#/model">Prediction model v2: equations, evidence and stock risk scores →</a></p>` : ""}</div>
  ${typeof ownerDocCard === "function" ? ownerDocCard() : ""}
  <p class="small muted">Sources: SEC EDGAR (company facts, filings, full-text search, Form 4), Federal Reserve (H.8, loan-officer survey) via FRED, ICE BofA via FRED, Yahoo Finance. Educational information only. Not investment advice.</p>`;
}
