// Sign in with an emailed link (or a password), then pick a username the first time.
const sb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: true } });
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// Only allow a same-site destination (no external redirects).
const next = (() => { const n = params.get("next"); return n && /^\/?[A-Za-z0-9_\-./]+(\?[A-Za-z0-9_\-=&%.]*)?$/.test(n) && !n.startsWith("//") ? "/" + n.replace(/^\//, "") : null; })();
const recovering = location.hash.includes("type=recovery");

const VIEWS = ["email", "sent", "pick", "password", "reset"];
function show(id) { VIEWS.forEach((v) => ($("#v-" + v).hidden = v !== id)); }
function say(sel, text) { const el = $(sel); el.textContent = text || ""; el.hidden = !text; }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-show]"); if (b) { e.preventDefault(); show(b.dataset.show); } });

const here = () => location.origin + "/signin.html" + (next ? "?next=" + encodeURIComponent(next) : "");

/* ---------- after we have a session ---------- */
let handled = false;
async function afterSignIn(session) {
  if (handled || recovering) return;
  handled = true;
  const { data, error } = await sb.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
  if (error) { handled = false; return say("#e-email", "Couldn't load your account: " + error.message); }
  if (!data?.username) { show("pick"); $("#username").focus(); return; }
  location.replace(next || "/u/" + data.username);
}
sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { show("reset"); return; }
  if (event === "SIGNED_IN" && session) afterSignIn(session);
});
sb.auth.getSession().then(({ data }) => { if (data.session && !recovering) afterSignIn(data.session); });

/* ---------- email link ---------- */
$("#f-email").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  say("#e-email", "");
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: here(), shouldCreateUser: true } });
  btn.disabled = false;
  if (error) return say("#e-email", /rate/i.test(error.message) ? "Too many emails were sent just now. Wait a few minutes and try again." : error.message);
  $("#sent-to").textContent = email;
  show("sent");
});

/* ---------- Google ---------- */
$("#google").addEventListener("click", async () => {
  say("#e-email", "");
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } });
  if (error) say("#e-email", "Couldn't start Google sign-in. " + error.message);
});

/* ---------- emailed code (works on any device) ---------- */
$("#f-code").addEventListener("submit", async (e) => {
  e.preventDefault();
  say("#e-code", "");
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const token = $("#code").value.replace(/\s/g, "");
  const { error } = await sb.auth.verifyOtp({ email: $("#sent-to").textContent, token, type: "email" });
  btn.disabled = false;
  if (error) say("#e-code", "That code didn't work. Check it, or ask for a new one.");
});

/* ---------- password ---------- */
$("#f-password").addEventListener("submit", async (e) => {
  e.preventDefault();
  say("#e-password", ""); say("#m-password", "");
  const { error } = await sb.auth.signInWithPassword({ email: $("#pw-email").value.trim(), password: $("#pw").value });
  if (error) say("#e-password", "That email and password don't match.");
});
$("#forgot").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("#pw-email").value.trim();
  if (!email) return say("#e-password", "Type your email above first.");
  say("#e-password", "");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/signin.html" });
  if (error) return say("#e-password", error.message);
  const m = $("#m-password"); m.textContent = "If that email has an account, a reset link is on its way."; m.hidden = false;
});
$("#f-reset").addEventListener("submit", async (e) => {
  e.preventDefault();
  say("#e-reset", "");
  const { error } = await sb.auth.updateUser({ password: $("#newpw").value });
  if (error) return say("#e-reset", error.message);
  location.replace(next || "/");
});

/* ---------- username ---------- */
let checkTimer, checkSeq = 0;
$("#username").addEventListener("input", (e) => {
  const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  e.target.value = v;
  $("#pick-preview").textContent = v || "yourname";
  const msg = $("#pick-msg"), btn = $("#pick-btn");
  btn.disabled = true; msg.textContent = "";
  clearTimeout(checkTimer);
  if (v.length < 3) { if (v) msg.textContent = "At least 3 characters."; return; }
  const seq = ++checkSeq;
  checkTimer = setTimeout(async () => {
    const { data, error } = await sb.rpc("username_available", { u: v });
    if (seq !== checkSeq) return;
    if (error) { msg.textContent = "Couldn't check that name. Try again."; return; }
    msg.textContent = data ? "✓ Available" : "That username is not available.";
    btn.disabled = !data;
  }, 250);
});
$("#f-pick").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show("email");
  const username = $("#username").value;
  const display_name = $("#display").value.trim() || null;
  const { data, error } = await sb.from("profiles").update({ username, display_name }).eq("id", session.user.id).select("username");
  if (error || !data?.length) {
    $("#pick-msg").textContent = error?.code === "23505" ? "That username was just taken. Try another." : (error?.message || "Couldn't save that name.");
    return;
  }
  location.replace(next || "/u/" + data[0].username);
});

if (recovering) show("reset");
