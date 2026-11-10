// One board (deck, truck or wheel), opened from the museum lists: board.html?type=decks&slug=...
const root = document.getElementById("board");
const TYPES = { decks: "Decks", trucks: "Trucks", wheels: "Wheels" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const params = new URLSearchParams(location.search);
const type = TYPES[params.get("type")] ? params.get("type") : "decks";
const slug = params.get("slug") || "";

// "Close" goes back to where you came from in the museum, or to the museum home.
const backHref = document.referrer.startsWith(location.origin) && !document.referrer.includes("board.html") ? document.referrer : "./";

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

  const brand = r.brands?.name || "";
  const title = brand ? `${momsDeckName(r)} - ${brand}` : momsDeckName(r);
  document.title = `${title} · The Museum of Mini Skateboards`;

  root.innerHTML = `
    <div class="board-img">${photo ? `<img src="${esc(photo)}" alt="${esc(title)}">` : ""}</div>
    <a class="board-close" href="${esc(backHref)}">Close</a>
    <div class="board-info">
      <h1>${esc(title)}</h1>
      <div class="board-specs">${specs(r)}</div>
      ${r.description ? `<p class="board-desc">${esc(r.description)}</p>` : ""}
      <div class="board-brand">
        <span>${esc(brand)}</span>
        <div class="board-more${type === "decks" ? "" : " square"}"></div>
      </div>
    </div>`;

  root.querySelector(".board-more").innerHTML = more.map((m) =>
    `<a href="board.html?type=${type}&slug=${encodeURIComponent(m.slug)}" title="${esc(m.name)}"><img src="${esc(m.image_path)}" alt="${esc(m.name)}" loading="lazy"></a>`).join("");
}

load().catch((err) => {
  root.innerHTML = `<div class="board-info"><h1>Couldn't load this board</h1><p>Please refresh the page.</p></div>`;
  console.error(err);
});
