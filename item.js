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

// Which parts to offer a box for: only the ones the owner actually typed in (or that are already linked). Most people don't log their trucks or wheels.
const loggedParts = (i, current) => (LINKABLE[i.section] || []).filter((t) => {
  const d = i.details || {};
  if (current.some((m) => m.t === t)) return true;
  if (i.section !== "setups") return true;   // a deck, trucks, wheels... item is that one part
  return t === "decks" ? !!i.name : !!String(d[t] || "").trim();
});

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
      <button class="board-fav" id="im-like" type="button" hidden></button>
      <div class="board-specs">${specs(i, owner)}</div>
      <div class="board-dock">
        <div class="board-use" id="im-section"><p class="board-use-head">In Museum</p>
          <div class="board-use-list" id="im-list"></div>
          ${canLink ? `<form class="im-find" id="im-form" autocomplete="off" hidden><p class="im-title"><span id="im-title"></span> <button type="button" class="im-cancel" id="im-cancel">Cancel</button></p><input type="search" id="im-q" placeholder="Type a name, or just a few words" aria-label="Search the museum"><div class="im-pop" id="im-pop" hidden><div class="im-list" id="im-res"></div><p class="im-foot">Can\u2019t find it? <a id="im-browse" href="./" target="_blank" rel="noopener">Browse the museum</a> or <a id="im-add" href="submit.html" target="_blank" rel="noopener">add it to the museum</a></p></div></form>` : ""}</div>
        <div class="board-brand">
          <span class="board-more-head">More in ${owner ? `<a class="board-brand-link" href="/u/${encodeURIComponent(owner.username)}">${esc(owner.display_name || owner.username)}'s</a> ` : ""}Collection</span>
          <div class="board-more" id="im-more"></div>
        </div>
      </div>
    </div>`;

  let shownMore = matchMedia("(max-width: 760px)").matches ? more.slice(0, 5) : matchMedia("(max-width: 1100px)").matches ? more.slice(0, 6) : more;
  root.querySelector("#im-more").innerHTML = shownMore.map((m) => `<a${TALL.has(m.section) ? "" : ' class="sq"'} href="${esc(link(m.id))}" title="${esc(m.name)}"><img src="${esc(m.url)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("") || `<span class="board-use-empty">Nothing else here yet.</span>`;

  // likes: anyone can see the count; signed-in people can like or un-like
  (async () => {
    const btn = root.querySelector("#im-like"); if (!btn) return;
    const count = async () => (await sb.from("item_likes").select("item_id", { count: "exact", head: true }).eq("item_id", i.id)).count || 0;
    let n = await count(), on = false;
    if (me) { const { data } = await sb.from("item_likes").select("item_id").eq("item_id", i.id).eq("user_id", me).maybeSingle(); on = !!data; }
    const paint = () => { btn.innerHTML = `<span class="star" aria-hidden="true">${on ? "\u2665" : "\u2661"}</span> ${on ? "Liked" : "Like"}${n ? ` \u00b7 ${n}` : ""}`; btn.hidden = false; };
    paint();
    btn.addEventListener("click", async () => {
      if (!me) return (location.href = "/signin.html");
      btn.disabled = true;
      const res = on ? await sb.from("item_likes").delete().eq("item_id", i.id).eq("user_id", me) : await sb.from("item_likes").insert({ item_id: i.id });
      if (!res.error) { on = !on; n = Math.max(0, n + (on ? 1 : -1)); }
      btn.disabled = false; paint();
    });
  })();

  let current = museum;   // what is linked right now
  let paintMuseum = () => {
    const box = root.querySelector("#im-list");
    const kinds = canLink ? loggedParts(i, current) : [];
    const one = (m) => `<a class="ready${TALL.has(m.t) ? "" : " sq"}" href="${esc(museumLink(m.t, m.r))}" title="${esc(m.name)}">${m.r.image_path ? `<img src="${esc(m.r.image_path)}" alt="${esc(m.name)}" loading="lazy">` : `<span class="no-pic">${esc(m.name)}</span>`}</a>`;
    // the owner sees one place for each part, in order: the picture when it is linked, otherwise an empty box to tap
    const html = kinds.length
      ? kinds.map((t) => { const m = current.find((x) => x.t === t); return m ? one(m) : `<button type="button" class="im-slot" data-p="${t}"><span>+</span>${esc(MUSEUM_KIND[t])}</button>`; }).join("") + current.filter((m) => !kinds.includes(m.t)).map(one).join("")
      : current.map(one).join("");
    box.innerHTML = html || `<span class="board-use-empty">Not linked to the museum yet.</span>`;
    // visitors only see "In Museum" when something is linked; the owner (and staff) always do, to add entries
    root.querySelector("#im-section").hidden = !canLink && !current.length;
  };
  const fullCheck = () => { const f = root.querySelector("#im-form"); if (f) { if (loggedParts(i, current).every((t) => current.some((m) => m.t === t))) f.hidden = true; } };   // everything is linked: no search needed
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
// (the matching itself lives in msearch.js, so the museum page can use the same search)
function setupLinking(i, getCurrent, refresh) {
  const form = root.querySelector("#im-form"), q = root.querySelector("#im-q"), pop = root.querySelector("#im-pop"), list = root.querySelector("#im-res"), titleEl = root.querySelector("#im-title"), cancel = root.querySelector("#im-cancel"), listBox = root.querySelector("#im-list"), add = root.querySelector("#im-add"), browse = root.querySelector("#im-browse");
  const kinds = LINKABLE[i.section] || [];
  const d = i.details || {};
  let part = kinds[0], seq = 0, timer;
  // what to look for to begin with: what the owner typed about this part
  const start = (t) => String(t === "decks" ? [i.name, d.maker, d.mold, d.size, d.color].filter(Boolean).join(" ") : t === "trucks" ? (d.trucks || (i.section === "trucks" ? [i.name, d.size, d.color].join(" ") : "")) : t === "wheels" ? (d.wheels || (i.section === "wheels" ? [i.name, d.color].join(" ") : "")) : [i.name, d.maker, d.material].filter(Boolean).join(" ")).trim();
  const paintParts = () => { titleEl.textContent = "Find the " + (MUSEUM_KIND[part] || "item").toLowerCase().replace(/\.$/, ""); browse.href = "/" + part + "/";   // browsing shows only this kind
    const p = new URLSearchParams({ type: part });   // the submit form starts filled in with what they already typed about it
    const put = (k, v) => { if (v) p.set(k, String(v)); };
    if (part === "decks") { put("name", i.section === "setups" || i.section === "decks" ? i.name : ""); put("brand", d.maker || d.brand); put("size", d.size); put("color", d.color); put("mold", d.mold); }
    else if (part === "trucks") { put("name", i.section === "trucks" ? i.name : d.trucks); put("size", i.section === "trucks" ? d.size : ""); put("color", i.section === "trucks" ? d.color : ""); put("brand", i.section === "trucks" ? (d.maker || d.brand) : ""); }
    else if (part === "wheels") { put("name", i.section === "wheels" ? i.name : d.wheels); put("color", i.section === "wheels" ? d.color : ""); put("duro", i.section === "wheels" ? d.duro : ""); put("material", i.section === "wheels" ? d.material : ""); put("brand", i.section === "wheels" ? (d.maker || d.brand) : ""); }
    else { put("name", i.name); put("brand", d.maker || d.brand); put("material", d.material); }
    add.href = "submit.html?" + p; };
  let cache = [], shownN = 20;
  const paintResults = (have) => {
    const part = cache.slice(0, shownN);
    let sawClose = false;
    list.innerHTML = part.map(({ t, r, close }) => {
      const more = museumInfo(t, r);
      const linked = have.has(t);
      const head = close && !sawClose ? (sawClose = true, `<p class="im-note im-sep">Close, but not exact</p>`) : "";
      return head + `<div class="im-res"><span class="im-pic">${museumPic(r)}</span><span class="im-txt"><b>${esc(museumName(t, r))}</b><br><span class="im-sub">${esc(more)}</span></span><button type="button" data-t="${t}" data-id="${r.id}"${linked ? " disabled" : ""}>${linked ? "Linked" : "Select"}</button></div>`;
    }).join("") + (cache.length > shownN ? `<button type="button" class="im-more-btn" id="im-more-btn">Show more (${cache.length - shownN} left)</button>` : "")
      || `<p class="im-note">${norm(q.value).length ? "Nothing matched. Try fewer words." : "Type a few words: a name, brand, colour or size."}</p>`;
  };
  const run = async () => {
    const n = ++seq, have = new Set(getCurrent().map((m) => m.t));
    pop.hidden = false;
    let found = [];
    try { found = await searchMuseum(part, q.value); } catch (err) { console.error(err); }
    if (n !== seq) return;
    cache = found; shownN = 20;
    paintResults(have);
  };
    const choose = async (t) => { part = t; paintParts(); form.hidden = false; q.value = start(part); q.focus(); pop.hidden = false; run(); form.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  listBox.addEventListener("click", (e) => { const sl = e.target.closest(".im-slot"); if (sl) choose(sl.dataset.p); });
  cancel.addEventListener("click", () => { form.hidden = true; pop.hidden = true; });
  q.addEventListener("focus", () => { if (!pop.hidden || !q.value) return; run(); });
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  document.addEventListener("click", (e) => { if (!form.contains(e.target) && !e.target.closest(".im-slot")) pop.hidden = true; });   // a click anywhere else closes the matches (but tapping a box opens them)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
  list.addEventListener("click", async (e) => {
    if (e.target.closest("#im-more-btn")) { shownN += 20; const y = list.scrollTop; paintResults(new Set(getCurrent().map((m) => m.t))); list.scrollTop = y; return; }
    const bt = e.target.closest("button[data-t]");
    if (!bt || bt.disabled) return;
    bt.disabled = true;
    const { error } = await sb.from("collection_item_links").insert({ item_id: i.id, museum_type: bt.dataset.t, museum_id: Number(bt.dataset.id) });
    if (error) { bt.disabled = false; bt.textContent = "Couldn't link"; return; }
    bt.textContent = "Linked";
    await refresh();   // the picture appears in its box; the next missing part gets its own box
    form.hidden = true; pop.hidden = true;
  });
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this item</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
