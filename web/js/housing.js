// Markets > Housing: mortgage rates, prices, sales and building activity; builder and landlord stocks; what public property companies are doing (SEC filings);
// and a live feed of big property deals in the news. Built nightly by engine/housing.py. Facts only, no forecasts or advice.
const HS_ORDER = ["m30", "cs", "median", "existing", "newsales", "supply", "starts", "permits", "rent"];
const HS_DEC = { pct: 2, usd: 0, count: 0, thousands: 0, months: 1, index: 1 };
const HS_READ = {
  m30: "When this rises, the monthly payment on the same house rises with it, which prices some buyers out and slows sales.",
  cs: "Prices change slowly and turn after rates and sales do. A flat line while sales fall means few people are selling, not that demand is strong.",
  median: "Reported once a quarter, so it trails. Compare it with the Case-Shiller line, which tracks the same homes over time.",
  existing: "Most homes sold are resales. When rates jump, owners with cheap old mortgages hold on, so fewer homes come to market.",
  newsales: "New homes sold, mostly by large builders, who can cut prices or pay down mortgage rates to attract buyers.",
  supply: "Above about 6 months, builders have more homes than buyers and tend to cut prices. Below 4, buyers compete.",
  starts: "Builders start homes when they expect to sell them, so this reflects their confidence.",
  permits: "Permits come before starts. A turn here often shows up in builders' plans a few months later.",
  rent: "Rent rising faster than prices can push people to buy; the reverse can push them to keep renting.",
};
const HS_NEWS = [["homes", "Big home sales", "record home sale mansion"], ["commercial", "Commercial deals", "commercial real estate sale billion"], ["reits", "Landlords & REITs", "REIT acquisition portfolio"], ["market", "Market & rates", "housing market home sales mortgage rates"]];
let HS_NEWS_ON = "homes";

