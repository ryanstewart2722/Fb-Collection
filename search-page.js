// The full results page: search.html?q=flatface (&type=wheels). Every match, grouped by kind with counts, 50 at a time.
const root = document.getElementById("s-app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const params = new URLSearchParams(location.search);
let text = params.get("q") || "", kind = MUSEUM_KIND[params.get("type")] ? params.get("type") : "";   // "" = all kinds
const KINDS = Object.keys(MUSEUM_SEL), STEP = 50;
let lists = {}, shown = STEP, seq = 0, timer;
const saveUrl = () => { const u = new URLSearchParams(); if (text.trim()) u.set("q", text.trim()); if (kind) u.set("type", kind); history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); };
const link = (t, r) => `board.html?type=${t}&slug=${encodeURIComponent(r.slug)}`;

root.innerHTML = `
  <div class="s-wrap">
    <form class="m-find s-form" id="s-form" autocomplete="off"><input id="s-q" type="search" placeholder="Search the museum" aria-label="Search the museum"></form>
    <p class="s-tabs" id="s-tabs"></p>
    <p class="s-count" id="s-count"></p>
    <div id="s-list"></div>
    <button type="button" class="s-more" id="s-more" hidden></button>
  </div>`;
const q = document.getElementById("s-q"), tabs = document.getElementById("s-tabs"), count = document.getElementById("s-count"), list = document.getElementById("s-list"), more = document.getElementById("s-more");
q.value = text;

const exact = (t) => (lists[t] || []).filter((e) => !e.close);
const rowsNow = () => {
  const ks = kind ? [kind] : KINDS;
  const best = ks.flatMap(exact).sort((a, b) => b.score - a.score);
  const close = ks.flatMap((t) => (lists[t] || []).filter((e) => e.close)).sort((a, b) => b.score - a.score).slice(0, 30);
  return { best, close };
};
const row = (e) => `<a class="s-res" href="${esc(link(e.t, e.r))}"><span class="s-pic"><img src="${esc(e.r.image_path || "")}" alt="" loading="lazy"></span><span class="s-txt"><b>${esc(museumName(e.t, e.r))}</b><br>${esc(MUSEUM_KIND[e.t])}${museumInfo(e.t, e.r) ? " · " + esc(museumInfo(e.t, e.r)) : ""}</span></a>`;

function paint() {
  const total = KINDS.reduce((n, t) => n + exact(t).length, 0);
  tabs.innerHTML = [["", "All", total], ...KINDS.map((t) => [t, MUSEUM_KIND[t], exact(t).length])].filter(([k, , n]) => k === "" || n).map(([k, label, n]) => `<a href="#" data-k="${k}"${k === kind ? ' class="on"' : ""}>${esc(label)} (${n})</a>`).join(" / ");
  const { best, close } = rowsNow();
  count.textContent = text.trim().length < 2 ? "" : `${best.length} result${best.length === 1 ? "" : "s"} for “${text.trim()}”`;
  const part = best.slice(0, shown);
  list.innerHTML = (part.length ? part.map(row).join("") : text.trim().length < 2 ? "" : `<p class="s-note">Nothing matched exactly. Try fewer words, or check the spelling.</p>`)
    + (best.length <= shown && close.length ? `<p class="s-note s-sep">Close, but not exact</p>` + close.map(row).join("") : "");
  more.hidden = best.length <= shown;
  more.textContent = `Show more (${best.length - shown} left)`;
}
async function run() {
  const n = ++seq;
  text = q.value;
  saveUrl();
  if (text.trim().length < 2) { lists = {}; shown = STEP; paint(); return; }
  count.textContent = "Searching…";
  const res = await Promise.all(KINDS.map((t) => searchMuseum(t, text).catch(() => [])));
  if (n !== seq) return;
  lists = Object.fromEntries(KINDS.map((t, i) => [t, res[i]]));
  shown = STEP;
  paint();
}
q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
document.getElementById("s-form").addEventListener("submit", (e) => { e.preventDefault(); run(); });
tabs.addEventListener("click", (e) => { const a = e.target.closest("a[data-k]"); if (!a) return; e.preventDefault(); kind = a.dataset.k; shown = STEP; saveUrl(); paint(); });
more.addEventListener("click", () => { shown += STEP; paint(); });
run();
