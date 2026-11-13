// Turns a chosen photo into the picture we keep.
//  1. Already transparent (a cut-out): trimmed and sized like the museum's.
//  2. Shot on a plain backdrop (white sheet, floor, grey card): the backdrop is removed automatically, then trimmed and sized.
//  3. Anything busier: kept as an ordinary photo, just shrunk so it loads fast.
// ---- mask tools (work on 0/1 maps at a modest working size) ----
function edtSq(fg, w, h) {   // squared distance from every pixel to the nearest foreground pixel
  const INF = 1e12, n = w * h, g = new Float64Array(n), m = Math.max(w, h);
  for (let i = 0; i < n; i++) g[i] = fg[i] ? 0 : INF;
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; pass(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; pass(w); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
  return g;
}
function morph(m, w, h, r, kind) {   // disk-shaped dilate / erode / close / open, padded so the picture's edge is not treated as board
  const p = Math.ceil(r) + 2, W = w + 2 * p, H = h + 2 * p, a = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y + p) * W + x + p] = m[y * w + x];
  const dil = (src) => { const D = edtSq(src, W, H), o = new Uint8Array(W * H); for (let i = 0; i < o.length; i++) o[i] = D[i] <= r * r ? 1 : 0; return o; };
  const ero = (src) => { const inv = new Uint8Array(W * H); for (let i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1; const D = edtSq(inv, W, H), o = new Uint8Array(W * H); for (let i = 0; i < o.length; i++) o[i] = D[i] > r * r ? 1 : 0; return o; };
  const res = kind === "close" ? ero(dil(a)) : kind === "open" ? dil(ero(a)) : kind === "dilate" ? dil(a) : ero(a);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = res[(y + p) * W + x + p];
  return out;
}
function mainObject(b, w, h) {   // biggest piece (and any piece at least a quarter its size), holes filled
  const n = w * h, lab = new Int32Array(n), sizes = [0], st = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!b[i] || lab[i]) continue;
    const id = sizes.length; let c = 0, sp = 0; st[sp++] = i; lab[i] = id;
    while (sp) {
      const k = st[--sp]; c++; const x = k % w;
      if (x > 0 && b[k - 1] && !lab[k - 1]) { lab[k - 1] = id; st[sp++] = k - 1; }
      if (x < w - 1 && b[k + 1] && !lab[k + 1]) { lab[k + 1] = id; st[sp++] = k + 1; }
      if (k >= w && b[k - w] && !lab[k - w]) { lab[k - w] = id; st[sp++] = k - w; }
      if (k < n - w && b[k + w] && !lab[k + w]) { lab[k + w] = id; st[sp++] = k + w; }
    }
    sizes.push(c);
  }
  const big = Math.max(0, ...sizes), keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) keep[i] = lab[i] && sizes[lab[i]] >= big * 0.25 ? 1 : 0;
  const out = new Uint8Array(n); let sp = 0;   // holes: whatever the outside cannot reach belongs to the board
  const seed = (k) => { if (!keep[k] && !out[k]) { out[k] = 1; st[sp++] = k; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const k = st[--sp], x = k % w;
    if (x > 0) seed(k - 1); if (x < w - 1) seed(k + 1); if (k >= w) seed(k - w); if (k < n - w) seed(k + w);
  }
  for (let i = 0; i < n; i++) keep[i] = out[i] ? 0 : 1;
  return keep;
}

