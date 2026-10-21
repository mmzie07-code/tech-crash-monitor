// Company page: "About" (3 to 8 sentences on what the company does) and "How today's economy could affect it" (5 sentences or fewer).
// The economy note is written by fixed rules from live market readings and the company's own balance sheet: no AI, and general tendencies, never predictions.
const ABOUT_SECTOR = {
  technology: "Technology companies are often valued on profits expected years from now, so high or rising yields tend to weigh on their shares, while falling yields tend to help.",
  communication: "Advertising and subscription income follow consumer and business spending, so a slowing economy can hurt these companies before interest rates do.",
  "consumer-discretionary": "People spend on non-essentials such as cars, travel, restaurants and home goods when they feel secure, so high borrowing costs and prices that squeeze households tend to slow sales.",
  "consumer-staples": "People keep buying food and household basics in any economy, so these stocks tend to hold up when growth slows, though rising costs can squeeze their profit margins.",
  financials: "Banks and insurers earn from the gap between what they pay for money and what they charge for it, so the shape of the yield curve and the number of loans going bad matter more than the headline interest rate.",
  "health-care": "Demand for health care changes little with the economy, so these stocks are often treated as defensive, although high yields can still weigh on companies valued on distant growth.",
  industrials: "Industrial companies sell to businesses that build and invest, so slowing growth, high borrowing costs and fuel prices can cut orders and squeeze margins.",
  energy: "Energy company profits follow oil and gas prices closely: higher prices lift revenue, and a fall in prices can hit profits quickly.",
  utilities: "Utilities pay steady dividends and carry heavy debt, so they behave a lot like bonds: rising yields make their dividends less attractive and their borrowing more expensive.",
  materials: "Materials companies sell commodities tied to global construction and manufacturing, so world growth and the dollar matter, and a stronger dollar tends to weigh on commodity prices.",
  "real-estate": "Property companies borrow heavily and are valued against bond yields, so high rates raise their financing costs and can lower property values, and mortgage rates shape housing demand.",
};
// Industry-specific notes (first match wins) used for the third sentence when they apply.
const ABOUT_INDUSTRY = [
  [/semiconductor/i, "Chipmakers rise and fall with business spending on computers and AI equipment, which is sensitive to growth and to borrowing costs."],
  [/airline|airport|air freight|cruise|lodging|hotel|travel/i, "Travel companies are hit by high fuel prices and by households cutting back on trips when money is tight."],
  [/homebuild|residential construction|building products|furnish|home improvement|mortgage/i, "Housing-related companies depend on mortgage rates, which set how much a buyer can afford each month."],
  [/bank|credit services|capital markets|insurance|asset management|brokerage/i, "Lenders are helped when they earn more on loans than they pay on deposits, and hurt when borrowers fall behind on payments."],
  [/\b(oil|gas|petroleum|coal|uranium)\b/i, "Producers are paid in dollars for a commodity that trades globally, so oil prices and the dollar both feed straight into profits."],
  [/\b(gold|silver|copper|steel|aluminum|chemicals|mining|lumber|paper)\b/i, "Prices for the raw materials it sells move with global demand, especially from construction and manufacturing."],
  [/\b(auto|trucks?|rvs?|motorcycles?)\b/i, "Vehicles are bought with loans, so interest rates and consumer confidence move demand quickly."],
  [/restaurant|retail|apparel|footwear|department|specialty|discount/i, "Store and restaurant traffic follows how much households have left to spend after housing, food and fuel."],
  [/biotech|drug|pharma|medical|health/i, "Drug and device sales change little with the economy, but small and unprofitable developers depend on access to cheap financing."],
  [/software|internet|information technology|data processing|computer/i, "Software and internet firms often sell subscriptions or ads, so business budgets and ad spending decide how fast they grow."],
];

const aboutB = (m) => (m == null ? null : Math.abs(m) >= 1000 ? "$" + (m / 1000).toFixed(m >= 100000 ? 0 : 1) + " billion" : "$" + Math.round(m) + " million");
const aboutDir = (v, small, big) => (v == null ? "" : v > big ? "rising fast" : v > small ? "rising" : v < -big ? "falling fast" : v < -small ? "falling" : "steady");

