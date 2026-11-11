// "Submit new": a person sends in a deck, truck or wheel with a photo. It lands in the owner's review list.
const sb = supabase.createClient(MOMS.url, MOMS.key, { auth: { persistSession: true, detectSessionInUrl: false } });
const $ = (s) => document.querySelector(s);
const FIELDS = {
  decks: [["brand", "Brand", true], ["name", "Deck name or graphic", true], ["color", "Color"], ["size", "Size, e.g. 32mm"], ["mold", "Mold, e.g. Freshwater"], ["shape", "Shape, e.g. Popsicle"], ["year", "Year or release date"], ["source", "Where did you see it? A link, shop or event"], ["notes", "Anything else", false, "textarea"]],
  trucks: [["brand", "Brand", true], ["name", "Truck name", true], ["color", "Color"], ["size", "Size / width, e.g. 32mm"], ["year", "Year or release date"], ["source", "Where did you see it? A link, shop or event"], ["notes", "Anything else", false, "textarea"]],
  wheels: [["brand", "Brand", true], ["name", "Wheel name", true], ["color", "Color"], ["material", "Material, e.g. Urethane"], ["duro", "Duro, e.g. 70d"], ["year", "Year or release date"], ["source", "Where did you see it? A link, shop or event"], ["notes", "Anything else", false, "textarea"]],
};
let type = new URLSearchParams(location.search).get("type");
if (!FIELDS[type]) type = "decks";
let session = null;

function paintForm() {
  document.querySelectorAll("#s-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === type));
  $("#f-sub").innerHTML = FIELDS[type].map(([k, label, req, kind]) =>
    kind === "textarea" ? `<textarea name="${k}" placeholder="${label}" rows="3" maxlength="500"></textarea>`
      : `<input name="${k}" type="text" placeholder="${label}${req ? " (required)" : ""}" maxlength="${k === "source" ? 300 : 120}" ${req ? "required" : ""}>`).join("") +
    `<label class="p-file">Photo (required) <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/*" required></label>
     <p class="auth-note">Best results: shoot the board from straight above on a plain, contrasting background (a dark board on a light surface, a light board on a dark one). The background is cut out automatically.</p>
     <button class="auth-btn" type="submit" id="s-btn">Submit</button>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { e.preventDefault(); type = b.dataset.t; paintForm(); $("#s-msg").textContent = ""; } });

$("#f-sub").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#s-msg"), btn = $("#s-btn"), fd = new FormData(e.target);
  btn.disabled = true; msg.textContent = "Sending…";
  let path = null;
  try {
    const p = await window.momsPreparePhoto(fd.get("photo"), type);
    path = `${session.user.id}/${crypto.randomUUID()}.${p.ext}`;
    const up = await sb.storage.from("uploads").upload(path, p.blob, { contentType: p.type, cacheControl: "3600" });
    if (up.error) throw up.error;
    const fields = {};
    for (const [k] of FIELDS[type]) { const v = String(fd.get(k) || "").trim(); if (v) fields[k] = v; }
    const { error } = await sb.from("submissions").insert({ section: type, fields, image_path: path });
    if (error) throw error;
    $("#s-form").hidden = true; $("#s-done").hidden = false; $("#sub-main > h1").hidden = true; $("#sub-main > .auth-note").hidden = true;
  } catch (err) {
    if (path) sb.storage.from("uploads").remove([path]).catch(() => {});
    msg.textContent = "Couldn't send that. " + (/Too many/.test(err.message || "") ? err.message : (err.message || err));
    btn.disabled = false;
  }
});
$("#s-again").addEventListener("click", () => location.reload());

(async () => {
  ({ data: { session } } = await sb.auth.getSession());
  if (!session) { $("#s-need").hidden = false; return; }
  paintForm(); $("#s-form").hidden = false;
})();
