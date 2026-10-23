// The home-page globe: a slowly spinning Earth with real day and night (from the sun's actual position), time-zone bands, country borders and codes.
// Hover a country for ~2 seconds for its name, local time, economic-health score and currency; double-click for the full economy breakdown in a side panel.
// Facts only. The 0-100 score is a transparent yardstick from IMF numbers, not a rating or a forecast. Imagery: NASA Visible Earth (public domain). Borders: Natural Earth.
const GLOBE = { THREE: null, g: null, assets: null };
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
const G_R = Math.PI / 180;
const gVec = (lat, lon) => [Math.cos(lat * G_R) * Math.cos(lon * G_R), Math.sin(lat * G_R), -Math.cos(lat * G_R) * Math.sin(lon * G_R)];   // matches three's SphereGeometry u/v layout
const gFlag = (iso2) => (iso2 && iso2 !== "XK" ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "");
const G_STATE = { ok: ["Healthy", "#2fd4a0"], watch: ["Watch", "#f5b546"], bad: ["Strained", "#ff6b6b"] };

// ---- sun position (where it is directly overhead right now) ----
function gSun(d = new Date()) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0), n = Math.floor((d - start) / 864e5), B = (2 * Math.PI * (n - 81)) / 364;
  const eq = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // equation of time, minutes
  const dec = 23.44 * Math.sin((2 * Math.PI * (n - 81)) / 365), h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return { lat: dec, lon: -(h - 12 + eq / 60) * 15 };
}

async function gLoadAssets() {
  if (GLOBE.assets) return GLOBE.assets;
  const [borders, countries, world] = await Promise.all([loadJson("world/borders.json"), loadJson("world/countries.json"), loadJson("world/world.json")]);
  if (!borders || !countries) throw new Error("globe data missing");
  GLOBE.assets = { borders: borders.c, countries, world };
  return GLOBE.assets;
}

// ---- which country is at a longitude/latitude? (grid index over polygon bounding boxes, then even-odd point-in-polygon) ----
function gIndex(list) {
  const grid = new Map();
  list.forEach((c, ci) => {
    c.poly = c.p.map((rings) => rings.map((r) => r));
    c.polyBox = c.p.map((rings) => { let a = 1e9, b = 1e9, x = -1e9, y = -1e9; const r = rings[0]; for (let i = 0; i < r.length; i += 2) { if (r[i] < a) a = r[i]; if (r[i] > x) x = r[i]; if (r[i + 1] < b) b = r[i + 1]; if (r[i + 1] > y) y = r[i + 1]; } return [a, b, x, y]; });
    c.polyBox.forEach((bb) => { for (let gx = Math.floor(bb[0] / 3); gx <= Math.floor(bb[2] / 3); gx++) for (let gy = Math.floor(bb[1] / 3); gy <= Math.floor(bb[3] / 3); gy++) { const k = gx + "," + gy; if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(ci); } });
  });
  const inRing = (r, x, y) => { let ins = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) ins = !ins; } return ins; };
  return (lon, lat) => {
    const s = grid.get(Math.floor(lon / 3) + "," + Math.floor(lat / 3)); if (!s) return -1;
    for (const ci of s) {
      const c = list[ci];
      for (let pi = 0; pi < c.poly.length; pi++) {
        const bb = c.polyBox[pi]; if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
        const rings = c.poly[pi]; if (!inRing(rings[0], lon, lat)) continue;
        let hole = false; for (let h = 1; h < rings.length; h++) if (inRing(rings[h], lon, lat)) { hole = true; break; }
        if (!hole) return ci;
      }
    }
    return -1;
  };
}

function gCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function gTzTexture(THREE) {
  const W = 4096, H = 2048, c = gCanvas(W, H), x = c.getContext("2d");
  for (let k = 0; k < 24; k++) {   // 24 bands, each 15 degrees wide, centered on whole-hour meridians
    const lon0 = -180 + (k - 0.5) * 15, x0 = ((lon0 + 180) / 360) * W;
    if (k % 2 === 0) { x.fillStyle = "rgba(140,175,255,0.055)"; x.fillRect(x0, 0, W / 24, H); }
  }
  x.strokeStyle = "rgba(190,215,255,0.16)"; x.lineWidth = 2;
  for (let k = 0; k <= 24; k++) { const xx = (((-180 + (k - 0.5) * 15) + 180) / 360) * W; x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); }
  x.fillStyle = "rgba(225,236,255,0.5)"; x.font = "600 26px -apple-system, system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  for (let k = 0; k < 24; k++) { const off = k - 12 + 0, lon = off * 15; if (off < -12 || off > 11) continue; x.fillText("UTC" + (off === 0 ? "" : off > 0 ? "+" + off : "−" + -off), ((lon + 180) / 360) * W, H / 2 + 22); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const G_EARTH_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){ vUv = uv; vN = normal; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const G_EARTH_FS = `precision highp float; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float time;
