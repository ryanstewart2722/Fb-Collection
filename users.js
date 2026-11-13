(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const box = document.getElementById("users");
  try {
    const r = await fetch(`${MOMS.url}/rest/v1/rpc/list_public_profiles`, { method: "POST", headers: { apikey: MOMS.key, "Content-Type": "application/json" }, body: "{}" });
    const rows = await r.json();
    const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const people = rows.map((p) => ({ ...p, owner: p.username === "r", count: Number(p.items) || 0 }))
      .sort((a, b) => (b.owner - a.owner) || (b.count - a.count));   // you first, then the most entries
    box.innerHTML = `<div class="row head"><span>User</span><span>Page</span><span>Entries</span><span>Joined</span></div>` + people.map((p) =>
      `<a class="row" href="/u/${esc(p.username)}"><span>${esc(p.display_name || p.username)}${p.owner ? ` <i class="u-tag">Museum Owner</i>` : ""}</span><span>u/${esc(p.username)}</span><span>${p.count}</span><span>${p.owner ? "Oct 15, 2026" : fmt(p.joined)}</span></a>`).join("");
  } catch { box.innerHTML = `<p class="p-empty">Couldn't load the list. Please refresh.</p>`; }
})();
