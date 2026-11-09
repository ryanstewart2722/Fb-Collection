// The Refine panel: a drawer on the right (about a quarter of the page) with filters for brand, size, mold,
// shape, color and release date. Uses the filter state (F) and loader from museum.js.
const rfTab = document.querySelector(".refine-tab");
const rfDim = document.querySelector(".refine-dim");
const rfPanel = document.getElementById("refine-panel");
const rfCount = document.querySelector(".rf-count");
const rfSummary = document.getElementById("filter-summary");
let rfOptions = null;

const rfMonthName = (ym) => (ym ? momsDate(ym + "-01", "month") : "");

/* ---------- Open / close ---------- */
function rfOpen() {
  clearActive();
  document.body.classList.add("rf-open");
  rfPanel.setAttribute("aria-hidden", "false");
  rfPanel.querySelector(".rf-close")?.focus({ preventScroll: true });
}
function rfClose() {
  document.body.classList.remove("rf-open");
  rfPanel.setAttribute("aria-hidden", "true");
  rfTab.focus({ preventScroll: true });
  scrubSoon();
}
rfTab.addEventListener("click", () => (document.body.classList.contains("rf-open") ? rfClose() : rfOpen()));
rfDim.addEventListener("click", rfClose);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("rf-open")) rfClose(); });

/* ---------- Build the panel from the database's list of choices ---------- */
const rfChecks = (name, items, selected, label = (i) => i.name, value = (i) => i.name) => items.map((i) => `
  <li data-q="${esc(String(label(i)).toLowerCase())}"><label>
    <input type="checkbox" data-f="${name}" value="${esc(value(i))}" ${selected.includes(String(value(i))) ? "checked" : ""}>
    <span>${esc(label(i))}</span><em>${i.n}</em>
  </label></li>`).join("");

function rfBuild(o) {
  const sizes = o.sizes || {}, dates = o.dates || {};
  const group = (title, body, extra = "") => `<section class="rf-group"><h3>${title}</h3>${extra}${body}</section>`;
  rfPanel.innerHTML = `
    <div class="rf-head">
      <h2>Refine</h2>
      <span class="rf-actions"><button type="button" class="rf-clear">Clear all</button><button type="button" class="rf-close">Close</button></span>
    </div>
    <div class="rf-body">
      ${group("Brand", `<ul class="rf-list">${rfChecks("brand", o.brands || [], F.brand, (b) => b.name, (b) => b.id)}</ul>`,
        (o.brands || []).length > 8 ? `<input class="rf-search" type="search" placeholder="Search brands" aria-label="Search brands">` : "")}
      ${group("Size (mm)", `<div class="rf-range">
          <input type="number" inputmode="decimal" step="0.5" data-f="size0" placeholder="${sizes.min ?? "From"}" value="${esc(F.size[0])}" aria-label="Smallest size">
          <input type="number" inputmode="decimal" step="0.5" data-f="size1" placeholder="${sizes.max ?? "To"}" value="${esc(F.size[1])}" aria-label="Largest size">
        </div>`)}
      ${(o.molds || []).length ? group("Mold", `<ul class="rf-list">${rfChecks("mold", o.molds, F.mold)}</ul>`,
        o.molds.length > 8 ? `<input class="rf-search" type="search" placeholder="Search molds" aria-label="Search molds">` : "") : ""}
      ${(o.shapes || []).length ? group("Shape", `<ul class="rf-list">${rfChecks("shape", o.shapes, F.shape)}</ul>`) : ""}
      ${(o.colors || []).length ? group("Color", `<div class="rf-chips">${o.colors.map((c) =>
        `<button type="button" class="rf-chip${F.color.includes(c.name) ? " on" : ""}" data-f="color" data-v="${esc(c.name)}">${esc(c.name)} <em>${c.n}</em></button>`).join("")}</div>`) : ""}
      ${group("Released", `<div class="rf-range">
          <input type="month" data-f="from" min="${(dates.min || "").slice(0, 7)}" max="${(dates.max || "").slice(0, 7)}" value="${esc(F.from)}" aria-label="Released from">
          <input type="month" data-f="to" min="${(dates.min || "").slice(0, 7)}" max="${(dates.max || "").slice(0, 7)}" value="${esc(F.to)}" aria-label="Released until">
        </div>`)}
    </div>
    <div class="rf-foot"><button type="button" class="rf-show">Show boards</button></div>`;
  rfUpdateCounts();
}

