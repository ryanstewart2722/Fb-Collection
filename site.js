// Redraw part of a page without the page jumping: runs fn() (which rebuilds the content of box), then puts the
// scroll back where it was. If anchor (a selector) is given, that element stays at the same spot on screen instead,
// so a row you moved keeps its place under your cursor. The box holds its old height for a moment so the page
// can't shrink (and snap to the top) while photos are still loading.
window.momsKeepScroll = function (box, fn, anchor) {
  var y = window.scrollY, top = 0, a = null;
  if (anchor && box) { a = box.querySelector(anchor); if (a) top = a.getBoundingClientRect().top; }
  if (box && box.offsetHeight) box.style.minHeight = box.offsetHeight + "px";
  function put() {
    var n = a && box.querySelector(anchor);
    if (n) window.scrollBy({ top: n.getBoundingClientRect().top - top, behavior: "instant" });
    else window.scrollTo({ top: y, behavior: "instant" });
  }
  try { fn(); } finally {
    put(); requestAnimationFrame(put);
    if (box) setTimeout(function () { box.style.minHeight = ""; }, 800);
  }
};

// Desktop: text that is cut off with "…" in a list row or an image-view info bar slides across (then restarts) while you hover it.
(function () {
  if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine) and (min-width: 761px)").matches) return;
  var running = new Map();   // span -> {raf, timer}
  var GAP = "\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0";   // between the end of the text and its repeat
  function stop(el) {
    var r = running.get(el); if (!r) return;
    cancelAnimationFrame(r.raf); clearTimeout(r.timer); running.delete(el);
    el.textContent = r.orig; el.scrollLeft = 0; el.style.textOverflow = "";
  }
  // The text slides slowly and keeps going: a second copy follows it, so when the first copy has left the
  // second sits exactly where the first began and the loop is seamless (no jump back).
  function go(el) {
    if (running.has(el) || el.scrollWidth <= el.clientWidth + 1) return;
    if (el.children.length || el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;   // plain text only
    var orig = el.textContent, r = { raf: 0, timer: 0, orig: orig }; running.set(el, r);
    el.style.textOverflow = "clip";
    el.textContent = orig + GAP + orig;
    var rg = document.createRange(); rg.setStart(el.firstChild, 0); rg.setEnd(el.firstChild, orig.length + GAP.length);
    var period = rg.getBoundingClientRect().width, pos = 0, last = 0;
    if (!(period > 0)) { stop(el); return; }
    function step(t) {
      if (!last) last = t;
      pos += 0.04 * (t - last); last = t;
      if (pos >= period) pos -= period;
      el.scrollLeft = pos;
      r.raf = requestAnimationFrame(step);
    }
    r.timer = setTimeout(function () { r.raf = requestAnimationFrame(step); }, 350);
  }
  function each(box, fn) { box.querySelectorAll("span").forEach(fn); }
  document.addEventListener("mouseover", function (e) {
    var row = e.target.closest && e.target.closest(".row:not(.head)");
    if (row) each(row, go);
  });
  document.addEventListener("mouseout", function (e) {
    var row = e.target.closest && e.target.closest(".row:not(.head)");
    if (row && !row.contains(e.relatedTarget)) each(row, stop);
  });
  // image view: the info bar fades in over the photo you are hovering, so follow the bar instead of the mouse
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var bar = m.target; if (!bar.classList || !bar.classList.contains("bar")) return;
      if (m.type === "childList") { running.forEach(function (_, el) { if (!el.isConnected) stop(el); }); }
      if (bar.classList.contains("show")) setTimeout(function () { each(bar, go); }, 50); else each(bar, stop);
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
})();

