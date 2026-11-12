// Shared bits on every page: the footer, and the sign-in link that says "Sign in" until you are signed in.
(function () {
  var BOARD = '<svg class="fb-board" viewBox="0 0 140 36" aria-hidden="true"><path class="fb-deck" d="M4 6 Q6 14 16 15 L124 15 Q134 14 136 5"/><circle cx="38" cy="27" r="5"/><circle cx="104" cy="27" r="5"/></svg>';
  var ANGLES = [-23, -7, 0, 8, 20];
  var footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<img class="fb-logo" src="/footer-logo.png" alt="MoMS" width="783" height="735">' +
    '<p class="fb-credit">Designed, curated and developed by <a href="https://ryanforprez.org" target="_blank" rel="noopener">Ryan Stewart</a> view his collection <a href="/u/r">here</a></p>' +
    '<nav class="fb-links" aria-label="Site">' +
      '<div><a href="/">Museum</a><a href="/submit.html">Submit</a><a href="/users.html">Users</a><a href="https://www.instagram.com/museum.of.mini.skateboards/" target="_blank" rel="noopener">Instagram</a></div>' +
      '<div><a href="/account.html">My Account</a><a href="/signin.html" data-me>My Collection</a><a href="/privacy.html">Privacy</a><a href="mailto:contact@museumofminiskateboards.org">Contact</a></div>' +
    '</nav>' +
    '<div class="fb-boards" aria-hidden="true">' + ANGLES.map(function (a) { return '<span style="--r:' + a + 'deg">' + BOARD + '</span>'; }).join("") + '</div>' +
    '<p class="fb-title">The Museum of Mini Skateboards</p>';
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
      footer.querySelectorAll("[data-me]").forEach(function (a) { a.href = "/u/" + u; });
    }).catch(function () {});
})();

// Refresh (or Back) keeps you exactly where you were. The browser's own version restores the position before the page has
// finished loading its boards, so it lands somewhere else; this waits until the page is tall enough, then goes there.
(function () {
  var KEY = "moms-scroll:" + location.pathname + location.search;
  try { history.scrollRestoration = "manual"; } catch (e) {}
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  var again = nav && (nav.type === "reload" || nav.type === "back_forward");
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
