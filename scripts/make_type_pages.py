#!/usr/bin/env python3
"""Make the five museum type pages (/decks/ /trucks/ /wheels/ /obstacles/ /misc/) from index.html.

Each is the museum page showing only that kind. Run after changing index.html, then run stamp_assets.py:
  python3 scripts/make_type_pages.py && python3 scripts/stamp_assets.py
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "index.html").read_text()
TITLES = {"decks": "Decks", "trucks": "Trucks", "wheels": "Wheels", "obstacles": "Obstacles", "misc": "Misc."}
for kind, name in TITLES.items():
    t = src
    t = t.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="/">', 1)   # the page lives in a folder, so keep every link pointing at the site root
    t = re.sub(r"<title>.*?</title>", f"<title>{name} · The Museum of Mini Skateboards</title>", t, count=1)
    t = t.replace('<script src="moms-config.js', f'<script>window.MOMS_ONLY = "{kind}";</script>\n  <script src="moms-config.js', 1)
    (root / kind).mkdir(exist_ok=True)
    (root / kind / "index.html").write_text(t)
    print("wrote", kind + "/index.html")
