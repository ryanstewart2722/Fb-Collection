(() => {
// A person's collection page: /u/<username>. Reads from the database; the database rules decide what
// each visitor may see (a private collection shows only to its owner).
const sb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: false } });
const $ = (s) => document.querySelector(s);
const app = $("#app");
const preview = $(".preview");
const canHover = matchMedia("(hover: hover)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const spans = (list) => list.map((c) => `<span>${esc(c)}</span>`).join("");

// Same sections and columns as the museum owner's own collection. Each field is [key, header, placeholder].
const SCHEMA = {
  setups:    { title: "Setups",    fields: [["name", "Deck & Manufacturer", "Dr. M's Research Institute 32mm* Mystery R2 Blue/Tan (f)"], ["trucks", "Trucks", "Joycult x Independent 32mm Silver"], ["wheels", "Wheels", "Joycult Classic 3.0 Street Tan"]] },
  decks:     { title: "Decks",     fields: [["name", "Deck name/color", "Thinker, Black/Blue"], ["maker", "Manufacturer", "CATFISHBBQ"], ["mold", "Mold", "Freshwater"], ["size", "Size", "32mm"]] },
  obstacles: { title: "Obstacles", fields: [["name", "Name", "Podium"], ["maker", "Manufacturer", "Yarnbody"], ["material", "Material", "Wood/Granite"]] },
  wheels:    { title: "Wheels",    fields: [["name", "Wheel/manufacturer", "Sunpower Wheels, Satori"], ["color", "Color", "White"], ["material", "Material", "Urethane"], ["duro", "Duro", "70d"]] },
  trucks:    { title: "Trucks",    fields: [["name", "Name", "Joycult x Independent Stage 11 Polished Trucks"], ["size", "Size", "32mm"], ["color", "Color", "Silver"]] },
};
const ORDER = ["setups", "decks", "obstacles", "wheels", "trucks"];
const TALL = new Set(["decks", "setups"]);
// Older items were saved as brand/size/color; still show them.
const val = (i, k) => k === "name" ? i.name : (i.details?.[k] ?? (k === "maker" ? i.details?.brand : "")) || "";
const colsFor = (n) => n <= 4 ? "473fr 355fr 237fr 335fr" : "473fr " + Array(n - 1).fill(Math.round(927 / (n - 1)) + "fr").join(" ");
// A line goes between brands: the manufacturer when there is one, otherwise the start of the name ("Sunpower Wheels, Satori" -> "Sunpower Wheels").
const nameBrand = (n) => { const t = String(n || "").trim().toLowerCase().split(/\s+/); return (/^dr\.?$/.test(t[0]) ? t.slice(0, 2).join(" ") : t[0]) || ""; };
const brandOf = (sec, i) => String(val(i, "maker") || "").trim().toLowerCase() || nameBrand(i.name);
const rowCells = (sec, i) => SCHEMA[sec].fields.map(([k]) => val(i, k));

// A built-in sample so you can see what a page looks like before anyone has signed up.
const D = (f) => `https://museumofminiskateboards.org/Images/museum/decks/${f}.png`;
const SAMPLE = {
  profile: { id: "sample", username: "example", display_name: "Sample Collector", bio: "", is_private: false },
  items: [
    ["decks", "Her Majesty", "CATFISHBBQ", "34mm", "Multicolor", "cfbbq-1737"], ["decks", "Artshow Street99", "CATFISHBBQ", "34mm", "Blue", "cfbbq-1829"],
    ["decks", "Drop 82, Dr.M’s airbrushed - 1082 (f)", "Dr. M's Research Institute", "32mm", "Multicolor", "drm-1082"], ["decks", "Frame", "CATFISHBBQ", "34mm", "Red", "cfbbq-ig330"],
    ["decks", "Washi Spring", "CATFISHBBQ", "32mm", "Green", "cfbbq-1869"], ["decks", "Wish", "CATFISHBBQ", "32mm", "Natural/Blue", "cfbbq-2"],
    ["setups", "Daily skate", "", "32mm", "", "cfbbq-1830"], ["setups", "Display shelf", "", "34mm", "", "cfbbq-1860"],
  ].map(([section, name, brand, size, color, f], n) => ({ id: "s" + n, section, name, details: { maker: brand, size, color, ...(section === "setups" ? { trucks: "Independent 32mm Silver", wheels: "Joycult Classic 3.0 Tan" } : { mold: color ? "Freshwater" : "" }) }, image_path: D(f), status: "approved" })),
};

let view = location.hash === "#list" ? "list" : "image";
let state = null;   // { profile, items, owner }

function showPreview(src) { if (!src) return hidePreview(); preview.src = src; preview.classList.add("show"); }
function hidePreview() { preview.classList.remove("show"); }
function clearActive() {
  document.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
  document.querySelectorAll(".hovering").forEach((x) => x.classList.remove("hovering"));
  document.querySelectorAll(".bar.show").forEach((x) => x.classList.remove("show"));
  hidePreview();
}
if (!canHover) { document.body.classList.add("touch"); document.addEventListener("click", clearActive); }
function bindItem(el, activate) {
  if (canHover) return el.addEventListener("mouseenter", () => activate(el));
  el.addEventListener("click", (e) => { e.stopPropagation(); el.classList.contains("on") ? clearActive() : activate(el); });
}

// High-quality re-cuts are made a few minutes after an upload (see scripts/recut_worker.py) and listed in /user-cuts/index.json.
let RECUTS = {};
async function loadRecuts() { try { const r = await fetch("/user-cuts/index.json", { cache: "no-cache" }); if (r.ok) RECUTS = await r.json(); } catch { /* none yet */ } }
// Uploads the cut-out and, for the later high-quality re-cut, a cropped copy of the original photo.
async function uploadPhoto(file, section) {
  const p = await window.momsPreparePhoto(file, section), uid = state.profile.id, id = crypto.randomUUID();
  const image_path = `${uid}/${id}.${p.ext}`;
  const up = await sb.storage.from("uploads").upload(image_path, p.blob, { contentType: p.type, cacheControl: "3600" });
  if (up.error) throw up.error;
  let source_path = null;
  if (p.source) {
    const sp = `${uid}/${id}-src.jpg`, u2 = await sb.storage.from("uploads").upload(sp, p.source, { contentType: "image/jpeg", cacheControl: "3600" });
    if (!u2.error) source_path = sp;
  } else if (!p.cut) source_path = image_path;   // the browser could not cut it out: let the stronger tool try the photo itself
  return { image_path, source_path };
}
const stored = (p) => p && !/^https?:/.test(p);
function dropFiles(...paths) { const list = [...new Set(paths.filter(stored))]; if (list.length) sb.storage.from("uploads").remove(list).catch(() => {}); }
async function photoUrl(item) {
  const rc = RECUTS[item.id];
  if (rc && item.source_path && rc.src === item.source_path) return "/" + rc.file;
  const p = item.image_path;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);   // owner's not-yet-approved photo
  return data?.signedUrl || "";
}

