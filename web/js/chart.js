// Interactive price chart: hover/touch to scrub, range buttons, green/red by direction, Line or Candles. No libraries.
// Live data (signed-in users): 1D = every minute, 1W = 5-minute, 1M = 30-minute, 3M = hourly. Longer ranges use daily closes.
// While the market is open the chart refreshes itself and shows a blinking dot on the latest price.
// Dots are HTML circles layered on the chart (never SVG shapes), so they stay perfectly round at any screen width.
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
  const day = utcDay(info.ts), out = {};
  for (const k of Object.keys(data)) out[k] = data[k].slice();
  const n = out.t.length;
  if (out.t[n - 1] === day) {
    out.c[n - 1] = info.price;
    if (out.o && info.day) { out.o[n - 1] = info.day.o; out.h[n - 1] = Math.max(out.h[n - 1], info.day.h); out.l[n - 1] = Math.min(out.l[n - 1], info.day.l); }
  } else if (day > out.t[n - 1]) {
    out.t.push(day); out.c.push(info.price);
    if (out.o) { const d = info.day || { o: info.price, h: info.price, l: info.price }; out.o.push(d.o); out.h.push(d.h); out.l.push(d.l); }
  }
  return out;
}

// Group bars into at most maxN candles (e.g. 390 one-minute bars -> 78 five-minute candles).
function aggregate(v, maxN) {
  const n = v.c.length, size = Math.max(1, Math.ceil(n / maxN));
  if (size === 1) return v;
  const out = { t: [], o: [], h: [], l: [], c: [], intraday: v.intraday, base: v.base };
  for (let i = 0; i < n; i += size) {
    const j = Math.min(i + size, n) - 1;
    out.t.push(v.t[j]); out.o.push(v.o[i]); out.c.push(v.c[j]);
    out.h.push(Math.max(...v.h.slice(i, j + 1))); out.l.push(Math.min(...v.l.slice(i, j + 1)));
  }
  return out;
}

