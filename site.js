// Shared bits on every page: the footer, and the sign-in link that says "Sign in" until you are signed in.
(function () {
  var BOARD = '<svg class="fb-board" viewBox="0 0 140 36" aria-hidden="true"><path class="fb-deck" d="M4 6 Q6 14 16 15 L124 15 Q134 14 136 5"/><circle cx="38" cy="27" r="5"/><circle cx="104" cy="27" r="5"/></svg>';
  var ANGLES = [-23, -7, 0, 8, 20];
  var footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<img class="fb-logo" src="/footer-logo.png" alt="MoMS" width="783" height="735">' +
    '<p class="fb-credit">Designed, curated and developed by <a href="/u/r">Ryan Stewart</a> view collection <a href="/collection.html">here</a></p>' +
    '<nav class="fb-links" aria-label="Site">' +
      '<div><a href="/">Museum</a><a href="/submit.html">Submit New</a><a href="/users.html">Users</a></div>' +
      '<div><a href="/account.html">My Account</a><a href="/signin.html" data-me>My Collection</a><a href="mailto:contact@museumofminiskateboards.org">Contact</a></div>' +
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
      if (top) { top.href = "/u/" + u; top.textContent = "My Collection"; }
      footer.querySelectorAll("[data-me]").forEach(function (a) { a.href = "/u/" + u; });
    }).catch(function () {});
})();
