(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const box = document.getElementById("users");
  try {
    const [r, c] = await Promise.all([
      fetch(`${MOMS.url}/rest/v1/rpc/list_public_profiles`, { method: "POST", headers: { apikey: MOMS.key, "Content-Type": "application/json" }, body: "{}" }),
      fetch("/content.json").then((x) => x.json()).catch(() => null),
    ]);
    const rows = await r.json();
    // The museum owner's collection lives in content.json, so count its entries from there.
    const blank = (i) => !i.img && !Object.values(i.values || {}).some((v) => String(v || "").trim());
    const ownerCount = c ? c.sections.reduce((n, s) => n + s.items.filter((i) => !blank(i)).length, 0) : 0;
    const people = rows.map((p) => ({ ...p, owner: p.username === "r", count: p.username === "r" ? ownerCount : Number(p.items) || 0 }))
      .sort((a, b) => (b.owner - a.owner));
    box.innerHTML = `<div class="row head"><span>User</span><span>Page</span><span>Entries</span></div>` + people.map((p) =>
      `<a class="row" href="/u/${esc(p.username)}"><span>${esc(p.display_name || p.username)}${p.owner ? ` <i class="u-tag">Museum Owner</i>` : ""}</span><span>u/${esc(p.username)}</span><span>${p.count}</span></a>`).join("");
  } catch { box.innerHTML = `<p class="p-empty">Couldn't load the list. Please refresh.</p>`; }
})();
