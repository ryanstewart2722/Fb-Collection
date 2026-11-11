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
  setups:    { title: "Setups",    fields: [["name", "Deck & Manufacturer", "Deck & manufacturer (required)"], ["trucks", "Trucks", "Trucks"], ["wheels", "Wheels", "Wheels"]] },
  decks:     { title: "Decks",     fields: [["name", "Deck name/color", "Deck name/color (required)"], ["maker", "Manufacturer", "Manufacturer"], ["mold", "Mold", "Mold"], ["size", "Size", "Size, e.g. 32mm"]] },
  obstacles: { title: "Obstacles", fields: [["name", "Name", "Name (required)"], ["maker", "Manufacturer", "Manufacturer"], ["material", "Material", "Material"]] },
  wheels:    { title: "Wheels",    fields: [["name", "Wheel/manufacturer", "Wheel/manufacturer (required)"], ["color", "Color", "Color"], ["material", "Material", "Material"], ["duro", "Duro", "Duro"]] },
  trucks:    { title: "Trucks",    fields: [["name", "Name", "Name (required)"], ["size", "Size", "Size, e.g. 32mm"], ["color", "Color", "Color"]] },
};
const ORDER = ["setups", "decks", "obstacles", "wheels", "trucks"];
const TALL = new Set(["decks", "setups"]);
// Older items were saved as brand/size/color; still show them.
const val = (i, k) => k === "name" ? i.name : (i.details?.[k] ?? (k === "maker" ? i.details?.brand : "")) || "";
const colsFor = (n) => n <= 4 ? "473fr 355fr 237fr 335fr" : "473fr " + Array(n - 1).fill(Math.round(927 / (n - 1)) + "fr").join(" ");
// A line goes between brands: the manufacturer when there is one, otherwise the start of the name ("Sunpower Wheels, Satori" -> "Sunpower Wheels").
const brandOf = (sec, i) => (val(i, "maker") || i.name.split(/[,(*]|\s\d/)[0]).trim().toLowerCase();
const rowCells = (sec, i) => SCHEMA[sec].fields.map(([k]) => val(i, k));

// A built-in sample so you can see what a page looks like before anyone has signed up.
const D = (f) => `https://museumofminiskateboards.org/Images/museum/decks/${f}.png`;
const SAMPLE = {
  profile: { id: "sample", username: "example", display_name: "Sample Collector", bio: "This is a sample page. Real pages look just like it, with each person's own boards and their own photos.", is_private: false },
  items: [
    ["decks", "Her Majesty", "CATFISHBBQ", "34mm", "Multicolor", "cfbbq-1737"], ["decks", "Artshow Street99", "CATFISHBBQ", "34mm", "Blue", "cfbbq-1829"],
    ["decks", "Drop 82, Dr.M’s airbrushed - 1082 (f)", "Dr. M's Research Institute", "32mm", "Multicolor", "drm-1082"], ["decks", "Frame", "CATFISHBBQ", "34mm", "Red", "cfbbq-ig330"],
    ["decks", "Washi Spring", "CATFISHBBQ", "32mm", "Green", "cfbbq-1869"], ["decks", "Wish", "CATFISHBBQ", "32mm", "Natural/Blue", "cfbbq-2"],
    ["setups", "Daily skate", "", "32mm", "", "cfbbq-1830"], ["setups", "Display shelf", "", "34mm", "", "cfbbq-1860"],
  ].map(([section, name, brand, size, color, f], n) => ({ id: "s" + n, section, name, details: { maker: brand, size, ...(section === "setups" ? { trucks: "Independent 32mm", wheels: "Classic 3.0" } : { mold: color ? "Freshwater" : "" }) }, image_path: D(f), status: "approved" })),
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

async function photoUrl(item) {
  const p = item.image_path;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);   // owner's not-yet-approved photo
  return data?.signedUrl || "";
}

function sections() {
  const by = {};
  state.items.forEach((i) => (by[i.section] ||= []).push(i));
  return ORDER.filter((s) => by[s]).map((s) => ({ id: s, title: SCHEMA[s].title, items: by[s] }));
}

/* ---------- header block ---------- */
function headHtml() {
  const { profile, owner } = state;
  const name = profile.display_name || profile.username;
  return `<section class="p-head">
    <h1>${esc(name)}</h1>
    <p class="p-user">museumofminiskateboards.org/u/${esc(profile.username)}${profile.is_private ? ` · <b>Private</b>` : ""}</p>
    ${profile.bio ? `<p class="p-bio">${esc(profile.bio)}</p>` : ""}
    ${owner ? ownerBar() : ""}
  </section>`;
}
function fieldsHtml(sec) {
  return SCHEMA[sec].fields.map(([k, , ph], n) => `<input id="ad-${k}" data-k="${k}" type="text" placeholder="${esc(ph)}" maxlength="${k === "name" ? 120 : 60}"${n === 0 ? " required" : ""}>`).join("");
}
function ownerBar() {
  const p = state.profile;
  return `<div class="p-owner">
    <button class="auth-link" data-act="add">+ Add a board</button> ·
    <button class="auth-link" data-act="edit">Edit name and bio</button> ·
    <button class="auth-link" data-act="private">${p.is_private ? "Make my collection public" : "Make my collection private"}</button> ·
    <button class="auth-link" data-act="signout">Sign out</button>
    <form id="add-form" class="auth-form p-edit" hidden>
      <select id="ad-section" aria-label="What is it?"><option value="decks">Deck</option><option value="setups">Complete setup</option><option value="obstacles">Obstacle</option><option value="trucks">Trucks</option><option value="wheels">Wheels</option></select>
      <span id="ad-fields">${fieldsHtml("decks")}</span>
      <label class="p-file">Photo of yours <input id="ad-file" type="file" accept="image/jpeg,image/png,image/webp,image/*"></label>
      <p class="auth-note">Photos are reviewed before other people can see them. Use a photo of your own board.</p>
      <button class="auth-btn" type="submit" id="ad-btn">Add</button>
    </form>
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
    <div class="list-wrap"><div class="list" data-s="${s.id}" style="--cols:${colsFor(SCHEMA[s.id].fields.length)}">
      <div class="row head">${spans(SCHEMA[s.id].fields.map((f) => f[1]))}</div>
      ${s.items.map((i, n) => `<div class="row${n > 0 && brandOf(s.id, i) !== brandOf(s.id, s.items[n - 1]) ? " divide" : ""}" data-id="${esc(i.id)}">${spans(rowCells(s.id, i))}${i.status !== "approved" ? `<em class="p-pending">${esc(i.status === "pending" ? "waiting for review" : i.status)}</em>` : ""}${state.owner ? `<button class="p-x" data-act="remove" data-id="${esc(i.id)}" title="Remove">Remove</button>` : ""}</div>`).join("")}
    </div></div></section>`).join("");
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
  clearActive();
  document.querySelectorAll("#views a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.body.classList.toggle("list-view", view === "list");
  if (!state.items.length) {
    box.innerHTML = `<p class="p-empty">${state.owner ? "You haven't added anything yet." : "Nothing here yet."}</p>`;
    return;
  }
  box.innerHTML = view === "list" ? renderList() : renderGrid();
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
window.addEventListener("hashchange", () => { view = location.hash === "#list" ? "list" : "image"; if (state) paintItems(); });

/* ---------- page ---------- */
function paint() {
  document.title = `${state.profile.display_name || state.profile.username} · MoMS`;
  $("#views").hidden = !state.items.length;
  $("#views-gap").hidden = !!state.items.length;
  app.innerHTML = headHtml() + `<div id="items"></div>`;
  paintItems();
}
function notFound(name) {
  app.innerHTML = `<section class="p-head"><h1>No one here</h1><p class="p-bio">There's no collection at <b>/u/${esc(name)}</b>. <a href="/signin.html">Sign in</a> to make yours.</p></section>`;
}

app.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act || !state?.owner) return;
  const msg = $("#owner-msg");
  if (act === "signout") { await sb.auth.signOut(); location.href = "/"; }
  if (act === "edit") { const f = $("#edit-form"); f.hidden = !f.hidden; }
  if (act === "add") { const f = $("#add-form"); f.hidden = !f.hidden; if (!f.hidden) $("#ad-name").focus(); }
  if (act === "remove") {
    const id = e.target.closest("[data-id]").dataset.id, it = state.items.find((i) => i.id === id);
    if (!it || !confirm(`Remove “${it.name}” from your collection?`)) return;
    const { error } = await sb.from("collection_items").delete().eq("id", id);
    if (error) return (msg.textContent = "Couldn't remove it. " + error.message);
    if (it.image_path && !/^https?:/.test(it.image_path)) sb.storage.from("uploads").remove([it.image_path]).catch(() => {});
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
app.addEventListener("change", (e) => { if (e.target.id === "ad-section") $("#ad-fields").innerHTML = fieldsHtml(e.target.value); });
app.addEventListener("submit", async (e) => {
  if (e.target.id === "add-form") {
    e.preventDefault();
    const btn = $("#ad-btn"), msg = $("#owner-msg");
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
      $("#owner-msg").textContent = image_path ? "Added. Your photo shows to other people once it's been reviewed." : "Added.";
      $("#add-form").hidden = false; $("#add-form").reset(); $("#ad-fields").innerHTML = fieldsHtml($("#ad-section").value);
    } catch (err) {
      msg.textContent = "Couldn't add that. " + (err.message || err);
    }
    btn.disabled = false;
    return;
  }
  if (e.target.id !== "edit-form") return;
  e.preventDefault();
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
    state = { profile: SAMPLE.profile, items: SAMPLE.items.map((i) => ({ ...i, url: i.image_path })), owner: false };
    return paint();
  }
  const username = await rpc("resolve_username", { u: raw });   // ryan, riso... lead to r
  if (!username) return notFound(raw);
  history.replaceState(null, "", "/u/" + username + location.hash);   // show the real address

  // The owner's own collection (r) is the full collection page.
  if (username === "r") {
    const html = await (await fetch("/collection.html")).text();
    // moms-config.js is already loaded here; loading it again would redeclare its constants.
    document.open(); document.write(html.replace(/<script src="moms-config\.js[^>]*><\/script>\s*/, "").replace("<head>", '<head><base href="/">')); document.close();
    return;
  }

  const { data: profile } = await sb.from("profiles").select("id,username,display_name,bio,is_private").eq("username", username).maybeSingle();
  if (!profile) return notFound(raw);
  const { data: { session } } = await sb.auth.getSession();
  const owner = session?.user.id === profile.id;
  const { data: items } = await sb.from("collection_items").select("*").eq("user_id", profile.id).order("section").order("position").order("created_at");
  const rows = items || [];
  await Promise.all(rows.map(async (i) => (i.url = await photoUrl(i))));
  state = { profile, items: rows, owner };
  paint();
}

load().catch((err) => { console.error(err); app.innerHTML = `<p class="p-empty">Couldn't load this page. Please refresh.</p>`; });
})();
