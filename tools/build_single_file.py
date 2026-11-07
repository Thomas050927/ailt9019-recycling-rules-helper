#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML file.

Why: ES modules and fetch() of sibling JSON files are both blocked on file://,
so the normal build only works when served over HTTP. This inlines the styles,
the JSON data and the scripts so a single .html file can be opened by
double-click on a machine with no Python, no server and no install.

Usage:
    python tools/build_single_file.py [--out waste-guide.html]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"

MODULES = ["retrieve.js", "ai.js", "render.js", "app.js"]

IMPORT_LINE = re.compile(r'^\s*import\s[^;]*?from\s*"[^"]+"\s*;?\s*$', re.MULTILINE)
EXPORT_PREFIX = re.compile(r"^(\s*)export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)", re.MULTILINE)


def strip_module_syntax(source: str, name: str) -> str:
    source = IMPORT_LINE.sub("", source)
    source = EXPORT_PREFIX.sub(r"\1", source)
    leftover = re.findall(r"^\s*(?:import|export)\b.*$", source, re.MULTILINE)
    if leftover:
        raise SystemExit(f"{name} still has module syntax:\n" + "\n".join(leftover[:5]))
    return source


def read_json(relative: str) -> str:
    path = ROOT / relative
    data = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="waste-guide.html")
    args = parser.parse_args()

    html = (APP / "index.html").read_text(encoding="utf-8")
    css = (APP / "styles.css").read_text(encoding="utf-8")

    # 1. Inline the stylesheet.
    html, css_count = re.subn(
        r'<link[^>]+href="\.?/?styles\.css"[^>]*>', f"<style>\n{css}\n</style>", html, count=1
    )
    if not css_count:
        raise SystemExit("could not find the styles.css link tag")

    # 2. Drop things that only make sense when hosted.
    html = re.sub(r'<link[^>]+rel="manifest"[^>]*>', "", html)
    html = re.sub(r'<link[^>]+rel="icon"[^>]*>', "", html)

    # 3. Build the script bundle.
    parts = [
        "/* Bundled from app/ by tools/build_single_file.py — edit the sources, not this file. */",
        "(async function () {",
        f'window.__CRH_DATA__ = {{ corpus: {read_json("app/corpus/index.json")},',
        f'  contacts: {read_json("app/contacts.json")},',
        f'  sources: {read_json("app/hku-sources.json")} }};',
    ]
    for module in MODULES:
        source = (APP / module).read_text(encoding="utf-8")
        parts.append(f"\n/* ===== {module} ===== */\n")
        parts.append(strip_module_syntax(source, module))
    parts.append("\n})();")

    bundle = "\n".join(parts)

    # 4. Swap the module script for the inline bundle.
    html, js_count = re.subn(
        r'<script[^>]+src="\.?/?app\.js"[^>]*>\s*</script>',
        lambda _m: "<script>\n" + bundle + "\n</script>",
        html,
        count=1,
    )
    if not js_count:
        raise SystemExit("could not find the app.js script tag")

    # 5. Note the offline nature in the title area so nobody wonders where answers went.
    html = html.replace(
        "<title>", "<title>Offline copy · ", 1
    ) if "<title>" in html else html

    out_path = ROOT / args.out
    out_path.write_text(html, encoding="utf-8")
    size_kb = out_path.stat().st_size / 1024
    print(f"wrote {out_path.relative_to(ROOT)} ({size_kb:.0f} KB)")
    print(f"  inlined: styles.css, {len(MODULES)} modules, 3 JSON payloads")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
