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
  misc:      { title: "Misc.",     fields: [["name", "Object name", "Earl E. Bird Holder"], ["maker", "Brand", "w0rm"], ["material", "Material", "Corduroy"], ["year", "Year", "2026"]] },
};
const ORDER = ["setups", "decks", "obstacles", "wheels", "trucks", "misc"];
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

const viewOf = () => /list$/.test(location.hash) ? "list" : "image";
const favMode = () => location.hash.startsWith("#favorites");   // #favorites and #favorites-list: the person's favorite museum products
let view = viewOf();   // collection pages open on the image view
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
  const p = await window.momsPreparePhoto(file, section), uid = state.viewer || state.profile.id, id = crypto.randomUUID();   // an admin's uploads go in the admin's own folder
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
async function photoUrl2(item) {
  const p = item.image_path_2;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);
  return data?.signedUrl || "";
}
const stored = (p) => p && !/^https?:/.test(p);
function dropFiles(...paths) { const list = [...new Set(paths.filter(stored))]; if (list.length) sb.storage.from("uploads").remove(list).catch(() => {}); }
async function photoUrl(item) {
  const rc = RECUTS[item.id], pick = item.details?.cut;   // pick: an admin's choice, "quick" or "refined"; otherwise the refined cut is used when it passed the quality check
  item.cutInfo = null;
  if (rc && rc.file && item.source_path && rc.src === item.source_path) item.cutInfo = { q: rc.q, bad: !!rc.bad, pick };
  if (rc && rc.file && item.source_path && rc.src === item.source_path && pick !== "quick" && (!rc.bad || pick === "refined")) {
    const u = "/" + rc.file + "?c=1";   // a new address, so a copy of the page that was cached before the file existed can't get in the way
    // use the better cut-out only once it really loads; if the site is still publishing it, keep showing the quick one
    if (await new Promise((ok) => { const im = new Image(); im.onload = () => ok(true); im.onerror = () => ok(false); im.src = u; })) return u;
  }
  const p = item.image_path;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);   // owner's not-yet-approved photo
  return data?.signedUrl || "";
}

function sections() {
  const by = {};
  state.items.forEach((i) => { if (i.status !== "removed" || (state.staff && state.edit)) (by[i.section] ||= []).push(i); });   // hidden entries show only while an admin is editing
  return ORDER.filter((s) => by[s] || state.owner).map((s) => ({ id: s, title: SCHEMA[s].title, items: by[s] || [] }));
}

