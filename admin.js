// Editor for content.json. Loads it from GitHub, edits it in the browser, and publishes
// content.json plus any new photos back to GitHub as one commit.
const REPO = { owner: "ryanstewart2722", name: "Fb-Collection", branch: "main" };
const CONTENT_PATH = "content.json";
const TOKEN_KEY = "fb-editor-token";

const $ = (sel) => document.querySelector(sel);
const app = $("#ad-app");
const fileInput = $("#file");

let token = null;
let content = null;      // working copy
let loadedSha = null;    // blob sha of content.json when loaded, to catch edits made elsewhere
let pending = new Map(); // new photos: repo path -> { base64, dataUrl }
let dirty = false;
let tab = "list";
let photoTarget = null;  // { s, id } waiting for a file

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const imgSrc = (path) => pending.get(path)?.dataUrl || path;
const firstValue = (s, item) => item.values[s.columns[0]?.key] || "";

function colsFor(n) {
  if (n <= 4) return "473fr 355fr 237fr 335fr";
  return "473fr " + Array(n - 1).fill(Math.round(927 / (n - 1)) + "fr").join(" ");
}

/* ---------- GitHub API ---------- */
async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.name}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).message || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}

function decodeBase64Utf8(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function loadContent() {
  setStatus("Loading…");
  const file = await gh(`/contents/${CONTENT_PATH}?ref=${REPO.branch}`);
  content = JSON.parse(decodeBase64Utf8(file.content));
  loadedSha = file.sha;
  pending = new Map();
  setDirty(false);
  setStatus("Up to date with the live site");
  render();
}

async function publish() {
  const btn = $("#publish");
  btn.disabled = true;
  setStatus("Publishing…");
  try {
    const ref = await gh(`/git/ref/heads/${REPO.branch}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);

    // Stop if content.json was changed somewhere else since this editor loaded it.
    const current = await gh(`/contents/${CONTENT_PATH}?ref=${ref.object.sha}`);
    if (current.sha !== loadedSha) {
      throw new Error("The site content was changed somewhere else since you opened the editor. Click Discard to load the latest version, then redo your edits.");
    }

    const tree = [];
    for (const [path, { base64 }] of pending) {
      const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: base64, encoding: "base64" }) });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const json = JSON.stringify(content, null, 2) + "\n";
    const contentBlob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: json, encoding: "utf-8" }) });
    tree.push({ path: CONTENT_PATH, mode: "100644", type: "blob", sha: contentBlob.sha });

    const newTree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const commit = await gh("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: "Update collection from editor", tree: newTree.sha, parents: [ref.object.sha] }),
    });
    await gh(`/git/refs/heads/${REPO.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

    loadedSha = contentBlob.sha;
    pending = new Map();
    setDirty(false);
    setStatus("Published ✓ Live on the site in about a minute.");
  } catch (err) {
    setStatus("Publish failed: " + err.message, true);
    btn.disabled = false;
  }
}

/* ---------- State helpers ---------- */
function setStatus(text, isError = false) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("ad-error", isError);
}
function setDirty(v) {
  dirty = v;
  $("#publish").disabled = !v;
  $("#discard").disabled = !v;
  if (v) setStatus("Unsaved changes");
}
const changed = () => setDirty(true);
const section = (s) => content.sections[s];
const itemOf = (s, id) => section(s).items.find((i) => i.id === id);

/* ---------- Rendering ---------- */
function render() {
  document.querySelectorAll(".ad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "list") renderList();
  if (tab === "grid") renderGrid();
  if (tab === "site") renderSite();
}

function thumb(s, item) {
  return item.img
    ? `<button class="ad-thumb" data-act="photo" title="Replace photo"><img src="${esc(imgSrc(item.img))}" alt=""></button>`
    : `<button class="ad-thumb ad-thumb-empty" data-act="photo" title="Add photo">+</button>`;
}

function renderList() {
  app.innerHTML = content.sections.map((s, si) => {
    const tpl = `24px 44px ${colsFor(s.columns.length)} 76px`;
    return `<section class="ad-sec" data-s="${si}">
      <div class="ad-sec-head">
        <input class="ad-h2" data-bind="title" value="${esc(s.title)}" aria-label="Section title">
        <div class="ad-sec-tools">
          <button class="ad-btn ad-btn-sm" data-act="sec-up" ${si === 0 ? "disabled" : ""} title="Move section up">↑</button>
          <button class="ad-btn ad-btn-sm" data-act="sec-down" ${si === content.sections.length - 1 ? "disabled" : ""} title="Move section down">↓</button>
          <button class="ad-btn ad-btn-sm" data-act="sec-delete">Delete section</button>
        </div>
      </div>
      <div class="ad-table" style="--tpl:${tpl}">
        <div class="ad-row ad-headrow">
          <span></span><span></span>
          ${s.columns.map((c, ci) => `<span class="ad-col">
            <input class="ad-label" data-col="${ci}" value="${esc(c.label)}" aria-label="Column name">
            ${s.columns.length > 1 ? `<button class="ad-x" data-act="col-delete" data-col="${ci}" title="Delete column">×</button>` : ""}
          </span>`).join("")}
          <span class="ad-row-actions"><button class="ad-btn ad-btn-sm" data-act="col-add" title="Add column">+ Column</button></span>
        </div>
        <div class="ad-rows">
          ${s.items.map((it, i) => `<div class="ad-row${it.divider && i > 0 ? " divide" : ""}" data-id="${esc(it.id)}">
            <span class="ad-handle" title="Drag to reorder">⠿</span>
            ${thumb(s, it)}
            ${s.columns.map((c) => `<input class="ad-cell" data-k="${esc(c.key)}" value="${esc(it.values[c.key])}" aria-label="${esc(c.label)}">`).join("")}
            <span class="ad-row-actions">
              <button class="ad-icon${it.divider ? " active" : ""}" data-act="divider" title="Line above this row">⎯</button>
              <button class="ad-icon" data-act="item-delete" title="Delete">×</button>
            </span>
          </div>`).join("")}
        </div>
      </div>
      <button class="ad-btn" data-act="item-add">+ Add to ${esc(s.title || "section")}</button>
    </section>`;
  }).join("") + `<button class="ad-btn ad-add-sec" data-act="sec-add">+ Add section</button>`;

  app.querySelectorAll(".ad-rows").forEach((el) => {
    const s = +el.closest(".ad-sec").dataset.s;
    Sortable.create(el, {
      handle: ".ad-handle", animation: 150, forceFallback: true,
      onEnd() {
        const order = [...el.children].map((r) => r.dataset.id);
        section(s).items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        changed();
        renderList(); // refresh divider lines for the new order
      },
    });
  });
}

function gridOrdered(s) {
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const ordered = (s.gridOrder || []).map((id) => byId.get(id)).filter(Boolean);
  return [...ordered, ...s.items.filter((i) => !ordered.includes(i))];
}

function renderGrid() {
  app.innerHTML = `<p class="ad-hint">Drag photos to set the order in the image view. This order is separate from the list.</p>` +
    content.sections.map((s, si) => `<section class="ad-sec" data-s="${si}">
      <div class="ad-sec-head">
        <input class="ad-h2" data-bind="gridTitle" value="${esc(s.gridTitle)}" aria-label="Image view title">
        <div class="ad-sec-tools">
          <label class="ad-check"><input type="checkbox" data-bind="showInGrid" ${s.showInGrid ? "checked" : ""}> Show in image view</label>
          <label class="ad-check"><input type="checkbox" data-bind="square" ${s.square ? "checked" : ""}> Square photos</label>
        </div>
      </div>
      <div class="ad-grid${s.showInGrid ? "" : " off"}">
        ${gridOrdered(s).map((it) => `<div class="ad-card${it.img && !it.hideInGrid ? "" : " off"}" data-id="${esc(it.id)}">
          <div class="ad-card-img">${it.img ? `<img src="${esc(imgSrc(it.img))}" alt="">` : `<span>No photo</span>`}</div>
          <div class="ad-card-name">${esc(firstValue(s, it)) || "<i>Untitled</i>"}</div>
          <div class="ad-card-tools">
            <button class="ad-btn ad-btn-sm" data-act="photo">${it.img ? "Replace" : "Add photo"}</button>
            ${it.img ? `<button class="ad-btn ad-btn-sm" data-act="photo-remove">Remove</button>` : ""}
            <button class="ad-btn ad-btn-sm" data-act="hide">${it.hideInGrid ? "Show" : "Hide"}</button>
          </div>
        </div>`).join("")}
      </div>
    </section>`).join("");

  app.querySelectorAll(".ad-grid").forEach((el) => {
    const s = +el.closest(".ad-sec").dataset.s;
    Sortable.create(el, {
      animation: 150, forceFallback: true, filter: "button", preventOnFilter: false,
      onEnd() { section(s).gridOrder = [...el.children].map((c) => c.dataset.id); changed(); },
    });
  });
}

function renderSite() {
  const f = (key, label, hint = "") => `<label class="ad-field"><span>${label}</span>
    <input data-site="${key}" value="${esc(content.site[key])}">${hint ? `<small>${hint}</small>` : ""}</label>`;
  app.innerHTML = `<section class="ad-sec ad-site">
    <h2>Site</h2>
    ${f("title", "Site title", "Shown in the header and the browser tab.")}
    ${f("instagramHandle", "Instagram text", "Leave empty to hide it.")}
    ${f("instagramUrl", "Instagram link")}
  </section>`;
}

/* ---------- Editing ---------- */
app.addEventListener("input", (e) => {
  const t = e.target;
  const secEl = t.closest(".ad-sec");
  const si = secEl ? +secEl.dataset.s : null;
  if (t.dataset.site) content.site[t.dataset.site] = t.value;
  else if (t.dataset.bind && t.type !== "checkbox") section(si)[t.dataset.bind] = t.value;
  else if (t.classList.contains("ad-label")) section(si).columns[+t.dataset.col].label = t.value;
  else if (t.classList.contains("ad-cell")) itemOf(si, t.closest(".ad-row").dataset.id).values[t.dataset.k] = t.value;
  else return;
  changed();
});

app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.type !== "checkbox" || !t.dataset.bind) return;
  section(+t.closest(".ad-sec").dataset.s)[t.dataset.bind] = t.checked;
  changed();
  render();
});

