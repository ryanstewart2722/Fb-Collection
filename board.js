// One board (deck, truck or wheel), opened from the museum lists: board.html?type=decks&slug=...
const root = document.getElementById("board");
const TYPES = { decks: "Decks", trucks: "Trucks", wheels: "Wheels", obstacles: "Obstacles", misc: "Misc." };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const params = new URLSearchParams(location.search);
const type = TYPES[params.get("type")] ? params.get("type") : "decks";
const slug = params.get("slug") || "";

// "Close" goes back to where you came from in the museum, or to the museum home.
const topBack = document.getElementById("top-back");
const backHref = document.referrer.startsWith(location.origin) && !document.referrer.includes("board.html") && !document.referrer.includes("/p/") ? document.referrer : "./";
if (topBack) topBack.href = backHref;   // "Back" in the header goes where you came from

// Left and right spec columns; empty values are skipped. The brand (or brands, for a collab) is the first bullet and
// links to the brand's own website once one has been added in the museum editor.
const brandBullet = (r, extras) => {
  const list = [r.brands, ...extras].filter((b) => b && b.name);
  if (!list.length) return "";
  // each brand links on its own: to its website when it has one, otherwise to that brand's boards in the museum
  const one = (b) => /^https?:\/\//i.test(b.website || "") ? `<a class="board-brand-link" href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.name)}</a>` : `<a class="board-brand-link" href="./?brand=${b.id}">${esc(b.name)}</a>`;
  return `Manufacturer: ${list.map(one).join(" x ")}`;
};
function specs(r, extras) {
  const b = r.brands || {};
  const left = [
    { html: brandBullet(r, extras) },
    r.molds?.length && `Molds: ${r.molds.join(", ")}`,
    r.graphic,
    (r.made_in || b.made_in) && `Made In ${r.made_in || b.made_in}`,
    r.shape && `Shape: ${r.shape}`,
    r.material && `Material: ${r.material}`,
    r.duro && `Duro: ${r.duro}`,
  ];
  const right = [
    r.release_date && `Release Date: ${momsDate(r.release_date, r.release_precision)}`,
    r.attributes?.drop && `Drop: ${r.attributes.drop}`,
    r.attributes?.collab && `Collab: ${r.attributes.collab}`,
    r.color && `Color: ${r.color}`,
    r.size && `Size: ${r.size}`,
  ];
  const cell = (t) => t && t.html !== undefined ? (t.html ? `<span>${t.html}</span>` : "") : t ? `<span>${esc(t)}</span>` : "";
  const col = (list) => `<div>${list.map(cell).join("")}</div>`;
  return col(left) + col(right);
}