const hsDay = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 864e5);
const hsPct = (v) => (v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(1) + "%");
const hsCol = (v) => (v > 0 ? "var(--ok)" : v < 0 ? "var(--bad)" : "var(--mut)");
const hsPctTxt = (v) => `<span style="color:${hsCol(v)};font-weight:600">${hsPct(v)}</span>`;
const hsSpark = (c) => { const lo = Math.min(...c), hi = Math.max(...c), up = c[c.length - 1] >= c[0];
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:84px;height:28px;display:block"><polyline fill="none" stroke="${up ? "var(--ok)" : "var(--bad)"}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${c.map((y, i) => `${(i / (c.length - 1) * 100).toFixed(1)},${(28 - ((y - lo) / (hi - lo || 1)) * 26).toFixed(1)}`).join(" ")}"/></svg>`; };

function hsSpanYears(s) { return (new Date(s.pts[s.pts.length - 1][0]) - new Date(s.pts[0][0])) / (365.25 * 864e5); }
function hsMount(key, years) {
  const s = state.housing.series[key], el = document.getElementById("hs_" + key); if (!s || !el) return;
  const cut = years ? new Date(Date.now() - years * 365.25 * 864e5).toISOString().slice(0, 10) : "0000";
  const pts = s.pts.filter((p) => p[0] >= cut);
  if (pts.length < 2) { el.innerHTML = `<p class="muted small">Not enough data to chart.</p>`; return; }
  mountChart(el, { t: pts.map((p) => hsDay(p[0])), c: pts.map((p) => p[1]) }, { money: s.unit === "usd", unit: s.unit === "pct" ? "yield" : "level", noRanges: true, decimals: HS_DEC[s.unit] != null ? HS_DEC[s.unit] : 2, rangeName: years ? years + (years === 1 ? " year" : " years") : "the full period" });
  document.querySelectorAll(`[data-hsr="${key}"] button`).forEach((b) => b.classList.toggle("on", +b.dataset.y === (years || 0)));
}

async function hsLoadNews(cat) {
  HS_NEWS_ON = cat; const box = document.querySelector("#hsnews"); if (!box) return;
  document.querySelectorAll("[data-hsn]").forEach((b) => b.classList.toggle("on", b.dataset.hsn === cat));
  const q = HS_NEWS.find((x) => x[0] === cat)[2];
  if (!liveOK()) { box.innerHTML = `<p class="small" style="margin:0"><a href="https://news.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">Search the latest news →</a></p>`; return; }
  box.innerHTML = `<p class="small muted" style="margin:0">Loading…</p>`;
  try {
    const j = await liveGet("action=news&q=" + encodeURIComponent(q));
    if (HS_NEWS_ON !== cat) return;
    box.innerHTML = j.items.length ? j.items.map((i) => `<div class="item"><div><a href="${/^https?:/.test(i.link) ? esc(i.link) : "#"}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a><div class="small muted">${esc(i.source)}${i.published ? " · " + esc(i.published.slice(0, 16)) : ""}</div></div></div>`).join("") : `<p class="muted small" style="margin:0">No recent headlines found.</p>`;
  } catch (e) { if (HS_NEWS_ON === cat) box.innerHTML = `<p class="small" style="margin:0">Couldn't load headlines just now. <a href="https://news.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">Search the latest news →</a></p>`; }
}

function housingView() {
  const d = state.housing;
  if (!d || !d.series || !Object.keys(d.series).length) return `<div class="card muted">Housing data isn't available right now. It's updated each night.</div>`;
  const S = d.series, P = d.payment;
  afterRender.push(() => {
    HS_ORDER.forEach((k) => { if (S[k]) { const sp = hsSpanYears(S[k]); hsMount(k, sp > 5.5 ? 5 : 0); } });
    document.querySelectorAll("[data-hsr] button").forEach((b) => b.onclick = () => hsMount(b.parentElement.dataset.hsr, +b.dataset.y || 0));
    document.querySelectorAll("[data-hsn]").forEach((b) => b.onclick = (e) => { e.preventDefault(); hsLoadNews(b.dataset.hsn); });
    hsLoadNews(HS_NEWS_ON);
  });
  const tile = (label, val, sub) => `<div class="card"><div class="small muted">${label}</div><b style="font-size:20px">${val}</b><div class="small muted">${sub}</div></div>`;
  const yr = (s, f) => (s && s.year_ago != null ? `${f(s.year_ago)} a year ago` : "");
  const tiles = [
    S.m30 && tile("30-year mortgage rate", S.m30.last[1].toFixed(2) + "%", yr(S.m30, (v) => v.toFixed(2) + "%")),
    P && tile("Monthly payment, median home", "$" + P.monthly.toLocaleString(), P.monthly_year_ago ? "$" + P.monthly_year_ago.toLocaleString() + " a year ago" : "20% down, loan only"),
    S.cs && tile("Home prices vs a year ago", hsPctTxt(S.cs.change_1y), "Case-Shiller, through " + S.cs.last[0].slice(0, 7)),
    S.existing && tile("Existing-home sales", (S.existing.last[1] / 1e6).toFixed(2) + "M a year", hsPct(S.existing.change_1y) + " vs a year ago"),
    S.supply && tile("New homes for sale", S.supply.last[1].toFixed(1) + " months", "of supply (about 6 is balanced)"),
    S.permits && tile("Building permits", Math.round(S.permits.last[1]).toLocaleString() + "K a year", hsPct(S.permits.change_1y) + " vs a year ago"),
  ].filter(Boolean).join("");
  const story = (d.story || []).map((x) => `<p style="margin:0 0 8px;padding-left:12px;border-left:3px solid ${x.tone === "warn" ? "var(--warn)" : "var(--line)"}">${esc(x.text)}</p>`).join("");
  const chart = (k) => { const s = S[k]; if (!s) return ""; const sp = hsSpanYears(s), opts = [[1, "1 year"], [5, "5 years"], [10, "10 years"], [0, "All"]].filter(([y]) => y === 0 || y < sp - 0.4);
    return `<div class="card"><h3 style="margin-bottom:2px">${esc(s.label)}</h3><p class="small muted" style="margin:0 0 6px">${esc(s.desc)}</p>
      <div class="chr" data-hsr="${k}" style="margin:6px 0 4px">${opts.map(([y, l]) => `<button data-y="${y}">${l}</button>`).join("")}</div><div id="hs_${k}"></div>
      <p class="small" style="margin:6px 0 0"><b>How to read it:</b> ${esc(HS_READ[k] || "")}</p></div>`; };
  const groups = [...new Set((d.market || []).map((m) => m.group))];
  const market = groups.length ? groups.map((g) => `<h4 style="margin:14px 0 4px">${esc(g)}</h4><div class="tw"><table><tr><th>Name</th><th>3 months</th><th>Price</th><th>1 month</th><th>3 months</th><th>1 year</th></tr>
    ${d.market.filter((m) => m.group === g).map((m) => `<tr style="cursor:pointer" onclick="location.hash='#/stock/${esc(m.sym)}'"><td><a href="#/stock/${esc(m.sym)}"><b>${esc(m.sym)}</b></a> <span class="small muted">${esc(m.name)}</span></td><td>${hsSpark(m.spark)}</td><td>$${m.price.toLocaleString()}</td><td>${hsPctTxt(m.m1)}</td><td>${hsPctTxt(m.m3)}</td><td>${hsPctTxt(m.y1)}</td></tr>`).join("")}</table></div>`).join("") : `<p class="muted small">Market data isn't available right now.</p>`;
  const mv = d.moves;
  const moves = !mv || !mv.ok ? `<p class="muted small" style="margin:0">This list is filled in by the nightly update and will appear after its next run.</p>`
    : mv.items.length ? `<div class="tw"><table><tr><th>Filed</th><th>Company</th><th>What happened</th><th></th></tr>${mv.items.map((m) => `<tr><td>${ipoDay(m.date)}</td><td><a href="#/stock/${esc(m.sym)}"><b>${esc(m.sym)}</b></a> <span class="small muted">${esc(m.name)}</span></td><td class="small">${esc(m.what)}</td><td><a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" class="small">Read the filing →</a></td></tr>`).join("")}</table></div>`
    : `<p class="muted small" style="margin:0">None of the ${mv.companies} real estate companies and homebuilders we watch filed a completed deal or large-holder notice in the last ${mv.days} days.</p>`;
  return `<div class="card big"><span class="pill g">Housing</span><h2 style="margin-top:8px">The housing market, in plain English</h2>
    <div style="margin-top:10px">${story}</div></div>
   <div class="hz">${tiles}</div>
   <div class="card"><h3>Why housing matters to everything else</h3>
    <p class="small" style="margin:0 0 8px"><b>Rates set the price of a house each month.</b> The same home costs hundreds of dollars more a month when the mortgage rate climbs. That is why sales fall first, and prices only later.</p>
    <p class="small" style="margin:0 0 8px"><b>Builders and permits lead; prices lag.</b> Homebuilder stocks, permits and new-home supply turn before the price index does.</p>
    <p class="small" style="margin:0">Housing is the largest asset most families own and a big part of the economy, so it connects to banks, spending and jobs. See <a href="#/learn/3">Lesson 3</a> on interest rates.</p></div>
   <h2 style="margin-top:1.2em">The numbers</h2>${HS_ORDER.map(chart).join("")}
   <div class="card"><h3>Housing stocks and funds</h3><p class="small muted" style="margin-top:0">How the companies that build, sell and own property have traded. Markets look ahead, so they often move before the housing data does. Tap a row for its chart.</p>${market}</div>
   <div class="card"><h3>What public property companies are doing</h3><p class="small muted" style="margin-top:0">From SEC filings by real estate companies and homebuilders. An <b>8-K Item 2.01</b> reports a <i>completed</i> purchase or sale of a significant asset. A <b>13D</b> means an investor has built a stake over 5% and says what it intends to do with it. Smaller deals aren't required to be filed this way, and private buyers don't appear here at all.</p>${moves}</div>
   <div class="card"><h3>Big deals in the news</h3><p class="small muted" style="margin-top:0">Headlines about large property sales, from news publishers. Titles and links only; click through to read the story.</p>
    <div class="tabs" style="margin:8px 0">${HS_NEWS.map(([k, l]) => `<a href="#" data-hsn="${k}" class="${k === HS_NEWS_ON ? "on" : ""}" onclick="return false">${l}</a>`).join("")}</div><div id="hsnews"></div></div>
   <p class="small muted">${esc(d.disclaimer || "")} Updated ${esc((d.generated || "").slice(0, 10))}.</p>`;
}
