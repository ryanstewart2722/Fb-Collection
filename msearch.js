// The museum search: type a few words, get the best-matching entries, plus a few close ones.
// Shared by the item page and the museum page. It needs MOMS (moms-config.js) and momsDeckName (the deck-name helper).
// Each kind is loaded once as a light list, then matched on the page, so results come back as you type.
const MUSEUM_KIND = { decks: "Deck", trucks: "Trucks", wheels: "Wheels", obstacles: "Obstacle", misc: "Misc." };
const MUSEUM_SEL = {   // everything the museum list / image views show, plus what the search reads
  decks: "id,brand_id,name,mold_code,drop_no,drop_title,slug,color,size,size_mm,release_date,release_precision,image_path,extra_brand_ids,graphic,shape,molds,description,brands(name,slug)",
  trucks: "id,brand_id,name,slug,color,size,size_mm,release_date,release_precision,image_path,extra_brand_ids,description,brands(name,slug)",
  wheels: "id,brand_id,name,slug,color,material,duro,release_date,release_precision,image_path,extra_brand_ids,description,brands(name,slug)",
  obstacles: "id,brand_id,name,slug,color,size,material,release_date,release_precision,image_path,extra_brand_ids,description,brands(name,slug)",
  misc: "id,brand_id,name,slug,color,size,material,release_date,release_precision,image_path,extra_brand_ids,description,brands(name,slug)",
};
const museumName = (t, r) => t === "decks" ? momsDeckName(r) : (t === "wheels" || t === "trucks") && r.brands?.name && !r.name.toLowerCase().includes(r.brands.name.toLowerCase()) ? `${r.brands.name} ${r.name}` : r.name;
// the line of facts shown under a result's name
const museumInfo = (t, r) => {
  const mold = r.mold_code || [].concat(r.molds || []).join(", ");
  return [r.brands?.name, r.release_date && String(r.release_date).slice(0, 4), r.size, r.color, mold && "Mold: " + mold, r.shape, r.material, r.duro && r.duro + (/d$/i.test(r.duro) ? "" : "d"), r.drop_no && "Drop " + r.drop_no].filter(Boolean).join(" · ");
};