void main(){
  vec3 n = normalize(vN); vec3 view = normalize(cameraPosition - vP);
  float nd = dot(n, sunDir);
  float day = smoothstep(-0.10, 0.20, nd);
  vec3 d = texture2D(dayMap, vUv).rgb;
  float ocean = smoothstep(0.0, 0.05, d.b - d.g) * (1.0 - smoothstep(0.30, 0.50, d.r));
  vec3 land = pow(d, vec3(0.88)) * 1.16 + vec3(0.012);
  vec3 sea = vec3(0.020, 0.105, 0.285) + d * vec3(0.9, 2.0, 3.4);
  sea = mix(sea, vec3(0.05, 0.42, 0.62), smoothstep(0.10, 0.45, d.g) * 0.8);
  vec3 dayC = mix(land, sea, ocean);
  float cl = texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0)).r;
  cl = smoothstep(0.30, 0.95, cl);
  dayC = mix(dayC, vec3(1.0), cl * 0.50);
  float lam = clamp(nd * 0.9 + 0.35, 0.0, 1.2);
  dayC *= lam;
  vec3 h = normalize(sunDir + view);
  float spec = pow(max(dot(n, h), 0.0), 120.0) * ocean * (1.0 - cl) * 0.55;
  dayC += vec3(1.0, 0.95, 0.85) * spec * smoothstep(0.0, 0.3, nd);
  vec3 nl = texture2D(nightMap, vUv).rgb;
  vec3 nightC = d * vec3(0.060, 0.090, 0.175) + vec3(0.006, 0.012, 0.030) + pow(nl, vec3(1.05)) * vec3(2.3, 1.7, 1.05) * (1.0 - cl * 0.7);
  vec3 col = mix(nightC, dayC, day);
  float tw = exp(-pow(nd * 5.0, 2.0));
  col += vec3(0.95, 0.42, 0.20) * tw * 0.11 * (0.4 + ocean * 0.6);
  float f = pow(1.0 - max(dot(n, view), 0.0), 3.2);
  col += vec3(0.28, 0.55, 1.0) * f * (0.20 + 0.55 * day);
  gl_FragColor = vec4(col, 1.0);
}`;
const G_ATM_VS = `varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const G_ATM_FS = `varying vec3 vNormal; void main(){ float i = pow(clamp(0.78 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0); gl_FragColor = vec4(0.32, 0.58, 1.0, 1.0) * i * 1.25; }`;

function globeDispose() {
  const g = GLOBE.g; if (!g) return;
  g.dead = true; cancelAnimationFrame(g.raf); clearTimeout(g.hoverTimer); clearInterval(g.clock);
  g.ro && g.ro.disconnect(); g.io && g.io.disconnect();
  document.removeEventListener("keydown", g.onKey);
  g.cleanup.forEach((f) => { try { f(); } catch (e) {} });
  try { g.renderer.dispose(); g.renderer.forceContextLoss(); } catch (e) {}
  GLOBE.g = null;
}

