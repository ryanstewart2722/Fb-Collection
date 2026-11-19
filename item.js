// One item from someone's collection: item.html?id=<id>. It is laid out like a museum board page (board.html):
// the photo(s) on the left, the details on the right, "In Museum" (the museum entries this item is) and "More in Collection" below.
const root = document.getElementById("board");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: false } });
const params = new URLSearchParams(location.search);
const id = params.get("id") || "";

const SECTION_NAME = { setups: "Setup", decks: "Deck", wheels: "Wheels", trucks: "Trucks", obstacles: "Obstacle", misc: "Misc." };
const TALL = new Set(["decks", "setups"]);   // boards are tall; wheels, trucks, obstacles and misc. are square-ish
// what each kind of museum entry can be linked from, and how it is listed
const LINKABLE = { setups: ["decks", "trucks", "wheels"], decks: ["decks"], trucks: ["trucks"], wheels: ["wheels"], obstacles: ["obstacles"], misc: ["misc"] };
const MUSEUM_KIND = { decks: "Deck", trucks: "Trucks", wheels: "Wheels", obstacles: "Obstacle", misc: "Misc." };
const MUSEUM_SEL = {
  decks: "id,name,slug,image_path,size,color,release_date,drop_no,drop_title,mold_code,brands(name)",
  trucks: "id,name,slug,image_path,size,color,release_date,brands(name)",
  wheels: "id,name,slug,image_path,color,material,duro,release_date,brands(name)",
  obstacles: "id,name,slug,image_path,material,release_date,brands(name)",
  misc: "id,name,slug,image_path,material,release_date,brands(name)",
};
const museumName = (t, r) => t === "decks" ? momsDeckName(r) : (t === "wheels" || t === "trucks") && r.brands?.name && !r.name.toLowerCase().includes(r.brands.name.toLowerCase()) ? `${r.brands.name} ${r.name}` : r.name;
const museumLink = (t, r) => `board.html?type=${t}&slug=${encodeURIComponent(r.slug)}`;

const topBack = document.getElementById("top-back");
let backHref = document.referrer.startsWith(location.origin) && !document.referrer.includes("item.html") ? document.referrer : "./";
if (topBack) topBack.href = backHref;

