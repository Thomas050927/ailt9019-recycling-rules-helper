/**
 * The AI layer.
 *
 * Three decisions worth knowing about:
 *
 * 1. Safety and refusal are decided *before* the model is called. The two
 *    categories that must score 100% (emergency interception, out-of-scope
 *    rejection) are therefore deterministic and testable, not a coin flip.
 * 2. Citations are IDs pointing at retrieved chunks. The model can only pick
 *    from that list, and every ID it returns is checked against it. Fabricated
 *    clause/page numbers cannot survive the check.
 * 3. The answer is a JSON object, so the UI never parses prose.
 */

export const DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const TOKEN_PLAN_ENDPOINT =
  "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

/** Below this share of query terms matched, we refuse instead of asking the model. */
export const MIN_COVERAGE = 0.34;

/**
 * Emergency lexicon. Deliberately broad: a false positive costs a clarifying
 * sentence, a false negative can cost someone a burn.
 */
const EMERGENCY_PATTERNS = [
  /\b(spill|spilled|spilling|leak|leaking|leaked|leakage)\b/,
  /\b(fire|flame|flammable|ignit\w*|explod\w*|combust\w*)\b/,
  /\b(fumes?|vapou?rs?|smell|odor|odour|smoke|smoking|gas\s+release)\b/,
  /\b(expos\w*|inhale[sd]?|inhalation|breath\w*|burn(s|ed|ing)?|skin\s+contact|eye\s+contact)\b/,
  /\b(unconscious|collapse[sd]?|injur\w*|hurt|bleeding|poison\w*|toxic\s+cloud)\b/,
  /\b(damaged|swollen|cracked|punctured|ruptured|crushed)\b.*\b(battery|cell|pack)\b/,
  /\b(battery|cell|pack)\b.*\b(damaged|swollen|cracked|punctured|ruptured|crushed|hot|smoking)\b/,
  /\b(biohazard\w*|infectious|pathogen\w*|needle\s*stick|sharps?\s+injur\w*|blood\s+spill)\b/,
  /\b(emergency|urgent|immediately\s+danger|right\s+now|asap)\b.*\b(waste|chemical|battery|spill)\b/,
  /\b(waste|chemical|battery|spill)\b.*\b(emergency|urgent|immediately\s+danger)\b/,
];

/** Questions the corpus can never answer, whatever the retrieval says. */
const OUT_OF_SCOPE_PATTERNS = [
  /\b(city|municipal|government|public)\b.*\b(recycl\w*|waste|bin|collection)\b/,
  /\b(at\s+home|my\s+flat|my\s+apartment|domestic|household)\b.*\b(recycl\w*|dispose|throw)\b/,
  /\b(law|legal|regulation|ordinance|liab\w*|sue|fine|penalt\w*)\b.*\b(interpre\w*|advice|advise|opinion)\b/,
  /\b(approve|sign\s+off|authori[sz]e|permit)\b.*\b(my|this|the)\b.*\b(disposal|method|plan)\b/,
];

