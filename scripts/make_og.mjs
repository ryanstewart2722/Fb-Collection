// Link-preview pictures: a screenshot of each page, so a shared link shows what the page looks like (collections are shown in the image view).
//   node scripts/make_og.mjs        (run by .github/workflows/og.yml; needs `npm i playwright-core` and Chrome)
// - the museum, users and submit pages get one picture each (og/<page>.jpg)
// - every public collection gets its own picture (og/<username>.jpg) and a small page at u/<username>/ that holds
//   the preview tags and then sends the visitor on to the real collection page. (A static site can't make the
//   preview depend on the address any other way: link previews don't run the site's code.)
// - every museum product (deck, wheels, truck, obstacle, misc.) gets a screenshot of its own page (og/p/<type>-<id>.jpg) and a
//   small page at p/<type>/<slug>/ with the preview tags, which then sends the visitor on to board.html. Products are
//   taken PRODUCT_LIMIT at a time (new and changed ones first), so the first runs fill in the backlog.
// Pictures are re-taken when someone's number of entries changes, or after a week (products: when they change).
//   OG_ONLY=products node scripts/make_og.mjs   (just the products)
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SITE = "https://museumofminiskateboards.org";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OG = path.join(ROOT, "og");
const INDEX = path.join(OG, "index.json");
const WEEK = 7 * 24 * 3600 * 1000;
const cfg = fs.readFileSync(path.join(ROOT, "moms-config.js"), "utf8");
const URL_ = cfg.match(/url:\s*"([^"]+)"/)[1], KEY = cfg.match(/key:\s*"([^"]+)"/)[1];
const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, "utf8")) : {};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
fs.mkdirSync(OG, { recursive: true });

const ONLY_PRODUCTS = process.env.OG_ONLY === "products";
const res = ONLY_PRODUCTS ? { json: async () => [] } : await fetch(`${URL_}/rest/v1/rpc/list_public_profiles`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" });
const people = (await res.json()).filter((p) => /^[a-z0-9_]+$/.test(p.username) && Number(p.items) > 0);

const browser = await chromium.launch(process.env.OG_CHROME ? { executablePath: process.env.OG_CHROME } : { channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

async function shoot(url, file, waitFor, openMenu) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 25000 });
    await page.waitForTimeout(2000);   // let the photos finish loading
    if (openMenu) { await page.click(".mnav-menu"); await page.waitForTimeout(1800); }   // the home picture is taken with the menu open
    await page.screenshot({ path: path.join(OG, file), type: "jpeg", quality: 82 });
    return true;
  } catch (e) { console.log(`skipped ${file}: ${e.message.split("\n")[0]}`); return false; }
}
const stale = (key, sig) => !index[key] || index[key].sig !== sig || Date.now() - index[key].at > WEEK;

// the pages that are the same for everyone (the home picture is re-taken whenever a product is added)
let homeSig = "static3";
if (!ONLY_PRODUCTS) {
  try {
    const newest = [];
    for (const t of ["decks", "wheels", "trucks", "obstacles", "misc"]) {
      const r = await fetch(`${URL_}/rest/v1/${t}?select=id&order=id.desc&limit=1`, { headers: { apikey: KEY } });
      newest.push(r.ok ? ((await r.json())[0]?.id ?? 0) : 0);
    }
    homeSig = "home4-" + newest.join("-");
  } catch (e) { /* keep the plain signature */ }
}
for (const [key, url, wait, openMenu] of ONLY_PRODUCTS ? [] : [
  ["home", `${SITE}/?view=image`, "#app .item img", true],
  ["home-list", `${SITE}/?view=list`, "#app .row.link", true],
  ["featured", `${SITE}/featured.html#image`, "#app .item img", true],
  ["featured-list", `${SITE}/featured.html#list`, "#app .row:not(.head)", true],
  ["users", `${SITE}/users.html`, "#users .row:not(.head)"],
  ["submit", `${SITE}/submit.html`, null],
]) {
  const sig = key === "home" || key === "home-list" ? homeSig : "static3";
  if (stale(key, sig) && await shoot(url, `${key}.jpg`, wait, openMenu)) index[key] = { sig, at: Date.now() };
}