function economyNote(sector, industry, fin, capB, country) {
  const mk = (state.mk && state.mk.macro) || [], get = (s) => mk.find((r) => r.symbol === s);
  const y = get("^TNX"), oil = get("CL=F"), usd = get("DX-Y.NYB"), vix = get("^VIX");
  const mort = state.housing && state.housing.series && state.housing.series.m30 ? state.housing.series.m30.last[1] : null;
  const out = [];
  // 1. the backdrop, in numbers
  const bits = [];
  if (y) bits.push(`the 10-year Treasury yield is ${y.last.toFixed(2)}% (${aboutDir(y.m1, 0.1, 0.3)} over the past month)`);
  if (mort != null) bits.push(`a 30-year mortgage costs ${mort.toFixed(2)}%`);
  if (oil) bits.push(`oil is about $${Math.round(oil.last)} a barrel (${oil.y1 >= 0 ? "up" : "down"} ${Math.abs(oil.y1).toFixed(0)}% in a year)`);
  if (usd) bits.push(`the US dollar is ${aboutDir(usd.m1, 0.5, 1.5)} against other currencies`);
  if (vix) bits.push(`the VIX fear gauge is ${vix.last.toFixed(0)}, ${vix.last >= 25 ? "a nervous market" : vix.last >= 18 ? "a moderately cautious market" : "a calm market"}`);
  const some = bits.slice(0, 4), list = some.length > 1 ? some.slice(0, -1).join(", ") + ", and " + some[some.length - 1] : some[0];
  if (some.length) out.push("Right now " + list + ".");
  // 2. how this sector usually reacts
  if (ABOUT_SECTOR[sector]) out.push(ABOUT_SECTOR[sector]);
  // 3. an industry note if one applies, otherwise what today's readings mean for the sector
  const ind = ABOUT_INDUSTRY.find(([re]) => re.test(industry || ""));
  if (ind) out.push(ind[1]);
  else if (y && ["technology", "utilities", "real-estate", "communication"].includes(sector)) out.push(`With yields at ${y.last.toFixed(2)}%, investors can earn a lot without owning stocks, which is a headwind for companies like this one.`);
  else if (oil && sector === "energy") out.push(`With oil ${oil.y1 >= 0 ? "well above" : "below"} where it was a year ago, revenue ${oil.y1 >= 0 ? "has had a tailwind" : "is under pressure"}.`);
  else if (oil && ["industrials", "consumer-discretionary", "materials"].includes(sector)) out.push(`Oil at about $${Math.round(oil.last)} raises fuel and shipping costs, which can squeeze margins.`);
  else if (y) out.push(`Higher yields make borrowing more expensive for households and businesses, which can slow demand across the economy.`);
  // 4. this company's own exposure
  const parts = [], capM = capB ? capB * 1000 : null;
  if (fin && fin.debt != null) {
    const cash = fin.cash || 0, cover = fin.ocf > 0 ? fin.debt / fin.ocf : null;
    if (fin.debt < 1) parts.push("it has almost no debt, so higher interest rates barely touch its finances");
    else if (cash >= fin.debt) parts.push(`it holds more cash (${aboutB(cash)}) than debt (${aboutB(fin.debt)}), which cushions it if borrowing stays expensive`);
    else parts.push(`it owes about ${aboutB(fin.debt)} against ${aboutB(cash)} of cash${cover != null ? `, roughly ${cover.toFixed(1)} years of its yearly operating cash flow` : ""}, so borrowing costs matter ${cover != null && cover > 4 ? "a lot" : "more than for a debt-free company"}`);
  }
  if (fin && fin.beta != null) parts.push(Math.abs(fin.beta - 1) < 0.1 ? `its beta of ${fin.beta.toFixed(2)} means its shares have tended to move in line with the overall market` : `its beta of ${fin.beta.toFixed(2)} means its shares have tended to move about ${fin.beta.toFixed(1)} times as much as the overall market`);
  if (country && country !== "United States") parts.push(`it is based in ${country}, so exchange rates affect the dollar value of its profits`);
  if (parts.length) out.push("At the company level, " + parts.join("; ") + ".");
  // 5. keep it honest
  out.push("These are general tendencies, not predictions, and news about the company itself often matters more.");
  return out.slice(0, 5);
}

async function fillAbout(sym, name, sector, capB) {
  const box = document.querySelector("#stkabout"), eco = document.querySelector("#stkeco"); if (!box) return;
  let a = null;
  try { const r = await fetch((DATA_BASE || "data/") + "about/" + encodeURIComponent(sym) + ".json"); if (r.ok) a = await r.json(); } catch (e) {}
  if (a && a.desc && a.desc.length) {
    const meta = [a.industry, a.employees ? "about " + a.employees.toLocaleString() + " employees" : null, [a.city, a.country].filter(Boolean).join(", ") || null].filter(Boolean);
    box.innerHTML = `<h3 style="margin-bottom:6px">About ${esc(name)}</h3><p style="margin:0 0 8px">${a.desc.map(esc).join(" ")}</p>
      ${meta.length ? `<p class="small muted" style="margin:0">${meta.map(esc).join(" · ")}${a.url && /^https?:/.test(a.url) ? ` · <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Company website</a>` : ""}</p>` : ""}
      <p class="small muted" style="margin:6px 0 0">Business description from the company's regulatory filings, via ${esc(a.source || "Yahoo Finance")}.</p>`;
  } else {
    box.innerHTML = `<h3 style="margin-bottom:6px">About ${esc(name)}</h3><p class="muted" style="margin:0">${esc(name)}${sector ? " is in the " + esc(SECTOR_NAME(sector)) + " sector" : ""}. A full description for this company will appear here soon; they are added a few hundred a night, largest companies first.</p>`;
  }
  if (eco) {
    const notes = economyNote(sector, a && a.industry, a && a.fin, capB, a && a.country);
    eco.innerHTML = `<h3 style="margin-bottom:6px">How today's economy could affect it</h3><p style="margin:0">${notes.map(esc).join(" ")}</p>`;
  }
}