// Busy photos (a board on a table, floor or cloth): a cut-out model that runs in the browser, only when needed.
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
async function loadModel(ort) {
  if (ortSession) return ortSession;
  for (const url of ["/models/u2net_int8.onnx", "/models/u2netp.onnx"]) {   // the better model first; the small one if the phone cannot hold it
    try { ortSession = await ort.InferenceSession.create(url, { executionProviders: ["wasm"] }); return ortSession; } catch (e) { console.warn("cut-out model failed:", url, e); }
  }
  throw new Error("no cut-out model");
}
async function mlCut(bmp, w, h, d) {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = ORT_BASE; ort.env.wasm.numThreads = 1;
  const sess = await loadModel(ort);
  const N = 320, sc = document.createElement("canvas"); sc.width = sc.height = N;
  const sx = sc.getContext("2d", { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, N, N);
  const px = sx.getImageData(0, 0, N, N).data, inp = new Float32Array(3 * N * N);
  let mx = 1; for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) if (px[i * 4 + c] > mx) mx = px[i * 4 + c];
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) inp[c * N * N + i] = (px[i * 4 + c] / mx - mean[c]) / std[c];
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", inp, [1, 3, N, N]) });
  const m = out[sess.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m.length; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  // the model's soft map, up to a working size for the outline work
  const k = Math.min(1, 800 / Math.max(w, h)), pw = Math.max(8, Math.round(w * k)), ph = Math.max(8, Math.round(h * k));
  const mc = document.createElement("canvas"); mc.width = mc.height = N;
  const mctx = mc.getContext("2d"), md = mctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) md.data[i * 4 + 3] = Math.round(255 * (m[i] - lo) / (hi - lo || 1));
  mctx.putImageData(md, 0, 0);
  const pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
  const pctx = pc.getContext("2d", { willReadFrequently: true }); pctx.imageSmoothingQuality = "high"; pctx.drawImage(mc, 0, 0, pw, ph);
  const pd = pctx.getImageData(0, 0, pw, ph).data, bin = new Uint8Array(pw * ph);
  for (let i = 0; i < bin.length; i++) bin[i] = pd[i * 4 + 3] > 127 ? 1 : 0;
  let keep = mainObject(bin, pw, ph);
  let y0 = ph, y1 = -1, area = 0;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (keep[y * pw + x]) { area++; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!area || area / (pw * ph) < 0.04 || area / (pw * ph) > 0.85) return false;   // nothing clear to cut out: keep the photo as it is
  const oh = y1 - y0 + 1;   // the object's height sets the size of every fix below
  keep = mainObject(morph(keep, pw, ph, Math.max(2, oh * 0.015), "close"), pw, ph);   // fill small notches
  // the nose: a dark nose on a dark backdrop is often missed. Round off any bite out of the top third.
  const cut = y0 + Math.round(oh * 0.30), top = new Uint8Array(pw * ph);
  for (let y = y0; y < cut; y++) for (let x = 0; x < pw; x++) top[y * pw + x] = keep[y * pw + x];
  const pts = [];   // convex hull of the top third (the nose of a deck is convex): fills any bite without inventing corners
  for (let y = y0; y < cut; y++) for (let x = 0; x < pw; x++) if (top[y * pw + x] && (x === 0 || !top[y * pw + x - 1] || x === pw - 1 || !top[y * pw + x + 1] || y === y0 || y === cut - 1 || !top[(y - 1) * pw + x] || !top[(y + 1) * pw + x])) pts.push([x, y]);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lowH = [], upH = [];
  for (const p of pts) { while (lowH.length > 1 && cr(lowH[lowH.length - 2], lowH[lowH.length - 1], p) <= 0) lowH.pop(); lowH.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upH.length > 1 && cr(upH[upH.length - 2], upH[upH.length - 1], p) <= 0) upH.pop(); upH.push(p); }
  const hull = lowH.slice(0, -1).concat(upH.slice(0, -1));
  if (hull.length > 2) {
    const hc = document.createElement("canvas"); hc.width = pw; hc.height = ph;
    const hx = hc.getContext("2d", { willReadFrequently: true }); hx.fillStyle = "#000"; hx.beginPath();
    hull.forEach((p, i) => (i ? hx.lineTo(p[0] + 0.5, p[1] + 0.5) : hx.moveTo(p[0] + 0.5, p[1] + 0.5))); hx.closePath(); hx.fill();
    const hd = hx.getImageData(0, 0, pw, ph).data;
    for (let i = 0; i < keep.length; i++) if (hd[i * 4 + 3] > 127) keep[i] = 1;
  }
  // a thin bulge of backdrop beside the wheels at the bottom: trim it (wheels are far wider and stay)
  const opened = morph(keep, pw, ph, Math.max(2, oh * 0.026), "open"), low = y1 - Math.round(oh * 0.35);
  for (let y = Math.max(0, low); y < ph; y++) for (let x = 0; x < pw; x++) keep[y * pw + x] = opened[y * pw + x];
  keep = mainObject(keep, pw, ph);
  // smooth the contour in proportion to the object, then a narrow ramp for a crisp anti-aliased edge
  const sigma = Math.max(1.5, oh * 0.009), rb = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const f = new Float32Array(pw * ph); for (let i = 0; i < f.length; i++) f[i] = keep[i];
  const S = boxBlur(boxBlur(boxBlur(f, pw, ph, rb), pw, ph, rb), pw, ph, rb);
  const ac = document.createElement("canvas"); ac.width = pw; ac.height = ph;
  const actx = ac.getContext("2d"), ad = actx.createImageData(pw, ph);
  for (let i = 0; i < S.length; i++) ad.data[i * 4 + 3] = Math.round(255 * ss(0.50, 0.59, S[i]));
  actx.putImageData(ad, 0, 0);
  const fc = document.createElement("canvas"); fc.width = w; fc.height = h;
  const fx = fc.getContext("2d", { willReadFrequently: true }); fx.imageSmoothingQuality = "high"; fx.drawImage(ac, 0, 0, w, h);
  const fd = fx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = fd[i * 4 + 3];
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

