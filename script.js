// All content (text, items, order, photos) lives in content.json, which the editor (admin.html) saves.
const app = document.getElementById("app");
const preview = document.querySelector(".preview");
// Mouse devices get hover effects; touch devices get tap-to-show instead.
const canHover = matchMedia("(hover: hover)").matches;

let CONTENT = null;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cells = (s, item) => s.columns.map((c) => item.values[c.key] || "");
const spans = (list) => list.map((c) => `<span>${esc(c)}</span>`).join("");

// Column widths from the Figma frame; extra columns share the space after the first.
function colsFor(n) {
  if (n <= 4) return "473fr 355fr 237fr 335fr";
  return "473fr " + Array(n - 1).fill(Math.round(927 / (n - 1)) + "fr").join(" ");
}

// Grid order: the saved gridOrder first, then anything new that isn't in it yet.
function gridItems(s) {
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const ordered = (s.gridOrder || []).map((id) => byId.get(id)).filter(Boolean);
  const rest = s.items.filter((i) => !(s.gridOrder || []).includes(i.id));
  return [...ordered, ...rest].filter((i) => i.img && !i.hideInGrid);
}

function showPreview(src) {
  if (!src) return hidePreview();
  preview.src = src;
  preview.classList.add("show");
}
function hidePreview() { preview.classList.remove("show"); }

/* ---------- Image view ---------- */
function renderGrid() {
  app.innerHTML = CONTENT.sections.map((s, si) => {
    const items = gridItems(s);
    if (!s.showInGrid || !items.length) return "";
    return `<section class="grid-section">
      <h2>${esc(s.gridTitle)}</h2>
      <div class="grid${s.square ? " square" : ""}" data-s="${si}">
        ${items.map((d) => `<div class="item" data-id="${esc(d.id)}"><img src="${esc(d.img)}" alt="${esc(cells(s, d)[0])}" loading="lazy"></div>`).join("")}
        <div class="bar" style="--cols:${colsFor(s.columns.length)}"></div>
      </div>
    </section>`;
  }).join("");

  app.querySelectorAll(".grid").forEach((grid) => {
    const s = CONTENT.sections[grid.dataset.s];
    const bar = grid.querySelector(".bar");

    const activate = (el) => {
      clearActive();
      const d = s.items.find((i) => i.id === el.dataset.id);
      el.classList.add("on");
      grid.classList.add("hovering");

      // Bar sits in the middle of the gap under the hovered row.
      const img = el.querySelector("img");
      const gap = parseFloat(getComputedStyle(grid).rowGap);
      const barTop = el.offsetTop + img.offsetHeight + gap / 2 - 16;
      bar.style.top = barTop + "px";
      bar.innerHTML = spans(cells(s, d));
      bar.classList.add("show");
      showPreview(d.img);
    };

    grid.querySelectorAll(".item").forEach((el) => bindItem(el, activate));
    if (canHover) grid.addEventListener("mouseleave", clearActive);
  });
}

// Mouse: hover shows the image. Touch: tap shows it, tap again (anywhere) hides it.
function bindItem(el, activate) {
  if (canHover) return el.addEventListener("mouseenter", () => activate(el));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    el.classList.contains("on") ? clearActive() : activate(el);
  });
}

function clearActive() {
  document.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
  document.querySelectorAll(".hovering").forEach((x) => x.classList.remove("hovering"));
  document.querySelectorAll(".bar.show").forEach((x) => x.classList.remove("show"));
  hidePreview();
}
if (!canHover) {
  document.body.classList.add("touch");
  document.addEventListener("click", clearActive);
}

/* ---------- List view ---------- */
function renderList() {
  app.innerHTML = CONTENT.sections.map((s, si) => `
    <section class="list-section">
      <h2>${esc(s.title)}</h2>
      <div class="list-wrap"><div class="list" data-s="${si}" style="--cols:${colsFor(s.columns.length)}">
        <div class="row head">${spans(s.columns.map((c) => c.label))}</div>
        ${s.items.map((d, i) => `<div class="row${d.divider && i > 0 ? " divide" : ""}" data-i="${i}">${spans(cells(s, d))}</div>`).join("")}
      </div></div>
    </section>`).join("");

  app.querySelectorAll(".list").forEach((list) => {
    const s = CONTENT.sections[list.dataset.s];
    list.querySelectorAll(".row:not(.head)").forEach((row) => {
      bindItem(row, () => {
        clearActive();
        row.classList.add("on");
        showPreview(s.items[row.dataset.i].img);
      });
      if (canHover) row.addEventListener("mouseleave", clearActive);
    });
  });
}

/* ---------- Header ---------- */
function renderHeader() {
  const { title, instagramHandle, instagramUrl } = CONTENT.site;
  document.title = title;
  document.querySelector(".title").textContent = title;
  const insta = document.querySelector(".insta");
  insta.textContent = instagramHandle;
  insta.href = instagramUrl;
  insta.hidden = !instagramHandle;
}

/* ---------- View toggle (#image / #list) ---------- */
function route() {
  const view = location.hash === "#list" ? "list" : "image";
  clearActive();
  document.body.classList.toggle("list-view", view === "list");
  document.querySelectorAll(".toggle a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  view === "list" ? renderList() : renderGrid();
}

fetch("content.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    CONTENT = data;
    renderHeader();
    // Preload the images so previews appear instantly.
    CONTENT.sections.forEach((s) => s.items.forEach((d) => { if (d.img) new Image().src = d.img; }));
    window.addEventListener("hashchange", route);
    route();
  });
