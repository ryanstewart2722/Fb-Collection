#!/usr/bin/env python3
"""High-quality re-cuts of people's collection photos.

When someone adds a photo, their browser makes a quick cut-out so it shows straight away, and saves a
cropped copy of the original. This script (run every few minutes by .github/workflows/recut.yml) takes
those originals, cuts them out again with a much stronger model (BiRefNet), frames them like the museum's
own photos, and saves them in user-cuts/. The collection page then shows the better version.

  python3 scripts/recut_worker.py plan   # is there anything to do? (no extra packages needed)
  python3 scripts/recut_worker.py run    # do the work

It only ever sees what any visitor can see: approved items in public collections.
"""
import hashlib, io, json, os, pathlib, re, sys, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "user-cuts"
INDEX = OUT / "index.json"
LIMIT = int(os.environ.get("RECUT_LIMIT", "40"))          # photos per run
cfg = (ROOT / "moms-config.js").read_text()
URL = re.search(r'url:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'key:\s*"([^"]+)"', cfg).group(1)       # the public key: only what any visitor may read
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY}


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={**HEAD, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def visible_items():
    q = "select=id,section,source_path&source_path=not.is.null&status=eq.approved&limit=5000"
    return json.loads(http(f"{URL}/rest/v1/collection_items?{q}"))


def fetch_source(path):
    if re.match(r"https?://", path):
        return http(path, headers={"apikey": "", "Authorization": ""})
    signed = json.loads(http(f"{URL}/storage/v1/object/sign/uploads/{urllib.parse.quote(path)}",
                             data=json.dumps({"expiresIn": 600}).encode(), headers={"Content-Type": "application/json"}))
    return http(f"{URL}/storage/v1{signed['signedURL']}")


def load_index():
    return json.loads(INDEX.read_text()) if INDEX.exists() else {}


def plan():
    items = {i["id"]: i for i in visible_items()}
    index = load_index()
    todo = [i for i in items.values() if index.get(i["id"], {}).get("src") != i["source_path"]]
    stale = [k for k, v in index.items() if k not in items or v.get("src") != items[k]["source_path"]]
    return items, index, todo, stale


def cut(data, section, sess):
    """Original photo -> museum-style cut-out (PIL image), or None if no clear subject."""
    import numpy as np
    from PIL import Image, ImageOps
    from scipy import ndimage as ndi
    from rembg import remove
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    wk = im.copy(); wk.thumbnail((1600, 1600))                      # the outline does not need every pixel
    a = np.asarray(remove(wk, session=sess))[..., 3].astype(np.float32) / 255
    b = a > 0.5
    lab, n = ndi.label(b)
    if not n:
        return None
    sizes = ndi.sum(b, lab, range(1, n + 1)); big = sizes.max()
    keep = ndi.binary_fill_holes(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= big * 0.25]))   # main object, no holes
    frac = keep.sum() / keep.size
    if frac < 0.03 or frac > 0.92:
        return None
    ys, xs = np.where(keep); oh = ys.max() - ys.min() + 1
    sig = max(1.2, oh * 0.0035)                                      # a whisker: removes stair-steps, keeps the board's real shape (wheels included)
    s = ndi.gaussian_filter(keep.astype(np.float32), sig)
    t = np.clip((s - 0.5) / 0.10, 0, 1); alpha_w = t * t * (3 - 2 * t)   # crisp, anti-aliased edge
    alpha = Image.fromarray((alpha_w * 255).astype("uint8")).resize(im.size, Image.BICUBIC)
    c = im.convert("RGBA"); c.putalpha(alpha)
    c = c.crop(alpha.getbbox())                                      # trim to the board itself...
    tall = section in ("decks", "setups") and c.height > c.width * 1.4
    W, H, fill = (530, 1200, 0.96) if tall else (800, 800, 0.9)
    k = min(W / c.width, H / c.height) * fill
    c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)   # ...and shrink last
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0)); o.paste(c, ((W - c.width) // 2, (H - c.height) // 2), c)
    return o


def run():
    items, index, todo, stale = plan()
    OUT.mkdir(exist_ok=True)
    for k in stale:                                                  # removed, made private, or photo replaced
        f = ROOT / index[k].get("file", "")
        if index[k].get("file") and f.is_file():
            f.unlink()
        del index[k]
    done = 0
    if todo:
        from rembg import new_session
        sess = new_session("birefnet-general-lite", providers=["CPUExecutionProvider"])
        for it in todo[:LIMIT]:
            entry = {"src": it["source_path"]}
            try:
                img = cut(fetch_source(it["source_path"]), it["section"], sess)
                if img is not None:
                    name = f"user-cuts/{it['id']}-{hashlib.sha1(it['source_path'].encode()).hexdigest()[:8]}.webp"
                    img.save(ROOT / name, "WEBP", quality=92, method=6)
                    entry["file"] = name
                    done += 1
                else:
                    entry["skip"] = "no clear subject"
            except Exception as e:                                   # one bad photo must not stop the rest
                print(f"::warning::{it['id']}: {e}")
                continue
            index[it["id"]] = entry
    # entries without a file are remembered so they are not retried, but the page ignores them
    INDEX.write_text(json.dumps(index, indent=0, sort_keys=True) + "\n")
    print(f"re-cut {done}, removed {len(stale)}, still waiting {max(0, len(todo) - LIMIT)}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "plan"
    if mode == "plan":
        _, _, todo, stale = plan()
        print(f"{len(todo)} photo(s) to re-cut, {len(stale)} old one(s) to remove")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"work={'yes' if (todo or stale) else 'no'}\ncut={'yes' if todo else 'no'}\n")
    else:
        run()
