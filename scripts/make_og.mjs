// Link-preview pictures: a screenshot of each page, so a shared link shows what the page looks like.
//   node scripts/make_og.mjs        (run by .github/workflows/og.yml; needs `npm i playwright-core` and Chrome)
// - the museum, users and submit pages get one picture each (og/<page>.jpg)
// - every public collection gets its own picture (og/<username>.jpg) and a small page at u/<username>/ that holds
//   the preview tags and then sends the visitor on to the real collection page. (A static site can't make the
//   preview depend on the address any other way: link previews don't run the site's code.)
// Pictures are re-taken when someone's number of entries changes, or after a week.
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

const res = await fetch(`${URL_}/rest/v1/rpc/list_public_profiles`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" });
const people = (await res.json()).filter((p) => /^[a-z0-9_]+$/.test(p.username) && Number(p.items) > 0);

const browser = await chromium.launch(process.env.OG_CHROME ? { executablePath: process.env.OG_CHROME } : { channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

async function shoot(url, file, waitFor) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 25000 });
    await page.waitForTimeout(2000);   // let the photos finish loading
    await page.screenshot({ path: path.join(OG, file), type: "jpeg", quality: 82 });
    return true;
  } catch (e) { console.log(`skipped ${file}: ${e.message.split("\n")[0]}`); return false; }
}
const stale = (key, sig) => !index[key] || index[key].sig !== sig || Date.now() - index[key].at > WEEK;

// the pages that are the same for everyone
for (const [key, url, wait] of [
  ["home", `${SITE}/?view=image`, "#app .item img"],
  ["users", `${SITE}/users.html`, "#users .row:not(.head)"],
  ["submit", `${SITE}/submit.html`, null],
]) {
  if (stale(key, "static") && await shoot(url, `${key}.jpg`, wait)) index[key] = { sig: "static", at: Date.now() };
}

// one per public collection
const now = new Set();
for (const p of people) {
  now.add(p.username);
  const sig = String(p.items), key = "u:" + p.username;
  if (stale(key, sig) && await shoot(`${SITE}/profile.html?u=${p.username}#list`, `${p.username}.jpg`, "#items .row, #items .item")) {
    index[key] = { sig, at: Date.now() };
  }
  if (!fs.existsSync(path.join(OG, `${p.username}.jpg`))) continue;
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
await browser.close();

// tidy: collections that are gone, private, or empty
for (const k of Object.keys(index)) {
  if (k.startsWith("u:") && !now.has(k.slice(2))) {
    const u = k.slice(2);
    for (const f of [path.join(OG, `${u}.jpg`), path.join(ROOT, "u", u, "index.html")]) fs.rmSync(f, { force: true });
    fs.rmSync(path.join(ROOT, "u", u), { recursive: true, force: true });
    delete index[k];
  }
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 0) + "\n");
console.log(`done: ${now.size} collections`);