// the re-cut list is asked for the moment the page starts, so it is already here when the In Use row needs it
const recutsP = USE_RECUTS();
const tightP = fetch("/user-cuts/tight.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));   // the small trimmed copies, asked for at page start too
async function load() {
  const { rows } = await momsFetch(`${type}?select=*,brands(id,name,slug,made_in,website)&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const r = rows[0];
  if (!r) {
    root.innerHTML = `<div class="board-info"><h1>Not found</h1><p><a href="./">Back to the museum</a></p></div>`;
    return;
  }
  const inUseP = USE[type] ? loadInUse(r).catch(() => []) : null;   // starts now, alongside More by, so both land together
  // More by the same brand: its decks, wheels, trucks, obstacles and misc. together, a random handful of each, mixed.
  let more = [];
  if (r.brand_id) {
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const perType = await Promise.all(Object.keys(TYPES).map(async (t) => {
      try {
        const q = `${t}?select=id,name,slug,image_path&brand_id=eq.${r.brand_id}${t === type ? `&id=neq.${r.id}` : ""}&image_path=not.is.null&order=id.asc`;
        const { total } = await momsFetch(`${q}&limit=1`, { count: true });
        const win = Math.min(total || 0, 60);
        if (!win) return [];
        const { rows } = await momsFetch(`${q}&limit=${win}&offset=${Math.floor(Math.random() * (total - win + 1))}`);
        return shuffle(rows).slice(0, 8).map((x) => ({ ...x, t }));
      } catch (e) { return []; }
    }));
    // take turns between the kinds so one big kind doesn't fill the row
    for (let i = 0; more.length < 8 && perType.some((l) => i < l.length); i++) perType.forEach((l) => { if (i < l.length && more.length < 8) more.push(l[i]); });
    more = shuffle(more);
  }
  const photo = r.image_path || "";

  // Previous / Next walk through this brand in the museum's order (newest first), wrapping at the ends.
  let prev = null, next = null;
  if (r.brand_id) {
    const { rows: all } = await momsFetch(
      `${type}?select=slug&brand_id=eq.${r.brand_id}&order=release_date.desc.nullslast,id.desc&limit=5000`);
    const i = all.findIndex((x) => x.slug === r.slug);
    if (i >= 0 && all.length > 1) {
      prev = all[(i - 1 + all.length) % all.length].slug;
      next = all[(i + 1) % all.length].slug;
    }
  }
  const link = (s) => `board.html?type=${type}&slug=${encodeURIComponent(s)}`;

  // other brands on the same board (collabs)
  let extras = [];
  if ((r.extra_brand_ids || []).length) {
    try { extras = (await momsFetch(`brands?select=id,name,website&id=in.(${r.extra_brand_ids.join(",")})`)).rows; } catch (e) {}
    extras.sort((x, y) => r.extra_brand_ids.indexOf(x.id) - r.extra_brand_ids.indexOf(y.id));
  }
  const brand = [r.brands?.name, ...extras.map((b) => b.name)].filter(Boolean).join(" x ");
  const title = momsDeckName(r);   // the brand now sits in the first bullet, not in the heading
  document.title = `${brand ? `${title} - ${brand}` : title} · The Museum of Mini Skateboards`;
  try { history.replaceState(null, "", `/p/${type}/${encodeURIComponent(r.slug)}/` + location.hash); } catch (e) {}   // the address people share: its preview picture is this page

  if (inUseP) await Promise.race([inUseP, new Promise((ok) => setTimeout(ok, 2500))]);   // draw In Use in the same moment as More by (never wait more than 2.5 s for it)
  root.innerHTML = `
    <div class="board-img">${photo ? `<img${/\.gif($|\?)/i.test(photo) ? ' class="gif"' : ""} src="${esc(photo)}" alt="${esc(title)}">` : ""}${r.image_path_2 ? `<img class="second${/\.gif($|\?)/i.test(r.image_path_2) ? " gif" : ""}" src="${esc(r.image_path_2)}" alt="${esc(title)} (2)">` : ""}</div>
    <a class="board-close" href="${esc(backHref)}">Close</a>
    ${prev ? `<a class="board-nav prev" href="${esc(link(prev))}">Previous</a><a class="board-nav next" href="${esc(link(next))}">Next</a>` : ""}
    <div class="board-info">
      <h1>${esc(title)}</h1>
      <button class="board-fav" type="button" hidden></button>
      <div class="board-specs">${specs(r, extras)}</div>
      <div class="board-dock">
      ${USE[type] ? `<div class="board-use"><p class="board-use-head">In Use <button type="button" class="board-submit">Submit yours</button></p>
        <form class="board-use-form" hidden><select aria-label="Choose one of your items"></select> <button type="submit">Send for review</button> <span class="board-use-msg" aria-live="polite"></span></form>
        <div class="board-use-list"></div></div>` : ""}
      <div class="board-brand${USE[type] ? "" : " push"}">
        ${r.brand_id ? `<span class="board-more-head">More by ${[r.brands, ...extras].filter((x) => x && x.name).map((x) => `<a class="board-brand-link" href="./?brand=${x.id}">${esc(x.name)}</a>`).join(" x ")}</span>` : ""}
        <div class="board-more"></div>
      </div>
      </div>
    </div>`;

  if (matchMedia("(max-width: 1100px)").matches) more = more.slice(0, 5);   // phones and tablets: five suggestions, one row
  root.querySelector(".board-more").innerHTML = more.map((m) =>
    `<a${m.t === "decks" ? "" : ' class="sq"'} href="board.html?type=${m.t}&slug=${encodeURIComponent(m.slug)}" title="${esc(m.name)}"><img src="${esc(m.image_path)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("");
  setupFavorite(r);
  if (USE[type]) setupInUse(r, inUseP);
}

/* ---------- favorites ---------- */
const sb = window.supabase ? supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: false } }) : null;
let sessionP = null;
const getSession = () => sessionP ||= sb ? sb.auth.getSession().then((x) => x.data.session) : Promise.resolve(null);
async function setupFavorite(r) {
  const btn = root.querySelector(".board-fav");
  if (!btn || !sb) return;
  const session = await getSession();
  let on = false;
  if (session) {
    const { data } = await sb.from("favorites").select("museum_id").eq("museum_type", type).eq("museum_id", r.id).maybeSingle();
    on = !!data;
  }
  const paint = () => { btn.innerHTML = `<span class="star" aria-hidden="true">${on ? "★" : "☆"}</span> ${on ? "Remove from Favorites" : "Add to Favorites"}`; btn.hidden = false; };
  paint();
  btn.addEventListener("click", async () => {
    if (!session) return (location.href = "/signin.html");
    btn.disabled = true;
    const res = on ? await sb.from("favorites").delete().eq("museum_type", type).eq("museum_id", r.id)
                   : await sb.from("favorites").insert({ museum_type: type, museum_id: r.id });
    if (!res.error) on = !on;
    btn.disabled = false; paint();
  });
}

