# Campus Waste Guide PWA

An installable web app that answers campus waste-disposal questions from a fixed policy corpus, with clause-and-page citations, safe refusal, and an emergency gate.

## Files

- `index.html`, `styles.css`, `app.js` — UI, optional PDF upload, single ask entry point, wiring
- `retrieve.js` — BM25 retrieval over the clause index
- `ai.js` — safety gates, prompt, model call (OpenAI-compatible), citation validation
- `render.js` — answer card rendering (all model output goes through `textContent`)
- `corpus/index.json` — the frozen clause index built from the corpus
- `contacts.json` — verified campus emergency contacts only
- `sw.js` — offline shell, stale-while-revalidate

Every question goes through one function, `ask()`. There is no second search box, so the emergency and refusal gates cannot be bypassed by finding another input.

## Run locally

```bash
python tools/proxy.py        # from the repo root; serves this folder on :8787
```

or any static server (`python -m http.server 8000` in this folder).

## Model settings

Open *Model settings* under the Ask panel. Three endpoints:

| Endpoint | Reality (tested with the AILT9019 course key) |
|---|---|
| Local proxy | **works** — `python tools/proxy.py` with `BAILIAN_API_KEY` in `.env`; the proxy injects the key, so none is typed in the browser |
| Bailian Token Plan | accepts the course key but sends no CORS headers, so a browser call is blocked |
| Aliyun DashScope | accepts browser calls but **rejects the course key** (`invalid_api_key`) — only useful with a real DashScope key |

The key is kept in `sessionStorage` for the tab only. Nothing is persisted to disk or sent anywhere except the model endpoint you selected.

## Deep links for evaluation

`/?q=<url-encoded question>` auto-asks on load. Emergency and out-of-scope cases render without a key, because those answers are produced by deterministic gates, not the model.

## What needs a key

Only the `answered` path (retrieval passed, model synthesizes steps). Refusals, conflicts, and the safety gate are computed locally.
