/**
 * Lexical retrieval over the clause index.
 *
 * No embeddings on purpose: the corpus is small (tens of documents), the
 * queries are short, and BM25 keeps the whole thing offline, instant, free,
 * and debuggable. Swapping in vectors later only means replacing `search()`.
 */

const STOPWORDS = new Set(
  `a an the of to for in on at by with and or is are was were be been being as from that this
   these those it its if not no do does did how what where which when who whom whose should can
   could may might must shall will would i my me we our you your they their there here any some
   about into over under than then so such only also more most other same very just`
    .split(/\s+/)
    .filter(Boolean)
);

const SYNONYMS = {
  battery: ["batteries", "cell", "lithium", "li-ion", "rechargeable"],
  batteries: ["battery", "cell", "lithium", "li-ion"],
  ewaste: ["electronic", "electronics", "equipment", "computer", "appliance"],
  "e-waste": ["electronic", "electronics", "equipment", "computer"],
  bin: ["container", "receptacle", "collection"],
  throw: ["dispose", "disposal", "discard"],
  rubbish: ["waste", "refuse"],
  trash: ["waste", "refuse"],
  garbage: ["waste", "refuse"],
  empty: ["emptied", "rinsed", "residue"],
  leak: ["leaking", "leakage", "spill"],
  broken: ["damaged", "cracked", "defective"],
  label: ["labelling", "labeling", "labelled", "labeled"],
};

export function stem(token) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(?:ss|sh|ch|x)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text) {
  const raw = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9/.-]*/g);
  if (!raw) return [];
  return raw.map(stem).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Query tokens plus known domain synonyms, so "battery" reaches "lithium-ion". */
export function expandQuery(query) {
  const base = tokenize(query);
  const expanded = new Set(base);
  for (const token of base) {
    for (const synonym of SYNONYMS[token] || []) expanded.add(stem(synonym));
  }
  return [...expanded];
}

export function buildIndex(chunks) {
  const docs = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.clause} ${chunk.section} ${chunk.text}`);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    return { chunk, tf, length: tokens.length };
  });

  const df = new Map();
  for (const doc of docs) {
    for (const token of doc.tf.keys()) df.set(token, (df.get(token) || 0) + 1);
  }
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1);
  return { docs, df, avgLength, size: docs.length };
}

const K1 = 1.2;
const B = 0.75;

/**
 * Rank chunks against a query. Returns at most `limit` hits with a score and
 * the fraction of query terms that were matched at all (`coverage`), which is
 * what the refusal gate keys on.
 */
export function search(index, query, { limit = 6, minCoverage = 0 } = {}) {
  if (!index || !index.size) return { hits: [], coverage: 0 };

  // Synonyms widen the match for scoring, but coverage is measured on the
  // words the user actually typed. Otherwise a synonym-heavy expansion makes
  // every real question look like a weak match.
  const base = tokenize(query);
  const terms = expandQuery(query);
  if (!terms.length) return { hits: [], coverage: 0 };

  const hits = [];
  for (const doc of index.docs) {
    let score = 0;
    const matched = [];
    const matchedBase = [];
    for (const term of terms) {
      const tf = doc.tf.get(term);
      if (!tf) continue;
      matched.push(term);
      if (base.includes(term)) matchedBase.push(term);
      const df = index.df.get(term) || 1;
      const idf = Math.log(1 + (index.size - df + 0.5) / (df + 0.5));
      const norm = 1 - B + (B * doc.length) / index.avgLength;
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
    }
    if (!score) continue;
    // A term in the clause heading is a much stronger signal than in the body.
    const heading = tokenize(`${doc.chunk.clause} ${doc.chunk.section}`);
    const headingHit = matched.filter((term) => heading.includes(term)).length;
    score *= 1 + 0.35 * (headingHit / matched.length);
    hits.push({
      ...doc.chunk,
      score,
      matched,
      matchedCount: matched.length,
      coverage: base.length ? matchedBase.length / base.length : 0,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const coverage = hits.length ? hits[0].coverage : 0;
  return { hits: hits.slice(0, limit), coverage, terms, base };
}
