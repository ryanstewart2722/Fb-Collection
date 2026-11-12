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
    select: "id,brand_id,name,mold_code,drop_no,drop_title,slug,color,size,release_date,release_precision,image_path,brands(name,slug)",
    cols: [["Deck name", (r) => momsDeckName(r)], ["Manufacturer", brandName], ["Year", (r) => momsYear(r.release_date)], ["Color", (r) => r.color]] },
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
const F = { brand: [], mold: [], shape: [], color: [], year: [], size: ["", ""], order: "" };
(function readFilters() {
  F.brand = params.getAll("brand").filter((x) => /^\d+$/.test(x));
  F.mold = params.getAll("mold"); F.shape = params.getAll("shape"); F.color = params.getAll("color");
  const sz = (params.get("size") || "").split("-");
  F.size = [/^\d+(\.\d+)?$/.test(sz[0] || "") ? sz[0] : "", /^\d+(\.\d+)?$/.test(sz[1] || "") ? sz[1] : ""];
  F.year = params.getAll("year").filter((y) => /^\d{4}$/.test(y));
  F.order = ["new", "old"].includes(params.get("order")) ? params.get("order") : "";
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
// An explicit choice in Refine ("New to old" / "Old to new") wins over both.
const releaseDir = () => (F.order === "old" ? "asc" : F.order === "new" ? "desc" : F.year.length ? "asc" : "desc");
const chronological = () => releaseDir() === "asc";
const orderBy = () => {
  const dir = releaseDir();
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

// Photos of any width stay on the grid's columns: a photo takes as many columns as its own proportions need
// (a normal board takes one, a group shot maybe two or three), always starting at a column edge.
function fitItem(item) {
  const img = item.querySelector("img");
  if (!img || !img.naturalHeight) return;
  if (img.dataset.gifFit) { item.classList.remove("wide"); item.style.gridColumn = ""; return; }   // a GIF keeps one cell like every other deck
  const grid = item.parentElement, cs = getComputedStyle(grid);
  const tracks = cs.gridTemplateColumns.split(" ").map(parseFloat);
  const cols = tracks.length, cell = tracks[0];
  const inner = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const gap = cols > 1 ? (inner - cols * cell) / (cols - 1) : 0;      // columns are spread edge to edge
  const need = item.offsetHeight * img.naturalWidth / img.naturalHeight;
  let span = 1;
  while (span < cols && span * cell + (span - 1) * gap < need - 2) span++;
  item.classList.toggle("wide", span > 1);
  item.style.gridColumn = span > 1 ? `span ${span}` : "";
}
// Trucks and wheels: measure the product inside its square photo and scale it so the longest side is the same
// share of the box everywhere, centred. Photos that can't be read (no CORS) keep the default scale in the CSS.
function normalizeSquare(img) {
  try {
    const n = 96, c = document.createElement("canvas"); c.width = c.height = n;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (d[(y * n + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return;
    const bw = (x1 - x0 + 1) / n, bh = (y1 - y0 + 1) / n;
    const k = 0.78 / Math.max(bw, bh);
    const tx = (0.5 - (x0 + x1 + 1) / 2 / n) * 100, ty = (0.5 - (y0 + y1 + 1) / 2 / n) * 100;
    img.style.transform = `scale(${k.toFixed(3)}) translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%)`;
  } catch (e) { /* tainted canvas: leave the CSS default */ }
}
// A GIF is kept at its original size, so its board may fill only part of the frame. Scale it so the board is as tall as the others.
const gifScale = new Map();
const gifAsked = new Set();
// Enlarge a GIF so its board is as tall as the other decks, keeping the board's top edge where an ordinary deck photo's top edge would be.
function applyGifScale(src) {
  const g = gifScale.get(src);
  Object.assign(preview.style, g ? { transformOrigin: `50% ${(g.t * 100).toFixed(2)}%`, translate: `0 ${(-g.t * 100).toFixed(2)}%`, scale: g.s } : { transformOrigin: "", translate: "", scale: "" });
}
function measureGif(src, done) {   // finds how tall the board is inside a GIF (1 = fills it) and remembers the enlargement
  if (!/\.gif($|\?)/i.test(src) || gifAsked.has(src)) return;
  gifAsked.add(src);
  const probe = new Image(); probe.crossOrigin = "anonymous";
  probe.onload = () => {
    try {
      const c = document.createElement("canvas"); c.width = probe.naturalWidth; c.height = probe.naturalHeight;
      const x = c.getContext("2d"); x.drawImage(probe, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let top = c.height, bot = -1;
      for (let y = 0; y < c.height; y++) for (let i = y * c.width * 4 + 3, e = i + c.width * 4; i < e; i += 4) if (d[i] > 40) { top = Math.min(top, y); bot = y; break; }
      const f = (bot - top + 1) / c.height;
      if (bot >= 0 && f > 0.2 && f < 0.98) { gifScale.set(src, { s: 1 / f, t: top / c.height }); if (preview.src === src) applyGifScale(src); }
    } catch (e) { /* no pixel access: leave it as is */ }
    done && done();
  };
  probe.src = src;
}
   // GIF url -> how much to enlarge it so its board matches the other decks
function fitGif(img) {
  if (!/\.gif($|\?)/i.test(img.src) || img.closest(".grid.square") || img.dataset.gifFit) return;
  img.dataset.gifFit = "1"; img.closest(".item").classList.remove("wide");
  const probe = new Image(); probe.crossOrigin = "anonymous";
  probe.onload = () => {
    try {
      const c = document.createElement("canvas"); c.width = probe.naturalWidth; c.height = probe.naturalHeight;
      const x = c.getContext("2d"); x.drawImage(probe, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let top = c.height, bot = -1;
      for (let y = 0; y < c.height; y++) for (let i = y * c.width * 4 + 3, e = i + c.width * 4; i < e; i += 4) if (d[i] > 40) { top = Math.min(top, y); bot = y; break; }
      const f = (bot - top + 1) / c.height;
      if (bot >= 0 && f > 0.2 && f < 0.98) gifScale.set(img.src, 1 / f);
      if (bot >= 0 && f > 0.2 && f < 0.98) { Object.assign(img.style, { width: "auto", height: "100%", maxWidth: "none", flex: "none", aspectRatio: `${probe.naturalWidth} / ${probe.naturalHeight}`, transform: `scale(${(1 / f).toFixed(3)})`, pointerEvents: "none" }); }
      fitItem(img.closest(".item"));
    } catch (e) { /* no pixel access: leave it as is */ }
  };
  probe.src = img.src;
}
const markWide = (img) => {
  fitGif(img);
  if (img.closest(".grid.square")) normalizeSquare(img);
  fitItem(img.closest(".item"));
};            // runs when a photo finishes loading
let gridWatchers = [];                                              // re-fit when the grid's width changes (window resize, Refine panel)
const stopWatching = () => { gridWatchers.forEach((w) => w.disconnect()); gridWatchers = []; };

const warmed = new Set();   // photos already requested, so a hover never waits on the network
const warm = (src) => { if (src && !warmed.has(src)) { warmed.add(src); new Image().src = src; measureGif(src); } };
function showPreview(src) {
  if (!src) return hidePreview();
  preview.src = src;
  measureGif(src);
  applyGifScale(src);   // the big preview gets the same GIF correction as the grid
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

/* Hover while scrolling: browsers don't fire mouseenter when the page moves under a still pointer,
   so after each scroll re-check what is under the pointer and hover it. */
if (canHover) {
  let px = -1, py = -1, ticking = false;
  document.addEventListener("mousemove", (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  window.addEventListener("scroll", () => {
    if (ticking || px < 0) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const el = document.elementFromPoint(px, py)?.closest(".row:not(.head), .item");
      const cur = document.querySelector(".row.on, .item.on");
      if (el === cur) return;
      if (el) el.dispatchEvent(new MouseEvent("mouseenter"));
      else if (cur) cur.dispatchEvent(new MouseEvent("mouseleave"));
    });
  }, { passive: true });
}

const moreButton = (s, si) => s.rows.length < s.total
  ? `<button class="more" data-s="${si}">Show more ${esc(s.title.toLowerCase())} (${s.total - s.rows.length})</button><button class="more all" data-s="${si}" data-all>View all</button>` : "";

/* ---------- List view ---------- */
function renderList() {
  stopWatching();
  app.innerHTML = SECTIONS.map((s, si) => !s.rows.length ? "" : `
    <section class="list-section">
      <h2>${esc(s.title)}</h2>
      <div class="list-wrap"><div class="list" data-s="${si}">
        <div class="row head">${spans(s.cols.map((c) => c[0]))}</div>
        ${s.rows.map((r, i) => `<div class="row link${i > 0 && groupKey(r) !== groupKey(s.rows[i - 1]) ? " divide" : ""}" data-i="${i}">${spans(s.cols.map((c) => c[1](r)))}</div>`).join("")}
        <a class="add-new submit-row" href="submit.html?type=${esc(s.type)}">+ Submit</a>
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
        const i = +row.dataset.i;   // fetch the neighbours now so scrolling down or up never waits
        for (let k = -3; k <= 6; k++) if (s.rows[i + k]) warm(photoFor(s, s.rows[i + k]));
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
        ${rows.map((r) => `<div class="item link" data-i="${s.rows.indexOf(r)}"><img src="${esc(photoFor(s, r))}" alt="${esc(r.name)}" loading="lazy"${s.square ? ' crossorigin="anonymous"' : ""} onload="markWide(this)"></div>`).join("")}
        <div class="bar"></div>
      </div>
      ${moreButton(s, si)}
      <a class="add-new submit-row" href="submit.html?type=${esc(s.type)}">+ Submit</a>
    </section>`;
  }).join("");

  scrubGrids = [];
  stopWatching();
  const mobile = isMobile();
  document.body.classList.toggle("scrub", mobile);
  app.querySelectorAll(".grid").forEach((grid) => {
    const s = SECTIONS[grid.dataset.s];
    const bar = grid.querySelector(".bar");
    const els = [...grid.querySelectorAll(".item")];
    const watcher = new ResizeObserver(() => els.forEach(fitItem));
    watcher.observe(grid);
    gridWatchers.push(watcher);

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
      showPreview(photoFor(s, r));
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
  const top = scrubGrids[0];   // above the first board (page just opened): start on the first one
  if (top && top.els.length && focus < top.grid.getBoundingClientRect().top) {
    if (top.els[0] !== scrubEl || !activeUrl) { scrubEl = top.els[0]; top.activate(scrubEl); }
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
  document.body.classList.toggle("list-view", view === "list");
  clearActive();
  document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.querySelectorAll("[data-sort]").forEach((a) => a.classList.toggle("active", a.dataset.sort === sort));
  const newestLink = document.querySelector('[data-sort="newest"]');
  if (newestLink) newestLink.textContent = F.order === "old" ? "Oldest" : chronological() ? "Chronological" : "Newest";
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
  if (F.order) p.set("order", F.order);
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
  const s = SECTIONS[btn.dataset.s];
  if (btn.hasAttribute("data-all")) {
    let before = -1;
    while (s.rows.length < s.total && s.rows.length !== before) { before = s.rows.length; await loadSection(s, false); }
  } else await loadSection(s, false);
  render();
});

loadAll().catch((err) => {
  app.innerHTML = `<p class="load-error">Couldn't load the archive. Please refresh the page.</p>`;
  console.error(err);
});
