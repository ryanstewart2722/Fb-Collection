// Turn a chosen photo into the picture we keep: transparent cut-outs are trimmed and sized like the museum's,
// ordinary photos are just shrunk so they load fast.
window.momsPreparePhoto = async function (file, section) {
  if (file.size > 25 * 1024 * 1024) throw new Error("That photo is too big (25 MB max).");
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("Couldn't read that photo. Try a JPG or PNG."); }
  const k0 = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k0), h = Math.round(bmp.height * k0);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let clear = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let i = 0; i < w; i += 2) {
    const a = d[(y * w + i) * 4 + 3];
    if (a < 250) clear++;
    if (a > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const transparent = clear > (w * h) / 4 * 0.04 && x1 > 0;
  const out = document.createElement("canvas"), o = out.getContext("2d");
  if (transparent) {
    const sw = x1 - x0 + 2, sh = y1 - y0 + 2;
    const tall = section === "decks" || section === "setups";
    const [W, H, fill] = tall && sh > sw * 1.4 ? [530, 1200, 0.96] : [800, 800, 0.9];
    out.width = W; out.height = H;
    const k = Math.min(W / sw, H / sh) * fill;
    o.drawImage(c, x0, y0, sw, sh, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
    return { blob: await new Promise((r) => out.toBlob(r, "image/png")), ext: "png", type: "image/png" };
  }
  out.width = w; out.height = h; o.fillStyle = "#fff"; o.fillRect(0, 0, w, h); o.drawImage(c, 0, 0);
  return { blob: await new Promise((r) => out.toBlob(r, "image/jpeg", 0.86)), ext: "jpg", type: "image/jpeg" };
};
