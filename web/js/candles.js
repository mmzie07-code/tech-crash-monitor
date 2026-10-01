// Zoomable candlestick chart. Default view: today's session in true 1-minute candles.
// Zoom (pinch, Cmd/Ctrl + scroll, or the +/- buttons) from about 5 minutes out to 5 years; drag to move around.
// The candle size follows the zoom, using the finest data that fits: 1 minute, 5 minutes, 1 hour, 1 day, then weekly.
// Live tiers need a signed-in user (opts.live); daily candles come from the nightly history files (opts.ohlcSym / opts.ohlcData).
const CANDLE_MAX = 420;            // most candles drawn at once
const MIN_WINDOW_SEC = 5 * 60;      // closest zoom: 5 minutes
const SESSION_SEC = 6.5 * 3600;
const CT_TIERS = [                  // finest first
  { key: "m1", label: "1-minute", step: 60, range: "5d1m", maxAge: 7 * 86400 },
  { key: "m5", label: "5-minute", step: 300, range: "1mo5m", maxAge: 30 * 86400 },
  { key: "h1", label: "1-hour", step: 3600, range: "3mo", maxAge: 90 * 86400 },
  { key: "d1", label: "daily", step: 86400, range: null, maxAge: Infinity }];
const etDay = (ts) => new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function mountCandleChart(el, data, opts = {}) {
  el._gen = (el._gen || 0) + 1; const gen = el._gen;
  const id = "cd" + Math.random().toString(36).slice(2, 7), money = opts.money !== false;
  const fmt = (v) => opts.unit === "yield" ? v.toFixed(2) + "%" : (money ? "$" : "") + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tiers = {}, fetched = {};   // key -> bars [{t,o,h,l,c}], key -> ms of last fetch
  let w0 = 0, w1 = 0, vis = null, info = null, hovering = false, preset = "1D", loading = false, drag = null;
  const pointers = new Map();

  el.innerHTML = `<div class="chh"><div class="chtop"><div class="chp" id="${id}p"></div><div class="ctog" role="group" aria-label="Chart type"><button data-ct="line">Line</button><button data-ct="candle" class="on">Candles</button></div></div>
   <div class="chc small" id="${id}c"></div><div class="small muted"><span class="livetag" id="${id}l" style="display:none"><i></i>LIVE</span><span id="${id}d"></span></div></div>
   <div class="chw"><svg id="${id}s" viewBox="0 0 600 240" preserveAspectRatio="none" style="width:100%;height:240px;touch-action:pan-y;cursor:grab;user-select:none"></svg>
    <div class="ylab" id="${id}hi" style="top:2px"></div><div class="ylab" id="${id}lo" style="bottom:2px"></div>
    <div class="cdot" id="${id}h" style="display:none"></div><div class="cdot live" id="${id}o" style="display:none"></div></div>
   <div class="xaxis small muted"><span id="${id}x0"></span><span id="${id}xm"></span><span id="${id}x1"></span></div>
   <div class="zoombar"><div class="zb"><button id="${id}zo" title="Zoom out" aria-label="Zoom out">−</button><button id="${id}zi" title="Zoom in" aria-label="Zoom in">+</button><button id="${id}zr" title="Back to today" aria-label="Reset zoom">Reset</button><button id="${id}zn" title="Jump to the latest candle" aria-label="Jump to latest">Latest ▸</button></div>
    <span class="small muted" id="${id}z"></span></div>
   <div class="chr">${RANGES.map((r) => `<button data-r="${r.l}">${r.l}</button>`).join("")}</div>
   <div class="small muted" style="margin-top:4px">Pinch, or hold ⌘/Ctrl and scroll, to zoom · drag to move · double-click to reset</div>`;
  const q = (s) => el.querySelector("#" + id + s);
  const svg = q("s"), P = q("p"), C = q("c"), D = q("d"), L = q("l"), hoverDot = q("h"), liveDot = q("o");

  // ----- data tiers -----
  const dailyBars = () => { const od = opts.ohlcData; return od ? od.t.map((d, i) => ({ t: (d + 10957) * 86400 + 75600, o: od.o[i], h: od.h[i], l: od.l[i], c: od.c[i] })) : []; };
  async function ensureTier(key, force) {
    if (key === "d1") {
      if (tiers.d1) return tiers.d1;
      if (!opts.ohlcData && opts.ohlcSym && typeof getOhlc === "function") opts.ohlcData = await getOhlc(opts.ohlcSym);
      return (tiers.d1 = dailyBars());
    }
    if (!opts.live) return null;
    const stale = Date.now() - (fetched[key] || 0) > 60000;
    if (tiers[key] && !(force && stale)) return tiers[key];
    try {
      const t = CT_TIERS.find((x) => x.key === key);
      let j; try { j = await opts.live(t.range); } catch (e) { j = await opts.live({ m1: "1d", m5: "5d", h1: "3mo" }[key]); }   // older server: use whatever it offers
      if (!j.o) throw new Error("no ohlc");
      tiers[key] = j.t.map((ts, i) => ({ t: ts, o: j.o[i], h: j.h[i], l: j.l[i], c: j.c[i] }));
      fetched[key] = Date.now();
      if (key === "m1" && j.previousClose) tiers.prevClose = j.previousClose;
      const last = tiers[key][tiers[key].length - 1];
      if (key === "m1") info = { price: last.c, ts: last.t, open: Date.now() / 1000 - last.t < LIVE_FRESH_SECONDS };
    } catch (e) { tiers[key] = tiers[key] || null; fetched[key] = Date.now(); }
    return tiers[key];
  }
  const lowerBound = (bars, t) => { let a = 0, b = bars.length; while (a < b) { const m = (a + b) >> 1; if (bars[m].t < t) a = m + 1; else b = m; } return a; };

  // pick the finest tier that covers the window with at most CANDLE_MAX candles; weekly-aggregate daily candles when still too many
  async function pickBars() {
    const span = w1 - w0;
    for (const t of CT_TIERS) {
      const bars = await ensureTier(t.key, t.key === "m1");
      if (!bars || !bars.length) continue;
      const covers = bars[0].t <= w0 + Math.max(span * 0.04, t.step * 2) || t.key === "d1";
      if (!covers) continue;
      const a = lowerBound(bars, w0), b = lowerBound(bars, w1 + t.step);
      const n = b - a;
      if (n <= CANDLE_MAX || t.key === "d1") {
        let list = bars.slice(a, b), label = t.label;
        if (list.length > CANDLE_MAX) { const raw = Math.ceil(list.length / CANDLE_MAX), size = raw <= 2 ? raw : Math.max(raw, 5), out = []; for (let i = 0; i < list.length; i += size) { const g = list.slice(i, i + size); out.push({ t: g[g.length - 1].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1].c }); } list = out; label = size === 5 ? "weekly" : "every " + size + " days"; }
        return { list, label, tier: t.key };
      }
    }
    return { list: [], label: "", tier: "d1" };
  }

  // ----- windows -----
  function bounds() {
    const d = tiers.d1 && tiers.d1.length ? tiers.d1 : dailyBars();
    const start = Math.min(...[tiers.m1, tiers.m5, tiers.h1, d].filter((x) => x && x.length).map((x) => x[0].t));
    const lastBar = (tiers.m1 && tiers.m1.length ? tiers.m1 : d)[(tiers.m1 && tiers.m1.length ? tiers.m1 : d).length - 1];
    return { start: isFinite(start) ? start : 0, end: lastBar ? lastBar.t : Date.now() / 1000 };
  }
  function presetWindow(label) {
    const b = bounds(), end = b.end, m1 = tiers.m1 && tiers.m1.length ? tiers.m1 : null;
    const sessions = () => { if (!m1) return []; const days = []; let cur = null; for (const x of m1) { const d = etDay(x.t); if (d !== cur) { days.push(x.t); cur = d; } } return days; };
    if (label === "1D" || label === "1W") {
      const s = sessions();
      if (s.length) { const k = label === "1D" ? 1 : 5; return [s[Math.max(0, s.length - k)] - 60, end + 60]; }
      return [end - (label === "1D" ? 86400 : 5 * 86400), end + 3600];
    }
    const r = RANGES.find((x) => x.l === label), dd = new Date((end) * 1000);
    if (r.days === "ytd") return [Date.UTC(dd.getUTCFullYear(), 0, 1) / 1000, end + 86400];
    if (r.days === "all") return [b.start, end + 86400];
    return [end - r.days * 86400, end + 86400];
  }
  function clampWindow(a, c0, c1) {
    const b = bounds(), full = (b.end - b.start) * 1.02 + 3600;
    let span = Math.min(Math.max(c1 - c0, MIN_WINDOW_SEC), full);
    if (!opts.live) span = Math.max(span, 5 * 86400);
    let s = c0; if (s < b.start - span * 0.02) s = b.start - span * 0.02; if (s + span > b.end + span * 0.06) s = b.end + span * 0.06 - span;
    return [s, s + span];
  }

  // ----- drawing -----
  function header(i) {
    const v = vis; if (!v || !v.list.length) { P.textContent = ""; C.textContent = "No candle data for this view"; D.textContent = ""; return; }
    const k = v.list[i], first = v.list[0], base = preset === "1D" && tiers.prevClose && v.tier === "m1" && v.list.length > 1 && w0 >= bounds().end - 2 * 86400 ? tiers.prevClose : first.o;
    const ch = k.c - base, pc = (k.c / base - 1) * 100, up = ch >= 0;
    P.textContent = fmt(k.c);
    C.innerHTML = `<span style="color:${up ? "var(--ok)" : "var(--bad)"};font-weight:700">${up ? "▲" : "▼"} ${opts.unit === "yield" ? Math.abs(ch).toFixed(2) + " pts" : (money ? "$" : "") + Math.abs(ch).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " (" + (up ? "+" : "") + pc.toFixed(2) + "%)"}</span> <span class="muted">${i === v.list.length - 1 ? "in view" : "vs start of view"}</span>`;
    const intr = v.tier !== "d1";
    D.textContent = (intr ? fmtStamp(k.t) : fmtDate(utcDay(k.t))) + `  ·  O ${fmt(k.o)}  H ${fmt(k.h)}  L ${fmt(k.l)}  C ${fmt(k.c)}`;
    L.style.display = info && info.open && i === v.list.length - 1 && v.tier === "m1" ? "" : "none";
  }
  const axisLabel = (t, span, intr) => intr ? (span <= 2 * 86400 ? new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }))
    : new Date(t * 1000).toLocaleDateString("en-US", span > 400 * 86400 ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });

  async function render(quiet) {
    if (el._gen !== gen) return;
    if (!quiet) { loading = true; q("z").textContent = "Loading…"; }
    const v = await pickBars();
    if (el._gen !== gen) return;
    loading = false; vis = v;
    const list = v.list, n = list.length, W = 600, H = 240;
    if (!n) { svg.innerHTML = ""; header(0); q("z").textContent = "No candles to show here. Zoom out or choose another range."; liveDot.style.display = "none"; return; }
    const hi = Math.max(...list.map((k) => k.h)), lo = Math.min(...list.map((k) => k.l)), pad = (hi - lo) * 0.08 || 1;
    const Y = (x) => H - 12 - ((x - lo + pad * 0.5) / (hi - lo + pad)) * (H - 24), sp = W / n, bw = Math.max(sp * 0.68, 0.5);
    const X = (i) => (i + 0.5) * sp, upLast = list[n - 1].c >= list[0].o, col = upLast ? "var(--ok)" : "var(--bad)";
    svg._X = X; svg._Y = Y; svg._col = col;
    svg.innerHTML = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>`).join("") +
      list.map((k, i) => { const x = X(i), cc = k.c >= k.o ? "var(--ok)" : "var(--bad)", y1 = Y(k.o), y2 = Y(k.c);
        return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${Y(k.h).toFixed(1)}" y2="${Y(k.l).toFixed(1)}" stroke="${cc}" stroke-width="1.2" vector-effect="non-scaling-stroke"/><rect x="${(x - bw / 2).toFixed(2)}" y="${Math.min(y1, y2).toFixed(1)}" width="${bw.toFixed(2)}" height="${Math.max(Math.abs(y1 - y2), 0.8).toFixed(1)}" fill="${cc}"/>`; }).join("") +
      `<line id="${id}xl" y1="0" y2="${H}" stroke="var(--mut)" vector-effect="non-scaling-stroke" style="display:none"/>`;
    q("hi").textContent = fmt(hi); q("lo").textContent = fmt(lo);
    const intr = v.tier !== "d1", span = w1 - w0;
    q("x0").textContent = axisLabel(list[0].t, span, intr); q("xm").textContent = axisLabel(list[n >> 1].t, span, intr); q("x1").textContent = axisLabel(list[n - 1].t, span, intr);
    const spanTxt = span < 3600 ? Math.round(span / 60) + " min" : span < 2 * 86400 ? (span / 3600).toFixed(1) + " hours" : span < 120 * 86400 ? Math.round(span / 86400) + " days" : (span / 86400 / 365).toFixed(1) + " years";
    const cname = v.tier === "m1" ? "1 minute" : v.tier === "m5" ? "5 minutes" : v.tier === "h1" ? "1 hour" : v.label === "daily" ? "1 day" : v.label === "weekly" ? "1 week" : v.label.replace("every ", "");
    q("z").textContent = `Each candle = ${cname} · showing ${spanTxt}`;
    const isLive = !!(info && info.open && opts.live && v.tier === "m1" && w1 >= bounds().end);
    liveDot.style.display = isLive ? "" : "none";
    if (isLive) { liveDot.style.setProperty("--dot", list[n - 1].c >= list[n - 1].o ? "var(--ok)" : "var(--bad)"); liveDot.style.left = (X(n - 1) / W) * 100 + "%"; liveDot.style.top = Y(list[n - 1].c) + "px"; }
    hoverDot.style.display = "none";
    if (!hovering) header(n - 1);
    el.querySelectorAll(".chr button").forEach((b) => b.classList.toggle("on", b.dataset.r === preset));
  }

  // ----- interactions -----
  function zoom(factor, centerFrac) {
    const span = w1 - w0, c = w0 + span * (centerFrac == null ? 0.5 : centerFrac), ns = span * factor;
    [w0, w1] = clampWindow(null, c - ns * (centerFrac == null ? 0.5 : centerFrac), c + ns * (1 - (centerFrac == null ? 0.5 : centerFrac)));
    preset = ""; hovering = false; render(true);
  }
  function pan(frac) {  // move window by a fraction of its width
    const span = w1 - w0; [w0, w1] = clampWindow(null, w0 + span * frac, w1 + span * frac); preset = ""; render(true);
  }
  const fracAt = (ev) => { const r = svg.getBoundingClientRect(); return Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1); };
  function crosshair(ev) {
    if (!vis || !vis.list.length) return;
    hovering = true;
    const n = vis.list.length, i = Math.min(n - 1, Math.floor(Math.min(fracAt(ev), 0.9999) * n)), xs = svg._X(i), ys = svg._Y(vis.list[i].c), line = svg.querySelector("#" + id + "xl");
    line.setAttribute("x1", xs); line.setAttribute("x2", xs); line.style.display = "";
    hoverDot.style.setProperty("--dot", vis.list[i].c >= vis.list[i].o ? "var(--ok)" : "var(--bad)"); hoverDot.style.left = (xs / 600) * 100 + "%"; hoverDot.style.top = ys + "px"; hoverDot.style.display = "";
    header(i);
  }
  function endHover() { hovering = false; if (!vis || !vis.list.length) return; const l = svg.querySelector("#" + id + "xl"); if (l) l.style.display = "none"; hoverDot.style.display = "none"; header(vis.list.length - 1); }
  svg.addEventListener("pointerdown", (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX }); svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    if (pointers.size === 1) drag = { x: ev.clientX, w0, w1, moved: false }; else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { pinch: Math.abs(a.x - b.x) || 1, w0, w1 }; }
  });
  svg.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX });
    if (drag && drag.pinch && pointers.size === 2) {  // two-finger pinch
      const [a, b] = [...pointers.values()], ratio = drag.pinch / (Math.abs(a.x - b.x) || 1), span = drag.w1 - drag.w0, c = (drag.w0 + drag.w1) / 2;
      [w0, w1] = clampWindow(null, c - (span * ratio) / 2, c + (span * ratio) / 2); preset = ""; render(true); return;
    }
    if (drag && pointers.size === 1 && ev.buttons !== 0 || (drag && ev.pointerType === "touch")) {
      const dx = ev.clientX - drag.x, r = svg.getBoundingClientRect();
      if (Math.abs(dx) > 4) { drag.moved = true; const span = drag.w1 - drag.w0, shift = -(dx / r.width) * span; [w0, w1] = clampWindow(null, drag.w0 + shift, drag.w1 + shift); preset = ""; svg.style.cursor = "grabbing"; render(true); return; }
    }
    if (!drag || !drag.moved) crosshair(ev);
  });
  const up = (ev) => { pointers.delete(ev.pointerId); if (!pointers.size) { drag = null; svg.style.cursor = "grab"; } };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up); svg.addEventListener("pointerleave", (ev) => { if (!pointers.size) endHover(); });
  svg.addEventListener("wheel", (ev) => {
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); zoom(Math.exp(ev.deltaY * 0.01), fracAt(ev)); }          // pinch on a trackpad arrives as ctrl+wheel
    else if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) * 1.5) { ev.preventDefault(); pan(ev.deltaX / svg.getBoundingClientRect().width); }  // sideways scroll moves through time
  }, { passive: false });
  svg.addEventListener("dblclick", () => resetView());
  q("zi").onclick = () => zoom(0.55); q("zo").onclick = () => zoom(1 / 0.55); q("zr").onclick = () => resetView();
  q("zn").onclick = () => { const span = w1 - w0, e = bounds().end; [w0, w1] = clampWindow(null, e - span * 0.94, e + span * 0.06); preset = ""; render(true); };
  el.querySelectorAll(".chr button").forEach((b) => b.onclick = () => { preset = b.dataset.r; [w0, w1] = presetWindow(preset); [w0, w1] = clampWindow(null, w0, w1); hovering = false; render(); });
  el.querySelectorAll(".ctog button").forEach((b) => b.onclick = () => { if (b.dataset.ct === "line") { try { localStorage.setItem("ml_ctype", "line"); } catch (e) {} mountChart(el, data, opts); } });
  function resetView() { preset = opts.live ? "1D" : "6M"; [w0, w1] = presetWindow(preset); [w0, w1] = clampWindow(null, w0, w1); hovering = false; render(); }

  // live refresh while the market is open
  async function tick() {
    if (el._gen !== gen || !el.isConnected) { clearInterval(timer); return; }
    if (!opts.live || document.hidden || hovering || drag || loading) return;
    await ensureTier("m1", true);
    if (preset) { const end = bounds().end; if (preset === "1D" || preset === "1W") { [w0, w1] = presetWindow(preset); } else { const sp = w1 - w0; w1 = end + 86400; w0 = w1 - sp; } }
    render(true);
  }
  const timer = setInterval(tick, POLL_MS);

  // first paint: default view = today
  (async () => {
    q("z").textContent = "Loading…";
    if (opts.live) await ensureTier("m1");
    await ensureTier("d1");
    preset = opts.live && tiers.m1 && tiers.m1.length ? "1D" : "6M";
    [w0, w1] = presetWindow(preset); [w0, w1] = clampWindow(null, w0, w1);
    render();
  })();
}
