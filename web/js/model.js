// The prediction model (owner only): the equations, every coefficient, today's reading, and the complete out-of-sample record, including where it fails.
// Data: data/model/model.json (trained by engine/mtrain_final.py), market_now.json and stocks.json (scored nightly by engine/mscore.py). Facts and honest limits only.
const MD = { m: null, now: null, st: null };
async function mdLoad() {
  if (!MD.m) { [MD.m, MD.now, MD.st] = await Promise.all([loadJson("model/model.json"), loadJson("model/market_now.json"), loadJson("model/stocks.json")]); }
  return MD.m && MD.now ? MD : null;
}
const mdP = (v, d = 1) => (v == null ? "-" : (v * 100).toFixed(d) + "%");
const mdN = (v, d = 3) => (v == null ? "-" : (v >= 0 ? "" : "−") + Math.abs(v).toFixed(d));
const mdBar = (v, max, col) => `<span class="md-bar"><i style="width:${Math.min(100, Math.abs(v) / max * 100).toFixed(1)}%;background:${col}"></i></span>`;
const mdDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function mdChart(series, lines, { h = 190, pct = true } = {}) {
  const w = 700, pad = { l: 46, r: 12, t: 12, b: 24 }, n = series.d.length, all = lines.flatMap((l) => series[l.k]);
  let lo = Math.min(...all), hi = Math.max(...all); if (lo === hi) hi = lo + 1; const m = (hi - lo) * 0.08; lo = Math.max(0, lo - m); hi += m;
  const X = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b), fmt = (v) => (pct ? (v * 100).toFixed(0) + "%" : Math.round(v).toLocaleString());
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3), xs = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img">${ticks.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--mut)">${fmt(v)}</text>`).join("")}
    ${xs.map((i, j) => `<text x="${X(i).toFixed(1)}" y="${h - 7}" text-anchor="${j === 0 ? "start" : j === 4 ? "end" : "middle"}" font-size="10.5" fill="var(--mut)">${esc(series.d[i].slice(0, 7))}</text>`).join("")}
    ${lines.map((l) => `<polyline points="${series[l.k].map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ")}" fill="none" stroke="${l.c}" stroke-width="${l.w || 2}" stroke-linejoin="round" ${l.dash ? 'stroke-dasharray="5 4"' : ""}/>`).join("")}</svg>
    <div class="small" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">${lines.map((l) => `<span><i style="display:inline-block;width:14px;height:3px;background:${l.c};vertical-align:middle;margin-right:5px;border-radius:2px"></i>${esc(l.l)}</span>`).join("")}</div>`;
}

const mdMetric = (r) => (r ? `<td>${r.auc}</td><td>${r.brier}</td><td>${r.logloss}</td>` : '<td colspan="3" class="muted">-</td>');

