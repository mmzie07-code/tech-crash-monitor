// Interactive price chart (hover/touch to scrub, range buttons, green/red by direction). No libraries.
const RANGES = [["1D", "live"], ["1W", "live"], ["1M", 30], ["3M", 91], ["6M", 182], ["YTD", "ytd"], ["1Y", 365], ["5Y", "all"]];
const LIVE_RANGE = { "1D": "1d", "1W": "5d" };
const dayToDate = (t) => new Date(Date.UTC(2000, 0, 1) + t * 864e5);
const fmtDate = (t) => dayToDate(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtStamp = (ts) => new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

function sliceRange(data, r) {
  const n = data.t.length, last = data.t[n - 1];
  let start = 0;
  if (typeof r === "number") { start = data.t.findIndex((t) => t >= last - r); if (start < 0) start = 0; }
  else if (r === "ytd") { const y = dayToDate(last).getUTCFullYear(); start = Math.max(0, data.t.findIndex((t) => dayToDate(t).getUTCFullYear() === y) - 1); }
  return { t: data.t.slice(start), c: data.c.slice(start) };
}

// data = {t:[days since 2000-01-01], c:[values]}; opts = {money: true (prices) | false (index level), label}
function mountChart(el, data, opts = {}) {
  const money = opts.money !== false, id = "ch" + Math.random().toString(36).slice(2, 7);
  let rng = "1Y", idx = RANGES.findIndex((x) => x[0] === "1Y"), view = null;
  const fmt = (v) => (money ? "$" : "") + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  el.innerHTML = `<div class="chh"><div class="chp" id="${id}p"></div><div class="chc small" id="${id}c"></div><div class="small muted" id="${id}d"></div></div>
   <div class="chw"><svg id="${id}s" viewBox="0 0 600 220" preserveAspectRatio="none" style="width:100%;height:220px;touch-action:pan-y;cursor:crosshair"></svg></div>
   <div class="chr">${RANGES.map(([l, n]) => `<button data-r="${l}" ${n === "live" && !opts.live ? 'disabled title="Sign in for live intraday charts"' : ""}>${l}</button>`).join("")}</div>`;
  const svg = el.querySelector("#" + id + "s"), P = el.querySelector("#" + id + "p"), C = el.querySelector("#" + id + "c"), D = el.querySelector("#" + id + "d");
  function header(i) {
    const v = view, cur = v.c[i], base = v.base != null ? v.base : v.c[0], ch = cur - base, pc = (cur / base - 1) * 100, up = ch >= 0;
    P.textContent = fmt(cur);
    C.innerHTML = `<span style="color:${up ? "var(--ok)" : "var(--bad)"};font-weight:700">${up ? "▲" : "▼"} ${money ? "$" : ""}${Math.abs(ch).toFixed(2)} (${up ? "+" : ""}${pc.toFixed(2)}%)</span> <span class="muted">${i === v.c.length - 1 ? (v.intraday ? (rng === "1D" ? "today" : "past 5 days") : "over " + rng) : "vs " + (v.base != null ? "previous close" : v.intraday ? fmtStamp(v.t[0]) : fmtDate(v.t[0]))}</span>`;
    D.textContent = v.intraday ? fmtStamp(v.t[i]) : fmtDate(v.t[i]);
  }
  async function draw() {
    const r = RANGES.find((x) => x[0] === rng);
    if (r[1] === "live") {
      P.textContent = "Loading…"; C.textContent = ""; D.textContent = "";
      try { const j = await opts.live(LIVE_RANGE[rng]); if (!j || !j.c || j.c.length < 2) throw new Error("empty"); view = { t: j.t, c: j.c, intraday: true, base: rng === "1D" && j.previousClose ? j.previousClose : null }; }
      catch (e) { rng = "1Y"; P.textContent = ""; return draw(); }
    } else view = sliceRange(data, r[1]);
    const c = view.c, lo = Math.min(...c), hi = Math.max(...c), pad = (hi - lo) * 0.08 || 1, W = 600, H = 220;
    const X = (i) => (i / (c.length - 1)) * W, Y = (v) => H - 10 - ((v - lo + pad * 0.5) / (hi - lo + pad)) * (H - 20);
    const up = c[c.length - 1] >= (view.base != null ? view.base : c[0]), col = up ? "var(--ok)" : "var(--bad)", pts = c.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    svg.innerHTML = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
     <line x1="0" x2="${W}" y1="${Y(view.base != null ? view.base : c[0])}" y2="${Y(view.base != null ? view.base : c[0])}" stroke="var(--mut)" stroke-opacity=".35" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
     <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#${id}g)"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
     <line id="${id}x" y1="0" y2="${H}" stroke="var(--mut)" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/>
     <circle id="${id}o" r="5" fill="${col}" stroke="var(--card)" stroke-width="2" vector-effect="non-scaling-stroke" style="display:none"/>`;
    header(c.length - 1);
    el.querySelectorAll(".chr button").forEach((b) => b.classList.toggle("on", b.dataset.r === rng));
    svg._X = X; svg._Y = Y;
  }
  function move(ev) {
    const rect = svg.getBoundingClientRect(), x = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1), i = Math.round(x * (view.c.length - 1));
    const xs = svg._X(i), ys = svg._Y(view.c[i]), line = svg.querySelector("#" + id + "x"), dot = svg.querySelector("#" + id + "o");
    line.setAttribute("x1", xs); line.setAttribute("x2", xs); line.style.display = ""; dot.setAttribute("cx", xs); dot.setAttribute("cy", ys); dot.style.display = "";
    header(i);
  }
  function leave() { svg.querySelector("#" + id + "x").style.display = "none"; svg.querySelector("#" + id + "o").style.display = "none"; header(view.c.length - 1); }
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", leave); svg.addEventListener("pointerdown", move);
  el.querySelectorAll(".chr button").forEach((b) => b.onclick = () => { if (b.disabled) return; rng = b.dataset.r; draw(); });
  draw();
}