/* ---------- in use: other people's decks and setups that are this product ---------- */
// decks list decks and setups; wheels and trucks list setups only
const USE = { decks: ["decks", "setups"], wheels: ["wheels", "setups"], trucks: ["trucks", "setups"], obstacles: ["obstacles"], misc: ["misc"] };
let RECUTS = {};
function USE_RECUTS() { return fetch("/user-cuts/index.json", { cache: "no-cache" }).then((rc) => (rc.ok ? rc.json() : {})).catch(() => ({})); }
let TIGHT = { quick: {}, sizes: {} };
const SHOW_H = 145;
async function itemPhoto(i) {
  const rc = RECUTS[i.id], pick = i.details?.cut;
  if (rc && rc.file && i.source_path && rc.src === i.source_path && pick !== "quick" && (!rc.bad || pick === "refined")) {   // the second cut, exactly as the other pages choose it
    const sz = TIGHT.sizes?.[rc.file];
    i.size = sz ? [sz[0], sz[1]] : null;
    return "/" + rc.file + "?c=1";
  }
  const q = TIGHT.quick?.[i.id];   // otherwise the first cut: its small trimmed copy is already made, so nothing is measured
  if (q && q.file && q.src === i.image_path && q.w && q.h) { i.size = [q.w, q.h]; return "/" + q.file; }
  const p = i.image_path;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  let { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);
  if (!data?.signedUrl && window.supabase) {            // a signed-in session that has just expired must not hide the photo: ask again as a visitor
    if (!window.__anonSb) window.__anonSb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    ({ data } = await window.__anonSb.storage.from("uploads").createSignedUrl(p, 3600));
  }
  return data?.signedUrl || "";
}
function trimEmpty(img, done) {
  const probe = new Image(); probe.crossOrigin = "anonymous";
  const go = () => {
    try {
      const w = probe.naturalWidth, h = probe.naturalHeight; if (!w || !h) return;
      const c = document.createElement("canvas"); const k = Math.min(1, 400 / h);
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      const x = c.getContext("2d"); x.drawImage(probe, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let t = c.height, b = -1, l = c.width, r = -1;
      for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 20) { if (y < t) t = y; if (y > b) b = y; if (xx < l) l = xx; if (xx > r) r = xx; }
      if (b < 0) return;
      const bh = b - t + 1, bw = r - l + 1;
      if (bh > c.height * 0.97) return;
      const f = 145 / bh;                                  // same tall box the suggestions use
      img.style.height = Math.round(h * k * f) + "px";
      img.style.marginTop = img.style.marginBottom = "0";
      const wrap = img.parentElement; wrap.style.display = "block"; wrap.style.overflow = "hidden";
      wrap.style.height = "145px"; wrap.style.width = Math.round(bw * f) + "px";
      img.style.marginLeft = -Math.round(l * f) + "px"; img.style.marginTop = -Math.round(t * f) + "px";
      img.style.maxWidth = "none";
    } catch (e) {}
  };
  probe.onload = () => { go(); if (done) done(); }; probe.onerror = () => { if (done) done(); }; probe.src = img.src;
}

