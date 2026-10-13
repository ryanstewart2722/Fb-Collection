const app = document.getElementById("app");
const preview = document.querySelector(".preview");
const IMG = (file) => "Images/web/" + file;
// Mouse devices get hover effects; touch devices get tap-to-show instead.
const canHover = matchMedia("(hover: hover)").matches;

// What each section shows in the list and in the black info bar.
const SECTIONS = {
  setups: { title: "My Setups", gridTitle: "My Setups", items: SETUPS,
    head: ["Manufacturer", "Trucks", "Wheels"], cells: (d) => [d.name, d.trucks, d.wheels] },
  decks:  { title: "Decks", gridTitle: "My Decks", items: DECKS,
    head: ["Deck name/color", "Manufacturer", "Moldd", "Size"], cells: (d) => [d.name, d.maker, d.mold, d.size] },
  wheels: { title: "Wheels", items: WHEELS,
    head: ["Wheel/manufacturer", "Color", "Material", "Duro"], cells: (d) => [d.name, d.color, d.material, d.duro] },
  trucks: { title: "Trucks", items: TRUCKS,
    head: ["Manufacturer", "Color", "Size"], cells: (d) => [d.name, d.color, d.size] },
};

const spans = (cells) => cells.map((c) => `<span>${c}</span>`).join("");

// Preload the images so hover previews appear instantly.
[...SETUPS, ...DECKS, ...WHEELS, ...TRUCKS].forEach((d) => { if (d.img) new Image().src = IMG(d.img); });

function showPreview(file) {
  if (!file) return hidePreview();
  preview.src = IMG(file);
  preview.classList.add("show");
}
function hidePreview() { preview.classList.remove("show"); }

/* ---------- Image view ---------- */
function renderGrid() {
  app.innerHTML = ["setups", "decks"].map((key) => {
    const s = SECTIONS[key];
    const items = s.items.filter((d) => d.img);
    return `<section class="grid-section">
      <h2>${s.gridTitle}</h2>
      <div class="grid" data-key="${key}">
        ${items.map((d, i) => `<div class="item" data-i="${i}"><img src="${IMG(d.img)}" alt="${d.name}" loading="lazy"></div>`).join("")}
        <div class="bar"></div>
      </div>
    </section>`;
  }).join("");

  app.querySelectorAll(".grid").forEach((grid) => {
    const s = SECTIONS[grid.dataset.key];
    const items = s.items.filter((d) => d.img);
    const bar = grid.querySelector(".bar");

    const activate = (el) => {
      clearActive();
      const d = items[el.dataset.i];
      el.classList.add("on");
      grid.classList.add("hovering");

      // Bar sits in the middle of the gap under the hovered row.
      const img = el.querySelector("img");
      const gap = parseFloat(getComputedStyle(grid).rowGap);
      const barTop = el.offsetTop + img.offsetHeight + gap / 2 - 16;
      bar.style.top = barTop + "px";
      bar.innerHTML = spans(s.cells(d));
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
  app.innerHTML = Object.entries(SECTIONS).map(([key, s]) => `
    <section class="list-section">
      <h2>${s.title}</h2>
      <div class="list-wrap"><div class="list" data-key="${key}">
        <div class="row head">${spans(s.head)}</div>
        ${s.items.map((d, i) => {
          const divide = i > 0 && d.group !== s.items[i - 1].group ? " divide" : "";
          return `<div class="row${divide}" data-i="${i}">${spans(s.cells(d))}</div>`;
        }).join("")}
      </div></div>
    </section>`).join("");

  app.querySelectorAll(".list").forEach((list) => {
    const s = SECTIONS[list.dataset.key];
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

/* ---------- View toggle (#image / #list) ---------- */
function route() {
  const view = location.hash === "#list" ? "list" : "image";
  clearActive();
  document.body.classList.toggle("list-view", view === "list");
  document.querySelectorAll(".toggle a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  view === "list" ? renderList() : renderGrid();
}
window.addEventListener("hashchange", route);
route();
