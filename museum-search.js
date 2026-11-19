// The search box on the museum pages: type any words and see matching entries (photo + details) from every kind,
// or just this kind on /wheels/ and friends. Best matches first, then a few close ones. The look is plain on purpose.
(() => {
  const form = document.getElementById("m-form"), q = document.getElementById("m-q"), pop = document.getElementById("m-pop");
  if (!form || !q || !pop) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const only = window.MOMS_ONLY || "";
  const link = (t, r) => `board.html?type=${t}&slug=${encodeURIComponent(r.slug)}`;
  const row = (e) => `<a class="m-res" href="${esc(link(e.t, e.r))}"><span class="m-pic">${museumPic(e.r)}</span><span class="m-txt"><b>${esc(museumName(e.t, e.r))}</b><br><span class="m-sub">${esc(MUSEUM_KIND[e.t])}${museumInfo(e.t, e.r) ? " \u00b7 " + esc(museumInfo(e.t, e.r)) : ""}</span></span></a>`;
  let seq = 0, timer, shown = 25, cache = null;
  const STEP = 25;
  const paint = () => {
    const { best, close } = cache, part = best.slice(0, shown);
    pop.innerHTML = (best.length ? `<p class="m-count">${best.length} result${best.length === 1 ? "" : "s"} \u00b7 <a href="${full()}" data-all>See all results</a></p>` + part.map(row).join("") : `<p class="m-note">Nothing matched exactly.</p>`)
      + (best.length > shown ? `<a class="m-more" href="${full()}" data-all>See all ${best.length} results</a>` : "")
      + (close.length && best.length <= shown ? `<p class="m-note m-sep">Close, but not exact</p>` + close.map(row).join("") : "");
  };
  const run = async () => {
    const text = q.value.trim(), n = ++seq;
    if (text.length < 2) { pop.hidden = true; return; }
    pop.hidden = false;
    let best = [], close = [];
    try {
      if (only) { const rows = await searchMuseum(only, text); best = rows.filter((e) => !e.close); close = rows.filter((e) => e.close); }
      else ({ best, close } = await searchAllMuseum(text));
    } catch (err) { console.error(err); }
    if (n !== seq) return;
    cache = { best, close }; shown = STEP;
    paint();
    pop.scrollTop = 0;
  };
    pop.addEventListener("click", (e) => { if (e.target.closest("[data-all]")) { e.preventDefault(); filterPage(); } });
  { const first = new URLSearchParams(location.search).get("q"); if (first) q.value = first; }
  form.addEventListener("click", () => q.focus());   // the whole bar starts a search, not just the word
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  q.addEventListener("focus", () => { if (q.value.trim().length >= 2 && q.value.trim() !== (new URLSearchParams(location.search).get("q") || "")) run(); });
  const full = () => `${location.pathname}?q=${encodeURIComponent(q.value.trim())}`;
  const filterPage = () => { clearTimeout(timer); seq++; pop.hidden = true; q.blur(); if (window.momsSearch) window.momsSearch(q.value); else location.href = full(); };
  form.addEventListener("submit", (e) => { e.preventDefault(); if (q.value.trim().length >= 2) filterPage(); });
  document.addEventListener("click", (e) => { if (!form.contains(e.target) && !pop.contains(e.target)) pop.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { pop.hidden = true; q.blur(); } });
})();