function sections() {
  const by = {};
  state.items.forEach((i) => (by[i.section] ||= []).push(i));
  return ORDER.filter((s) => by[s] || state.owner).map((s) => ({ id: s, title: SCHEMA[s].title, items: by[s] || [] }));
}

/* ---------- header block ---------- */
function headHtml() {
  const { profile, owner } = state;
  return `<section class="p-head">
    <p class="p-user">museumofminiskateboards.org/u/${esc(profile.username)}${profile.is_private ? ` · <b>Private</b>` : ""}</p>
    ${owner ? ownerBar() : ""}
  </section>`;
}
function fieldsHtml(sec) {
  return SCHEMA[sec].fields.map(([k, , ph], n) => `<input id="ad-${k}" data-k="${k}" type="text" placeholder="${esc(ph)}" maxlength="${k === "name" ? 120 : 60}"${n === 0 ? " required" : ""}>`).join("");
}
function ownerBar() {
  const p = state.profile;
  return `<div class="p-owner">
    <button class="auth-link" data-act="editimg">${state.edit ? "Done editing" : "Edit"}</button> ·
    <button class="auth-link" data-act="edit">Edit name and bio</button> ·
    <button class="auth-link" data-act="private">${p.is_private ? "Make my collection public" : "Make my collection private"}</button> ·
    <button class="auth-link" data-act="signout">Sign out</button>
    <form id="edit-form" class="auth-form p-edit" hidden>
      <input id="ed-name" type="text" placeholder="Display name" maxlength="60" value="${esc(p.display_name || "")}">
      <textarea id="ed-bio" placeholder="A short bio (optional)" maxlength="300" rows="3">${esc(p.bio || "")}</textarea>
      <button class="auth-btn" type="submit">Save</button>
    </form>
    <p id="owner-msg" class="auth-note" aria-live="polite"></p>
  </div>`;
}

