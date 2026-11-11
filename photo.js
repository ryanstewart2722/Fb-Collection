// Turns a chosen photo into the picture we keep.
//  1. Already transparent (a cut-out): trimmed and sized like the museum's.
//  2. Shot on a plain backdrop (white sheet, floor, grey card): the backdrop is removed automatically, then trimmed and sized.
//  3. Anything busier: kept as an ordinary photo, just shrunk so it loads fast.
window.momsPreparePhoto = async function (file, section) {
  if (file.size > 25 * 1024 * 1024) throw new Error("That photo is too big (25 MB max).");
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("Couldn't read that photo. Try a JPG or PNG."); }
  const k0 = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k0), h = Math.round(bmp.height * k0);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const at = (i, j) => (j * w + i) * 4;

  const boxOf = () => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let i = 0; i < w; i += 2) if (d[at(i, y) + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 2, h: y1 - y0 + 2 };
  };

  // 1. transparent edges already?
  let cut = false;
  let edgeClear = 0, edgeN = 0;
  for (let i = 0; i < w; i += 3) { edgeN += 2; if (d[at(i, 0) + 3] < 250) edgeClear++; if (d[at(i, h - 1) + 3] < 250) edgeClear++; }
  for (let j = 0; j < h; j += 3) { edgeN += 2; if (d[at(0, j) + 3] < 250) edgeClear++; if (d[at(w - 1, j) + 3] < 250) edgeClear++; }
  if (edgeClear > edgeN * 0.3) cut = true;

  // 2. plain backdrop? flood in from the edges over colours close to the corner colour
  if (!cut) {
    const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
    const bg = [0, 1, 2].map((ch) => corners.reduce((s, i) => s + d[i + ch], 0) / 4);
    const near = (i, tol) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) <= tol;
    const uniform = corners.every((i) => near(i, 38));
    if (uniform) {
      const copy = new Uint8ClampedArray(d);
      const seen = new Uint8Array(w * h), stack = [];
      for (let i = 0; i < w; i++) stack.push(i, 0, i, h - 1);
      for (let j = 0; j < h; j++) stack.push(0, j, w - 1, j);
      let removed = 0;
      while (stack.length) {
        const y = stack.pop(), i = stack.pop();
        if (i < 0 || y < 0 || i >= w || y >= h) continue;
        const k = y * w + i;
        if (seen[k] || !near(k * 4, 30)) continue;
        seen[k] = 1; removed++; d[k * 4 + 3] = 0;
        stack.push(i + 1, y, i - 1, y, i, y + 1, i, y - 1);
      }
      const frac = removed / (w * h);
      if (frac > 0.2 && frac < 0.93) {
        for (let y = 1; y < h - 1; y++) for (let i = 1; i < w - 1; i++) {   // soften the cut edge
          const k = y * w + i;
          if (!seen[k] && (seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w])) d[k * 4 + 3] = Math.min(d[k * 4 + 3], 150);
        }
        cut = true;
      } else d.set(copy);   // not a clean backdrop: undo
    }
  }

  const out = document.createElement("canvas"), o = out.getContext("2d");
  const box = cut ? boxOf() : null;
  if (cut && box) {
    x.putImageData(img, 0, 0);
    const tall = section === "decks" || section === "setups";
    const [W, H, fill] = tall && box.h > box.w * 1.4 ? [530, 1200, 0.96] : [800, 800, 0.9];
    out.width = W; out.height = H;
    const k = Math.min(W / box.w, H / box.h) * fill;
    o.imageSmoothingQuality = "high";
    o.drawImage(c, box.x, box.y, box.w, box.h, (W - box.w * k) / 2, (H - box.h * k) / 2, box.w * k, box.h * k);
    return { blob: await new Promise((r) => out.toBlob(r, "image/png")), ext: "png", type: "image/png", cut: true };
  }
  out.width = w; out.height = h; o.fillStyle = "#fff"; o.fillRect(0, 0, w, h); o.drawImage(bmp, 0, 0, w, h);
  return { blob: await new Promise((r) => out.toBlob(r, "image/jpeg", 0.86)), ext: "jpg", type: "image/jpeg", cut: false };
};
