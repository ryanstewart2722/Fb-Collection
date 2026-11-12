// One board (deck, truck or wheel), opened from the museum lists: board.html?type=decks&slug=...
const root = document.getElementById("board");
const TYPES = { decks: "Decks", trucks: "Trucks", wheels: "Wheels" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const params = new URLSearchParams(location.search);
const type = TYPES[params.get("type")] ? params.get("type") : "decks";
const slug = params.get("slug") || "";

// "Close" goes back to where you came from in the museum, or to the museum home.
const topBack = document.getElementById("top-back");
const backHref = document.referrer.startsWith(location.origin) && !document.referrer.includes("board.html") ? document.referrer : "./";
if (topBack) topBack.href = backHref;   // "Back" in the header goes where you came from

// Left and right spec columns; empty values are skipped.
function specs(r) {
  const b = r.brands || {};
  const left = [
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
  const col = (list) => `<div>${list.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;
  return col(left) + col(right);
}

async function load() {
  const { rows } = await momsFetch(`${type}?select=*,brands(id,name,slug,made_in)&slug=eq.${encodeURIComponent(slug)}&limit=1`);
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
    try { extras = (await momsFetch(`brands?select=id,name&id=in.(${r.extra_brand_ids.join(",")})`)).rows; } catch (e) {}
    extras.sort((x, y) => r.extra_brand_ids.indexOf(x.id) - r.extra_brand_ids.indexOf(y.id));
  }
  const brand = [r.brands?.name, ...extras.map((b) => b.name)].filter(Boolean).join(" x ");
  const title = brand ? `${momsDeckName(r)} - ${brand}` : momsDeckName(r);
  document.title = `${title} · The Museum of Mini Skateboards`;

  root.innerHTML = `
    <div class="board-img">${photo ? `<img${/\.gif($|\?)/i.test(photo) ? ' class="gif"' : ""} src="${esc(photo)}" alt="${esc(title)}">` : ""}${r.image_path_2 ? `<img class="second${/\.gif($|\?)/i.test(r.image_path_2) ? " gif" : ""}" src="${esc(r.image_path_2)}" alt="${esc(title)} (2)">` : ""}</div>
    <a class="board-close" href="${esc(backHref)}">Close</a>
    ${prev ? `<a class="board-nav prev" href="${esc(link(prev))}">Previous</a><a class="board-nav next" href="${esc(link(next))}">Next</a>` : ""}
    <div class="board-info">
      <h1>${esc(title)}</h1>
      <div class="board-specs">${specs(r)}</div>
      <div class="board-brand">
        ${r.brand_id ? [`<a class="board-brand-link" href="./?brand=${r.brand_id}">${esc(r.brands?.name || "")}</a>`, ...extras.map((b) => `<a class="board-brand-link" href="./?brand=${b.id}">${esc(b.name)}</a>`)].join(" x ") : `<span>${esc(brand)}</span>`}
        <div class="board-more${type === "decks" ? "" : " square"}"></div>
      </div>
    </div>`;

  if (matchMedia("(max-width: 1100px)").matches) more = more.slice(0, 6);   // phones and tablets: six suggestions
  root.querySelector(".board-more").innerHTML = more.map((m) =>
    `<a href="board.html?type=${type}&slug=${encodeURIComponent(m.slug)}" title="${esc(m.name)}"><img src="${esc(m.image_path)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("");
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this board</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
