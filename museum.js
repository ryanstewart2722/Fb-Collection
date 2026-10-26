// The Museum of Mini Skateboards: Decks, Trucks and Wheels read live from the database.
const app = document.getElementById("app");
const preview = document.querySelector(".preview");
const canHover = matchMedia("(hover: hover)").matches;
const PAGE = 100; // rows loaded per section at a time

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const spans = (list) => list.map((c) => `<span>${esc(c)}</span>`).join("");
const brandName = (r) => r.brands?.name || "";

// Columns follow the Figma frames.
const SECTIONS = [
  { type: "decks", title: "Decks", square: false,
    select: "id,brand_id,name,slug,color,size,release_date,release_precision,image_path,brands(name,slug)",
    cols: [["Deck name", (r) => r.name], ["Color", (r) => r.color], ["Year", (r) => momsYear(r.release_date)], ["Manufacturer", brandName]] },
  { type: "trucks", title: "Trucks", square: true,
    select: "id,brand_id,name,slug,color,size,release_date,release_precision,image_path,brands(name,slug)",
    cols: [["Manufacturer", (r) => r.name], ["Color", (r) => r.color], ["Size", (r) => r.size]] },
  { type: "wheels", title: "Wheels", square: true,
    select: "id,brand_id,name,slug,color,material,duro,release_date,release_precision,image_path,brands(name,slug)",
    cols: [["Wheel/manufacturer", (r) => r.name], ["Color", (r) => r.color], ["Material", (r) => r.material], ["Duro", (r) => r.duro]] },
];
SECTIONS.forEach((s) => Object.assign(s, { rows: [], total: 0 }));

// A board's own photo, or nothing (boards without one are left out of the image view).
const photoFor = (s, r) => r.image_path || "";

// View and sort live in the address (?view=image&sort=brand) so they can be shared.
const params = new URLSearchParams(location.search);
let view = params.get("view") === "image" ? "image" : "list";
let sort = params.get("sort") === "brand" ? "brand" : "newest";

const ORDER = {
  newest: "release_date.desc.nullslast,id.desc",
  brand: "brands(name).asc,release_date.desc.nullslast,id.desc",
};
// Lines go between drops (same release date) when newest-first, and between brands when by brand.
const groupKey = (r) => (sort === "brand" ? r.brands?.slug : r.release_date);
const boardUrl = (s, r) => `board.html?type=${s.type}&slug=${encodeURIComponent(r.slug)}`;

async function loadSection(s, reset) {
  if (reset) s.rows = [];
  const { rows, total } = await momsFetch(
    `${s.type}?select=${s.select}&order=${ORDER[sort]}&limit=${PAGE}&offset=${s.rows.length}`, { count: true });
  s.rows.push(...rows);
  s.total = total;
}

async function loadAll() {
  await Promise.all(SECTIONS.map((s) => loadSection(s, true)));
  render();
}

function showPreview(src) {
  if (!src) return hidePreview();
  preview.src = src;
  preview.classList.add("show");
}
function hidePreview() { preview.classList.remove("show"); }

function clearActive() {
  document.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
  document.querySelectorAll(".hovering").forEach((x) => x.classList.remove("hovering"));
  document.querySelectorAll(".bar.show").forEach((x) => x.classList.remove("show"));
  hidePreview();
}

// Mouse: hover previews, click opens the board. Touch: first tap previews, second tap opens it.
function bindItem(el, url, activate) {
  if (canHover) {
    el.addEventListener("mouseenter", () => activate(el));
    el.addEventListener("click", () => (location.href = url));
    return;
  }
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (el.classList.contains("on")) location.href = url;
    else activate(el);
  });
}
if (!canHover) {
  document.body.classList.add("touch");
  document.addEventListener("click", clearActive);
}

const moreButton = (s, si) => s.rows.length < s.total
  ? `<button class="more" data-s="${si}">Show more ${esc(s.title.toLowerCase())} (${s.total - s.rows.length})</button>` : "";

/* ---------- List view ---------- */
function renderList() {
  app.innerHTML = SECTIONS.map((s, si) => !s.rows.length ? "" : `
    <section class="list-section">
      <h2>${esc(s.title)}</h2>
      <div class="list-wrap"><div class="list" data-s="${si}">
        <div class="row head">${spans(s.cols.map((c) => c[0]))}</div>
        ${s.rows.map((r, i) => `<div class="row link${i > 0 && groupKey(r) !== groupKey(s.rows[i - 1]) ? " divide" : ""}" data-i="${i}">${spans(s.cols.map((c) => c[1](r)))}</div>`).join("")}
      </div></div>
      ${moreButton(s, si)}
    </section>`).join("");

  app.querySelectorAll(".list").forEach((list) => {
    const s = SECTIONS[list.dataset.s];
    list.querySelectorAll(".row:not(.head)").forEach((row) => {
      const r = s.rows[row.dataset.i];
      bindItem(row, boardUrl(s, r), () => {
        clearActive();
        row.classList.add("on");
        showPreview(photoFor(s, r));
      });
      if (canHover) row.addEventListener("mouseleave", clearActive);
    });
  });
}

/* ---------- Image view ---------- */
function renderGrid() {
  app.innerHTML = SECTIONS.map((s, si) => {
    const rows = s.rows.filter((r) => photoFor(s, r));
    if (!rows.length) return "";
    return `<section class="grid-section">
      <h2>${esc(s.title)}</h2>
      <div class="grid${s.square ? " square" : ""}" data-s="${si}">
        ${rows.map((r) => `<div class="item link" data-i="${s.rows.indexOf(r)}"><img src="${esc(photoFor(s, r))}" alt="${esc(r.name)}" loading="lazy"></div>`).join("")}
        <div class="bar"></div>
      </div>
      ${moreButton(s, si)}
    </section>`;
  }).join("");

  app.querySelectorAll(".grid").forEach((grid) => {
    const s = SECTIONS[grid.dataset.s];
    const bar = grid.querySelector(".bar");
    grid.querySelectorAll(".item").forEach((el) => {
      const r = s.rows[el.dataset.i];
      bindItem(el, boardUrl(s, r), () => {
        clearActive();
        el.classList.add("on");
        grid.classList.add("hovering");
        const img = el.querySelector("img");
        const gap = parseFloat(getComputedStyle(grid).rowGap);
        bar.style.top = el.offsetTop + img.offsetHeight + gap / 2 - 16 + "px";
        bar.innerHTML = spans(s.cols.map((c) => c[1](r)));
        bar.classList.add("show");
        showPreview(photoFor(s, r));
      });
    });
    if (canHover) grid.addEventListener("mouseleave", clearActive);
  });
}

function render() {
  clearActive();
  document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.querySelectorAll("[data-sort]").forEach((a) => a.classList.toggle("active", a.dataset.sort === sort));
  view === "list" ? renderList() : renderGrid();
}

function saveState() {
  const p = new URLSearchParams();
  if (view === "image") p.set("view", "image");
  if (sort === "brand") p.set("sort", "brand");
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
}

document.querySelectorAll("[data-view]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  view = a.dataset.view; saveState(); render();
}));
document.querySelectorAll("[data-sort]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  if (sort === a.dataset.sort) return;
  sort = a.dataset.sort; saveState(); loadAll();
}));
app.addEventListener("click", async (e) => {
  const btn = e.target.closest(".more");
  if (!btn) return;
  e.stopPropagation();
  btn.disabled = true;
  await loadSection(SECTIONS[btn.dataset.s], false);
  render();
});

loadAll().catch((err) => {
  app.innerHTML = `<p class="load-error">Couldn't load the archive. Please refresh the page.</p>`;
  console.error(err);
});