// data = {t:[days since 2000-01-01], c:[values]};
// opts = { money: true (prices) | false (index level), unit: "yield", compare: {name, data},
//          live: async ("1d"|"5d"|"1mo"|"3mo") => {t:[unix secs], c, o, h, l, previousClose} | null,
//          ohlcSym: "NVDA" (daily candle data is fetched on demand) | ohlcData: {t,o,h,l,c} }
function mountChart(el, data, opts = {}) {
  const money = opts.money !== false, id = "ch" + Math.random().toString(36).slice(2, 7);
  const canCandle = !!(opts.ohlcSym || opts.ohlcData || opts.live);
  let rng = "1Y", view = null, cmpOn = false, info = null, hovering = false, token = 0, ohlc = null, note = "";
  let ctype = "line"; try { if (canCandle && localStorage.getItem("ml_ctype") === "candle") ctype = "candle"; } catch (e) {}
  const fmt = (v) => opts.unit === "yield" ? v.toFixed(2) + "%" : (money ? "$" : "") + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  el.innerHTML = `<div class="chh"><div class="chtop"><div class="chp" id="${id}p"></div>${canCandle ? `<div class="ctog" role="group" aria-label="Chart type"><button data-ct="line">Line</button><button data-ct="candle">Candles</button></div>` : ""}</div>
   <div class="chc small" id="${id}c"></div><div class="small muted"><span class="livetag" id="${id}l" style="display:none"><i></i>LIVE</span><span id="${id}d"></span></div></div>
   <div class="chw"><svg id="${id}s" viewBox="0 0 600 220" preserveAspectRatio="none" style="width:100%;height:220px;touch-action:pan-y;cursor:crosshair"></svg>
    <div class="cdot" id="${id}h" style="display:none"></div><div class="cdot live" id="${id}o" style="display:none"></div></div>
   <div class="small muted" id="${id}n" style="margin-top:4px"></div>
   <div class="chr">${RANGES.map((r) => `<button data-r="${r.l}" ${r.live && !r.days && !opts.live ? 'disabled title="Sign in for live intraday charts"' : ""}>${r.l}</button>`).join("")}</div>
   ${opts.compare ? `<div class="small" style="margin-top:8px"><label style="cursor:pointer"><input type="checkbox" class="cmpchk"> Compare with ${opts.compare.name} <span class="muted">(dashed line, line view)</span></label></div>` : ""}`;
  const q = (s) => el.querySelector("#" + id + s);
  const svg = q("s"), P = q("p"), C = q("c"), D = q("d"), L = q("l"), N = q("n"), hoverDot = q("h"), liveDot = q("o");

  function header(i) {
    const v = view, cur = v.c[i], base = v.base != null ? v.base : v.c[0], ch = cur - base, pc = (cur / base - 1) * 100, up = ch >= 0;
    P.textContent = fmt(cur);
    const cmp = v.comp ? ` <span class="muted">· ${opts.compare.name} ${(v.comp[i] / v.comp[0] - 1) * 100 >= 0 ? "+" : ""}${((v.comp[i] / v.comp[0] - 1) * 100).toFixed(2)}%</span>` : "";
    const span = { "1D": "today", "1W": "past 5 days", "1M": "past month", "3M": "past 3 months" }[rng];
    C.innerHTML = `<span style="color:${up ? "var(--ok)" : "var(--bad)"};font-weight:700">${up ? "▲" : "▼"} ${opts.unit === "yield" ? Math.abs(ch).toFixed(2) + " pts" : (money ? "$" : "") + Math.abs(ch).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " (" + (up ? "+" : "") + pc.toFixed(2) + "%)"}</span> <span class="muted">${i === v.c.length - 1 ? (v.intraday && span ? span : "over " + rng) : "vs " + (v.base != null ? "previous close" : v.intraday ? fmtStamp(v.t[0]) : fmtDate(v.t[0]))}</span>${cmp}`;
    D.textContent = (v.intraday ? fmtStamp(v.t[i]) : fmtDate(v.t[i])) + (v.candle ? `  ·  O ${fmt(v.o[i])}  H ${fmt(v.h[i])}  L ${fmt(v.l[i])}  C ${fmt(v.c[i])}` : "");
    L.style.display = info && info.open && i === v.c.length - 1 ? "" : "none";
  }

  async function ensureOhlc() {
    if (ohlc) return ohlc;
    if (opts.ohlcData) return (ohlc = opts.ohlcData);
    if (opts.ohlcSym && typeof getOhlc === "function") ohlc = await getOhlc(opts.ohlcSym);
    return ohlc;
  }

  async function loadView(r, quiet) {
    const my = ++token, wantCandle = ctype === "candle";
    note = "";
    if (r.live && opts.live) {
      if (!quiet) { P.textContent = "Loading…"; C.textContent = ""; D.textContent = ""; }
      try {
        const j = await opts.live(r.live);
        if (!j || !j.c || j.c.length < 2) throw new Error("empty");
        if (my !== token) return null;
        if (r.live === "1d") {
          const lt = j.t[j.t.length - 1];
          info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS, day: j.o ? { o: j.o[0], h: Math.max(...j.h), l: Math.min(...j.l) } : null };
        }
        const v = { t: j.t, c: j.c, intraday: true, base: r.live === "1d" && j.previousClose ? j.previousClose : null };
        if (j.o && j.h && j.l) { v.o = j.o; v.h = j.h; v.l = j.l; } else if (wantCandle) note = "Candles for this range need the latest live-data update.";
        return v;
      } catch (e) {
        if (my !== token) return null;
        if (!r.days) { rng = "1Y"; return loadView(RANGES.find((x) => x.l === "1Y"), quiet); }  // no daily fallback for 1D/1W
      }
    }
    if (my !== token) return null;
    if (wantCandle) {
      const od = await ensureOhlc();
      if (my !== token) return null;
      if (od && od.o) return sliceRange(patchDaily(od, info), r.days);
      note = "Candles aren't available for this chart yet.";
    }
    return sliceRange(patchDaily({ t: data.t, c: data.c }, info), r.days);
  }

  async function draw(quiet) {
    const r = RANGES.find((x) => x.l === rng), raw = await loadView(r, quiet);
    if (!raw) return;
    const candle = ctype === "candle" && !!raw.o;
    view = candle ? aggregate(raw, raw.intraday && rng === "1D" ? 78 : 110) : raw;
    view.comp = null; view.candle = candle;
    if (!candle && cmpOn && opts.compare && !view.intraday) {  // comparison line, rescaled to start at the same value
      const ct = opts.compare.data.t, cc = opts.compare.data.c; let j = 0; const out = [];
      for (const t of view.t) { while (j + 1 < ct.length && ct[j + 1] <= t) j++; out.push(cc[j]); }
      view.comp = out.map((x) => (x / out[0]) * view.c[0]);
    }
    N.textContent = note;
    el.querySelectorAll(".ctog button").forEach((b) => b.classList.toggle("on", b.dataset.ct === (candle ? "candle" : "line")));
    const c = view.c, n = c.length, W = 600, H = 220;
    const all = candle ? view.h.concat(view.l) : view.comp ? c.concat(view.comp) : c, lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
    const X = candle ? (i) => ((i + 0.5) / n) * W : (i) => (i / (n - 1)) * W, Y = (x) => H - 10 - ((x - lo + pad * 0.5) / (hi - lo + pad)) * (H - 20);
    const base = view.base != null ? view.base : c[0], up = c[n - 1] >= base, col = up ? "var(--ok)" : "var(--bad)";
    let body;
    if (candle) {
      const sp = W / n, bw = Math.max(sp * 0.62, 0.5);
      body = c.map((cl, i) => { const o = view.o[i], x = (i + 0.5) * sp, cc = cl >= o ? "var(--ok)" : "var(--bad)", y1 = Y(o), y2 = Y(cl);
        return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${Y(view.h[i]).toFixed(1)}" y2="${Y(view.l[i]).toFixed(1)}" stroke="${cc}" stroke-width="1.3" vector-effect="non-scaling-stroke"/><rect x="${(x - bw / 2).toFixed(2)}" y="${Math.min(y1, y2).toFixed(1)}" width="${bw.toFixed(2)}" height="${Math.max(Math.abs(y1 - y2), 1).toFixed(1)}" fill="${cc}"/>`; }).join("");
    } else {
      const pts = c.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ");
      body = `${view.comp ? `<polyline points="${view.comp.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--mut)" stroke-width="1.8" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>` : ""}
       <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#${id}g)"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }
    svg.innerHTML = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
     <line x1="0" x2="${W}" y1="${Y(base)}" y2="${Y(base)}" stroke="var(--mut)" stroke-opacity=".35" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
     ${body}<line id="${id}x" y1="0" y2="${H}" stroke="var(--mut)" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/>`;
    svg._X = X; svg._Y = Y; svg._col = col; svg._candle = candle;
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
    const n = view.c.length, rect = svg.getBoundingClientRect(), f = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 0.9999);
    const i = svg._candle ? Math.floor(f * n) : Math.round(f * (n - 1));
    const xs = svg._X(i), ys = svg._Y(view.c[i]), line = svg.querySelector("#" + id + "x");
    line.setAttribute("x1", xs); line.setAttribute("x2", xs); line.style.display = "";
    hoverDot.style.setProperty("--dot", svg._col); hoverDot.style.left = (xs / 600) * 100 + "%"; hoverDot.style.top = ys + "px"; hoverDot.style.display = "";
    header(i);
  }
  function leave() { hovering = false; if (!view) return; svg.querySelector("#" + id + "x").style.display = "none"; hoverDot.style.display = "none"; header(view.c.length - 1); }
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", leave); svg.addEventListener("pointerdown", move);
  el.querySelectorAll(".chr button").forEach((b) => b.onclick = () => { if (b.disabled) return; rng = b.dataset.r; hovering = false; draw(); });
  el.querySelectorAll(".ctog button").forEach((b) => b.onclick = () => { ctype = b.dataset.ct; try { localStorage.setItem("ml_ctype", ctype); } catch (e) {} hovering = false; draw(); });
  const chk = el.querySelector(".cmpchk"); if (chk) chk.onchange = () => { cmpOn = chk.checked; draw(); };

  // Live refresh while the market is open. Stops by itself when this chart leaves the page.
  async function tick() {
    if (!el.isConnected) { clearInterval(timer); return; }
    if (!opts.live || document.hidden || hovering || !info) return;
    const r = RANGES.find((x) => x.l === rng);
    if (r.live && opts.live) { await draw(true); return; }       // intraday view: refetch it (this also refreshes `info`)
    try {  // daily view: refresh the live price and re-patch
      const j = await opts.live("1d"), lt = j.t[j.t.length - 1];
      info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS, day: j.o ? { o: j.o[0], h: Math.max(...j.h), l: Math.min(...j.l) } : null };
      await draw(true);
    } catch (e) {}
  }
  const timer = setInterval(tick, POLL_MS);

  // First paint: daily history right away. Then ask for the live price; if the market is open, redraw with the live dot.
  draw();
  if (opts.live) opts.live("1d").then((j) => {
    const lt = j.t[j.t.length - 1];
    info = { price: j.c[j.c.length - 1], ts: lt, open: Date.now() / 1000 - lt < LIVE_FRESH_SECONDS, day: j.o ? { o: j.o[0], h: Math.max(...j.h), l: Math.min(...j.l) } : null };
    if (el.isConnected && !hovering) draw(true);
  }).catch(() => {});
}