app.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const secEl = btn.closest(".ad-sec");
  const si = secEl ? +secEl.dataset.s : null;
  const s = si != null ? section(si) : null;
  const id = btn.closest("[data-id]")?.dataset.id;
  const item = id ? itemOf(si, id) : null;

  switch (btn.dataset.act) {
    case "item-add": {
      const it = { id: uid("i"), img: "", divider: false, hideInGrid: false, values: Object.fromEntries(s.columns.map((c) => [c.key, ""])) };
      s.items.push(it);
      (s.gridOrder ||= []).push(it.id);
      changed(); render();
      app.querySelector(`[data-id="${it.id}"] .ad-cell`)?.focus();
      return;
    }
    case "item-delete":
      if (!confirm(`Delete “${firstValue(s, item) || "this item"}”?`)) return;
      s.items = s.items.filter((i) => i !== item);
      s.gridOrder = (s.gridOrder || []).filter((x) => x !== id);
      break;
    case "divider": item.divider = !item.divider; break;
    case "hide": item.hideInGrid = !item.hideInGrid; break;
    case "photo":
      photoTarget = { s: si, id };
      fileInput.value = "";
      fileInput.click();
      return;
    case "photo-remove":
      if (!confirm("Remove this photo from the item? (The file stays in the repo.)")) return;
      pending.delete(item.img);
      item.img = "";
      break;
    case "col-add": {
      const key = uid("c");
      s.columns.push({ key, label: "New column" });
      s.items.forEach((i) => (i.values[key] = ""));
      break;
    }
    case "col-delete": {
      const col = s.columns[+btn.dataset.col];
      if (!confirm(`Delete the “${col.label}” column and everything in it?`)) return;
      s.columns.splice(+btn.dataset.col, 1);
      s.items.forEach((i) => delete i.values[col.key]);
      break;
    }
    case "sec-add":
      content.sections.push({
        id: uid("sec"), title: "New section", gridTitle: "New section", showInGrid: true, square: false,
        columns: [{ key: "name", label: "Name" }], items: [], gridOrder: [],
      });
      break;
    case "sec-up": case "sec-down": {
      const j = si + (btn.dataset.act === "sec-up" ? -1 : 1);
      [content.sections[si], content.sections[j]] = [content.sections[j], content.sections[si]];
      break;
    }
    case "sec-delete":
      if (!confirm(`Delete the whole “${s.title}” section and all its items?`)) return;
      content.sections.splice(si, 1);
      break;
    default: return;
  }
  changed();
  render();
});

