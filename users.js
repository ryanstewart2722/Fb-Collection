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
  } catch { box.innerHTML = `<p class="p-empty">Couldn't load the list. Please refresh.</p>`; return; }

  // Desktop: hovering a person shows their main (the one they picked), or else their first setup (or, with no setups, their first deck, obstacle...), big like the museum list does.
  const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;   // phones: tap a person to see their photo, tap it (or the same row) again to open their page
  const H = { apikey: MOMS.key, Authorization: "Bearer " + MOMS.key };
  const get = async (path) => { try { const r = await fetch(`${MOMS.url}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : []; } catch { return []; } };
  const [profiles, items, cuts] = await Promise.all([
    get("profiles?select=id,username&limit=2000"),
    get("collection_items?select=id,user_id,section,image_path,source_path,details,position&status=eq.approved&image_path=not.is.null&order=position&limit=5000"),
    fetch("/user-cuts/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const name = new Map(profiles.map((p) => [p.id, p.username]));
  const RANK = ["setups", "decks", "obstacles", "wheels", "trucks"];
  const first = new Map();   // username -> their first item to show
  items.forEach((i) => {
    const u = name.get(i.user_id);
    const r = i.details?.main ? -1 : RANK.indexOf(i.section);   // the one they marked as their main wins; otherwise their first setup
    if (!u || (r < 0 && !i.details?.main)) return;
    const cur = first.get(u);
    if (!cur || r < cur.r || (r === cur.r && (i.position || 0) < (cur.i.position || 0))) first.set(u, { r, i });
  });
  const urls = new Map();
  async function urlFor(u) {
    if (urls.has(u)) return urls.get(u);
    const it = first.get(u)?.i; if (!it) return "";
    const rc = cuts[it.id];   // the cleaner cut-out, when there is one that passed the check
    let url = "";
    if (rc && rc.file && rc.src === it.source_path && !rc.bad && it.details?.cut !== "quick") url = "/" + rc.file;
    else if (/^https?:/.test(it.image_path)) url = it.image_path;
    else {
      try {
        const r = await fetch(`${MOMS.url}/storage/v1/object/sign/uploads/${it.image_path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
        const j = r.ok ? await r.json() : null; if (j?.signedURL) url = MOMS.url + "/storage/v1" + j.signedURL;
      } catch { /* no preview for this person */ }
    }
    if (url) { const im = new Image(); im.src = url; }   // start loading it now
    urls.set(u, url);
    return url;
  }
  const pv = document.createElement("img");
  pv.className = "preview" + (touch ? " u-touch" : ""); pv.alt = ""; pv.style.left = "50%";
  document.body.appendChild(pv);
  let current = null;
  async function showFor(row) {
    current = row;
    const u = decodeURIComponent((row.getAttribute("href") || "").replace(/^\/u\//, ""));
    const url = await urlFor(u);
    if (current !== row) return;
    if (!url) { pv.classList.remove("show"); return; }
    pv.onload = () => { if (current === row) pv.classList.add("show"); };
    pv.onerror = () => pv.classList.remove("show");
    if (pv.src !== new URL(url, location.href).href) { pv.classList.remove("show"); pv.src = url; } else pv.classList.add("show");
  }
  if (touch) {
    let href = "";
    box.addEventListener("click", (e) => {
      const row = e.target.closest("a.row:not(.head)"); if (!row) return;
      if (row === current) return;   // second tap on the same person: follow the link
      e.preventDefault();
      box.querySelectorAll(".row.on").forEach((x) => x.classList.remove("on"));
      row.classList.add("on"); href = row.getAttribute("href"); showFor(row);
    });
    pv.addEventListener("click", () => { if (href) location.href = href; });
    return;
  }
  box.addEventListener("mouseover", async (e) => {
    const row = e.target.closest("a.row"); if (!row || row === current || row.classList.contains("head")) return;
    current = row;
    const u = decodeURIComponent((row.getAttribute("href") || "").replace(/^\/u\//, ""));
    const url = await urlFor(u);
    if (current !== row) return;   // moved on while it was loading
    if (!url) { pv.classList.remove("show"); return; }
    pv.onload = () => { if (current === row) pv.classList.add("show"); };
    pv.onerror = () => pv.classList.remove("show");
    if (pv.src !== new URL(url, location.href).href) { pv.classList.remove("show"); pv.src = url; } else pv.classList.add("show");
  });
  box.addEventListener("mouseleave", () => { current = null; pv.classList.remove("show"); });
  box.addEventListener("mouseout", (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest("a.row:not(.head)")) { current = null; pv.classList.remove("show"); } });
})();
