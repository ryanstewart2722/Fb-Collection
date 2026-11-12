// Museum editor: sign in with Supabase, then add/edit decks, trucks, wheels, obstacles and brands.
// The database security rules decide who can save; this page only shows the tools.
const sb = supabase.createClient(MOMS.url, MOMS.key);
const BUCKET = "photos";
const PAGE = 50;

const $ = (s) => document.querySelector(s);
// Brand names that are really the same brand: ignore capitals, punctuation, spacing, a leading "the", and endings like Co, Co., Company, Inc, LLC, Ltd.
const brandKey = (n) => String(n || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and")
  .replace(/[^a-z0-9 ]+/g, "").replace(/^the /, "").replace(/( (co|company|inc|incorporated|llc|ltd|limited|corp|corporation))+$/, "").replace(/ +/g, "");
const sameBrand = (list, name) => { const k = brandKey(name); return k ? list.find((b) => brandKey(b.name) === k) : undefined; };
const app = $("#me-app");
const fileInput = $("#file");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// What each tab edits. Field kinds: text, textarea, brand, molds, release.
const TYPES = {
  decks:  { one: "deck",  fields: [["brand_id", "Brand", "brand"], ["extra_brand_ids", "Second brand", "morebrands", "For collabs: shows as “first brand x second brand”."], ["name", "Deck name"], ["color", "Color", "text", "Primary color first, then secondary, joined with / (e.g. White/Black). Use Multicolor for lots of colors or a graphic. Capitals are added for you."], ["size", "Size", "text", "e.g. 32mm"],
            ["molds", "Molds", "molds", "Separate with commas, e.g. Freshwater, Freshwater Deep, Saltwater, NotCool FB, KS1"],
            ["shape", "Shape", "text", "e.g. Egg, Cruiser, Old School. Adds a Shape filter to the site once any board has one."],
            ["drop_no", "Drop", "text", "Dr. M's drop number, e.g. 57. Shows in front of the name, with the drop title: “Drop 127, Title - 1740”."],
            ["drop_title", "Drop title", "text", "The drop's name, e.g. Dr.M x NotCool FB “Medicinal Practice”. Shows after the drop number: “Drop 127, Dr.M x NotCool FB “Medicinal Practice” - 1740”."],
            ["mold_code", "Mold letter", "text", "Fills in by itself from the mold (f, d, s, nc, os…) and shows after the name, e.g. “3078 (f)”. Clear it to reset."],
            ["graphic", "Graphic", "text", "e.g. Screenprint Graphic"], ["made_in", "Made in", "text", "e.g. Chicago, IL"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  trucks: { one: "truck", fields: [["brand_id", "Brand", "brand"], ["extra_brand_ids", "Second brand", "morebrands", "For collabs: shows as “first brand x second brand”."], ["name", "Truck name"], ["color", "Color", "text", "Primary color first, then secondary, joined with / (e.g. White/Black). Use Multicolor for lots of colors or a graphic. Capitals are added for you."], ["size", "Size", "text", "e.g. 32mm"],
            ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${v.size || ""} ${b}` },
  wheels: { one: "wheel", fields: [["brand_id", "Brand", "brand"], ["extra_brand_ids", "Second brand", "morebrands", "For collabs: shows as “first brand x second brand”."], ["name", "Wheel name"], ["color", "Color", "text", "Primary color first, then secondary, joined with / (e.g. White/Black). Use Multicolor for lots of colors or a graphic. Capitals are added for you."], ["material", "Material", "text", "e.g. Urethane"],
            ["duro", "Duro", "text", "e.g. 70d"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  obstacles: { one: "obstacle", fields: [["brand_id", "Brand", "brand"], ["extra_brand_ids", "Second brand", "morebrands", "For collabs: shows as “first brand x second brand”."], ["name", "Obstacle name"], ["color", "Color", "text", "Primary color first, then secondary, joined with / (e.g. White/Black). Capitals are added for you."], ["material", "Material", "text", "e.g. Wood, Resin"], ["size", "Size", "text", "e.g. 4in"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  brands: { one: "brand", fields: [["name", "Brand name"], ["made_in", "Made in", "text", "e.g. Chicago, IL"], ["website", "Website"], ["notes", "Notes", "textarea"]],
            slug: (v) => v.name },
};

let brands = [];
let tab = "decks";
let list = { rows: [], total: 0, search: "", brand: "", photo: "" };
let editing = null;   // row being edited ({} for a new one), or null when showing the list
let photo2 = null, target = 1, drop2 = false;   // second photo (shown below the first on the board page)
let photo = null;     // new photo waiting to upload: { blob, ext, preview }
let formDirty = false;
let view = (() => { try { return localStorage.getItem("me-view") === "images" ? "images" : "list"; } catch { return "list"; } })();

function setStatus(text, isError = false) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("ad-error", isError);
}
const fail = (prefix) => (err) => setStatus(`${prefix}: ${err.message || err}`, true);

/* ---------- Data ---------- */
async function loadBrands() {
  const { data, error } = await sb.from("brands").select("id,name,slug,made_in,website,notes").order("name");
  if (error) throw error;
  brands = data;
}

async function loadList(reset = true) {
  if (reset) list.rows = [];
  let q = tab === "brands"
    ? sb.from("brands").select("*", { count: "exact" }).order("name")
    : sb.from(tab).select("*,brands(name)", { count: "exact" }).order("release_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  if (list.search) q = q.ilike("name", `%${list.search}%`);
  if (list.brand && tab !== "brands") q = q.eq("brand_id", list.brand);
  if (list.photo === "without" && tab !== "brands") q = q.is("image_path", null);
  if (list.photo === "with" && tab !== "brands") q = q.not("image_path", "is", null);
  const size = view === "images" && tab !== "brands" ? 120 : PAGE;
  const { data, error, count } = await q.range(list.rows.length, list.rows.length + size - 1);
  if (error) throw error;
  list.rows.push(...data);
  list.total = count;
}

/* ---------- List screen ---------- */
function renderList() {
  const t = TYPES[tab];
  const year = (r) => (r.release_date ? r.release_date.slice(0, 4) : "");
  app.innerHTML = `
    <div class="me-toolbar">
      <input id="search" type="search" placeholder="Search ${tab}…" value="${esc(list.search)}">
      ${tab === "brands" ? "" : `<select id="photo-filter" aria-label="Filter by photo"><option value="">All boards</option><option value="without" ${list.photo === "without" ? "selected" : ""}>No photo yet</option><option value="with" ${list.photo === "with" ? "selected" : ""}>Has a photo</option></select>`}
      ${tab === "brands" ? "" : `<select id="brand-filter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map((b) => `<option value="${b.id}" ${String(b.id) === String(list.brand) ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`}
      <button class="ad-btn ad-btn-dark" data-act="new">+ Add ${t.one}</button>
    </div>
    <p class="me-count">${list.total} ${list.total === 1 ? t.one : tab}${tab === "brands" ? "" : `<span class="me-views"><button class="ad-link${view === "list" ? " on" : ""}" data-act="view-list">List</button> / <button class="ad-link${view === "images" ? " on" : ""}" data-act="view-images">Images</button></span>`}</p>
    ${view === "images" && tab !== "brands" ? `<div class="me-grid">
      ${list.rows.map((r, i) => `<div class="me-card" data-i="${i}">
        <button class="me-card-img${r.image_path ? "" : " none"}" data-act="open" title="Open ${esc(r.name)}">${r.image_path ? `<img src="${esc(r.image_path)}" alt="${esc(r.name)}" loading="lazy">` : `<span>No photo yet</span>`}</button>
        <span class="me-card-name">${esc(momsDeckName(r))}</span>
        ${r.image_path ? `<button class="ad-btn me-card-rot" data-act="rotate-card">Rotate 180°</button>` : `<button class="ad-btn me-card-rot" data-act="open">Add photo</button>`}
      </div>`).join("") || `<p class="me-empty">Nothing here.</p>`}
    </div>` : `<div class="me-list">
      ${list.rows.map((r, i) => `<button class="me-item" data-i="${i}">
        ${tab === "brands" ? "" : `<span class="me-thumb">${r.image_path ? `<img src="${esc(r.image_path)}" alt="" loading="lazy">` : ""}</span>`}
        <span class="me-name">${esc(momsDeckName(r))}${r.color ? ` <em>${esc(r.color)}</em>` : ""}</span>
        <span class="me-meta">${esc(tab === "brands" ? r.made_in : [r.brands?.name, year(r), !r.image_path && "no photo: not on the site yet"].filter(Boolean).join(" · "))}</span>
      </button>`).join("") || `<p class="me-empty">Nothing here yet.</p>`}
    </div>`}
    ${list.rows.length < list.total ? `<button class="ad-btn" data-act="more">Show more</button> <button class="ad-btn" data-act="all">View all (${list.total - list.rows.length} more)</button>` : ""}`;

  $("#photo-filter")?.addEventListener("change", (e) => {
    list.photo = e.target.value;
    loadList().then(renderList).catch(fail("Couldn't load"));
  });
  $("#brand-filter")?.addEventListener("change", (e) => {
    list.brand = e.target.value;
    loadList().then(renderList).catch(fail("Couldn't load"));
  });
  let timer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { list.search = e.target.value.trim(); loadList().then(renderList).catch(fail("Search failed")); }, 250);
  });
}

/* ---------- Form screen ---------- */
function releaseParts(r) {
  if (!r.release_date) return { y: "", m: "", d: "" };
  const [y, m, d] = r.release_date.split("-");
  const p = r.release_precision;
  return { y, m: p === "year" ? "" : String(+m), d: p === "day" ? String(+d) : "" };
}

function extraRow(selected) {   // one more brand on the same board: a drop-down like the first brand
  return `<div class="me-extra"><select data-x>
      <option value="">Choose a brand…</option>
      ${brands.map((b) => `<option value="${b.id}" ${b.id === selected ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
      <option value="new">+ New brand…</option>
    </select><input data-xn placeholder="New brand name" hidden><button type="button" class="ad-btn" data-act="rm-extra" title="Remove this brand">×</button></div>`;
}

function fieldHtml([key, label, kind = "text", hint = ""], r) {
  const val = r[key] ?? "";
  let input;
  if (kind === "textarea") input = `<textarea data-f="${key}" rows="4">${esc(val)}</textarea>`;
  else if (kind === "morebrands") return `<div class="ad-field"><span>${label}</span><div class="me-extras">${(r.extra_brand_ids || []).map((id) => extraRow(id)).join("")}</div><button type="button" class="ad-btn" data-act="add-extra">+ Add another brand</button>${hint ? `<small>${hint}</small>` : ""}</div>`;
  else if (kind === "molds") input = `<input data-f="molds" value="${esc((r.molds || []).join(", "))}">`;
  else if (kind === "brand") input = `<select data-f="brand_id">
      <option value="">Choose a brand…</option>
      ${brands.map((b) => `<option value="${b.id}" ${b.id === r.brand_id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
      <option value="new">+ New brand…</option>
    </select>
    <input data-f="new_brand" placeholder="New brand name" hidden>`;
  else if (kind === "release") {
    const { y, m, d } = releaseParts(r);
    input = `<div class="me-release">
      <input data-f="rel_y" inputmode="numeric" placeholder="Year" value="${y}" maxlength="4">
      <select data-f="rel_m"><option value="">Month</option>${MONTH_NAMES.map((n, i) => `<option value="${i + 1}" ${String(i + 1) === m ? "selected" : ""}>${n}</option>`).join("")}</select>
      <input data-f="rel_d" inputmode="numeric" placeholder="Day" value="${d}" maxlength="2">
    </div>`;
    hint = "Leave month or day empty if you don't know them.";
  } else input = `<input data-f="${key}" value="${esc(val)}">`;
  return `<label class="ad-field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
}

function renderForm() {
  const t = TYPES[tab];
  const r = editing;
  const isNew = !r.id;
  const img = photo?.preview || r.image_path;
  app.innerHTML = `
    <button class="ad-link me-back" data-act="back">← All ${tab}</button>
    <h2 class="me-title">${isNew ? `New ${t.one}` : esc(r.name)}</h2>
    <div class="me-form">
      ${tab === "brands" ? "" : `<div class="me-photo">
        <div class="me-photo-box">${img ? `<img src="${esc(img)}" alt="">` : `<span>No photo yet</span>`}</div>
        <button class="ad-btn" data-act="photo">${img ? "Replace photo" : "Add photo"}</button>
        ${img ? `<button class="ad-btn" data-act="rotate" title="Turn the photo upside down">Rotate 180°</button>` : ""}
        <div class="me-photo2">
          ${(photo2?.preview || (!drop2 && r.image_path_2)) ? `<div class="me-photo-box"><img src="${esc(photo2?.preview || r.image_path_2)}" alt=""></div>` : ""}
          <button class="ad-btn" data-act="photo2">${(photo2?.preview || (!drop2 && r.image_path_2)) ? "Replace second photo" : "+ Add a second photo"}</button>
          ${(photo2 || (!drop2 && r.image_path_2)) ? `<button class="ad-btn" data-act="rm-photo2">Remove second photo</button>` : ""}
        </div>
        <small>Transparent PNGs are kept exactly as they are, just sized to match. Photos on a plain backdrop (white, grey, any single colour) have the backdrop removed.</small>
      </div>`}
      <div class="me-fields">${t.fields.map((f) => fieldHtml(f, r)).join("")}</div>
    </div>
    <div class="me-actions">
      <button class="ad-btn ad-btn-dark" data-act="save">${isNew ? `Add ${t.one}` : "Save changes"}</button>
      ${!isNew && tab !== "brands" ? `<a class="ad-btn" href="board.html?type=${tab}&slug=${encodeURIComponent(r.slug)}" target="_blank" rel="noopener">View on site ↗</a>` : ""}
      ${!isNew ? `<button class="ad-btn me-danger" data-act="delete">Delete</button>` : ""}
    </div>
    ${!isNew && tab === "brands" ? `<div class="me-merge">
      <p>Same brand under two names? Move everything from “${esc(r.name)}” into another brand, then remove “${esc(r.name)}”.</p>
      <select id="merge-to"><option value="">Merge into…</option>${brands.filter((b) => b.id !== r.id).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>
      <button class="ad-btn" data-act="merge">Merge</button>
    </div>` : ""}`;
  formDirty = false;
  window.scrollTo(0, 0);
}

function readForm() {
  const v = {};
  app.querySelectorAll("[data-f]").forEach((el) => (v[el.dataset.f] = el.value.trim()));
  return v;
}

async function save() {
  const t = TYPES[tab];
  const v = readForm();
  if (!v.name) return setStatus("Please fill in the name.", true);
  const row = {};
  t.fields.forEach(([key, , kind]) => {
    if (kind === "brand" || kind === "release" || kind === "morebrands") return;
    row[key] = kind === "molds" ? v.molds.split(",").map((s) => s.trim()).filter(Boolean) : (v[key] || null);
  });
  row.name = v.name;
  if ("mold_code" in row) row.mold_code = (v.mold_code || "").toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8) || null;

  if (tab !== "brands") {
    // Brand: existing, or a new one (created when saving, below).
    if (v.brand_id === "new" && !v.new_brand) return setStatus("Type the new brand's name.", true);
    if (!v.brand_id) return setStatus("Please choose a brand.", true);
    if (v.brand_id !== "new") row.brand_id = Number(v.brand_id);

    // Release date: year, optional month and day.
    const y = parseInt(v.rel_y, 10), m = parseInt(v.rel_m, 10), d = parseInt(v.rel_d, 10);
    if (v.rel_y && !(y > 1900 && y < 2200)) return setStatus("Release year doesn't look right.", true);
    if (v.rel_d && !(d >= 1 && d <= 31)) return setStatus("Release day should be 1–31.", true);
    if (v.rel_d && !m) return setStatus("Pick a month to go with the day.", true);
    const pad = (n) => String(n).padStart(2, "0");
    row.release_date = y ? `${y}-${pad(m || 1)}-${pad(d && m ? d : 1)}` : null;
    row.release_precision = d && m ? "day" : m ? "month" : "year";
  }

  const btn = app.querySelector('[data-act="save"]');
  btn.disabled = true;
  setStatus("Saving…");
  try {
    if (v.brand_id === "new") {
      const existing = sameBrand(brands, v.new_brand);
      row.brand_id = existing ? existing.id : (await insertWithSlug("brands", { name: v.new_brand }, v.new_brand)).id;
      await loadBrands();
    }
    if (tab !== "brands") {   // other brands on the same board
      const ids = [];
      for (const el of app.querySelectorAll(".me-extra")) {
        const sel = el.querySelector("[data-x]").value, nn = el.querySelector("[data-xn]").value.trim();
        let id = null;
        if (sel === "new") {
          if (!nn) continue;
          const hit = sameBrand(brands, nn);
          id = hit ? hit.id : (await insertWithSlug("brands", { name: nn }, nn)).id;
          if (!hit) await loadBrands();
        } else if (sel) id = parseInt(sel, 10);
        if (id && id !== row.brand_id && !ids.includes(id)) ids.push(id);
      }
      row.extra_brand_ids = ids;
    }
    const brandName = brands.find((b) => b.id === row.brand_id)?.name || "";
    const slugBase = t.slug(row, brandName);
    let saved;
    if (editing.id) {
      // A refused update comes back as zero rows rather than an error.
      const { data, error } = await sb.from(tab).update(row).eq("id", editing.id).select();
      if (error) throw error;
      if (!data.length) throw { code: "42501", message: "not allowed" };
      saved = data[0];
    } else {
      saved = await insertWithSlug(tab, row, slugBase);
    }

    if (photo) {
      setStatus("Uploading photo…");
      const path = `${tab}/${saved.slug}-${Date.now().toString(36)}.${photo.ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, photo.blob, { contentType: photo.blob.type, cacheControl: "31536000" });
      if (upErr) throw upErr;
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await sb.from(tab).update({ image_path: url }).eq("id", saved.id);
      if (error) throw error;
      await removeOurPhoto(editing.image_path); // the old one, if it was uploaded here
      saved.image_path = url;
    }

    if (photo2) {
      setStatus("Uploading second photo…");
      const path = `${tab}/${saved.slug}-2-${Date.now().toString(36)}.${photo2.ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, photo2.blob, { contentType: photo2.blob.type, cacheControl: "31536000" });
      if (upErr) throw upErr;
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await sb.from(tab).update({ image_path_2: url }).eq("id", saved.id);
      if (error) throw error;
      await removeOurPhoto(editing.image_path_2);
      saved.image_path_2 = url;
    } else if (drop2 && editing.image_path_2) {
      const { error } = await sb.from(tab).update({ image_path_2: null }).eq("id", saved.id);
      if (error) throw error;
      await removeOurPhoto(editing.image_path_2);
      saved.image_path_2 = null;
    }
    drop2 = false; photo2 = null;
    if (tab === "brands") await loadBrands();
    photo = null;
    editing = saved;
    renderForm();
    setStatus(`Saved ✓ It's live on the museum now.`);
  } catch (err) {
    setStatus("Couldn't save: " + friendly(err), true);
    btn.disabled = false;
  }
}

// Insert with a unique web address (slug), adding a short suffix if it's taken.
async function insertWithSlug(table, row, base) {
  let slug = slugify(base);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await sb.from(table).insert({ ...row, slug }).select().single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Couldn't make a unique address for this item.");
}

async function removeOurPhoto(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (!url || !url.includes(marker)) return;
  await sb.storage.from(BUCKET).remove([url.split(marker)[1]]);
}

// Move every board from the open brand to another brand (as main brand and as an extra brand), then remove the open one.
async function mergeBrand() {
  const to = parseInt($("#merge-to").value, 10), from = editing.id, target = brands.find((b) => b.id === to);
  if (!to || !target) return setStatus("Choose which brand to merge into.", true);
  if (!confirm(`Move everything from “${editing.name}” into “${target.name}” and remove “${editing.name}”? This can't be undone.`)) return;
  setStatus("Merging…");
  try {
    for (const t of ["decks", "trucks", "wheels", "obstacles"]) {
      let r = await sb.from(t).update({ brand_id: to }).eq("brand_id", from).select("id");
      if (r.error) throw r.error;
      r = await sb.from(t).select("id,brand_id,extra_brand_ids").contains("extra_brand_ids", [from]);
      if (r.error) throw r.error;
      for (const row of r.data) {
        const ids = [...new Set(row.extra_brand_ids.map((i) => (i === from ? to : i)))].filter((i) => i !== row.brand_id);
        const u = await sb.from(t).update({ extra_brand_ids: ids }).eq("id", row.id);
        if (u.error) throw u.error;
      }
    }
    const d = await sb.from("brands").delete().eq("id", from).select("id");
    if (d.error || !d.data.length) throw d.error || { code: "42501", message: "not allowed" };
    await loadBrands();
    editing = null; photo = null; photo2 = null; drop2 = false;
    await loadList(); renderList();
    setStatus(`Merged into ${target.name}.`);
  } catch (err) { setStatus("Couldn't merge: " + friendly(err), true); }
}

async function del() {
  const t = TYPES[tab];
  if (!confirm(`Delete “${editing.name}”? This can't be undone.`)) return;
  setStatus("Deleting…");
  const { data, error } = await sb.from(tab).delete().eq("id", editing.id).select("id");
  if (error || !data.length) return setStatus("Couldn't delete: " + friendly(error || { code: "42501", message: "not allowed" }), true);
  await removeOurPhoto(editing.image_path).catch(() => {});
  if (tab === "brands") await loadBrands();
  setStatus(`Deleted the ${t.one}.`);
  editing = null;
  await loadList();
  renderList();
}

function friendly(err) {
  if (err.code === "23503") return "this brand still has boards. Move or delete them first.";
  if (err.code === "42501" || /row-level security|permission/i.test(err.message)) return "your account doesn't have permission to do that.";
  return err.message || String(err);
}

/* ---------- Photos ---------- */
// Every photo ends up the same size: decks match the collection deck photos (529×1200),
// trucks and wheels are square. The photo is scaled evenly (never stretched) and centred in the frame.
// Transparent PNGs are kept as they are; a solid backdrop (white sheet, grey card) is removed.
const PHOTO_SIZE = { decks: [529, 1200], trucks: [800, 800], wheels: [800, 800], obstacles: [800, 800] };

async function preparePhoto(file) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 6).arrayBuffer());
  if (file.type === "image/gif" || /\.gif$/i.test(file.name) || head.startsWith("GIF8")) return { blob: file.type === "image/gif" ? file : new Blob([file], { type: "image/gif" }), ext: "gif", preview: URL.createObjectURL(file) };   // GIFs are kept as they are so they keep playing
  const bitmap = await createImageBitmap(file);
  // Work at a moderate size so cleanup is quick even for big phone photos.
  const s0 = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * s0), h = Math.round(bitmap.height * s0);
  const work = document.createElement("canvas");
  work.width = w; work.height = h;
  const wctx = work.getContext("2d");
  wctx.drawImage(bitmap, 0, 0, w, h);
  const img = wctx.getImageData(0, 0, w, h);
  // Photos that already have a transparent background are left exactly as they are (only trimmed);
  // the backdrop is removed only from photos shot on a solid background.
  let box;
  if (hasTransparentEdges(img.data, w, h)) box = visibleBox(img.data, w, h);
  else { box = removeBackground(img.data, w, h); wctx.putImageData(img, 0, 0); }

  // Fit the trimmed board into the standard frame, centred, on a transparent background.
  const [W, H] = PHOTO_SIZE[tab] || PHOTO_SIZE.decks;
  // Trucks and wheels keep breathing room (the longest side fills 68% of the square) so they sit at the size
  // in the design instead of being zoomed to the edges; decks fill their tall frame.
  const fill = tab === "decks" ? 1 : 0.68;
  const scale = Math.min(W / box.w, H / box.h) * fill;
  const dw = Math.round(box.w * scale), dh = Math.round(box.h * scale);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const octx = out.getContext("2d");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(work, box.x, box.y, box.w, box.h, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);

  let blob = await new Promise((r) => out.toBlob(r, "image/webp", 0.88));
  if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => out.toBlob(r, "image/png"));
  return { blob, ext: blob.type === "image/webp" ? "webp" : "png", preview: URL.createObjectURL(blob) };
}

// True when any of the photo's edge pixels are see-through, i.e. the background is already removed.
function hasTransparentEdges(px, w, h) {
  const a = (x, y) => px[(y * w + x) * 4 + 3];
  for (let x = 0; x < w; x += 2) if (a(x, 0) < 250 || a(x, h - 1) < 250) return true;
  for (let y = 0; y < h; y += 2) if (a(0, y) < 250 || a(w - 1, y) < 250) return true;
  return false;
}

// Makes a plain background transparent (flood-filled in from the edges, so light colours inside
// the graphic are kept) and returns the box around what's left.
function removeBackground(px, w, h) {
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, i) => sum + px[i + c], 0) / 4);
  const isBg = (i) => px[i + 3] < 16 ||
    Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) <= 26;

  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k] || !isBg(k * 4)) continue;
    seen[k] = 1;
    px[k * 4 + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  // Soften the cut edge.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    if (!seen[k] && (seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w])) px[k * 4 + 3] = Math.min(px[k * 4 + 3], 140);
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[at(x, y) + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h }; // nothing left: keep the whole photo
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Box around the visible part of the photo.
function visibleBox(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Image view: turn one board's saved photo upside down and put it live right away.
async function rotateCard(card) {
  const row = list.rows[card.dataset.i];
  const btn = card.querySelector(".me-card-rot"), img = card.querySelector("img");
  btn.disabled = true; btn.textContent = "Rotating…";
  try {
    const bitmap = await createImageBitmap(await (await fetch(row.image_path, { cache: "no-store" })).blob());
    const c = document.createElement("canvas");
    c.width = bitmap.width; c.height = bitmap.height;
    const x = c.getContext("2d");
    x.translate(c.width, c.height); x.rotate(Math.PI); x.drawImage(bitmap, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const path = `${tab}/${row.slug}-${Date.now().toString(36)}.png`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/png", cacheControl: "31536000" });
    if (upErr) throw upErr;
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { data, error } = await sb.from(tab).update({ image_path: url }).eq("id", row.id).select("id");
    if (error || !data.length) throw error || { code: "42501", message: "not allowed" };
    const old = row.image_path;
    row.image_path = url; img.src = url;
    removeOurPhoto(old).catch(() => {});
    setStatus(`Rotated “${row.name}” ✓ Live on the site.`);
  } catch (err) {
    setStatus("Couldn't rotate: " + friendly(err), true);
  }
  btn.disabled = false; btn.textContent = "Rotate 180°";
}

// Turn the current photo (the one being added, or the saved one) upside down. Nothing goes live until Save.
async function rotatePhoto() {
  const src = photo?.preview || editing?.image_path;
  if (!src) return;
  setStatus("Rotating…");
  try {
    const bitmap = await createImageBitmap(await (await fetch(src, { cache: "no-store" })).blob());
    const c = document.createElement("canvas");
    c.width = bitmap.width; c.height = bitmap.height;
    const x = c.getContext("2d");
    x.translate(c.width, c.height); x.rotate(Math.PI);
    x.drawImage(bitmap, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    if (photo?.preview) URL.revokeObjectURL(photo.preview);
    photo = { blob, ext: "png", preview: URL.createObjectURL(blob) };
    app.querySelector(".me-photo-box").innerHTML = `<img src="${photo.preview}" alt="">`;
    formDirty = true;
    setStatus("Rotated. Save to put it on the site.");
  } catch (err) {
    setStatus("Couldn't rotate that photo: " + err.message, true);
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  setStatus("Preparing photo…");
  try {
    if (target === 2) {
      photo2 = await preparePhoto(file); drop2 = false; formDirty = true;
      renderForm2();
      return setStatus(`Second photo ready (${Math.round(photo2.blob.size / 1024)} KB). Save to upload it.`);
    }
    photo = await preparePhoto(file);
    const box = app.querySelector(".me-photo-box");
    box.innerHTML = `<img src="${photo.preview}" alt="">`;
    app.querySelector('[data-act="photo"]').textContent = "Replace photo";
    formDirty = true;
    setStatus(`Photo ready (${Math.round(photo.blob.size / 1024)} KB). Save to upload it.`);
  } catch (err) {
    setStatus("Couldn't read that image: " + err.message, true);
  }
});

/* ---------- Events ---------- */
function renderForm2() {   // redraw the form without losing what was typed
  const y = window.scrollY;
  const prev = {}; app.querySelectorAll("[data-f]").forEach((el) => (prev[el.dataset.f] = el.value));
  renderForm();
  app.querySelectorAll("[data-f]").forEach((el) => { if (el.dataset.f in prev) el.value = prev[el.dataset.f]; });
  formDirty = true; window.scrollTo(0, y);
}

function leaveForm() {
  return !editing || !(formDirty || photo || photo2) || confirm("Leave without saving your changes?");
}

app.addEventListener("input", (e) => {
  if (e.target.closest(".me-form")) formDirty = true;
});
app.addEventListener("change", (e) => {
  if (e.target.matches("[data-x]")) {
    const nn = e.target.parentElement.querySelector("[data-xn]");
    nn.hidden = e.target.value !== "new";
    if (!nn.hidden) nn.focus();
  }
  if (e.target.dataset.f === "brand_id") {
    const nb = app.querySelector('[data-f="new_brand"]');
    nb.hidden = e.target.value !== "new";
    if (!nb.hidden) nb.focus();
  }
});

app.addEventListener("click", async (e) => {
  const card = e.target.closest(".me-card");
  if (card) {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "rotate-card") return rotateCard(card);
    if (a === "open") { editing = { ...list.rows[card.dataset.i] }; photo = null; photo2 = null; drop2 = false; return renderForm(); }
  }
  const item = e.target.closest(".me-item");
  if (item) {
    editing = { ...list.rows[item.dataset.i] }; photo = null; photo2 = null; drop2 = false;
    photo = null;
    return renderForm();
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "view-list" || act === "view-images") {
    view = act === "view-images" ? "images" : "list";
    try { localStorage.setItem("me-view", view); } catch {}
    await loadList().catch(fail("Couldn't load")); return renderList();
  }
  if (act === "new") { editing = {}; photo = null; photo2 = null; drop2 = false; renderForm(); }
  if (act === "back" && leaveForm()) { editing = null; photo = null; photo2 = null; drop2 = false; setStatus(""); await loadList().catch(fail("Couldn't load")); renderList(); }
  if (act === "all") {
    setStatus("Loading everything…");
    try { let before = -1; while (list.rows.length < list.total && list.rows.length !== before) { before = list.rows.length; await loadList(false); } setStatus(""); }
    catch (err) { fail("Couldn't load")(err); }
    renderList();
  }
  if (act === "more") { await loadList(false).catch(fail("Couldn't load")); renderList(); }
  if (act === "photo") { target = 1; fileInput.value = ""; fileInput.click(); }
  if (act === "add-extra") { app.querySelector(".me-extras").insertAdjacentHTML("beforeend", extraRow(null)); formDirty = true; }
  if (act === "rm-extra") { e.target.closest(".me-extra").remove(); formDirty = true; }
  if (act === "photo2") { target = 2; fileInput.value = ""; fileInput.click(); }
  if (act === "rm-photo2") { photo2 = null; drop2 = true; renderForm2(); }
  if (act === "rotate") rotatePhoto();
  if (act === "save") save();
  if (act === "delete") del();
  if (act === "merge") mergeBrand();
});

document.querySelectorAll(".ad-tabs button").forEach((b) => b.addEventListener("click", async () => {
  if (!leaveForm()) return;
  tab = b.dataset.tab;
  editing = null; photo = null; list.search = ""; list.brand = ""; list.photo = "";
  document.querySelectorAll(".ad-tabs button").forEach((x) => x.classList.toggle("active", x === b));
  setStatus("");
  if (tab === "review") return renderReview().catch(fail("Couldn't load the review list"));
  await loadList().catch(fail("Couldn't load"));
  renderList();
}));

/* ---------- Review: what people uploaded, waiting for you ---------- */
// Photos people upload sit in a private folder. Nothing is public until you approve it here.
let reviewItems = [];
async function renderReview() {
  app.innerHTML = `<p class="me-count">Loading…</p>`;
  const [ci, sub] = await Promise.all([
    sb.from("collection_items").select("*,profiles(username)").in("status", ["pending", "flagged"]).order("created_at"),
    sb.from("submissions").select("*,profiles(username)").in("status", ["pending", "flagged"]).order("created_at"),
  ]);
  if (ci.error) throw ci.error;
  if (sub.error) throw sub.error;
  reviewItems = [...ci.data.map((r) => ({ kind: "item", r })), ...sub.data.map((r) => ({ kind: "sub", r }))];
  const paths = reviewItems.map((x) => x.r.image_path).filter((p) => p && !/^https?:/.test(p));
  const urls = {};
  if (paths.length) (await sb.storage.from("uploads").createSignedUrls(paths, 3600)).data?.forEach((u) => (urls[u.path] = u.signedUrl));
  reviewItems.forEach((x) => (x.url = /^https?:/.test(x.r.image_path || "") ? x.r.image_path : urls[x.r.image_path] || ""));
  setReviewBadge(reviewItems.length);
  app.innerHTML = `<p class="me-count">${reviewItems.length} waiting for review</p><div class="me-review">` + (reviewItems.map((x, i) => {
    const r = x.r, who = r.profiles?.username || "someone";
    const f = x.kind === "item" ? { section: r.section, name: r.name, ...r.details } : { section: r.section, ...r.fields };
    return `<div class="me-rv" data-i="${i}">
      <div class="me-rv-img">${x.url ? `<img src="${esc(x.url)}" alt="">` : `<span>No photo</span>`}</div>
      <div class="me-rv-info">
        <b>${esc(f.name || "(no name)")}</b> <em>${x.kind === "item" ? "collection · " + esc(r.section) : "museum submission · " + esc(r.section)}</em>
        <span>by <a href="/u/${esc(who)}" target="_blank" rel="noopener">${esc(who)}</a></span>
        <span>${Object.entries(f).filter(([k, v]) => v && !["name", "section"].includes(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span>
        <div class="me-rv-act"><button class="ad-btn ad-btn-dark" data-act="rv-ok">${x.kind === "sub" ? "Add to museum" : "Approve"}</button> <button class="ad-btn me-danger" data-act="rv-no">Reject</button></div>
      </div></div>`;
  }).join("") || `<p class="me-empty">Nothing waiting.</p>`) + `</div>`;
}
function setReviewBadge(n) { const b = $("#review-n"); if (b) { b.textContent = n; b.hidden = !n; } }

async function publishPhoto(path) {
  if (!path || /^https?:/.test(path)) return path;
  const { data: blob, error } = await sb.storage.from("uploads").download(path);
  if (error) throw error;
  const up = await sb.storage.from("user-photos").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: true });
  if (up.error) throw up.error;
  return sb.storage.from("user-photos").getPublicUrl(path).data.publicUrl;
}
async function findOrMakeBrand(name) {
  name = name.trim();
  const have = (await sb.from("brands").select("id,name")).data || [];
  const hit = sameBrand(have, name);
  if (hit) return hit.id;
  return (await insertWithSlug("brands", { name }, name)).id;
}
async function reviewAct(card, ok) {
  const x = reviewItems[card.dataset.i], r = x.r;
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  let step = "starting";
  try {
    if (x.kind === "item") {
      if (ok) {
        const image_path = await publishPhoto(r.image_path);
        const { data, error } = await sb.from("collection_items").update({ status: "approved", image_path }).eq("id", r.id).select("id");
        if (error || !data.length) throw error || { message: "not allowed" };
      } else {
        const { data, error } = await sb.from("collection_items").update({ status: "removed" }).eq("id", r.id).select("id");
        if (error || !data.length) throw error || { message: "not allowed" };
        if (r.image_path && !/^https?:/.test(r.image_path)) await sb.storage.from("uploads").remove([r.image_path]).catch(() => {});
      }
    } else if (ok) {
      const f = r.fields, table = r.section;
      step = "finding or making the brand";
      const brand_id = await findOrMakeBrand(f.brand || "Unknown");
      step = "copying the photo";
      const row = { brand_id, name: f.name, color: f.color || null, image_path: await publishPhoto(r.image_path) };
      if (table === "decks") { row.size = f.size || null; row.molds = f.mold ? f.mold.split(",").map((m) => m.trim()).filter(Boolean) : []; row.shape = f.shape || null; row.attributes = { source: "Museum submission", submitted_by: r.profiles?.username || null }; }
      if (table === "trucks" || table === "obstacles") row.size = f.size || null;
      if (table === "obstacles") row.material = f.material || null;
      if (table === "wheels") { row.material = f.material || null; row.duro = f.duro || null; }
      step = `adding it to ${table}`;
      const made = await insertWithSlug(table, row, `${f.name} ${f.color || ""} ${f.brand || ""}`);
      step = "marking the submission approved";
      const { error } = await sb.from("submissions").update({ status: "approved", review_note: "Added as " + made.slug }).eq("id", r.id);
      if (error) throw error;
      // straight into the editor for the new board, so the rest can be filled in
      reviewItems[card.dataset.i] = null;
      setReviewBadge(reviewItems.filter(Boolean).length);
      tab = table; editing = made; photo = null; photo2 = null; drop2 = false;
      document.querySelectorAll(".ad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === table));
      renderForm();
      return setStatus("Added to the museum. Fill in the rest and press Save changes.");
    } else {
      const { error } = await sb.from("submissions").update({ status: "rejected" }).eq("id", r.id);
      if (error) throw error;
      if (r.image_path) await sb.storage.from("uploads").remove([r.image_path]).catch(() => {});
    }
    card.remove();
    reviewItems[card.dataset.i] = null;
    const left = reviewItems.filter(Boolean).length;
    setReviewBadge(left);
    $(".me-count").textContent = `${left} waiting for review`;
    setStatus(ok ? (x.kind === "sub" ? "Added to the museum. Find it in the editor to fill in more details." : "Approved. It's visible now.") : "Rejected.");
  } catch (err) {
    card.querySelectorAll("button").forEach((b) => (b.disabled = false));
    setStatus(`Couldn't do that (while ${step}): ` + friendly(err), true);
    console.error("review action failed", step, err);
  }
}
app.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]")?.dataset.act;
  if (a === "rv-ok" || a === "rv-no") reviewAct(e.target.closest(".me-rv"), a === "rv-ok");
});
// Show how many are waiting as soon as the editor opens.
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const [a, b] = await Promise.all([
    sb.from("collection_items").select("id", { count: "exact", head: true }).in("status", ["pending", "flagged"]),
    sb.from("submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "flagged"]),
  ]);
  setReviewBadge((a.count || 0) + (b.count || 0));
})();

