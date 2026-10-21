// Extra sections on the Real Estate sector page: what's inside the sector, how each kind of property business makes money, today's housing backdrop,
// and how to analyze a REIT. Static explanations plus live numbers from the sector data and the nightly housing file. Facts only.
const RE_TYPES = [
  ["Residential (apartments and rental homes)", "Collects rent from tenants.", "Rent growth, how full the buildings are, and how many new apartments are being built nearby. High mortgage rates push more people to rent, which tends to help.", ["EQR", "AVB", "MAA", "ESS", "UDR", "CPT", "INVH", "AMH"]],
  ["Industrial (warehouses and logistics)", "Leases warehouses and distribution centers to shippers and online retailers.", "Online shopping and trade volumes. Long leases give steady income, but new supply can cap rent growth.", ["PLD", "EXR", "REXR", "FR"]],
  ["Retail (shopping centers and malls)", "Leases space to stores and restaurants.", "Consumer spending and store closings. Centers anchored by grocery stores have held up better than enclosed malls.", ["SPG", "O", "KIM", "REG", "FRT", "NNN"]],
  ["Office", "Leases space to companies.", "Remote work and the economy. Offices have struggled as leases come up for renewal and vacancy rises, and many carry large loans that must be refinanced at today's higher rates.", ["BXP", "VNO", "KRC", "ARE"]],
  ["Healthcare (senior housing, medical offices, labs)", "Leases or operates senior housing and medical buildings.", "An aging population supports demand; operator health and labor costs decide how much profit is left.", ["WELL", "VTR", "DOC", "OHI"]],
  ["Data centers and cell towers", "Leases space and power for servers, or space on towers for wireless carriers.", "Cloud and AI spending drives data centers; towers depend on a few carriers renewing contracts. Both are expensive to build and sensitive to interest rates.", ["EQIX", "DLR", "AMT", "CCI", "SBAC", "IRM"]],
  ["Self-storage", "Rents storage units month to month.", "Moving activity and home sales: when fewer people move, demand softens. Short rental terms let owners raise prices quickly, in both directions.", ["PSA", "EXR", "CUBE", "NSA"]],
  ["Hotels and lodging", "Earns room revenue, often by owning hotels run by other brands.", "Travel demand and the economy: income rises and falls within months, much faster than other property types.", ["HST", "PK", "RHP"]],
  ["Real estate services", "Earns commissions and fees from brokerage, listings, data and property management (these are not landlords).", "Transaction volume. When high rates freeze sales, commissions and listing revenue fall.", ["CBRE", "CSGP", "Z", "JLL", "CWK", "COMP"]],
];

