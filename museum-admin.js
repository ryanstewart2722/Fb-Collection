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
  misc: { one: "misc object", fields: [["brand_id", "Brand", "brand"], ["extra_brand_ids", "Second brand", "morebrands", "For collabs: shows as “first brand x second brand”."], ["name", "Object name"], ["color", "Color", "text", "Primary color first, then secondary, joined with / (e.g. White/Black). Capitals are added for you."], ["material", "Material", "text", "e.g. Metal, Corduroy"], ["size", "Size", "text", "e.g. 4in"], ["release", "Release date", "release"], ["description", "Description", "textarea"]],
            slug: (v, b) => `${v.name} ${v.color || ""} ${b}` },
  brands: { one: "brand", fields: [["name", "Brand name"], ["made_in", "Made in", "text", "e.g. Chicago, IL"], ["website", "Website"], ["notes", "Notes", "textarea"]],
            slug: (v) => v.name },
};

let brands = [];
const TAB_KEY = "moms-editor-tab";   // the page you were on comes back after a refresh
const savedTab = () => { try { const t = localStorage.getItem(TAB_KEY); return document.querySelector(`.ad-tabs [data-tab="${t}"]`) ? t : "decks"; } catch { return "decks"; } };
const rememberTab = (t) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* private window */ } };
let tab = savedTab();
let list = { rows: [], total: 0, search: "", brand: "", photo: "", tab: "", sort: (() => { try { return localStorage.getItem("me-sort") === "added" ? "added" : "release"; } catch { return "release"; } })() };
let fromReview = false;   // the entry being edited was just added from the Review tab
let editing = null;   // row being edited ({} for a new one), or null when showing the list
let photo2 = null, target = 1, drop2 = false;   // second photo (shown below the first on the board page)
let photo = null;     // new photo waiting to upload: { blob, ext, preview }
let formDirty = false;
let selMode = false, sel = new Set();   // quick select: tick several entries, then delete them or move them to another section
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
  list.tab = tab;
  const added = list.sort === "added";   // "Recently added": newest first, whatever the release date
  let q = tab === "brands"
    ? sb.from("brands").select("*", { count: "exact" }).order(...(added ? ["created_at", { ascending: false }] : ["name"]))
    : added ? sb.from(tab).select("*,brands(name)", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false })
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
let listY = 0;   // where the list was scrolled to when an entry was opened, so Back / Save lands you there again
function renderList() {   // redraw the list without the page jumping (coming back from an entry returns to where you were)
  const fromForm = !app.querySelector(".me-toolbar");
  if (!fromForm) return window.momsKeepScroll ? window.momsKeepScroll(app, renderListNow) : renderListNow();
  renderListNow();
  window.scrollTo({ top: listY, behavior: "instant" });
  requestAnimationFrame(() => window.scrollTo({ top: listY, behavior: "instant" }));
}
function renderListNow() {
  const t = TYPES[tab];
  const year = (r) => (r.release_date ? r.release_date.slice(0, 4) : "");
  app.innerHTML = `
    <div class="me-toolbar">
      <input id="search" type="search" placeholder="Search ${tab}…" value="${esc(list.search)}">
      ${tab === "brands" ? "" : `<select id="photo-filter" aria-label="Filter by photo"><option value="">All boards</option><option value="without" ${list.photo === "without" ? "selected" : ""}>No photo yet</option><option value="with" ${list.photo === "with" ? "selected" : ""}>Has a photo</option></select>`}
      ${tab === "brands" ? "" : `<select id="brand-filter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map((b) => `<option value="${b.id}" ${String(b.id) === String(list.brand) ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`}
      <select id="sort-by" aria-label="Sort"><option value="release" ${list.sort === "release" ? "selected" : ""}>${tab === "brands" ? "A to Z" : "By release date"}</option><option value="added" ${list.sort === "added" ? "selected" : ""}>Recently added</option></select>
      ${tab === "brands" ? "" : `<button class="ad-btn${selMode ? " ad-btn-dark" : ""}" data-act="sel-toggle">${selMode ? "Done selecting" : "Select"}</button>`}
      <button class="ad-btn ad-btn-dark" data-act="new">+ Add ${t.one}</button>
    </div>
    <p class="me-count">${list.total} ${list.total === 1 ? t.one : tab}${tab === "brands" ? "" : `<span class="me-views"><button class="ad-link${view === "list" ? " on" : ""}" data-act="view-list">List</button> / <button class="ad-link${view === "images" ? " on" : ""}" data-act="view-images">Images</button></span>`}</p>
    ${view === "images" && tab !== "brands" ? `<div class="me-grid">
      ${list.rows.map((r, i) => `<div class="me-card${sel.has(r.id) ? " picked" : ""}" data-i="${i}">
        <button class="me-card-img${r.image_path ? "" : " none"}" data-act="open" title="Open ${esc(r.name)}">${r.image_path ? `<img src="${esc(r.image_path)}" alt="${esc(r.name)}" loading="lazy">` : `<span>No photo yet</span>`}</button>
        <span class="me-card-name">${esc(momsDeckName(r))}</span>
        ${r.image_path ? `<button class="ad-btn me-card-rot" data-act="rotate-card">Rotate 180°</button>` : `<button class="ad-btn me-card-rot" data-act="open">Add photo</button>`}
      </div>`).join("") || `<p class="me-empty">Nothing here.</p>`}
    </div>` : `<div class="me-list">
      ${list.rows.map((r, i) => `<button class="me-item${sel.has(r.id) ? " picked" : ""}" data-i="${i}">
        ${tab === "brands" ? "" : `<span class="me-thumb">${r.image_path ? `<img src="${esc(r.image_path)}" alt="" loading="lazy">` : ""}</span>`}
        <span class="me-name">${esc(momsDeckName(r))}${r.color ? ` <em>${esc(r.color)}</em>` : ""}</span>
        <span class="me-meta">${esc(tab === "brands" ? r.made_in : [r.brands?.name, year(r), !r.image_path && "no photo: not on the site yet"].filter(Boolean).join(" · "))}</span>
      </button>`).join("") || `<p class="me-empty">Nothing here yet.</p>`}
    </div>`}
    ${selMode && tab !== "brands" ? `<div class="me-selbar" id="me-selbar"><span id="me-selcount"></span> <button class="ad-btn" data-act="sel-all">Select all shown</button> <button class="ad-btn" data-act="sel-none">Clear</button> <select id="me-moveto" aria-label="Move to"><option value="">Move to…</option>${Object.keys(TYPES).filter((k) => k !== "brands" && k !== tab).map((k) => `<option value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join("")}</select> <button class="ad-btn" data-act="sel-move">Move</button> <button class="ad-btn me-danger" data-act="sel-delete">Delete</button></div>` : ""}
    ${list.rows.length < list.total ? `<button class="ad-btn" data-act="more">Show more</button> <button class="ad-btn" data-act="all">View all (${list.total - list.rows.length} more)</button>` : ""}`;

  paintSel();
  $("#photo-filter")?.addEventListener("change", (e) => {
    list.photo = e.target.value;
    loadList().then(renderList).catch(fail("Couldn't load"));
  });
  $("#sort-by")?.addEventListener("change", (e) => {
    list.sort = e.target.value;
    try { localStorage.setItem("me-sort", list.sort); } catch {}
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

function extraRow(selected) {   // one more brand on the same board: type a name or pick one
  const name = brands.find((b) => b.id === selected)?.name || "";
  return `<div class="me-extra"><input data-x list="me-brands" placeholder="Type or pick a brand" value="${esc(name)}" autocomplete="off"><button type="button" class="ad-btn" data-act="rm-extra" title="Remove this brand">×</button></div>`;
}

function fieldHtml([key, label, kind = "text", hint = ""], r) {
  const val = r[key] ?? "";
  let input;
  if (kind === "textarea") input = `<textarea data-f="${key}" rows="4">${esc(val)}</textarea>`;
  else if (kind === "morebrands") return `<div class="ad-field"><span>${label}</span><div class="me-extras">${(r.extra_brand_ids || []).map((id) => extraRow(id)).join("")}</div><button type="button" class="ad-btn" data-act="add-extra">+ Add another brand</button>${hint ? `<small>${hint}</small>` : ""}</div>`;
  else if (kind === "molds") input = `<input data-f="molds" value="${esc((r.molds || []).join(", "))}">`;
  else if (kind === "brand") input = `<input data-f="brand_name" list="me-brands" placeholder="Type or pick a brand" value="${esc(brands.find((b) => b.id === r.brand_id)?.name || "")}" autocomplete="off">
    <datalist id="me-brands">${brands.map((b) => `<option value="${esc(b.name)}"></option>`).join("")}</datalist>`;
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

// Previous / Next while editing: walks the list you opened this from (or, right after adding from Review, goes back for the next one)
function navHtml() {
  if (!editing || !editing.id) return "";
  if (fromReview) return `<span class="me-step"><button class="ad-link" data-act="next-review">Next in review →</button></span>`;
  const i = list.tab === tab ? list.rows.findIndex((x) => x.id === editing.id) : -1;
  if (i < 0) return "";
  const more = list.rows.length < list.total;
  return `<span class="me-step">${i > 0 ? `<button class="ad-link" data-act="prev">← Previous</button>` : `<span class="me-off">← Previous</span>`}
    <span class="me-pos">${i + 1} of ${list.total}</span>
    ${i < list.rows.length - 1 || more ? `<button class="ad-link" data-act="next">Next →</button>` : `<span class="me-off">Next →</span>`}</span>`;
}
async function stepTo(dir) {
  if (!leaveForm()) return;
  let i = list.rows.findIndex((x) => x.id === editing.id) + dir;
  try {
    if (i >= list.rows.length && list.rows.length < list.total) { setStatus("Loading…"); await loadList(false); setStatus(""); }
  } catch (err) { return fail("Couldn't load")(err); }
  if (i < 0 || i >= list.rows.length) return;
  editing = { ...list.rows[i] }; photo = null; photo2 = null; drop2 = false;
  setStatus("");
  renderForm();
}
function renderForm() {
  const t = TYPES[tab];
  const r = editing;
  const isNew = !r.id;
  const img = photo?.preview || r.image_path;
  app.innerHTML = `
    <div class="me-nav">
      <button class="ad-link me-back" data-act="back">${fromReview ? "← Back to review" : `← All ${tab}`}</button>
      ${navHtml()}
    </div>
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
  if (!isNew && USE_SECS[tab]) loadInUse().catch(fail("Couldn't load who uses this"));
}

/* ---------- In use: the collection items (setups, decks) shown on this product's page; add or remove them here ---------- */
const USE_SECS = { decks: ["decks", "setups"], wheels: ["wheels", "setups"], trucks: ["trucks", "setups"], obstacles: ["obstacles"], misc: ["misc"] };
let inusePeople = null;
async function loadInUse() {
  const type = tab, id = editing.id, secs = USE_SECS[type];
  let box = document.getElementById("inuse");
  if (!box) { box = document.createElement("section"); box.id = "inuse"; box.className = "me-inuse"; app.appendChild(box); }
  box.innerHTML = `<h3>In use</h3><p class="me-count">Loading…</p>`;
  const { data: rows, error } = await sb.from("collection_item_links").select("link_status,created_at,item:collection_items!inner(id,section,name,image_path,profiles(username))").eq("museum_type", type).eq("museum_id", id).order("created_at");
  if (error) throw error;
  const items = (rows || []).filter((l) => l.item).map((l) => ({ ...l.item, link_status: l.link_status }));
  if (tab !== type || editing?.id !== id) return;   // moved on while loading
  const paths = (items || []).map((i) => i.image_path).filter((p) => p && !/^https?:/.test(p));
  const urls = {};
  if (paths.length) (await sb.storage.from("uploads").createSignedUrls(paths, 3600)).data?.forEach((u) => (urls[u.path] = u.signedUrl));
  if (!inusePeople) inusePeople = (await sb.from("profiles").select("id,username").order("username")).data || [];
  const label = { decks: "Deck", setups: "Setup", wheels: "Wheels", trucks: "Trucks", obstacles: "Obstacle", misc: "Misc." };
  box.innerHTML = `<h3>In use</h3>
    <p class="me-hint">Decks${secs.includes("decks") ? " and setups" : "'s setups"} from people's collections that show under this product's “In Use”. Add one yourself (no review needed) or remove one.</p>
    <div class="me-inuse-list">${(items || []).map((i) => `<div class="me-inuse-item" data-id="${esc(i.id)}">
      <div class="me-lk-img">${(/^https?:/.test(i.image_path || "") ? i.image_path : urls[i.image_path]) ? `<img src="${esc(/^https?:/.test(i.image_path || "") ? i.image_path : urls[i.image_path])}" alt="">` : "<span>No photo</span>"}</div>
      <b>${esc(i.name)}</b><span>${esc(label[i.section] || i.section)} · <a href="/u/${esc(i.profiles?.username || "")}" target="_blank" rel="noopener">${esc(i.profiles?.username || "?")}</a>${i.link_status === "pending" ? " · <em>waiting for approval</em>" : ""}</span>
      <button class="ad-btn me-danger" data-act="iu-rm">Remove</button></div>`).join("") || `<p class="me-empty">Nobody has added this yet.</p>`}</div>
    <div class="me-inuse-add">
      <select id="iu-person"><option value="">Add from someone's collection…</option>${inusePeople.map((p) => `<option value="${esc(p.id)}">${esc(p.username)}</option>`).join("")}</select>
      <select id="iu-item" hidden></select>
      <button class="ad-btn ad-btn-dark" data-act="iu-add" hidden>Add to this product</button>
    </div>`;
}
document.addEventListener("change", async (e) => {
  if (e.target.id !== "iu-person") return;
  const item = $("#iu-item"), add = document.querySelector("[data-act='iu-add']");
  item.hidden = add.hidden = true;
  if (!e.target.value) return;
  const { data } = await sb.from("collection_items").select("id,section,name,links:collection_item_links(museum_type,museum_id)").eq("user_id", e.target.value).in("section", USE_SECS[tab]).neq("status", "removed").order("section").order("name");
  const names = { decks: "Deck", setups: "Setup", wheels: "Wheels", trucks: "Trucks", obstacles: "Obstacle", misc: "Misc." };
  const opts = (data || []).filter((m) => !(m.links || []).some((l) => l.museum_type === tab && l.museum_id === editing.id));
  item.innerHTML = opts.length ? opts.map((m) => `<option value="${esc(m.id)}">${USE_SECS[tab].length > 1 ? esc(names[m.section]) + " · " : ""}${esc(m.name)}</option>`).join("") : `<option value="">Nothing to add</option>`;
  item.hidden = false; add.hidden = !opts.length;
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act='iu-add'],[data-act='iu-rm']");
  if (!b || !editing?.id) return;
  b.disabled = true;
  const rm = b.dataset.act === "iu-rm";
  const id = rm ? b.closest(".me-inuse-item").dataset.id : $("#iu-item").value;
  if (!id) return (b.disabled = false);
  const { error } = rm   // the museum's staff skip the review
    ? await sb.from("collection_item_links").delete().eq("item_id", id).eq("museum_type", tab).eq("museum_id", editing.id)
    : await sb.from("collection_item_links").insert({ item_id: id, museum_type: tab, museum_id: editing.id });
  b.disabled = false;
  if (error) return setStatus("Couldn't save that: " + error.message, true);
  setStatus(rm ? "Removed." : "Added. It shows under “In Use” on the product page.");
  loadInUse().catch(fail("Couldn't reload"));
});

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
    if (!v.brand_name) return setStatus("Please type or pick a brand.", true);

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
    if (tab !== "brands") row.brand_id = await brandIdFor(v.brand_name);
    if (tab !== "brands") {   // other brands on the same board
      const ids = [];
      for (const el of app.querySelectorAll(".me-extra")) {
        const nn = el.querySelector("[data-x]").value.trim();
        if (!nn) continue;
        const id = await brandIdFor(nn);
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
    const li = list.tab === tab ? list.rows.findIndex((x) => x.id === saved.id) : -1;
    if (li >= 0) list.rows[li] = { ...list.rows[li], ...saved };   // so Previous / Next and the list show what you just saved
    if (fromReview) {   // finished reviewing this one: straight back to the Review page
      fromReview = false; editing = null; photo = null; photo2 = null; drop2 = false;
      document.querySelectorAll(".ad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === "review"));
      tab = "review"; rememberTab(tab); window.scrollTo({ top: 0, behavior: "instant" });
      await renderReview().catch(fail("Couldn't load the review list"));
      return setStatus("Saved ✓ It's live on the museum now.");
    }
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
    for (const t of ["decks", "trucks", "wheels", "obstacles", "misc"]) {
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
const PHOTO_SIZE = { decks: [529, 1200], trucks: [800, 800], wheels: [800, 800], obstacles: [800, 800], misc: [800, 800] };

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

/* ---------- Quick select: delete several, or move them to another section ---------- */
function paintSel() { const c = $("#me-selcount"); if (c) c.textContent = sel.size ? `${sel.size} selected` : "Tap entries to select them"; }
const COMMON = ["brand_id", "name", "color", "release_date", "release_precision", "description", "image_path", "image_path_2", "extra_brand_ids", "attributes", "extra_images"];
const HAS_SIZE = new Set(["decks", "trucks", "obstacles", "misc"]), HAS_MAT = new Set(["wheels", "obstacles", "misc"]);
async function selDelete() {
  const ids = [...sel]; if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "entry" : "entries"} from ${tab}? This can't be undone.`)) return;
  setStatus("Deleting…");
  const rows = list.rows.filter((r) => sel.has(r.id));
  const { data, error } = await sb.from(tab).delete().in("id", ids).select("id");
  if (error) return setStatus("Couldn't delete: " + friendly(error), true);
  const gone = new Set((data || []).map((d) => d.id));
  const done = [...gone];
  if (done.length) {   // tidy up what pointed at them
    await sb.from("collection_item_links").delete().eq("museum_type", tab).in("museum_id", done).then(() => {}, () => {});
    await sb.from("favorites").delete().eq("museum_type", tab).in("museum_id", done).then(() => {}, () => {});
    for (const r of rows) if (gone.has(r.id)) await removeOurPhoto(r.image_path).catch(() => {});
  }
  sel = new Set([...sel].filter((i) => !gone.has(i)));
  setStatus(`Deleted ${done.length}${done.length < ids.length ? ` (${ids.length - done.length} couldn't be deleted: not allowed)` : ""}.`);
  await loadList(); renderList();
}
async function selMove() {
  const to = $("#me-moveto")?.value, ids = [...sel];
  if (!ids.length) return setStatus("Select some entries first.", true);
  if (!to) return setStatus("Choose where to move them first.", true);
  if (!confirm(`Move ${ids.length} ${ids.length === 1 ? "entry" : "entries"} from ${tab} to ${to}? Details that ${to} doesn't have (like mold or duro) are left behind.`)) return;
  const rows = list.rows.filter((r) => sel.has(r.id)); let moved = 0;
  for (const r of rows) {
    setStatus(`Moving ${moved + 1} of ${rows.length}…`);
    try {
      const row = {}; COMMON.forEach((k) => { if (r[k] !== undefined) row[k] = r[k]; });
      if (HAS_SIZE.has(tab) && HAS_SIZE.has(to) && r.size != null) row.size = r.size;
      if (HAS_MAT.has(tab) && HAS_MAT.has(to) && r.material != null) row.material = r.material;
      if (tab === "wheels" && to === "wheels") row.duro = r.duro;
      const made = await insertWithSlug(to, row, `${r.name} ${r.color || ""} ${r.brands?.name || ""}`);
      await sb.from("collection_item_links").update({ museum_type: to, museum_id: made.id }).eq("museum_type", tab).eq("museum_id", r.id).then(() => {}, () => {});
      await sb.from("favorites").update({ museum_type: to, museum_id: made.id }).eq("museum_type", tab).eq("museum_id", r.id).then(() => {}, () => {});
      const del = await sb.from(tab).delete().eq("id", r.id).select("id");
      if (del.error || !del.data?.length) { await sb.from(to).delete().eq("id", made.id); throw del.error || new Error("not allowed"); }
      sel.delete(r.id); moved++;
    } catch (err) { setStatus(`Moved ${moved}. Stopped at “${r.name}”: ${friendly(err)}`, true); await loadList(); return renderList(); }
  }
  setStatus(`Moved ${moved} to ${to}.`);
  await loadList(); renderList();
}

function leaveForm() {
  return !editing || !(formDirty || photo || photo2) || confirm("Leave without saving your changes?");
}

app.addEventListener("input", (e) => {
  if (e.target.closest(".me-form")) formDirty = true;
});
app.addEventListener("click", async (e) => {
  if (selMode && tab !== "brands" && !editing && !e.target.closest("#me-selbar, .me-toolbar, .me-views, [data-act='more'], [data-act='all']")) {   // quick select: a click ticks the entry instead of opening it
    const c = e.target.closest(".me-item, .me-card");
    if (c) { e.preventDefault(); const id = list.rows[c.dataset.i]?.id; if (id != null) { sel.has(id) ? sel.delete(id) : sel.add(id); c.classList.toggle("picked", sel.has(id)); paintSel(); } return; }
  }
  {
    const sa = e.target.closest("[data-act]")?.dataset.act;
    if (sa === "sel-toggle") { selMode = !selMode; if (!selMode) sel.clear(); return renderList(); }
    if (sa === "sel-all") { list.rows.forEach((r) => sel.add(r.id)); return renderList(); }
    if (sa === "sel-none") { sel.clear(); return renderList(); }
    if (sa === "sel-delete") return selDelete();
    if (sa === "sel-move") return selMove();
  }
  const card = e.target.closest(".me-card");
  if (card) {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "rotate-card") return rotateCard(card);
    if (a === "open") { listY = window.scrollY; fromReview = false; editing = { ...list.rows[card.dataset.i] }; photo = null; photo2 = null; drop2 = false; return renderForm(); }
  }
  const item = e.target.closest(".me-item");
  if (item) {
    listY = window.scrollY; fromReview = false;
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
  if (act === "new") { fromReview = false; editing = {}; photo = null; photo2 = null; drop2 = false; renderForm(); }
  if (act === "prev") stepTo(-1);
  if (act === "next") stepTo(1);
  if ((act === "next-review" || (act === "back" && fromReview)) && leaveForm()) {
    fromReview = false; editing = null; photo = null; photo2 = null; drop2 = false; setStatus("");
    document.querySelectorAll(".ad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === "review"));
    tab = "review"; rememberTab(tab); renderReview().catch(fail("Couldn't load the review list")); window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
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
  tab = b.dataset.tab; fromReview = false; rememberTab(tab); sel.clear();
  editing = null; photo = null; list.search = ""; list.brand = ""; list.photo = "";
  document.querySelectorAll(".ad-tabs button").forEach((x) => x.classList.toggle("active", x === b));
  setStatus("");
  if (tab === "review") return renderReview().catch(fail("Couldn't load the review list"));
  if (tab === "links") return renderLinks().catch(fail("Couldn't load the product links"));
  if (tab === "molds") return renderMolds().catch(fail("Couldn't load the molds"));
  await loadList().catch(fail("Couldn't load"));
  renderListNow(); listY = 0; window.scrollTo({ top: 0, behavior: "instant" });   // a different tab starts at the top
}));


/* ---------- Product links: "this item in my collection is that museum product" (kept apart from Review) ---------- */
let linkItems = [];
const setLinksBadge = (n) => { const b = $("#links-n"); if (b) { b.textContent = n; b.hidden = !n; } };
async function renderLinks() {
  app.innerHTML = `<p class="me-count">Loading…</p>`;
  const { data, error } = await sb.from("collection_item_links").select("museum_type,museum_id,created_at,item:collection_items!inner(id,section,name,image_path,source_path,details,created_at,profiles(username))").eq("link_status", "pending").order("created_at");
  if (error) throw error;
  linkItems = (data || []).filter((l) => l.item).map((l) => ({ ...l.item, museum_type: l.museum_type, museum_id: l.museum_id }));
  const byType = {};
  linkItems.forEach((i) => (byType[i.museum_type] ||= new Set()).add(i.museum_id));
  const prods = {};
  await Promise.all(Object.entries(byType).map(async ([t, ids]) => {
    const { data: rows } = await sb.from(t).select("*,brands(name)").in("id", [...ids]);
    (rows || []).forEach((r) => (prods[t + ":" + r.id] = r));
  }));
  const paths = linkItems.map((i) => i.image_path).filter((p) => p && !/^https?:/.test(p));
  const urls = {};
  if (paths.length) (await sb.storage.from("uploads").createSignedUrls(paths, 3600)).data?.forEach((u) => (urls[u.path] = u.signedUrl));
  let index = {};
  try { const r = await fetch("/user-cuts/index.json?" + Date.now()); if (r.ok) index = await r.json(); } catch { /* quick cuts only */ }
  linkItems.forEach((i) => {
    const e = index[i.id];
    i.url = e && e.file && !e.bad && i.source_path && e.src === i.source_path && i.details?.cut !== "quick" ? "/" + e.file : /^https?:/.test(i.image_path || "") ? i.image_path : urls[i.image_path] || "";
    i.prod = prods[i.museum_type + ":" + i.museum_id];
  });
  setLinksBadge(linkItems.length);
  const kind = { decks: "Deck", setups: "Setup", wheels: "Wheels", trucks: "Trucks", obstacles: "Obstacle", misc: "Misc." };
  const LABEL = { trucks: "Trucks", wheels: "Wheels", maker: "Manufacturer", mold: "Mold", size: "Size", color: "Color", material: "Material", duro: "Duro", year: "Year" };
  const facts = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `<div class="me-lk-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  app.innerHTML = `<p class="me-count">${linkItems.length} product link${linkItems.length === 1 ? "" : "s"} waiting</p><div class="me-lk-list">` + (linkItems.map((i, n) => {
    const who = i.profiles?.username || "someone", p = i.prod;
    const when = p?.release_date ? String(p.release_date).slice(0, p.release_precision === "year" ? 4 : 7) : "";
    const prodName = p ? [p.brands?.name, p.name].filter(Boolean).join(" · ") : "(product not found)";
    const mine = i.section === "setups"
      ? facts([["Deck", i.name], ...["trucks", "wheels"].map((k) => [LABEL[k], i.details?.[k]]), ["Size", i.details?.size]])
      : facts([["Name", i.name], ...["maker", "mold", "size", "color"].map((k) => [LABEL[k], i.details?.[k]])]);
    return `<article class="me-lk" data-i="${n}">
      <div class="me-lk-boxes">
        <section class="me-lk-box">
          <h3>The ${esc({ decks: "deck", wheels: "wheels", trucks: "trucks", obstacles: "obstacle", misc: "item" }[i.museum_type] || "product")} in the museum</h3>
          <div class="me-lk-img">${p?.image_path ? `<img src="${esc(p.image_path)}" alt="">` : "<span>No photo</span>"}</div>
          <div class="me-lk-facts">${facts([["Name", prodName], ["Color", p?.color], ["Shape", p?.shape], ["Size", p?.size], ["Released", when]])}
            ${p ? `<a href="board.html?type=${esc(i.museum_type)}&slug=${esc(p.slug)}" target="_blank" rel="noopener">Open its museum page ↗</a>` : ""}</div>
        </section>
        <section class="me-lk-box">
          <h3>${esc(kind[i.section] || i.section)} from <a href="/u/${esc(who)}" target="_blank" rel="noopener">${esc(who)}</a>'s collection</h3>
          <div class="me-lk-img">${i.url ? `<img src="${esc(i.url)}" alt="">` : "<span>No photo</span>"}</div>
          <div class="me-lk-facts">${mine}</div>
        </section>
      </div>
      <div class="me-lk-act"><button class="ad-btn ad-btn-dark" data-act="lk-ok">Approve link</button> <button class="ad-btn me-danger" data-act="lk-no">Reject</button></div>
    </article>`;
  }).join("") || `<p class="me-empty">No product links waiting.</p>`) + `</div>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act='lk-ok'],[data-act='lk-no']");
  if (!b) return;
  const card = b.closest(".me-lk"), it = card && linkItems[card.dataset.i];
  if (!it) return;
  b.disabled = true;
  const ok = b.dataset.act === "lk-ok";
  const link = sb.from("collection_item_links");
  const { error } = await (ok ? link.update({ link_status: "approved" }) : link.delete()).eq("item_id", it.id).eq("museum_type", it.museum_type).eq("museum_id", it.museum_id);
  if (error) { b.disabled = false; return setStatus("Couldn't save that: " + error.message); }
  linkItems[card.dataset.i] = null; card.remove();
  setLinksBadge(linkItems.filter(Boolean).length);
  setStatus(ok ? "Link approved. It now shows under the product." : "Link rejected.");
});

/* ---------- Molds: every mold name in use, to rename or merge ---------- */
// Molds are plain text on each deck (museum decks keep a list, collection decks one name), so this gathers them all,
// shows how many boards use each spelling, and lets you rename one or merge it into another everywhere at once.
let moldRows = [];   // [{ name, museum: [deck rows], coll: [collection rows] }]
async function allRows(make) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function renderMolds() {
  app.innerHTML = `<p class="me-count">Loading…</p>`;
  const [decks, items] = await Promise.all([
    allRows(() => sb.from("decks").select("id,molds").order("id")),
    allRows(() => sb.from("collection_items").select("id,details").eq("section", "decks").order("id")),
  ]);
  const by = new Map();
  const slot = (n) => by.get(n) || by.set(n, { name: n, museum: [], coll: [] }).get(n);
  decks.forEach((d) => (d.molds || []).forEach((m) => { if (m && m.trim()) slot(m).museum.push(d); }));
  items.forEach((i) => { const m = (i.details?.mold || "").trim(); if (m) slot(m).coll.push(i); });
  moldRows = [...by.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name));
  drawMolds();
}
function drawMolds(open) { window.momsKeepScroll ? window.momsKeepScroll(app, () => drawMoldsNow(open)) : drawMoldsNow(open); }
function drawMoldsNow(open) {
  const names = moldRows.map((m) => m.name);
  app.innerHTML = `<p class="me-count">${moldRows.length} molds. Rename fixes a spelling everywhere; Merge moves everything from one mold into another.</p><div class="me-molds">` +
    moldRows.map((m, i) => `<div class="me-mold" data-i="${i}">
      <span class="me-name"><b>${esc(m.name)}</b></span>
      <span class="me-meta">${m.museum.length} in the museum · ${m.coll.length} in collections</span>
      ${open === i ? `<span class="me-mold-edit"><input class="me-mold-in" value="${esc(m.name)}" maxlength="60"> <button class="ad-btn ad-btn-dark" data-act="mold-save">Save</button> <button class="ad-btn" data-act="mold-cancel">Cancel</button></span>`
        : `<span class="me-mold-edit"><button class="ad-btn" data-act="mold-rename">Rename</button>
        <select class="me-mold-merge" aria-label="Merge ${esc(m.name)} into"><option value="">Merge into…</option>${names.map((n, j) => j === i ? "" : `<option value="${j}">${esc(n)}</option>`).join("")}</select></span>`}
    </div>`).join("") + `</div>`;
  if (open != null) app.querySelector(".me-mold-in")?.select();
}
async function moldReplace(m, to) {
  to = to.trim().replace(/\s+/g, " ");
  if (!to || to === m.name) return;
  const want = moldRows.find((x) => x.name === to);
  const n = m.museum.length + m.coll.length;
  if (want && !confirm(`Merge “${m.name}” into “${to}”? That changes ${n} board${n === 1 ? "" : "s"}.`)) return;
  setStatus("Saving…");
  const jobs = [];
  m.museum.forEach((d) => {
    const next = [...new Set((d.molds || []).map((x) => (x === m.name ? to : x)))];
    jobs.push(sb.from("decks").update({ molds: next }).eq("id", d.id));
  });
  m.coll.forEach((i) => jobs.push(sb.from("collection_items").update({ details: { ...i.details, mold: to } }).eq("id", i.id)));
  const res = await Promise.all(jobs);
  const bad = res.find((r) => r.error);
  if (bad) return setStatus("Couldn't save every board: " + friendly(bad.error), true);
  // the suggestion list people pick from while typing
  try {
    const have = await sb.from("user_terms").select("id").eq("kind", "mold").eq("name", to).limit(1);
    if (have.data?.length) await sb.from("user_terms").delete().eq("kind", "mold").eq("name", m.name);
    else await sb.from("user_terms").update({ name: to }).eq("kind", "mold").eq("name", m.name);
  } catch { /* the suggestion list is optional */ }
  setStatus(want ? `Merged into ${to}.` : `Renamed to ${to}.`);
  await renderMolds();
}
app.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act, row = e.target.closest(".me-mold");
  if (!row || !act?.startsWith("mold-")) return;
  const i = +row.dataset.i;
  if (act === "mold-rename") drawMolds(i);
  if (act === "mold-cancel") drawMolds();
  if (act === "mold-save") moldReplace(moldRows[i], row.querySelector(".me-mold-in").value).catch(fail("Couldn't rename"));
});
app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList.contains("me-mold-in")) return;
  e.preventDefault();
  const row = e.target.closest(".me-mold");
  moldReplace(moldRows[+row.dataset.i], e.target.value).catch(fail("Couldn't rename"));
});
app.addEventListener("change", (e) => {
  if (!e.target.classList.contains("me-mold-merge") || !e.target.value) return;
  const row = e.target.closest(".me-mold");
  moldReplace(moldRows[+row.dataset.i], moldRows[+e.target.value].name).catch(fail("Couldn't merge"));
});

