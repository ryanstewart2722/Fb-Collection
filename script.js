const app = document.getElementById("app");
const preview = document.querySelector(".preview");
const IMG = (file) => "Images/web/" + file;
// Hover effects only on devices with a mouse; on phones a tap would cover the screen.
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

  if (!canHover) return;
  app.querySelectorAll(".grid").forEach((grid) => {
    const s = SECTIONS[grid.dataset.key];
    const items = s.items.filter((d) => d.img);
    const bar = grid.querySelector(".bar");

    grid.querySelectorAll(".item").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const d = items[el.dataset.i];
        grid.querySelectorAll(".item.on").forEach((x) => x.classList.remove("on"));
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
      });
    });

    grid.addEventListener("mouseleave", () => {
      grid.classList.remove("hovering");
      grid.querySelectorAll(".item.on").forEach((x) => x.classList.remove("on"));
      bar.classList.remove("show");
      hidePreview();
    });
  });
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

  if (!canHover) return;
  app.querySelectorAll(".list").forEach((list) => {
    const s = SECTIONS[list.dataset.key];
    list.querySelectorAll(".row:not(.head)").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        row.classList.add("on");
        showPreview(s.items[row.dataset.i].img);
      });
      row.addEventListener("mouseleave", () => {
        row.classList.remove("on");
        hidePreview();
      });
    });
  });
}

/* ---------- View toggle (#image / #list) ---------- */
function route() {
  const view = location.hash === "#list" ? "list" : "image";
  hidePreview();
  document.body.classList.toggle("list-view", view === "list");
  document.querySelectorAll(".toggle a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  view === "list" ? renderList() : renderGrid();
}
window.addEventListener("hashchange", route);
route();
