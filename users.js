(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const box = document.getElementById("users");
  try {
    const r = await fetch(`${MOMS.url}/rest/v1/rpc/list_public_profiles`, { method: "POST", headers: { apikey: MOMS.key, "Content-Type": "application/json" }, body: "{}" });
    const rows = await r.json();
    // The site owner's page is the full collection; show it first.
    box.innerHTML = rows.length ? rows.map((p) => `<a class="u-row" href="/u/${esc(p.username)}"><span>${esc(p.display_name || p.username)}</span><span>/u/${esc(p.username)}</span><span>${p.username === "r" ? "the museum’s owner" : p.items + (p.items === 1 ? " board" : " boards")}</span></a>`).join("") : `<p class="p-empty">No one yet.</p>`;
  } catch { box.innerHTML = `<p class="p-empty">Couldn't load the list. Please refresh.</p>`; }
})();
