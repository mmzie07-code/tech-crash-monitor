// Saves practice portfolio + lesson progress to the signed-in user's account (Supabase tables with row-level security).
// The owner (key access) has no account, so their data stays on-device.
let syncTimer = null;
const canSync = () => typeof AUTH !== "undefined" && AUTH.enabled && AUTH.sb && AUTH.user;
const localJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };

function queueSync() {
  if (!canSync()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, 1500);
}
async function syncPush() {
  if (!canSync()) return;
  const now = new Date().toISOString(), uid = AUTH.user.id, paper = localJson("ml_paper"), done = localJson("ml_done") || {};
  try {
    if (paper) await AUTH.sb.from("paper_portfolios").upsert({ user_id: uid, data: paper, updated_at: now });
    await AUTH.sb.from("lesson_progress").upsert({ user_id: uid, data: done, updated_at: now });
  } catch (e) {}
}
async function syncPull() {
  if (!canSync()) return;
  try {
    const uid = AUTH.user.id;
    const [pp, lp] = await Promise.all([AUTH.sb.from("paper_portfolios").select("data").eq("user_id", uid).maybeSingle(), AUTH.sb.from("lesson_progress").select("data").eq("user_id", uid).maybeSingle()]);
    let changed = false;
    const serverPaper = pp.data && pp.data.data && pp.data.data.v ? pp.data.data : null, localPaper = localJson("ml_paper");
    if (serverPaper && (!localPaper || (serverPaper.updated || "") > (localPaper.updated || ""))) {  // newer copy wins
      try { localStorage.setItem("ml_paper", JSON.stringify(serverPaper)); } catch (e) {}
      P = null; changed = true;
    }
    const merged = Object.assign({}, (lp.data && lp.data.data) || {}, localJson("ml_done") || {});  // finished lessons never un-finish
    if (JSON.stringify(merged) !== JSON.stringify(state.done)) { state.done = merged; try { localStorage.setItem("ml_done", JSON.stringify(merged)); } catch (e) {} changed = true; }
    await syncPush();
    if (changed) route();
  } catch (e) {}
}