/* ---------- Review: what people uploaded, waiting for you ---------- */
// Photos people upload sit in a private folder. Nothing is public until you approve it here.
let reviewItems = [];
let rvFilter = "all";   // which kind the Review list is showing: all, decks, trucks, wheels, obstacles, misc
function applyReviewFilter() {
  const counts = {};
  reviewItems.forEach((x) => { if (x) counts[x.r.section] = (counts[x.r.section] || 0) + 1; });
  if (rvFilter !== "all" && !counts[rvFilter]) rvFilter = "all";
  document.querySelectorAll(".me-filter button").forEach((b) => b.classList.toggle("active", b.dataset.sec === rvFilter));
  const shown = new Set();   // people with at least one card matching the filters (folded or not)
  document.querySelectorAll(".me-rv").forEach((c) => {
    const match = !((rvFilter !== "all" && c.dataset.sec !== rvFilter) || (rvUser && c.dataset.user !== rvUser));
    if (match) shown.add(c.dataset.user);
    c.hidden = !match || (rvSort === "user" && rvFolded.has(c.dataset.user));
  });
  document.querySelectorAll(".me-rv-user").forEach((h) => {
    h.hidden = !shown.has(h.dataset.user);
    const f = rvFolded.has(h.dataset.user), b = h.querySelector(".me-fold"); if (b) b.textContent = f ? "▸" : "▾";
  });
  const fa = document.getElementById("rv-foldall"); if (fa) fa.hidden = rvSort !== "user";
  document.querySelectorAll(".me-sort button[data-s]").forEach((b) => b.classList.toggle("active", b.dataset.s === rvSort));
  const pick = document.getElementById("rv-userpick"); if (pick) pick.innerHTML = rvUser ? ` Showing only ${esc(rvUser)} <button class="ad-btn" data-act="rv-user" data-user="">Show everyone</button>` : "";
  document.querySelectorAll(".me-bulk button[data-section]").forEach((b) => { b.hidden = rvFilter !== "all" && b.dataset.section !== rvFilter; });
}
const rvFolded = new Set();   // people whose cards are folded away so the others are quicker to reach
let rvSort = "oldest", rvUser = "";   // how the Review list is ordered, and (optionally) one submitter to show
const rvWho = (x) => x.r.profiles?.username || "someone";
// the cards, in the chosen order; "By user" puts each person's submissions together under their name
function rvCards() {
  const order = reviewItems.map((x, i) => ({ x, i })).filter((o) => o.x);
  if (rvSort === "newest") order.reverse();
  if (rvSort === "user") order.sort((a, b) => rvWho(a.x).toLowerCase().localeCompare(rvWho(b.x).toLowerCase()) || a.i - b.i);
  const per = {}; order.forEach(({ x }) => { per[rvWho(x)] = (per[rvWho(x)] || 0) + 1; });
  let last = null;
  return (order.map(({ x, i }) => {
    const head = rvSort === "user" && rvWho(x) !== last ? `<h3 class="me-rv-user" data-user="${esc(rvWho(x))}"><button class="ad-btn me-fold" data-act="rv-fold" data-user="${esc(rvWho(x))}" title="Fold away / open up" aria-label="Fold away or open up ${esc(rvWho(x))}">▾</button> <button class="ad-btn" data-act="rv-user" data-user="${esc(rvWho(x))}">${esc(rvWho(x))} (${per[rvWho(x)]})</button></h3>` : "";
    last = rvWho(x);
    return head + rvCard(x, i);
  }).join("") || `<p class="me-empty">Nothing waiting.</p>`);
}
function rvCard(x, i) {

    const r = x.r, who = r.profiles?.username || "someone";
    const f = x.kind === "item" ? { section: r.section, name: r.name, ...r.details } : { section: r.section, ...r.fields };
    return `<div class="me-rv" data-i="${i}" data-sec="${esc(r.section)}" data-user="${esc(who)}">
      <div class="me-rv-img">${x.url ? `<img src="${esc(x.url)}" alt="">` : `<span>No photo</span>`}${x.url2 ? `<img src="${esc(x.url2)}" alt="" title="Second photo">` : ""}</div>
      <div class="me-rv-info">
        <b>${esc(f.name || "(no name)")}</b> <em>${x.kind === "item" ? "collection · " + esc(r.section) : "museum submission · " + esc(r.section)}</em>
        <span>by <a href="/u/${esc(who)}" target="_blank" rel="noopener">${esc(who)}</a></span>
        <span>${Object.entries(f).filter(([k, v]) => v && !["name", "section"].includes(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span>
        <div class="me-rv-act"><button class="ad-btn ad-btn-dark" data-act="rv-ok">${x.kind === "sub" ? "Add to museum" : "Approve"}</button> <button class="ad-btn me-danger" data-act="rv-no">Reject</button></div>
      </div></div>`;
}
async function renderReview() {
  app.innerHTML = `<p class="me-count">Loading…</p>`;
  const [ci, sub] = await Promise.all([
    sb.from("collection_items").select("*,profiles(username)").in("status", ["pending", "flagged"]).order("created_at"),
    sb.from("submissions").select("*,profiles(username)").in("status", ["pending", "flagged"]).order("created_at"),
  ]);
  if (ci.error) throw ci.error;
  if (sub.error) throw sub.error;
  reviewItems = [...ci.data.map((r) => ({ kind: "item", r })), ...sub.data.map((r) => ({ kind: "sub", r }))];
  const paths = reviewItems.flatMap((x) => [x.r.image_path, x.r.image_path_2]).filter((p) => p && !/^https?:/.test(p));
  const urls = {};
  if (paths.length) (await sb.storage.from("uploads").createSignedUrls(paths, 3600)).data?.forEach((u) => (urls[u.path] = u.signedUrl));
  reviewItems.forEach((x) => { x.url = /^https?:/.test(x.r.image_path || "") ? x.r.image_path : urls[x.r.image_path] || ""; x.url2 = /^https?:/.test(x.r.image_path_2 || "") ? x.r.image_path_2 : urls[x.r.image_path_2] || ""; });
  await useRefinedCuts();
  setReviewBadge(reviewItems.length);
  const subCounts = {}; reviewItems.forEach((x) => { if (x.kind === "sub") subCounts[x.r.section] = (subCounts[x.r.section] || 0) + 1; });
  const bulk = Object.entries(subCounts).map(([sec, n]) => `<button class="ad-btn" data-act="rv-all" data-section="${esc(sec)}">Add all ${esc(sec)} (${n})</button>`).join(" ");
  const secCounts = {}; reviewItems.forEach((x) => { secCounts[x.r.section] = (secCounts[x.r.section] || 0) + 1; });
  const kinds = [["all", "All"], ["decks", "Decks"], ["trucks", "Trucks"], ["wheels", "Wheels"], ["obstacles", "Obstacles"], ["misc", "Misc."]];
  const filterBar = `<p class="me-filter">` + kinds.map(([k, label]) => `<button class="ad-btn" data-act="rv-filter" data-sec="${k}">${label}${k === "all" ? ` (${reviewItems.length})` : secCounts[k] ? ` (${secCounts[k]})` : ""}</button>`).join(" ") + `</p>`;
  const sortBar = `<p class="me-filter me-sort">Sort: ` + [["oldest", "Oldest first"], ["newest", "Newest first"], ["user", "By user"]].map(([k, label]) => `<button class="ad-btn" data-act="rv-sort" data-s="${k}">${label}</button>`).join(" ") + `<span id="rv-foldall" hidden> <button class="ad-btn" data-act="rv-foldall" data-fold="1">Collapse all</button> <button class="ad-btn" data-act="rv-foldall" data-fold="0">Expand all</button></span><span class="me-userpick" id="rv-userpick"></span></p>`;
  app.innerHTML = `<p class="me-count">${reviewItems.length} waiting for review</p>${filterBar}${sortBar}${bulk ? `<p class="me-bulk">${bulk}</p>` : ""}<div class="me-review">${rvCards()}</div>`;
  applyReviewFilter();
}
// A museum submission that came from someone's collection should show (and publish) the better re-cut of that photo, not the first quick one.
async function useRefinedCuts() {
  try {
    const subs = reviewItems.filter((x) => x.kind === "sub" && x.r.image_path && !/^https?:/.test(x.r.image_path));
    if (!subs.length) return;
    const [items, index] = await Promise.all([
      sb.from("collection_items").select("id,image_path,details").in("image_path", subs.map((x) => x.r.image_path)),
      fetch("/user-cuts/index.json?" + Date.now()).then((r) => (r.ok ? r.json() : {})),
    ]);
    const byPath = new Map((items.data || []).map((i) => [i.image_path, i]));
    subs.forEach((x) => {
      const it = byPath.get(x.r.image_path), e = it && index[it.id];
      if (e && e.file && !e.bad && it.details?.cut !== "quick") { x.cutUrl = "/" + e.file; x.url = x.cutUrl; }
    });
  } catch { /* the first photo is still there */ }
}
// What gets saved in the museum: the refined cut copied into our own storage, or the uploaded photo
async function reviewPhoto(x) {
  if (!x.cutUrl) return publishPhoto(x.r.image_path);
  const blob = await (await fetch(x.cutUrl)).blob();
  const path = `refined/${x.r.id}.webp`;
  const up = await sb.storage.from("user-photos").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (up.error) throw up.error;
  return sb.storage.from("user-photos").getPublicUrl(path).data.publicUrl;
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
let brandLock = Promise.resolve();
// One at a time, and always looking at the live list, so clicking quickly can't make the same brand twice.
// An existing brand is reused; otherwise the brand is made with the name exactly as typed.
function brandIdFor(name) {
  const run = brandLock.then(async () => {
    name = String(name || "").trim().replace(/\s+/g, " ");
    const have = (await sb.from("brands").select("id,name")).data || [];
    const hit = sameBrand(have, name);
    if (hit) return hit.id;
    const made = await insertWithSlug("brands", { name }, name);
    brands = [...brands, { id: made.id, name }].sort((a, b) => a.name.localeCompare(b.name));
    return made.id;
  });
  brandLock = run.catch(() => {});
  return run;
}
// Puts one waiting museum submission into the museum (brand found or made, photo published) and marks it approved.
async function addSubmission(x, setStep = () => {}) {
  const r = x.r, f = r.fields, table = r.section;
  setStep("finding or making the brand");
  const brand_id = await brandIdFor(f.brand || "Unknown");
  setStep("copying the photo");
  const row = { brand_id, name: f.name, color: f.color || null, image_path: await reviewPhoto(x) };
  if (table === "decks") { row.size = f.size || null; row.molds = f.mold ? f.mold.split(",").map((m) => m.trim()).filter(Boolean) : []; row.shape = f.shape || null; row.attributes = { source: "Museum submission", submitted_by: r.profiles?.username || null }; }
  if (table === "trucks" || table === "obstacles") row.size = f.size || null;
  if (table === "obstacles" || table === "misc") row.material = f.material || null;
  const yr = parseInt(String(f.year || "").slice(0, 4), 10);
  const ym = String(f.year || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);   // 2022-09 or 2022-09-06 keeps the month (or day)
  if (ym && +ym[2] >= 1 && +ym[2] <= 12) { row.release_date = `${ym[1]}-${ym[2]}-${ym[3] || "01"}`; row.release_precision = ym[3] ? "day" : "month"; }
  else if (yr > 1900 && yr < 2200) { row.release_date = `${yr}-01-01`; row.release_precision = "year"; }   // the year they typed
  if (r.image_path_2) row.image_path_2 = await publishPhoto(r.image_path_2);   // the second photo comes along
  if (table === "wheels") { row.material = f.material || null; row.duro = f.duro || null; }
  setStep(`adding it to ${table}`);
  const made = await insertWithSlug(table, row, `${f.name} ${f.color || ""} ${f.brand || ""}`);
  // when it came from someone's collection, that item is linked to the new museum entry (so it shows under "In Use" and on the item page)
  try {
    if (r.user_id && r.image_path) {
      const found = await sb.from("collection_items").select("id").eq("user_id", r.user_id).neq("status", "removed").or(`image_path.eq.${r.image_path},source_path.eq.${r.image_path}`);
      for (const it of found.data || []) {
        const link = { item_id: it.id, museum_type: table, museum_id: made.id };
        const ins = await sb.from("collection_item_links").insert(link);
        if (!ins.error || /duplicate|unique/i.test(ins.error.message || "")) await sb.from("collection_item_links").update({ link_status: "approved" }).eq("item_id", it.id).eq("museum_type", table).eq("museum_id", made.id);
      }
    }
  } catch (err) { console.warn("could not link the collection item", err); }
  setStep("marking the submission approved");
  const { error } = await sb.from("submissions").update({ status: "approved", review_note: "Added as " + made.slug }).eq("id", r.id);
  if (error) throw error;
  return made;
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
      const table = r.section;
      const made = await addSubmission(x, (t) => (step = t));
      // straight into the editor for the new board, so the rest can be filled in
      reviewItems[card.dataset.i] = null;
      setReviewBadge(reviewItems.filter(Boolean).length);
      tab = table; editing = made; photo = null; photo2 = null; drop2 = false; fromReview = true;
      document.querySelectorAll(".ad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === table));
      renderForm();
      return setStatus("Added to the museum. Fill in the rest and press Save changes.");
    } else {
      const { error } = await sb.from("submissions").update({ status: "rejected" }).eq("id", r.id);
      if (error) throw error;
      if (r.image_path && !/^https?:/.test(r.image_path)) {
        // the same file may still be somebody's collection photo; only delete it if nothing uses it
        const used = await sb.from("collection_items").select("id").eq("image_path", r.image_path).limit(1);
        if (!used.data?.length) await sb.storage.from("uploads").remove([r.image_path]).catch(() => {});
      }
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
// "Add all obstacles": every waiting submission in one section goes into the museum, one at a time. Details can be filled in later from the editor.
async function addAllSubmissions(section, btn) {
  const todo = reviewItems.map((x, i) => ({ x, i })).filter(({ x }) => x && x.kind === "sub" && x.r.section === section);
  if (!todo.length || !confirm(`Add all ${todo.length} waiting ${section} to the museum? Each one goes live as it is.`)) return;
  document.querySelectorAll(".me-bulk button, .me-rv button").forEach((b) => (b.disabled = true));
  let done = 0; const failed = [];
  for (const { x, i } of todo) {
    setStatus(`Adding ${section}… ${done + 1} of ${todo.length}`);
    try {
      await addSubmission(x);
      done++;
      reviewItems[i] = null;
      document.querySelector(`.me-rv[data-i="${i}"]`)?.remove();
    } catch (err) { failed.push(`${x.r.fields?.name || "(no name)"}: ${friendly(err)}`); console.error("bulk add failed", x.r.id, err); }
  }
  const left = reviewItems.filter(Boolean).length;
  setReviewBadge(left);
  const c = $(".me-count"); if (c) c.textContent = `${left} waiting for review`;
  document.querySelectorAll(".me-bulk button, .me-rv button").forEach((b) => (b.disabled = false));
  if (!left) await renderReview();
  setStatus(`Added ${done} of ${todo.length} ${section} to the museum.` + (failed.length ? ` Couldn't add: ${failed.join("; ")}` : ""), !!failed.length);
}
app.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]")?.dataset.act;
  if (a === "rv-sort") { rvSort = e.target.closest("[data-act]").dataset.s; document.querySelector(".me-review").innerHTML = rvCards(); applyReviewFilter(); return; }
  if (a === "rv-fold") { const u = e.target.closest("[data-act]").dataset.user; rvFolded.has(u) ? rvFolded.delete(u) : rvFolded.add(u); applyReviewFilter(); return; }
  if (a === "rv-foldall") { const fold = e.target.closest("[data-act]").dataset.fold === "1"; document.querySelectorAll(".me-rv-user").forEach((h) => (fold ? rvFolded.add(h.dataset.user) : rvFolded.delete(h.dataset.user))); applyReviewFilter(); return; }
  if (a === "rv-user") { const u = e.target.closest("[data-act]").dataset.user; rvUser = rvUser === u ? "" : u; if (rvUser) rvFolded.delete(rvUser); applyReviewFilter(); return; }
  if (a === "rv-filter") { rvFilter = e.target.closest("[data-act]").dataset.sec; applyReviewFilter(); return; }
  if (a === "rv-all") return addAllSubmissions(e.target.closest("[data-act]").dataset.section).catch(fail("Couldn't add them all"));
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
  const l = await sb.from("collection_item_links").select("item_id", { count: "exact", head: true }).eq("link_status", "pending");
  setLinksBadge(l.count || 0);
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
  if (tab === "review") return renderReview().catch(fail("Couldn't load the review list"));
  if (tab === "links") return renderLinks().catch(fail("Couldn't load the product links"));
  if (tab === "molds") return renderMolds().catch(fail("Couldn't load the molds"));
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
