// Full-bleed image tiles for the Markets and Learn hubs. Each tile's picture is generated in the browser from its own seed:
// glowing light fields with thousands of fine flow lines, so every tile is unique, sharp at any size, weighs nothing, and has no licensing strings.
const TILE_CLS = { markets: ["w2 h2", "", "", "w2", "", "", "", "w2", "", "", ""], learn: ["w2 h2", "", "", "w2", "", "", "", ""] };

function tileGrid(items, kind) {
  const sz = TILE_CLS[kind] || [];
  afterRender.push(tilesDraw);
  return `<div class="fbleed"><div class="fgrid">${items.map((t, i) => `<a class="ftile ${sz[i] || ""} ${t.soon ? "soon" : ""}" href="${t.href}" data-seed="${esc(t.seed || t.title)}" data-hue="${t.hue || 200}" aria-label="${esc(t.title)}">
    <canvas aria-hidden="true"></canvas><span class="fshade"></span>
    <span class="ftop"><em>${t.tag || ""}</em><i class="farrow">↗</i></span>
    ${t.big ? `<span class="fbig">${t.big}</span>` : ""}
    <span class="fcap"><b>${t.title}</b><span>${t.blurb || ""}</span>${t.meta ? `<small>${t.meta}</small>` : ""}</span></a>`).join("")}</div></div>`;
}

function tilesDraw() {
  const els = [...document.querySelectorAll(".ftile canvas")]; let i = 0;
  const next = () => { const cv = els[i++]; if (!cv) return; const t = cv.closest(".ftile"); try { tileArt(cv, t.dataset.seed, +t.dataset.hue); } catch (e) {} (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(next); };
  next();
}

function tileArt(cv, seed, hue) {
  const W = (cv.width = 960), H = (cv.height = 640), g = cv.getContext("2d");
  let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const P = Array.from({ length: 257 }, () => rnd()), at = (x, y) => P[(Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & 255];
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); return at(xi, yi) * (1 - xf) * (1 - yf) + at(xi + 1, yi) * xf * (1 - yf) + at(xi, yi + 1) * (1 - xf) * yf + at(xi + 1, yi + 1) * xf * yf; };
  const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3) * 0.15;
  g.fillStyle = "#030304"; g.fillRect(0, 0, W, H);
  // light: two soft glows in the tile's hue, one offset into a neighbouring hue
  for (const [fx, fy, r, hh, a] of [[0.15 + rnd() * 0.7, 0.2 + rnd() * 0.6, 0.65, hue, 0.42], [0.2 + rnd() * 0.6, 0.3 + rnd() * 0.5, 0.5, hue + 38, 0.26]]) {
    const gr = g.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, r * W);
    gr.addColorStop(0, `hsla(${hh},70%,52%,${a})`); gr.addColorStop(1, "hsla(0,0%,0%,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // flow lines following a smooth noise field
  const sc = 0.0032 + rnd() * 0.0025, twist = 5 + rnd() * 5, off = rnd() * 50; g.lineCap = "round";
  for (let n = 0; n < 520; n++) {
    let x = rnd() * W, y = rnd() * H; const bright = rnd() < 0.18;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 90; s++) { const a = fbm(x * sc + off, y * sc) * twist; x += Math.cos(a) * 3.4; y += Math.sin(a) * 3.4; g.lineTo(x, y); }
    g.strokeStyle = bright ? `hsla(${hue + 14},85%,80%,${0.25 + rnd() * 0.25})` : `hsla(${hue},40%,85%,${0.05 + rnd() * 0.1})`;
    g.lineWidth = bright ? 0.9 + rnd() * 0.8 : 0.5 + rnd() * 0.6; g.stroke();
  }
  // grain
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let k = 0; k < d.length; k += 4) { const nz = (rnd() - 0.5) * 14; d[k] += nz; d[k + 1] += nz; d[k + 2] += nz; }
  g.putImageData(id, 0, 0);
}
