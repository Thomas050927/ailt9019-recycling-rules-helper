/**
 * Live check: run real questions through the real pipeline against a real model.
 *
 * Reads the key from .env (gitignored) so it never appears in a command line,
 * a shell history, or this file.
 *
 *   node tools/live_check.mjs "How should chemical waste be segregated?"
 *
 * Prints what the model actually returned after validation, including any
 * citations it invented and had thrown away.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function loadEnv(file = join(root, ".env")) {
  const out = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match) out[match[1]] = match[2].trim();
    }
  } catch {
    /* no .env: fall back to the process environment */
  }
  return out;
}

const env = loadEnv();
const apiKey = env.BAILIAN_API_KEY || process.env.BAILIAN_API_KEY || "";
const endpoint = env.BAILIAN_BASE_URL || process.env.BAILIAN_BASE_URL || "";
const model = process.env.MODEL || "qwen3.8-flash";

const { buildIndex, search } = await import(pathToFileURL(join(root, "app/retrieve.js")).href);
const { ask } = await import(pathToFileURL(join(root, "app/ai.js")).href);

const corpus = JSON.parse(readFileSync(join(root, "app/corpus/index.json"), "utf8"));
const contacts = JSON.parse(readFileSync(join(root, "app/contacts.json"), "utf8"));
const index = buildIndex(corpus.chunks || []);
const documents = corpus.documents || [];

const questions = process.argv.slice(2);
if (!questions.length) {
  console.error('usage: node tools/live_check.mjs "<question>" ["<question>" ...]');
  process.exit(2);
}
if (!apiKey) {
  console.error("No API key found in .env (BAILIAN_API_KEY).");
  process.exit(2);
}

console.log(`model: ${model}`);
console.log(`endpoint: ${endpoint}`);
console.log(`corpus: ${index.size} clauses from ${documents.length} document(s)\n`);

for (const query of questions) {
  const { hits, coverage, terms } = search(index, query, { limit: 6 });
  console.log("=".repeat(72));
  console.log(`Q: ${query}`);
  console.log(
    `   retrieval: ${hits.length} hits, coverage ${(coverage * 100).toFixed(0)}% ` +
      `(${terms.length} terms)`
  );
  if (hits.length) {
    console.log(`   top: ${hits[0].id} § ${hits[0].clause} p.${hits[0].page} score ${hits[0].score.toFixed(2)}`);
  }

  const started = Date.now();
  try {
    const result = await ask({
      query,
      hits,
      coverage,
      documents,
      contacts,
      endpoint,
      apiKey,
      model,
      terms,
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`   -> kind: ${result.kind}   (${elapsed}s, no model call: ${result.kind !== "answered"})`);

    const a = result.answer;
    if (result.kind === "emergency") {
      console.log(`   headline: ${a.headline}`);
      console.log(`   contacts: ${a.contacts.map((c) => `${c.label} ${c.phone || c.email}`).join(" | ")}`);
    } else if (result.kind === "refused") {
      console.log(`   headline: ${a.headline}`);
      console.log(`   reason: ${a.reason}`);
    } else {
      console.log(`   status: ${a.status}   citations: ${a.citationCount}   dropped: ${a.droppedCitations}`);
      if (a.summary) console.log(`   summary: ${a.summary}`);
      if (a.steps?.length) {
        for (const [i, step] of a.steps.entries()) {
          const refs = step.citations.map((c) => `§${c.clause} p.${c.page}`).join(", ") || "NO CITATION";
          console.log(`   ${i + 1}. ${step.action}  [${refs}]`);
        }
      }
      if (a.collectionPoint?.text) {
        const refs = a.collectionPoint.citations.map((c) => `§${c.clause} p.${c.page}`).join(", ");
        console.log(`   collection point: ${a.collectionPoint.text} [${refs}]`);
      }
      if (a.currency) console.log(`   currency: ${a.currency}`);
      if (a.reason) console.log(`   reason: ${a.reason}`);
    }
    console.log();
  } catch (error) {
    console.log(`   !! ${error.name}: ${error.message}`);
    console.log();
  }
}