async function loadInUse(r) {
  const secs = USE[type];
  const q = `collection_items?select=id,section,name,image_path,source_path,details,profiles!inner(username,display_name),links:collection_item_links!inner(museum_type,museum_id,link_status)&links.museum_type=eq.${type}&links.museum_id=eq.${r.id}&links.link_status=eq.approved&status=eq.approved&section=in.(${secs.join(",")})&order=created_at.desc&limit=24`;
  const [res, recuts, tight] = await Promise.all([fetch(`${MOMS.url}/rest/v1/${q}`, { headers: { apikey: MOMS.key } }), recutsP, tightP]);
  RECUTS = recuts || {};
  TIGHT = { quick: tight?.quick || {}, sizes: tight?.sizes || {} };
  const items = res.ok ? await res.json() : [];
  const withPhoto = (await Promise.all(items.map(async (i) => { const url = await itemPhoto(i).catch(() => ""); return { ...i, url }; }))).filter((i) => i.url);
  withPhoto.forEach((i) => { const p = new Image(); p.src = i.url; });   // photos start downloading now, before the row is drawn
  return withPhoto;
}

async function setupInUse(r, inUseP) {
  const box = root.querySelector(".board-use"), list = box.querySelector(".board-use-list"), form = box.querySelector(".board-use-form");
  const secs = USE[type];
  const withPhoto = await inUseP;
  list.innerHTML = withPhoto.map((i) => {
    const who = i.profiles?.display_name || i.profiles?.username || "";
    const sized = i.size && i.size[0] && i.size[1];   // a finished, trimmed picture of known size: its exact space is held from the start
    const style = sized ? ` style="width:${Math.round(i.size[0] * SHOW_H / i.size[1])}px;height:${SHOW_H}px"` : "";
    return `<a${i.section === "decks" || i.section === "setups" ? "" : ' class="sq"'} href="/u/${encodeURIComponent(i.profiles.username)}" title="${esc(who)}${i.name ? " \u00b7 " + esc(i.name) : ""}"><img${sized ? ' class="cut"' : ""}${style} src="${esc(i.url)}" alt="${esc(i.name)}" loading="lazy" decoding="async"></a>`;
  }).join("");
  if (!withPhoto.length) list.innerHTML = `<span class="board-use-empty">No one has added this yet.</span>`;
  // Live re-cut photos are already tight, so they show right away with no measuring. Only raw photos (no re-cut yet) are trimmed, and each stays hidden until it is.
  list.querySelectorAll("img:not(.cut)").forEach((im) => {
    const show = () => im.closest("a")?.classList.add("ready");
    trimEmpty(im, show); setTimeout(show, 4000);
  });

  // Submit yours: pick one of your own items from a dropdown (no new photo)
  box.querySelector(".board-submit").addEventListener("click", async () => {
    const session = await getSession();
    if (!session) return (location.href = "/signin.html");
    if (!form.hidden) return (form.hidden = true);
    const msg = form.querySelector(".board-use-msg"), sel = form.querySelector("select");
    msg.textContent = "";
    const { data: mine } = await sb.from("collection_items").select("id,section,name,links:collection_item_links(museum_type,museum_id)").eq("user_id", session.user.id).in("section", secs).neq("status", "removed").order("section").order("name");
    const names = { decks: "Deck", setups: "Setup", wheels: "Wheels", trucks: "Trucks", obstacles: "Obstacle", misc: "Misc." };
    const opts = (mine || []).filter((m) => !(m.links || []).some((l) => l.museum_type === type && l.museum_id === r.id));
    sel.innerHTML = opts.length ? `<option value="">Choose from your collection…</option>` + opts.map((m) => `<option value="${esc(m.id)}">${secs.length > 1 ? esc(names[m.section]) + " · " : ""}${esc(m.name)}</option>`).join("") : `<option value="">You have nothing to choose from yet</option>`;
    form.hidden = false;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sel = form.querySelector("select"), msg = form.querySelector(".board-use-msg");
    if (!sel.value) return (msg.textContent = "Choose one first.");
    const { data, error } = await sb.from("collection_item_links").insert({ item_id: sel.value, museum_type: type, museum_id: r.id }).select("link_status").maybeSingle();
    msg.textContent = error ? "Couldn't send that. " + error.message : data?.link_status === "approved" ? "Added. Refresh to see it." : "Sent. It shows here once it's approved.";   // the museum's owner skips the review
    if (!error) sel.querySelector(`option[value="${sel.value}"]`)?.remove();
  });
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this board</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