async function modelPage() {
  if (!(typeof AUTH !== "undefined" && AUTH.owner)) return `<h1>Prediction model</h1><div class="card"><p>This page is for the site owner.</p></div>`;
  const d = await mdLoad();
  if (!d) return `<a href="#/watch" class="small">← AI Watch</a><h1>Prediction model</h1><div class="card muted">The model files aren't published yet. They are written by the nightly run.</div>`;
  const M = d.m.market, S = d.m.stock, now = d.now, eq = M.equation, st = M.structural, fr = M.fragility, sig = now.series;
  const epv = (yr, k) => { const e = M.episodes.find((x) => x.peak.startsWith(String(yr))); return e ? e[k] : null; }; const holdAUC = S.ladder[2].holdout.within_date_auc, dec = S.ladder[2].holdout.deciles, ratio = dec[0] > 0 ? dec[9] / dec[0] : null;
  const contribRows = fr.features.map((f) => { const c = now.contributions.find((x) => x.name === f.name) || {}; return { ...f, raw: c.raw, z: c.z, contribution: c.contribution || 0 }; });
  const maxC = Math.max(0.05, ...contribRows.map((r) => Math.abs(r.contribution)));
  const cal = st.calibration.map((c) => `<tr><td>${mdP(c.pred)}</td><td>${mdP(c.obs)}</td><td class="small muted">${c.n.toLocaleString()} days</td></tr>`).join("");
  const eps = M.episodes.map((e) => `<tr><td>${esc(e.peak)}</td><td>${(e.depth * 100).toFixed(0)}%</td><td>${mdP(e.p_at_peak)}</td><td>${mdP(e.p_30d_before)}</td><td>${mdP(e.p_60d_before)}</td><td>${e.fragility_at_peak == null ? '<span class="muted">before 2003</span>' : mdP(e.fragility_at_peak)}</td></tr>`).join("");
  const sc = (r) => `<tr><td><b>${esc(r.model)}</b></td><td>${r.n_features}</td>${mdMetric(r.design)}${mdMetric(r.holdout)}</tr>`;
  const stRows = S.features.map((f) => `<tr><td><b>${esc(f.name)}</b><div class="small muted">${esc(f.meaning)}</div></td><td>${f.sign}</td><td style="text-align:right">${mdN(f.coef, 3)} ${mdBar(f.coef, 0.6, f.coef >= 0 ? "var(--bad)" : "var(--ok)")}</td></tr>`).join("");
  const sl = S.ladder.map((r) => `<tr><td><b>${esc(r.model)}</b></td><td>${r.n_features}</td><td>${r.design.within_date_auc}</td><td>${mdP(r.design.deciles[0])} → ${mdP(r.design.deciles[9])}</td><td>${r.holdout.within_date_auc}</td><td>${mdP(r.holdout.deciles[0])} → ${mdP(r.holdout.deciles[9])}</td></tr>`).join("");
  const byYear = Object.entries(S.by_year_auc).map(([y, a]) => `<span class="pill" style="margin:2px">${y}: ${a}</span>`).join(" ");
  const sts = d.st ? Object.entries(d.st.stocks).filter(([, v]) => v.cap_b >= 10) : [];
  const hi = sts.sort((a, b) => b[1].p - a[1].p).slice(0, 12), lo = sts.slice().reverse().slice(0, 12);
  const row = ([s, v]) => `<tr><td><a href="#/stock/${esc(s)}"><b>${esc(s)}</b></a></td><td>${mdP(v.p)}</td><td>${(v.pct * 100).toFixed(0)}th</td><td class="small">${(v.drivers || []).map((x) => esc(x[0])).join(", ") || "-"}</td></tr>`;
  afterRender.push(() => {
    const inp = $("#mdsym"), out = $("#mdres"); if (!inp) return;
    const look = () => { const s = inp.value.trim().toUpperCase(), v = d.st && d.st.stocks[s]; out.innerHTML = !s ? "" : v ? mdStockHtml(s, v, S, d.st) : `<span class="muted small">No score for “${esc(s)}”.</span>`; };
    inp.oninput = look; look();
  });
  return `<a href="#/watch" class="small">← AI Watch</a><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h1 style="margin:6px 0">Prediction model, v${d.m.version}</h1><span class="pill w">Owner only</span></div>
  <p class="muted" style="margin-top:0">Built ${esc(d.m.trained)} from research on bubble and crash indicators, trained on Nasdaq-100 history since 1996 and ${S.n_stocks} large US stocks since the mid-1990s. Every number below is out of sample unless it says otherwise.</p>
  <div class="card big" style="border-left:5px solid var(--warn)"><h3 style="margin:0 0 6px">What the evidence says (plainly)</h3><ul style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>Which stocks are riskier than others: it works.</b> Each date, the tenth of stocks the model ranked riskiest fell 20% or more within 60 days <b>${mdP(dec[9], 0)}</b> of the time in the 2018-26 holdout, against <b>${mdP(dec[0], 0)}</b> for the safest tenth${ratio ? ` (${ratio.toFixed(0)}x)` : ""}. Almost all of that comes from volatility, which is a known result. The extra terms add very little (they are listed so you can see that).</li>
   <li><b>When the market will crash: it does not work, and this is the honest finding.</b> The probability from the volatility formula was well calibrated in 2003-17 (AUC ${st.design.auc}) but had no skill in the 2018-26 holdout (AUC ${st.holdout.auc}; Brier ${st.holdout.brier} versus ${st.base_holdout.brier} for just guessing the base rate). It gave ${mdP(epv(2021, "p_at_peak"), 0)} at the November 2021 peak and ${mdP(epv(2020, "p_at_peak"), 0)} at the February 2020 peak, just before drops of ${Math.abs(epv(2021, "depth") * 100).toFixed(0)}% and ${Math.abs(epv(2020, "depth") * 100).toFixed(0)}%.</li>
   <li><b>The bubble indicators (valuation, margin debt, breadth, credit, semiconductor leadership...).</b> As one combined index they scored AUC ${fr.design.auc} in 2003-17, which is good, and ${fr.holdout.auc} in 2018-26, which is chance. The index was highest (${mdP(epv(2007, "fragility_at_peak"), 0)}) at the October 2007 peak, a little above the typical ${mdP(eq.base_rate, 0)}. At the 2018, 2020, 2021 and 2025 peaks it read ${mdP(epv(2018, "fragility_at_peak"), 0)}, ${mdP(epv(2020, "fragility_at_peak"), 0)}, ${mdP(epv(2021, "fragility_at_peak"), 0)} and ${mdP(epv(2025, "fragility_at_peak"), 0)}: no higher than normal. They stay on the page as a diagnostic, but they are <b>not</b> part of the probability.</li>
   <li><b>Why:</b> there are only ${M.episodes.length} separate 15%-plus declines since 1996, valuations stayed extreme for years while prices kept rising, and the later drops had other triggers (Fed tightening in 2018, the pandemic, the 2022 rate-hike cycle, the 2025 tariff shock). A model fit to so few events can look brilliant in the past and fail on the next one.</li></ul></div>

  <h2>1. The market: today</h2>
  <div class="card big"><span class="pill g">As of ${esc(mdDay(now.asof))}</span><div class="strip" style="margin-top:8px"><div><div class="small muted">Chance the Nasdaq-100 closes 15% or more below today's level at some point in the next 60 trading days</div><div class="num" style="font-size:48px">${mdP(now.p)}</div><div class="small muted">Typical over history: ${mdP(eq.base_rate)}. Raw volatility formula: ${mdP(now.p_fp)}.</div></div>
   <div style="flex:1;min-width:240px"><div class="hz"><div class="card" style="padding:12px"><div class="small muted">Market volatility (EWMA, yearly)</div><b style="font-size:21px">${mdP(now.sigma_ann, 1)}</b></div><div class="card" style="padding:12px"><div class="small muted">Bubble-fragility index (diagnostic)</div><b style="font-size:21px">${mdP(now.fragility, 1)}</b></div></div></div></div>
   <p class="small muted" style="margin:10px 0 0">A probability, not a prediction. Even at 30% the odds are still 70% that no such drop happens.</p></div>
  <div class="card"><h3>Last 5 years</h3>${mdChart({ d: sig.d, p: sig.p, frag: sig.frag }, [{ k: "p", c: "var(--brand)", l: "Crash probability (volatility model)" }, { k: "frag", c: "var(--warn)", l: "Bubble-fragility index (diagnostic)", dash: true }])}
   <div style="margin-top:10px">${mdChart({ d: sig.d, price: sig.price }, [{ k: "price", c: "var(--tx)", l: "Nasdaq-100", w: 1.6 }], { h: 130, pct: false })}</div><p class="small muted" style="margin:8px 0 0">The dashed fragility line uses coefficients fitted on all history, so on past dates it looks better than it would have in real time. The out-of-sample record is in section 2.</p></div>

  <h2>2. The equation</h2>
  <div class="card"><h3>The probability (what the headline number is)</h3>
   <div class="md-eq">b = ln(1 − ${eq.drop}) = ${Math.log(1 - eq.drop).toFixed(4)}       μ = ${eq.mu_annual * 100}% / 252 per day       T = ${eq.h} days<br>σ²<sub>t</sub> = ${(1 - eq.ewma_alpha).toFixed(2)} · σ²<sub>t−1</sub> + ${eq.ewma_alpha} · r²<sub>t</sub>      (daily volatility of the Nasdaq-100, exponentially weighted)<br><br>
   P<sub>fp</sub> = Φ( (b − μT) / (σ<sub>t</sub>√T) ) + exp(2μb / σ<sub>t</sub>²) · Φ( (b + μT) / (σ<sub>t</sub>√T) )<br><br>logit(P) = ${mdN(eq.calib.a, 3)} + ${mdN(eq.calib.c, 3)} · logit(P<sub>fp</sub>)</div>
   <p class="small muted" style="margin:8px 0 0">The first line is the textbook probability that a random walk with drift touches a barrier within a window (the reflection principle); Φ is the normal curve. It is "how likely is a 15% fall if prices move as wildly as they have lately". The second line is a two-number correction fitted on history. <b>Today:</b> σ = ${mdP(now.sigma_ann / Math.sqrt(252), 2)} a day, so P<sub>fp</sub> = ${mdP(now.p_fp)} and P = ${mdP(now.p)}.</p></div>
  <div class="card"><h3>How it did: the full record</h3><div class="tw"><table><tr><th></th><th colspan="3">2003-2017 (used to design)</th><th colspan="3">2018-2026 (untouched holdout)</th></tr><tr><th>Model</th><th>AUC</th><th>Brier</th><th>Log loss</th><th>AUC</th><th>Brier</th><th>Log loss</th></tr>
   <tr><td><b>Volatility probability (shipped)</b></td>${mdMetric(st.design)}${mdMetric(st.holdout)}</tr><tr><td>Just guess the typical rate</td>${mdMetric(st.base_design)}${mdMetric(st.base_holdout)}</tr><tr><td>Bubble-fragility index (21 indicators)</td>${mdMetric(fr.design)}${mdMetric(fr.holdout)}</tr></table></div>
   <p class="small muted" style="margin:8px 0 0">AUC: 0.5 is a coin flip, 1.0 is perfect. Brier and log loss: lower is better. Each year is predicted using only data that ended at least 100 days before it (walk-forward). In 2018-26 the shipped model's scores are <i>worse</i> than guessing the typical rate, because 2018-26 had more crashes (${mdP(st.holdout.event_rate, 0)} of days) than the past it learned from.</p>
   <h4 style="margin:14px 0 4px">Does a 20% forecast mean 20%? (calibration, 2003-26)</h4><div class="tw"><table><tr><th>Model said</th><th>What happened</th><th></th></tr>${cal}</table></div>
   <h4 style="margin:14px 0 4px">Every 15% decline since 1996, and what the models said before it</h4><div class="tw"><table><tr><th>Peak</th><th>Fall</th><th>P at peak</th><th>30 days before</th><th>60 days before</th><th>Fragility at peak</th></tr>${eps}</table></div>
   <p class="small muted" style="margin:8px 0 0">The 2000 collapse was flagged at about ${mdP((M.episodes.find((e) => e.peak.startsWith("2000")) || {}).p_at_peak, 0)}. The decline from the November 2021 peak was not (${mdP(epv(2021, "p_at_peak"), 0)}).</p></div>

  <h2>3. The bubble indicators we researched</h2>
  <p class="muted" style="margin-top:-6px">Twenty-one indicators drawn from the literature and from the current AI-bubble debate, combined with a ridge logistic regression in which each one may only push risk in the direction the theory says. The fragility index is <b>P = σ(${mdN(fr.intercept, 3)} + Σ coefᵢ · zᵢ)</b>, where zᵢ is the indicator in standard deviations. It is a diagnostic: read the last two columns before trusting any row.</p>
  <div class="card"><div class="tw"><table><tr><th>Indicator</th><th>Sign</th><th>Today</th><th>z</th><th>Coef</th><th>Pushes today's index</th><th>Alone: AUC 2003-17</th><th>AUC 2018-26</th></tr>${contribRows.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.meaning)}</div></td><td>${r.sign}</td><td>${r.raw == null ? "-" : r.raw}</td><td>${r.z == null ? "-" : r.z}</td><td>${mdN(r.coef, 3)}</td><td>${mdBar(r.contribution, maxC, r.contribution >= 0 ? "var(--bad)" : "var(--ok)")} <span class="small">${mdN(r.contribution, 2)}</span></td><td>${r.auc_design}</td><td>${r.auc_holdout}</td></tr>`).join("")}</table></div>
   <p class="small muted" style="margin:8px 0 0">"AUC alone" is the single indicator's ability to rank days by later crash risk (0.5 = no information, sign-aligned). Valuation and margin debt look informative early and fade; that is the pattern the history shows.</p></div>
  <div class="card"><h3>What this research says that we could not test with numbers</h3><ul class="small" style="margin:0;padding-left:18px;line-height:1.55">
   <li><b>AI spending versus AI revenue.</b> Estimates of 2026 hyperscaler capex run to roughly $630-700 billion against tens to low hundreds of billions of AI revenue, and the gap is the core of the bubble argument. These figures vary a lot by source and have only a couple of years of history, so they cannot be fit statistically.</li>
   <li><b>Circular financing and debt.</b> Suppliers investing in customers who buy their chips (for example Nvidia and OpenAI), and capex funded more by borrowing than by cash flow. Real, but only observable for a handful of companies and a short time.</li>
   <li><b>The 1997-versus-1999 question.</b> Goldman's analysts are reported to argue that high valuations alone do not make a macro bubble; it also needs imbalances such as credit and leverage. One third-party tracker reports scoring 6 of 6 warning signs in December 1997, after which the Nasdaq tripled. Valuation says a lot about the next decade and almost nothing about the next quarter.</li>
   <li><b>Run-ups.</b> Greenwood, Shleifer and You (2019): when an industry doubles in two years, the odds of a later 40% crash rise sharply (from about 20% to about 50%), yet average returns are not lower, because some run-ups simply keep going. That fits what we see: crash <i>odds</i> rise, <i>timing</i> does not.</li>
   <li><b>Explosive-growth tests</b> (Phillips-Shi-Yu) flag bubble-like price paths but are known to lag; the <code>sadf</code> indicator above is a simple version of this idea.</li></ul></div>
  <div class="card"><h3>Does more complexity help? (market, free-sign logistic models, out of sample)</h3><div class="tw"><table><tr><th></th><th></th><th colspan="3">2003-2017</th><th colspan="3">2018-2026</th></tr><tr><th>Model</th><th>Terms</th><th>AUC</th><th>Brier</th><th>Log loss</th><th>AUC</th><th>Brier</th><th>Log loss</th></tr>${M.ladder.map(sc).join("")}</table></div><p class="small muted" style="margin:8px 0 0">Adding terms raised the 2003-17 AUC and made the Brier score worse: the model gets more confident without getting more right. That is why the shipped market probability has two fitted numbers, not twenty-one.</p></div>

  <h2>4. Individual stocks</h2>
  <div class="card"><h3>The equation</h3><div class="md-eq">P(stock falls ≥ ${S.drop * 100}% within ${S.horizon} trading days) = 1 / (1 + e<sup>−L</sup>)<br>L = ${mdN(S.intercept, 3)} + Σ βⱼ · zⱼ<br><br>zⱼ = each feature expressed in standard deviations <i>relative to other stocks on the same day</i> (capped at ±3)</div>
   <div class="tw" style="margin-top:8px"><table><tr><th>Feature</th><th>Expected sign</th><th style="text-align:right">β</th></tr>${stRows}</table></div>
   <p class="small muted" style="margin:8px 0 0">Ridge-penalized logistic regression on ${S.n_obs.toLocaleString()} stock-dates (every 5th trading day, ${esc(S.first_date.slice(0, 4))}-${esc(S.last_label_date.slice(0, 4))}). A coefficient is dropped if it contradicts the sign the research expects. Volatility terms carry most of the weight.</p></div>
  <div class="card"><h3>How it did, out of sample</h3><div class="tw"><table><tr><th>Model</th><th>Terms</th><th>2005-17 ranking AUC</th><th>Crash rate: safest → riskiest tenth</th><th>2018-26 ranking AUC</th><th>Crash rate: safest → riskiest tenth</th></tr>${sl}</table></div>
   <p class="small muted" style="margin:8px 0 0">"Ranking AUC" asks, on each date, whether stocks that later crashed were scored riskier than those that did not (0.5 = no skill). It averages 0.75-0.79 and does not fade in the holdout. By year (S3): ${byYear}</p>
   <p class="small" style="margin:8px 0 0"><b>Reading this honestly.</b> Volatility alone (S1) gets within 0.005 of the full model. The research on momentum, extension, run-ups and AI exposure holds up in the sense that the coefficients have the expected signs, but it does not add measurable prediction beyond volatility. If you want a simple rule that captures nearly all of the skill: <i>the more volatile a stock has been, the likelier it is to fall hard.</i></p></div>
  <div class="card"><h3>Look up a stock</h3><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="mdsym" placeholder="Symbol, e.g. NVDA" style="max-width:200px" aria-label="Stock symbol"><span class="small muted">Scored ${d.st ? esc(mdDay(d.st.asof)) : "-"}${d.st ? " · " + d.st.n.toLocaleString() + " stocks" : ""}</span></div><div id="mdres" style="margin-top:10px"></div></div>
  <div class="cards"><div class="card"><h3>Highest estimated risk</h3><p class="small muted" style="margin:0 0 6px">Companies worth $10B or more.</p><div class="tw"><table><tr><th>Stock</th><th>60-day risk</th><th>Rank</th><th>Main drivers</th></tr>${hi.map(row).join("")}</table></div></div>
   <div class="card"><h3>Lowest estimated risk</h3><p class="small muted" style="margin:0 0 6px">Companies worth $10B or more.</p><div class="tw"><table><tr><th>Stock</th><th>60-day risk</th><th>Rank</th><th>Main drivers</th></tr>${lo.map(row).join("")}</table></div></div></div>

  <h2>5. Limits you should know</h2>
  <div class="card"><ul class="small" style="margin:0;padding-left:18px;line-height:1.6">
   <li><b>Survivorship.</b> The stock model was trained on companies that are large today. Companies that collapsed and dropped out are missing, so crashes were rarer in the training data than in real life. The ranking is more trustworthy than the absolute percentages.</li>
   <li><b>Small samples at the market level.</b> Only ${M.episodes.length} separate 15%-plus declines since 1996. Confidence intervals on the market model are wide (see the AUC ranges in the saved validation). Treat any single reading as a hint.</li>
   <li><b>Design versus holdout.</b> Choices were made using 2003-17 only. The 2018-26 results were looked at once, after the design was frozen. Because I looked at the holdout for the market model before deciding what to ship, the market-level conclusion is "no demonstrated skill", not "tuned until it looked fine".</li>
   <li><b>Revisions and timing.</b> Economic series are today's revised values with publication lags applied. Real-time values were sometimes different.</li>
   <li><b>Large companies only.</b> Smaller stocks are scored by extending the same equation, which is an extrapolation (flagged "limited history" or "not validated" when it applies).</li>
   <li>The probabilities describe risk of a big fall, not direction or expected return. Nothing here is advice, a rating or a price target.</li></ul></div>`;
}

function mdStockHtml(sym, v, S, st) {
  const lvl = v.p >= 0.3 ? ["Very high", "var(--bad)"] : v.p >= 0.2 ? ["High", "var(--bad)"] : v.p >= 0.12 ? ["Above typical", "var(--warn)"] : v.p >= 0.07 ? ["Typical", "var(--mut)"] : ["Low", "var(--ok)"];
  return `<div class="strip"><div><div class="small muted">Chance ${esc(sym)} closes 20%+ below today at some point in 60 trading days (average market conditions)</div><div class="num" style="font-size:36px;color:${lvl[1]}">${mdP(v.p)}</div><b style="color:${lvl[1]}">${lvl[0]}</b> <span class="small muted">· riskier than ${(v.pct * 100).toFixed(0)}% of stocks scored</span></div>
   <div class="small" style="flex:1;min-width:220px"><div>Volatility (60-day, yearly): <b>${v.vol == null ? "-" : mdP(v.vol, 0)}</b></div><div>Beta to the Nasdaq-100: <b>${v.beta == null ? "-" : v.beta}</b></div><div>AI-factor beta (semis beyond the Nasdaq-100): <b>${v.aibeta == null ? "-" : v.aibeta}</b></div><div>From its 1-year high: <b>${v.dd == null ? "-" : mdP(v.dd, 1)}</b></div><div class="muted" style="margin-top:4px">Drivers: ${(v.drivers || []).map((x) => esc(x[0])).join(", ") || "none stand out"}</div>${v.limited ? '<div style="color:var(--warn);margin-top:4px">Limited history or missing inputs: treat with caution.</div>' : ""}${v.cap_b < 2 ? '<div style="color:var(--warn);margin-top:4px">Small company: the model was validated on larger ones.</div>' : ""}</div></div>`;
}

// A one-glance card on each stock page (owner only)
async function fillModel(sym) {
  const box = document.querySelector("#stkmodel"); if (!box || !(typeof AUTH !== "undefined" && AUTH.owner)) return;
  const d = await mdLoad(); if (!d || !d.st || !d.st.stocks[sym]) return;
  box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Crash-risk model <span class="pill w" style="font-size:10px">owner only</span></h3><a class="small" href="#/model">Equation and evidence →</a></div><div style="margin-top:8px">${mdStockHtml(sym, d.st.stocks[sym], d.m.stock, d.st)}</div><p class="small muted" style="margin:8px 0 0">Ranks stocks by how likely a 20% fall is. Validated for ranking, not for timing. Not advice.</p>`;
  box.hidden = false;
}
