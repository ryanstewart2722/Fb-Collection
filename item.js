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
  return col(left) + col(right);
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
      <div class="board-specs">${specs(i, owner)}</div>
      <div class="board-dock">
        <div class="board-use"><p class="board-use-head">In Museum</p>
          ${canLink ? `<form class="im-find" id="im-form" autocomplete="off"><div class="im-parts" id="im-parts"></div><input type="search" id="im-q" placeholder="Search the museum" aria-label="Search the museum"><div class="im-pop" id="im-res" hidden></div></form>` : ""}
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
  let paintMuseum = () => {
    const box = root.querySelector("#im-list");
    box.innerHTML = current.map((m) => `<a class="ready${TALL.has(m.t) ? "" : " sq"}" href="${esc(museumLink(m.t, m.r))}" title="${esc(m.name)}"><img src="${esc(m.r.image_path || "")}" alt="${esc(m.name)}" loading="lazy"></a>`).join("")
      || `<span class="board-use-empty">${canLink ? "Not linked to the museum yet." : "Not linked to the museum yet."}</span>`;
  };
  const fullCheck = () => { const f = root.querySelector("#im-form"); if (f) f.hidden = (LINKABLE[i.section] || []).every((t) => current.some((m) => m.t === t)); };   // everything is linked: no search needed
  const paint0 = paintMuseum;
  paintMuseum = () => { paint0(); fullCheck(); };
  paintMuseum();
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

// ---------- find it in the museum, and link it ----------
// Each kind of entry is loaded once (a light list), then matched here on the page so results come back as you type.
const TABLE = {}, tableP = {};
function loadTable(t) {
  return (tableP[t] ||= (async () => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select(MUSEUM_SEL[t]).not("image_path", "is", null).order("id").range(from, from + 999);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return (TABLE[t] = rows.map((r) => {
      const brand = r.brands?.name || "", yr = r.release_date ? String(r.release_date).slice(0, 4) : "";
      const text = [museumName(t, r), brand, r.color, r.material, r.mold_code, r.drop_title, r.drop_no ? "drop " + r.drop_no : ""].join(" ");
      const size = parseFloat(r.size);   // e.g. "32.5mm" -> 32.5
      return { t, r, words: norm(text), nums: new Set([...(text.match(/\d+(\.\d+)?/g) || []), yr, Number.isFinite(size) ? String(size) : "", r.duro ? String(parseFloat(r.duro)) : ""].filter(Boolean)), yr, brand, size };
    }));
  })());
}
const STOP = new Set(["x", "the", "and", "of", "a", "mm", "deck", "decks", "wheels", "wheel", "trucks", "truck"]);
const norm = (x) => String(x ?? "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9.]+/g, " ").replace(/\.(?!\d)/g, "").trim().split(/\s+/).filter(Boolean);
// how well one entry matches the words typed: whole words count most, starts-of-words next; numbers must match exactly (size, year, number)
function score(entry, qs) {
  let got = 0, pts = 0;
  for (const q of qs) {
    let best = 0;
    if (/^\d+(\.\d+)?$/.test(q)) {
      if (entry.nums.has(q) || entry.nums.has(String(parseFloat(q)))) best = 4;
    } else {
      for (const w of entry.words) {
        const p = w === q ? 3 : q.length >= 3 && w.startsWith(q) ? 2 : q.length >= 5 && w.includes(q) ? 1 : 0;
        if (p > best) best = p;
        if (best === 3) break;
      }
    }
    if (best) { got++; pts += best; }
  }
  return { got, pts };
}
async function searchMuseum(t, text) {
  const qs = [...new Set(norm(text).map((w) => w.replace(/mm$/, "")).filter((w) => w && !STOP.has(w)))].slice(0, 8);
  if (!qs.length) return [];
  const need = qs.length <= 3 ? qs.length : Math.ceil(qs.length * 0.6);
  const table = await loadTable(t);
  const scored = table.map((e) => ({ e, ...score(e, qs) }));
  const pick = (n) => scored.filter((x) => x.got >= n).sort((a, b) => b.got - a.got || b.pts - a.pts).slice(0, 40).map((x) => x.e);
  const hits = pick(need);
  return hits.length || qs.length < 2 ? hits : pick(Math.max(1, need - 1));   // nothing matched every word: show the closest ones
}

function setupLinking(i, getCurrent, refresh) {
  const form = root.querySelector("#im-form"), q = root.querySelector("#im-q"), pop = root.querySelector("#im-res"), partsBox = root.querySelector("#im-parts");
  const kinds = LINKABLE[i.section] || [];
  const d = i.details || {};
  let part = kinds[0], seq = 0, timer;
  // what to look for to begin with: what the owner typed about this part
  const start = (t) => String(t === "decks" ? [i.name, d.maker, d.mold, d.size, d.color].filter(Boolean).join(" ") : t === "trucks" ? (d.trucks || (i.section === "trucks" ? [i.name, d.size, d.color].join(" ") : "")) : t === "wheels" ? (d.wheels || (i.section === "wheels" ? [i.name, d.color].join(" ") : "")) : [i.name, d.maker, d.material].filter(Boolean).join(" ")).trim();
  const paintParts = () => {
    partsBox.innerHTML = kinds.length > 1 ? kinds.map((t) => `<button type="button" data-p="${t}"${t === part ? ' class="on"' : ""}>${MUSEUM_KIND[t]}</button>`).join("") : "";
  };
  const run = async () => {
    const n = ++seq, have = new Set(getCurrent().map((m) => m.t));
    pop.hidden = false;
    pop.innerHTML = `<p class="im-note">Searching\u2026</p>`;
    let found = [];
    try { found = await searchMuseum(part, q.value); } catch (err) { console.error(err); }
    if (n !== seq) return;
    if (!norm(q.value).length) { pop.hidden = true; return; }
    pop.innerHTML = found.map(({ t, r, yr }) => {
      const more = [r.brands?.name, yr, r.size, r.color].filter(Boolean).join(" \u00b7 ");
      const linked = have.has(t);
      return `<div class="im-res"><span class="im-pic"><img src="${esc(r.image_path || "")}" alt="" loading="lazy"></span><span class="im-txt"><b>${esc(museumName(t, r))}</b><br>${esc(more)}</span><button type="button" data-t="${t}" data-id="${r.id}"${linked ? " disabled" : ""}>${linked ? "Linked" : "Link"}</button></div>`;
    }).join("") || `<p class="im-note">Nothing matched. Try fewer words.</p>`;
  };
  paintParts();
  q.addEventListener("focus", () => { if (!q.value) q.value = start(part); if (norm(q.value).length) run(); });
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  partsBox.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    part = b.dataset.p; paintParts(); q.value = start(part); q.focus(); run();
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) pop.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
  pop.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const { error } = await sb.from("collection_item_links").insert({ item_id: i.id, museum_type: b.dataset.t, museum_id: Number(b.dataset.id) });
    if (error) { b.disabled = false; b.textContent = "Couldn't link"; return; }
    b.textContent = "Linked";
    await refresh();
    run();
  });
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this item</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
