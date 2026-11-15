// One board (deck, truck or wheel), opened from the museum lists: board.html?type=decks&slug=...
const root = document.getElementById("board");
const TYPES = { decks: "Decks", trucks: "Trucks", wheels: "Wheels", obstacles: "Obstacles", misc: "Misc." };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const params = new URLSearchParams(location.search);
const type = TYPES[params.get("type")] ? params.get("type") : "decks";
const slug = params.get("slug") || "";

// "Close" goes back to where you came from in the museum, or to the museum home.
const topBack = document.getElementById("top-back");
const backHref = document.referrer.startsWith(location.origin) && !document.referrer.includes("board.html") ? document.referrer : "./";
if (topBack) topBack.href = backHref;   // "Back" in the header goes where you came from

// Left and right spec columns; empty values are skipped. The brand (or brands, for a collab) is the first bullet and
// links to the brand's own website once one has been added in the museum editor.
const brandBullet = (r, extras) => {
  const list = [r.brands, ...extras].filter((b) => b && b.name);
  if (!list.length) return "";
  const one = (b) => /^https?:\/\//i.test(b.website || "") ? `<a class="board-brand-link" href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.name)}</a>` : esc(b.name);
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

async function load() {
  const { rows } = await momsFetch(`${type}?select=*,brands(id,name,slug,made_in,website)&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const r = rows[0];
  if (!r) {
    root.innerHTML = `<div class="board-info"><h1>Not found</h1><p><a href="./">Back to the museum</a></p></div>`;
    return;
  }
  // The brand's other photos, shown below.
  // A random handful from the same brand: count them, read a window at a random place, shuffle it.
  let more = [];
  if (r.brand_id) {
    const q = `${type}?select=id,name,slug,image_path&brand_id=eq.${r.brand_id}&id=neq.${r.id}&image_path=not.is.null&order=id.asc`;
    const { total } = await momsFetch(`${q}&limit=1`, { count: true });
    const win = Math.min(total || 0, 120);
    if (win) {
      const { rows } = await momsFetch(`${q}&limit=${win}&offset=${Math.floor(Math.random() * (total - win + 1))}`);
      for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
      more = rows.slice(0, 8);
    }
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

  root.innerHTML = `
    <div class="board-img">${photo ? `<img${/\.gif($|\?)/i.test(photo) ? ' class="gif"' : ""} src="${esc(photo)}" alt="${esc(title)}">` : ""}${r.image_path_2 ? `<img class="second${/\.gif($|\?)/i.test(r.image_path_2) ? " gif" : ""}" src="${esc(r.image_path_2)}" alt="${esc(title)} (2)">` : ""}</div>
    <a class="board-close" href="${esc(backHref)}">Close</a>
    ${prev ? `<a class="board-nav prev" href="${esc(link(prev))}">Previous</a><a class="board-nav next" href="${esc(link(next))}">Next</a>` : ""}
    <div class="board-info">
      <button class="board-fav" type="button" hidden></button>
      <h1>${esc(title)}</h1>
      <div class="board-specs">${specs(r, extras)}</div>
      ${USE[type] ? `<div class="board-use"><p class="board-use-head">In Use <button type="button" class="board-submit">Submit yours</button></p>
        <form class="board-use-form" hidden><select aria-label="Choose one of your items"></select> <button type="submit">Send for review</button> <span class="board-use-msg" aria-live="polite"></span></form>
        <div class="board-use-list"></div></div>` : ""}
      <div class="board-brand${USE[type] ? "" : " push"}">
        ${r.brand_id ? `<a class="board-more-head" href="./?brand=${r.brand_id}">More by ${esc(brand)}</a>` : ""}
        <div class="board-more${type === "decks" ? "" : " square"}"></div>
      </div>
    </div>`;

  if (matchMedia("(max-width: 1100px)").matches) more = more.slice(0, 6);   // phones and tablets: six suggestions
  root.querySelector(".board-more").innerHTML = more.map((m) =>
    `<a href="board.html?type=${type}&slug=${encodeURIComponent(m.slug)}" title="${esc(m.name)}"><img src="${esc(m.image_path)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("");
  setupFavorite(r);
  if (USE[type]) setupInUse(r);
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
const USE = { decks: ["decks", "setups"], wheels: ["setups"], trucks: ["setups"] };
let RECUTS = {};
async function itemPhoto(i) {
  const rc = RECUTS[i.id], pick = i.details?.cut;
  if (rc && rc.file && i.source_path && rc.src === i.source_path && pick !== "quick" && (!rc.bad || pick === "refined")) return "/" + rc.file + "?c=1";
  const p = i.image_path;
  if (!p) return "";
  if (/^https?:/.test(p)) return p;
  const { data } = await sb.storage.from("uploads").createSignedUrl(p, 3600);
  return data?.signedUrl || "";
}
async function setupInUse(r) {
  const box = root.querySelector(".board-use"), list = box.querySelector(".board-use-list"), form = box.querySelector(".board-use-form");
  const secs = USE[type];
  try { const rc = await fetch("/user-cuts/index.json", { cache: "no-cache" }); if (rc.ok) RECUTS = await rc.json(); } catch (e) {}
  const q = `collection_items?select=id,section,name,image_path,source_path,details,profiles!inner(username,display_name)&museum_type=eq.${type}&museum_id=eq.${r.id}&link_status=eq.approved&status=eq.approved&section=in.(${secs.join(",")})&order=created_at.desc&limit=24`;
  const res = await fetch(`${MOMS.url}/rest/v1/${q}`, { headers: { apikey: MOMS.key } });
  const items = res.ok ? await res.json() : [];
  const withPhoto = (await Promise.all(items.map(async (i) => ({ ...i, url: await itemPhoto(i) })))).filter((i) => i.url);
  list.innerHTML = withPhoto.map((i) => {
    const who = i.profiles?.display_name || i.profiles?.username || "";
    return `<a href="/u/${encodeURIComponent(i.profiles.username)}" title="${esc(who)}${i.name ? " · " + esc(i.name) : ""}"><img src="${esc(i.url)}" alt="${esc(i.name)}" loading="lazy"></a>`;
  }).join("");

  // Submit yours: pick one of your own items from a dropdown (no new photo)
  box.querySelector(".board-submit").addEventListener("click", async () => {
    const session = await getSession();
    if (!session) return (location.href = "/signin.html");
    if (!form.hidden) return (form.hidden = true);
    const msg = form.querySelector(".board-use-msg"), sel = form.querySelector("select");
    msg.textContent = "";
    const { data: mine } = await sb.from("collection_items").select("id,section,name,museum_type,museum_id,link_status").eq("user_id", session.user.id).in("section", secs).neq("status", "removed").order("section").order("name");
    const names = { decks: "Deck", setups: "Setup" };
    const opts = (mine || []).filter((m) => !(m.museum_type === type && m.museum_id === r.id));
    sel.innerHTML = opts.length ? `<option value="">Choose from your collection…</option>` + opts.map((m) => `<option value="${esc(m.id)}">${secs.length > 1 ? esc(names[m.section]) + " · " : ""}${esc(m.name)}</option>`).join("") : `<option value="">You have nothing to choose from yet</option>`;
    form.hidden = false;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sel = form.querySelector("select"), msg = form.querySelector(".board-use-msg");
    if (!sel.value) return (msg.textContent = "Choose one first.");
    const { data, error } = await sb.from("collection_items").update({ museum_type: type, museum_id: r.id }).eq("id", sel.value).select("link_status").maybeSingle();
    msg.textContent = error ? "Couldn't send that. " + error.message : data?.link_status === "approved" ? "Added. Refresh to see it." : "Sent. It shows here once it's approved.";   // the museum's owner skips the review
    if (!error) sel.querySelector(`option[value="${sel.value}"]`)?.remove();
  });
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this board</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