// Shared bits on every page: the footer, and the sign-in link that says "Sign in" until you are signed in.
(function () {
  // the row of boards at the bottom right: [x, y of the board's centre, turn] on the 1440-wide design; the last one is the MoMS board
  var ROW = [[696, 454, 8], [840, 426, -12], [1014, 380, 6], [1192, 390, 12], [1350, 434, 20]];
  var footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<img class="fb-logo" src="/footer-character.webp" alt="" width="900" height="946">' +
    '<p class="fb-credit">Designed, curated and developed by <a href="https://ryanforprez.org" target="_blank" rel="noopener">Ryan Stewart</a> view his collection <a href="/u/r">here</a></p>' +
    '<nav class="fb-links" aria-label="Site">' +
      '<div><a href="/">Museum</a><a href="/?order=added">Recently Added</a><span class="fb-soon">Featured Setups</span></div>' +
      '<div><a href="/">View All</a><a href="/decks/">Decks</a><a href="/trucks/">Trucks</a><a href="/obstacles/">Obstacles</a><a href="/wheels/">Wheels</a><a href="/misc/">Misc.</a><span class="fb-soon">Brands</span></div>' +
      '<div><a href="/account.html">My Account</a><a href="/users.html">Users</a><a href="/signin.html" data-me>My Collection</a></div>' +
      '<div><a href="/signin.html" data-me data-hash="#favorites">Favorites</a><a href="/signin.html" data-me data-hash="#likes">Likes</a><span class="fb-soon">Following</span><a href="/" data-logout hidden>Logout</a><a href="/submit.html">Submit</a><a href="mailto:contact@museumofminiskateboards.org">Contact</a><a href="/privacy.html">Privacy Policy</a></div>' +
    '</nav>' +
    '<div class="fb-boards" aria-hidden="true">' + ROW.map(function (p) { return '<img src="/footer-board.svg" alt="" style="--x:' + p[0] + ';--y:' + p[1] + ';--r:' + p[2] + 'deg">'; }).join("") +
      '<img class="fb-moms" src="/footer-moms.svg" alt="" style="--x:1092;--y:452;--r:0deg"></div>' +
    '<p class="fb-title">The<br>Museum<br>of<br>Mini<br>Skateboards</p>';
  document.body.appendChild(footer);

  // Signed in? The saved sign-in tells us who without loading the whole sign-in library.
  var top = document.querySelector(".insta");
  var raw; try { raw = localStorage.getItem("sb-alfsnqpxmptvuvakyzcl-auth-token"); } catch (e) {}
  var s; try { s = raw && JSON.parse(raw); } catch (e) {}
  var id = s && s.user && s.user.id;
  if (top) { top.textContent = "Sign in"; top.href = "/signin.html"; }
  if (!id || typeof MOMS === "undefined") return;
  fetch(MOMS.url + "/rest/v1/profiles?select=username&id=eq." + id, { headers: { apikey: MOMS.key } })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var u = rows[0] && rows[0].username; if (!u) return;
      if (top) { top.href = "/u/" + u; if (top.dataset.prev !== undefined) top.dataset.prev = "My Collection"; else top.textContent = "My Collection"; }
      footer.querySelectorAll("[data-me]").forEach(function (a) { a.href = "/u/" + u + (a.dataset.hash || ""); });
      var out = footer.querySelector("[data-logout]");
      if (out) { out.hidden = false; out.addEventListener("click", function () { try { localStorage.removeItem("sb-alfsnqpxmptvuvakyzcl-auth-token"); } catch (e) {} }); }
    }).catch(function () {});
})();

// Refresh (or Back) keeps you exactly where you were. The browser's own version restores the position before the page has
// finished loading its boards, so it lands somewhere else; this waits until the page is tall enough, then goes there.
(function () {
  var KEY = "moms-scroll:" + location.pathname + location.search;
  try { history.scrollRestoration = "manual"; } catch (e) {}
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  var again = nav && (nav.type === "reload" || nav.type === "back_forward");
  // "Back" / "Close" on a board page are ordinary links, so the browser treats the trip as a new visit. They leave a note
  // saying where they go, and the page they land on then returns to where you were.
  try { if (sessionStorage.getItem("moms-return") === KEY) { again = true; sessionStorage.removeItem("moms-return"); } } catch (e) {}
  addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.board-close, #top-back");
    if (!a || !a.href) return;
    try { var u = new URL(a.href, location.href); if (u.origin === location.origin) sessionStorage.setItem("moms-return", "moms-scroll:" + u.pathname + u.search); } catch (x) {}
  }, true);
  var target = 0;
  try { target = again ? parseInt(sessionStorage.getItem(KEY) || "0", 10) || 0 : 0; } catch (e) {}
  var stop = false, saving = false;
  function save() {
    if (saving) return; saving = true;
    setTimeout(function () { saving = false; try { sessionStorage.setItem(KEY, String(Math.round(scrollY))); } catch (e) {} }, 150);
  }
  if (target > 0) {
    var t0 = Date.now();
    var halt = function () { stop = true; };
    addEventListener("wheel", halt, { passive: true, once: true });
    addEventListener("touchstart", halt, { passive: true, once: true });
    addEventListener("keydown", halt, { once: true });
    (function go() {
      if (stop) return;
      var max = document.documentElement.scrollHeight - innerHeight;
      if (max >= target - 2 || Date.now() - t0 > 6000) { scrollTo(0, Math.min(target, Math.max(0, max))); if (max >= target - 2) return; }
      requestAnimationFrame(function () { setTimeout(go, 60); });
    })();
  }
  addEventListener("scroll", save, { passive: true });
})();
