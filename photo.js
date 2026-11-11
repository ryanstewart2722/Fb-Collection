// Turns a chosen photo into the picture we keep.
//  1. Already transparent (a cut-out): trimmed and sized like the museum's.
//  2. Shot on a plain backdrop (white sheet, floor, grey card): the backdrop is removed automatically, then trimmed and sized.
//  3. Anything busier: kept as an ordinary photo, just shrunk so it loads fast.
// Busy photos (a board on a table, floor or cloth): a small cut-out model that runs in the browser, only when needed.
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/";
let ortSession = null;
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = ORT_BASE + "ort.min.js";
    s.onload = () => res(window.ort); s.onerror = () => rej(new Error("cutout library did not load"));
    document.head.appendChild(s);
  });
}
async function mlCut(bmp, w, h, d) {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = ORT_BASE; ort.env.wasm.numThreads = 1;
  ortSession ||= await ort.InferenceSession.create("/models/u2netp.onnx", { executionProviders: ["wasm"] });
  const N = 320, sc = document.createElement("canvas"); sc.width = sc.height = N;
  const sx = sc.getContext("2d", { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, N, N);
  const px = sx.getImageData(0, 0, N, N).data, inp = new Float32Array(3 * N * N);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) inp[c * N * N + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
  const out = await ortSession.run({ [ortSession.inputNames[0]]: new ort.Tensor("float32", inp, [1, 3, N, N]) });
  const m = out[ortSession.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m.length; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  const mask = new Float32Array(N * N);
  for (let i = 0; i < mask.length; i++) mask[i] = (m[i] - lo) / (hi - lo || 1);
  // keep the biggest blob (and any blob at least a quarter its size, e.g. a second board); drop speckles
  const lab = new Int32Array(N * N), sizes = [0];
  for (let i = 0; i < N * N; i++) {
    if (mask[i] <= 0.5 || lab[i]) continue;
    const id = sizes.length; let n = 0; const st = [i]; lab[i] = id;
    while (st.length) { const k = st.pop(); n++; const x = k % N, y = (k / N) | 0;
      for (const j of [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, y > 0 ? k - N : -1, y < N - 1 ? k + N : -1]) if (j >= 0 && !lab[j] && mask[j] > 0.5) { lab[j] = id; st.push(j); } }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes);
  const frac = sizes.reduce((a, n) => a + (n >= big * 0.25 ? n : 0), 0) / (N * N);
  if (!big || frac < 0.04 || frac > 0.85) return false;   // nothing clear to cut out: keep the photo as it is
  // fill holes inside the board (the model sometimes leaves gaps in busy graphics)
  const keepM = new Uint8Array(N * N), reach = new Uint8Array(N * N), q2 = [];
  for (let i = 0; i < N * N; i++) keepM[i] = lab[i] && sizes[lab[i]] >= big * 0.25 ? 1 : 0;
  for (let i = 0; i < N; i++) for (const k of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!keepM[k] && !reach[k]) { reach[k] = 1; q2.push(k); }
  while (q2.length) {
    const k = q2.pop(), x = k % N;
    for (const j of [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, k >= N ? k - N : -1, k < N * N - N ? k + N : -1]) if (j >= 0 && !keepM[j] && !reach[j]) { reach[j] = 1; q2.push(j); }
  }
  const mc = document.createElement("canvas"); mc.width = mc.height = N;
  const mx = mc.getContext("2d"), md = mx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) md.data[i * 4 + 3] = keepM[i] ? Math.round(255 * ss(0.2, 0.6, mask[i])) : (reach[i] ? 0 : 255);
  mx.putImageData(md, 0, 0);
  const fc = document.createElement("canvas"); fc.width = w; fc.height = h;
  const fx = fc.getContext("2d", { willReadFrequently: true }); fx.imageSmoothingQuality = "high"; fx.drawImage(mc, 0, 0, w, h);
  const fd = fx.getImageData(0, 0, w, h).data, n = w * h, p = new Float32Array(n);
  for (let i = 0; i < n; i++) p[i] = fd[i * 4 + 3] / 255;
  // snap the soft, low-resolution outline to the real edges in the photo
  const r = Math.max(4, Math.round(Math.min(w, h) / 150));
  finishAlpha(d, guided(lumaOf(d, n), p, w, h, r, 0.004), n, w, h);
  return true;
}

// ---- edge smoothing ----
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function boxBlur(src, w, h, r) {
  const out = new Float32Array(w * h), tmp = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[row + x] = sum / n; sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / n; sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
// guided filter: makes the mask's outline follow the real edges in the photo
function guided(I, p, w, h, r, eps) {
  const n = w * h, mI = boxBlur(I, w, h, r), mp = boxBlur(p, w, h, r);
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mIp = boxBlur(Ip, w, h, r), mII = boxBlur(II, w, h, r), a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]; a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = boxBlur(a, w, h, r), mb = boxBlur(b, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}
function lumaOf(d, n) { const I = new Float32Array(n); for (let i = 0; i < n; i++) I[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; return I; }
// final clean-up: slight shrink (drops the backdrop's colour fringe), then a 1px blur so the outline is anti-aliased, not stair-stepped
function finishAlpha(d, q, n, w, h) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = ss(0.42, 0.82, q[i]);
  const f = boxBlur(a, w, h, 1);
  for (let i = 0; i < n; i++) d[i * 4 + 3] = Math.round(255 * f[i]);
}
// the flat-backdrop method leaves a jagged edge: smooth it the same way
function smoothAlpha(d, w, h) {
  const n = w * h, p = new Float32Array(n);
  for (let i = 0; i < n; i++) p[i] = d[i * 4 + 3] / 255;
  const b = boxBlur(boxBlur(p, w, h, 2), w, h, 2);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ss(0.25, 0.75, b[i]);
  finishAlpha(d, q, n, w, h);
}

// After a cut-out: keep the main object (and any piece at least a quarter its size) and clear stray fragments.
function keepMainPieces(d, w, h) {
  const lab = new Int32Array(w * h), sizes = [0], stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 40 || lab[i]) continue;
    const id = sizes.length; let n = 0, sp = 0; stack[sp++] = i; lab[i] = id;
    while (sp) {
      const k = stack[--sp]; n++; const x = k % w;
      if (x > 0 && !lab[k - 1] && d[(k - 1) * 4 + 3] >= 40) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (x < w - 1 && !lab[k + 1] && d[(k + 1) * 4 + 3] >= 40) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (k >= w && !lab[k - w] && d[(k - w) * 4 + 3] >= 40) { lab[k - w] = id; stack[sp++] = k - w; }
      if (k < w * h - w && !lab[k + w] && d[(k + w) * 4 + 3] >= 40) { lab[k + w] = id; stack[sp++] = k + w; }
    }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes);
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] && (!lab[i] || sizes[lab[i]] < big * 0.25)) d[i * 4 + 3] = 0;
}

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
    let ring = 0, ringN = 0;   // most of the whole border must look like the backdrop, not just the corners
    for (let i = 0; i < w; i += 4) { ringN += 2; if (near(at(i, 0), 40)) ring++; if (near(at(i, h - 1), 40)) ring++; }
    for (let j = 0; j < h; j += 4) { ringN += 2; if (near(at(0, j), 40)) ring++; if (near(at(w - 1, j), 40)) ring++; }
    const uniform = corners.every((i) => near(i, 38)) && ring > ringN * 0.8;
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
        keepMainPieces(d, w, h);
        smoothAlpha(d, w, h);
        cut = true;
      } else d.set(copy);   // not a clean backdrop: undo
    }
  }

  if (!cut) { try { cut = await mlCut(bmp, w, h, d); } catch (e) { console.warn("cut-out skipped:", e); cut = false; } }

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