/* ---------- Photos ---------- */
// Resize in the browser (max 1200px tall / 1400px wide) so the site stays fast.
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / bitmap.height, 1400 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const isJpeg = file.type === "image/jpeg";
  const dataUrl = canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", 0.86);
  return { dataUrl, base64: dataUrl.split(",")[1], ext: isJpeg ? "jpg" : "png" };
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || !photoTarget) return;
  setStatus("Preparing photo…");
  try {
    const { dataUrl, base64, ext } = await prepareImage(file);
    const s = section(photoTarget.s);
    const item = itemOf(photoTarget.s, photoTarget.id);
    const slug = (firstValue(s, item) || file.name.replace(/\.[^.]+$/, "") || "photo")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
    const path = `Images/web/${slug}-${Date.now().toString(36)}.${ext}`;
    if (pending.has(item.img)) pending.delete(item.img);
    pending.set(path, { base64, dataUrl });
    item.img = path;
    changed();
    render();
  } catch (err) {
    setStatus("Couldn't read that image: " + err.message, true);
  }
});

/* ---------- Top bar ---------- */
document.querySelectorAll(".ad-tabs button").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
$("#publish").addEventListener("click", publish);
$("#discard").addEventListener("click", () => {
  if (confirm("Throw away all unpublished changes?")) loadContent().catch((e) => setStatus(e.message, true));
});
$("#logout").addEventListener("click", () => {
  if (dirty && !confirm("You have unpublished changes. Sign out anyway?")) return;
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

/* ---------- Sign in ---------- */
async function start(t) {
  token = t;
  await gh(""); // checks the token can see the repo
  await loadContent();
  $("#login").hidden = true;
  $("#editor").hidden = false;
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = $("#token").value.trim();
  const err = $("#login-error");
  err.hidden = true;
  try {
    await start(t);
    localStorage.setItem(TOKEN_KEY, t);
  } catch (ex) {
    err.textContent = "That token didn't work (" + ex.message + "). Check it has access to Fb-Collection with Contents: Read and write.";
    err.hidden = false;
  }
});

const saved = localStorage.getItem(TOKEN_KEY);
if (saved) start(saved).catch(() => { localStorage.removeItem(TOKEN_KEY); $("#login").hidden = false; });
else $("#login").hidden = false;
