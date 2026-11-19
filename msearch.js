// The museum search: type a few words, get the best-matching entries. Shared by the item page (and later the museum page).
// Needs on the page: `sb` (Supabase client), MUSEUM_SEL (columns per kind) and museumName(kind, row).
// Each kind is loaded once as a light list, then matched on the page, so results come back as you type.
// Each kind of entry is loaded once (a light list), then matched here on the page so results come back as you type.
const TABLE = {}, tableP = {};
function loadTable(t) {
  return (tableP[t] ||= (async () => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select(MUSEUM_SEL[t]).not("image_path", "is", null).order("id").range(from, from + 999);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return (TABLE[t] = rows.map((r) => {
      const brand = r.brands?.name || "", yr = r.release_date ? String(r.release_date).slice(0, 4) : "";
      const text = [museumName(t, r), brand, r.color, r.material, r.mold_code, [].concat(r.molds || []).join(" "), r.graphic, r.shape, r.drop_title, r.drop_no ? "drop " + r.drop_no : ""].join(" ");
      const size = parseFloat(r.size);   // e.g. "32.5mm" -> 32.5
      return { t, r, words: norm(text), nums: new Set([...(text.match(/\d+(\.\d+)?/g) || []), yr, Number.isFinite(size) ? String(size) : "", r.duro ? String(parseFloat(r.duro)) : ""].filter(Boolean)), yr, brand, size, colors: String(r.color || "").split(/[\/,&]| and /i).map((c) => c.trim().toLowerCase()).filter(Boolean) };
    }));
  })());
}
const STOP = new Set(["x", "the", "and", "of", "a", "mm", "deck", "decks", "wheels", "wheel", "trucks", "truck"]);
const norm = (x) => String(x ?? "").toLowerCase().replace(/['\u2019]/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ").replace(/[^a-z0-9. ]+/g, " ").trim().split(/\s+/).filter(Boolean);   // "Dr.M's" -> dr m s; "29.5mm" stays one number
// how well one entry matches the words typed: whole words count most, starts-of-words next; numbers must match exactly (size, year, number)
// how strongly one entry matches one typed word (0 = not at all)
function strength(entry, q) {
  if (/^\d+(\.\d+)?$/.test(q)) return entry.nums.has(q) || entry.nums.has(String(parseFloat(q))) ? 4 : 0;
  let best = 0;
  for (const w of entry.words) {
    const p = w === q ? 3 : q.length >= 3 && w.startsWith(q) ? 2 : q.length >= 5 && w.includes(q) ? 1 : 0;
    if (p > best) best = p;
    if (best === 3) break;
  }
  return best;
}
async function searchMuseum(t, text) {
  const qs = [...new Set(norm(text).map((w) => w.replace(/mm$/, "")).filter((w) => w && !STOP.has(w)))].slice(0, 8);
  if (!qs.length) return [];
  const words = qs.filter((w) => !/^\d+(\.\d+)?$/.test(w));   // numbers (size, year, deck number) only help the ranking: many people leave them out
  const need = Math.min(words.length, words.length <= 3 ? words.length : Math.ceil(words.length * 0.6));
  const table = (await loadTable(t));
  // a rare word ("blank", "freshwater") tells entries apart much better than a common one ("dr", "m"), so it counts for more
  const mat = table.map((e) => qs.map((q) => strength(e, q)));
  const wt = qs.map((q, k) => Math.log(1 + table.length / (1 + mat.reduce((n, row) => n + (row[k] ? 1 : 0), 0))));
  const scored = table.map((e, r) => {
    let got = 0, pts = 0, numHit = 0;
    qs.forEach((q, k) => { const st = mat[r][k]; if (!st) return; pts += st * wt[k]; if (/^\d/.test(q)) numHit++; else got++; });
    pts -= e.words.length * 0.02;   // between equals, the shorter (more exact) name wins
    return { e, got, pts, numHit };
  });
  const pick = (n) => scored.filter((x) => x.got >= n && (x.got > 0 || x.numHit > 0)).sort((a, b) => b.pts - a.pts).slice(0, 40).map((x) => x.e);
  const hits = pick(need);
  return hits.length || words.length < 2 ? hits : pick(Math.max(1, need - 1));   // nothing matched every word: show the closest ones
}

