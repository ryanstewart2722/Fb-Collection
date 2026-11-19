// The search box on the museum pages: type any words and see matching entries (photo + details) from every kind,
// or just this kind on /wheels/ and friends. Best matches first, then a few close ones. The look is plain on purpose.
(() => {
  const form = document.getElementById("m-form"), q = document.getElementById("m-q"), pop = document.getElementById("m-pop");
  if (!form || !q || !pop) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const only = window.MOMS_ONLY || "";
  const link = (t, r) => `board.html?type=${t}&slug=${encodeURIComponent(r.slug)}`;
  const row = (e) => `<a class="m-res" href="${esc(link(e.t, e.r))}"><span class="m-pic"><img src="${esc(e.r.image_path || "")}" alt="" loading="lazy"></span><span class="m-txt"><b>${esc(museumName(e.t, e.r))}</b><br>${esc(MUSEUM_KIND[e.t])}${museumInfo(e.t, e.r) ? " \u00b7 " + esc(museumInfo(e.t, e.r)) : ""}</span></a>`;
  let seq = 0, timer, shown = 25, cache = null;
  const STEP = 25;
  const paint = () => {
    const { best, close } = cache, part = best.slice(0, shown);
    pop.innerHTML = (best.length ? `<p class="m-count">${best.length} result${best.length === 1 ? "" : "s"}</p>` + part.map(row).join("") : `<p class="m-note">Nothing matched exactly.</p>`)
      + (best.length > shown ? `<button type="button" class="m-more" id="m-more">Show more (${best.length - shown} left)</button>` : "")
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
  pop.addEventListener("click", (e) => { if (e.target.closest("#m-more") && cache) { shown += STEP; const y = pop.scrollTop; paint(); pop.scrollTop = y; } });
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  q.addEventListener("focus", () => { if (q.value.trim().length >= 2) run(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  document.addEventListener("click", (e) => { if (!form.contains(e.target) && !pop.contains(e.target)) pop.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { pop.hidden = true; q.blur(); } });
})();
