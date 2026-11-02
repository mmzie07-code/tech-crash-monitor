// The home-page globe: a slowly spinning Earth with real day and night (from the sun's actual position), time-zone bands, country borders and codes.
// Hover a country for ~2 seconds for its name, local time, economic-health score and currency; double-click for the full economy breakdown in a side panel.
// Facts only. The 0-100 score is a transparent yardstick from IMF numbers, not a rating or a forecast. Imagery: NASA Visible Earth (public domain). Borders: Natural Earth.
const GLOBE = { THREE: null, g: null, assets: null };
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
const G_R = Math.PI / 180;
const G_TRADE_COL = { box: "#4cc9ff", oil: "#ffb03a", bulk: "#7ee07a" };
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
  const [borders, countries, world, zones, mix, conflict, oilmap, trade, rare, minerals, macro, chips, cables, money] = await Promise.all([loadJson("world/borders.json"), loadJson("world/countries.json"), loadJson("world/world.json"), loadJson("world/timezones.json").catch(() => null), loadJson("world/mix.json").catch(() => null), loadJson("world/conflict.json").catch(() => null), loadJson("world/oilmap.json").catch(() => null), loadJson("world/trade.json").catch(() => null), loadJson("world/rare.json").catch(() => null), loadJson("world/minerals.json").catch(() => null), loadJson("world/macro.json").catch(() => null), loadJson("world/chips.json").catch(() => null), loadJson("world/cables.json").catch(() => null), loadJson("world/money.json").catch(() => null).catch(() => null)]);
  if (!borders || !countries) throw new Error("globe data missing");
  for (const k in countries) { const p = countries[k].parent; if (p && !world.countries[k] && world.countries[p]) world.countries[k] = world.countries[p]; }   // an overseas part is coloured and scored with its country
  GLOBE.assets = { borders: borders.c, countries, world, zones: zones && zones.z, mix: mix && mix.c ? mix : null, conflict: conflict && conflict.conflicts ? conflict : null, oil: oilmap && oilmap.fields ? oilmap : null, trade: trade && trade.routes ? trade : null, rare: rare && rare.fields ? rare : null, min: minerals && minerals.m ? minerals : null, macro: macro && macro.c ? macro : null, chips: chips && chips.fields ? chips : null, cables: cables && cables.cables ? cables : null, money: money && money.corridors ? money : null };
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
function gTzTexture(THREE, zones, land) {
  const W = 4096, H = 2048, c = gCanvas(W, H), x = c.getContext("2d"), X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
  const fc = gCanvas(W, H), fx = fc.getContext("2d");
  if (zones && zones.length) {   // the real, irregular time-zone areas (Natural Earth), tinted so neighbors differ
    const pal = ["rgba(120,160,255,0.085)", "rgba(170,205,255,0.040)", "rgba(185,160,255,0.075)", "rgba(110,215,230,0.055)", "rgba(145,185,255,0.100)", "rgba(210,215,255,0.035)"];
    for (const z of zones) { fx.fillStyle = pal[(z.c - 1) % 6]; for (const rings of z.p) { fx.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i += 2) i ? fx.lineTo(X(r[i]), Y(r[i + 1])) : fx.moveTo(X(r[i]), Y(r[i + 1])); fx.closePath(); } fx.fill("evenodd"); } }
    x.strokeStyle = "rgba(195,218,255,0.24)"; x.lineWidth = 2; x.lineJoin = "round"; x.beginPath();
    for (const z of zones) for (const rings of z.p) for (const r of rings) {
      let a = 1e9, b = 1e9, c2 = -1e9, d2 = -1e9; for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); c2 = Math.max(c2, r[i]); b = Math.min(b, r[i + 1]); d2 = Math.max(d2, r[i + 1]); }
      if (c2 - a < 9 && d2 - b < 9) continue;   // outlines of tiny island zones look like stray boxes
      for (let i = 0; i + 3 < r.length; i += 2) {
      if ((Math.abs(r[i]) > 179.9 && Math.abs(r[i + 2]) > 179.9) || (Math.abs(r[i + 1]) > 89.9 && Math.abs(r[i + 3]) > 89.9)) continue;   // edges of the map, not zone boundaries
      x.moveTo(X(r[i]), Y(r[i + 1])); x.lineTo(X(r[i + 2]), Y(r[i + 3]));
    } }
    x.stroke();
  } else {   // fallback: 24 straight 15-degree bands
    for (let k = 0; k < 24; k++) { if (k % 2 === 0) { x.fillStyle = "rgba(140,175,255,0.055)"; x.fillRect(X(-180 + (k - 0.5) * 15), 0, W / 24, H); } }
    x.strokeStyle = "rgba(190,215,255,0.16)"; x.lineWidth = 2; for (let k = 0; k <= 24; k++) { const xx = X(-180 + (k - 0.5) * 15); x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); }
  }
  if (land && zones && zones.length) {   // the odd boxes of ocean zones go; civil zones stay near land, open water gets clean 15-degree lines
    const m = gCanvas(W, H), mx = m.getContext("2d"); mx.fillStyle = "#fff"; mx.strokeStyle = "#fff"; mx.lineWidth = 34; mx.lineJoin = "round";
    const trace = (ctx) => { for (const co of land) for (const rings of co.p) { ctx.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i += 2) i ? ctx.lineTo(X(r[i]), Y(r[i + 1])) : ctx.moveTo(X(r[i]), Y(r[i + 1])); ctx.closePath(); } ctx.fill("evenodd"); ctx.stroke(); } };
    trace(mx); x.globalCompositeOperation = "destination-in"; x.drawImage(m, 0, 0); x.globalCompositeOperation = "source-over";
    const lm = gCanvas(W, H), lx = lm.getContext("2d"); lx.fillStyle = "#fff"; for (const co of land) for (const rings of co.p) { lx.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i += 2) i ? lx.lineTo(X(r[i]), Y(r[i + 1])) : lx.moveTo(X(r[i]), Y(r[i + 1])); lx.closePath(); } lx.fill("evenodd"); }
    fx.globalCompositeOperation = "destination-in"; fx.drawImage(lm, 0, 0); x.drawImage(fc, 0, 0);
    const o = gCanvas(W, H), ox = o.getContext("2d");
    for (let k = 2; k < 24; k += 2) { ox.fillStyle = "rgba(140,175,255,0.045)"; ox.fillRect(X(-180 + (k - 0.5) * 15), 0, W / 24, H); }
    ox.fillStyle = "rgba(165,170,180,0.055)"; ox.fillRect(0, 0, X(-172.5), H); ox.fillRect(X(172.5), 0, W - X(172.5), H);   // UTC\u00b112 straddles the dateline: both halves, one grey strip
    ox.strokeStyle = "rgba(190,215,255,0.20)"; ox.lineWidth = 2; for (let k = 0; k <= 24; k++) { const xx = X(-180 + (k - 0.5) * 15); ox.beginPath(); ox.moveTo(xx, 0); ox.lineTo(xx, H); ox.stroke(); }
    ox.globalCompositeOperation = "destination-out"; ox.fillStyle = "#000"; for (const co of land) for (const rings of co.p) { ox.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i += 2) i ? ox.lineTo(X(r[i]), Y(r[i + 1])) : ox.moveTo(X(r[i]), Y(r[i + 1])); ox.closePath(); } ox.fill("evenodd"); }
    x.drawImage(o, 0, 0);
  }
  x.fillStyle = "rgba(225,236,255,0.55)"; x.font = "600 26px -apple-system, system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  for (let off = -12; off <= 11; off++) x.fillText("UTC" + (off === 0 ? "" : off > 0 ? "+" + off : "\u2212" + -off), X(off * 15), H / 2 + 22);
  x.fillText("UTC\u221212", W, H / 2 + 22);   // the dateline strip: its label crosses the texture seam, so draw the other half too
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---- tint every country by its economic-health score (toggle) ----
function gHealthColor(score) {
  const stops = [[25, [255, 90, 95]], [55, [245, 181, 70]], [85, [47, 212, 160]]], s = Math.max(25, Math.min(85, score));
  const i = s <= 55 ? 0 : 1, [a, ca] = stops[i], [b, cb] = stops[i + 1], t = (s - a) / (b - a);
  return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
}
function gTintTexture(THREE, list, colorOf, coarse) {   // colorOf(feature) -> css colour for that country
  const W = coarse ? 2048 : 4096, c = gCanvas(W, W / 2), x = c.getContext("2d"), X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * (W / 2);
  for (const co of list) {
    x.fillStyle = colorOf(co);
    for (const rings of co.p) for (const off of [-360, 0, 360]) {   // unwrap rings that cross the dateline, draw them once on each side so no band is filled across the map
      x.beginPath();
      for (const r of rings) { let prev = null, shift = 0; for (let i = 0; i < r.length; i += 2) { let lo = r[i]; if (prev != null) { if (lo + shift - prev > 180) shift -= 360; else if (lo + shift - prev < -180) shift += 360; } lo += shift; prev = lo; i ? x.lineTo(X(lo + off), Y(r[i + 1])) : x.moveTo(X(lo + off), Y(r[i + 1])); } x.closePath(); }
      x.fill("evenodd");
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function gHeatTexture(THREE, fields, coarse, ramp) {   // a heat map of oil-producing regions: soft blobs added up, then run through a colour ramp
  const W = coarse ? 2048 : 4096, H = W / 2, c = gCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "lighter";
  for (const f of fields) {
    const r = ((2.6 + 1.5 * Math.sqrt(f.mbd)) / 360) * W, cx = ((f.lon + 180) / 360) * W, cy = ((90 - f.lat) / 180) * H, a = Math.min(0.9, 0.3 + 0.18 * Math.sqrt(f.mbd));
    x.save(); x.translate(cx, cy); x.scale(Math.min(2.6, 1 / Math.max(0.3, Math.cos(f.lat * G_R))), 1);
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, "rgba(255,255,255," + a + ")"); gr.addColorStop(0.45, "rgba(255,255,255," + a * 0.45 + ")"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, r, 0, 6.2832); x.fill(); x.restore();
  }
  const im = x.getImageData(0, 0, W, H), d = im.data, mix = (p, q, t) => p + (q - p) * t, R = ramp || [[150, 20, 20], [255, 90, 20], [255, 200, 60], [255, 245, 190]];
  for (let i = 0; i < d.length; i += 4) {
    const t = d[i] / 255;
    if (t < 0.02) { d[i + 3] = 0; continue; }
    const seg = t < 0.35 ? [R[0], R[1], t / 0.35] : t < 0.7 ? [R[1], R[2], (t - 0.35) / 0.35] : [R[2], R[3], (t - 0.7) / 0.3], rr = mix(seg[0][0], seg[1][0], seg[2]), gg = mix(seg[0][1], seg[1][1], seg[2]), bb = mix(seg[0][2], seg[1][2], seg[2]);
    d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = Math.min(235, 330 * t);
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function gStops(stops, v) {   // colour for a value on a ramp of [value, [r, g, b, alpha]] stops
  if (v <= stops[0][0]) return "rgba(" + stops[0][1].join(",") + ")";
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]), c = a[1].map((x, k) => x + (b[1][k] - x) * t); return "rgba(" + [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), c[3].toFixed(2)].join(",") + ")"; }
  return "rgba(" + stops[stops.length - 1][1].join(",") + ")";
}
const G_NODATA = "rgba(150,160,180,0.07)";
function gMid(a, b) {   // midpoint of two [lat, lon] points on the sphere, as [lat, lon]
  const p = gVec(a[0], a[1]), q = gVec(b[0], b[1]), m = [p[0] + q[0], p[1] + q[1], p[2] + q[2]], n = Math.hypot(...m) || 1;
  return [Math.asin(Math.max(-1, Math.min(1, m[1] / n))) / G_R, Math.atan2(-m[2] / n, m[0] / n) / G_R];
}
function gDate(iso) { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch (e) { return iso; } }
function gShare(v) { return v >= 10 ? v.toFixed(0) + "%" : v >= 1 ? v.toFixed(1) + "%" : v.toFixed(2) + "%"; }

