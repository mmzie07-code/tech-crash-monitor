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
  F: "The plumbing: liquidity, interest rates, volatility pricing, credit conditions and the real economy. Source: Federal Reserve, Treasury, Cboe, ICE via FRED and Yahoo Finance.",
  G: "Prices along the AI supply chain, from chip makers and equipment to power, servers and the most leveraged GPU cloud. These turn before the financial statements do. Source: Yahoo Finance.",
  H: "How loudly the bubble question is being asked: reader interest and headline tone. Noisy, so it carries the smallest weight. Source: Wikimedia, Google News.",
};
const aioPct = (x) => (x == null ? "-" : Math.round(x * 100) + "%");
const aioSign = (x, d = 1) => (x == null ? "-" : (x > 0 ? "+" : "") + x.toFixed(d) + "%");
const AIO_NAME = { MSFT: "Microsoft", GOOGL: "Alphabet", AMZN: "Amazon", META: "Meta", ORCL: "Oracle", NVDA: "NVIDIA", AMD: "AMD", AVGO: "Broadcom", MU: "Micron", FOMC: "Federal Reserve" };
const aioDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function aiOutlookHtml() {
  const o = state.aio; if (!o || !o.crash) return "";
  const c = o.crash, ev = o.events, bt = o.backtest || {}, sc = o.scenarios;
  const scColor = { "Sharp fall": "var(--bad)", Pullback: "#f97316", Range: "var(--mut)", Advance: "var(--ok)" };
  const story = (o.narrative || []).map((n) => `<div class="card"><h3>${esc(n[0])}</h3><p style="margin:0">${esc(n[1])}</p></div>`).join("");
  const scen = sc.map((x) => `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(x.name)}</b><span class="small muted">${esc(x.desc)}</span><b>${aioPct(x.p)}</b></div>
    <div class="aiw-bar" style="width:100%;height:10px"><i style="width:${Math.max(2, x.p * 100 * 1.8)}%;background:${scColor[x.name]}"></i></div></div>`).join("");
  const hz = o.horizons.map((h) => `<tr><td>${h.days} trading days</td><td>${aioSign(h.band68[0])} to ${aioSign(h.band68[1])}</td><td>${aioSign(h.band90[0])} to ${aioSign(h.band90[1])}</td></tr>`).join("");
  const up = ev.upcoming.map((u) => {
    const nm = u.sym === "FOMC" ? "Federal Reserve decision" : (AIO_NAME[u.sym] || u.sym) + " earnings";
    const st = u.stock ? `${aioSign(u.stock.stock[0], 0)} to ${aioSign(u.stock.stock[1], 0)}` : "-";
    return `<tr><td><b>${esc(nm)}</b><div class="small muted">${esc(aioDate(u.date))}, ${esc(u.when)} · in ${u.days} day${u.days === 1 ? "" : "s"}${u.eps != null ? " · consensus EPS $" + u.eps : ""}</div></td>
      <td>${u.sym === "FOMC" ? "-" : st}</td><td>${u.smh ? aioSign(u.smh[0]) + " to " + aioSign(u.smh[1]) : "-"}</td></tr>`;
  }).join("");
  const rec = ev.recent.map((r) => `<tr><td><b>${esc(r.kind === "FOMC" ? "Federal Reserve decision" : (AIO_NAME[r.what.split(" ")[0]] || r.what.split(" ")[0]) + " earnings")}</b><div class="small muted">${esc(aioDate(r.date))}</div></td>
    <td style="color:${r.ret < 0 ? "var(--bad)" : "var(--ok)"};font-weight:700">${aioSign(r.ret)}</td><td>${r.smh == null ? "-" : aioSign(r.smh)}</td><td>${aioSign(r.ndx)}</td><td class="small">${Math.abs(r.z) >= 2 ? "far bigger than normal" : Math.abs(r.z) >= 1.2 ? "bigger than normal" : "normal"}</td></tr>`).join("");
  const af = ev.aftershock, afRows = (af.buckets || []).map((b) => `<tr><td>${esc(b.name)}<div class="small muted">${b.n} past seasons</div></td>
    ${["h5", "h20", "h60"].map((k) => b[k] ? `<td>${aioSign(b[k].median)}<div class="small muted">up ${aioPct(b[k].up)} · t ${b[k].t_vs_all}</div></td>` : "<td>-</td>").join("")}</tr>`).join("") +
    `<tr><td><b>All seasons</b><div class="small muted">${af.n} seasons</div></td>${["h5", "h20", "h60"].map((k) => `<td>${aioSign(af.base[k].mean)} avg<div class="small muted">up ${aioPct(af.base[k].up)}</div></td>`).join("")}</tr>`;
  const studies = ev.studies.map((st) => { const a = st.assets.find((x) => x.asset === (st.key === "FOMC" ? "^NDX" : "self")); return a ? `<tr><td>${esc(st.label)}</td><td>${a.n}</td><td>±${a.mean_abs_move_pct}%</td><td>${aioSign(a.band10)} to ${aioSign(a.band90)}</td><td>${a.coverage ? aioPct(a.coverage.recent ?? a.coverage.all) : "-"}</td></tr>` : ""; }).join("");
  const an = o.analogs, anRows = an.rows.map((r) => `<tr><td>${esc(aioDate(r.d))} ${r.d.slice(0, 4)}</td><td>${r.dist}</td><td>${aioSign(r.r20)}</td><td>${aioSign(r.r60)}</td><td>${aioSign(r.dd)}</td></tr>`).join("");
  const covs = ev.studies.flatMap((st) => st.assets.map((a) => a.coverage && (a.coverage.recent ?? a.coverage.all))).filter((x) => x != null), covLo = Math.round(Math.min(...covs) * 100), covHi = Math.round(Math.max(...covs) * 100);
  const bd = bt["design 2003-2017"], bh = bt["holdout 2018-2026"], bb = bt.bands || {};
  const bandRow = (k, lab) => bb[k] ? `<tr><td>${lab}</td><td>${aioPct(bb[k].design.within68)} / ${aioPct(bb[k].design.within90)}</td><td>${aioPct(bb[k].holdout.within68)} / ${aioPct(bb[k].holdout.within90)}</td></tr>` : "";
  const heads = (state.aiw.headlines || []).slice(0, 8).map((h) => `<div class="item" style="align-items:flex-start"><div class="small muted" style="min-width:64px">${esc((h.date || "").slice(5, 11))}</div><div style="flex:1"><a href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a></div></div>`).join("");
  return `<h2 id="aiw-outlook" style="margin-top:1.4em">Market outlook: what the evidence implies</h2>
  <p class="muted" style="margin-top:-4px">Built from everything above plus the events that just happened and the ones coming. Updated ${esc(o.asof)}. It gives <b>odds and ranges, not a call</b>: the evidence below shows which parts have earned your trust and which have not.</p>
  <div class="cards">${story}</div>
  <div class="cards"><div class="card"><h3>Where the Nasdaq-100 could stand in 60 trading days</h3>${scen}
    <p class="small muted" style="margin:8px 0 0">Each bar is the average of two methods: how often similar past markets ended in that range, and a volatility-based distribution (current volatility ${(o.sigma_ann * 100).toFixed(0)}% a year).</p></div>
   <div class="card"><h3>Chance of a 15% fall within 60 days</h3><div style="font-size:34px;font-weight:800;margin:4px 0">${aioPct(c.ens15)}</div>
    <div class="small">Volatility barrier model <b>${aioPct(c.vol15)}</b> · Crash model v2 <b>${aioPct(c.v2_15)}</b> · typical stretch <b>${aioPct(o.base15)}</b></div>
    ${c.ai_adjusted15 != null ? `<div class="small" style="margin-top:6px">With the AI-Watch score as a modifier (our judgment, untested): <b>${aioPct(c.ai_adjusted15)}</b></div>` : ""}
    <p class="small muted" style="margin:8px 0 0">Chance of a 10% fall: ${aioPct(c.vol10)} by the volatility model.</p>
    <h3 style="margin-top:14px">Likely range</h3><div class="tw"><table class="aiw-t"><tr><th>Horizon</th><th>68% range</th><th>90% range</th></tr>${hz}</table></div>
    <p class="small muted" style="margin:6px 0 0">Ranges tested: see the evidence card below.</p></div></div>
  <div class="cards"><div class="card"><h3>Coming up: expected reaction</h3><div class="tw"><table class="aiw-t"><tr><th>Event</th><th>Stock: 80% range</th><th>Semis: 80% range</th></tr>${up || '<tr><td colspan="3" class="muted">No dated events found.</td></tr>'}</table></div>
    <p class="small muted" style="margin:6px 0 0">Two-day move around the release, taken from every past release of the same kind and rescaled to today's volatility. Direction is a coin flip; these show how big, not which way.</p></div>
   <div class="card"><h3>What just happened</h3><div class="tw"><table class="aiw-t"><tr><th>Event</th><th>Stock</th><th>Semis</th><th>Nasdaq-100</th><th>Versus normal</th></tr>${rec}</table></div></div></div>
  <div class="cards"><div class="card"><h3>After earnings sell-offs: what followed</h3><p class="small muted" style="margin:0 0 6px">Semiconductor ETF, median move after each reporting season, grouped by how semis reacted during it. t is the gap versus all seasons; under 2 means indistinguishable from chance.</p>
    <div class="tw"><table class="aiw-t"><tr><th>When semis...</th><th>+5 days</th><th>+20 days</th><th>+60 days</th></tr>${afRows}</table></div>
    ${af.current ? `<p class="small" style="margin:8px 0 0">Now: semis ${aioSign(af.current.ret)} across ${esc(aioDate(af.current.start))} to ${esc(aioDate(af.current.end))} (${af.current.z} standard deviations): bucket "${esc(af.current.bucket)}".</p>` : ""}</div>
   <div class="card"><h3>How big are earnings and Fed days?</h3><div class="tw"><table class="aiw-t"><tr><th>Event</th><th>Past</th><th>Typical move</th><th>80% range</th><th>Band held</th></tr>${studies}</table></div>
    <p class="small muted" style="margin:6px 0 0">"Band held": out of sample, how often the 80% range contained the real move (target 80%).</p></div></div>
  <div class="card"><h3>The news flow right now</h3><p class="small muted" style="margin:0 0 6px">Latest Google News headlines on Nvidia, AI stocks and the Nasdaq. Third-party links; the tone counts feed the Attention group.</p>${heads || '<p class="small muted">Unavailable right now.</p>'}</div>
  <details class="card"><summary style="cursor:pointer;font-weight:700">Historical rhymes (context only, not used in the odds)</summary>
   <p class="small muted">The ${an.rows.length} past market states most like today across ${an.features.length} measures (distance 0 = identical), and what followed. Test result: similar-looking markets were <b>not</b> followed by more or fewer 10% drops than usual (AUC ${bh ? bh.analog.auc : "-"} in the 2018-2026 holdout, where 0.5 is a coin flip), so this is shown as a way to see history, not to forecast.</p>
   <div class="tw"><table class="aiw-t"><tr><th>Date</th><th>Distance</th><th>20 days later</th><th>60 days later</th><th>Worst fall in the 60 days</th></tr>${anRows}</table></div></details>
  <details class="card" id="aio-method"><summary style="cursor:pointer;font-weight:700">Method, equations, complexity and evidence</summary>
   <div class="small" style="line-height:1.55">
   <p><b>1. Score.</b> Each indicator i becomes a heat h<sub>i</sub> ∈ [0,100] (percentile of its own history, or piecewise-linear anchors). Within group g: H<sub>g</sub> = Σ c<sub>i</sub>h<sub>i</sub> / Σ c<sub>i</sub> over fresh indicators (c = 1, or 0 when stale). Health = 100 − Σ<sub>g</sub> w<sub>g</sub>H<sub>g</sub> / Σ w<sub>g</sub>, with w = ${state.aiw.pillars.map((p) => p.key + " " + p.weight).join(", ")}.</p>
   <p><b>2. Volatility barrier.</b> σ from an EWMA of squared daily returns (λ = 0.94). The chance of touching a fall of d within T days is P = Φ((b − μT)/(σ√T)) + e<sup>2μb/σ²</sup> Φ((b + μT)/(σ√T)), where b = ln(1 − d) and μ is 8% a year (reflection principle).</p>
   <p><b>3. Crash model v2.</b> Ridge logistic regression on 21 indicators with theory-based sign constraints (equations on the owner page). <b>Headline odds</b> = ½(barrier + v2). Scenario odds = ½(analog distribution + lognormal at σ).</p>
   <p><b>4. Event reactions.</b> For each past release date t: z = ln(P<sub>t+1</sub>/P<sub>t−1</sub>) / (σ<sub>pre</sub>√2), with σ<sub>pre</sub> = 1.4826 · MAD of the prior 40 daily returns (ignores jumps). Today's range = [Q<sub>10</sub>(z), Q<sub>90</sub>(z)] · σ<sub>now</sub>√2. Release dates are SEC 8-K Item 2.02 filings; Fed dates come from the Fed's calendar. The aftershock study merges releases within 6 days into one observation so overlapping events are not double counted.</p>
   <p><b>5. Analogs.</b> Mahalanobis distance d² = (x − x<sub>q</sub>)ᵀ Σ⁻¹ (x − x<sub>q</sub>) over ${an.features.length} features (shrunk covariance), 15 nearest states at least 60 days apart, using only history whose outcome was already known.</p>
   <p><b>Complexity.</b> Daily run: O(N<sub>ind</sub>) for the score (about ${state.aiw.coverage.total} indicators), O(T) for volatility, O(N·d²) for one analog query (N ≈ 10,000 days, d = ${an.features.length}), O(E·log T) for the event studies (E ≈ 700 releases). The walk-forward backtest repeats the analog query about 1,000 times: O(Q·N·d²) ≈ 2×10⁹ operations, under a minute. The cost is dominated by downloads (about 50 MB from the SEC), not arithmetic.</p>
   <p><b>Evidence.</b> Tested walk-forward, using only information available at each date, 2003-2026:</p>
   <div class="tw"><table class="aiw-t"><tr><th>Component</th><th>2003-2017</th><th>2018-2026 (never used to tune)</th><th>Verdict</th></tr>
    <tr><td>Volatility-barrier ranking of 10% falls (AUC; 0.5 = chance)</td><td>${bd ? bd.vol.auc : "-"}</td><td>${bh ? bh.vol.auc + " (90% CI " + bh.vol.ci[0] + " to " + bh.vol.ci[1] + ")" : "-"}</td><td>Some skill early, not distinguishable from chance since 2018</td></tr>
    <tr><td>Analog ranking (AUC)</td><td>${bd ? bd.analog.auc : "-"}</td><td>${bh ? bh.analog.auc : "-"}</td><td>No skill: used for context only</td></tr>
    <tr><td>Return ranges for 5, 20 and 60 days (share of real moves inside the 68% / 90% bands)</td><td colspan="2" style="padding:0"><table class="aiw-t" style="width:100%">${bandRow("h5", "5 days")}${bandRow("h20", "20 days")}${bandRow("h60", "60 days")}</table></td><td>Well calibrated, including the holdout</td></tr>
    <tr><td>Event-reaction ranges (80% band)</td><td colspan="2">held ${covLo}% to ${covHi}% of the time out of sample, across event types</td><td>Well calibrated for size; direction is not predictable</td></tr>
    <tr><td>Earnings-season aftershocks</td><td colspan="2">No bucket differs from all seasons at |t| ≥ 2</td><td>No directional edge found</td></tr></table></div>
   <p class="muted"><b>Bottom line.</b> What we can forecast with evidence is <i>how big</i> moves are likely to be (volatility, event sizes). What we cannot forecast, after honest testing, is <i>when</i> a bubble breaks or which way an earnings shock leads. The structure score tells you how much damage a break would do; the ranges tell you how bumpy the next weeks are likely to be.</p></div></details>`;
}

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
  <p class="muted">Is there an AI bubble, and how hot is it? ${a.coverage.n} indicators in eight groups, from chipmaker receivables to bank loans to liquidity to SEC filings, plus an outlook for how markets may react to recent and coming events. Refreshed after every close and every weekday morning. Higher is healthier.</p>
  <div class="card big"><div class="strip" style="align-items:center;gap:26px"><div style="width:300px;max-width:100%">${gauge(h)}</div>
   <div style="flex:1;min-width:240px"><h2 style="margin:0 0 4px">${z[1]}: AI-buildout score ${h}</h2><p style="margin:0 0 8px">Heat is <b>${a.heat}</b> out of 100 (100 = every indicator at its most bubble-like). ${d7 ? delta(d7) + "." : "Trend history starts with today's reading."}${d30 ? " Month: " + delta(d30) + "." : ""}</p>
    <div class="small muted" style="margin-bottom:6px">What is pushing it up most:</div><div style="display:flex;gap:6px;flex-wrap:wrap">${drivers.map((i) => `<span class="pill" style="font-size:11.5px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${AIW_HEAT(i.heat)};margin-right:5px"></i>${esc(i.name)} ${Math.round(i.heat)}</span>`).join("")}</div>
    <p class="small muted" style="margin:10px 0 0">Updated ${esc(upd)}. ${a.coverage.n} of ${a.coverage.total} indicators are counted${a.stale && a.stale.length ? "; " + a.stale.length + " shown but not counted because their data is out of date" : ""}. Every indicator below shows when its data was last published.</p></div></div>
   ${ser.length > 3 ? `<div style="margin-top:10px"><div class="small muted">Heat over time (daily readings since ${esc(aiwDate(ser[0].d))})</div>${spark(ser.map((x) => x.heat))}</div>` : ""}</div>
  <div class="hz" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))">${pillarCards}</div>
  ${aiOutlookHtml()}
  <div class="cards"><div class="card"><h3>Newest filings from the buildout</h3><p class="small muted" style="margin:0 0 6px">Earnings, bond offerings, major agreements and leadership changes from Microsoft, Alphabet, Amazon, Meta, Oracle, NVIDIA, AMD, Broadcom, Micron and CoreWeave, straight from the SEC in the last 45 days.</p>${filings}</div>
   <div class="card"><h3>New filings that tie GPUs to borrowing</h3><p class="small muted" style="margin:0 0 6px">Prospectuses and 8-Ks where GPUs sit next to collateral, term loans or credit facilities. These are keyword matches; some are incidental.</p>${fin}</div></div>
  ${sections}
  <div class="card"><h3>How the score is built, and what it is not</h3><ol class="small" style="margin:.3em 0 0;padding-left:20px;line-height:1.55"><li>Each indicator becomes a <b>heat</b> from 0 (calm) to 100 (most bubble-like) by a rule written next to it: where today ranks in its own history, or a stated threshold.</li>
   <li>Heat is averaged within each group, then the eight groups are combined with weights of ${a.pillars.map((p) => p.key + " " + p.weight + "%").join(", ")}. The score you see is <b>100 minus the combined heat</b>, so higher is healthier.</li>
   <li>Indicators whose data is too old are shown but not counted. New quarterly figures appear within a day of the company's filing, because the engine checks the SEC every weekday morning and after the close.</li></ol>
   <p class="small" style="margin:10px 0 0"><b>Be clear about what is tested.</b> Groups A, B and C measure the real AI buildout (spending, supplier books, financing), but those series are only a few years long, so their weights are judgment, not statistics. Group D includes the original ten checks, which were backtested 1999-2026 (the old score: ${v1 == null ? "-" : v1}/100; when it fell to 75 or below, a 15%+ drop within 60 days was only about 1.7-2x as likely as normal). Group E is a statistical model that worked before 2018 and not after. <b>A hot score means the structure is fragile. It does not say when, or whether, anything breaks.</b> Bubbles can run for years.</p>
   ${typeof AUTH !== "undefined" && AUTH.owner ? `<p class="small" style="margin:8px 0 0"><a href="#/model">Prediction model v2: equations, evidence and stock risk scores →</a></p>` : ""}</div>
  ${typeof ownerDocCard === "function" ? ownerDocCard() : ""}
  <p class="small muted">Sources: SEC EDGAR (company facts, filings, full-text search, Form 4), Federal Reserve (H.8, loan-officer survey) via FRED, ICE BofA via FRED, Yahoo Finance. Educational information only. Not investment advice.</p>`;
}
