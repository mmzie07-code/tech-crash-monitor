// AI Watch > owner-only write-up. The text is stored in the Supabase database (table owner_docs), never in this repo or the site's files.
// The edge function returns it only when the owner key is sent, so this card is shown to the owner and nobody else can read the text even by reading this code.
function mdLite(src) {
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  const lines = String(src || "").split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    let m;
    if ((m = /^(#{2,4})\s+(.*)$/.exec(l))) { const n = m[1].length + 0; out.push(`<h${n} style="margin:${n === 2 ? "1.4em" : "1.1em"} 0 .3em">${inline(m[2])}</h${n}>`); continue; }
    if (/^---+$/.test(l.trim())) { out.push("<hr>"); continue; }
    if (l.startsWith("|")) {  // table: header row, separator row, body rows
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l); i += 2; const body = [];
      while (i < lines.length && lines[i].startsWith("|")) body.push(cells(lines[i++])); i--;
      out.push(`<div class="tw"><table><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table></div>`); continue;
    }
    if (l.startsWith(">")) { const q = []; while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, "")); i--; out.push(`<div class="callout">${inline(q.join(" "))}</div>`); continue; }
    if (/^\s*(\d+\.|-)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && /^\s*(\d+\.|-)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*(\d+\.|-)\s+/, "")); i--;
      out.push(`<${ordered ? "ol" : "ul"} style="margin:.4em 0;padding-left:22px">${items.map((t) => `<li style="margin:.3em 0">${inline(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`); continue;
    }
    const p = [l]; while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||>|---|\s*(\d+\.|-)\s)/.test(lines[i + 1])) p.push(lines[++i]);
    out.push(`<p style="margin:.5em 0">${inline(p.join(" "))}</p>`);
  }
  return out.join("");
}

function ownerDocCard() {
  if (typeof AUTH === "undefined" || !AUTH.owner) return "";
  afterRender.push(() => { const b = document.querySelector("#odbtn"); if (b) b.onclick = ownerDocLoad; });
  return `<div class="card" style="border:2px solid var(--brand)"><span class="pill">Owner only</span><h3 style="margin:6px 0 2px">The full algorithm, in full detail</h3>
   <p class="small muted" style="margin-top:0">What the gauge is trying to predict, every input and threshold, how the score is built, how it was tested, and where it breaks. Only you can see this. It isn't stored in the site's files.</p>
   <button class="btn" id="odbtn">Open the write-up</button><div id="odout" class="lesson" style="margin-top:12px"></div></div>`;
}

async function ownerDocLoad() {
  const out = document.querySelector("#odout"), btn = document.querySelector("#odbtn"); if (!out) return;
  if (out.innerHTML.trim()) { out.innerHTML = ""; if (btn) btn.textContent = "Open the write-up"; return; }   // second click closes it
  out.innerHTML = `<p class="small muted">Loading…</p>`;
  try {
    const j = await liveGet("action=owner_doc&id=algorithm");
    out.innerHTML = mdLite(j.body) + `<p class="small muted" style="margin-top:14px">Last updated ${esc((j.updated_at || "").slice(0, 10))}. <button class="btn ghost" style="padding:4px 10px;font-size:12px" onclick="window.print()">Print / save as PDF</button></p>`;
    if (btn) btn.textContent = "Close the write-up";
  } catch (e) {
    out.innerHTML = `<p class="small" style="color:var(--warn)">Couldn't load it (${esc(String(e.message || e))}). This needs two one-time setup steps: the latest edge function deployed, and the write-up saved in your database (supabase/owner_docs setup).</p>`;
  }
}
