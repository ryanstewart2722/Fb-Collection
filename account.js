// A signed-in person's account page: who they are, set a password, sign out.
const sb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: false } });
const $ = (s) => document.querySelector(s);
const say = (t, bad) => { const m = $("#a-msg"); m.textContent = t || ""; m.style.color = bad ? "#b00020" : ""; };

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.replace("/signin.html?next=account.html");
  const { data: p } = await sb.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
  $("#a-email").textContent = session.user.email;
  const page = $("#a-page");
  if (p?.username) { page.href = "/u/" + p.username; page.textContent = "museumofminiskateboards.org/u/" + p.username; }
  else { page.href = "/signin.html"; page.textContent = "Pick a username first"; }
  $("#acct").hidden = false;
})();

$("#f-pass").addEventListener("submit", async (e) => {
  e.preventDefault();
  const a = $("#p1").value, b = $("#p2").value;
  if (a !== b) return say("Those two don't match.", true);
  if (a.length < 8) return say("Use at least 8 characters.", true);
  const btn = e.target.querySelector("button"); btn.disabled = true; say("Saving…");
  const { error } = await sb.auth.updateUser({ password: a });
  btn.disabled = false;
  if (error) return say(/same|different/i.test(error.message) ? "That's already your password." : error.message, true);
  e.target.reset(); say("Password saved. You can sign in with your email and password from now on.");
});
$("#a-out").addEventListener("click", async () => { await sb.auth.signOut(); location.href = "/"; });