const G_EARTH_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){ vUv = uv; vN = normal; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const G_EARTH_FS = `precision highp float; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float time;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 n = normalize(vN); vec3 view = normalize(cameraPosition - vP);
  float nd = dot(n, sunDir);
  float day = smoothstep(-0.16, 0.30, nd);
  vec2 px = vec2(1.0 / 5400.0, 1.0 / 2700.0);
  vec3 d = texture2D(dayMap, vUv).rgb;
  // land mask and a wide blur of it: gives coastlines, continental shelves and relief
  float ocean = smoothstep(0.0, 0.05, d.b - d.g) * (1.0 - smoothstep(0.30, 0.50, d.r));
  float land = 1.0 - ocean;
  float wide = 0.0;
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.7854; vec2 dir = vec2(cos(a), sin(a)); vec2 dir2 = vec2(cos(a + 0.3927), sin(a + 0.3927));
    vec3 s1 = texture2D(dayMap, vUv + dir * px * 7.0).rgb; vec3 s2 = texture2D(dayMap, vUv + dir2 * px * 15.0).rgb;
    wide += 2.0 - smoothstep(0.0, 0.05, s1.b - s1.g) * (1.0 - smoothstep(0.30, 0.50, s1.r)) - smoothstep(0.0, 0.05, s2.b - s2.g) * (1.0 - smoothstep(0.30, 0.50, s2.r)); }
  wide /= 16.0;
  // land: unsharp mask for crisp detail + a light emboss so ranges and coasts read as relief
  vec3 blur = (texture2D(dayMap, vUv + vec2(px.x, 0.0) * 2.0).rgb + texture2D(dayMap, vUv - vec2(px.x, 0.0) * 2.0).rgb + texture2D(dayMap, vUv + vec2(0.0, px.y) * 2.0).rgb + texture2D(dayMap, vUv - vec2(0.0, px.y) * 2.0).rgb) * 0.25;
  vec3 sharp = d + (d - blur) * 2.2;
  float hx = lum(texture2D(dayMap, vUv + vec2(px.x, 0.0) * 1.5).rgb) - lum(texture2D(dayMap, vUv - vec2(px.x, 0.0) * 1.5).rgb);
  float hy = lum(texture2D(dayMap, vUv + vec2(0.0, px.y) * 1.5).rgb) - lum(texture2D(dayMap, vUv - vec2(0.0, px.y) * 1.5).rgb);
  float relief = clamp((-hx * 0.8 + hy * 0.6) * 2.6, -0.35, 0.35);
  vec3 lc = pow(max(sharp, 0.0), vec3(0.86));
  lc = mix(vec3(lum(lc)), lc, 1.28);
  lc = lc * 1.12 * (1.0 + relief);
  // ocean: deep navy, bright teal over shallow shelves, a little lighter toward the limb
  float shelf = smoothstep(0.02, 0.55, wide);
  vec3 deep = vec3(0.012, 0.050, 0.150);
  vec3 mid = vec3(0.030, 0.150, 0.330);
  vec3 shal = vec3(0.070, 0.440, 0.560);
  vec3 sea = mix(deep, mid, smoothstep(0.0, 0.5, 1.0 - abs(n.y) * 0.4));
  sea = mix(sea, shal, shelf * 0.9);
  sea += d * vec3(0.25, 0.55, 0.9) * 0.6;
  vec3 dayC = mix(lc, sea, ocean);
  float cl = texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0)).r;
  vec2 cpx = vec2(1.0 / 2048.0, 1.0 / 1024.0); float cb = (texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0) + vec2(cpx.x * 2.0, 0.0)).r + texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0) - vec2(cpx.x * 2.0, 0.0)).r + texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0) + vec2(0.0, cpx.y * 2.0)).r + texture2D(cloudMap, vUv + vec2(time * 0.00006, 0.0) - vec2(0.0, cpx.y * 2.0)).r) * 0.25;
  cl = smoothstep(0.40, 0.92, cl + (cl - cb) * 0.8);
  dayC = mix(dayC, vec3(0.97, 0.985, 1.0), cl * 0.55);
  float lam = clamp(nd * 0.85 + 0.40, 0.0, 1.25);
  dayC *= lam;
  vec3 h = normalize(sunDir + view);
  float spec = pow(max(dot(n, h), 0.0), 320.0) * ocean * (1.0 - cl) * 0.5;
  dayC += vec3(1.0, 0.95, 0.85) * spec * smoothstep(0.0, 0.3, nd);
  // night side: dark terrain, bold gold city lights with a soft bloom
  vec3 nl = texture2D(nightMap, vUv).rgb;
  float lights = lum(nl);
  float L = 1.0 - exp(-smoothstep(0.08, 0.9, lights) * 3.4);
  vec3 gold = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.74, 0.30), smoothstep(0.2, 0.9, lights));
  vec3 terr = mix(vec3(0.006, 0.016, 0.045), lc * vec3(0.14, 0.18, 0.26), land);
  vec3 nightC = terr + gold * L * 1.5 * (1.0 - cl * 0.55);
  vec3 col = mix(nightC, dayC, day);
  // soft warm line along the terminator
  float tw = exp(-pow(nd * 5.0, 2.0));
  col += vec3(0.95, 0.42, 0.20) * tw * 0.08 * (0.4 + ocean * 0.6);
  // thin bright limb: a sharp cyan edge plus a wider blue halo
  float ff = 1.0 - max(dot(n, view), 0.0);
  col += vec3(0.20, 0.55, 1.0) * pow(ff, 4.0) * (0.45 + 0.65 * day);
  col += vec3(0.55, 0.88, 1.0) * pow(ff, 11.0) * 1.15;
  gl_FragColor = vec4(col, 1.0);
}`;
const G_ATM_VS = `varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const G_ATM_FS = `varying vec3 vNormal; void main(){ float i = pow(clamp(0.78 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.4); gl_FragColor = vec4(0.30, 0.62, 1.0, 1.0) * i * 0.85; }`;

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
  const tz = new THREE.Mesh(new THREE.SphereGeometry(1.0015, 96, 64), new THREE.MeshBasicMaterial({ map: gTzTexture(THREE, A.zones, A.borders), transparent: true, depthWrite: false })); scene.add(tz);
  const HW = coarse ? 2048 : 4096, hc = gCanvas(HW, HW / 2), hx = hc.getContext("2d"), htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace; htex.anisotropy = 4;
  const hl = new THREE.Mesh(new THREE.SphereGeometry(1.0022, 96, 64), new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false })); scene.add(hl);
  const list = A.borders, lookup = gIndex(list);
  // ---- map layers: one colour layer at a time (economic health, conflict, goods makers, food growers, big spenders) ----
  g.layer = null; g.meshes = {}; g.layerO = {};
  const LAYERS = [["health", "Economic health", true], ["conflict", "Conflict", !!A.conflict], ["goods", "Goods makers", !!A.mix], ["food", "Food growers", !!A.mix], ["spend", "Big spenders", !!A.mix], ["oil", "Oil", !!A.oil], ["rare", "Rare earths", !!A.rare], ["min", "Critical minerals", !!A.min], ["macro", "Debt & prices", !!A.macro], ["chips", "Chips", !!A.chips], ["net", "Cables & internet", !!(A.cables || A.macro)], ["money", "Money flows", !!(A.macro && A.money)], ["cyber", "Cyber", !!A.cyber], ["trade", "Trade routes", !!A.trade]].filter((l) => l[2]);
  const LAYER_RGB = { goods: [60, 105, 255], food: [30, 200, 85], spend: [255, 165, 20], oilg: [236, 150, 40], rareg: [200, 90, 235] }, MIXK = { goods: "manf", food: "agr", spend: "cons" };
  const MIXWHAT = { manf: "the world's manufacturing", agr: "the world's farm output", cons: "the world's household spending" };
  const colorOf = (key) => (co) => {
    const iso = co.i;
    if (key === "health") { const w = iso && A.world.countries[iso], sc = w && w.score; return sc != null ? "rgba(" + gHealthColor(sc).join(",") + ",0.46)" : "rgba(150,160,180,0.14)"; }
    if (key === "conflict") { const c = A.conflict && iso && A.conflict.countries[iso]; return c ? (c.lvl === "war" ? "rgba(255,72,72,0.58)" : "rgba(255,168,58,0.48)") : "rgba(150,160,180,0.08)"; }
    if (key === "oilg") { const o = A.oil && iso && A.oil.c[iso], v = o && o.res; return v ? "rgba(236,150,40," + (0.12 + 0.62 * Math.min(1, Math.pow(v / 300, 0.55))).toFixed(2) + ")" : "rgba(150,160,180,0.07)"; }
    if (key.startsWith("x:")) { const sp = xShade(key.slice(2)); if (!sp) return G_NODATA; const v = iso && sp.get(iso); return v == null ? G_NODATA : gStops(sp.stops, v); }
    if (key.startsWith("ming:")) { const mm = A.min.m[key.slice(5)], o = A.min && iso && A.min.c[iso], v = o && o[key.slice(5)] && o[key.slice(5)].r, mx = Math.max(...Object.values(A.min.c).map((q) => (q[key.slice(5)] && q[key.slice(5)].r) || 0)); return v ? "rgba(" + mm.tint.join(",") + "," + (0.14 + 0.6 * Math.min(1, Math.pow(v / mx, 0.5))).toFixed(2) + ")" : "rgba(150,160,180,0.07)"; }
    if (key === "rareg") { const o = A.rare && iso && A.rare.c[iso], v = o && o.res; return v ? "rgba(200,90,235," + (0.14 + 0.6 * Math.min(1, Math.pow(v / 44, 0.5))).toFixed(2) + ")" : "rgba(150,160,180,0.07)"; }
    const row = A.mix && iso && A.mix.c[iso], v = row && row[MIXK[key]];
    if (v == null) return "rgba(150,160,180,0.10)";
    return "rgba(" + LAYER_RGB[key].join(",") + "," + (0.05 + 0.68 * Math.min(1, Math.pow(v / 10, 0.7))).toFixed(2) + ")";
  };
  const cname = (iso) => (A.countries[iso] ? A.countries[iso].name : iso);
  const fronts = A.conflict ? A.conflict.conflicts.filter((c) => c.arcs && c.arcs.length) : [];
  const flyTo = (lat, lon, dist) => { g.tLon = { lon, lat: Math.max(-60, Math.min(70, lat)), dist, t0: performance.now(), l0: g.lon, a0: g.lat, d0: g.dist }; g.userZoom = true; };
  const legendHtml = (key) => {
    if (key === "health") return `<i></i><div><span>Strained</span><span>Healthy</span></div><em>Grey: not enough data</em>`;
    if (key === "conflict") return `<div class="gl-sw"><span><u style="background:rgb(255,72,72)"></u>War (1,000+ deaths a year)</span><span><u style="background:rgb(255,168,58)"></u>Smaller conflict</span><span><u class="dash"></u>Fighting between states</span></div>
      <b class="gl-h">Who is fighting whom</b><div class="gl-list">${fronts.map((c) => `<button data-front="${esc(c.id)}">${esc(c.n)}</button>`).join("")}</div><div class="gl-info small"></div>
      <em>${esc(A.conflict.caveat)} Snapshot as of ${esc(gDate(A.conflict.asof))}.</em>`;
    const fly = (lat, lon, html, dist) => { g.flyList.push({ lat, lon, html, dist }); return g.flyList.length - 1; };
    if (XMODES[key]) return xLegend(key, fly);
    if (key === "oil") {
      const O = A.oil, ground = g.oilMode === "ground", top = O.fields.slice().sort((p, q) => q.mbd - p.mbd).slice(0, 8);
      return `<div class="gl-modes"><button data-oilmode="pumped" class="${ground ? "" : "on"}">Where it's pumped</button><button data-oilmode="ground" class="${ground ? "on" : ""}">In the ground</button></div>
        ${ground ? `<i style="background:linear-gradient(90deg,rgba(236,150,40,.12),rgba(236,150,40,.74))"></i><div><span>Little</span><span>Huge reserves</span></div>`
          : `<i style="background:linear-gradient(90deg,rgba(150,20,20,.2),#ff5a14,#ffc83c,#fff5be)"></i><div><span>Little output</span><span>Heavy output</span></div>`}
        <em>${ground ? `Proven reserves by country. Five countries hold ${O.top5.res}% of it. The shading covers whole countries, not the fields.` : `Glow shows where crude is pumped, from field regions. Five countries pump ${O.top5.prod}% of it.`}</em>
        <div class="gl-sw"><span><u style="background:#38d6ff"></u>Emergency stockpile</span><span><u style="background:#b58cff"></u>Trading and storage hub</span><span><u style="background:#5ee6a8"></u>Export terminal</span></div>
        <b class="gl-h">Where it is stored and loaded</b><div class="gl-list">${O.stores.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b> · ${esc(x.kind)}<br>${esc(x.note)}`)}">${esc(x.n)}</button>`).join("")}</div>
        <b class="gl-h">Biggest producing regions</b><div class="gl-list">${top.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>About ${x.mbd} million barrels a day, ${x.t === "off" ? "offshore" : "on land"}.`, 2.2)}">${esc(x.n)}</button>`).join("")}</div><div class="gl-info small"></div>
        <em>${esc(O.caveat)} Source: ${esc(O.source)}.</em>`;
    }
    if (key === "min") {
      const MN = A.min, m = MN.m[g.minSel], ground = g.minMode === "ground", top = m.fields.slice().sort((p, q) => q.t - p.t).slice(0, 6), cn = (iso) => (A.countries[iso] ? A.countries[iso].name : iso), rgb = m.tint.join(",");
      return `<div class="gl-modes">${MN.order.map((k) => `<button data-minsel="${k}" class="${g.minSel === k ? "on" : ""}">${esc(MN.m[k].n)}</button>`).join("")}</div>
        <div class="gl-modes"><button data-minmode="mined" class="${ground ? "" : "on"}">Where it's mined</button><button data-minmode="ground" class="${ground ? "on" : ""}">In the ground</button></div>
        <i style="background:linear-gradient(90deg,rgba(${rgb},.12),rgba(${rgb},.8))"></i><div><span>Little</span><span>${ground ? "Huge reserves" : "Heavy output"}</span></div>
        <em>${ground ? `Proven reserves by country. ${esc(cn(m.rtop))} holds ${m.rtop_sh}% of the world's total.` : `${esc(cn(m.top))} mines about ${m.top_sh}% of the world's ${esc(m.n.toLowerCase())}.`} ${esc(m.uses)}</em>
        <div class="gl-sw"><span><u style="background:#38d6ff"></u>Refining or smelting</span><span><u style="background:#ffd24a"></u>Project or key site</span></div>
        <b class="gl-h">Refining and key sites</b><div class="gl-list">${m.sites.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>${esc(x.note)}`)}">${esc(x.n)}</button>`).join("")}</div>
        <b class="gl-h">Biggest mining regions</b><div class="gl-list">${top.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>${esc(x.note)}`, 2.2)}">${esc(x.n)}</button>`).join("")}</div><div class="gl-info small"></div>
        <em>${esc(m.note)} ${esc(MN.caveat)} Source: ${esc(MN.source)}.</em>`;
    }
    if (key === "rare") {
      const R = A.rare, ground = g.rareMode === "ground", top = R.fields.slice().sort((p, q) => q.kt - p.kt).slice(0, 6);
      return `<div class="gl-modes"><button data-raremode="mined" class="${ground ? "" : "on"}">Where it's mined</button><button data-raremode="ground" class="${ground ? "on" : ""}">In the ground</button></div>
        ${ground ? `<i style="background:linear-gradient(90deg,rgba(200,90,235,.14),rgba(200,90,235,.74))"></i><div><span>Little</span><span>Huge reserves</span></div>`
          : `<i style="background:linear-gradient(90deg,rgba(70,20,150,.25),#c832c8,#5ac8ff,#ebfaff)"></i><div><span>Little output</span><span>Heavy output</span></div>`}
        <em>${ground ? `Proven reserves by country. China holds ${R.top.res}% of them; Brazil, India and Australia come next.` : `Glow shows where it's mined. China mines about ${R.top.mine}% of the world's supply, and refines even more of it.`}</em>
        <div class="gl-sw"><span><u style="background:#38d6ff"></u>Refining and magnets</span><span><u style="background:#ffd24a"></u>Deposit or project, little output yet</span></div>
        <b class="gl-h">Refining, magnets and projects</b><div class="gl-list">${R.sites.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b> · ${esc(x.kind)}<br>${esc(x.note)}`)}">${esc(x.n)}</button>`).join("")}</div>
        <b class="gl-h">Biggest mining regions</b><div class="gl-list">${top.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>About ${x.kt} thousand tonnes a year. ${esc(x.note)}`, 2.2)}">${esc(x.n)}</button>`).join("")}</div><div class="gl-info small"></div>
        <em>${esc(R.uses)} ${esc(R.caveat)} Source: ${esc(R.source)}.</em>`;
    }
    if (key === "trade") {
      const T = A.trade, KN = { box: "Containers and goods", oil: "Oil and fuel", bulk: "Grain, ore and other bulk" };
      return `<div class="gl-sw">${Object.keys(G_TRADE_COL).map((k) => `<span><u class="dash" style="--c:${G_TRADE_COL[k]}"></u>${KN[k]}</span>`).join("")}<span><u class="ring"></u>Chokepoint</span><span><u style="background:#fff;border-radius:50%"></u>Big port</span></div>
        <b class="gl-h">Main sea routes</b><div class="gl-list">${T.routes.map((r) => { const m = r.pts[Math.floor(r.pts.length / 2)]; return `<button data-fly="${fly(m[0], m[1], `<b>${esc(r.n)}</b> · ${esc(KN[r.k])}<br>${esc(r.what)}`, 3.3)}">${esc(r.n)}</button>`; }).join("")}</div>
        <b class="gl-h">Chokepoints</b><div class="gl-list">${T.chokes.map((c) => `<button data-fly="${fly(c.lat, c.lon, `<b>${esc(c.n)}</b><br>${esc(c.note)}`, 1.9)}">${esc(c.n)}</button>`).join("")}</div><div class="gl-info small"></div>
        <em>${esc(T.caveat)}</em>`;
    }
    const k = MIXK[key], rgb = LAYER_RGB[key].join(",");
    return `<i style="background:linear-gradient(90deg,rgba(${rgb},.1),rgba(${rgb},.65))"></i><div><span>Small share</span><span>Large share</span></div><em>Top 10 countries: ${A.mix.top10[k]}% of ${MIXWHAT[k]}. Click a country for what it makes and sells.</em>`;
  };
  const ensureMesh = (k) => {
    if (g.meshes[k] || !k || k === "x:net:cables" || k === "x:money:arcs") return;
    const tex = k === "oil" ? gHeatTexture(THREE, A.oil.fields, coarse) : k === "x:chips:fab" ? gHeatTexture(THREE, A.chips.fields.map((f) => ({ lat: f.lat, lon: f.lon, mbd: f.w * 0.65 })), coarse, [[20, 40, 140], [40, 120, 255], [90, 210, 255], [235, 250, 255]]) : k.startsWith("min:") ? (() => { const mm = A.min.m[k.slice(4)], mxt = Math.max(...mm.fields.map((f) => f.t)); return gHeatTexture(THREE, mm.fields.map((f) => ({ lat: f.lat, lon: f.lon, mbd: (f.t / mxt) * 6.5 })), coarse, mm.ramp); })() : k === "rare" ? gHeatTexture(THREE, A.rare.fields.map((f) => ({ lat: f.lat, lon: f.lon, mbd: f.kt / 11 })), coarse, [[70, 20, 150], [200, 50, 200], [90, 200, 255], [235, 250, 255]]) : gTintTexture(THREE, list, colorOf(k), coarse);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.0019, 96, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); scene.add(m); g.meshes[k] = m; g.layerO[k] = 0;
  };
  const meshKey = (key) => (key === "oil" ? (g.oilMode === "ground" ? "oilg" : "oil") : key === "rare" ? (g.rareMode === "ground" ? "rareg" : "rare") : key === "min" ? (g.minMode === "ground" ? "ming:" : "min:") + g.minSel : XMODES[key] ? "x:" + key + ":" + g.xs[key] : key);
  const renderLegend = () => {
    const lg = host.querySelector(".glegend"), key = g.layer; lg.hidden = !key; if (!key) return;
    g.flyList = []; lg.innerHTML = legendHtml(key);
    lg.querySelectorAll("[data-front]").forEach((b) => b.onclick = () => {
      const c = fronts.find((x) => x.id === b.dataset.front), p = c.arcs[0], a = A.countries[p[0]].cap, z = A.countries[p[1]].cap, mid = gMid(a, z);
      flyTo(mid[0], mid[1], 2.6); lg.querySelector(".gl-info").innerHTML = `<b>${esc(c.n)}</b> · ${esc(c.lvl === "war" ? "war" : "smaller conflict")} since ${esc(c.since)}<br>${esc(c.sides)}.${c.note ? " " + esc(c.note) : ""}`;
    });
    lg.querySelectorAll("[data-fly]").forEach((b) => b.onclick = () => { const f = g.flyList[+b.dataset.fly]; flyTo(f.lat, f.lon, f.dist || 2.7); lg.querySelector(".gl-info").innerHTML = f.html; });
    lg.querySelectorAll("[data-oilmode]").forEach((b) => b.onclick = () => { g.oilMode = b.dataset.oilmode; try { localStorage.setItem("ml_globe_oil", g.oilMode); } catch (e) {} ensureMesh(meshKey("oil")); renderLegend(); });
    lg.querySelectorAll("[data-xmode]").forEach((b) => b.onclick = () => { g.xs[g.layer] = b.dataset.xmode; try { localStorage.setItem("ml_globe_x", JSON.stringify(g.xs)); } catch (e) {} ensureMesh(meshKey(g.layer)); renderLegend(); });
    lg.querySelectorAll("[data-minsel]").forEach((b) => b.onclick = () => { g.minSel = b.dataset.minsel; saveMin(); buildMinMarkers(); ensureMesh(meshKey("min")); renderLegend(); });
    lg.querySelectorAll("[data-minmode]").forEach((b) => b.onclick = () => { g.minMode = b.dataset.minmode; saveMin(); ensureMesh(meshKey("min")); renderLegend(); });
    lg.querySelectorAll("[data-raremode]").forEach((b) => b.onclick = () => { g.rareMode = b.dataset.raremode; try { localStorage.setItem("ml_globe_rare", g.rareMode); } catch (e) {} ensureMesh(meshKey("rare")); renderLegend(); });
  };
  const setLayer = (key) => {
    g.layer = key; try { localStorage.setItem("ml_globe_layer", key || ""); } catch (e) {}
    if (key) ensureMesh(meshKey(key));
    if (key) grp = grpOf(key);
    renderBar();
    renderLegend();
  };
  const lbar = host.querySelector(".glayers");
  const GROUPS = [["People & risk", ["health", "conflict"]], ["Trade & goods", ["goods", "food", "spend", "trade"]], ["Resources", ["oil", "rare", "min"]], ["Money & tech", ["macro", "money", "chips", "net"]]];
  const LNAME = Object.fromEntries(LAYERS.map((l) => [l[0], l[1]]));
  const groups = GROUPS.map(([n, ks]) => [n, ks.filter((k) => LNAME[k])]).filter((x) => x[1].length);
  const grpOf = (k) => { const i = groups.findIndex((x) => x[1].includes(k)); return i < 0 ? 0 : i; };
  let grp = 0; try { const sv = localStorage.getItem("ml_globe_layer"); if (sv) grp = grpOf(sv); } catch (e) {}
  const locked = (k) => typeof planPaid === "function" && typeof PAID_LAYERS !== "undefined" && PAID_LAYERS.includes(k) && !planPaid();
  if (typeof planLoad === "function") planLoad().then(() => { if (host.isConnected) renderBar(); });
  const renderBar = () => {
    lbar.innerHTML = `<div class="glgroups" role="tablist">${groups.map(([n, ks], i) => `<button class="glgroup${i === grp ? " on" : ""}" data-grp="${i}" role="tab" aria-selected="${i === grp}">${n}${ks.includes(g.layer) ? " •" : ""}</button>`).join("")}</div>
      <div class="glchips">${groups[grp][1].map((k) => `<button class="gtoggle glayer${k === g.layer ? " on" : ""}" data-layer="${k}" aria-pressed="${k === g.layer}">${locked(k) ? "🔒 " : ""}${LNAME[k]}</button>`).join("")}</div>`;
    lbar.querySelectorAll(".glgroup").forEach((b) => b.addEventListener("click", () => { grp = +b.dataset.grp; renderBar(); }));
    lbar.querySelectorAll(".glayer").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.layer;
      if (locked(k)) { const lg = host.querySelector(".glegend"); lg.hidden = false; lg.innerHTML = `<span class="gl-h">${LNAME[k]} is part of Plus</span><span class="gl-info">The data layers for oil, minerals, debt, chips, cables, money flows and trade routes come with Plus.</span><a class="btn" href="#/pricing" style="font-size:12px;padding:7px 12px;margin-top:6px">See plans</a>`; return; }
      setLayer(g.layer === k ? null : k);
    }));
  };
  renderBar();
  g.cleanup.push(() => { g.meshes = {}; });
  // dashed arcs through the atmosphere between countries that are fighting each other (shown with the conflict layer)
  const arcGroup = new THREE.Group(); arcGroup.visible = false; scene.add(arcGroup); const arcMats = [];
  const ARC_FIX = { PSE: [31.5, 34.45] };
  const capOf = (iso) => ARC_FIX[iso] || (A.countries[iso] && A.countries[iso].cap);
  fronts.forEach((c) => c.arcs.forEach(([ia, ib]) => {
    const pa = capOf(ia), pb = capOf(ib); if (!pa || !pb) return;
    const a = new THREE.Vector3(...gVec(pa[0], pa[1])), b = new THREE.Vector3(...gVec(pb[0], pb[1])), th = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (th < 0.01) return;
    const peak = Math.min(0.42, 0.05 + 0.2 * th), pts = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80, k1 = Math.sin((1 - t) * th) / Math.sin(th), k2 = Math.sin(t * th) / Math.sin(th); pts.push(a.clone().multiplyScalar(k1).add(b.clone().multiplyScalar(k2)).normalize().multiplyScalar(1.004 + peak * Math.sin(Math.PI * t))); }
    const col = c.lvl === "war" ? 0xff4b4b : 0xffa83a;
    const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, len: { value: th * (1 + peak) }, col: { value: new THREE.Color(col) } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec2 vUv; uniform float time; uniform float len; uniform vec3 col; void main(){ float d = vUv.x * len / 0.05 - time * 0.9; if (fract(d) > 0.58) discard; gl_FragColor = vec4(col, 1.0); }" });
    arcGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0042, 5, false), mat)); arcMats.push(mat);
    [a, b].forEach((v) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 12), new THREE.MeshBasicMaterial({ color: col })); d.position.copy(v.clone().multiplyScalar(1.006)); arcGroup.add(d); });
  }));
  g.arcs = arcGroup; g.arcMats = arcMats;
  // oil storage and loading sites (shown with the oil layer)
  g.oilOpt = null; g.oilMode = "pumped"; try { if (localStorage.getItem("ml_globe_oil") === "ground") g.oilMode = "ground"; } catch (e) {}
  const oilGroup = new THREE.Group(); oilGroup.visible = false; scene.add(oilGroup);
  if (A.oil) { const SC = { emergency: 0x38d6ff, hub: 0xb58cff, terminal: 0x5ee6a8 };
    A.oil.stores.forEach((x) => { const v = new THREE.Vector3(...gVec(x.lat, x.lon)), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), new THREE.MeshBasicMaterial({ color: SC[x.k] })); m.position.copy(v.clone().multiplyScalar(1.012)); oilGroup.add(m);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.027, 28), new THREE.MeshBasicMaterial({ color: SC[x.k], side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.008)); r.lookAt(v.clone().multiplyScalar(3)); oilGroup.add(r); }); }
  g.oilG = oilGroup;
  g.rareMode = "mined"; try { if (localStorage.getItem("ml_globe_rare") === "ground") g.rareMode = "ground"; } catch (e) {}
  const rareGroup = new THREE.Group(); rareGroup.visible = false; scene.add(rareGroup);
  if (A.rare) A.rare.sites.forEach((x) => { const col = x.k === "process" ? 0x38d6ff : 0xffd24a, v = new THREE.Vector3(...gVec(x.lat, x.lon)), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(v.clone().multiplyScalar(1.012)); rareGroup.add(m);
    const r = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.027, 28), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.008)); r.lookAt(v.clone().multiplyScalar(3)); rareGroup.add(r); });
  g.rareG = rareGroup;
  g.minSel = "li"; g.minMode = "mined"; try { const sv = (localStorage.getItem("ml_globe_min") || "").split("|"); if (A.min && A.min.m[sv[0]]) g.minSel = sv[0]; if (sv[1] === "ground") g.minMode = "ground"; } catch (e) {}
  const saveMin = () => { try { localStorage.setItem("ml_globe_min", g.minSel + "|" + g.minMode); } catch (e) {} };
  const minGroup = new THREE.Group(); minGroup.visible = false; scene.add(minGroup);
  const buildMinMarkers = () => {
    while (minGroup.children.length) { const o = minGroup.children.pop(); o.geometry.dispose(); o.material.dispose(); }
    if (!A.min) return;
    A.min.m[g.minSel].sites.forEach((x) => { const col = x.k === "process" ? 0x38d6ff : 0xffd24a, v = new THREE.Vector3(...gVec(x.lat, x.lon)), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(v.clone().multiplyScalar(1.012)); minGroup.add(m);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.027, 28), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.008)); r.lookAt(v.clone().multiplyScalar(3)); minGroup.add(r); });
  };
  buildMinMarkers(); g.minG = minGroup;
  // ---- extra layers: debt & prices, chips, cables & internet, money flows, cyber ----
  const XMODES = { macro: [["debt", "Debt"], ["infl", "Inflation"], ["rate", "Interest rates"]], chips: [["fab", "Where chips are made"], ["tech", "High-tech exports"]], net: [["cables", "Cables"], ["users", "Internet users"]],
    money: [["remit", "Remittances"], ["fdi", "Foreign investment"]], cyber: [["origin", "Where attacks come from"]].concat(A.cyber && Object.keys(A.cyber.targets || {}).length ? [["target", "Who is hit"]] : []) };
  g.xs = { macro: "debt", chips: "fab", net: "cables", money: "remit", cyber: "origin" };
  try { const sv = JSON.parse(localStorage.getItem("ml_globe_x") || "{}"); for (const k in g.xs) if (XMODES[k].some((m) => m[0] === sv[k])) g.xs[k] = sv[k]; } catch (e) {}
  const MC = (iso) => (A.macro && A.macro.c[iso]) || null, CY = A.cyber || {};
  const XS = {
    "macro:debt": { get: (i) => (MC(i) || {}).debt, stops: [[30, [70, 190, 130, 0.35]], [80, [245, 205, 70, 0.5]], [130, [240, 80, 60, 0.62]], [200, [170, 20, 90, 0.74]]], lo: "Under 30%", hi: "200%+", what: "Government debt as a share of a year's economic output (IMF estimate for 2024)." },
    "macro:infl": { get: (i) => (MC(i) || {}).infl, stops: [[0, [80, 150, 255, 0.45]], [3, [70, 190, 130, 0.35]], [10, [245, 190, 60, 0.55]], [30, [240, 70, 60, 0.65]], [100, [170, 20, 120, 0.76]]], lo: "Falling prices", hi: "100%+ a year", what: "How fast consumer prices rose in the latest year reported (World Bank)." },
    "macro:rate": { get: (i) => { const m = MC(i) || {}; return m.pol != null ? m.pol : m.lend; }, stops: [[0, [80, 150, 255, 0.4]], [4, [70, 190, 130, 0.35]], [10, [245, 190, 60, 0.55]], [25, [240, 70, 60, 0.65]], [50, [170, 20, 120, 0.76]]], lo: "Near 0%", hi: "50%+", what: "The central bank's policy rate where the IMF reports one (mostly mid-2025), otherwise the typical bank lending rate (World Bank)." },
    "money:remit": { get: (i) => (MC(i) || {}).rem, stops: [[0, [255, 200, 60, 0.06]], [3, [255, 190, 50, 0.35]], [10, [255, 140, 30, 0.56]], [25, [240, 70, 40, 0.74]]], lo: "Under 1% of GDP", hi: "25%+ of GDP", what: "Money sent home by workers abroad, as a share of the receiving country's economy (World Bank)." },
    "money:fdi": { get: (i) => (MC(i) || {}).fdi, stops: [[0, [90, 140, 255, 0.15]], [2, [90, 160, 255, 0.35]], [6, [60, 200, 230, 0.56]], [15, [200, 250, 255, 0.72]]], lo: "Little", hi: "15%+ of GDP", what: "Foreign companies' investment flowing into the country in a year, as a share of GDP (World Bank). It swings a lot from year to year." },
    "net:users": { get: (i) => (MC(i) || {}).net, stops: [[0, [240, 80, 70, 0.55]], [40, [245, 190, 60, 0.45]], [70, [90, 200, 160, 0.4]], [100, [60, 200, 255, 0.45]]], lo: "Few online", hi: "Nearly everyone", what: "Share of people using the internet (World Bank / ITU)." },
    "chips:tech": { get: (i) => (MC(i) || {}).tech, stops: [[0, [150, 120, 255, 0.1]], [10, [150, 120, 255, 0.3]], [25, [190, 90, 255, 0.56]], [50, [250, 150, 255, 0.74]]], lo: "Little", hi: "50%+ of exports", what: "High-technology goods (chips, computers, aircraft, drugs) as a share of the country's manufactured exports (World Bank)." },
    "cyber:origin": { get: (i) => (CY.origin || {})[i], stops: [[0, [255, 80, 80, 0.2]], [5, [255, 80, 80, 0.45]], [20, [255, 60, 60, 0.7]]], lo: "Few", hi: "Many attacks", what: "Share of the busiest attacking addresses seen by a worldwide set of sensors, by the country of their network." },
    "cyber:target": { get: (i) => (CY.targets || {})[i], stops: [[0, [255, 190, 60, 0.25]], [10, [255, 150, 40, 0.5]], [40, [255, 80, 40, 0.74]]], lo: "Few", hi: "Most attacked", what: "Countries hit most often by attacks, from Cloudflare Radar's last 7 days." } };
  const xShade = (key) => XS[key.replace(/^x:/, "")];
  g.xShade = xShade;
  const fmtX = { debt: (v) => v + "% of GDP", infl: (v) => v + "% a year", rate: (v) => v + "%" };
  const xLegend = (key, fly) => {
    const mode = g.xs[key], sp = XS[key + ":" + mode], chips = XMODES[key].map(([m, l]) => `<button data-xmode="${m}" class="${mode === m ? "on" : ""}">${esc(l)}</button>`).join("");
    const bar = (sp2) => `<i style="background:linear-gradient(90deg,${sp2.stops.map((s) => "rgba(" + s[1].slice(0, 3).join(",") + ",.85)").join(",")})"></i><div><span>${esc(sp2.lo)}</span><span>${esc(sp2.hi)}</span></div>`;
    let h = `<div class="gl-modes" style="flex-wrap:wrap">${chips}</div>`;
    if (key === "macro") h += `${bar(sp)}<em>${esc(sp.what)} Grey: no recent figure. ${key === "macro" && mode === "debt" ? "Debt covers " + A.macro.n.debt + " countries." : ""} Source: ${esc(A.macro.source)}. The IMF figures come through an open mirror that lags the IMF's newest release.</em>`;
    if (key === "chips") {
      const C = A.chips, KC = { tool: "#ffb03a", design: "#e0e8ff", material: "#5ee6a8" };
      h += mode === "fab" ? `<i style="background:linear-gradient(90deg,rgba(20,40,140,.4),#2878ff,#5ad2ff,#ebfaff)"></i><div><span>Little</span><span>Biggest clusters</span></div><em>Glow: relative chip-making size by cluster (a rough index, not measured capacity).</em>` : `${bar(sp)}<em>${esc(sp.what)}</em>`;
      h += `<div class="gl-sw">${Object.entries({ tool: "Machines and tools", design: "Chip design", material: "Key materials" }).map(([k, l]) => `<span><u style="background:${KC[k]}"></u>${l}</span>`).join("")}</div>
        <ul class="small" style="margin:4px 0 6px;padding-left:16px">${C.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <b class="gl-h">Chokepoints</b><div class="gl-list">${C.sites.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b> · ${esc(x.kind)}<br>${esc(x.note)}`)}">${esc(x.n)}</button>`).join("")}</div>
        <b class="gl-h">Biggest chip-making clusters</b><div class="gl-list">${C.fields.slice().sort((p, q) => q.w - p.w).slice(0, 6).map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>${esc(x.note)}`, 2.2)}">${esc(x.n)}</button>`).join("")}</div><div class="gl-info small"></div><em>${esc(C.caveat)} Source: ${esc(C.source)}.</em>`;
    }
    if (key === "net") {
      const C = A.cables;
      if (mode === "users") h += `${bar(sp)}<em>${esc(sp.what)}</em>`;
      if (C) h += `<div class="gl-sw"><span><u class="dash" style="--c:#7aa2ff"></u>Undersea cable (simplified route)</span><span><u style="background:#38d6ff"></u>Cable landing hub</span><span><u style="background:#ff7ad9"></u>Data-centre hub</span><span><u class="ring"></u>Cable damage</span></div>
        <ul class="small" style="margin:4px 0 6px;padding-left:16px">${C.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <b class="gl-h">Cables</b><div class="gl-list">${C.cables.map((c) => { const m = c.pts[Math.floor(c.pts.length / 2)]; return `<button data-fly="${fly(m[0], m[1], `<b>${esc(c.n)}</b><br>${esc(c.note)}`, 3.3)}">${esc(c.n)}</button>`; }).join("")}</div>
        <b class="gl-h">Hubs</b><div class="gl-list">${C.hubs.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b> · ${x.k === "dc" ? "data-centre hub" : "cable landing hub"}<br>${esc(x.note)}`, 2.2)}">${esc(x.n)}</button>`).join("")}</div>
        <b class="gl-h">Cable damage</b><div class="gl-list">${C.incidents.map((x) => `<button data-fly="${fly(x.lat, x.lon, `<b>${esc(x.n)}</b><br>${esc(x.note)}`, 2)}">${esc(x.n)}</button>`).join("")}</div><div class="gl-info small"></div><em>${esc(C.caveat)} ${esc(C.source)}.</em>`;
    }
    if (key === "money") {
      const M = A.money, top = Object.entries(A.macro.c).filter(([, r]) => r.remd != null).sort((p, q) => q[1].remd - p[1].remd).slice(0, 6);
      h += `${bar(sp)}<em>${esc(sp.what)}</em><div class="gl-sw"><span><u class="dash" style="--c:#ffc83c"></u>Big remittance corridor</span></div>
        <ul class="small" style="margin:4px 0 6px;padding-left:16px">${M.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <b class="gl-h">Biggest corridors</b><div class="gl-list">${M.corridors.map((c) => { const a = capOf(c.a), z = capOf(c.b), m = gMid(a, z); return `<button data-fly="${fly(m[0], m[1], `<b>${esc(cname(c.a))} to ${esc(cname(c.b))}</b><br>${esc(c.note)}`, 3)}">${esc(cname(c.a))} to ${esc(cname(c.b))}</button>`; }).join("")}</div>
        <b class="gl-h">Biggest receivers (US$ a year)</b><p class="small" style="margin:0 0 6px">${top.map(([i, r]) => `${esc(cname(i))} $${Math.round(r.remd)}bn`).join(" · ")}</p><div class="gl-info small"></div><em>${esc(M.caveat)} ${esc(M.source)}.</em>`;
    }
    if (key === "cyber") {
      const top = Object.entries(CY.origin || {}).sort((p, q) => q[1] - p[1]).slice(0, 8), c2 = Object.entries(CY.c2 || {}).sort((p, q) => q[1] - p[1]);
      h += `${bar(sp)}<em>${esc(sp.what)}</em>`;
      if (CY.pairs && CY.pairs.length) h += `<div class="gl-sw"><span><u class="dash"></u>Attack route, origin to target</span></div><b class="gl-h">Biggest routes this week</b><div class="gl-list">${CY.pairs.slice().sort((p, q) => q[2] - p[2]).slice(0, 8).map((p) => { const m = gMid(capOf(p[0]), capOf(p[1])); return `<button data-fly="${fly(m[0], m[1], `<b>${esc(cname(p[0]))} to ${esc(cname(p[1]))}</b><br>One of the biggest ${p[3] === "layer7" ? "web (application-layer)" : "network-layer"} attack routes in the last 7 days.`, 3)}">${esc(cname(p[0]))} to ${esc(cname(p[1]))}</button>`; }).join("")}</div>`;
      else h += `<em>Who is being targeted needs a free Cloudflare Radar token, which isn't connected yet, so no origin-to-target lines are drawn. The shading shows only where attacks come from.</em>`;
      h += `<b class="gl-h">Top sources</b><p class="small" style="margin:0 0 6px">${top.map(([i, v]) => `${esc(cname(i))} ${v}%`).join(" · ") || "No data yet."}</p>${c2.length ? `<b class="gl-h">Botnet control servers online</b><p class="small" style="margin:0 0 6px">${c2.map(([i, v]) => `${esc(cname(i))} ${v}`).join(" · ")}</p>` : ""}
        <em>Updated ${esc(CY.asof || "")} (with each nightly run, not live). Sources: ${esc((CY.sources || []).join(", "))}. ${esc(CY.caveat)}</em>`;
    }
    return h;
  };
  // overlays for these layers
  g.xg = {}; g.xm = {}; g.xp = [];
  const xGroup = (k) => { const gr = new THREE.Group(); gr.visible = false; scene.add(gr); g.xg[k] = gr; g.xm[k] = []; return gr; };
  const dashMat = (len, col, dash, speed) => new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, len: { value: len }, col: { value: new THREE.Color(col) } }, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; uniform float time; uniform float len; uniform vec3 col; void main(){ float d = vUv.x * len / " + dash.toFixed(3) + " - time * " + speed.toFixed(2) + "; if (fract(d) > 0.6) discard; gl_FragColor = vec4(col, 1.0); }" });
  const markerAt = (gr, lat, lon, col, ring) => {
    const v = new THREE.Vector3(...gVec(lat, lon)), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(v.clone().multiplyScalar(1.012)); gr.add(m);
    const r = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 28), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.008)); r.lookAt(v.clone().multiplyScalar(3)); gr.add(r); if (ring) g.xp.push(r);
  };
  const arcBetween = (gr, mats, pa, pb, col) => {
    const a = new THREE.Vector3(...gVec(pa[0], pa[1])), b = new THREE.Vector3(...gVec(pb[0], pb[1])), th = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (th < 0.01) return;
    const peak = Math.min(0.42, 0.05 + 0.2 * th), pts = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80, k1 = Math.sin((1 - t) * th) / Math.sin(th), k2 = Math.sin(t * th) / Math.sin(th); pts.push(a.clone().multiplyScalar(k1).add(b.clone().multiplyScalar(k2)).normalize().multiplyScalar(1.004 + peak * Math.sin(Math.PI * t))); }
    const mat = dashMat(th * (1 + peak), col, 0.05, 0.9); gr.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0042, 5, false), mat)); mats.push(mat);
    [a, b].forEach((v, i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(i ? 0.012 : 0.008, 12, 12), new THREE.MeshBasicMaterial({ color: col })); d.position.copy(v.clone().multiplyScalar(1.006)); gr.add(d); });
  };
  if (A.chips) { const gr = xGroup("chips"), KC = { tool: 0xffb03a, design: 0xe0e8ff, material: 0x5ee6a8 }; A.chips.sites.forEach((x) => markerAt(gr, x.lat, x.lon, KC[x.k], false)); }
  if (A.cables) {
    const gr = xGroup("net");
    A.cables.cables.forEach((c) => {
      const pts = []; let len = 0;
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = new THREE.Vector3(...gVec(c.pts[i][0], c.pts[i][1])), b = new THREE.Vector3(...gVec(c.pts[i + 1][0], c.pts[i + 1][1])), th = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), n = Math.max(2, Math.ceil(th / (1.2 * G_R)));
        for (let j = i ? 1 : 0; j <= n; j++) { const t = j / n, k1 = Math.sin((1 - t) * th) / Math.sin(th), k2 = Math.sin(t * th) / Math.sin(th); pts.push(a.clone().multiplyScalar(k1).add(b.clone().multiplyScalar(k2)).normalize().multiplyScalar(1.0042)); }
        len += th;
      }
      const mat = dashMat(len, 0x7aa2ff, 0.05, 0.4); gr.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), Math.min(1600, pts.length * 3), 0.0028, 4, false), mat)); g.xm.net.push(mat);
    });
    A.cables.hubs.forEach((x) => markerAt(gr, x.lat, x.lon, x.k === "dc" ? 0xff7ad9 : 0x38d6ff, false));
    A.cables.incidents.forEach((x) => { const v = new THREE.Vector3(...gVec(x.lat, x.lon)), r = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.03, 32), new THREE.MeshBasicMaterial({ color: 0xff5a5a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.009)); r.lookAt(v.clone().multiplyScalar(3)); gr.add(r); g.xp.push(r); });
  }
  if (A.money) { const gr = xGroup("money"); A.money.corridors.forEach((c) => { const pa = capOf(c.a), pb = capOf(c.b); if (pa && pb) arcBetween(gr, g.xm.money, pa, pb, 0xffc83c); }); }
  if (A.cyber && A.cyber.pairs && A.cyber.pairs.length) { const gr = xGroup("cyber"); A.cyber.pairs.forEach((p) => { const pa = capOf(p[0]), pb = capOf(p[1]); if (pa && pb) arcBetween(gr, g.xm.cyber, pa, pb, 0xff4b4b); }); }
  // trade: sea lanes with dashes flowing along each route, ring markers on chokepoints, dots on big ports
  const tradeGroup = new THREE.Group(); tradeGroup.visible = false; scene.add(tradeGroup); const tradeMats = [], pulses = [];
  if (A.trade) {
    A.trade.routes.forEach((rt) => {
      const pts = []; let len = 0;
      for (let i = 0; i + 1 < rt.pts.length; i++) {
        const a = new THREE.Vector3(...gVec(rt.pts[i][0], rt.pts[i][1])), b = new THREE.Vector3(...gVec(rt.pts[i + 1][0], rt.pts[i + 1][1])), th = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), n = Math.max(2, Math.ceil(th / (1.2 * G_R)));
        for (let j = i ? 1 : 0; j <= n; j++) { const t = j / n, k1 = Math.sin((1 - t) * th) / Math.sin(th), k2 = Math.sin(t * th) / Math.sin(th); pts.push(a.clone().multiplyScalar(k1).add(b.clone().multiplyScalar(k2)).normalize().multiplyScalar(1.0045)); }
        len += th;
      }
      const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, len: { value: len }, col: { value: new THREE.Color(G_TRADE_COL[rt.k] || "#ffffff") } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec2 vUv; uniform float time; uniform float len; uniform vec3 col; void main(){ float d = vUv.x * len / 0.06 - time * 0.55; if (fract(d) > 0.62) discard; gl_FragColor = vec4(col, 1.0); }" });
      tradeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), Math.min(1600, pts.length * 3), 0.0032, 4, false), mat)); tradeMats.push(mat);
    });
    A.trade.chokes.forEach((c) => { const v = new THREE.Vector3(...gVec(c.lat, c.lon)), r = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.03, 32), new THREE.MeshBasicMaterial({ color: 0xff5a5a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })); r.position.copy(v.clone().multiplyScalar(1.009)); r.lookAt(v.clone().multiplyScalar(3)); tradeGroup.add(r); pulses.push(r); });
    A.trade.ports.forEach((p) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); d.position.set(...gVec(p.lat, p.lon).map((u) => u * 1.007)); tradeGroup.add(d); });
  }
  g.tradeG = tradeGroup; g.tradeMats = tradeMats; g.pulses = pulses;
  const layerRow = (iso) => {
    if (!iso || !g.layer) return "";
    if (g.layer === "conflict") { const c = A.conflict && A.conflict.countries[iso]; return `<div class="gc-row"><span class="gc-k">Armed conflict</span><b>${c ? (c.lvl === "war" ? "War" : "Smaller conflict") : "None tracked"}</b></div>`; }
    if (g.layer === "oil") { const o = A.oil && A.oil.c[iso], gr = g.oilMode === "ground"; if (!o || (gr ? o.res : o.prod) == null) return `<div class="gc-row"><span class="gc-k">${gr ? "Oil reserves" : "Oil pumped"}</span><b>Little or none</b></div>`; return gr ? `<div class="gc-row"><span class="gc-k">Oil in the ground</span><b>${o.res} bn barrels · #${o.res_r}</b></div>` : `<div class="gc-row"><span class="gc-k">Oil pumped</span><b>${o.prod} m barrels/day · #${o.prod_r}</b></div>`; }
    if (g.layer === "rare") { const o = A.rare && A.rare.c[iso], gr = g.rareMode === "ground"; if (!o || (gr ? o.res : o.kt) == null) return `<div class="gc-row"><span class="gc-k">${gr ? "Rare earth reserves" : "Rare earths mined"}</span><b>Little or none</b></div>`; return gr ? `<div class="gc-row"><span class="gc-k">Rare earths in the ground</span><b>${o.res} m tonnes · #${o.res_r}</b></div>` : `<div class="gc-row"><span class="gc-k">Rare earths mined</span><b>${o.kt} thousand t · ${o.sh}% · #${o.kt_r}</b></div>`; }
    if (g.layer === "min") { const mm = A.min.m[g.minSel], o = A.min.c[iso] && A.min.c[iso][g.minSel], gr = g.minMode === "ground", v = o && (gr ? o.r : o.p); if (v == null) return `<div class="gc-row"><span class="gc-k">${esc(mm.n)} ${gr ? "reserves" : "mined"}</span><b>Little or none</b></div>`; return gr ? `<div class="gc-row"><span class="gc-k">${esc(mm.n)} in the ground</span><b>${o.r} m tonnes · #${o.rr}</b></div>` : `<div class="gc-row"><span class="gc-k">${esc(mm.n)} mined</span><b>${o.p} thousand t · ${o.sh}% · #${o.pr}</b></div>`; }
    if (XMODES[g.layer]) { const sp = XS[g.layer + ":" + g.xs[g.layer]]; if (!sp) return ""; const v = sp.get(iso), m = MC(iso) || {}, lab = { "macro:debt": ["Government debt", (x) => x + "% of GDP"], "macro:infl": ["Inflation", (x) => x + "% a year"], "macro:rate": ["Interest rate", (x) => x + "%"], "money:remit": ["Remittances received", (x) => x + "% of GDP"], "money:fdi": ["Foreign investment in", (x) => x + "% of GDP"], "net:users": ["People online", (x) => x + "%"], "chips:tech": ["High-tech share of exports", (x) => x + "%"], "cyber:origin": ["Share of attack sources", (x) => x + "%"], "cyber:target": ["Attack targeting", (x) => String(x)] }[g.layer + ":" + g.xs[g.layer]]; return lab && v != null ? `<div class="gc-row"><span class="gc-k">${lab[0]}</span><b>${lab[1](v)}</b></div>` : ""; }
    if (g.layer === "trade") return "";
    const k = MIXK[g.layer], r = A.mix && A.mix.c[iso]; if (!k || !r || r[k] == null) return "";
    return `<div class="gc-row"><span class="gc-k">${gShare(r[k])} of ${MIXWHAT[k]}</span><b>#${r[k + "_r"]}</b></div>`;
  };
  try { const saved = localStorage.getItem("ml_globe_layer"), old = localStorage.getItem("ml_globe_tint") === "1" ? "health" : null; const k = saved === null ? old : saved; if (k && LAYERS.some((l) => l[0] === k) && !locked(k)) setLayer(k); } catch (e) {}
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
      <div><div class="gc-k">Economic health</div><b style="color:${G_STATE[w.state][1]}">${G_STATE[w.state][0]}</b> <span class="gc-k">${w.score} / 100${w.conf && w.conf.level === "low" ? " · low confidence" : ""}</span></div></div>` : `<div class="gc-k" style="margin-top:8px">Not enough economic data to score this one.</div>`;
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
      ${meta && meta.tz ? `<div class="gc-row"><span class="gc-k">Local time</span><b class="gc-time">${esc(timeFor(meta.tz))}</b></div>` : ""}${layerRow(c.i)}${sc}${cur}
      ${meta && meta.parent ? `<div class="gc-hint">Overseas part of ${esc(meta.parentName)}. Scored with ${esc(meta.parentName)}.</div>` : meta ? `<div class="gc-hint">Double-click for the full economy</div>` : ""}`;
    card.hidden = false;
    const cw = 280, chh = card.offsetHeight || 240; let x = cx - r.left + 18, y = cy - r.top + 14;
    if (x + cw > r.width - 8) x = cx - r.left - cw - 18; if (y + chh > r.height - 8) y = r.height - chh - 8; card.style.left = Math.max(8, x) + "px"; card.style.top = Math.max(8, y) + "px";
    clearInterval(g.clock); if (meta && meta.tz) g.clock = setInterval(() => { const t = card.querySelector(".gc-time"); if (t) t.textContent = timeFor(meta.tz); }, 1000);
  };

  // opening the side panel for a country
  const panel = host.querySelector(".gpanel");
  const openPanel = (ci) => {   // (also exposed as g.openCountry)
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
  g.openCountry = openPanel;
  // floating country search: type a name, a capital or a country code, then pick (or press Enter) to fly there and open its panel
  const sIn = host.querySelector(".gsearch input"), sList = host.querySelector(".gsr"), norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const inGlobe = new Set(list.map((o) => o.i).filter(Boolean));
  const pool = Object.values(A.countries).filter((m) => inGlobe.has(m.iso3)).map((m) => ({ iso: m.iso3, name: m.name, iso2: m.iso2, region: m.region, n1: norm(m.name), n2: norm((m.official || "") + " " + (m.capital || "")), c2: norm(m.iso2), c3: norm(m.iso3), off: m.parent ? 0.5 : 0 }));
  let sHits = [], sSel = 0;
  const sRender = () => { sList.innerHTML = sHits.map((h, i) => `<li role="option" data-i="${i}" class="${i === sSel ? "on" : ""}"><span class="gc-flag" style="font-size:18px">${gFlag(h.iso2)}</span><span>${esc(h.name)}</span><span class="gsr-k">${esc(h.region || "")}</span></li>`).join("") || `<li class="gsr-none">No country matches</li>`; sList.hidden = false; };
  const sFind = (q) => {
    q = norm(q).trim(); if (!q) return [];
    const ALIAS = { uk: "united kingdom", britain: "united kingdom", england: "united kingdom", america: "united states", us: "united states", holland: "netherlands", burma: "myanmar", kyiv: "ukraine", turkiye: "turkey", "ivory coast": "cote d'ivoire", czechia: "czech", swaziland: "eswatini", persia: "iran", "south korea": "korea, republic", "north korea": "korea, democratic" };
    q = ALIAS[q] || q;
    return pool.map((c) => { let r = 9; if (c.n1 === q || c.c3 === q || c.c2 === q) r = 0; else if (c.n1.startsWith(q)) r = 1; else if (c.n1.split(/[\s-]+/).some((w) => w.startsWith(q))) r = 2; else if (c.n1.includes(q)) r = 3; else if (c.n2.includes(q)) r = 4; return { ...c, r: r + c.off }; })
      .filter((c) => c.r < 9).sort((a, b) => a.r - b.r || a.name.localeCompare(b.name)).slice(0, 7);
  };
  const sPick = (h) => { if (!h) return; const ci = list.findIndex((o) => o.i === h.iso); sIn.value = h.name; sList.hidden = true; sIn.blur(); if (ci >= 0) openPanel(ci); };
  sIn.addEventListener("input", () => { sHits = sFind(sIn.value); sSel = 0; if (sIn.value.trim()) sRender(); else sList.hidden = true; });
  sIn.addEventListener("focus", () => { sIn.select(); if (sHits.length && sIn.value.trim()) sRender(); });
  sIn.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!sHits.length) return; e.preventDefault(); sSel = (sSel + (e.key === "ArrowDown" ? 1 : -1) + sHits.length) % sHits.length; sRender(); }
    else if (e.key === "Enter") { e.preventDefault(); sPick(sHits[sSel]); }
    else if (e.key === "Escape") { sList.hidden = true; sIn.blur(); }
  });
  sList.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); sPick(sHits[+li.dataset.i]); } });
  sIn.addEventListener("blur", () => setTimeout(() => { sList.hidden = true; }, 120));
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
    for (const k in g.meshes) { const m = g.meshes[k], want = !!g.layer && meshKey(g.layer) === k; g.layerO[k] += ((want ? 1 : 0) - g.layerO[k]) * Math.min(1, (force ? 1 : dt * 5)); m.material.opacity = g.layerO[k]; m.visible = g.layerO[k] > 0.01; }
    if (g.oilG) g.oilG.visible = g.layer === "oil";
    if (g.rareG) g.rareG.visible = g.layer === "rare";
    if (g.minG) g.minG.visible = g.layer === "min";
    for (const k in g.xg) { g.xg[k].visible = g.layer === k; if (g.xg[k].visible) { const tt = (now - g.t0) / 1000; g.xm[k].forEach((m) => { m.uniforms.time.value = tt; }); } }
    if (g.xp.length && XMODES[g.layer]) { const tt = (now - g.t0) / 1000; g.xp.forEach((r, i) => { const k = 1 + 0.2 * Math.sin(tt * 2.4 + i); r.scale.set(k, k, k); }); }
    if (g.tradeG) { g.tradeG.visible = g.layer === "trade"; if (g.tradeG.visible) { const tt = (now - g.t0) / 1000; g.tradeMats.forEach((m) => { m.uniforms.time.value = tt; }); g.pulses.forEach((r, i) => { const k = 1 + 0.22 * Math.sin(tt * 2.4 + i); r.scale.set(k, k, k); }); } }
    if (g.arcs) { g.arcs.visible = g.layer === "conflict"; if (g.arcs.visible) g.arcMats.forEach((m) => { m.uniforms.time.value = (now - g.t0) / 1000; }); }
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