/* ---------- header block ---------- */
function headHtml() {
  const { profile, owner } = state;
  return `<section class="p-head">
    <p class="p-user">museumofminiskateboards.org/u/${esc(profile.username)}${profile.is_private ? ` · <b>Private</b>` : ""}${state.fav ? ` · <a class="p-fav-link" href="#${view === "list" ? "list" : "image"}">← Back to collection</a>` : ` · <a class="p-fav-link" href="#favorites">Favorites${state.favItems ? ` (${state.favItems.length})` : ""}</a>`}</p>
    ${owner ? ownerBar() : ""}
  </section>`;
}
function fieldsHtml(sec) {
  return SCHEMA[sec].fields.map(([k, , ph], n) => `<input id="ad-${k}" data-k="${k}" type="text" placeholder="${esc(ph)}" maxlength="${k === "name" ? 120 : 60}"${n === 0 ? " required" : ""}>`).join("");
}
function ownerBar() {
  const p = state.profile;
  if (state.staff) return `<div class="p-owner">
    <button class="auth-link" data-act="editimg">${state.edit ? "Done editing" : "Edit"}</button> · <span class="auth-note">Admin: you can change or hide ${esc(p.display_name || p.username)}'s entries and photos. Hidden ones are dimmed and nobody else sees them.</span>
    <p id="owner-msg" class="auth-note" aria-live="polite"></p>
  </div>`;
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
      ${s.items.map((i, n) => `<div class="row${n > 0 && brandOf(s.id, i) !== brandOf(s.id, s.items[n - 1]) ? " divide" : ""}" data-id="${esc(i.id)}">${spans(rowCells(s.id, i))}</div>`).join("")}
      ${state.owner ? `<a class="add-new" href="#" data-act="add" data-section="${s.id}">+ Add new</a>` : ""}
    </div></div></section>`).join("");
}
const cutNow = (i) => i.cutInfo && (i.cutInfo.pick === "quick" || (i.cutInfo.bad && i.cutInfo.pick !== "refined")) ? "quick" : "refined";
const cutSwitch = (i) => state.staff && i && i.cutInfo ? `<a href="#" class="orig-dl" data-act="cutview" data-id="${esc(i.id)}" title="${i.cutInfo.bad ? "The refined cut failed the quality check" : "Both cuts are kept"}${i.cutInfo.q ? " (shape score " + i.cutInfo.q + ")" : ""}">${cutNow(i) === "quick" ? "Quick cut" : "Refined cut"} · compare</a>` : "";
const mainLink = (i) => state.owner && i && i.id && !String(i.id).startsWith("s") && i.image_path ? `<a href="#" class="orig-dl" data-act="main" data-id="${esc(i.id)}" title="${i.details?.main ? "This is the photo shown when someone hovers your name on the Users page. Click to go back to your first setup." : "Show this when someone hovers your name on the Users page"}">${i.details?.main ? "Main ✓" : "Make main"}</a>` : "";
const origLink = (i) => state.staff && i && (i.source_path || i.image_path) ? `<a href="#" class="orig-dl" data-act="dl" data-id="${esc(i.id)}" title="Download the photo they uploaded, before any cut-out">Original Photo</a>` : "";
const PLY = { decks: ["Photo 1: bottom ply (the graphic side)", "Photo 2: top ply"], setups: ["Photo 1: bottom ply (the graphic side)", "Photo 2: top ply"] };
function elThumb(i, sec) { return `<label class="el-thumb" title="${esc((PLY[sec] || ["Photo"])[0])}">${i && i.url ? `<img src="${esc(i.url)}" alt="">` : "+"}<input class="ed-file" type="file" accept="image/*"></label>`; }
// an optional second photo: for decks the first is the bottom ply and this one is the top ply
function elThumb2(i, sec) { return `<label class="el-thumb el-thumb2" title="${esc((PLY[sec] || ["", "A second photo (optional)"])[1])}">${i && i.url2 ? `<img src="${esc(i.url2)}" alt="">` : "2"}<input class="ed-file ed-file2" type="file" accept="image/*"></label>`; }
// Typing suggestions (phone and desktop): the museum's brands as they are right now, and the sizes, molds and colors already in use. Anything else can still be typed.
const SUGGEST_KIND = { maker: "brand", mold: "mold", size: "dsize", color: "color", material: "material" };
let suggestReady = null;
function loadSuggestions() {
  return (suggestReady ||= (async () => {
    const top = (arr) => { const c = new Map(); arr.forEach((v) => { v = String(v ?? "").trim(); if (v && v.length <= 40) c.set(v, (c.get(v) || 0) + 1); }); return [...c].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 150); };
    const get = async (t, cols) => { const { data } = await sb.from(t).select(cols).limit(3000); return data || []; };
    const [brands, decks, trucks, wheels] = await Promise.all([get("brands", "name"), get("decks", "molds,size,color"), get("trucks", "size,color"), get("wheels", "color,material")]);
    const lists = {
      brand: brands.map((b) => b.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      dsize: top(decks.map((d) => d.size)), mold: top(decks.flatMap((d) => d.molds || [])),
      color: top([...decks, ...trucks, ...wheels].map((x) => x.color)), material: top(wheels.map((w) => w.material)),
    };
    document.getElementById("dl-box")?.remove();
    const box = document.createElement("div"); box.id = "dl-box"; box.hidden = true;
    box.innerHTML = Object.entries(lists).map(([k, vals]) => `<datalist id="dl-${k}">${vals.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`).join("");
    document.body.appendChild(box);
  })().catch(() => {}));
}
function elInputs(sec, i) {
  return `<span class="el-fields">${SCHEMA[sec].fields.map(([k, h, ph]) =>
    `<input class="el-in" data-k="${k}" type="text" autocomplete="off"${SUGGEST_KIND[k] ? ` list="dl-${SUGGEST_KIND[k]}"` : ""} value="${esc(i ? val(i, k) : "")}" placeholder="${esc(ph)}" maxlength="${k === "name" ? 120 : 60}" aria-label="${esc(h)}">`).join("")}</span>`;
}
function renderListEdit() {
  loadSuggestions();
  return sections().map((s) => `<section class="list-section">
    <h2>${esc(s.title)}</h2>
    <div class="list-wrap"><div class="list el-list el-n${SCHEMA[s.id].fields.length}${s.items.length || state.draft === s.id ? "" : " is-empty"}" data-s="${s.id}" style="--cols:${colsFor(SCHEMA[s.id].fields.length)}">
      <div class="el-row el-head"><span></span>${SCHEMA[s.id].fields.map((f) => `<span class="el-h">${esc(f[1])}</span>`).join("")}<span></span></div>
      ${s.items.map((i, n) => `<div class="el-row${n > 0 && brandOf(s.id, i) !== brandOf(s.id, s.items[n - 1]) ? " divide" : ""}${i.status === "removed" ? " is-hidden" : ""}" data-id="${esc(i.id)}"><span class="el-tcell">${elThumb(i, s.id)}${elThumb2(i, s.id)}${mainLink(i)}${origLink(i)}${cutSwitch(i)}</span>${elInputs(s.id, i)}<span class="el-acts"><button class="el-mv" data-act="up" title="Move up">↑</button><button class="el-mv" data-act="down" title="Move down">↓</button>${state.staff ? `<button class="el-x el-hide" data-act="hide" data-id="${esc(i.id)}" title="${i.status === "removed" ? "Show again" : "Hide from the site"}">${i.status === "removed" ? "Show" : "Hide"}</button>` : `<button class="el-x" data-act="remove" data-id="${esc(i.id)}" title="Remove">×</button>`}</span></div>`).join("")}
      ${state.draft === s.id ? `<div class="el-row el-new" data-section="${s.id}"><span class="el-tcell">${elThumb(null, s.id)}${elThumb2(null, s.id)}</span>${elInputs(s.id, null)}<button class="ed-btn el-save" data-act="savenew">Add</button></div>` : ""}
      <button class="ed-btn el-add" data-act="newrow" data-section="${s.id}">+ Add to My ${esc(s.title)}</button>
    </div></div></section>`).join("");
}
function renderEdit() {
  return sections().map((s) => `<section class="grid-section">
    <h2>${esc(s.title)}</h2>
    <button class="ed-btn el-add" data-act="newrow" data-section="${s.id}">+ Add to My ${esc(s.title)}</button>
    <div class="ed-grid">${s.items.map((i) => `<div class="ed-card${i.status === "removed" ? " is-hidden" : ""}" data-id="${esc(i.id)}">
      <div class="ed-img">${i.url ? `<img src="${esc(i.url)}" alt="">` : "No photo"}</div>
      ${mainLink(i)}${origLink(i)}${cutSwitch(i)}
      <div class="ed-name">${esc(i.name)}</div>
      <div class="ed-btns">
        <label class="ed-btn">${i.url ? "Replace" : "Add photo"}<input class="ed-file" type="file" accept="image/*"></label>
        ${state.staff ? `<button class="ed-btn" data-act="hide" data-id="${esc(i.id)}">${i.status === "removed" ? "Show again" : "Hide"}</button>` : `<button class="ed-btn" data-act="remove" data-id="${esc(i.id)}">Remove</button>`}
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
  document.querySelectorAll("#views a").forEach((a) => { a.classList.toggle("active", a.dataset.view === view); a.setAttribute("href", (state.fav ? "#favorites" : "#") + (state.fav ? (a.dataset.view === "list" ? "-list" : "") : a.dataset.view)); });
  document.body.classList.toggle("list-view", view === "list");
  if (!state.items.length && !state.owner) {
    box.innerHTML = `<p class="p-empty">${state.fav ? "No favorites yet." : state.owner ? "You haven't added anything yet." : "Nothing here yet."}</p>`;
    return;
  }
  const editing = state.edit && state.owner;
  const TIP = `<p class="el-tip">Photo tip: shoot from straight above on a clean, contrasting background in good light. The background is removed for you. You can add a second photo with the small “2” box under the first${/* decks */ ""} (for decks, photo 1 is the bottom ply and photo 2 is the top ply).</p>${state.isAdmin ? `<label class="el-skip"><input type="checkbox" id="skip-cut"${state.skipCut ? " checked" : ""}> Admin: skip cutout and use the photo exactly as it is. <b>Only for transparent PNGs.</b></label>` : ""}`;
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
window.addEventListener("hashchange", () => { view = viewOf(); if (state) { applyMode(); paintNow(); window.scrollTo({ top: 0, behavior: "instant" }); } });   // a different view starts at the top

/* ---------- favorites: the museum products a person has starred, shown like a collection ---------- */
const FAV_SEL = { decks: "id,name,slug,image_path,color,size,molds,drop_no,drop_title,mold_code,release_date,brands(name)", wheels: "id,name,slug,image_path,color,material,duro,release_date,brands(name)", trucks: "id,name,slug,image_path,color,size,release_date,brands(name)", obstacles: "id,name,slug,image_path,material,release_date,brands(name)", misc: "id,name,slug,image_path,material,release_date,brands(name)" };
async function loadFavs() {
  state.favItems = [];
  try {
    const { data: favs } = await sb.from("favorites").select("museum_type,museum_id,created_at").eq("user_id", state.profile.id).order("created_at", { ascending: false });
    const by = {};
    (favs || []).forEach((f) => (by[f.museum_type] ||= []).push(f.museum_id));
    const out = [];
    await Promise.all(Object.entries(by).map(async ([t, ids]) => {
      if (!FAV_SEL[t]) return;
      const { data: rows } = await sb.from(t).select(FAV_SEL[t]).in("id", ids);
      (rows || []).forEach((r) => {
        const brand = r.brands?.name || "", yr = r.release_date ? String(r.release_date).slice(0, 4) : "";
        const nm = t === "decks" ? (window.momsDeckName ? window.momsDeckName(r) : r.name) : t === "wheels" || t === "trucks" ? [brand, r.name].filter(Boolean).join(" ") : r.name;
        out.push({ id: t + ":" + r.id, section: t, name: nm, status: "approved", url: r.image_path || "", url2: "", link: `/board.html?type=${t}&slug=${encodeURIComponent(r.slug)}`,
          at: (favs.find((f) => f.museum_type === t && f.museum_id === r.id) || {}).created_at || "",
          details: { maker: brand, mold: (r.molds || []).join(", "), size: r.size || "", color: r.color || "", material: r.material || "", duro: r.duro || "", year: yr } });
      });
    }));
    out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    state.favItems = out;
  } catch (e) { console.error(e); }
}
// Swap the page between the collection and the favorites list (same list and image views for both).
function applyMode() {
  if (!state) return;
  document.body.classList.toggle("fav-mode", favMode());
  if (favMode() && !state.fav) { state.fav = true; state.keep = { items: state.items, owner: state.owner, edit: state.edit, draft: state.draft }; state.items = state.favItems || []; state.owner = false; state.edit = false; state.draft = null; }
  else if (!favMode() && state.fav) { state.fav = false; Object.assign(state, state.keep); state.keep = null; }
}
function favTop() {   // the page title, in the same big text as the section titles
  const back = view === "list" ? "list" : "image";   // the name takes you back to the collection
  return `<h2 class="fav-title"><a href="#${back}">${esc(state.profile.display_name || state.profile.username)}</a>'s Favorites</h2>`;
}
// A favorite opens its museum page (on touch screens: first tap shows it, second tap opens it)
document.addEventListener("click", (e) => {
  const el = e.target.closest("#items [data-id]");
  if (!el || !state || !state.fav) return;
  const it = state.items.find((i) => i.id === el.dataset.id);
  if (it && it.link && (canHover || el.classList.contains("on"))) location.href = it.link;
}, true);

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
function keep(box, fn, anchor) { return window.momsKeepScroll ? window.momsKeepScroll(box, fn, anchor) : fn(); }
function paint(anchor) { keep(app, () => paintNow(), anchor); }   // redraw without the page jumping
function paintNow() {
  document.title = `${state.profile.display_name || state.profile.username} · MoMS`;
  applyMode();
  $("#views").hidden = !state.items.length && !state.owner;
  $("#views-gap").hidden = !!state.items.length || state.owner;
  applyMode();
  app.innerHTML = (state.fav ? favTop() : "") + `<div id="items"></div>` + headHtml();   // the link and owner links sit at the bottom of the page
  paintItems();
  syncEditHeader();
}
function notFound(name) {
  app.innerHTML = `<section class="p-head"><h1>No one here</h1><p class="p-bio">There's no collection at <b>/u/${esc(name)}</b>. <a href="/signin.html">Sign in</a> to make yours.</p></section>`;
}

// Side-by-side view of a photo's two kept cuts (quick = made in the browser on upload, refined = the stronger model), with a button to pick which one the page shows.
async function openCutPicker(it) {
  const rc = RECUTS[it.id];
  if (!rc || !rc.file) return;
  let quick = it.image_path || "";
  if (quick && !/^https?:/.test(quick)) quick = (await sb.storage.from("uploads").createSignedUrl(quick, 3600)).data?.signedUrl || "";
  const refined = "/" + rc.file + "?c=1", now = cutNow(it);
  document.getElementById("cut-modal")?.remove();
  const box = document.createElement("div");
  box.id = "cut-modal"; box.className = "cut-modal";
  const col = (key, title, url, note) => `<div class="cut-col">
      <div class="cut-img">${url ? `<img src="${esc(url)}" alt="${title}">` : "<span>No image</span>"}</div>
      <b>${title}</b><span class="cut-note">${esc(note)}</span>
      <button class="ed-btn${now === key ? " on" : ""}" data-cut="${key}"${now === key ? " disabled" : ""}>${now === key ? "Showing" : "Use this one"}</button>
    </div>`;
  box.innerHTML = `<div class="cut-panel" role="dialog" aria-label="Compare cuts">
    <p class="cut-head"><b>${esc(it.name)}</b> <button class="ed-btn cut-x" data-close>Close</button></p>
    <div class="cut-cols">${col("quick", "Quick cut", quick, "Made on upload, in the browser")}${col("refined", "Refined cut", refined, rc.bad ? "Failed the quality check, so it isn't used unless you pick it" + (rc.q ? ` (shape score ${rc.q})` : "") : "Stronger model" + (rc.q ? ` · shape score ${rc.q}` : ""))}</div>
  </div>`;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  box.addEventListener("click", async (e) => {
    if (e.target === box || e.target.closest("[data-close]")) return close();
    const pick = e.target.closest("[data-cut]")?.dataset.cut;
    if (!pick || pick === now) return;
    const details = { ...(it.details || {}), cut: pick };
    const { data, error } = await sb.from("collection_items").update({ details }).eq("id", it.id).select();
    if (error || !data?.length) return ($("#owner-msg").textContent = "Couldn't switch. " + (error?.message || ""));
    Object.assign(it, data[0]); it.url = await photoUrl(it);
    close(); paint();
    $("#owner-msg").textContent = (cutNow(it) === "quick" ? "Quick" : "Refined") + " cut is showing for " + it.name + ".";
  });
  document.body.appendChild(box);
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
    state.edit = true; state.draft = e.target.closest("[data-act]").dataset.section;
    if (view !== "list") { view = "list"; history.replaceState(null, "", "#list"); }   // adding is a row form: from the image view, hop to the list view to fill it in
    paintNow();   // not kept in place: the new row's box gets the cursor and scrolls into view
    return;
  }
  if (act === "edit") { const f = $("#edit-form"); f.hidden = !f.hidden; }
  if (act === "add") {
    e.preventDefault();
    const f = $("#add-form"), sec = e.target.closest("[data-act]").dataset.section;
    if (sec) { $("#ad-section").value = sec; $("#ad-fields").innerHTML = fieldsHtml(sec); }
    f.hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); $("#ad-name").focus({ preventScroll: true });
  }
  if (act === "up" || act === "down") {   // reorder within a section
    const it = state.items.find((i) => i.id === e.target.closest(".el-row").dataset.id);
    if (!it) return;
    const sec = state.items.filter((i) => i.section === it.section), a = sec.indexOf(it), b = a + (act === "up" ? -1 : 1);
    if (b < 0 || b >= sec.length) return;
    [sec[a], sec[b]] = [sec[b], sec[a]];
    const changed = [];
    sec.forEach((x, n) => { if (x.position !== n + 1) { x.position = n + 1; changed.push(x); } });
    state.items.sort((x, y) => ORDER.indexOf(x.section) - ORDER.indexOf(y.section) || (x.position || 0) - (y.position || 0));
    paint(`.el-row[data-id="${it.id}"]`);   // the row you moved stays under your cursor
    const res = await Promise.all(changed.map((x) => sb.from("collection_items").update({ position: x.position }).eq("id", x.id)));
    $("#owner-msg").textContent = res.some((r) => r.error) ? "Couldn't save the new order. Refresh and try again." : "Order saved.";
    return;
  }
  if (act === "main") {   // choose the photo shown when someone hovers your name on the Users page (one per person)
    e.preventDefault();
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (!it) return;
    const makeMain = !it.details?.main, touched = [];
    for (const x of state.items) {
      if (x === it) { const d = { ...(x.details || {}) }; if (makeMain) d.main = true; else delete d.main; touched.push([x, d]); }
      else if (makeMain && x.details?.main) { const d = { ...x.details }; delete d.main; touched.push([x, d]); }   // only one main at a time
    }
    const res = await Promise.all(touched.map(([x, d]) => sb.from("collection_items").update({ details: d }).eq("id", x.id).select()));
    if (res.some((r) => r.error || !r.data?.length)) return (msg.textContent = "Couldn't save that. Try again.");
    res.forEach((r, n) => Object.assign(touched[n][0], r.data[0]));
    paint();
    $("#owner-msg").textContent = makeMain ? `“${it.name}” is now your main. It shows when someone hovers your name on the Users page.` : "Back to showing your first setup.";
    return;
  }
  if (act === "cutview" && state.staff) {   // admin: see both cuts of this photo side by side and pick the one to show
    e.preventDefault();
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (it) openCutPicker(it);
    return;
  }
  if (act === "dl" && state.staff) {   // admin: the photo as they uploaded it (before the cut-out), so it can be cut by hand and put back with Replace
    e.preventDefault();
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    const p = it && (it.source_path || it.image_path);
    if (!p) return;
    let url = p;
    if (!/^https?:/.test(p)) {
      const ext = (p.split(".").pop() || "jpg").toLowerCase();
      const nm = (state.profile.username + "-" + (it.name || "photo")).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) + "." + ext;
      const { data, error } = await sb.storage.from("uploads").createSignedUrl(p, 300, { download: nm });
      if (error || !data?.signedUrl) return (msg.textContent = "Couldn't get the original. " + (error?.message || ""));
      url = data.signedUrl;
    }
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  if (act === "hide" && state.staff) {   // the museum's owner can hide an entry (and bring it back); nothing is deleted
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (!it) return;
    const status = it.status === "removed" ? "approved" : "removed";
    const { data, error } = await sb.from("collection_items").update({ status }).eq("id", id).select("status");
    if (error || !data?.length) return (msg.textContent = "Couldn't change that. " + (error?.message || "not allowed"));
    it.status = data[0].status; paint();
    $("#owner-msg").textContent = status === "removed" ? `“${it.name}” is hidden. Nobody else can see it. Press Show to bring it back.` : `“${it.name}” is showing again.`;
    return;
  }
  if (act === "remove" && !state.staff) {
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (!it || !confirm(`Remove “${it.name}” from your collection?`)) return;
    const { error } = await sb.from("collection_items").delete().eq("id", id);
    if (error) return (msg.textContent = "Couldn't remove it. " + error.message);
    dropFiles(it.image_path, it.source_path, it.image_path_2, it.source_path_2);
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
    const old = inp.value;
    if (kind === "brand" && /\s[x×]\s/i.test(old)) {   // a collab ("Joycult x Independent"): check each brand on its own, keep them all
      const parts = old.split(/\s+[x×]\s+/i).map((p) => canonTerm(kind, p)).filter((r) => r.status !== "empty");
      const joined = parts.map((r) => r.name).join(" x ");
      if (joined !== old) inp.value = joined;
      parts.forEach((r) => {
        if (r.status === "new" && r.name.length >= 3) {
          notes.push(`New ${kind} added: ${r.name}`);
          TERMS[kind].set(tkey(r.name), r.name);
          if (!preview) sb.from("user_terms").insert({ kind, name: r.name }).then(() => {}, () => {});
        }
      });
      continue;
    }
    const r = canonTerm(kind, old);
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
    const file = row.querySelector(".ed-file:not(.ed-file2)").files[0];
    if (file) ({ image_path, source_path } = await uploadPhoto(file, section));
    const file2 = row.querySelector(".ed-file2").files[0];
    let image_path_2 = null, source_path_2 = null;
    if (file2) ({ image_path: image_path_2, source_path: source_path_2 } = await uploadPhoto(file2, section));
    const details = Object.fromEntries([...row.querySelectorAll(".el-in")].filter((el) => el.dataset.k !== "name").map((el) => [el.dataset.k, el.value.trim()]).filter(([, v]) => v));
    const position = state.items.reduce((m, i) => Math.max(m, i.position || 0), 0) + 1;
    const { data, error } = await sb.from("collection_items").insert({ section, name, details, image_path, source_path, image_path_2, source_path_2, position, ...(state.staff ? { user_id: state.profile.id } : {}) }).select().single();
    if (error) { dropFiles(image_path, source_path, image_path_2, source_path_2); throw error; }
    data.url = await photoUrl(data); data.url2 = await photoUrl2(data);
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
app.addEventListener("change", (e) => { if (e.target.id === "skip-cut") state.skipCut = e.target.checked; });
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
  if (e.target.classList.contains("ed-file2")) {   // a second photo for an item that is already there
    if (state.profile.id === "sample") return (msg.textContent = "This is a preview. Nothing is saved here.");
    const it2 = state.items.find((i) => i.id === e.target.closest("[data-id]").dataset.id);
    if (!it2) return;
    msg.textContent = "Uploading the second photo…";
    try {
      const nu = await uploadPhoto(file, it2.section);
      const { data, error } = await sb.from("collection_items").update({ image_path_2: nu.image_path, source_path_2: nu.source_path }).eq("id", it2.id).select();
      if (error || !data?.length) { dropFiles(nu.image_path, nu.source_path); throw error || new Error("not saved"); }
      dropFiles(it2.image_path_2, it2.source_path_2);
      Object.assign(it2, data[0]); it2.url = await photoUrl(it2); it2.url2 = await photoUrl2(it2);
      paint(); $("#owner-msg").textContent = "Second photo saved.";
    } catch (err) { msg.textContent = "Couldn't save that photo. " + (err.message || err); }
    return;
  }
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
  const self = session?.user.id === profile.id;
  let isAdmin = false;   // the museum's owner (admin or editor) can fix anyone's entries
  if (session) { const { data: me } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle(); isAdmin = ["admin", "editor"].includes(me?.role); }
  const staff = isAdmin && !self;
  const owner = self || staff;
  const { data: items } = await sb.from("collection_items").select("*").eq("user_id", profile.id).order("section").order("position").order("created_at");
  const rows = (items || []).filter((i) => staff || i.status !== "removed");   // hidden entries show only to the museum's owner
  await loadRecuts();
  await Promise.all(rows.map(async (i) => { i.url = await photoUrl(i); i.url2 = i.image_path_2 ? await photoUrl2(i) : ""; }));
  state = { profile, items: rows, owner, staff, isAdmin, viewer: session?.user.id };
  await loadFavs();
  paint();
}

load().catch((err) => { console.error(err); app.innerHTML = `<p class="p-empty">Couldn't load this page. Please refresh.</p>`; });
})();
