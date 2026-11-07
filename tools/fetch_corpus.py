#!/usr/bin/env python3
"""Download the PDFs listed in tools/corpus.json into corpus/source/.

    python tools/fetch_corpus.py

PDFs are gitignored on purpose: the repo ships the frozen, built index
(app/corpus/index.json) plus this script, so the corpus can always be
rebuilt and audited without committing copyrighted policy documents.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "corpus.json"


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for doc in manifest["documents"]:
        target = ROOT / doc["file"]
        if target.exists():
            print(f"  = {doc['id']} already present ({target.stat().st_size // 1024} KB)")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        print(f"  + downloading {doc['id']} ...", end=" ", flush=True)
        request = urllib.request.Request(
            doc["sourceUrl"], headers={"User-Agent": "Mozilla/5.0 (corpus fetch)"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
        if not payload.startswith(b"%PDF"):
            sys.exit(f"\n    did not receive a PDF from {doc['sourceUrl']}")
        target.write_bytes(payload)
        print(f"{len(payload) // 1024} KB -> {target.relative_to(ROOT)}")
    print("\nDone. Next: python tools/build_index.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