async function globeMount(host) {
  if (!host) return;
  let A;
  try { [GLOBE.THREE, A] = await Promise.all([GLOBE.THREE || import(THREE_URL), gLoadAssets()]); } catch (e) { console.error("globe unavailable", e); host.classList.add("nogl"); host.querySelector(".gload").innerHTML = "<span>The globe couldn't load. The rest of the site works as usual.</span>"; return; }
  if (!document.body.contains(host)) return;
  const THREE = GLOBE.THREE, stage = host.querySelector(".globe-stage"), labelsEl = host.querySelector(".glabels"), loadEl = host.querySelector(".gload");
  const coarse = window.matchMedia("(pointer: coarse)").matches, reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x02040a, 1);
  stage.appendChild(renderer.domElement); renderer.domElement.className = "gcanvas";
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  const g = GLOBE.g = { renderer, dead: false, raf: 0, cleanup: [], lon: 20, lat: 18, dist: 3.4, tLon: null, spin: 1, vLon: 0, vLat: 0, hover: -1, shown: -1, sel: -1, userZoom: false, pointer: null, panelOpen: false, t0: performance.now() };

  // textures
  const tl = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (u, srgb) => new Promise((res, rej) => tl.load(u, (t) => { t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; res(t); }, undefined, rej));
  const base = "assets/earth/";
  let day, night, cloud;
  try { [day, night, cloud] = await Promise.all([load(base + "day.jpg"), load(base + "night.jpg"), load(base + "clouds.jpg")]); } catch (e) { console.error(e); loadEl.innerHTML = "<span>The globe's imagery couldn't load.</span>"; renderer.dispose(); return; }
  if (g.dead) return;

  const sunV = new THREE.Vector3(), sun = gSun(); sunV.set(...gVec(sun.lat, sun.lon));
  const earthMat = new THREE.ShaderMaterial({ uniforms: { dayMap: { value: day }, nightMap: { value: night }, cloudMap: { value: cloud }, sunDir: { value: sunV }, time: { value: 0 } }, vertexShader: G_EARTH_VS, fragmentShader: G_EARTH_FS });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 110), earthMat); scene.add(earth);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.075, 96, 64), new THREE.ShaderMaterial({ vertexShader: G_ATM_VS, fragmentShader: G_ATM_FS, blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false })); scene.add(atm);
  // stars
  const sp = new Float32Array(3000 * 3), sc = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), R = 60 + Math.random() * 20; sp.set([R * r * Math.cos(a), R * u, R * r * Math.sin(a)], i * 3); const b = 0.35 + Math.random() * 0.65, tint = Math.random(); sc.set([b * (0.85 + 0.15 * tint), b * 0.92, b], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })));

  // overlays: time zones, highlight, borders
  const tz = new THREE.Mesh(new THREE.SphereGeometry(1.0015, 96, 64), new THREE.MeshBasicMaterial({ map: gTzTexture(THREE), transparent: true, depthWrite: false })); scene.add(tz);
  const HW = coarse ? 2048 : 4096, hc = gCanvas(HW, HW / 2), hx = hc.getContext("2d"), htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace; htex.anisotropy = 4;
  const hl = new THREE.Mesh(new THREE.SphereGeometry(1.0022, 96, 64), new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false })); scene.add(hl);
  const list = A.borders, lookup = gIndex(list);
  const ringSegs = (rings, out) => {
    for (const r of rings) for (let i = 0; i + 3 < r.length; i += 2) {
      let x0 = r[i], y0 = r[i + 1], x1 = r[i + 2], y1 = r[i + 3];
      if ((Math.abs(x0) > 179.9 && Math.abs(x1) > 179.9) || (y0 < -89.9 && y1 < -89.9)) continue;   // seams cut at the dateline and the pole are not borders
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.2));
      for (let s = 0; s < n; s++) { const a = s / n, b = (s + 1) / n; out.push(...gVec(y0 + (y1 - y0) * a, x0 + (x1 - x0) * a), ...gVec(y0 + (y1 - y0) * b, x0 + (x1 - x0) * b)); }
    }
  };
  const bpos = []; list.forEach((c) => c.p.forEach((rings) => ringSegs(rings, bpos)));
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bpos.map((v) => v * 1.0032)), 3));
  scene.add(new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.34, depthWrite: false })));
  let hline = null;
  const setHighlight = (ci) => {
    hx.clearRect(0, 0, hc.width, hc.height);
    if (hline) { scene.remove(hline); hline.geometry.dispose(); hline = null; }
    if (ci >= 0) {
      const c = list[ci], X = (lon) => ((lon + 180) / 360) * hc.width, Y = (lat) => ((90 - lat) / 180) * hc.height;
      hx.fillStyle = "rgba(255,255,255,0.20)"; hx.strokeStyle = "rgba(255,255,255,0.0)";
      for (const rings of c.p) { hx.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i += 2) i ? hx.lineTo(X(r[i]), Y(r[i + 1])) : hx.moveTo(X(r[i]), Y(r[i + 1])); hx.closePath(); } hx.fill("evenodd"); }
      const hp = []; c.p.forEach((rings) => ringSegs(rings, hp));
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(hp.map((v) => v * 1.0036)), 3));
      hline = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })); scene.add(hline);
    }
    htex.needsUpdate = true;
  };

  // labels (HTML, so the text stays crisp)
  const labs = list.filter((c) => c.i && A.countries[c.i] && c.ar > 1500).map((c) => { const el = document.createElement("span"); el.className = "glabel"; el.textContent = c.i; labelsEl.appendChild(el); return { c, el, v: gVec(c.lp[1], c.lp[0]), size: Math.sqrt(c.ar) / 6371 }; });

  // sizing
  const fit = () => { const W = stage.clientWidth, H = stage.clientHeight, half = Math.min(Math.atan(Math.tan(17.5 * G_R) * (W / H)), 17.5 * G_R); return 1 / Math.sin(0.78 * half); };
  const resize = () => { const W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return; renderer.setSize(W, H, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = W / H; camera.updateProjectionMatrix(); if (!g.userZoom) g.dist = fit(); g.minD = Math.max(1.28, fit() * 0.42); g.maxD = fit() * 1.45; };
  g.ro = new ResizeObserver(resize); g.ro.observe(stage); resize();
  g.io = new IntersectionObserver((e) => { g.visible = e[0].isIntersecting; }, { threshold: 0.02 }); g.io.observe(host); g.visible = true;

  // pick a country under a screen point
  const ray = new THREE.Vector3(), cam = new THREE.Vector3();
  const pick = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = -((cy - r.top) / r.height) * 2 + 1;
    ray.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const o = camera.position, b = o.dot(ray), c = o.dot(o) - 1, disc = b * b - c; if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc), px = o.x + t * ray.x, py = o.y + t * ray.y, pz = o.z + t * ray.z;
    return lookup((Math.atan2(-pz, px) / G_R), Math.asin(Math.max(-1, Math.min(1, py))) / G_R);
  };

  // info card
  const card = host.querySelector(".gcard"), hideCard = () => { card.hidden = true; g.shown = -1; clearInterval(g.clock); };
  const timeFor = (tzName) => { try { return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone: tzName, timeZoneName: "short", weekday: "short" }).format(new Date()); } catch (e) { return ""; } };
  const showCard = (ci, cx, cy) => {
    const c = list[ci], meta = c.i && A.countries[c.i], w = c.i && A.world.countries[c.i], r = host.getBoundingClientRect();
    g.shown = ci;
    const sc = w && w.score != null ? `<div class="gc-score"><svg viewBox="0 0 44 44" width="52" height="52"><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="5"/><circle cx="22" cy="22" r="18" fill="none" stroke="${G_STATE[w.state][1]}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(w.score / 100) * 113.1} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${w.score}</text></svg>
      <div><div class="gc-k">Economic health</div><b style="color:${G_STATE[w.state][1]}">${G_STATE[w.state][0]}</b> <span class="gc-k">${w.score} / 100</span></div></div>` : `<div class="gc-k" style="margin-top:8px">Not enough economic data to score this one.</div>`;
    let cur = "";
    if (w && w.cur) {
      const x = w.cur;
      if (x.usd) cur = `<div class="gc-row"><span class="gc-k">Currency</span><b>US dollar (the home currency)</b></div>`;
      else {
        const d = x.y1, up = d != null && d > 0, col = d == null ? "#9fb0c8" : "#c9d6ea";
        cur = `<div class="gc-row"><span class="gc-k">${esc(x.name || x.code)}</span><b>$1 = ${fxPer(x.per)} ${esc(x.code)}</b></div>
          <div class="gc-row"><span class="gc-k">Dollar over 1 year</span><b>${d == null ? "-" : `<span style="color:${col}">${up ? "+" : ""}${Math.abs(d) >= 100 ? Math.round(d) : d.toFixed(1)}%</span>`}</b>${x.spark && typeof cgSpark === "function" ? `<span>${cgSpark(x.spark, 74, 22, "#7fb4ff")}</span>` : ""}</div>${x.peg ? `<div class="gc-k">Pegged: held close to the ${x.peg === "usd" ? "dollar" : "euro"} by policy</div>` : ""}`;
      }
    }
    card.innerHTML = `<div class="gc-head"><span class="gc-flag">${gFlag(meta && meta.iso2)}</span><div><b class="gc-name">${esc((meta && meta.name) || c.n)}</b><div class="gc-k">${meta ? esc(meta.capital || "") + (meta.region ? " · " + esc(meta.region) : "") : "Disputed or special territory"}</div></div></div>
      ${meta && meta.tz ? `<div class="gc-row"><span class="gc-k">Local time</span><b class="gc-time">${esc(timeFor(meta.tz))}</b></div>` : ""}${sc}${cur}
      ${meta ? `<div class="gc-hint">Double-click for the full economy</div>` : ""}`;
    card.hidden = false;
    const cw = 280, chh = card.offsetHeight || 240; let x = cx - r.left + 18, y = cy - r.top + 14;
    if (x + cw > r.width - 8) x = cx - r.left - cw - 18; if (y + chh > r.height - 8) y = r.height - chh - 8; card.style.left = Math.max(8, x) + "px"; card.style.top = Math.max(8, y) + "px";
    clearInterval(g.clock); if (meta && meta.tz) g.clock = setInterval(() => { const t = card.querySelector(".gc-time"); if (t) t.textContent = timeFor(meta.tz); }, 1000);
  };

  // opening the side panel for a country
  const panel = host.querySelector(".gpanel");
  const openPanel = (ci) => {
    const c = list[ci]; if (!c.i || !A.countries[c.i]) return;
    hideCard(); g.sel = ci; g.panelOpen = true; host.classList.add("with-panel"); setHighlight(ci);
    panel.hidden = false; panel.innerHTML = `<div class="muted" style="padding:24px">Loading ${esc(A.countries[c.i].name)}…</div>`;
    const ext = Math.max((c.b[2] - c.b[0]) * Math.cos(c.lp[1] * G_R), c.b[3] - c.b[1]);
    g.tLon = { lon: c.lp[0], lat: Math.max(-60, Math.min(70, c.lp[1])), dist: Math.max(1.9, Math.min(3.4, 1.7 + ext / 45)), t0: performance.now(), l0: g.lon, a0: g.lat, d0: g.dist, userZoom: true };
    g.userZoom = true;
    gPanelRender(panel, c.i, A, () => closePanel());
    setTimeout(resize, 360);
  };
  const closePanel = () => { g.panelOpen = false; g.sel = -1; host.classList.remove("with-panel"); panel.hidden = true; panel.innerHTML = ""; g.userZoom = false; setHighlight(-1); setTimeout(resize, 360); };
  g.onKey = (e) => { if (e.key === "Escape" && g.panelOpen) closePanel(); };
  document.addEventListener("keydown", g.onKey);

  // pointer input: drag to rotate, wheel/pinch to zoom, hover 2s for the card, double-click (or double-tap) for the panel
  const el = renderer.domElement, pts = new Map(); let drag = null, lastTap = 0, lastTapPos = null, pinch0 = null;
  const setHover = (ci, cx, cy) => {
    if (ci !== g.hover) { g.hover = ci; clearTimeout(g.hoverTimer); if (g.shown !== -1) hideCard(); if (g.sel < 0) setHighlight(ci); el.style.cursor = ci >= 0 ? "pointer" : "grab"; if (ci >= 0 && !coarse) g.hoverTimer = setTimeout(() => { if (g.hover === ci && !drag) showCard(ci, g.pointer.x, g.pointer.y); }, 2000); }
  };
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() }; g.tLon = null; g.vLon = g.vLat = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: g.dist }; } hideCard(); });
  el.addEventListener("pointermove", (e) => {
    g.pointer = { x: e.clientX, y: e.clientY };
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; g.dist = Math.max(g.minD, Math.min(g.maxD, pinch0.dist * (pinch0.d / Math.hypot(a.x - b.x, a.y - b.y)))); g.userZoom = true; return; }
    if (drag && pts.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 4) { const k = 0.22 * Math.min(1.2, (g.dist - 0.8) / 2.2); g.lon -= dx * k; g.lat = Math.max(-85, Math.min(85, g.lat + dy * k)); g.vLon = -dx * k; g.vLat = dy * k; hideCard(); clearTimeout(g.hoverTimer); }
      return;
    }
    if (e.pointerType === "mouse") setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
  });
  const up = (e) => {
    const wasTap = drag && drag.moved < 6 && performance.now() - drag.t < 350; pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; const had = drag; if (!pts.size) drag = null;
    if (!wasTap || !had) return;
    const ci = pick(e.clientX, e.clientY), now = performance.now();
    if (e.pointerType !== "mouse") {   // touch: tap shows the card, double-tap opens the panel
      if (now - lastTap < 350 && lastTapPos && Math.hypot(lastTapPos.x - e.clientX, lastTapPos.y - e.clientY) < 30 && ci >= 0) { lastTap = 0; openPanel(ci); return; }
      lastTap = now; lastTapPos = { x: e.clientX, y: e.clientY }; g.hover = ci; if (ci >= 0) { setHighlight(ci); showCard(ci, e.clientX, e.clientY); } else { hideCard(); setHighlight(-1); }
    }
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("dblclick", (e) => { const ci = pick(e.clientX, e.clientY); if (ci >= 0) openPanel(ci); });
  el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { g.pointer = null; setHover(-1); } });
  el.addEventListener("wheel", (e) => { e.preventDefault(); g.dist = Math.max(g.minD, Math.min(g.maxD, g.dist * Math.exp(e.deltaY * 0.0012))); g.userZoom = true; hideCard(); }, { passive: false });
  host.querySelector(".gscroll") && host.querySelector(".gscroll").addEventListener("click", () => { const rest = document.querySelector("#homerest"); if (rest) rest.scrollIntoView({ behavior: "smooth" }); });

  // frame loop
  let prev = performance.now(), lastSun = 0;
  const frame = (now, force) => {
    if (g.dead) return; if (!force) g.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!force && (!g.visible || document.hidden) && g.drawn) return;
    const hovering = g.hover >= 0 || g.panelOpen || drag;
    g.spin += ((hovering || reduce ? 0 : 1) - g.spin) * Math.min(1, dt * 3);
    if (g.tLon) {   // eased fly-to for a double-clicked country
      const k = Math.min(1, (now - g.tLon.t0) / 900), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      let dl = ((g.tLon.lon - g.tLon.l0 + 540) % 360) - 180; g.lon = g.tLon.l0 + dl * e; g.lat = g.tLon.a0 + (g.tLon.lat - g.tLon.a0) * e; g.dist = g.tLon.d0 + (Math.max(g.minD, Math.min(g.maxD, g.tLon.dist * (stage.clientWidth < 700 ? 1.25 : 1))) - g.tLon.d0) * e; if (k >= 1) g.tLon = null;
    } else {
      g.lon -= 2.2 * g.spin * dt; if (!drag) { g.lon += g.vLon; g.lat = Math.max(-85, Math.min(85, g.lat + g.vLat)); g.vLon *= 0.93; g.vLat *= 0.93; }
    }
    g.lon = ((g.lon + 540) % 360) - 180;
    if (now - lastSun > 20000) { const s = gSun(); sunV.set(...gVec(s.lat, s.lon)); lastSun = now; }
    earthMat.uniforms.time.value = (now - g.t0) / 1000;
    const v = gVec(g.lat, g.lon); camera.position.set(v[0] * g.dist, v[1] * g.dist, v[2] * g.dist); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // labels
    cam.set(v[0], v[1], v[2]); const H = stage.clientHeight, W = stage.clientWidth, ppu = H / (2 * Math.tan(17.5 * G_R) * Math.max(0.3, g.dist - 1));
    for (const L of labs) {
      const f = L.v[0] * cam.x + L.v[1] * cam.y + L.v[2] * cam.z;
      const px = L.size * ppu * f; let o = f > 0.14 ? Math.min(1, (f - 0.14) / 0.3) : 0; if (px < 30) o = 0; else if (px < 44) o *= (px - 30) / 14;
      if (o <= 0.02) { if (L.on) { L.el.style.opacity = 0; L.on = false; } continue; }
      const p = new THREE.Vector3(L.v[0], L.v[1], L.v[2]).project(camera);
      L.el.style.transform = `translate3d(${((p.x + 1) / 2) * W}px, ${((1 - p.y) / 2) * H}px, 0) translate(-50%, -50%)`; L.el.style.opacity = o * (L.c === list[g.hover] || L.c === list[g.sel] ? 1 : 0.62); L.on = true;
    }
    renderer.render(scene, camera); g.drawn = true;
  };
  g.frame = frame; g.scene = scene; g.camera = camera;
  g.raf = requestAnimationFrame(frame);
  host.classList.add("ready"); loadEl.hidden = true;
  g.cleanup.push(() => { renderer.domElement.remove(); labelsEl.innerHTML = ""; });
}

