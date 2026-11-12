// Phones, list view: scrolling moves the "active" row. The row about two lines below the header is always the
// active one (black bar + its big photo at the top), like the image view, so one is always active.
(function () {
  var canHover = matchMedia("(hover: hover)").matches, narrow = matchMedia("(max-width: 760px)");
  var pending = false;
  function enabled() {
    var b = document.body;
    return b.classList.contains("list-view") && (!canHover || narrow.matches) && !b.classList.contains("rf-open");
  }
  function update() {
    pending = false;
    if (!enabled()) return;
    var rows = Array.prototype.slice.call(document.querySelectorAll(".list .row:not(.head)"));
    if (!rows.length) return;
    var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 43;
    var h = rows[0].getBoundingClientRect().height || 48;
    var focus = bar + h * 1.5, best = null, dist = Infinity;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      var d = focus >= r.top && focus < r.bottom ? 0 : Math.min(Math.abs(r.top - focus), Math.abs(r.bottom - focus));
      if (d < dist) { dist = d; best = rows[i]; if (d === 0) break; }
    }
    if (!best || best.classList.contains("on")) return;
    // the page's own handler does the rest (black bar, big photo); a tap on the active row would open it, so only ever activate
    canHover ? best.dispatchEvent(new MouseEvent("mouseenter")) : best.click();
  }
  function soon() { if (!pending) { pending = true; requestAnimationFrame(update); } }
  addEventListener("scroll", soon, { passive: true });
  addEventListener("resize", soon);
  addEventListener("hashchange", function () { setTimeout(soon, 80); });
  var app = document.getElementById("app");
  if (app) new MutationObserver(function () { setTimeout(soon, 30); }).observe(app, { childList: true });
  narrow.addEventListener && narrow.addEventListener("change", soon);
})();
