// Museum editor: sign in with Supabase, then add/edit decks, trucks, wheels and brands.
// The database security rules decide who can save; this page only shows the tools.
const sb = supabase.createClient(MOMS.url, MOMS.key);
const BUCKET = "photos";
const PAGE = 50;

const $ = (s) => document.querySelector(s);
const app = $("#me-app");
const fileInput = $("#file");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// What each tab edits. Field kinds: text, textarea, brand, molds, release.
const TYPES = {
  decks:  { one: "deck",  fields: [["brand_id", "Brand", "brand"], ["name", "Deck name"], ["color", "Color"], ["size", "Size", "text", "e.g. 32mm"],
            ["molds", "Molds", "molds", "Separate with commas, e.g. KS1, KL2"], ["graphic", "Graphic", "text", "e.g. Screenprint Graphic"],
            ["made_in", "Made in", "text", "e.g. Chicago, IL"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  trucks: { one: "truck", fields: [["brand_id", "Brand", "brand"], ["name", "Truck name"], ["color", "Color"], ["size", "Size", "text", "e.g. 32mm"],
            ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${v.size || ""} ${b}` },
  wheels: { one: "wheel", fields: [["brand_id", "Brand", "brand"], ["name", "Wheel name"], ["color", "Color"], ["material", "Material", "text", "e.g. Urethane"],
            ["duro", "Duro", "text", "e.g. 70d"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  brands: { one: "brand", fields: [["name", "Brand name"], ["made_in", "Made in", "text", "e.g. Chicago, IL"], ["website", "Website"], ["notes", "Notes", "textarea"]],
            slug: (v) => v.name },
};

let brands = [];
let tab = "decks";
let list = { rows: [], total: 0, search: "" };
let editing = null;   // row being edited ({} for a new one), or null when showing the list
let photo = null;     // new photo waiting to upload: { blob, ext, preview }
let formDirty = false;

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
  const { data, error, count } = await q.range(list.rows.length, list.rows.length + PAGE - 1);
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
      <button class="ad-btn ad-btn-dark" data-act="new">+ Add ${t.one}</button>
    </div>
    <p class="me-count">${list.total} ${list.total === 1 ? t.one : tab}</p>
    <div class="me-list">
      ${list.rows.map((r, i) => `<button class="me-item" data-i="${i}">
        ${tab === "brands" ? "" : `<span class="me-thumb">${r.image_path ? `<img src="${esc(r.image_path)}" alt="" loading="lazy">` : ""}</span>`}
        <span class="me-name">${esc(r.name)}${r.color ? ` <em>${esc(r.color)}</em>` : ""}</span>
        <span class="me-meta">${esc(tab === "brands" ? r.made_in : [r.brands?.name, year(r)].filter(Boolean).join(" · "))}</span>
      </button>`).join("") || `<p class="me-empty">Nothing here yet.</p>`}
    </div>
    ${list.rows.length < list.total ? `<button class="ad-btn" data-act="more">Show more</button>` : ""}`;

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

function fieldHtml([key, label, kind = "text", hint = ""], r) {
  const val = r[key] ?? "";
  let input;
  if (kind === "textarea") input = `<textarea data-f="${key}" rows="4">${esc(val)}</textarea>`;
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
        <small>Shoot the board on a plain background (white, grey, any single colour). The background is removed and the board is sized to match every other photo.</small>
      </div>`}
      <div class="me-fields">${t.fields.map((f) => fieldHtml(f, r)).join("")}</div>
    </div>
    <div class="me-actions">
      <button class="ad-btn ad-btn-dark" data-act="save">${isNew ? `Add ${t.one}` : "Save changes"}</button>
      ${!isNew && tab !== "brands" ? `<a class="ad-btn" href="board.html?type=${tab}&slug=${encodeURIComponent(r.slug)}" target="_blank" rel="noopener">View on site ↗</a>` : ""}
      ${!isNew ? `<button class="ad-btn me-danger" data-act="delete">Delete</button>` : ""}
    </div>`;
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
    if (kind === "brand" || kind === "release") return;
    row[key] = kind === "molds" ? v.molds.split(",").map((s) => s.trim()).filter(Boolean) : (v[key] || null);
  });
  row.name = v.name;

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
      const existing = brands.find((b) => b.name.toLowerCase() === v.new_brand.toLowerCase());
      row.brand_id = existing ? existing.id : (await insertWithSlug("brands", { name: v.new_brand }, v.new_brand)).id;
      await loadBrands();
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
// trucks and wheels are square. A plain background is removed and the board is trimmed to fill the frame.
const PHOTO_SIZE = { decks: [529, 1200], trucks: [800, 800], wheels: [800, 800] };

async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file);
  // Work at a moderate size so cleanup is quick even for big phone photos.
  const s0 = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * s0), h = Math.round(bitmap.height * s0);
  const work = document.createElement("canvas");
  work.width = w; work.height = h;
  const wctx = work.getContext("2d");
  wctx.drawImage(bitmap, 0, 0, w, h);
  const img = wctx.getImageData(0, 0, w, h);
  const box = removeBackground(img.data, w, h);
  wctx.putImageData(img, 0, 0);

  // Fit the trimmed board into the standard frame, centred, on a transparent background.
  const [W, H] = PHOTO_SIZE[tab] || PHOTO_SIZE.decks;
  const scale = Math.min(W / box.w, H / box.h);
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

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  setStatus("Preparing photo…");
  try {
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
function leaveForm() {
  return !editing || !(formDirty || photo) || confirm("Leave without saving your changes?");
}

app.addEventListener("input", (e) => {
  if (e.target.closest(".me-form")) formDirty = true;
});
app.addEventListener("change", (e) => {
  if (e.target.dataset.f === "brand_id") {
    const nb = app.querySelector('[data-f="new_brand"]');
    nb.hidden = e.target.value !== "new";
    if (!nb.hidden) nb.focus();
  }
});

app.addEventListener("click", async (e) => {
  const item = e.target.closest(".me-item");
  if (item) {
    editing = { ...list.rows[item.dataset.i] };
    photo = null;
    return renderForm();
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "new") { editing = {}; photo = null; renderForm(); }
  if (act === "back" && leaveForm()) { editing = null; photo = null; setStatus(""); await loadList().catch(fail("Couldn't load")); renderList(); }
  if (act === "more") { await loadList(false).catch(fail("Couldn't load")); renderList(); }
  if (act === "photo") { fileInput.value = ""; fileInput.click(); }
  if (act === "save") save();
  if (act === "delete") del();
});

document.querySelectorAll(".ad-tabs button").forEach((b) => b.addEventListener("click", async () => {
  if (!leaveForm()) return;
  tab = b.dataset.tab;
  editing = null; photo = null; list.search = "";
  document.querySelectorAll(".ad-tabs button").forEach((x) => x.classList.toggle("active", x === b));
  setStatus("");
  await loadList().catch(fail("Couldn't load"));
  renderList();
}));

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
