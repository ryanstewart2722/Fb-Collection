// The Museum of Mini Skateboards: Decks, Trucks and Wheels read live from the database.
const app = document.getElementById("app");
const preview = document.querySelector(".preview");
const canHover = matchMedia("(hover: hover)").matches;
// "Mobile" = a touch screen or a narrow window: the image view then follows your scrolling instead of hovering.
const narrow = matchMedia("(max-width: 760px)");
const isMobile = () => !canHover || narrow.matches;
const PAGE = 100; // rows loaded per section at a time

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const spans = (list) => list.map((c) => `<span>${esc(c)}</span>`).join("");
const brandName = (r) => r.brands?.name || "";

// Columns follow the Figma frames.
const SECTIONS = [
  { type: "decks", title: "Decks", square: false,
    select: "id,brand_id,name,mold_code,slug,color,size,release_date,release_precision,image_path,hover_image_path,brands(name,slug)",
    cols: [["Deck name", (r) => momsDeckName(r)], ["Color", (r) => r.color], ["Year", (r) => momsYear(r.release_date)], ["Manufacturer", brandName]] },
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

// Refine filters live in the address too, e.g. ?brand=11&mold=Freshwater&size=30-33&color=Black&from=2025-01
const F = { brand: [], mold: [], shape: [], color: [], year: [], size: ["", ""] };
(function readFilters() {
  F.brand = params.getAll("brand").filter((x) => /^\d+$/.test(x));
  F.mold = params.getAll("mold"); F.shape = params.getAll("shape"); F.color = params.getAll("color");
  const sz = (params.get("size") || "").split("-");
  F.size = [/^\d+(\.\d+)?$/.test(sz[0] || "") ? sz[0] : "", /^\d+(\.\d+)?$/.test(sz[1] || "") ? sz[1] : ""];
  F.year = params.getAll("year").filter((y) => /^\d{4}$/.test(y));
})();
const filterCount = () => F.brand.length + F.mold.length + F.shape.length + F.color.length + (F.size[0] || F.size[1] ? 1 : 0) + F.year.length;

// The database query for the active filters, or null when a filter can't apply to this kind of board
// (wheels have no mold or size; trucks and wheels have no mold or shape).
function filterParams(s) {
  const wantsSize = F.size[0] || F.size[1];
  if ((F.mold.length || F.shape.length) && s.type !== "decks") return null;
  if (wantsSize && s.type === "wheels") return null;
  const q = [];
  if (F.brand.length) q.push(`brand_id=in.(${F.brand.join(",")})`);
  if (F.mold.length) q.push("molds=ov." + encodeURIComponent("{" + F.mold.map((m) => '"' + m.replace(/(["\\])/g, "\\$1") + '"').join(",") + "}"));
  if (F.shape.length) q.push("shape=in." + encodeURIComponent("(" + F.shape.map((m) => '"' + m.replace(/(["\\])/g, "\\$1") + '"').join(",") + ")"));
  // "any of these colors" and "any of these years" are each an OR group; the groups are ANDed together
  const any = [];
  if (F.color.length) any.push("or(" + F.color.map((c) => `color.ilike.*${c.replace(/[,()*]/g, "")}*`).join(",") + ")");
  if (F.year.length) any.push("or(" + F.year.map((y) => `and(release_date.gte.${y}-01-01,release_date.lt.${+y + 1}-01-01)`).join(",") + ")");
  if (any.length) q.push("and=" + encodeURIComponent("(" + any.join(",") + ")"));
  if (F.size[0]) q.push(`size_mm=gte.${F.size[0]}`);
  if (F.size[1]) q.push(`size_mm=lte.${F.size[1]}`);
  return q.join("&");
}

// Newest first, unless a year is chosen: then that year reads in order, January to December.
const chronological = () => F.year.length > 0;
const orderBy = () => {
  const dir = chronological() ? "asc" : "desc";
  return (sort === "brand" ? "brands(name).asc," : "") + `release_date.${dir}.nullslast,id.${dir}`;
};
// A line goes between two rows only when the brand changes (in both Newest and Brand order).
const groupKey = (r) => r.brands?.slug;
const boardUrl = (s, r) => `board.html?type=${s.type}&slug=${encodeURIComponent(r.slug)}`;

async function loadSection(s, reset) {
  if (reset) s.rows = [];
  const fp = filterParams(s);
  if (fp === null) { s.rows = []; s.total = 0; return; }
  const { rows, total } = await momsFetch(
    `${s.type}?select=${s.select}&order=${orderBy()}&limit=${PAGE}&offset=${s.rows.length}${fp ? "&" + fp : ""}`, { count: true });
  s.rows.push(...rows);
  s.total = total;
}

let loadSeq = 0;
async function loadAll() {
  const mine = ++loadSeq;                 // ignore a slow older request if filters changed again
  app.classList.add("loading");
  await Promise.all(SECTIONS.map((s) => loadSection(s, true)));
  if (mine !== loadSeq) return;
  render();
  if (!app.children.length) {
    app.innerHTML = filterCount()
      ? `<p class="empty">No boards match these filters. <button type="button" class="linklike" data-clear>Clear filters</button></p>`
      : `<p class="empty">Nothing here yet.</p>`;
  }
  app.classList.remove("loading");
  document.dispatchEvent(new Event("museum:loaded"));
}

function showPreview(src) {
  if (!src) return hidePreview();
  preview.src = src;
  preview.classList.add("show");
}
function hidePreview() { preview.classList.remove("show"); }

let activeUrl = null;   // the board the big preview is showing (mobile image view)
let scrubGrids = [];    // image-view grids that follow the scroll position

function clearActive() {
  activeUrl = null;
  document.querySelectorAll(".row.on, .item.on").forEach((x) => x.classList.remove("on"));
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
  document.addEventListener("click", () => { if (view === "list") clearActive(); });
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
        showPreview(r.hover_image_path || photoFor(s, r));
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

  scrubGrids = [];
  const mobile = isMobile();
  document.body.classList.toggle("scrub", mobile);
  app.querySelectorAll(".grid").forEach((grid) => {
    const s = SECTIONS[grid.dataset.s];
    const bar = grid.querySelector(".bar");
    const els = [...grid.querySelectorAll(".item")];

    const activate = (el) => {
      clearActive();
      const r = s.rows[el.dataset.i];
      el.classList.add("on");
      grid.classList.add("hovering");
      if (!mobile) {   // desktop: the bar sits in the gap under the hovered row
        const img = el.querySelector("img");
        const gap = parseFloat(getComputedStyle(grid).rowGap);
        bar.style.top = el.offsetTop + img.offsetHeight + gap / 2 - 16 + "px";
      }
      bar.innerHTML = spans(s.cols.map((c) => c[1](r)));
      bar.classList.add("show");
      activeUrl = boardUrl(s, r);
      showPreview(r.hover_image_path || photoFor(s, r));
    };

    if (mobile) {
      els.forEach((el) => el.addEventListener("click", () => (location.href = boardUrl(s, s.rows[el.dataset.i]))));
      bar.addEventListener("click", () => activeUrl && (location.href = activeUrl));
      scrubGrids.push({ grid, els, activate });
    } else {
      els.forEach((el) => bindItem(el, boardUrl(s, s.rows[el.dataset.i]), () => activate(el)));
      if (canHover) grid.addEventListener("mouseleave", clearActive);
    }
  });
  scrubUpdate();
}

// Mobile image view: the board at a fixed line on the screen (a bit above the middle) is the active one.
// Scrolling moves through the boards in order, so the big photo and the info bar change as you scroll.
let scrubPending = false;
let scrubEl = null;
function scrubUpdate() {
  scrubPending = false;
  if (view !== "image" || !isMobile() || !scrubGrids.length || document.body.classList.contains("rf-open")) return;
  const focus = innerHeight * 0.45;
  for (const g of scrubGrids) {
    const rect = g.grid.getBoundingClientRect();
    if (focus < rect.top || focus > rect.bottom || !g.els.length) continue;
    const first = g.els[0].offsetTop;
    const cols = g.els.filter((e) => e.offsetTop === first).length || 1;
    const pitch = g.els[cols] ? g.els[cols].offsetTop - first : g.els[0].offsetHeight + parseFloat(getComputedStyle(g.grid).rowGap);
    const idx = Math.max(0, Math.min(g.els.length - 1, Math.floor(((focus - rect.top - first) / pitch) * cols)));
    if (g.els[idx] !== scrubEl || !activeUrl) { scrubEl = g.els[idx]; g.activate(scrubEl); }
    return;
  }
  scrubEl = null;
  clearActive();
}
const scrubSoon = () => { if (!scrubPending) { scrubPending = true; requestAnimationFrame(scrubUpdate); } };
addEventListener("scroll", scrubSoon, { passive: true });
addEventListener("resize", scrubSoon);
preview.addEventListener("click", () => { if (view === "image" && isMobile() && activeUrl) location.href = activeUrl; });
narrow.addEventListener("change", () => render());

function render() {
  scrubEl = null;
  document.body.classList.remove("scrub");
  clearActive();
  document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.querySelectorAll("[data-sort]").forEach((a) => a.classList.toggle("active", a.dataset.sort === sort));
  const newestLink = document.querySelector('[data-sort="newest"]');
  if (newestLink) newestLink.textContent = chronological() ? "Chronological" : "Newest";
  view === "list" ? renderList() : renderGrid();
}

function saveState() {
  const p = new URLSearchParams();
  if (view === "image") p.set("view", "image");
  if (sort === "brand") p.set("sort", "brand");
  F.brand.forEach((v) => p.append("brand", v)); F.mold.forEach((v) => p.append("mold", v));
  F.shape.forEach((v) => p.append("shape", v)); F.color.forEach((v) => p.append("color", v));
  if (F.size[0] || F.size[1]) p.set("size", F.size.join("-"));
  F.year.forEach((v) => p.append("year", v));
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