// Turn the (rough) cut-out into one solid silhouette: the main object only, no holes, a smooth contour.
// The photo is then clipped by this shape; nothing inside it is touched.
function solidSilhouette(A, W, H) {
  const n = W * H, bin = new Uint8Array(n), lab = new Int32Array(n), sizes = [0], stack = new Int32Array(n);
  for (let i = 0; i < n; i++) bin[i] = A[i] > 0.5 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    if (!bin[i] || lab[i]) continue;
    const id = sizes.length; let cnt = 0, sp = 0; stack[sp++] = i; lab[i] = id;
    while (sp) {
      const k = stack[--sp]; cnt++; const x = k % W;
      if (x > 0 && bin[k - 1] && !lab[k - 1]) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (x < W - 1 && bin[k + 1] && !lab[k + 1]) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (k >= W && bin[k - W] && !lab[k - W]) { lab[k - W] = id; stack[sp++] = k - W; }
      if (k < n - W && bin[k + W] && !lab[k + W]) { lab[k + W] = id; stack[sp++] = k + W; }
    }
    sizes.push(cnt);
  }
  const big = Math.max(0, ...sizes), solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = lab[i] && sizes[lab[i]] >= big * 0.25 ? 1 : 0;
  // fill holes: whatever the outside cannot reach is part of the object
  const out = new Uint8Array(n); let sp = 0;
  for (let x = 0; x < W; x++) for (const k of [x, (H - 1) * W + x]) if (!solid[k] && !out[k]) { out[k] = 1; stack[sp++] = k; }
  for (let y = 0; y < H; y++) for (const k of [y * W, y * W + W - 1]) if (!solid[k] && !out[k]) { out[k] = 1; stack[sp++] = k; }
  while (sp) {
    const k = stack[--sp], x = k % W;
    if (x > 0 && !solid[k - 1] && !out[k - 1]) { out[k - 1] = 1; stack[sp++] = k - 1; }
    if (x < W - 1 && !solid[k + 1] && !out[k + 1]) { out[k + 1] = 1; stack[sp++] = k + 1; }
    if (k >= W && !solid[k - W] && !out[k - W]) { out[k - W] = 1; stack[sp++] = k - W; }
    if (k < n - W && !solid[k + W] && !out[k + W]) { out[k + W] = 1; stack[sp++] = k + W; }
  }
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = out[i] ? 0 : 1;
  // smooth the contour (about 4-5px), then a narrow ramp for an anti-aliased edge, shaved by a hair to lose any backdrop rim
  const S = boxBlur(boxBlur(boxBlur(f, W, H, 2), W, H, 2), W, H, 2), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ss(0.48, 0.56, S[i]);
  return q;
}