window.addEventListener("beforeunload", (e) => { if (editing && (formDirty || photo)) e.preventDefault(); });

/* ---------- Sign in ---------- */
function show(id) {
  ["login", "denied", "editor"].forEach((x) => ($("#" + x).hidden = x !== id));
}

async function enter(session) {
  const { data: profile, error } = await sb.from("profiles").select("role,display_name,username").eq("id", session.user.id).single();
  if (error || !["admin", "editor"].includes(profile?.role)) return show("denied");
  $("#who").textContent = `Signed in as ${session.user.email} (${profile.role})`;
  show("editor");
  document.querySelector(`.ad-tabs [data-tab="${tab}"]`).classList.add("active");
  await loadBrands();
  await loadList();
  renderList();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error");
  err.hidden = true;
  const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
  if (error) { err.textContent = "Sign-in failed: " + error.message; err.hidden = false; return; }
  enter(data.session).catch(fail("Couldn't open the editor"));
});

document.querySelectorAll("[data-signout]").forEach((b) => b.addEventListener("click", async () => {
  if (!leaveForm()) return;
  await sb.auth.signOut();
  location.reload();
}));

sb.auth.getSession().then(({ data }) => {
  if (data.session) enter(data.session).catch(fail("Couldn't open the editor"));
  else show("login");
});