/* ---------- list / image ---------- */
function renderList() {
  return sections().map((s) => `<section class="list-section">
    <h2>${esc(s.title)}</h2>
    <div class="list-wrap"><div class="list${s.items.length ? "" : " is-empty"}" data-s="${s.id}" style="--cols:${colsFor(SCHEMA[s.id].fields.length)}">
      <div class="row head">${spans(SCHEMA[s.id].fields.map((f) => f[1]))}</div>
      ${s.items.map((i, n) => `<div class="row${n > 0 && brandOf(s.id, i) !== brandOf(s.id, s.items[n - 1]) ? " divide" : ""}" data-id="${esc(i.id)}">${spans(rowCells(s.id, i))}${i.status !== "approved" ? `<em class="p-pending">${esc(i.status === "pending" ? "waiting for review" : i.status)}</em>` : ""}</div>`).join("")}
      ${state.owner ? `<a class="add-new" href="#" data-act="add" data-section="${s.id}">+ Add new</a>` : ""}
    </div></div></section>`).join("");
}
function elThumb(i) { return `<label class="el-thumb">${i && i.url ? `<img src="${esc(i.url)}" alt="">` : "+"}<input class="ed-file" type="file" accept="image/*"></label>`; }
function elInputs(sec, i) {
  return `<span class="el-fields">${SCHEMA[sec].fields.map(([k, h, ph]) =>
    `<input class="el-in" data-k="${k}" type="text" autocomplete="off" value="${esc(i ? val(i, k) : "")}" placeholder="${esc(ph)}" maxlength="${k === "name" ? 120 : 60}" aria-label="${esc(h)}">`).join("")}</span>`;
}
function renderListEdit() {
  return sections().map((s) => `<section class="list-section">
    <h2>${esc(s.title)}</h2>
    <div class="list-wrap"><div class="list el-list el-n${SCHEMA[s.id].fields.length}${s.items.length || state.draft === s.id ? "" : " is-empty"}" data-s="${s.id}" style="--cols:${colsFor(SCHEMA[s.id].fields.length)}">
      <div class="el-row el-head"><span></span>${SCHEMA[s.id].fields.map((f) => `<span class="el-h">${esc(f[1])}</span>`).join("")}<span></span></div>
      ${s.items.map((i, n) => `<div class="el-row${n > 0 && brandOf(s.id, i) !== brandOf(s.id, s.items[n - 1]) ? " divide" : ""}" data-id="${esc(i.id)}">${elThumb(i)}${elInputs(s.id, i)}<button class="el-x" data-act="remove" data-id="${esc(i.id)}" title="Remove">×</button></div>`).join("")}
      ${state.draft === s.id ? `<div class="el-row el-new" data-section="${s.id}">${elThumb(null)}${elInputs(s.id, null)}<button class="ed-btn el-save" data-act="savenew">Add</button></div>` : ""}
      <button class="ed-btn el-add" data-act="newrow" data-section="${s.id}">+ Add to My ${esc(s.title)}</button>
    </div></div></section>`).join("");
}
function renderEdit() {
  return sections().filter((s) => s.items.length).map((s) => `<section class="grid-section">
    <h2>${esc(s.title)}</h2>
    <div class="ed-grid">${s.items.map((i) => `<div class="ed-card" data-id="${esc(i.id)}">
      <div class="ed-img">${i.url ? `<img src="${esc(i.url)}" alt="">` : "No photo"}</div>
      <div class="ed-name">${esc(i.name)}${i.status !== "approved" ? ` <em class="p-pending">${esc(i.status === "pending" ? "waiting for review" : i.status)}</em>` : ""}</div>
      <div class="ed-btns">
        <label class="ed-btn">${i.url ? "Replace" : "Add photo"}<input class="ed-file" type="file" accept="image/*"></label>
        <button class="ed-btn" data-act="remove" data-id="${esc(i.id)}">Remove</button>
      </div></div>`).join("")}</div></section>`).join("");
}
function renderGrid() {
  return sections().filter((s) => s.items.some((i) => i.url)).map((s) => `<section class="grid-section">
    <h2>${esc(s.title)}</h2>
    <div class="grid${TALL.has(s.id) ? "" : " square"}" data-s="${s.id}">
      ${s.items.filter((i) => i.url).map((i) => `<div class="item" data-id="${esc(i.id)}"><img src="${esc(i.url)}" alt="${esc(i.name)}" loading="lazy"></div>`).join("")}
      <div class="bar" style="--cols:${colsFor(SCHEMA[s.id].fields.length)}"></div>
    </div></section>`).join("");
}
function paintItems() {
  const box = $("#items");
  if (state.owner && !state.items.length) view = "list";   // nothing to show as pictures yet
  clearActive();
  document.querySelectorAll("#views a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.body.classList.toggle("list-view", view === "list");
  if (!state.items.length && !state.owner) {
    box.innerHTML = `<p class="p-empty">${state.owner ? "You haven't added anything yet." : "Nothing here yet."}</p>`;
    return;
  }
  const editing = state.edit && state.owner;
  const TIP = `<p class="el-tip">Photo tip: shoot from straight above on a clean, contrasting background in good light. The background is removed for you.</p>`;
  box.innerHTML = view === "list" ? (editing ? TIP + renderListEdit() : renderList()) : editing ? TIP + renderEdit() : renderGrid();
  if (editing && state.draft) { const n = box.querySelector(".el-new .el-in"); if (n) n.focus({ preventScroll: false }); }
  const find = (id) => state.items.find((i) => i.id === id);
  if (view === "list") {
    box.querySelectorAll(".row:not(.head)").forEach((row) => {
      bindItem(row, () => { clearActive(); row.classList.add("on"); showPreview(find(row.dataset.id).url); });
      if (canHover) row.addEventListener("mouseleave", clearActive);
    });
  } else {
    box.querySelectorAll(".grid").forEach((grid) => {
      const bar = grid.querySelector(".bar");
      grid.querySelectorAll(".item").forEach((el) => bindItem(el, () => {
        clearActive();
        const d = find(el.dataset.id), img = el.querySelector("img");
        el.classList.add("on"); grid.classList.add("hovering");
        const gap = parseFloat(getComputedStyle(grid).rowGap);
        bar.style.top = el.offsetTop + img.offsetHeight + gap / 2 - 16 + "px";
        bar.innerHTML = spans(rowCells(grid.dataset.s, d));
        bar.classList.add("show");
        showPreview(d.url);
      }));
      if (canHover) grid.addEventListener("mouseleave", clearActive);
    });
  }
}
window.addEventListener("hashchange", () => { view = location.hash === "#list" ? "list" : "image"; if (state) paint(); });

/* ---------- page ---------- */
function syncEditHeader() {
  const t = document.querySelector(".insta"), editing = !!(state && state.owner && state.edit);
  document.body.classList.toggle("editing", editing);
  if (!t) return;
  if (editing && matchMedia("(max-width: 760px)").matches) {
    if (t.dataset.prev === undefined) t.dataset.prev = t.textContent;
    t.textContent = "Done"; t.onclick = (e) => { e.preventDefault(); state.edit = false; state.draft = null; paint(); };
  } else if (t.dataset.prev !== undefined) { t.textContent = t.dataset.prev; t.onclick = null; delete t.dataset.prev; }
}
function paint() {
  document.title = `${state.profile.display_name || state.profile.username} · MoMS`;
  $("#views").hidden = !state.items.length && !state.owner;
  $("#views-gap").hidden = !!state.items.length || state.owner;
  app.innerHTML = `<div id="items"></div>` + headHtml();   // the link and owner links sit at the bottom of the page
  paintItems();
  syncEditHeader();
}
function notFound(name) {
  app.innerHTML = `<section class="p-head"><h1>No one here</h1><p class="p-bio">There's no collection at <b>/u/${esc(name)}</b>. <a href="/signin.html">Sign in</a> to make yours.</p></section>`;
}

app.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act || !state?.owner) return;
  const msg = $("#owner-msg");
  if (state.profile.id === "sample" && !["add", "newrow", "edit", "editimg", "savenew"].includes(act)) return (msg.textContent = "This is a preview. Nothing is saved here.");
  if (act === "savenew") { tryInsert(e.target.closest(".el-new")); return; }
  if (act === "editimg") { state.edit = !state.edit; paint(); return; }
  if (act === "signout") { await sb.auth.signOut(); location.href = "/"; }
  if (act === "edit") { const f = $("#edit-form"); f.hidden = !f.hidden; }
  if (act === "add" || act === "newrow") {
    e.preventDefault();
    state.edit = true; state.draft = e.target.closest("[data-act]").dataset.section; paint();
    return;
  }
  if (act === "edit") { const f = $("#edit-form"); f.hidden = !f.hidden; }
  if (act === "add") {
    e.preventDefault();
    const f = $("#add-form"), sec = e.target.closest("[data-act]").dataset.section;
    if (sec) { $("#ad-section").value = sec; $("#ad-fields").innerHTML = fieldsHtml(sec); }
    f.hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); $("#ad-name").focus({ preventScroll: true });
  }
  if (act === "remove") {
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (!it || !confirm(`Remove “${it.name}” from your collection?`)) return;
    const { error } = await sb.from("collection_items").delete().eq("id", id);
    if (error) return (msg.textContent = "Couldn't remove it. " + error.message);
    dropFiles(it.image_path, it.source_path);
    state.items = state.items.filter((i) => i.id !== id); paint();
    $("#owner-msg").textContent = "Removed.";
  }
  if (act === "private") {
    const is_private = !state.profile.is_private;
    const { data, error } = await sb.from("profiles").update({ is_private }).eq("id", state.profile.id).select("is_private");
    if (error || !data?.length) return (msg.textContent = "Couldn't change that. " + (error?.message || ""));
    state.profile.is_private = is_private; paint();
    $("#owner-msg").textContent = is_private ? "Your collection is now private. Only you can see it." : "Your collection is now public.";
  }
});
// Brands and molds that people type are matched to the museum's own names ("dr. m" becomes "Dr. M's Research Institute",
// "catfishbbq" becomes "CATFISHBBQ"). Something genuinely new is added to a shared list, so the next person gets the same spelling.
const TERM_KIND = { maker: "brand", mold: "mold" };
const tkey = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TERMS = { brand: new Map(), mold: new Map() };   // simplified spelling -> the name we keep
let termsReady = null;
function loadTerms() {
  return (termsReady ||= (async () => {
    const caps = (n) => (n.match(/[A-Z]/g) || []).length;
    const official = (kind, name) => { const k = tkey(name); if (!k) return; const cur = TERMS[kind].get(k); if (!cur || caps(name) > caps(cur)) TERMS[kind].set(k, name); };
    const [b, d, u] = await Promise.all([
      sb.from("brands").select("name").limit(500),
      sb.from("decks").select("molds,mold_code").limit(3000),
      sb.from("user_terms").select("kind,name").limit(2000),
    ]);
    (b.data || []).forEach((r) => official("brand", r.name));
    (d.data || []).forEach((r) => (r.molds || []).forEach((m) => official("mold", m)));
    const codes = new Map();   // short mold codes like "f", "nc", "c2" count too, when a code always means one mold
    (d.data || []).forEach((r) => { if (r.mold_code && (r.molds || []).length === 1) { const k = tkey(r.mold_code); (codes.get(k) || codes.set(k, new Set()).get(k)).add(r.molds[0]); } });
    codes.forEach((names, k) => { if (names.size === 1 && !TERMS.mold.has(k)) TERMS.mold.set(k, [...names][0]); });
    (u.data || []).forEach((r) => { const k = tkey(r.name); if (TERMS[r.kind] && k && !TERMS[r.kind].has(k)) TERMS[r.kind].set(k, r.name); });
  })().catch(() => {}));
}
function canonTerm(kind, typed) {
  const raw = String(typed || "").replace(/\s+/g, " ").trim();
  if (!raw) return { name: "", status: "empty" };
  const map = TERMS[kind], k = tkey(raw);
  if (map.has(k)) return { name: map.get(k), status: map.get(k) === raw ? "same" : "fixed" };
  if (k.length >= 3) {
    const longer = [...map.keys()].filter((x) => x.startsWith(k)).sort((a, b) => a.length - b.length);   // they typed the start of a known name
    if (longer.length && longer.every((x) => x.startsWith(longer[0]))) return { name: map.get(longer[0]), status: "fixed" };
    const lead = [...map.keys()].filter((x) => x.length >= 4 && k.startsWith(x)).sort((a, b) => b.length - a.length)[0];   // a known name plus extra words
    if (lead) return { name: map.get(lead), status: "fixed" };
  }
  const name = raw === raw.toLowerCase() ? raw.replace(/\b[a-z]/g, (m) => m.toUpperCase()) : raw;
  return { name, status: "new" };
}
async function canonRow(row, preview) {
  await loadTerms();
  const notes = [];
  for (const inp of row.querySelectorAll(".el-in")) {
    const kind = TERM_KIND[inp.dataset.k]; if (!kind) continue;
    const old = inp.value, r = canonTerm(kind, old);
    if (r.status === "empty") continue;
    if (r.name !== old) inp.value = r.name;
    if (r.status === "fixed" && r.name !== old.trim()) notes.push(`“${old.trim()}” is ${r.name}`);
    if (r.status === "new" && r.name.length >= 3) {   // one- and two-letter entries are kept as typed, not added to the shared list
      notes.push(`New ${kind} added: ${r.name}`);
      TERMS[kind].set(tkey(r.name), r.name);
      if (!preview) sb.from("user_terms").insert({ kind, name: r.name }).then(() => {}, () => {});
    }
  }
  return notes.length ? " " + notes.join(". ") + "." : "";
}
async function tryInsert(row) {
  const msg = $("#owner-msg"), section = row.dataset.section;
  const name = row.querySelector('[data-k="name"]').value.replace(/\s+/g, " ").trim();
  if (!name) return;
  const note = await canonRow(row, state.profile.id === "sample");
  if (state.profile.id === "sample") return (msg.textContent = "This is a preview. Nothing is saved here." + note);
  msg.textContent = "Adding… (cutting out the background takes a few seconds; the first photo also loads the cut-out tool, about 44 MB, once)";
  try {
    let image_path = null, source_path = null;
    const file = row.querySelector(".ed-file").files[0];
    if (file) ({ image_path, source_path } = await uploadPhoto(file, section));
    const details = Object.fromEntries([...row.querySelectorAll(".el-in")].filter((el) => el.dataset.k !== "name").map((el) => [el.dataset.k, el.value.trim()]).filter(([, v]) => v));
    const position = state.items.reduce((m, i) => Math.max(m, i.position || 0), 0) + 1;
    const { data, error } = await sb.from("collection_items").insert({ section, name, details, image_path, source_path, position }).select().single();
    if (error) { dropFiles(image_path, source_path); throw error; }
    data.url = await photoUrl(data);
    state.items.push(data); state.draft = null; paint();
    $("#owner-msg").textContent = "Added." + (source_path ? " A cleaner cut-out replaces the photo in a few minutes." : "") + note;
  } catch (err) { msg.textContent = "Couldn't add that. " + (err.message || err); }
}
async function saveRow(row) {
  const msg = $("#owner-msg");
  const note = await canonRow(row, state.profile.id === "sample");
  if (state.profile.id === "sample") return (msg.textContent = "This is a preview. Nothing is saved here." + note);
  const it = state.items.find((i) => i.id === row.dataset.id);
  if (!it) return;
  const name = row.querySelector('[data-k="name"]').value.replace(/\s+/g, " ").trim();
  if (!name) { msg.textContent = "A name is needed."; return paint(); }
  const details = { ...(it.details || {}) };
  row.querySelectorAll(".el-in").forEach((el) => { if (el.dataset.k !== "name") { if (el.value.trim()) details[el.dataset.k] = el.value.trim(); else delete details[el.dataset.k]; } });
  const { data, error } = await sb.from("collection_items").update({ name, details }).eq("id", it.id).select();
  if (error || !data?.length) return (msg.textContent = "Couldn't save. " + (error?.message || ""));
  const url = it.url; Object.assign(it, data[0]); it.url = url;
  msg.textContent = "Saved." + note;
}
app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList.contains("el-in")) return;
  const row = e.target.closest(".el-new");
  e.preventDefault();
  if (row) tryInsert(row); else e.target.blur();
});
app.addEventListener("change", (e) => {
  if (!e.target.classList.contains("el-in")) return;
  const row = e.target.closest(".el-row");
  if (row.classList.contains("el-new")) return;   // a new row is saved with its Add button (or Enter)
  saveRow(row);
});
new MutationObserver(() => {
  const el = $("#owner-msg"); if (!el || !el.textContent) return;
  clearTimeout(window.__msgT); window.__msgT = setTimeout(() => { const e2 = $("#owner-msg"); if (e2 && !/…/.test(e2.textContent)) e2.textContent = ""; }, 7000);
}).observe(app, { subtree: true, childList: true, characterData: true });
app.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("ed-file") || !state?.owner) return;
  const msg = $("#owner-msg"), file = e.target.files[0];
  if (!file) return;
  if (e.target.closest(".el-new")) { e.target.closest(".el-thumb").firstChild.textContent = "✓"; msg.textContent = "Photo attached. Fill in the rest, then press Add."; return; }
  if (state.profile.id === "sample") return (msg.textContent = "This is a preview. Nothing is saved here.");
  const it = state.items.find((i) => i.id === e.target.closest("[data-id]").dataset.id);
  if (!it) return;
  msg.textContent = "Uploading… (cutting out the background takes a few seconds; the first photo also loads the cut-out tool, about 44 MB, once)";
  try {
    const nu = await uploadPhoto(file, it.section);
    const { data, error } = await sb.from("collection_items").update({ image_path: nu.image_path, source_path: nu.source_path }).eq("id", it.id).select();
    if (error || !data?.length) { dropFiles(nu.image_path, nu.source_path); throw error || new Error("not saved"); }
    dropFiles(it.image_path, it.source_path);
    Object.assign(it, data[0]); it.url = await photoUrl(it);
    paint(); $("#owner-msg").textContent = "Photo saved." + (nu.source_path ? " A cleaner cut-out replaces it in a few minutes." : "");
  } catch (err) { msg.textContent = "Couldn't save that photo. " + (err.message || err); }
});
app.addEventListener("change", (e) => { if (e.target.id === "ad-section") $("#ad-fields").innerHTML = fieldsHtml(e.target.value); });
app.addEventListener("submit", async (e) => {
  if (e.target.id === "add-form") {
    e.preventDefault();
    const btn = $("#ad-btn"), msg = $("#owner-msg");
    if (state.profile.id === "sample") return (msg.textContent = "This is a preview. Nothing is saved here.");
    const section = $("#ad-section").value, name = $("#ad-name").value.trim();
    if (!name) return;
    btn.disabled = true; msg.textContent = "Adding…";
    try {
      let image_path = null;
      const file = $("#ad-file").files[0];
      if (file) {
        const p = await window.momsPreparePhoto(file, section);
        image_path = `${state.profile.id}/${crypto.randomUUID()}.${p.ext}`;
        const up = await sb.storage.from("uploads").upload(image_path, p.blob, { contentType: p.type, cacheControl: "3600" });
        if (up.error) throw up.error;
      }
      const details = Object.fromEntries([...document.querySelectorAll("#ad-fields [data-k]")].filter((el) => el.dataset.k !== "name").map((el) => [el.dataset.k, el.value.trim()]).filter(([, v]) => v));
      const position = state.items.reduce((m, i) => Math.max(m, i.position || 0), 0) + 1;
      const { data, error } = await sb.from("collection_items").insert({ section, name, details, image_path, position }).select().single();
      if (error) { if (image_path) sb.storage.from("uploads").remove([image_path]).catch(() => {}); throw error; }
      data.url = await photoUrl(data);
      state.items.push(data); paint();
      $("#owner-msg").textContent = image_path ? "Added." : "Added.";
      $("#add-form").hidden = false; $("#add-form").reset(); $("#ad-fields").innerHTML = fieldsHtml($("#ad-section").value);
    } catch (err) {
      msg.textContent = "Couldn't add that. " + (err.message || err);
    }
    btn.disabled = false;
    return;
  }
  if (e.target.id !== "edit-form") return;
  e.preventDefault();
  if (state.profile.id === "sample") return ($("#owner-msg").textContent = "This is a preview. Nothing is saved here.");
  const display_name = $("#ed-name").value.trim() || null, bio = $("#ed-bio").value.trim() || null;
  const { data, error } = await sb.from("profiles").update({ display_name, bio }).eq("id", state.profile.id).select("display_name,bio");
  if (error || !data?.length) return ($("#owner-msg").textContent = "Couldn't save. " + (error?.message || ""));
  Object.assign(state.profile, data[0]); paint();
  $("#owner-msg").textContent = "Saved.";
});