function realEstateExtra(s) {
  const top = s.top || [], inSector = new Set(top.map((t) => t.symbol));
  // 1. what's inside the sector, from the real data
  const groups = {};
  top.forEach((t) => { const g = t.industry || "Other"; (groups[g] = groups[g] || { n: 0, cap: 0, w: 0, names: [] }); const x = groups[g]; x.n++; x.cap += t.cap_b || 0; x.w += (t.cap_b || 0) * (t.d1 || 0); x.names.push(t); });
  const rows = Object.entries(groups).sort((a, b) => b[1].cap - a[1].cap).map(([g, x]) => {
    const lead = x.names.sort((a, b) => b.cap_b - a.cap_b).slice(0, 3).map((t) => `<a href="#/stock/${esc(t.symbol)}">${esc(t.symbol)}</a>`).join(", ");
    return `<tr><td><b>${esc(g)}</b></td><td>${x.n}</td><td>${capStr(x.cap)}</td><td>${x.cap ? pctTxt(x.w / x.cap) : "-"}</td><td class="small">${lead}</td></tr>`; }).join("");
  const inside = `<div class="card"><h3>What's inside this sector</h3><p class="small muted" style="margin-top:0">The 50 largest companies grouped by type of business. "Today" is the group's average move, weighted by size. Most are REITs (real estate investment trusts): companies that own property and, by law, pass most of their taxable income to shareholders as dividends.</p>
    <div class="tw"><table><tr><th>Type of business</th><th>Companies</th><th>Combined value</th><th>Today</th><th>Largest</th></tr>${rows}</table></div></div>`;
  // 2. how each kind of property business works
  const types = `<div class="card"><h3>How each kind of property company makes money</h3>${RE_TYPES.map(([name, how, drives, ex]) => { const have = ex.filter((e) => inSector.has(e)); return `<div class="item" style="display:block"><b>${esc(name)}</b>
     <div class="small"><b>How it earns:</b> ${esc(how)}</div><div class="small"><b>What moves it:</b> ${esc(drives)}</div>${have.length ? `<div class="small muted">In the 50 largest: ${have.map((e) => `<a href="#/stock/${esc(e)}">${esc(e)}</a>`).join(", ")}</div>` : ""}</div>`; }).join("")}
    <p class="small muted" style="margin:8px 0 0">Mortgage REITs are a different animal: they own loans, not buildings, and earn the gap between what they borrow at and lend at. They are very sensitive to interest-rate swings.</p></div>`;
  // 3. today's backdrop, from the nightly housing file
  const H = state.housing, S = H && H.series;
  const tile = (l, v, sub) => `<div class="card"><div class="small muted">${l}</div><b style="font-size:20px">${v}</b><div class="small muted">${sub}</div></div>`;
  const backdrop = S && S.m30 ? `<div class="card"><h3>The backdrop right now</h3><p class="small muted" style="margin-top:0">Property companies are valued against interest rates, and home prices and sales set the tone for residential and housing-related businesses.</p>
    <div class="hz">${tile("30-year mortgage rate", S.m30.last[1].toFixed(2) + "%", S.m30.year_ago != null ? S.m30.year_ago.toFixed(2) + "% a year ago" : "")}${H.payment ? tile("Monthly payment, median home", "$" + H.payment.monthly.toLocaleString(), "20% down, loan only") : ""}${S.cs ? tile("Home prices vs a year ago", pctTxt(S.cs.change_1y), "Case-Shiller") : ""}${S.supply ? tile("New homes for sale", S.supply.last[1].toFixed(1) + " months", "of supply") : ""}</div>
    <p style="margin:10px 0 0"><a class="btn ghost" href="#/markets/housing">See the full housing market page →</a></p></div>` : "";
  // 4. how to analyze one
  const howto = `<div class="card"><h3>How to analyze a real estate company</h3>
    <p class="small" style="margin:0 0 8px"><b>Look at FFO, not earnings.</b> Buildings are depreciated on paper even when they gain value, which makes net income look too low. FFO (funds from operations) adds depreciation back and is the figure REITs report and investors compare. Price divided by FFO plays the role of the P/E ratio.</p>
    <p class="small" style="margin:0 0 8px"><b>Check that the dividend is covered.</b> A REIT must pay out at least 90% of its taxable income, so dividends are a big part of the return. The payout as a share of FFO tells you how much room is left: close to 100% leaves none if rents dip.</p>
    <p class="small" style="margin:0 0 8px"><b>Watch occupancy, rent growth and lease length.</b> Full buildings with rents rising faster than costs is the good case. Look at when leases expire: a big batch coming due in a weak market is a risk.</p>
    <p class="small" style="margin:0 0 8px"><b>Look at debt and when it comes due.</b> Property is bought with borrowed money. A company that must refinance a lot of debt at today's higher rates will see its costs jump. Compare interest costs with income, and check how soon the loans mature.</p>
    <p class="small" style="margin:0"><b>Know the tax treatment.</b> Most REIT dividends are taxed as ordinary income, not at the lower rate for qualified dividends, which matters for anyone holding them in a regular (taxable) account. Not tax advice.</p></div>`;
  return inside + types + backdrop + howto;
}