/* ---------- Changing a filter ---------- */
let rfTimer;
function rfApply() {
  clearTimeout(rfTimer);
  rfTimer = setTimeout(() => {
    saveState();
    loadAll().catch((err) => { console.error(err); });
  }, 250);
  rfUpdateCounts();
}

const toggle = (list, v) => { const i = list.indexOf(v); i < 0 ? list.push(v) : list.splice(i, 1); };

rfPanel.addEventListener("change", (e) => {
  const t = e.target, f = t.dataset.f;
  if (!f) return;
  if (f === "brand" || f === "mold" || f === "shape") toggle(F[f], t.value);
  else if (f === "size0") F.size[0] = t.value;
  else if (f === "size1") F.size[1] = t.value;
  else if (f === "from") F.from = t.value;
  else if (f === "to") F.to = t.value;
  rfApply();
});
rfPanel.addEventListener("input", (e) => {
  const t = e.target;
  if (t.classList.contains("rf-search")) {                      // narrow a long list as you type
    const q = t.value.trim().toLowerCase();
    t.closest(".rf-group").querySelectorAll(".rf-list li").forEach((li) => (li.hidden = q && !li.dataset.q.includes(q)));
  } else if (t.dataset.f === "size0" || t.dataset.f === "size1") {
    F.size[t.dataset.f === "size0" ? 0 : 1] = t.value;
    rfApply();
  }
});
rfPanel.addEventListener("click", (e) => {
  const chip = e.target.closest(".rf-chip");
  if (chip) { toggle(F.color, chip.dataset.v); chip.classList.toggle("on"); return rfApply(); }
  if (e.target.closest(".rf-clear")) return rfClearAll();
  if (e.target.closest(".rf-close") || e.target.closest(".rf-show")) rfClose();
});

function rfClearAll() {
  Object.assign(F, { brand: [], mold: [], shape: [], color: [], size: ["", ""], from: "", to: "" });
  rfPanel.querySelectorAll("input[type=checkbox]").forEach((i) => (i.checked = false));
  rfPanel.querySelectorAll("input[type=number], input[type=month]").forEach((i) => (i.value = ""));
  rfPanel.querySelectorAll(".rf-chip.on").forEach((c) => c.classList.remove("on"));
  rfApply();
}
rfSummary.addEventListener("click", (e) => { if (e.target.closest("button")) rfClearAll(); });

/* ---------- Counts: on the tab, in the panel's button, and above the lists ---------- */
function rfUpdateCounts() {
  const n = filterCount();
  rfCount.hidden = !n;
  rfCount.textContent = n ? ` (${n})` : "";
  rfPanel.querySelector(".rf-clear")?.toggleAttribute("disabled", !n);
}
function rfRefreshLabels() {
  const total = SECTIONS.reduce((sum, s) => sum + (s.total || 0), 0);
  const show = rfPanel.querySelector(".rf-show");
  if (show) show.textContent = total ? `Show ${total.toLocaleString()} board${total === 1 ? "" : "s"}` : "No boards match";
  const n = filterCount();
  rfSummary.hidden = !n;
  if (n) {
    const bits = [];
    if (F.size[0] || F.size[1]) bits.push(`${F.size[0] || "…"}–${F.size[1] || "…"}mm`);
    if (F.from || F.to) bits.push(`${rfMonthName(F.from) || "…"} – ${rfMonthName(F.to) || "…"}`);
    rfSummary.innerHTML = `${total.toLocaleString()} board${total === 1 ? "" : "s"}${bits.length ? " · " + esc(bits.join(" · ")) : ""} · <button type="button">Clear filters</button>`;
  }
  rfUpdateCounts();
}
document.addEventListener("museum:loaded", rfRefreshLabels);

momsFetch("rpc/filter_options")
  .then(({ rows }) => { rfOptions = rows; rfBuild(rows); rfRefreshLabels(); })
  .catch((err) => { console.error(err); rfTab.hidden = true; });
rfUpdateCounts();