export function detectEmergency(query) {
  const text = String(query || "").toLowerCase();
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectOutOfScope(query) {
  const text = String(query || "").toLowerCase();
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
}

export function emergencyAnswer(contacts) {
  const lines = (contacts?.contacts || [])
    .map((contact) => `- ${contact.label}: ${contact.phone || contact.email || "see source"}`)
    .join("\n");
  return {
    status: "emergency",
    headline: "Stop. Do not handle or move it.",
    body:
      "This looks like an active hazard. Keep clear, do not try to clean it up or carry the container anywhere, " +
      "and contact the campus safety team now. This tool cannot send help and cannot tell you how to handle an active incident.",
    contacts: contacts?.contacts || [],
    note: contacts?.generalEmergency || "",
    sourceUrl: contacts?.source || "",
  };
}

export function refusalAnswer({ reason, terms = [] }) {
  return {
    status: "not_found",
    headline: "The campus documents don't answer this.",
    body:
      "I couldn't verify this procedure or collection point in the campus policy documents available to me. " +
      "I won't guess. Please confirm with campus EHS / the Safety Office.",
    reason,
    searched: terms.slice(0, 8),
  };
}

export function buildContext(hits, documents) {
  const byId = new Map((documents || []).map((doc) => [doc.id, doc]));

  // The model cannot judge whether a policy is current if it never sees the
  // version and dates, and the proposal requires the answer to state them.
  const usedDocs = [...new Set(hits.map((hit) => hit.doc))]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const header = usedDocs.length
    ? `Documents these passages come from:\n${usedDocs
        .map((doc) => {
          const parts = [doc.title || doc.id];
          if (doc.version) parts.push(`version ${doc.version}`);
          if (doc.issueDate) parts.push(`issued ${doc.issueDate}`);
          if (doc.reviewDate) parts.push(`review date ${doc.reviewDate}`);
          let line = `- ${parts.join(", ")}`;
          if (doc.staleWarning) line += `\n  Publisher note: ${doc.staleWarning}`;
          return line;
        })
        .join("\n")}\n\n`
    : "";

  return (
    header +
    hits
      .map((hit, index) => {
        const doc = byId.get(hit.doc) || {};
        const label = `C${index + 1}`;
        const title = doc.shortTitle || doc.title || hit.docShort || hit.doc;
        return [
          `[${label}] ${title} — § ${hit.clause} — PDF p.${hit.page}${hit.pageEnd !== hit.page ? `-${hit.pageEnd}` : ""}`,
          `Section: ${hit.section}`,
          `Text: ${hit.text}`,
        ].join("\n");
      })
      .join("\n\n")
  );
}

const SYSTEM_PROMPT = `You answer campus waste-disposal questions using ONLY the numbered context passages supplied by the user.

Hard rules:
- Never use outside knowledge. If the passages do not support a step, do not write the step.
- Never invent a clause number, page number, document title, collection point, phone number, or date.
- Every step must cite at least one context ID from the supplied list. Use only IDs that appear there.
- If the passages do not establish the answer, set status to "not_found". Do not guess, and do not fall back on municipal or general recycling rules.
- If the passages conflict, set status to "conflict", cite both, and explain the conflict instead of choosing one.
- Keep the summary in plain language. Quote at most one short phrase per step.
- The \`currency\` field must repeat the document version and its issue and review dates exactly as listed in the "Documents these passages come from" block. If a review date has passed, say the policy may be out of date. Never write that the date is unknown when the block gives one.

Reply with a single JSON object and nothing else:
{
  "status": "answered" | "not_found" | "conflict",
  "summary": "one or two plain sentences",
  "steps": [{ "action": "short imperative step", "citations": ["C1"] }],
  "collectionPoint": { "text": "exact location and access conditions", "citations": ["C2"] } | null,
  "currency": "one sentence on document version or date, or that it could not be verified",
  "reason": "required only when status is not answered"
}`;

export function buildMessages(query, context) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Question: ${query}\n\nContext passages:\n${context}\n\nReturn the JSON object.`,
    },
  ];
}

function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Drop citation IDs the model made up. This is the whole anti-hallucination
 * story: the model writes prose, but it cannot mint a citation.
 */
export function validateAnswer(answer, hits, documents) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const valid = new Set(hits.map((_hit, index) => `C${index + 1}`));

  const resolve = (ids) =>
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id).toUpperCase().replace(/[^C0-9]/g, ""))
      .filter((id) => valid.has(id))
      .map((id) => {
        const hit = hits[Number(id.slice(1)) - 1];
        const doc = byId.get(hit.doc) || {};
        return {
          id,
          clause: hit.clause,
          page: hit.page,
          pageEnd: hit.pageEnd,
          section: hit.section,
          docId: hit.doc,
          docTitle: doc.title || hit.docShort || hit.doc,
          docShort: doc.shortTitle || hit.docShort || hit.doc,
          sourceUrl: doc.sourceUrl || "",
          excerpt: hit.text.slice(0, 320),
        };
      });

  const steps = (Array.isArray(answer.steps) ? answer.steps : [])
    .map((step) => ({
      action: String(step.action || step.text || "").trim(),
      citations: resolve(step.citations),
    }))
    .filter((step) => step.action);

  const cited = steps.reduce((sum, step) => sum + step.citations.length, 0);

  return {
    status: answer.status === "answered" && cited === 0 ? "not_found" : answer.status || "not_found",
    summary: String(answer.summary || "").trim(),
    steps,
    collectionPoint: answer.collectionPoint
      ? {
          text: String(answer.collectionPoint.text || "").trim(),
          citations: resolve(answer.collectionPoint.citations),
        }
      : null,
    currency: String(answer.currency || "").trim(),
    reason: String(answer.reason || "").trim(),
    citationCount: cited,
    droppedCitations: (Array.isArray(answer.steps) ? answer.steps : []).reduce(
      (sum, step) => sum + (Array.isArray(step.citations) ? step.citations.length : 0),
      0
    ) - cited,
  };
}

export class ModelError extends Error {
  constructor(message, { status, kind } = {}) {
    super(message);
    this.name = "ModelError";
    this.status = status;
    this.kind = kind;
  }
}

/**
 * One OpenAI-compatible chat completion. Retries once without response_format
 * if the gateway or model rejects it.
 */
export async function callModel({ endpoint, apiKey, model, messages, signal, maxTokens = 900 }) {
  const url = `${String(endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "")}/chat/completions`;

  const send = async (body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error?.message || parsed.message || detail;
      } catch {
        /* keep the raw snippet */
      }
      throw new ModelError(detail, { status: response.status, kind: "http" });
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ModelError("The model returned something that was not JSON.", { kind: "parse" });
    }
    return payload?.choices?.[0]?.message?.content || "";
  };

  const base = { model, messages, temperature: 0.1, max_tokens: maxTokens };
  try {
    return await send({ ...base, response_format: { type: "json_object" } });
  } catch (error) {
    if (error instanceof ModelError && error.status >= 400 && error.status < 500 && error.status !== 401) {
      return await send(base);
    }
    throw error;
  }
}

/**
 * Full pipeline: gate -> refuse or retrieve -> ask -> validate.
 * Returns a discriminated object the UI can render without guessing.
 */
export async function ask({
  query,
  hits,
  coverage,
  documents,
  contacts,
  endpoint,
  apiKey,
  model,
  signal,
  terms = [],
}) {
  if (detectEmergency(query)) {
    return { kind: "emergency", answer: emergencyAnswer(contacts) };
  }
  if (detectOutOfScope(query)) {
    return {
      kind: "refused",
      answer: refusalAnswer({ reason: "This question is outside the campus policy corpus.", terms }),
    };
  }
  if (!hits.length || coverage < MIN_COVERAGE) {
    return {
      kind: "refused",
      answer: refusalAnswer({
        reason: `No strong match in the corpus (best coverage ${(coverage * 100).toFixed(0)}%).`,
        terms,
      }),
    };
  }

  const context = buildContext(hits, documents);
  const messages = buildMessages(query, context);
  const raw = await callModel({ endpoint, apiKey, model, messages, signal });
  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    throw new ModelError("Could not read the model's answer as JSON.", { kind: "parse" });
  }
  return { kind: "answered", answer: validateAnswer(parsed, hits, documents), raw };
}
