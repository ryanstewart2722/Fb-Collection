(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const box = document.getElementById("brands");
  const TYPES = ["decks", "trucks", "wheels", "obstacles", "misc"];
  const all = async (path) => {   // read every row, 1000 at a time
    const out = [];
    for (let off = 0; ; off += 1000) {
      const { rows } = await momsFetch(`${path}&limit=1000&offset=${off}`);
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  };
  let brands, per;
  try {
    [brands, ...per] = await Promise.all([
      all("brands?select=*&order=name.asc"),
      ...TYPES.map((t) => all(`${t}?select=id,brand_id,image_path,release_date&order=id.asc`)),
    ]);
  } catch { box.innerHTML = `<p class="p-empty">Couldn't load the list. Please refresh.</p>`; return; }

  // For each brand: how many products, and its picture. A photo set on the brand (admin > Brands) wins;
  // until one is set, the picture is its most recent product that has a photo.
  const info = new Map();
  per.forEach((rows) => rows.forEach((r) => {
    if (!r.brand_id) return;
    const b = info.get(r.brand_id) || { count: 0, pic: null, date: "", id: 0 };
    b.count++;
    if (r.image_path) {
      const d = r.release_date || "";
      if (!b.pic || d > b.date || (d === b.date && r.id > b.id)) { b.pic = r.image_path; b.date = d; b.id = r.id; }
    }
    info.set(r.brand_id, b);
  }));
  const list = brands.map((b) => ({ ...b, count: info.get(b.id)?.count || 0, pic: b.image_path || info.get(b.id)?.pic || "" }))
    .filter((b) => b.count > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  const cnt = document.getElementById("u-count"); if (cnt) cnt.textContent = `${list.length} ${list.length === 1 ? "brand" : "brands"}`;
  box.innerHTML = `<div class="row head"><span>Brand</span><span>Products</span><span>Made in</span><span>Website</span></div>` + list.map((b) =>
    `<a class="row" href="/?brand=${b.id}" data-pic="${esc(b.pic)}"><span>${esc(b.name)}</span><span>${b.count}</span><span>${esc(b.made_in || "Not Listed")}</span><span>${esc((b.website || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "Not Listed")}</span></a>`).join("");
  list.forEach((b) => { if (b.pic) { const im = new Image(); im.src = b.pic; } });   // start loading pictures now so hovering never waits

  // Hover a brand to see its picture big, like the Users page and the museum list.
  const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
  const pv = document.createElement("img");
  pv.className = "preview" + (touch ? " u-touch" : ""); pv.alt = ""; pv.style.left = "50%";
  document.body.appendChild(pv);
  let current = null, href = "";
  const showFor = (row) => {
    current = row;
    box.querySelectorAll(".row.on").forEach((x) => x.classList.remove("on")); row.classList.add("on");
    const url = row.dataset.pic;
    if (!url) { pv.classList.remove("show"); return; }
    pv.onerror = () => pv.classList.remove("show");
    if (pv.src !== new URL(url, location.href).href) pv.src = url;
    pv.classList.add("show");
  };
  const off = () => { current = null; pv.classList.remove("show"); box.querySelectorAll(".row.on").forEach((x) => x.classList.remove("on")); };
  if (touch) {   // phones: tap a brand to see its picture, tap it (or the same row) again to open its products
    box.addEventListener("click", (e) => {
      const row = e.target.closest("a.row:not(.head)"); if (!row || row === current) return;
      e.preventDefault(); href = row.getAttribute("href"); showFor(row);
    });
    pv.addEventListener("click", () => { if (href) location.href = href; });
    return;
  }
  const onRow = (e) => { const row = e.target.closest("a.row:not(.head)"); if (row && row !== current) showFor(row); };
  box.addEventListener("mouseover", onRow);
  box.addEventListener("mouseenter", onRow, true);
  let px = -1, py = -1, ticking = false;
  document.addEventListener("mousemove", (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  window.addEventListener("scroll", () => {
    if (ticking || px < 0) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const el = document.elementFromPoint(px, py)?.closest("a.row:not(.head)");
      if (el === current) return;
      if (el && box.contains(el)) showFor(el); else if (current) off();
    });
  }, { passive: true });
  box.addEventListener("mouseleave", off);
  box.addEventListener("mouseout", (e) => { if (!e.relatedTarget?.closest?.("a.row:not(.head)")) off(); });
})();