// a result's picture: the photo, or an empty box when the entry has none yet (so it is still listed and can be picked)
const museumPic = (r, cls) => r.image_path ? `<img src="${String(r.image_path).replace(/"/g, "&quot;")}" alt="" loading="lazy">` : `<span class="${cls || "no-pic"}">no photo</span>`;
const TABLE = {}, tableP = {};
function loadTable(t) {
  return (tableP[t] ||= (async () => {
    const rows = [], H = { apikey: MOMS.key, Authorization: "Bearer " + MOMS.key };
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${MOMS.url}/rest/v1/${t}?select=${encodeURIComponent(MUSEUM_SEL[t])}&order=id&limit=1000&offset=${from}`, { headers: H });
      if (!res.ok) break;
      const data = await res.json();
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return (TABLE[t] = rows.map((r) => {
      const brand = r.brands?.name || "", yr = r.release_date ? String(r.release_date).slice(0, 4) : "";
      // colour is the least trustworthy field (many entries are tagged by hand), so it is kept apart and counts for less
      const text = [museumName(t, r), brand, r.material, r.mold_code, [].concat(r.molds || []).join(" "), r.graphic, r.shape, r.drop_title, r.drop_no ? "drop " + r.drop_no : ""].join(" ");
      const size = parseFloat(r.size);   // e.g. "32.5mm" -> 32.5
      const words = norm(text), joined = words.slice(1).map((w, k) => words[k] + w);   // "Flat Face" is also found as "flatface"
      return { t, r, wset: new Set(words.concat(joined)), words: words.concat(joined), dwords: new Set(norm(r.description)), cwords: norm(r.color), nums: new Set([...(text.match(/\d+(\.\d+)?/g) || []), yr, Number.isFinite(size) ? String(size) : "", r.duro ? String(parseFloat(r.duro)) : ""].filter(Boolean)), yr, brand };
    }));
  })());
}
const STOP = new Set(["x", "the", "and", "of", "a", "mm", "deck", "decks", "wheels", "wheel", "trucks", "truck"]);
const norm = (x) => String(x ?? "").toLowerCase().replace(/['’]/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ").replace(/[^a-z0-9. ]+/g, " ").trim().split(/\s+/).filter(Boolean);   // "Dr.M's" -> dr m s; "29.5mm" stays one number
const isNum = (q) => /^\d+(\.\d+)?$/.test(q);
// how many letters apart two words are (stops early once it is more than `max`)
function dist(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    for (let j = 1; j <= lb; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[lb];
}
// a typo: one slip in a 4-5 letter word, up to two in a longer one ("catfsh" ~ "catfish", "freshwatr" ~ "freshwater"); also when the typed word is only the start of a longer one
function typo(q, w) {
  const max = q.length >= 6 ? 2 : q.length >= 4 ? 1 : 0;
  if (!max) return Infinity;
  let d = dist(q, w, max);
  if (w.length > q.length) d = Math.min(d, dist(q, w.slice(0, q.length), 1) + 0.5);   // a typo in the start of a longer word
  return d;
}
// how strongly one entry matches one typed word (0 = not at all): whole word > start of a word > a typo; a colour hit counts for less
function strength(entry, q, fuzzy) {
  if (isNum(q)) return entry.nums.has(q) || entry.nums.has(String(parseFloat(q))) ? 4 : 0;
  let best = 0;
  for (const w of entry.words) {
    const p = w === q ? 3 : q.length >= 3 && w.startsWith(q) ? 2 : q.length >= 5 && w.includes(q) ? 1 : 0;
    if (p > best) best = p;
    if (best === 3) return 3;
  }
  if (!best) for (const w of entry.cwords) if (w === q || (q.length >= 3 && w.startsWith(q))) return 1;   // colour only: a weak hint
  if (!best && entry.dwords.has(q)) return 0.8;   // only in the description: a weaker hint
  if (!best && fuzzy && q.length >= 4) { let bd = Infinity; for (const w of entry.words) { const d = typo(q, w); if (d < bd) bd = d; if (bd <= 1) break; } if (bd <= 1) return 1.5; if (bd <= 1.5) return 1.3; if (bd <= 2) return 1.2; }
  return best;
}
// Results: the best matches first, then a few close ones (marked close: true) for when nothing is exact.
async function searchMuseum(t, text) {
  const qs = [...new Set(norm(text).map((w) => w.replace(/mm$/, "")).filter((w) => w && !STOP.has(w)))].slice(0, 8);
  if (!qs.length) return [];
  const words = qs.filter((w) => !isNum(w));   // numbers (size, year, deck number) only help the ranking: many people leave them out
  const need = Math.min(words.length, words.length <= 3 ? words.length : Math.ceil(words.length * 0.6));
  const table = await loadTable(t);
  // a rare word ("blank", "freshwater") tells entries apart much better than a common one ("dr", "m"), so it counts for more
  // a word that is spelled right matches exactly; typo-matching is only a fallback for a word nothing contains as typed
  const mat = table.map((e) => {
    const row = qs.map((q) => strength(e, q, false));
    for (let k = 0; k + 1 < qs.length; k++) if (!isNum(qs[k]) && !isNum(qs[k + 1]) && e.wset.has(qs[k] + qs[k + 1])) { row[k] = Math.max(row[k], 3); row[k + 1] = Math.max(row[k + 1], 3); }   // "dr m" finds "drm"
    return row;
  });
  qs.forEach((q, k) => {
    if (isNum(q) || mat.some((row) => row[k])) return;
    table.forEach((e, r) => { mat[r][k] = strength(e, q, true); });
  });
  const wt = qs.map((q, k) => Math.log(1 + table.length / (1 + mat.reduce((n, row) => n + (row[k] ? 1 : 0), 0))));
  const scored = table.map((e, r) => {
    let got = 0, pts = 0, numHit = 0;
    qs.forEach((q, k) => { const st = mat[r][k]; if (!st) return; pts += st * wt[k]; if (isNum(q)) numHit++; else got++; });
    pts -= e.words.length * 0.02;   // between equals, the shorter (more exact) name wins
    return { e, got, pts, numHit };
  });
  const rank = (a, b) => b.pts - a.pts;
  // a matching number (deck #, size, year) can stand in for one missing word
  const best = scored.filter((x) => x.got + Math.min(x.numHit, 1) >= need && (x.got > 0 || x.numHit > 0)).sort(rank);
  const ids = new Set(best.map((x) => x.e));
  const close = words.length < 2 && best.length ? [] : scored.filter((x) => !ids.has(x.e) && x.got >= Math.max(1, need - 1) && x.got > 0).sort(rank).slice(0, best.length ? 12 : 24);
  return [...best.map((x) => Object.assign({}, x.e, { score: x.pts })), ...close.map((x) => Object.assign({}, x.e, { close: true, score: x.pts }))];
}
// For the museum page: the same words scanned across every kind at once (decks, trucks, wheels, obstacles, misc.), best first.
async function searchAllMuseum(text) {
  const lists = await Promise.all(Object.keys(MUSEUM_SEL).map((t) => searchMuseum(t, text)));
  const all = lists.flat(), byScore = (a, b) => b.score - a.score;
  return { best: all.filter((e) => !e.close).sort(byScore), close: all.filter((e) => e.close).sort(byScore).slice(0, 12) };
}
