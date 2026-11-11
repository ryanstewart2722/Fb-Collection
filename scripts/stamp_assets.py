#!/usr/bin/env python3
"""Add ?v=<fingerprint> to every local CSS/JS file the pages load.

GitHub Pages lets browsers keep files for 10 minutes. Without this, someone can end up with the new page
and an old stylesheet. With it, a changed file has a new address, so it is always fetched fresh.
Run it before committing:  python3 scripts/stamp_assets.py
"""
import hashlib, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
ref = re.compile(r'''((?:href|src)=")([^"?:#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")''')
changed = 0
for page in sorted(root.glob("*.html")):
    text = page.read_text()
    def stamp(m):
        f = root / m.group(2).lstrip("/")
        if not f.is_file():
            return m.group(0)
        return f'{m.group(1)}{m.group(2)}?v={hashlib.md5(f.read_bytes()).hexdigest()[:8]}{m.group(3)}'
    new = ref.sub(stamp, text)
    if new != text:
        page.write_text(new); changed += 1; print("stamped", page.name)
print("done;", changed, "page(s) updated")