// the Featured page: its own page carries the image-view picture, and a little page (/featured-list/) carries the list-view one
if (!ONLY_PRODUCTS && index["featured"] && fs.existsSync(path.join(OG, "featured.jpg"))) {
  const f = path.join(ROOT, "featured.html");
  if (fs.existsSync(f)) {
    const cur = fs.readFileSync(f, "utf8"), next = cur.replace(/og\/featured\.jpg(\?v=\d+)?/g, `og/featured.jpg?v=${index["featured"].at}`);
    if (next !== cur) fs.writeFileSync(f, next);
  }
}
if (!ONLY_PRODUCTS && index["featured-list"] && fs.existsSync(path.join(OG, "featured-list.jpg"))) {
  fs.mkdirSync(path.join(ROOT, "featured-list"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "featured-list", "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Featured · The Museum of Mini Skateboards</title>
  <meta property="og:site_name" content="The Museum of Mini Skateboards">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Featured · The Museum of Mini Skateboards">
  <meta property="og:url" content="${SITE}/featured-list/">
  <meta property="og:image" content="${SITE}/og/featured-list.jpg?v=${index["featured-list"].at}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>location.replace("/featured.html#list");</script>
</head>
<body></body>
</html>
`);
}

// the list view of the museum has its own little page (/list/) so a shared link to it shows the list picture
if (!ONLY_PRODUCTS && index["home-list"] && fs.existsSync(path.join(OG, "home-list.jpg"))) {
  fs.mkdirSync(path.join(ROOT, "list"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "list", "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Museum of Mini Skateboards</title>
  <meta property="og:site_name" content="The Museum of Mini Skateboards">
  <meta property="og:type" content="website">
  <meta property="og:title" content="The Museum of Mini Skateboards">
  <meta property="og:url" content="${SITE}/list/">
  <meta property="og:image" content="${SITE}/og/home-list.jpg?v=${index["home-list"].at}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>location.replace("/?view=list" + location.hash);</script>
</head>
<body></body>
</html>
`);
}

// one per public collection
const now = new Set();
for (const p of people) {
  now.add(p.username);
  const sig = p.items + "-image-v3", key = "u:" + p.username;
  if (stale(key, sig) && await shoot(`${SITE}/profile.html?u=${p.username}#image`, `${p.username}.jpg`, "#items .item img")) {
    index[key] = { sig, at: Date.now() };
  }
  if (!index[key] || index[key].sig !== sig) {   // no photos to show (so no image-view picture): fall back to the museum's picture
    fs.rmSync(path.join(OG, `${p.username}.jpg`), { force: true });
    fs.rmSync(path.join(ROOT, "u", p.username), { recursive: true, force: true });
    delete index[key];
    continue;
  }
  const name = p.display_name || p.username, at = index[key]?.at || 0;
  const dir = path.join(ROOT, "u", p.username); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} · MoMS</title>
  <meta name="description" content="${esc(name)}'s collection of ${p.items} fingerboard${Number(p.items) === 1 ? "" : "s"}, parts and obstacles in the Museum of Mini Skateboards.">
  <meta property="og:site_name" content="The Museum of Mini Skateboards">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(name)} · MoMS">
  <meta property="og:description" content="${esc(name)}'s collection in the Museum of Mini Skateboards">
  <meta property="og:url" content="${SITE}/u/${p.username}">
  <meta property="og:image" content="${SITE}/og/${p.username}.jpg?v=${at}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>location.replace("/profile.html?u=${p.username}" + location.hash);</script>
