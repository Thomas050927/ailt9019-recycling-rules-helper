AILT9019_group60

Group Members:
LEUNG,Yu Cheung
PONG,Yat Long Cyrus
TONG,Yuk Ming
WIJAYA,Eveline

# Recycling Rules Helper

A document-grounded Q&A assistant for campus waste disposal. Ask a natural-language question ("how do I dispose of spent chemicals?") and get a short, step-by-step protocol where **every step cites the exact policy clause and PDF page** it came from — or a refusal when the fixed corpus does not support an answer.

Not an emergency dispatcher, not a collection scheduler, not a regulatory interpreter. Active hazards trigger a safety gate that shows verified campus contacts and gives no disposal steps.

## How it works

```
tools/corpus.json          the fixed corpus manifest (document, version, official URL)
      │  python tools/fetch_corpus.py     downloads the PDFs (gitignored)
      │  python tools/build_index.py      PDF → hierarchical clause chunks
      ▼
app/corpus/index.json      frozen chunk index, committed (85 clauses from the
                           HKU Chemical Waste policy, each with § number + page)
      │
      ▼  browser
app/retrieve.js            BM25 ranking over clauses + synonym expansion
app/ai.js                  safety gates → refusal or model call → citation validation
app/render.js              answer card with § x.y.z · p.N chips and source excerpts
```

Design decisions that matter for the evaluation:

- **Chunking is hierarchical, not page-level.** Each chunk carries `document → section → clause` and its page range, so a citation is `Chemical Waste v3, § 1.2.1, PDF p.3` — exactly what the proposal requires. Page furniture (headers, footers, tables of contents) is stripped during indexing.
- **Citations cannot be fabricated.** The model receives context passages labelled `C1…Cn` and may only reference those IDs. Every returned ID is checked against the retrieved set; invented ones are dropped, and an "answer" with zero surviving citations is downgraded to *not found*.
- **The two 100% requirements are deterministic.** Emergency interception and out-of-scope refusal are decided by a lexicon *before* the model is called, so they cannot be flipped by a bad model day. Emergency answers need no API key.
- **The corpus is frozen, not live-fetched.** The committed index is the snapshot; each answer shows the document's issue/review dates, and stale documents carry a visible warning.

## Run it

**Local, full AI** (recommended for the group key):

```bash
cp .env.example .env          # then put the group key in BAILIAN_API_KEY
python tools/proxy.py         # serves the app + proxies model calls
# open http://127.0.0.1:8787  → endpoint "Local proxy"
```

**Browser-only, no install**: the deployed GitHub Pages site works too — paste a key into *Model settings* and pick the DashScope endpoint (it allows browser calls). The Token Plan endpoint does not send CORS headers, so from a hosted page it only works through the local proxy.

The API key lives in `sessionStorage` of the tab that typed it. It is never written to disk, the page, or the repository. **Never commit a key** — this repo is public and the course key is shared by the whole group. If a key leaks, ask the TA team to regenerate it.

## Tests

```bash
node tests/run_tests.mjs      # 26 checks, no API key needed (model call is stubbed)
```

Covers retrieval quality on real corpus queries, the emergency/out-of-scope lexicons, citation-ID validation (fabricated IDs are dropped, uncited answers degrade to *not found*), and the full pipeline against a stubbed model.

Deep-linkable questions for manual checks: `/?q=A%20chemical%20bottle%20is%20leaking%20in%20my%20lab`

## Known limitations

- **Corpus is one document** (HKU *Chemical Waste v3*, 2012, review date passed — flagged in the UI). Battery and e-waste questions currently refuse, because the corpus genuinely has nothing on them. Adding documents is a manifest entry plus `python tools/build_index.py`.
- Appendix tables extract imperfectly; pages with figures only (12, 16–18, 24, 26) have no chunks.
- Clause detection is heuristic (numbered lines must read like headings/sentences, not table rows). It is tuned for this document family and may need adjustment for new ones.
- Uploaded PDFs are split into page-level passages and become citable, but a PDF gives no clause numbers — their citations read `§ p.7`, not `§ 1.2.1`.

## Repository layout

```
app/                  the PWA (index.html, app.js, retrieve.js, ai.js, render.js, corpus/)
skills/               the agent-skill definition of the same workflow (SKILL.md)
tools/                corpus manifest, index builder, fetcher, local CORS proxy
tests/                headless pipeline tests
.github/workflows/    Pages deployment with static validation
```
