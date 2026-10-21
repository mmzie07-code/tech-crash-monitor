// IPO tracker (Markets > IPOs): what priced recently, how it has traded since, and what's filed and waiting. Facts only, no ratings.
const ipoMoney = (v) => (v == null ? "-" : v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + "M" : "$" + Math.round(v).toLocaleString());
const ipoDay = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-");

function ipoView(sub) {
  const d = state.ipos;
  if (!d) return `<div class="card muted">IPO data isn't available right now.</div>`;
  const showSpacs = sub === "all", today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const s = d.stats, below = s.traded ? Math.round((s.below_offer / s.traded) * 100) : null;
  const nm = (r) => (r.sym && !r.spac ? `<a href="#/stock/${esc(r.sym)}"><b>${esc(r.sym)}</b></a> <span class="small muted">${esc(r.name)}</span>` : `<b>${esc(r.sym || "-")}</b> <span class="small muted">${esc(r.name)}${r.spac ? " · blank-check (SPAC)" : ""}</span>`);
  const priced = d.priced.filter((r) => showSpacs || !r.spac);
  const filed = d.filed.filter((r) => showSpacs || !r.spac);
  const lock = (r) => (r.spac ? '<span class="muted">-</span>' : r.lockup <= today ? '<span class="muted">ended</span>' : r.lockup <= soon ? `<b style="color:var(--warn)">${ipoDay(r.lockup)}</b>` : ipoDay(r.lockup));
  const pricedRows = priced.map((r) => `<tr><td>${ipoDay(r.date)}</td><td>${nm(r)}</td><td>${r.price != null ? "$" + r.price.toFixed(2) : "-"}</td><td>${ipoMoney(r.amount)}</td>
    <td>${r.perf ? pctTxt(r.perf.first_day_pct) : '<span class="muted">-</span>'}</td><td>${r.perf ? pctTxt(r.perf.now_pct) : '<span class="muted">-</span>'}</td><td>${lock(r)}</td></tr>`).join("");
  const upcoming = d.upcoming.filter((r) => showSpacs || !r.spac);
  const upBody = upcoming.length
    ? `<div class="tw"><table><tr><th>Expected</th><th>Company</th><th>Price range</th><th>Raising</th></tr>${upcoming.map((r) => `<tr><td>${ipoDay(r.date)}</td><td>${nm(r)}</td><td>${esc(r.price || "-")}</td><td>${ipoMoney(r.amount)}</td></tr>`).join("")}</table></div>`
    : `<p class="muted small" style="margin:0">Nothing is scheduled to price yet. The calendar usually fills in a week or two ahead, so check the filings waiting below to see what could come next.</p>`;
  const filedBody = filed.length
    ? `<div class="tw"><table><tr><th>Filed</th><th>Company</th><th>Planned raise</th></tr>${filed.slice(0, 40).map((r) => `<tr><td>${ipoDay(r.date)}</td><td>${nm(r)}</td><td>${ipoMoney(r.amount)}</td></tr>`).join("")}</table></div>`
    : `<p class="muted small" style="margin:0">No new filings in the last 60 days.</p>`;
  return `<div class="card big"><span class="pill g">IPO tracker</span><h2 style="margin-top:8px">${s.priced} companies went public in the last ${s.window_days} days</h2>
    <p class="muted" style="margin:6px 0 0">Together they raised about <b>${ipoMoney(s.raised)}</b>. ${s.median_first_day != null ? `The typical one closed its first day <b>${s.median_first_day > 0 ? "+" : ""}${s.median_first_day}%</b> from its offer price, and ${below != null ? `<b>${s.below_offer} of ${s.traded}</b> (${below}%) now trade <b>below</b> it` : ""}.` : ""}</p></div>
  <div class="card"><h3>Reading an IPO, in three ideas</h3>
   <p class="small" style="margin:0 0 8px"><b>The first-day pop is mostly spoken for.</b> Banks price the deal and hand shares to favored investors first. By the time ordinary buyers can trade, much of any pop has happened. Many IPOs drift down over the following months.</p>
   <p class="small" style="margin:0 0 8px"><b>Watch the lock-up date.</b> Insiders and early investors usually can't sell for about 180 days. When that ends, a lot of shares can come to market at once. The date shown below is the typical one; each deal sets its own, so check the company's prospectus.</p>
   <p class="small" style="margin:0"><b>SPACs are not normal IPOs.</b> A SPAC is a blank-check shell that raises money first and finds a company to buy later. They are hidden here by default.</p></div>
  <div class="card"><h3>Pricing soon</h3>${upBody}</div>
  <div class="card"><h3>Recently priced</h3>
   <p class="small muted" style="margin-top:0">"First day" is the close of the first trading day versus the offer price. "Since IPO" is the latest close versus the offer price. ${showSpacs ? `<a href="#/markets/ipos">Hide SPACs</a>` : `<a href="#/markets/ipos/all">Show SPACs too (${s.spacs})</a>`}</p>
   <div class="tw"><table><tr><th>Priced</th><th>Company</th><th>Offer</th><th>Raised</th><th>First day</th><th>Since IPO</th><th>Lock-up ends (typical)</th></tr>${pricedRows}</table></div></div>
  <div class="card"><h3>Filed and waiting</h3><p class="small muted" style="margin-top:0">Companies that have filed to go public in the last 60 days but haven't priced yet. Many will, some won't (${d.withdrawn_30d} withdrew in the last 30 days).</p>${filedBody}</div>
  <p class="small muted">${esc(d.disclaimer || "")} Updated ${esc((d.generated || "").slice(0, 10))}.</p>`;
}