</head>
<body></body>
</html>
`);
}
// ---------- museum products ----------
const TYPES = ["decks", "wheels", "trucks", "obstacles", "misc"];
const LIMIT = Number(process.env.PRODUCT_LIMIT || 3000), CONC = 5;
const NICE = { decks: "deck", wheels: "wheels", trucks: "trucks", obstacles: "obstacle", misc: "item" };
const products = [];
for (const t of TYPES) {
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=id,slug,name,image_path,image_path_2,release_date,brands(name)&order=id.asc&limit=1000&offset=${from}`, { headers: { apikey: KEY } });
    if (!r.ok) break;
    const rows = await r.json();
    products.push(...rows.filter((x) => x.slug && /^[A-Za-z0-9._-]+$/.test(x.slug)).map((x) => ({ ...x, t })));
    if (rows.length < 1000) break;
  }
}
const hash = (x) => [...(`${x.name}|${x.image_path}|${x.image_path_2 || ""}|${x.release_date || ""}|${x.brands?.name || ""}|v3`)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const pkey = (x) => `p:${x.t}:${x.id}`;
const todo = products.filter((x) => !index[pkey(x)] || index[pkey(x)].sig !== hash(x)).sort((a, b) => b.id - a.id).slice(0, LIMIT);
fs.mkdirSync(path.join(OG, "p"), { recursive: true });
function stub(x, at) {
  const brand = x.brands?.name, title = [x.name, brand && !String(x.name).includes(brand) ? brand : ""].filter(Boolean).join(" · ");
  const dir = path.join(ROOT, "p", x.t, x.slug); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · MoMS</title>
  <meta name="description" content="${esc(x.name)}${brand ? ` by ${esc(brand)}` : ""}, a fingerboard ${NICE[x.t]} in the Museum of Mini Skateboards.">
  <meta property="og:site_name" content="The Museum of Mini Skateboards">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)} · MoMS">
  <meta property="og:description" content="An archive of fingerboard decks, trucks and wheels.">
  <meta property="og:url" content="${SITE}/p/${x.t}/${x.slug}/">
  <meta property="og:image" content="${SITE}/og/p/${x.t}-${x.id}.jpg?v=${at}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>location.replace("/board.html?type=${x.t}&slug=${encodeURIComponent(x.slug)}" + location.hash);</script>
</head>
<body></body>
</html>
`);
}
async function worker() {
  const pg = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  while (todo.length) {
    const x = todo.shift();
    try {
      await pg.goto(`${SITE}/board.html?type=${x.t}&slug=${encodeURIComponent(x.slug)}`, { waitUntil: "networkidle", timeout: 45000 });
      await pg.waitForSelector(".board-info h1", { timeout: 20000 });
      await pg.waitForFunction(() => [...document.querySelectorAll(".board-img img")].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
      await pg.waitForTimeout(1300);   // the page fades in
      const file = path.join(OG, "p", `${x.t}-${x.id}.jpg`);
      await pg.screenshot({ path: file, type: "jpeg", quality: 62 });
      const at = Date.now();
      stub(x, at);
      index[pkey(x)] = { sig: hash(x), at };
    } catch (e) { console.log(`skipped ${x.t}/${x.slug}: ${e.message.split("\n")[0]}`); }
  }
  await pg.close();
}
const total = todo.length;
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`products: ${total} taken, ${products.filter((x) => !index[pkey(x)]).length} still waiting`);
// products that are gone
const live = new Set(products.map(pkey));
for (const k of Object.keys(index)) {
  if (k.startsWith("p:") && !live.has(k)) {
    const [, t, id] = k.split(":");
    fs.rmSync(path.join(OG, "p", `${t}-${id}.jpg`), { force: true });
    delete index[k];   // (the little page is left; it still redirects)
  }
}
// sweep: product pictures that nothing points at any more
for (const f of fs.readdirSync(path.join(OG, "p"))) {
  const m = f.match(/^(decks|wheels|trucks|obstacles|misc)-(\d+)\.jpg$/);
  if (!m || !live.has(`p:${m[1]}:${m[2]}`)) fs.rmSync(path.join(OG, "p", f), { force: true });
}
await browser.close();

// tidy: collections that are gone, private, or empty
for (const k of Object.keys(index)) {
  if (k.startsWith("u:") && !now.has(k.slice(2)) && !ONLY_PRODUCTS) {
    const u = k.slice(2);
    for (const f of [path.join(OG, `${u}.jpg`), path.join(ROOT, "u", u, "index.html")]) fs.rmSync(f, { force: true });
    fs.rmSync(path.join(ROOT, "u", u), { recursive: true, force: true });
    delete index[k];
  }
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 0) + "\n");
console.log(`done: ${now.size} collections`);