const G_EX_COL = { manuf: "#7f9bff", food: "#5fd37a", fuel: "#f08a3c", ore: "#b39b86", farm: "#b4d65a" };
function gExtraHtml(iso, A) {   // what a country makes and buys, and any armed conflict on its soil
  let out = "";
  const cf = A.conflict && A.conflict.countries[iso];
  if (cf) {
    const rows = cf.c.map((id) => A.conflict.conflicts.find((x) => x.id === id)).filter(Boolean);
    out += `<div class="card" style="border-left:4px solid ${cf.lvl === "war" ? "#ff4b4b" : "#ffa83a"}"><h3 style="margin:0 0 2px">Armed conflict: ${cf.lvl === "war" ? "war" : "smaller conflict"}</h3>
      <p class="small muted" style="margin:0 0 8px">War means 1,000+ deaths in fighting a year; smaller conflict means 25 to 999.</p>
      ${rows.map((c) => `<div class="gp-comp"><b>${esc(c.n)}</b> <span class="small muted">since ${esc(c.since)} · ${c.lvl === "war" ? "war" : "smaller conflict"}</span><div class="small">${esc(c.sides)}.${c.note ? " " + esc(c.note) : ""}</div></div>`).join("")}
      <p class="small muted" style="margin:8px 0 0">${esc(A.conflict.caveat)} Snapshot as of ${esc(gDate(A.conflict.asof))}.</p></div>`;
  }
  const oc = A.oil && A.oil.c[iso];
  if (oc) {
    const pill = []; if (oc.prod_r && oc.prod_r <= 10) pill.push(`Top-10 oil producer (#${oc.prod_r})`); if (oc.res_r && oc.res_r <= 10) pill.push(`Top-10 for oil reserves (#${oc.res_r})`);
    out += `<div class="card"><h3 style="margin:0 0 2px">Oil</h3>${pill.length ? `<p style="margin:4px 0 6px">${pill.map((p) => `<span class="pill">${esc(p)}</span>`).join(" ")}</p>` : ""}
      ${oc.prod != null ? `<div class="gc-row" style="padding:6px 0"><span>Pumped each day<div class="small muted">crude oil and condensate</div></span><b>${oc.prod} million barrels · #${oc.prod_r} of ${A.oil.n.prod}</b></div>` : ""}
      ${oc.res != null ? `<div class="gc-row" style="padding:6px 0;border-top:1px solid var(--line)"><span>Proven reserves<div class="small muted">in the ground</div></span><b>${oc.res} billion barrels · #${oc.res_r} of ${A.oil.n.res}</b></div>` : ""}
      <p class="small muted" style="margin:8px 0 0">${esc(A.oil.caveat)} Source: ${esc(A.oil.source)}.</p></div>`;
  }
  const xm = A.macro && A.macro.c[iso];
  if (xm) {
    const row = (lab, v, sub) => (v == null ? "" : `<div class="gc-row" style="padding:6px 0;border-top:1px solid var(--line)"><span>${lab}${sub ? `<div class="small muted">${sub}</div>` : ""}</span><b>${v}</b></div>`);
    const body = row("Government debt", xm.debt != null ? xm.debt + "% of GDP" : null, "IMF estimate for 2024") + row("Inflation", xm.infl != null ? xm.infl + "% a year" : null, "World Bank, " + xm.infl_y) + row("Central bank rate", xm.pol != null ? xm.pol + "%" : null, "IMF, " + xm.pol_d)
      + row("Bank lending rate", xm.lend != null ? xm.lend + "%" : null, "World Bank, " + xm.lend_y + (xm.rr != null ? ", real rate " + xm.rr + "%" : "")) + row("Money sent home by workers abroad", xm.rem != null ? xm.rem + "% of GDP" + (xm.remd ? " · $" + xm.remd + "bn" : "") : null, "World Bank, " + xm.rem_y)
      + row("Foreign investment coming in", xm.fdi != null ? xm.fdi + "% of GDP" : null, "World Bank, " + xm.fdi_y) + row("People online", xm.net != null ? xm.net + "%" : null, "World Bank, " + xm.net_y) + row("High-tech share of exports", xm.tech != null ? xm.tech + "%" : null, xm.techd ? "$" + xm.techd + "bn a year, " + xm.tech_y : "")
      + (A.cyber && A.cyber.origin && A.cyber.origin[iso] != null ? row("Share of attack sources", A.cyber.origin[iso] + "%", "recent snapshot") : "");
    if (body) out += `<div class="card"><h3 style="margin:0 0 2px">Debt, prices, money and tech</h3>${body}<p class="small muted" style="margin:8px 0 0">${esc(A.macro.source)}. Latest year each country reports; the year is shown under each figure.</p></div>`;
  }
  const mc = A.min && A.min.c[iso];
  if (mc) {
    const rows = A.min.order.filter((k) => mc[k]).map((k) => { const o = mc[k], m = A.min.m[k]; return `<div class="gc-row" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${esc(m.n)}</b><div class="small muted">${o.p != null ? "mined " + o.p + " thousand t · " + o.sh + "% of world" : "no significant mining"}${o.r != null ? " · reserves " + o.r + " m t" : ""}</div></span><b>${o.pr ? "mined #" + o.pr : ""}${o.pr && o.rr ? " · " : ""}${o.rr ? "reserves #" + o.rr : ""}</b></div>`; }).join("");
    out += `<div class="card"><h3 style="margin:0 0 2px">Critical minerals</h3>${rows}<p class="small muted" style="margin:8px 0 0">${esc(A.min.caveat)} Source: ${esc(A.min.source)}.</p></div>`;
  }
  const rc = A.rare && A.rare.c[iso];
  if (rc) {
    const pill = []; if (rc.kt_r && rc.kt_r <= 5) pill.push(`Top-5 rare earth miner (#${rc.kt_r})`); if (rc.res_r && rc.res_r <= 5) pill.push(`Top-5 for rare earth reserves (#${rc.res_r})`);
    out += `<div class="card"><h3 style="margin:0 0 2px">Rare earths</h3>${pill.length ? `<p style="margin:4px 0 6px">${pill.map((p) => `<span class="pill">${esc(p)}</span>`).join(" ")}</p>` : ""}
      ${rc.kt != null ? `<div class="gc-row" style="padding:6px 0"><span>Mined each year<div class="small muted">rare earth oxide</div></span><b>${rc.kt} thousand tonnes · ${rc.sh}% of world · #${rc.kt_r} of ${A.rare.n.kt}</b></div>` : ""}
      ${rc.res != null ? `<div class="gc-row" style="padding:6px 0;border-top:1px solid var(--line)"><span>Proven reserves<div class="small muted">in the ground</div></span><b>${rc.res} million tonnes · #${rc.res_r} of ${A.rare.n.res}</b></div>` : ""}
      <p class="small muted" style="margin:8px 0 0">${esc(A.rare.caveat)} Source: ${esc(A.rare.source)}.</p></div>`;
  }
  const m = A.mix && A.mix.c[iso];
  if (m) {
    const pills = []; if (m.manf_r && m.manf_r <= 10) pills.push(`Top-10 goods maker (#${m.manf_r})`); if (m.agr_r && m.agr_r <= 10) pills.push(`Top-10 food grower (#${m.agr_r})`); if (m.cons_r && m.cons_r <= 10) pills.push(`Top-10 spender (#${m.cons_r})`);
    const ex = m.ex, lab = A.mix.label || {}, sum = ex ? Object.values(ex).reduce((a, b) => a + b, 0) : 0, top = ex ? Object.entries(ex).sort((a, b) => b[1] - a[1])[0] : null;
    const row = (k, name, what) => (m[k] == null ? "" : `<div class="gc-row" style="padding:6px 0;border-top:1px solid var(--line)"><span>${name}<div class="small muted">${gShare(m[k])} of ${what} · ${m[k + "_y"]}</div></span><b>#${m[k + "_r"]} of ${A.mix.n[k]}</b></div>`);
    out += `<div class="card"><h3 style="margin:0 0 2px">What it makes and buys</h3>${pills.length ? `<p style="margin:4px 0 6px">${pills.map((p) => `<span class="pill">${esc(p)}</span>`).join(" ")}</p>` : ""}
      ${row("manf", "Goods (manufacturing)", MIXWHAT_TXT.manf)}${row("agr", "Food and farm output", MIXWHAT_TXT.agr)}${row("cons", "Household spending (a buyer)", MIXWHAT_TXT.cons)}
      ${ex && sum > 0 ? `<h4 style="margin:12px 0 4px">What it sells to the rest of the world</h4><div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--line)">${Object.entries(ex).map(([k, v]) => `<i title="${esc(lab[k] || k)} ${v}%" style="width:${(v / Math.max(sum, 100) * 100).toFixed(1)}%;background:${G_EX_COL[k] || "#999"}"></i>`).join("")}</div>
        <p class="small" style="margin:6px 0 0">${Object.entries(ex).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span style="color:${G_EX_COL[k]}">●</span> ${esc(lab[k] || k)} ${Math.round(v)}%`).join(" &nbsp; ")}</p>
        ${top && top[1] >= 45 ? `<p class="small muted" style="margin:4px 0 0">Mostly sells ${esc(lab[top[0]] || top[0])}.</p>` : ""}` : ""}
      <p class="small muted" style="margin:8px 0 0">Source: ${esc(A.mix.source)}. Shares are of the countries that report, using each one's latest year.</p></div>`;
  }
  return out;
}
const MIXWHAT_TXT = { manf: "world manufacturing", agr: "world farm output", cons: "world household spending" };

async function gPanelRender(panel, iso, A, onClose) {
  const meta = A.countries[iso], w = A.world.countries[iso], WM = A.world;
  if (meta && meta.parent) {   // an overseas department or territory: no figures of its own, so point to the country it belongs to
    panel.innerHTML = `<div class="gp-head"><div><div class="small muted">${gFlag(meta.iso2)} ${esc(meta.region || "")}${meta.sub ? " · " + esc(meta.sub) : ""}</div><h2 style="margin:2px 0 0">${esc(meta.name)}</h2><div class="small muted">Capital ${esc(meta.capital || "-")}</div></div><button class="gp-x" aria-label="Close">✕</button></div>
      <div class="card" style="margin-top:12px"><p style="margin:0"><b>${esc(meta.name)} is part of ${esc(meta.parentName)}.</b> It sits in ${esc(meta.sub || meta.region)}, far from the rest of the country, but it is governed and counted as ${esc(meta.parentName)}, so its economy figures and health score are ${esc(meta.parentName)}'s.</p>
      <p style="margin:10px 0 0"><button class="btn" data-parent="${esc(meta.parent)}">Open ${esc(meta.parentName)}</button></p></div>`;
    panel.querySelector(".gp-x").onclick = onClose;
    panel.querySelector("[data-parent]").onclick = () => { const ci = A.borders.findIndex((o) => o.i === meta.parent); if (ci >= 0 && GLOBE.g && GLOBE.g.openCountry) GLOBE.g.openCountry(ci); else onClose(); };
    return;
  }
  let S = GLOBE.series; if (!S) { S = GLOBE.series = await loadJson("world/world-series.json"); }
  if (!panel.isConnected || panel.hidden) return;
  const ser = (S && S.s[iso]) || {}, usS = (S && S.s.USA) || {}, years = S ? S.years : [], ref = WM.ref_year, st = w && w.state ? G_STATE[w.state] : null;
  const pop = w && w.pop, tzStr = meta.tz ? (() => { try { return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone: meta.tz, timeZoneName: "short" }).format(new Date()); } catch (e) { return ""; } })() : "";
  const money = (v) => (v == null ? "-" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + " trillion" : "$" + v.toFixed(v >= 100 ? 0 : 1) + " billion");
  const ring = w && w.score != null ? `<svg viewBox="0 0 44 44" width="92" height="92"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="22" cy="22" r="18" fill="none" stroke="${st[1]}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(w.score / 100) * 113.1} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle" font-size="12" font-weight="800" fill="var(--tx)">${w.score}</text></svg>` : "";
  const compOne = (c) => { const r = WM.rules[c.k], m = WM.meta[c.k], stc = c.s >= 65 ? "#2fd4a0" : c.s >= 45 ? "#f5b546" : "#ff6b6b";
    return `<div class="gp-comp"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.label)}</b><span class="small">${c.k === "currency" ? (c.v > 0 ? "+" : "") + c.v + "% (dollar, 1y)" : c.v + " " + (m ? esc(m.unit) : "")} <span class="muted">${c.y}</span></span></div>
      <div class="gp-bar"><i style="width:${c.s}%;background:${stc}"></i></div><div class="small muted">${c.s} of 100 points · weight ${r.w} · ${esc(r.rule)}</div></div>`; };
  const PIL = WM.rules._pillars || {}, pl = (w && w.pillars) || {};
  const comps = w ? Object.keys(PIL).map((p) => { const cs = w.comps.filter((c) => c.p === p); if (!cs.length) return ""; const ps = pl[p], pc = ps >= 65 ? "#2fd4a0" : ps >= 45 ? "#f5b546" : "#ff6b6b";
    return `<h4 style="margin:14px 0 4px;display:flex;justify-content:space-between"><span>${esc(PIL[p])}</span><span style="color:${pc}">${ps} / 100</span></h4>${cs.map(compOne).join("")}`; }).join("") : "";
  const pillBars = w && w.pillars ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px">${Object.keys(PIL).filter((p) => pl[p] != null).map((p) => `<div><div class="small muted">${esc(PIL[p])}</div><div class="gp-bar"><i style="width:${pl[p]}%;background:${pl[p] >= 65 ? "#2fd4a0" : pl[p] >= 45 ? "#f5b546" : "#ff6b6b"}"></i></div><div class="small"><b>${pl[p]}</b></div></div>`).join("")}</div>` : "";
  const confHtml = w && w.conf && w.conf.level !== "high" ? `<p class="small" style="margin:8px 0 0;padding:8px 10px;border:1px solid var(--line);border-radius:8px"><b>${w.conf.level === "low" ? "Low confidence." : "Medium confidence."}</b> Treat this score loosely: ${esc(w.conf.why.join("; "))}.</p>` : "";
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
    <div class="card" style="margin-top:12px"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${ring}<div style="flex:1;min-width:200px">${w && w.score != null ? `<span class="small muted">Economic health score</span><div><b style="font-size:22px;color:${st[1]}">${st[0]}</b> <span class="muted">${w.score} / 100</span></div><p class="small muted" style="margin:4px 0 0">${w.comps.length} readings from the IMF and World Bank. A yardstick of financial and institutional health built by fixed rules. It is not a rating, a forecast or investment advice, and it does not measure size or power.</p>` : `<b>Not enough data to score</b><p class="small muted" style="margin:4px 0 0">This country has too few of the readings we use (at least six are needed).</p>`}</div></div>
      ${pillBars}${confHtml}
      ${comps ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">How the score is built</summary><p class="small muted" style="margin:6px 0 8px">${esc(WM.rules._method)}</p>${comps}</details>` : ""}</div>
    <div class="hz"><div class="card"><div class="small muted">Population</div><b>${pop != null ? pop.toFixed(pop >= 100 ? 0 : 1) + " million" : "-"}</b></div><div class="card"><div class="small muted">Economy size</div><b>${money(w && w.gdp)}</b></div><div class="card"><div class="small muted">Income per person</div><b>${w && w.gdppc != null ? "$" + w.gdppc.toLocaleString() : "-"}</b></div>${meta.income ? `<div class="card"><div class="small muted">Income group</div><b>${esc(meta.income)}</b></div>` : ""}</div>
    ${curHtml}${cards}<p class="small muted">Sources: ${esc(WM.source)}. Years from ${ref} on are IMF estimates and projections and get revised. Educational information only. Not investment advice.</p>`;
  { const ex = gExtraHtml(iso, A); if (ex) panel.querySelector(".gp-head").insertAdjacentHTML("afterend", ex); }
  panel.scrollTop = 0; panel.querySelector(".gp-x").onclick = onClose;
  const seriesForWire = Object.assign({}, ser, { _us: usS }); gWireCharts(panel, seriesForWire, years);
  if (cur && cur.hist) fetch((DATA_BASE || "data/") + "fx/FX_" + cur.code + ".json").then((r) => (r.ok ? r.json() : null)).then((h) => { const box = panel.querySelector("#gpfx"); if (h && box && typeof mountChart === "function") mountChart(box, h, { money: false, decimals: fxDec(cur.per), lineOnly: true, noRanges: true, rangeName: "5 years" }); }).catch(() => {});
}

function globeHtml() {
  return `<section class="globe-wrap" id="globe" aria-label="Interactive globe of the world's economies">
    <div class="globe-stage"><div class="gload"><span>Loading the Earth…</span></div><div class="glabels"></div><div class="gcard" hidden></div>
      <div class="gui-top"><span class="gtag">Live day &amp; night · time zones</span></div>
      <div class="gsearch"><input type="search" placeholder="Search a country" aria-label="Search for a country" autocomplete="off" spellcheck="false"><ul class="gsr" role="listbox" hidden></ul></div>
      <div class="gui-right"><div class="glayers" role="group" aria-label="Map layers"></div><div class="glegend" hidden></div></div>
      <div class="gui-bot"><div class="ghint"><b>Hover</b> a country for two seconds · <b>double-click</b> for its economy · drag to spin</div><button class="gscroll" aria-label="Scroll to markets">Markets today ↓</button></div><div class="gcredit">Imagery: NASA Visible Earth · Borders: Natural Earth · Economy: IMF, World Bank · Conflict: public trackers</div></div>
    <aside class="gpanel" hidden></aside></section>`;
}
