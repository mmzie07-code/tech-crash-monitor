// Accounts (Supabase Auth) + owner bypass key. Dormant until js/config.js has a supabaseUrl.
const AUTH = { enabled: !!(window.ANALYTIC && window.ANALYTIC.supabaseUrl), sb: null, user: null, owner: false, ready: false };
const OPEN_ROUTES = ["home", "about", "login"];
const fnUrl = () => window.ANALYTIC.supabaseUrl.replace(/\/$/, "") + "/functions/v1/market";

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

async function authInit() {
  if (!AUTH.enabled) { AUTH.ready = true; return; }
  try {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
    AUTH.sb = window.supabase.createClient(window.ANALYTIC.supabaseUrl, window.ANALYTIC.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await AUTH.sb.auth.getSession();
    AUTH.user = data.session ? data.session.user : null;
    AUTH.sb.auth.onAuthStateChange((_e, session) => { AUTH.user = session ? session.user : null; renderAuthButton(); route(); });
    const k = (() => { try { return localStorage.getItem("ml_owner"); } catch (e) { return null; } })();
    if (k) AUTH.owner = await checkOwnerKey(k);
  } catch (e) { AUTH.failed = true; }
  AUTH.ready = true;
  renderAuthButton();
}

async function checkOwnerKey(k) {
  try {
    const r = await fetch(fnUrl() + "?action=ping", { headers: { "x-owner-key": k, apikey: window.ANALYTIC.supabaseAnonKey, authorization: "Bearer " + window.ANALYTIC.supabaseAnonKey } });
    const j = await r.json();
    return r.ok && j.owner === true;
  } catch (e) { return false; }
}

// Headers for calling the market-data function as whoever is signed in.
async function apiHeaders() {
  const h = { apikey: window.ANALYTIC.supabaseAnonKey };
  if (AUTH.owner) { try { h["x-owner-key"] = localStorage.getItem("ml_owner"); } catch (e) {} h.authorization = "Bearer " + window.ANALYTIC.supabaseAnonKey; return h; }
  const { data } = await AUTH.sb.auth.getSession();
  if (data.session) h.authorization = "Bearer " + data.session.access_token;
  return h;
}

function signedIn() { return !AUTH.enabled || !!AUTH.user || AUTH.owner; }
function gateView(a) { return AUTH.enabled && window.ANALYTIC.requireLogin && !signedIn() && !OPEN_ROUTES.includes(a) ? loginView("Sign in to use The Analytic") : null; }

function renderAuthButton() {
  const el = $("#authbtn"); if (!el) return;
  if (!AUTH.enabled) { el.style.display = "none"; return; }
  el.style.display = "";
  if (signedIn()) { el.textContent = AUTH.owner ? "Owner · Sign out" : "Sign out"; el.onclick = async () => { try { localStorage.removeItem("ml_owner"); } catch (e) {} AUTH.owner = false; if (AUTH.sb) await AUTH.sb.auth.signOut(); AUTH.user = null; location.hash = "#/"; renderAuthButton(); route(); }; }
  else { el.textContent = "Sign in"; el.onclick = () => { location.hash = "#/login"; }; }
}

let loginMode = "in";
function loginView(title) {
  afterRender.push(() => {
    const f = $("#af"), msg = $("#am"), say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? "var(--bad)" : "var(--ok)"; };
    document.querySelectorAll("[data-lm]").forEach((b) => b.onclick = (e) => { e.preventDefault(); loginMode = b.dataset.lm; route(); });
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault(); const email = f.email.value.trim(), pw = f.pw.value;
      if (loginMode === "up") {
        if (pw.length < 10) return say("Use a password with at least 10 characters.", true);
        if (!f.age.checked) return say("You must confirm you are 16 or older to create an account.", true);
        say("Creating your account…");
        const { error } = await AUTH.sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname, data: { age_16_plus: true } } });
        return error ? say(error.message, true) : say("Almost done! Check your email and click the confirmation link, then come back and sign in.");
      }
      say("Signing in…");
      const { error } = await AUTH.sb.auth.signInWithPassword({ email, password: pw });
      if (error) say(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message, true); else { location.hash = "#/"; }
    };
    const fg = $("#forgot"); if (fg) fg.onclick = async (e) => { e.preventDefault(); const email = f.email.value.trim(); if (!email) return say("Type your email above first.", true); const { error } = await AUTH.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); error ? say(error.message, true) : say("If that email has an account, a reset link is on its way."); };
    const ok = $("#ownerform"); if (ok) ok.onsubmit = async (e) => { e.preventDefault(); const k = ok.key.value.trim(); say("Checking key…"); if (await checkOwnerKey(k)) { try { localStorage.setItem("ml_owner", k); } catch (er) {} AUTH.owner = true; renderAuthButton(); location.hash = "#/"; route(); } else say("That key isn't valid.", true); };
  });
  if (!AUTH.enabled) return `<div class="lesson"><h1>Sign in</h1><p class="muted">Accounts aren't switched on yet.</p></div>`;
  if (AUTH.failed) return `<div class="lesson"><h1>Sign in</h1><div class="card">We couldn't reach the sign-in service. Please try again in a moment.</div></div>`;
  const up = loginMode === "up";
  return `<div class="lesson" style="max-width:440px"><h1 style="font-size:30px">${esc(title || (up ? "Create your account" : "Welcome back"))}</h1>
  <p class="muted">${up ? "Free. Takes a minute." : "Sign in to use lessons, live markets, and practice trading."}</p>
  <div class="tabs"><a href="#" data-lm="in" class="${up ? "" : "on"}">Sign in</a><a href="#" data-lm="up" class="${up ? "on" : ""}">Create account</a></div>
  <form id="af" class="card ctl"><label>Email<input name="email" type="email" required autocomplete="email" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:inherit"></label>
   <label>Password<input name="pw" type="password" required minlength="${up ? 10 : 1}" autocomplete="${up ? "new-password" : "current-password"}" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:inherit"></label>
   ${up ? `<label style="display:flex;gap:10px;align-items:flex-start;font-weight:400"><input name="age" type="checkbox" style="margin-top:4px"><span class="small">I am 16 or older and I agree that this site is for education only and is not investment advice.</span></label>` : ""}
   <button class="btn" type="submit">${up ? "Create account" : "Sign in"}</button><div id="am" class="small" role="status"></div>
   ${up ? "" : `<a href="#" id="forgot" class="small">Forgot your password?</a>`}</form>
  <details><summary class="small muted" style="cursor:pointer">Owner access</summary><form id="ownerform" class="ctl" style="margin-top:8px"><input name="key" type="password" placeholder="Owner key" autocomplete="off" style="padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:inherit"><button class="btn ghost" type="submit">Use key</button></form></details>
  <p class="small muted" style="margin-top:14px">We store only your email and your practice progress. No ads, no tracking.</p></div>`;
}