// ---- the side panel: full economy breakdown for one country ----
function gChartSvg(vals, years, o) {
  const w = 540, h = 150, pad = { l: 44, r: 10, t: 12, b: 22 }, ref = o.refYear, pts = vals.map((v, i) => [years[i], v]).filter((p) => p[1] != null);
  if (pts.length < 3) return `<p class="small muted" style="margin:0">Not enough history.</p>`;
  const us = (o.us || []).map((v, i) => [years[i], v]).filter((p) => p[1] != null);
  const all = pts.concat(o.us ? us : []).map((p) => p[1]); let lo = Math.min(...all), hi = Math.max(...all); if (lo === hi) { lo -= 1; hi += 1; } const padv = (hi - lo) * 0.12; lo -= padv; hi += padv; if (lo < 0 && Math.min(...all) >= 0) lo = 0;
  const X = (y) => pad.l + ((y - years[0]) / (years[years.length - 1] - years[0])) * (w - pad.l - pad.r), Y = (v) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b);
  const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(o.dec > 0 ? 1 : 0));
  const ticks = [lo + padv, (lo + hi) / 2, hi - padv];
  const path = (a) => a.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const hist = pts.filter((p) => p[0] <= ref), proj = pts.filter((p) => p[0] >= ref);
  const zero = lo < 0 && hi > 0 ? `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="2 3" opacity=".6"/>` : "";
  return `<svg viewBox="0 0 ${w} ${h}" class="gch" data-lo="${lo}" style="width:100%;height:auto;display:block;touch-action:none" role="img" aria-label="${esc(o.label)}, ${years[0]} to ${years[years.length - 1]}">
    <rect x="${X(ref).toFixed(1)}" y="${pad.t}" width="${(w - pad.r - X(ref)).toFixed(1)}" height="${h - pad.t - pad.b}" fill="var(--brand)" opacity=".07"/><text x="${(X(ref) + 4).toFixed(1)}" y="${pad.t + 10}" font-size="9" fill="var(--mut)">IMF estimates</text>
    ${ticks.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pad.l - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--mut)">${fmt(v)}</text>`).join("")}${zero}
    ${[years[0], 2010, 2020, years[years.length - 1]].map((y) => `<text x="${X(y).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="9.5" fill="var(--mut)">${y}</text>`).join("")}
    ${o.us && us.length > 2 ? `<path d="${path(us)}" fill="none" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>` : ""}
    <path d="${path(hist)}" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="${path(proj)}" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.filter((p) => p[0] === ref).map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.6" fill="var(--brand)"/>`).join("")}
    <g class="gch-guide" style="display:none"><line y1="${pad.t}" y2="${h - pad.b}" stroke="var(--tx)" opacity=".4"/><circle r="4" fill="var(--brand)" stroke="var(--bg)" stroke-width="1.5"/></g></svg>
    ${o.us ? `<div class="small muted" style="margin-top:2px"><span style="color:var(--brand)">▬</span> this country &nbsp; <span>- - -</span> United States</div>` : ""}<div class="small gch-read" style="min-height:18px;margin-top:2px"></div>`;
}
function gWireCharts(root, series, years) {
  root.querySelectorAll("[data-gk]").forEach((card) => {
    const svg = card.querySelector("svg.gch"); if (!svg) return; const vals = series[card.dataset.gk], dec = +card.dataset.dec, unit = card.dataset.unit, read = card.querySelector(".gch-read"), guide = svg.querySelector(".gch-guide");
    const move = (ev) => { const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * 540, i = Math.max(0, Math.min(years.length - 1, Math.round(((x - 44) / (540 - 54)) * (years.length - 1)))); if (vals[i] == null) return; const px = 44 + (i / (years.length - 1)) * (540 - 54);
      const all = vals.filter((v) => v != null), cy = svg.querySelector("path[stroke-width='2.4']"); guide.style.display = ""; guide.querySelector("line").setAttribute("x1", px); guide.querySelector("line").setAttribute("x2", px);
      const lo = +svg.dataset.lo, mx = Math.max(...all.concat((series._us && series._us[card.dataset.gk] || []).filter((v) => v != null))), pad = (mx - Math.min(...all)) * 0.12; const hi = mx + pad; guide.querySelector("circle").setAttribute("cx", px); guide.querySelector("circle").setAttribute("cy", 12 + ((hi - vals[i]) / (hi - lo)) * (150 - 34));
      read.innerHTML = `<b>${years[i]}</b>: ${Math.abs(vals[i]) >= 1000 ? Math.round(vals[i]).toLocaleString() : vals[i].toFixed(dec)} ${esc(unit)}`; };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", () => { guide.style.display = "none"; read.textContent = ""; });
  });
}

async function gPanelRender(panel, iso, A, onClose) {
  const meta = A.countries[iso], w = A.world.countries[iso], WM = A.world;
  let S = GLOBE.series; if (!S) { S = GLOBE.series = await loadJson("world/world-series.json"); }
  if (!panel.isConnected || panel.hidden) return;
  const ser = (S && S.s[iso]) || {}, usS = (S && S.s.USA) || {}, years = S ? S.years : [], ref = WM.ref_year, st = w && w.state ? G_STATE[w.state] : null;
  const pop = w && w.pop, tzStr = meta.tz ? (() => { try { return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone: meta.tz, timeZoneName: "short" }).format(new Date()); } catch (e) { return ""; } })() : "";
  const money = (v) => (v == null ? "-" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + " trillion" : "$" + v.toFixed(v >= 100 ? 0 : 1) + " billion");
  const ring = w && w.score != null ? `<svg viewBox="0 0 44 44" width="92" height="92"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="22" cy="22" r="18" fill="none" stroke="${st[1]}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(w.score / 100) * 113.1} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle" font-size="12" font-weight="800" fill="var(--tx)">${w.score}</text></svg>` : "";
  const comps = (w ? w.comps : []).map((c) => { const r = WM.rules[c.k], m = WM.meta[c.k], stc = c.s >= 65 ? "#2fd4a0" : c.s >= 45 ? "#f5b546" : "#ff6b6b";
    return `<div class="gp-comp"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.label)}</b><span class="small">${c.k === "currency" ? (c.v > 0 ? "+" : "") + c.v + "% (dollar, 1y)" : c.v + " " + (m ? esc(m.unit) : "")} <span class="muted">${c.y}</span></span></div>
      <div class="gp-bar"><i style="width:${c.s}%;background:${stc}"></i></div><div class="small muted">${c.s} of 100 points · counts ${r.w}% · ${esc(r.rule)}</div></div>`; }).join("");
  const cur = w && w.cur;
  let curHtml = "";
  if (cur && cur.usd) curHtml = `<div class="card"><h3>Currency</h3><p style="margin:0">${esc(meta.name)} uses the <b>US dollar</b>, so there is no exchange rate to track. Its prices and interest rates follow US policy.</p></div>`;
  else if (cur) curHtml = `<div class="card"><h3>Currency: ${esc(cur.name || cur.code)} (${esc(cur.code)})</h3><div class="hz"><div class="card"><div class="small muted">$1 buys</div><b>${fxPer(cur.per)} ${esc(cur.code)}</b></div><div class="card"><div class="small muted">Dollar, 1 month</div><b>${fxChg(cur.d30)}</b></div><div class="card"><div class="small muted">Dollar, this year</div><b>${fxChg(cur.ytd)}</b></div><div class="card"><div class="small muted">Dollar, 1 year</div><b>${fxChg(cur.y1)}</b></div></div>
    ${cur.hist ? `<div id="gpfx" style="margin-top:10px"></div>` : ""}<p class="small muted" style="margin:8px 0 0">${cur.peg ? "This currency is pegged: its government holds it close to the " + (cur.peg === "usd" ? "dollar" : "euro") + ". " : ""}${cur.quirk ? "Irregular: official and street rates can differ widely, so this may mislead. " : ""}+ means the dollar buys more of it (the local currency weakened). <a href="#/markets/currencies/${esc(cur.code)}">Full currency page →</a></p></div>`;
  const keys = ["growth", "inflation", "unemployment", "debt", "ca", "fiscal", "gdppc"];
  const cards = keys.filter((k) => ser[k] && ser[k].some((v) => v != null)).map((k) => {
    const m = WM.meta[k], comp = w && w.comps.find((c) => c.k === k), a = ser[k], li = (() => { for (let y = ref; y >= ref - 3; y--) { const v = a[y - years[0]]; if (v != null) return [v, y]; } return [null, null]; })();
    const med = WM.median[k], rule = comp ? WM.rules[k] : null, show = (v) => (v == null ? "-" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(m.dec));
    return `<div class="card" data-gk="${k}" data-dec="${m.dec}" data-unit="${esc(m.unit)}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h3 style="margin:0">${esc(m.label)}</h3>${comp ? `<span class="pill" style="font-size:11px;font-weight:700;background:${comp.s >= 65 ? "#2fd4a022" : comp.s >= 45 ? "#f5b54622" : "#ff6b6b22"};color:${comp.s >= 65 ? "#12a97b" : comp.s >= 45 ? "#c98a10" : "#e5484d"}">${comp.s >= 65 ? "Healthy" : comp.s >= 45 ? "Watch" : "Strained"}</span>` : ""}</div>
      <div style="margin:4px 0 8px"><b style="font-size:26px">${show(li[0])}</b> <span class="small muted">${esc(m.unit)} · ${li[1] || ""}${li[1] >= ref ? " (IMF estimate)" : ""}</span>${med != null ? `<div class="small muted">Typical country: ${med}${m.unit === "%" || m.unit.startsWith("%") ? "" : " " + esc(m.unit)}${iso !== "USA" && usS[k] ? " · United States: " + show(usS[k][ref - years[0]]) : ""}</div>` : ""}</div>
      ${gChartSvg(a, years, { refYear: ref, dec: m.dec, label: m.label, us: iso !== "USA" ? usS[k] : null })}
      <p class="small" style="margin:8px 0 0"><b>What it is:</b> ${esc(m.what)} <b>Why it matters:</b> ${esc(m.why)}</p>${rule ? `<p class="small muted" style="margin:4px 0 0">How we score it: ${esc(rule.rule)}</p>` : ""}</div>`;
  }).join("");
  panel.innerHTML = `<div class="gp-head"><div><div class="small muted">${gFlag(meta.iso2)} ${esc(meta.region || "")}${meta.sub ? " · " + esc(meta.sub) : ""}</div><h2 style="margin:2px 0 0">${esc(meta.name)}</h2><div class="small muted">Capital ${esc(meta.capital || "-")}${tzStr ? " · " + esc(tzStr) : ""}</div></div><button class="gp-x" aria-label="Close">✕</button></div>
    ${iso === "USA" ? `<a class="btn" href="#/markets/economy" style="margin:10px 0 0">Open the full US economy dashboard →</a>` : ""}
    <div class="card" style="margin-top:12px"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${ring}<div style="flex:1;min-width:200px">${w && w.score != null ? `<span class="small muted">Economic health score</span><div><b style="font-size:22px;color:${st[1]}">${st[0]}</b> <span class="muted">${w.score} / 100</span></div><p class="small muted" style="margin:4px 0 0">${w.comps.length} readings. A yardstick built from IMF figures by fixed rules, not a rating, a forecast or investment advice.</p>` : `<b>Not enough data to score</b><p class="small muted" style="margin:4px 0 0">This country has too few of the IMF readings we use (at least four are needed).</p>`}</div></div>
      ${comps ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">How the score is built</summary><p class="small muted" style="margin:6px 0 8px">${esc(WM.rules._method)}</p>${comps}</details>` : ""}</div>
    <div class="hz"><div class="card"><div class="small muted">Population</div><b>${pop != null ? pop.toFixed(pop >= 100 ? 0 : 1) + " million" : "-"}</b></div><div class="card"><div class="small muted">Economy size</div><b>${money(w && w.gdp)}</b></div><div class="card"><div class="small muted">Income per person</div><b>${w && w.gdppc != null ? "$" + w.gdppc.toLocaleString() : "-"}</b></div>${meta.income ? `<div class="card"><div class="small muted">Income group</div><b>${esc(meta.income)}</b></div>` : ""}</div>
    ${curHtml}${cards}<p class="small muted">Sources: ${esc(WM.source)}. Years from ${ref} on are IMF estimates and projections and get revised. Educational information only. Not investment advice.</p>`;
  panel.scrollTop = 0; panel.querySelector(".gp-x").onclick = onClose;
  const seriesForWire = Object.assign({}, ser, { _us: usS }); gWireCharts(panel, seriesForWire, years);
  if (cur && cur.hist) fetch((DATA_BASE || "data/") + "fx/FX_" + cur.code + ".json").then((r) => (r.ok ? r.json() : null)).then((h) => { const box = panel.querySelector("#gpfx"); if (h && box && typeof mountChart === "function") mountChart(box, h, { money: false, decimals: fxDec(cur.per), lineOnly: true, noRanges: true, rangeName: "5 years" }); }).catch(() => {});
}

function globeHtml() {
  return `<section class="globe-wrap" id="globe" aria-label="Interactive globe of the world's economies">
    <div class="globe-stage"><div class="gload"><span>Loading the Earth…</span></div><div class="glabels"></div><div class="gcard" hidden></div>
      <div class="gui-top"><span class="gtag">Live day &amp; night · time zones</span></div>
      <div class="gui-bot"><div class="ghint"><b>Hover</b> a country for two seconds · <b>double-click</b> for its economy · drag to spin</div><button class="gscroll" aria-label="Scroll to markets">Markets today ↓</button></div><div class="gcredit">Imagery: NASA Visible Earth · Borders: Natural Earth · Economy: IMF</div></div>
    <aside class="gpanel" hidden></aside></section>`;
}