// How far (degrees) the object's long axis leans from upright; + means the top leans left, like a backslash. 0 for round objects.
function tiltOf(d, w, h) {
  let n = 0, mx = 0, my = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (d[(y * w + x) * 4 + 3] > 127) { n++; mx += x; my += y; }
  if (n < 50) return 0;
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (d[(y * w + x) * 4 + 3] > 127) { const a = x - mx, b = y - my; sxx += a * a; syy += b * b; sxy += a * b; }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l1 < l2 * 1.8) return 0;   // not clearly longer one way: leave it alone
  let vx = sxy, vy = l1 - sxx;   // the long axis
  if (Math.abs(vx) + Math.abs(vy) < 1e-9) { vx = l1 - syy; vy = sxy; }
  let a = Math.atan2(vx, vy) * 180 / Math.PI;
  if (a > 90) a -= 180; else if (a < -90) a += 180;   // the smaller turn, so the nose stays the way it was shot
  return a;
}

window.momsPreparePhoto = async function (file, section) {
  if (file.size > 25 * 1024 * 1024) throw new Error("That photo is too big (25 MB max).");
  const skip = document.getElementById("skip-cut")?.checked;   // the museum owner's "skip cutout" box (transparent PNGs only)
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("Couldn't read that photo. Try a JPG or PNG."); }
  const k0 = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));   // working copy for finding the outline
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
  let preCut = false;   // the person supplied a ready-made cut-out
  if (edgeClear > edgeN * 0.3) { cut = true; preCut = true; }
  if (skip) {   // use the picture exactly as it is: no cutout, trimming or resizing
    if (file.type !== "image/png") throw new Error("Skip cutout only works with PNG files. Untick it to have the background removed.");
    if (!preCut) throw new Error("That PNG doesn't have a transparent background, so the cutout can't be skipped. Untick \"Skip cutout\" to have the background removed.");
    if (file.size > 8 * 1024 * 1024) throw new Error("That PNG is over 8 MB. Make it smaller and try again.");
    return { blob: file, ext: "png", type: "image/png", cut: true, source: null };
  }

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
        // Double-check with the model. If the two outlines disagree a lot, the flat-backdrop method probably chopped
        // part of the board (dark or similar-coloured areas) or kept background (shadows, streaks): trust the model.
        try {
          const probe = new Uint8ClampedArray(d);
          if (await mlCut(bmp, w, h, probe)) {
            let inter = 0, uni = 0;
            for (let i = 0; i < w * h; i++) { const f = d[i * 4 + 3] > 127, m = probe[i * 4 + 3] > 127; if (f && m) inter++; if (f || m) uni++; }
            if (uni && inter / uni < 0.9) d.set(probe);
          }
        } catch (e) { console.warn("cross-check skipped:", e); }
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
    // A cropped copy of the original (the board plus a margin, not the whole room): a stronger cut-out is made from it later.
    let source = null;
    if (!preCut) {
      const ox = bmp.width / w, oy = bmp.height / h;
      const mx2 = box.w * ox * 0.25, my2 = box.h * oy * 0.25;   // generous margin, in case the quick cut-out missed an end of the board
      const qx = Math.max(0, box.x * ox - mx2), qy = Math.max(0, box.y * oy - my2);
      const qw = Math.min(bmp.width - qx, box.w * ox + 2 * mx2), qh = Math.min(bmp.height - qy, box.h * oy + 2 * my2);
      const ks = Math.min(1, 2000 / Math.max(qw, qh)), sc2 = document.createElement("canvas");
      sc2.width = Math.max(1, Math.round(qw * ks)); sc2.height = Math.max(1, Math.round(qh * ks));
      const s2 = sc2.getContext("2d"); s2.imageSmoothingQuality = "high"; s2.fillStyle = "#fff"; s2.fillRect(0, 0, sc2.width, sc2.height);
      s2.drawImage(bmp, qx, qy, qw, qh, 0, 0, sc2.width, sc2.height);
      source = await new Promise((r) => sc2.toBlob(r, "image/jpeg", 0.9));
    }
    // Stand the board upright if it was photographed at an angle (decks and setups only).
    let P = bmp, PW = bmp.width, PH = bmp.height, M = c, MW = w, MH = h, B = box;
    const ang = tall ? tiltOf(d, w, h) : 0;
    if (Math.abs(ang) > 2.5) {
      const rad = ang * Math.PI / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
      const turn = (src, sw, sh, dw2, dh2) => {   // src drawn at dw2 x dh2, rotated clockwise by ang
        const nw = Math.ceil(dw2 * cs + dh2 * sn), nh = Math.ceil(dw2 * sn + dh2 * cs), cv = document.createElement("canvas");
        cv.width = nw; cv.height = nh;
        const g = cv.getContext("2d", { willReadFrequently: true }); g.imageSmoothingQuality = "high";
        g.translate(nw / 2, nh / 2); g.rotate(rad); g.drawImage(src, 0, 0, sw, sh, -dw2 / 2, -dh2 / 2, dw2, dh2);
        return cv;
      };
      const kp = Math.min(1, 2600 / Math.max(bmp.width, bmp.height));   // the picture, kept large
      P = turn(bmp, bmp.width, bmp.height, Math.round(bmp.width * kp), Math.round(bmp.height * kp)); PW = P.width; PH = P.height;
      M = turn(c, w, h, w, h); MW = M.width; MH = M.height;
      const ra = M.getContext("2d").getImageData(0, 0, MW, MH).data;
      let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
      for (let yy = 0; yy < MH; yy += 2) for (let xx = 0; xx < MW; xx += 2) if (ra[(yy * MW + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 >= 0) B = { x: x0, y: y0, w: x1 - x0 + 2, h: y1 - y0 + 2 };
    }
    const [W, H, fill] = tall && B.h > B.w * 1.4 ? [530, 1200, 0.96] : [800, 800, 0.9];
    out.width = W; out.height = H;
    const k = Math.min(W / B.w, H / B.h) * fill;
    // The outline was worked out on a smaller copy. The board's pixels come straight from the ORIGINAL photo at full
    // size and are only shrunk at the very end, into the frame; the outline becomes a solid clipping shape.
    const dx = (W - B.w * k) / 2, dy = (H - B.h * k) / 2, dw = B.w * k, dh = B.h * k;
    const sx = PW / MW, sy = PH / MH;
    o.imageSmoothingQuality = "high";
    o.drawImage(P, Math.max(0, B.x * sx), Math.max(0, B.y * sy), Math.min(PW, B.w * sx), Math.min(PH, B.h * sy), dx, dy, dw, dh);
    const mk = document.createElement("canvas"); mk.width = W; mk.height = H;
    const mx = mk.getContext("2d", { willReadFrequently: true }); mx.imageSmoothingQuality = "high";
    mx.drawImage(M, B.x, B.y, B.w, B.h, dx, dy, dw, dh);   // the rough cut-out, stretched into the frame
    const md = mx.getImageData(0, 0, W, H).data, rough = new Float32Array(W * H);
    for (let i = 0; i < rough.length; i++) rough[i] = md[i * 4 + 3] / 255;
    const shape = solidSilhouette(rough, W, H), od = o.getImageData(0, 0, W, H);
    for (let i = 0; i < shape.length; i++) od.data[i * 4 + 3] = Math.round(255 * shape[i]);
    o.putImageData(od, 0, 0);
    return { blob: await new Promise((r) => out.toBlob(r, "image/png")), ext: "png", type: "image/png", cut: true, source };
  }
  out.width = w; out.height = h; o.fillStyle = "#fff"; o.fillRect(0, 0, w, h); o.drawImage(bmp, 0, 0, w, h);
  return { blob: await new Promise((r) => out.toBlob(r, "image/jpeg", 0.86)), ext: "jpg", type: "image/jpeg", cut: false };
};
