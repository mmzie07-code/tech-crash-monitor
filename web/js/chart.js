// Interactive line chart: hover/touch to scrub, range buttons, green/red by direction. No libraries.
// Live data (signed-in users): 1D = every minute, 1W = 5-minute, 1M = 30-minute, 3M = hourly. Longer ranges use daily closes.
// While the market is open the chart refreshes itself and shows a blinking dot on the latest price.
// Dots are HTML circles layered on the chart (never SVG shapes), so they stay perfectly round at any screen width.
// Candlesticks (with zoom) are drawn by the separate engine in candles.js.
const RANGES = [
  { l: "1D", live: "1d" }, { l: "1W", live: "5d" }, { l: "1M", live: "1mo", days: 30 }, { l: "3M", live: "3mo", days: 91 },
  { l: "6M", days: 182 }, { l: "YTD", days: "ytd" }, { l: "1Y", days: 365 }, { l: "5Y", days: "all" }];
const LIVE_FRESH_SECONDS = 10 * 60;   // data newer than this means the market is open (works for holidays and 24/7 assets like Bitcoin)
const POLL_MS = 20000;
const dayToDate = (t) => new Date(Date.UTC(2000, 0, 1) + t * 864e5);
const utcDay = (ts) => Math.floor(ts / 86400) - 10957;           // unix seconds -> days since 2000-01-01
const fmtDate = (t) => dayToDate(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtStamp = (ts) => new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

function startIndex(t, r) {
  const n = t.length, last = t[n - 1];
  if (typeof r === "number") { const i = t.findIndex((x) => x >= last - r); return i < 0 ? 0 : i; }
  if (r === "ytd") { const y = dayToDate(last).getUTCFullYear(); return Math.max(0, t.findIndex((x) => dayToDate(x).getUTCFullYear() === y) - 1); }
  return 0;
}
function sliceRange(data, r) {
  const s = startIndex(data.t, r), out = {};
  for (const k of Object.keys(data)) if (Array.isArray(data[k])) out[k] = data[k].slice(s);
  return out;
}
// Daily series + the live price as today's last point, so every range ends at the current price.
function patchDaily(data, info) {
  if (!info || !info.open) return data;
  const day = utcDay(info.ts), t = data.t.slice(), c = data.c.slice(), n = t.length;
  if (t[n - 1] === day) c[n - 1] = info.price; else if (day > t[n - 1]) { t.push(day); c.push(info.price); }
  return { t, c };
}

// data = {t:[days since 2000-01-01], c:[values]};
// opts = { money: true (prices) | false (index level), unit: "yield", compare: {name, data},
//          live: async ("1d"|"5d"|"1mo"|"3mo"|...) => {t:[unix secs], c, o, h, l, previousClose} | null,
//          ohlcSym: "NVDA" | ohlcData: {t,o,h,l,c}  (enables the Candles toggle) }
function mountChart(el, data, opts = {}) {
  const canCandle = !!(opts.ohlcSym || opts.ohlcData || opts.live);
  try { if (canCandle && typeof mountCandleChart === "function" && localStorage.getItem("ml_ctype") === "candle") return mountCandleChart(el, data, opts); } catch (e) {}
  el._gen = (el._gen || 0) + 1; const gen = el._gen;
  const money = opts.money !== false, id = "ch" + Math.random().toString(36).slice(2, 7);
  let rng = "1Y", view = null, cmpOn = false, info = null, hovering = false, token = 0;
  const fmt = (v) => opts.unit === "yield" ? v.toFixed(2) + "%" : (money ? "$" : "") + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  el.innerHTML = `<div class="chh"><div class="chtop"><div class="chp" id="${id}p"></div>${canCandle ? `<div class="ctog" role="group" aria-label="Chart type"><button data-ct="line" class="on">Line</button><button data-ct="candle">Candles</button></div>` : ""}</div>
   <div class="chc small" id="${id}c"></div><div class="small muted"><span class="livetag" id="${id}l" style="display:none"><i></i>LIVE</span><span id="${id}d"></span></div></div>
   <div class="chw"><svg id="${id}s" viewBox="0 0 600 220" preserveAspectRatio="none" style="width:100%;height:220px;touch-action:pan-y;cursor:crosshair"></svg>
    <div class="cdot" id="${id}h" style="display:none"></div><div class="cdot live" id="${id}o" style="display:none"></div></div>
   <div class="chr">${RANGES.map((r) => `<button data-r="${r.l}" ${r.live && !r.days && !opts.live ? 'disabled title="Sign in for live intraday charts"' : ""}>${r.l}</button>`).join("")}</div>
   ${opts.compare ? `<div class="small" style="margin-top:8px"><label style="cursor:pointer"><input type="checkbox" class="cmpchk"> Compare with ${opts.compare.name} <span class="muted">(dashed line)</span></label></div>` : ""}`;
  const q = (s) => el.querySelector("#" + id + s);
  const svg = q("s"), P = q("p"), C = q("c"), D = q("d"), L = q("l"), hoverDot = q("h"), liveDot = q("o");

  function header(i) {
    const v = view, cur = v.c[i], base = v.base != null ? v.base : v.c[0], ch = cur - base, pc = (cur / base - 1) * 100, up = ch >= 0;
    P.textContent = fmt(cur);
    const cmp = v.comp ? ` <span class="muted">· ${opts.compare.name} ${(v.comp[i] / v.comp[0] - 1) * 100 >= 0 ? "+" : ""}${((v.comp[i] / v.comp[0] - 1) * 100).toFixed(2)}%</span>` : "";
    const span = { "1D": "today", "1W": "past 5 days", "1M": "past month", "3M": "past 3 months" }[rng];
    C.innerHTML = `<span style="color:${up ? "var(--ok)" : "var(--bad)"};font-weight:700">${up ? "▲" : "▼"} ${opts.unit === "yield" ? Math.abs(ch).toFixed(2) + " pts" : (money ? "$" : "") + Math.abs(ch).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " (" + (up ? "+" : "") + pc.toFixed(2) + "%)"}</span> <span class="muted">${i === v.c.length - 1 ? (v.intraday && span ? span : "over " + rng) : "vs " + (v.base != null ? "previous close" : v.intraday ? fmtStamp(v.t[0]) : fmtDate(v.t[0]))}</span>${cmp}`;
    D.textContent = v.intraday ? fmtStamp(v.t[i]) : fmtDate(v.t[i]);
    L.style.display = info && info.open && i === v.c.length - 1 ? "" : "none";
  }

  async function loadView(r, quiet) {
    const my = ++token;
    if (r.live && opts.live) {
      if (!quiet) { P.textContent = "Loading…"; C.textContent = ""; D.textContent = ""; }
      try {
        const j = await opts.live(r.live);
        if (!j || !j.c || j.c.length < 2) throw new Error("empty");
        if (my !== token) return null;
        if (r.live === "1d") { const lt = j.t[j.t.length - 1]; info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS }; }
        return { t: j.t, c: j.c, intraday: true, base: r.live === "1d" && j.previousClose ? j.previousClose : null };
      } catch (e) {
        if (my !== token) return null;
        if (!r.days) { rng = "1Y"; return loadView(RANGES.find((x) => x.l === "1Y"), quiet); }  // no daily fallback for 1D/1W
      }
    }
    if (my !== token) return null;
    return sliceRange(patchDaily({ t: data.t, c: data.c }, info), r.days);
  }

  async function draw(quiet) {
    const r = RANGES.find((x) => x.l === rng), v = await loadView(r, quiet);
    if (!v || el._gen !== gen) return;
    view = v; view.comp = null;
    if (cmpOn && opts.compare && !view.intraday) {  // comparison line, rescaled to start at the same value
      const ct = opts.compare.data.t, cc = opts.compare.data.c; let j = 0; const out = [];
      for (const t of view.t) { while (j + 1 < ct.length && ct[j + 1] <= t) j++; out.push(cc[j]); }
      view.comp = out.map((x) => (x / out[0]) * view.c[0]);
    }
    const c = view.c, n = c.length, W = 600, H = 220;
    const all = view.comp ? c.concat(view.comp) : c, lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
    const X = (i) => (i / (n - 1)) * W, Y = (x) => H - 10 - ((x - lo + pad * 0.5) / (hi - lo + pad)) * (H - 20);
    const base = view.base != null ? view.base : c[0], up = c[n - 1] >= base, col = up ? "var(--ok)" : "var(--bad)", pts = c.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ");
    svg.innerHTML = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
     <line x1="0" x2="${W}" y1="${Y(base)}" y2="${Y(base)}" stroke="var(--mut)" stroke-opacity=".35" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
     ${view.comp ? `<polyline points="${view.comp.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--mut)" stroke-width="1.8" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>` : ""}
     <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#${id}g)"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
     <line id="${id}x" y1="0" y2="${H}" stroke="var(--mut)" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/>`;
    svg._X = X; svg._Y = Y; svg._col = col;
    // live dot on the latest point (a real circle, positioned over the chart)
    const isLive = !!(info && info.open && opts.live);
    liveDot.style.display = isLive ? "" : "none";
    if (isLive) { liveDot.style.setProperty("--dot", col); liveDot.style.left = (X(n - 1) / W) * 100 + "%"; liveDot.style.top = Y(c[n - 1]) + "px"; }
    hoverDot.style.display = "none";
    if (!hovering) header(n - 1);
    el.querySelectorAll(".chr button").forEach((b) => b.classList.toggle("on", b.dataset.r === rng));
  }

  function move(ev) {
    if (!view) return;
    hovering = true;
    const n = view.c.length, rect = svg.getBoundingClientRect(), f = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1), i = Math.round(f * (n - 1));
    const xs = svg._X(i), ys = svg._Y(view.c[i]), line = svg.querySelector("#" + id + "x");
    line.setAttribute("x1", xs); line.setAttribute("x2", xs); line.style.display = "";
    hoverDot.style.setProperty("--dot", svg._col); hoverDot.style.left = (xs / 600) * 100 + "%"; hoverDot.style.top = ys + "px"; hoverDot.style.display = "";
    header(i);
  }
  function leave() { hovering = false; if (!view) return; svg.querySelector("#" + id + "x").style.display = "none"; hoverDot.style.display = "none"; header(view.c.length - 1); }
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", leave); svg.addEventListener("pointerdown", move);
  el.querySelectorAll(".chr button").forEach((b) => b.onclick = () => { if (b.disabled) return; rng = b.dataset.r; hovering = false; draw(); });
  el.querySelectorAll(".ctog button").forEach((b) => b.onclick = () => { if (b.dataset.ct === "candle" && typeof mountCandleChart === "function") { try { localStorage.setItem("ml_ctype", "candle"); } catch (e) {} mountCandleChart(el, data, opts); } });
  const chk = el.querySelector(".cmpchk"); if (chk) chk.onchange = () => { cmpOn = chk.checked; draw(); };

  // Live refresh while the market is open. Stops by itself when this chart leaves the page or is replaced.
  async function tick() {
    if (el._gen !== gen || !el.isConnected) { clearInterval(timer); return; }
    if (!opts.live || document.hidden || hovering || !info) return;
    const r = RANGES.find((x) => x.l === rng);
    if (r.live && opts.live) { await draw(true); return; }       // intraday view: refetch it (this also refreshes `info`)
    try {  // daily view: refresh the live price and re-patch
      const j = await opts.live("1d"), lt = j.t[j.t.length - 1];
      info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS };
      await draw(true);
    } catch (e) {}
  }
  const timer = setInterval(tick, POLL_MS);

  // First paint: daily history right away. Then ask for the live price; if the market is open, redraw with the live dot.
  draw();
  if (opts.live) opts.live("1d").then((j) => {
    const lt = j.t[j.t.length - 1];
    info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS };
    if (el._gen === gen && el.isConnected && !hovering) draw(true);
  }).catch(() => {});
}
