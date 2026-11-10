// "My Collection" goes to your page when you're signed in, or to the sign-in page when you're not.
// Reads the saved sign-in without loading the whole sign-in library.
(function () {
  var link = document.querySelector(".insta"); if (!link) return;
  link.textContent = "Sign in"; link.href = "/signin.html";
  var raw; try { raw = localStorage.getItem("sb-alfsnqpxmptvuvakyzcl-auth-token"); } catch (e) {}
  var s; try { s = raw && JSON.parse(raw); } catch (e) {}
  var id = s && s.user && s.user.id; if (!id) { link.href = "/signin.html"; return; }
  fetch(MOMS.url + "/rest/v1/profiles?select=username&id=eq." + id, { headers: { apikey: MOMS.key } })
    .then(function (r) { return r.json(); }).then(function (rows) { if (rows[0] && rows[0].username) { link.href = "/u/" + rows[0].username; link.textContent = "My Collection"; } })
    .catch(function () { link.href = "/signin.html"; });
})();