async function rpc(fn, args) {
  const r = await fetch(`${MOMS.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: MOMS.key, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  return r.ok ? r.json() : null;
}

async function load() {
  const raw = (new URLSearchParams(location.search).get("u") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!raw) return notFound("");
  if (raw === "example" || raw === "r2") {   // r2: preview link (too short for a real username)
    history.replaceState(null, "", "/u/" + raw + location.hash);
    state = { profile: SAMPLE.profile, items: SAMPLE.items.map((i) => ({ ...i, url: i.image_path })), owner: raw === "r2" };   // r2 previews the owner view; nothing is saved
    return paint();
  }
  const username = await rpc("resolve_username", { u: raw });   // ryan, riso... lead to r
  if (!username) return notFound(raw);
  history.replaceState(null, "", "/u/" + username + location.hash);   // show the real address

  const { data: profile } = await sb.from("profiles").select("id,username,display_name,bio,is_private").eq("username", username).maybeSingle();
  if (!profile) return notFound(raw);
  const { data: { session } } = await sb.auth.getSession();
  const owner = session?.user.id === profile.id;
  const { data: items } = await sb.from("collection_items").select("*").eq("user_id", profile.id).order("section").order("position").order("created_at");
  const rows = items || [];
  await loadRecuts();
  await Promise.all(rows.map(async (i) => (i.url = await photoUrl(i))));
  state = { profile, items: rows, owner };
  paint();
}

load().catch((err) => { console.error(err); app.innerHTML = `<p class="p-empty">Couldn't load this page. Please refresh.</p>`; });
})();