// ---------- photos: the same pick the collection page uses (the second cut when it is ready and chosen, otherwise the first) ----------
const ASSET = (p) => (window.MOMS_ASSET_BASE || "") + "/" + p;   // the cut-out files; the staging copy loads them from the real site
let RECUTS = {}, TIGHT = { quick: {}, sizes: {} };
const cutsP = Promise.all([
  fetch(ASSET("user-cuts/index.json"), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  fetch(ASSET("user-cuts/tight.json"), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
]).then(([rc, tg]) => { RECUTS = rc || {}; TIGHT = { quick: tg?.quick || {}, sizes: tg?.sizes || {} }; });

let anon = null;
async function signed(path) {
  let { data } = await sb.storage.from("uploads").createSignedUrl(path, 3600);
  if (!data?.signedUrl) {   // a session that has just expired must not hide the photo: ask again as a visitor
    anon ||= supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    ({ data } = await anon.storage.from("uploads").createSignedUrl(path, 3600));
  }
  return data?.signedUrl || "";
}
const refinedFor = (i) => {
  const rc = RECUTS[i.id], pick = i.details?.cut;
  return rc && rc.file && i.source_path && rc.src === i.source_path && pick !== "quick" && (!rc.bad || pick === "refined") ? rc : null;
};
// the big photo on the page
async function bigPhoto(i) {
  const rc = refinedFor(i);
  if (rc) {
    const u = ASSET(rc.file) + "?c=1";
    if (await new Promise((ok) => { const im = new Image(); im.onload = () => ok(true); im.onerror = () => ok(false); im.src = u; })) return u;
  }
  const p = i.image_path;
  if (!p) return "";
  return /^https?:/.test(p) ? p : signed(p);
}
// small pictures in a row (More in Collection): the pre-made trimmed copy when there is one
async function thumbPhoto(i) {
  const rc = refinedFor(i);
  if (rc) return ASSET(rc.file) + "?c=1";
  const q = TIGHT.quick?.[i.id];
  if (q && q.file && q.src === i.image_path) return ASSET(q.file);
  const p = i.image_path;
  if (!p) return "";
  return /^https?:/.test(p) ? p : signed(p);
}
async function secondPhoto(i) {
  const p = i.image_path_2;
  if (!p) return "";
  return /^https?:/.test(p) ? p : signed(p);
}

// ---------- the details ----------
const FIELD = { maker: "Manufacturer", mold: "Mold", size: "Size", color: "Color", material: "Material", duro: "Duro", year: "Year", trucks: "Trucks", wheels: "Wheels" };
const ORDER = { setups: ["name*", "trucks", "wheels"], decks: ["maker", "mold", "size"], trucks: ["size", "color"], wheels: ["color", "material", "duro"], obstacles: ["maker", "material"], misc: ["maker", "material", "year"] };
function specs(i, owner) {
  const d = i.details || {};
  const v = (k) => d[k] ?? (k === "maker" ? d.brand : "");
  const lines = (ORDER[i.section] || []).map((k) => k === "name*" ? `Deck: ${i.name}` : v(k) && `${FIELD[k]}: ${v(k)}`).filter(Boolean);
  const person = owner ? `Collection of: <a class="board-brand-link" href="/u/${encodeURIComponent(owner.username)}">${esc(owner.display_name || owner.username)}</a>` : "";
  const cell = (t, html) => `<span>${html ? t : esc(t)}</span>`;
  const left = lines.slice(0, setupsSplit(i, lines));
  const right = lines.slice(left.length);
  const col = (arr, extra) => `<div>${arr.map((t) => cell(t)).join("")}${extra ? cell(extra, true) : ""}</div>`;
  return col(left) + col(right, person);
}
// setups keep deck, trucks and wheels together in the first column; the others split evenly
const setupsSplit = (i, lines) => i.section === "setups" ? lines.length : Math.ceil(lines.length / 2);

async function load() {
  if (!id) { root.innerHTML = `<div class="board-info"><h1>Not found</h1><p><a href="./">Back to the museum</a></p></div>`; return; }
  const { data: i } = await sb.from("collection_items").select("*,profiles(id,username,display_name)").eq("id", id).maybeSingle();
  if (!i || i.status === "removed") { root.innerHTML = `<div class="board-info"><h1>Not found</h1><p>This item isn't here, or it's in a private collection.</p><p><a href="./">Back to the museum</a></p></div>`; return; }
  const owner = i.profiles;
  const { data: sess } = await sb.auth.getSession();
  const me = sess?.session?.user?.id || null;
  const isOwner = !!me && me === i.user_id;
  let isStaff = false;
  if (me) { const { data: prof } = await sb.from("profiles").select("role").eq("id", me).maybeSingle(); isStaff = prof?.role === "admin" || prof?.role === "moderator"; }
  const canLink = isOwner || isStaff;
  if (!document.referrer.startsWith(location.origin) || document.referrer.includes("item.html")) backHref = owner ? `/u/${encodeURIComponent(owner.username)}` : "./";
  if (topBack) topBack.href = backHref;

  const title = i.name;
  document.title = `${title}${owner ? ` - ${owner.display_name || owner.username}` : ""} · The Museum of Mini Skateboards`;

  // everything is asked for at the same moment, so the photo, In Museum and More in Collection land together
  const linksP = sb.from("collection_item_links").select("museum_type,museum_id,link_status").eq("item_id", i.id).then((r) => r.data || []);
  const moreP = loadMore(i);
  const siblingsP = sb.from("collection_items").select("id,position").eq("user_id", i.user_id).eq("section", i.section).eq("status", "approved").order("position", { ascending: true, nullsFirst: false }).limit(2000).then((r) => r.data || []);
  const [photo, photo2, links, more, sibs] = await Promise.all([cutsP.then(() => bigPhoto(i)), secondPhoto(i), linksP, moreP, siblingsP]);
  const museum = await loadMuseum(links);

  let prev = null, next = null;
  const at = sibs.findIndex((x) => x.id === i.id);
  if (at >= 0 && sibs.length > 1) { prev = sibs[(at - 1 + sibs.length) % sibs.length].id; next = sibs[(at + 1) % sibs.length].id; }
  const link = (x) => `item.html?id=${encodeURIComponent(x)}`;
  const sq = !TALL.has(i.section);

  root.innerHTML = `
    <div class="board-img">${photo ? `<img${/\.gif($|\?)/i.test(photo) ? ' class="gif"' : ""} src="${esc(photo)}" alt="${esc(title)}">` : ""}${photo2 ? `<img class="second${/\.gif($|\?)/i.test(photo2) ? " gif" : ""}" src="${esc(photo2)}" alt="${esc(title)} (2)">` : ""}</div>
    <a class="board-close" href="${esc(backHref)}">Close</a>
    ${prev ? `<a class="board-nav prev" href="${esc(link(prev))}">Previous</a><a class="board-nav next" href="${esc(link(next))}">Next</a>` : ""}
    <div class="board-info">
      <h1>${esc(title)}</h1>
      ${i.status !== "approved" ? `<p class="board-use-msg">This is waiting for review, so only you can see it.</p>` : ""}
      <div class="board-specs">${specs(i, owner)}</div>
      <div class="board-dock">
        <div class="board-use"><p class="board-use-head">In Museum${canLink ? ` <button type="button" class="board-submit" id="im-edit">Edit</button> <button type="button" class="board-submit im-edonly" id="im-find">Find in museum</button>` : ""}</p>
          ${canLink ? `<form class="board-use-form" id="im-form" hidden><input type="search" id="im-q" placeholder="Search the museum by name or brand" autocomplete="off" aria-label="Search the museum"> <button type="submit">Search</button> <span class="board-use-msg" id="im-msg" aria-live="polite"></span><div class="im-results" id="im-res"></div></form>` : ""}
          <div class="board-use-list" id="im-list"></div></div>
        <div class="board-brand">
          <span class="board-more-head">More in ${owner ? `<a class="board-brand-link" href="/u/${encodeURIComponent(owner.username)}">${esc(owner.display_name || owner.username)}'s</a> ` : ""}Collection</span>
          <div class="board-more" id="im-more"></div>
        </div>
      </div>
    </div>`;

  let shownMore = matchMedia("(max-width: 1100px)").matches ? more.slice(0, 6) : more;
  root.querySelector("#im-more").innerHTML = shownMore.map((m) => `<a${TALL.has(m.section) ? "" : ' class="sq"'} href="${esc(link(m.id))}" title="${esc(m.name)}"><img src="${esc(m.url)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("") || `<span class="board-use-empty">Nothing else here yet.</span>`;

  let current = museum;   // what is linked right now
  const paintMuseum = () => {
    const box = root.querySelector("#im-list");
    box.innerHTML = current.map((m) => `<span class="im-one"><a class="ready${TALL.has(m.t) ? "" : " sq"}" href="${esc(museumLink(m.t, m.r))}" title="${esc(m.name)}"><img src="${esc(m.r.image_path || "")}" alt="${esc(m.name)}" loading="lazy"></a>
      <span class="im-cap">${esc(MUSEUM_KIND[m.t])}${m.status !== "approved" ? ` <i class="im-pend">waiting for review</i>` : ""}${canLink ? ` <button type="button" class="im-x" data-t="${m.t}" data-id="${m.r.id}" title="Remove this link">remove</button>` : ""}</span></span>`).join("")
      || `<span class="board-use-empty">${canLink ? "Not linked to the museum yet." : "Not linked to the museum yet."}</span>`;
  };
  paintMuseum();
  const ed = root.querySelector("#im-edit");   // owner's edit mode: find / remove / review notes show only while it is on
  if (ed) ed.addEventListener("click", () => {
    const on = root.classList.toggle("im-editing");
    ed.textContent = on ? "Done" : "Edit";
    if (!on) { const f = root.querySelector("#im-form"); if (f) f.hidden = true; }
  });
  if (canLink) setupLinking(i, () => current, async () => { current = await loadMuseum(await linksP2(i.id)); paintMuseum(); });
}
const linksP2 = (itemId) => sb.from("collection_item_links").select("museum_type,museum_id,link_status").eq("item_id", itemId).then((r) => r.data || []);

// other things in the same person's collection, a random handful
async function loadMore(i) {
  const { data } = await sb.from("collection_items").select("id,section,name,image_path,source_path,details").eq("user_id", i.user_id).eq("status", "approved").neq("id", i.id).not("image_path", "is", null).limit(300);
  const rows = (data || []).slice();
  for (let k = rows.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [rows[k], rows[j]] = [rows[j], rows[k]]; }
  await cutsP;
  const pick = rows.slice(0, 8);
  const out = await Promise.all(pick.map(async (m) => ({ ...m, url: await thumbPhoto(m).catch(() => "") })));
  return out.filter((m) => m.url);
}

// the museum entries this item is linked to
async function loadMuseum(links) {
  const by = {};
  links.forEach((l) => (by[l.museum_type] ||= []).push(l));
  const out = [];
  await Promise.all(Object.keys(by).map(async (t) => {
    if (!MUSEUM_SEL[t]) return;
    const { data } = await sb.from(t).select(MUSEUM_SEL[t]).in("id", by[t].map((l) => l.museum_id));
    (data || []).forEach((r) => out.push({ t, r, name: museumName(t, r), status: by[t].find((l) => l.museum_id === r.id)?.link_status || "approved" }));
  }));
  const rank = { decks: 0, trucks: 1, wheels: 2, obstacles: 3, misc: 4 };
  return out.sort((a, b) => rank[a.t] - rank[b.t]);
}

// ---------- find it in the museum, and link it (or remove the link) ----------
function setupLinking(i, getCurrent, refresh) {
  const form = root.querySelector("#im-form"), find = root.querySelector("#im-find"), q = root.querySelector("#im-q"), msg = root.querySelector("#im-msg"), res = root.querySelector("#im-res");
  const kinds = LINKABLE[i.section] || [];
  find.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) { if (!q.value) q.value = String(i.name || "").replace(/[,*()%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40); q.focus(); } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const term = q.value.replace(/[,*()%\\]/g, " ").replace(/\s+/g, " ").trim();
    msg.textContent = ""; res.innerHTML = "";
    if (term.length < 2) return (msg.textContent = "Type at least two letters.");
    msg.textContent = "Searching…";
    try {
      // word by word: every word is looked for in the name or the brand, and the best matches (the most words) come first
      const words = [...new Set(term.toLowerCase().split(" ").filter((w) => w.length >= 2))].slice(0, 5);
      const brandIds = {};
      await Promise.all(words.map(async (w) => { const { data } = await sb.from("brands").select("id").ilike("name", `%${w}%`).limit(20); brandIds[w] = (data || []).map((x) => x.id); }));
      const found = [];
      await Promise.all(kinds.map(async (t) => {
        const seen = new Map();
        await Promise.all(words.map(async (w) => {
          const ids = brandIds[w];
          const { data } = await sb.from(t).select(MUSEUM_SEL[t]).or(`name.ilike.*${w}*` + (ids.length ? `,brand_id.in.(${ids.join(",")})` : "")).not("image_path", "is", null).order("release_date", { ascending: false, nullsFirst: false }).limit(60);
          (data || []).forEach((r) => seen.set(r.id, r));
        }));
        const score = (r) => { const hay = [museumName(t, r), r.brands?.name, r.color, r.size, r.release_date ? String(r.release_date).slice(0, 4) : ""].join(" ").toLowerCase(); return words.filter((w) => hay.includes(w)).length; };
        [...seen.values()].map((r) => ({ t, r, n: score(r) })).sort((x, y) => y.n - x.n).slice(0, kinds.length > 1 ? 6 : 12).forEach((x) => found.push(x));
      }));
      msg.textContent = found.length ? "" : "Nothing matched. Try a shorter word, or the brand.";
      const have = new Set(getCurrent().map((m) => m.t));
      res.innerHTML = found.map(({ t, r }) => {
        const yr = r.release_date ? String(r.release_date).slice(0, 4) : "";
        const more = [r.brands?.name, yr, r.size, r.color].filter(Boolean).join(" \u00b7 ");
        return `<div class="im-res"><img src="${esc(r.image_path || "")}" alt=""><span><b>${esc(museumName(t, r))}</b><br>${esc(MUSEUM_KIND[t])}${more ? " \u00b7 " + esc(more) : ""}</span><button type="button" data-t="${t}" data-id="${r.id}"${have.has(t) ? ' disabled title="Already linked: remove it first"' : ""}>${have.has(t) ? "Linked" : "Link"}</button></div>`;
      }).join("");
    } catch (err) { msg.textContent = "Couldn't search just now."; console.error(err); }
  });
  res.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const { data, error } = await sb.from("collection_item_links").insert({ item_id: i.id, museum_type: b.dataset.t, museum_id: Number(b.dataset.id) }).select("link_status").maybeSingle();
    if (error) { msg.textContent = "Couldn't link that. " + error.message; b.disabled = false; return; }
    msg.textContent = data?.link_status === "approved" ? "Linked." : "Sent. It shows for everyone once it's approved.";
    b.textContent = "Linked";
    await refresh();
  });
  root.querySelector("#im-list").addEventListener("click", async (e) => {
    const b = e.target.closest(".im-x");
    if (!b) return;
    b.disabled = true;
    const { error } = await sb.from("collection_item_links").delete().eq("item_id", i.id).eq("museum_type", b.dataset.t).eq("museum_id", Number(b.dataset.id));
    if (error) { msg.textContent = "Couldn't remove that. " + error.message; form.hidden = false; b.disabled = false; return; }
    await refresh();
    res.innerHTML = "";
  });
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this item</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
