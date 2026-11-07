/**
 * Headless smoke tests for the AI layer. No API key needed: the model call is
 * stubbed, so this verifies retrieval, the safety gates and citation
 * validation — everything except the network round trip.
 *
 *   node tests/run_tests.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildIndex, search } from "../app/retrieve.js";
import {
  ask,
  detectEmergency,
  detectOutOfScope,
  validateAnswer,
  MIN_COVERAGE,
} from "../app/ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const index = JSON.parse(readFileSync(path.join(root, "app/corpus/index.json"), "utf8"));
const contacts = JSON.parse(readFileSync(path.join(root, "app/contacts.json"), "utf8"));

const built = buildIndex(index.chunks);
let pass = 0;
let fail = 0;

function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log(`\ncorpus: ${index.chunkCount} chunks from ${index.documents.length} document(s), ${built.size} indexed\n`);

// ---------------------------------------------------------------- retrieval
console.log("retrieval");
const retrievalCases = [
  { query: "how do I dispose of spent chemicals", expect: /spent|collect|ecospace/i },
  { query: "where do I put an empty chemical container", expect: /container|pails?|label|packag/i },
  { query: "segregation of acid and alkali waste", expect: /segregat|acid|alkali/i },
  { query: "who collects chemical waste", expect: /collect|safety office|ecospace/i },
];

for (const testCase of retrievalCases) {
  const { hits, coverage } = search(built, testCase.query, { limit: 5 });
  const top = hits[0];
  const ok = Boolean(top) && testCase.expect.test(`${top.clause} ${top.section} ${top.text}`);
  check(
    `"${testCase.query}" -> §${top ? top.clause : "-"} p.${top ? top.page : "-"} (cov ${(coverage * 100).toFixed(0)}%)`,
    ok
  );
}

// ------------------------------------------------------------- safety gates
console.log("\nsafety gates (must be deterministic)");
const emergencyQueries = [
  "A chemical bottle is leaking in my lab",
  "my lithium battery is swollen and smoking",
  "I spilled acid on my hand",
  "there are fumes coming from the waste cabinet",
];
for (const query of emergencyQueries) {
  check(`emergency: "${query}"`, detectEmergency(query) === true);
}
const notEmergency = [
  "where do I dispose of an intact lithium battery",
  "how should I label a chemical waste container",
];
for (const query of notEmergency) {
  check(`not emergency: "${query}"`, detectEmergency(query) === false);
}

console.log("\nout-of-scope");
for (const query of [
  "what are the city rules for recycling a television at home",
  "can you approve my disposal method for solvents",
]) {
  check(`refuses: "${query}"`, detectOutOfScope(query) === true);
}
check(
  'does not over-refuse: "how do I label chemical waste"',
  detectOutOfScope("how do I label chemical waste") === false
);

// ------------------------------------------------------- citation validation
console.log("\ncitation validation");
const { hits } = search(built, "chemical waste container labelling", { limit: 4 });
const fabricated = validateAnswer(
  {
    status: "answered",
    summary: "Test.",
    steps: [
      { action: "Real step.", citations: ["C1"] },
      { action: "Invented step.", citations: ["C9", "C42"] },
    ],
    collectionPoint: { text: "Somewhere.", citations: ["C2"] },
    currency: "Unknown.",
  },
  hits,
  index.documents
);
check("keeps a valid citation", fabricated.steps[0].citations.length === 1);
check("drops invented citation IDs", fabricated.steps[1].citations.length === 0);
check("counts dropped citations", fabricated.droppedCitations === 2);
check("resolves clause and page", fabricated.steps[0].citations[0]?.page > 0);

const uncited = validateAnswer(
  { status: "answered", summary: "x", steps: [{ action: "No citation here.", citations: [] }] },
  hits,
  index.documents
);
check("answer with zero valid citations degrades to not_found", uncited.status === "not_found");

// --------------------------------------------------------------- full pipeline
console.log("\nfull pipeline (model stubbed)");

const stubFetch = (content) => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  });
};

const config = { endpoint: "https://example.invalid/v1", apiKey: "test", model: "test-model", contacts };

const emergencyRun = await ask({
  ...config,
  query: "there is a chemical spill in the corridor",
  hits: [],
  coverage: 0,
  documents: index.documents,
});
check("emergency short-circuits before the model", emergencyRun.kind === "emergency");
check(
  "emergency answer carries the verified help desk number",
  emergencyRun.answer.contacts.some((contact) => contact.phone === "3917 2882")
);

const offScope = await ask({
  ...config,
  query: "what are the municipal rules for a TV at home",
  hits: [],
  coverage: 0,
  documents: index.documents,
});
check("out-of-scope short-circuits before the model", offScope.kind === "refused");

const weak = await ask({
  ...config,
  query: "quantum flux capacitor",
  hits: search(built, "quantum flux capacitor").hits,
  coverage: search(built, "quantum flux capacitor").coverage,
  documents: index.documents,
});
check(
  `weak match refuses (coverage ${(weak.answer ? 0 : 0) || ""}< ${MIN_COVERAGE})`,
  weak.kind === "refused"
);

stubFetch(
  JSON.stringify({
    status: "answered",
    summary: "Segregate by waste type and label each container.",
    steps: [{ action: "Segregate acids from alkalis.", citations: ["C1"] }],
    collectionPoint: null,
    currency: "Policy v3, issued Dec 2012, review date passed.",
  })
);
const good = search(built, "segregate chemical waste acid alkali", { limit: 4 });
const answered = await ask({
  ...config,
  query: "how do I segregate acid and alkali waste",
  hits: good.hits,
  coverage: good.coverage,
  documents: index.documents,
});
check("model answer is parsed and validated", answered.kind === "answered");
check("validated answer keeps its citation", answered.answer?.steps?.[0]?.citations?.length === 1);
check(
  "citation names the real document and clause",
  answered.answer?.steps?.[0]?.citations?.[0]?.docTitle?.includes("Chemical Waste")
);

stubFetch("not json at all");
let threw = false;
try {
  await ask({
    ...config,
    query: "how do I segregate acid and alkali waste",
    hits: good.hits,
    coverage: good.coverage,
    documents: index.documents,
  });
} catch (error) {
  threw = error.name === "ModelError";
}
check("unparseable model output raises ModelError", threw);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
