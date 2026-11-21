#!/usr/bin/env python3
"""Builds the STAGING copy of the museum website into staging/dist/.

The staging site is the same code as the real one, with three differences, all made here (so the code itself stays identical
and merging a tested change into the real site never carries staging settings with it):
  1. It talks to the separate STAGING database, never the real one.
  2. It is hidden from search engines and shows a small "STAGING" label.
  3. It leaves out the big files the real site needs but staging doesn't (preview pictures, product-page copies, old museum photos), and loads the cut-out models from the real site instead of copying them (Cloudflare's free limit is 25 MB a file).

Run from anywhere:  python3 staging/build.py
Cloudflare Pages runs this for you on every push to the staging branch (see staging/README.md).
"""
import pathlib, re, shutil

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent
DIST = HERE / "dist"

PROD_REF, STAGING_REF = "alfsnqpxmptvuvakyzcl", "cbtzvkalhyfxhvdsdvxc"
PROD_KEY = "sb_publishable_fpAMGrL1QxRngyGLfvgy1Q_DByMA1ww"
STAGING_KEY = "sb_publishable_7wbr94j_YaqHV0hd-AhRPw_9NeYYUhw"      # a public key, like the real one; it only allows what staging's own rules allow
LIVE_SITE = "https://museumofminiskateboards.org"

SKIP_DIRS = {"og", "p", "u", "Images", "models", "exports", "node_modules", "scripts", "staging", ".git", ".github", ".claude"}
SKIP_FILES = {"CNAME", ".gitignore"}
TEXT = {".html", ".js", ".css", ".json", ".txt", ".xml"}

BANNER_JS = """(function () {
  var b = document.createElement("div");
  b.textContent = "STAGING \\u00b7 test site, not the real museum";
  b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99998;background:#ff3b30;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:3px;letter-spacing:.04em;pointer-events:none;opacity:.92";
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(b); });
})();
"""


def convert(name, data):
    s = data.decode("utf-8")
    s = s.replace(PROD_REF, STAGING_REF).replace(PROD_KEY, STAGING_KEY)
    s = s.replace('"/models/', f'"{LIVE_SITE}/models/')
    if name.endswith(".html"):
        tags = '<meta name="robots" content="noindex,nofollow"><script src="/staging-banner.js"></script>'
        s = re.sub(r"</head>", tags + "</head>", s, count=1, flags=re.I)
    return s.encode("utf-8")


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    made = 0
    for p in sorted(SRC.rglob("*")):
        rel = p.relative_to(SRC)
        if p.is_dir() or rel.parts[0] in SKIP_DIRS or rel.name in SKIP_FILES or rel.name.startswith("."):
            continue
        out = DIST / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if p.suffix in TEXT:
            out.write_bytes(convert(p.name, p.read_bytes()))
        else:
            shutil.copy2(p, out)
        made += 1
    (DIST / "staging-banner.js").write_text(BANNER_JS)
    (DIST / "_headers").write_text("/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n")
    # safety check: nothing in the staging copy may point at the real database
    bad = [str(f.relative_to(DIST)) for f in DIST.rglob("*") if f.is_file() and f.suffix in TEXT and (PROD_REF in f.read_text(errors="ignore") or PROD_KEY in f.read_text(errors="ignore"))]
    if bad:
        raise SystemExit("STOP: these staging files still point at the real database: " + ", ".join(bad))
    print(f"staging copy built: {made} files in {DIST}, none point at the real database")


if __name__ == "__main__":
    main()
