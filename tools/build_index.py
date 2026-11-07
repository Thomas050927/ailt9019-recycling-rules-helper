#!/usr/bin/env python3
"""Build the hierarchical chunk index from the fixed policy corpus.

    python tools/build_index.py

Reads tools/corpus.json, extracts text page by page, strips repeated page
furniture, then splits each document into clause-level chunks that keep the
document -> section -> clause hierarchy intact. Output goes to
app/corpus/index.json, which is committed so the browser app works offline.

Why clause level: the evaluation requires exact clause AND page citations.
Flattening a page into one blob destroys the numbering, so we never do that.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("pypdf is required:  python -m pip install pypdf")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "corpus.json"
OUTPUT = ROOT / "app" / "corpus" / "index.json"

# "1.2.1 Text..." / "2. Handling" / "4. Appendices"
CLAUSE_RE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$")
# "Appendix IX" (heading split over two lines on the page), "Appendix VI:
# Hazardous Waste Compatibility Chart", but NOT "Appendix I lists the waste
# types", where the label simply starts a sentence.
APPENDIX_RE = re.compile(
    r"^(?:Appendix|APPENDIX)\s+([IVXLC]+|\d+)\s*(?:[:.\u2013\u2014-]\s*(\S.*))?$"
)
# page furniture that survives the repetition filter
PAGE_NOISE_RE = re.compile(
    r"^(?:page\s+\d+\s*(?:of\s*\d+)?|\d{1,3}|-\s*\d{1,3}\s*-|of\s*\d{1,3})$", re.IGNORECASE
)
# Headers/footers split across lines by the extractor ("... Page 3" / "of 28").
# Only trusted near the top or bottom of a page, so body prose is never touched.
FURNITURE_HINT_RE = re.compile(
    r"(Prepared by|Approved by|Issue Date|Review Date|\bPage\s+\d+|\d+\s+of\s+\d+"
    r"|\bv\.?\s*\d+\b|\(d\))",
    re.IGNORECASE,
)
EDGE_LINES = 4
# Bodies longer than this keep flowing onto the next page as a continuation
# chunk rather than being cut off at MAX_CHUNK_CHARS.
SPLIT_CHARS = 700
# "80 mm 130 mm", "5 day Biochemical Oxygen Demand", "1200 mg/l"...
UNIT_START_RE = re.compile(
    r"^(?:mm|cm|m|km|kg|g|mg|µg|ug|ml|l|%|°|"
    r"day|days|hour|hours|min|mins|ppm|mg/l|ºc|0c)\b",
    re.IGNORECASE,
)
MAX_CHUNK_CHARS = 1400
MIN_CHUNK_CHARS = 60
# A chunk shorter than this is a heading or a table-of-contents entry, not a
# citation-worthy clause. ToC pages produce these in bulk.
MIN_USEFUL_CHARS = 35
# Page furniture that survives line-level filtering because the extractor
# merges it into a body line ("... waste. Chemical Waste v. 3 Page 3 of 28").
INLINE_NOISE_RE = re.compile(
    r"(?:"
    r"Prepared by:[^.]*?(?=Approved by:|Issue Date:|$)"
    r"|Approved by:[^.]*?(?=Issue Date:|Review Date:|$)"
    r"|Issue Date:\s*[A-Za-z]{3,9}\.?\s*\d{4}"
    r"|Review Date:\s*[A-Za-z]{3,9}\.?\s*\d{4}"
    r"|Page\s+\d+\s+of\s+\d+"
    r"|\b[A-Z][A-Za-z ]{0,40}\bv\.?\s*\d+\s*Page\s+\d+"
    r")",
    re.IGNORECASE,
)


def normalise(line: str) -> str:
    line = line.replace("\u00a0", " ").replace("\u2019", "'").replace("\u2018", "'")
    line = line.replace("\u201c", '"').replace("\u201d", '"').replace("\uf0b7", "-")
    line = re.sub(r"[ \t]+", " ", line).strip()
    return line


def strip_inline_noise(text: str) -> str:
    return re.sub(r"\s{2,}", " ", INLINE_NOISE_RE.sub(" ", text)).strip()


def heading_title(rest: str) -> str:
    """A numbered line is a heading when it is short and does not read as prose."""
    rest = rest.strip()
    if len(rest) <= 80 and not rest.endswith((".", ";", ":", ",")):
        return rest
    return ""


def extract_pages(pdf_path: Path) -> list[list[str]]:
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        raw = page.extract_text() or ""
        lines = [normalise(line) for line in raw.splitlines()]
        pages.append([line for line in lines if line])
    return pages


def repeated_furniture(pages: list[list[str]]) -> set[str]:
    """Lines that show up on most pages are headers/footers, not content."""
    if len(pages) < 3:
        return set()
    counts: Counter[str] = Counter()
    for lines in pages:
        counts.update(set(lines))
    threshold = max(3, int(len(pages) * 0.6))
    return {line for line, n in counts.items() if n >= threshold}


def clean_pages(pages: list[list[str]], furniture: set[str]) -> list[list[str]]:
    cleaned = []
    for lines in pages:
        kept = []
        for index, line in enumerate(lines):
            near_edge = index < EDGE_LINES or index >= len(lines) - 2
            if line in furniture or PAGE_NOISE_RE.match(line) or len(line) < 2:
                continue
            if near_edge and FURNITURE_HINT_RE.search(line):
                continue
            kept.append(line)
        cleaned.append(kept)
    return cleaned


def toc_pages(cleaned: list[list[str]]) -> set[int]:
    """Pages that are just a table of contents (1-based numbers).

    Those lines look exactly like clauses but carry no body, so they would
    otherwise produce citations pointing at the contents page instead of the
    real clause.
    """
    pages = set()
    for index, lines in enumerate(cleaned, start=1):
        if len(lines) < 8:
            continue
        structural = sum(
            1 for line in lines if CLAUSE_RE.match(line) or APPENDIX_RE.match(line)
        )
        if structural / len(lines) >= 0.75:
            pages.add(index)
    return pages


def flatten_with_pages(pages: list[list[str]]) -> list[tuple[int, str]]:
    """(pdf_page_number, line) pairs. PDF page numbers are 1-based."""
    out = []
    for index, lines in enumerate(pages, start=1):
        for line in lines:
            out.append((index, line))
    return out


def is_clause_line(line: str) -> tuple[str, str] | None:
    """Return (number, rest) if this line opens a numbered policy clause.

    Table rows and checklist items also begin with a number ("80 mm 130 mm",
    "5 day Biochemical Oxygen Demand"), so the remainder must read like a
    heading or a sentence rather than a unit or a value.
    """
    match = CLAUSE_RE.match(line)
    if not match:
        return None
    number, rest = match.group(1), match.group(2).strip()
    if number.count(".") > 3 or len(number) > 8:
        return None
    if not rest or not rest[0].isupper() or UNIT_START_RE.match(rest):
        return None
    return number, rest


def build_chunks(doc: dict, lines: list[tuple[int, str]], skip_pages: set[int]) -> list[dict]:
    """Split into clause chunks, keeping a document > section > clause path."""
    chunks: list[dict] = []
    stack: list[tuple[int, str]] = []  # (depth, "1.2 Segregation")
    current: dict | None = None
    in_appendix = False

    def open_chunk(clause: str, title: str, page: int, seed: list[str], split: bool = False):
        return {
            "clause": clause,
            "title": title,
            "page": page,
            "_pageEnd": page,
            "_body": list(seed),
            "_split": split,
        }

    def flush() -> None:
        nonlocal current
        if not current:
            return
        body = current.pop("_body")
        text = strip_inline_noise(re.sub(r"\s+", " ", " ".join(body)))
        if not text:
            current = None
            return
        current["text"] = text[:MAX_CHUNK_CHARS]
        current["pageEnd"] = current.pop("_pageEnd", current["page"])
        current["section"] = " > ".join(label for _d, label in stack) or current["clause"]
        current["split"] = current.pop("_split", False)
        chunks.append(current)
        current = None

    for page_no, line in lines:
        if page_no in skip_pages:
            continue

        appendix = APPENDIX_RE.match(line)
        if appendix:
            flush()
            in_appendix = True
            number = f"Appendix {appendix.group(1)}"
            title = (appendix.group(2) or "").strip()
            label = f"{number}: {title}" if title else number
            stack.clear()
            stack.append((1, label))
            current = open_chunk(number, title, page_no, [title] if title else [])
            continue

        # Inside an appendix, numbered lines are table rows, log-sheet fields
        # or checklist items — not citable policy clauses.
        if not in_appendix:
            clause = is_clause_line(line)
            if clause:
                number, rest = clause
                flush()
                depth = number.count(".") + 1
                while stack and stack[-1][0] >= depth:
                    stack.pop()
                title = heading_title(rest)
                stack.append((depth, f"{number} {title}".strip()))
                current = open_chunk(number, title, page_no, [rest])
                continue

        if current is None:
            continue

        # Continue a long body on the next page instead of truncating it, so
        # no clause text is lost and every part keeps an accurate page number.
        if page_no != current["_pageEnd"] and len(" ".join(current["_body"])) > SPLIT_CHARS:
            clause, title = current["clause"], current["title"]
            flush()
            current = open_chunk(clause, title, page_no, [], split=True)
        current["_body"].append(line)
        current["_pageEnd"] = page_no

    flush()
    return postprocess(chunks, doc)


def postprocess(chunks: list[dict], doc: dict) -> list[dict]:
    """De-duplicate identical ids and drop heading stubs."""
    kept: dict[str, dict] = {}
    for chunk in chunks:
        # A heading with no body is only worth keeping at section level; deeper
        # stubs are usually leftovers of the layout.
        if len(chunk["text"]) < MIN_USEFUL_CHARS and chunk["clause"].count(".") >= 2:
            continue
        suffix = f"@p{chunk['page']}" if chunk.pop("split", False) else ""
        chunk["id"] = f"{doc['id']}#{chunk['clause']}{suffix}"
        chunk["doc"] = doc["id"]
        chunk["docShort"] = doc["shortTitle"]
        previous = kept.get(chunk["id"])
        if previous is None or len(chunk["text"]) > len(previous["text"]):
            kept[chunk["id"]] = chunk

    return sorted(kept.values(), key=lambda c: (c["page"], c["id"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(MANIFEST))
    parser.add_argument("--output", default=str(OUTPUT))
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    documents, all_chunks = [], []

    for doc in manifest["documents"]:
        pdf_path = ROOT / doc["file"]
        if not pdf_path.exists():
            print(f"  ! missing PDF for {doc['id']}: {pdf_path}", file=sys.stderr)
            print("    run: python tools/fetch_corpus.py", file=sys.stderr)
            continue

        pages = extract_pages(pdf_path)
        furniture = repeated_furniture(pages)
        cleaned = clean_pages(pages, furniture)
        contents = toc_pages(cleaned)
        chunks = build_chunks(doc, flatten_with_pages(cleaned), contents)
        all_chunks.extend(chunks)

        digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        documents.append(
            {
                key: doc[key]
                for key in (
                    "id",
                    "title",
                    "shortTitle",
                    "publisher",
                    "version",
                    "issueDate",
                    "reviewDate",
                    "sourceUrl",
                    "landingPage",
                    "staleWarning",
                )
                if key in doc
            }
            | {
                "pages": len(pages),
                "chunkCount": len(chunks),
                "sha256": digest,
                "indexedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
        )
        print(f"  {doc['id']}: {len(pages)} pages -> {len(chunks)} clause chunks")
        if furniture:
            print(f"    stripped {len(furniture)} repeated header/footer lines")

    if not all_chunks:
        sys.exit("No chunks built. Is the corpus downloaded?")

    index = {
        "corpusVersion": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "chunkCount": len(all_chunks),
        "documents": documents,
        "chunks": all_chunks,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(f"\nWrote {out.relative_to(ROOT)} — {len(all_chunks)} chunks, {size_kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
