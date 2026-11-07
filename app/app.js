import { buildIndex, search } from "./retrieve.js";
import { ask, detectEmergency, detectOutOfScope, MIN_COVERAGE } from "./ai.js";
import { renderAnswer } from "./render.js";

/**
 * One question in, one cited answer out.
 *
 * There is deliberately a single entry point. An earlier version also had a
 * keyword search box pointed at raw PDF text; it bypassed the safety and
 * refusal gates, so a hazardous question typed there produced cheerful
 * disposal matches. Two doors meant two sets of rules, and only one of them
 * was safe. Document upload now feeds the same index the Ask panel reads.
 */

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const statusEl = document.querySelector("#document-status");
const fileInput = document.querySelector("#pdf-input");
const dropZone = document.querySelector("#drop-zone");
const docList = document.querySelector("#document-list");
const officialLinks = document.querySelector("#official-links");
const installButton = document.querySelector("#install-button");

let pdfjs;
let deferredInstallPrompt = null;

/* ---------------- searchable corpus ---------------- */

let corpusDocuments = [];
let corpusChunks = [];
const uploads = []; // { document, chunks }
let searchIndex = buildIndex([]);

function allDocuments() {
  return corpusDocuments.concat(uploads.map((upload) => upload.document));
}

function allChunks() {
  return corpusChunks.concat(...uploads.map((upload) => upload.chunks));
}

function rebuildIndex() {
  searchIndex = buildIndex(allChunks());
}

/* ---------------- document handling ---------------- */

try {
  pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
} catch {
  pdfjs = null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDocuments() {
  docList.replaceChildren();
  const rows = [
    ...corpusDocuments.map((doc) => ({
      name: doc.shortTitle || doc.title || doc.id,
      meta: `${doc.chunkCount || 0} clauses indexed${doc.sourceUrl ? "" : " · local"}`,
      url: doc.sourceUrl || "",
    })),
    ...uploads.map((upload) => ({
      name: upload.document.shortTitle,
      meta: `${upload.chunks.length} pages added this session`,
      url: "",
    })),
  ];

  for (const row of rows) {
    const li = document.createElement("li");
    const name = document.createElement(row.url ? "a" : "span");
    name.textContent = row.name;
    if (row.url) {
      name.href = row.url;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
    }
    const meta = document.createElement("span");
    meta.className = "document-meta";
    meta.textContent = row.meta;
    li.append(name, meta);
    docList.append(li);
  }
}

async function readPdf(file) {
  if (!pdfjs) throw new Error("PDF reader is unavailable. Reload the page and try again.");
  if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
    throw new Error(`${file.name} is not a PDF.`);
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 40) pages.push({ pageNo, text });
  }
  return { name: file.name, size: file.size, pages };
}

/** Pages become citable passages, so an uploaded PDF is quotable by the same
 *  code path as the built-in corpus. Page numbers are the only structure a
 *  blank PDF gives us, so the section path stops at the page. */
function toUpload(parsed) {
  const docId = `upload:${parsed.name}`;
  return {
    document: {
      id: docId,
      title: parsed.name,
      shortTitle: parsed.name,
      sourceUrl: "",
      pages: parsed.pages.length,
      chunkCount: parsed.pages.length,
    },
    chunks: parsed.pages.map((page) => ({
      id: `${docId}#p${page.pageNo}`,
      doc: docId,
      docShort: parsed.name,
      clause: `p.${page.pageNo}`,
      title: parsed.name,
      section: `${parsed.name} > page ${page.pageNo}`,
      page: page.pageNo,
      pageEnd: page.pageNo,
      text: page.text.slice(0, 1400),
    })),
  };
}

async function loadFiles(files) {
  if (!files.length) return;
  statusEl.classList.remove("error");

  for (const file of files) {
    statusEl.textContent = `Reading ${file.name}…`;
    try {
      const parsed = await readPdf(file);
      const upload = toUpload(parsed);
      const existing = uploads.findIndex((item) => item.document.id === upload.document.id);
      if (existing >= 0) uploads.splice(existing, 1);
      uploads.push(upload);
    } catch (error) {
      statusEl.textContent = error.message || `Could not read ${file.name}`;
      statusEl.classList.add("error");
    }
  }

  rebuildIndex();
  renderDocuments();

  if (uploads.length) {
    statusEl.textContent = `${uploads.length} PDF(s) added — ${allChunks().length} searchable passages in total.`;
    statusEl.classList.remove("error");
  }
}

fileInput.addEventListener("change", async () => {
  await loadFiles([...fileInput.files]);
  fileInput.value = "";
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  await loadFiles([...event.dataTransfer.files]);
});

/* ---------------- official reference links ---------------- */

async function loadOfficialLinks() {
  if (!officialLinks) return;
  try {
    const response = await fetch("./hku-sources.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("catalogue unavailable");
    const catalogue = await response.json();
    const sources = Array.isArray(catalogue.sources) ? catalogue.sources : [];
    officialLinks.replaceChildren();
    for (const source of sources) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title;
      const meta = document.createElement("span");
      meta.className = "document-meta";
      meta.textContent = source.type || "Web page";
      li.append(link, meta);
      officialLinks.append(li);
    }
  } catch {
    officialLinks.replaceChildren();
  }
}

/* ---------------- install prompt ---------------- */

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed:", error))
  );
}

/* ------------------------------------------------------------------ *
 * Answer pipeline: corpus index, model settings, answers
 * ------------------------------------------------------------------ */

const askForm = document.querySelector("#ask-form");
const askInput = document.querySelector("#ask-query");
const askButton = document.querySelector("#ask-button");
const askStatus = document.querySelector("#ask-status");
const answerEl = document.querySelector("#answer");
const endpointEl = document.querySelector("#endpoint");
const endpointCustomEl = document.querySelector("#endpoint-custom");
const endpointCustomField = document.querySelector("#custom-endpoint-field");
const modelEl = document.querySelector("#model");
const apiKeyEl = document.querySelector("#api-key");
const configState = document.querySelector("#config-state");
const endpointNote = document.querySelector("#endpoint-note");
const modelConfig = document.querySelector("#model-config");

const CONFIG_KEY = "crh:model-config";

// Paste the deployed relay URL here (ending in /v1) once relay/worker.js is up.
// Everyone who opens the hosted page then starts with a working endpoint and
// only has to paste a key. Leave empty while no relay exists.
const DEFAULT_RELAY = "";

let contacts = null;
let inFlight = null;

const ENDPOINT_NOTES = {
  "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1":
    "The key is valid here, but this host answers no CORS preflight, so a browser call is blocked. Use a relay URL or the local proxy.",
  "http://127.0.0.1:8787/v1":
    "Started by start.py. The proxy holds the key from .env, so nothing needs typing in this tab.",
  "https://dashscope.aliyuncs.com/compatible-mode/v1":
    "Accepts browser calls, but tested against the AILT9019 course key it returns invalid_api_key. Only use this with a real DashScope key.",
  __custom:
    "Your own relay (relay/worker.js on Cloudflare). It adds the CORS headers the Token Plan host omits and forwards your key without storing it.",
};

/** The local proxy injects the key server-side, so this tab needs none. */
function isLocalProxy(endpoint) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(endpoint || ""));
}

function resolveEndpoint() {
  const chosen = endpointEl.value || "";
  if (chosen !== "__custom") return chosen;
  return (endpointCustomEl?.value || "").trim();
}

function syncCustomField() {
  if (endpointCustomField) endpointCustomField.hidden = endpointEl.value !== "__custom";
  endpointNote.textContent = ENDPOINT_NOTES[endpointEl.value] || "";
}

function readConfig() {
  return {
    endpoint: resolveEndpoint(),
    model: modelEl.value.trim() || "qwen3.8-flash",
    apiKey: apiKeyEl.value.trim(),
  };
}

function persistConfig() {
  try {
    sessionStorage.setItem(CONFIG_KEY, JSON.stringify(readConfig()));
  } catch {
    /* private mode: the key simply is not remembered */
  }
  const { apiKey, model, endpoint } = readConfig();
  const viaProxy = isLocalProxy(endpoint);
  configState.textContent = apiKey ? `ready · ${model}` : viaProxy ? `proxy · ${model}` : "no key";
  configState.classList.toggle("config-ready", Boolean(apiKey) || viaProxy);
}

function restoreConfig() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CONFIG_KEY) || "{}");
    if (saved.endpoint) {
      const known = [...endpointEl.options].some((option) => option.value === saved.endpoint);
      if (known) {
        endpointEl.value = saved.endpoint;
      } else {
        endpointEl.value = "__custom";
        if (endpointCustomEl) endpointCustomEl.value = saved.endpoint;
      }
    } else if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      // Served by start.py, so the proxy is already there.
      endpointEl.value = "http://127.0.0.1:8787/v1";
    } else if (DEFAULT_RELAY) {
      endpointEl.value = "__custom";
      if (endpointCustomEl) endpointCustomEl.value = DEFAULT_RELAY;
    }
    if (saved.model) modelEl.value = saved.model;
    if (saved.apiKey) apiKeyEl.value = saved.apiKey;
  } catch {
    /* ignore a corrupt entry */
  }
  syncCustomField();
  persistConfig();
}

async function loadCorpus() {
  try {
    const response = await fetch("./corpus/index.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("corpus index not found");
    const corpus = await response.json();
    corpusDocuments = corpus.documents || [];
    corpusChunks = corpus.chunks || [];
    rebuildIndex();
    renderDocuments();
    statusEl.textContent = `${corpusDocuments.length} policy document(s), ${corpusChunks.length} clauses indexed · built ${corpus.corpusVersion || "unknown"}.`;
    askStatus.textContent = `${searchIndex.size} clauses loaded.`;
    if (!apiKeyEl.value.trim() && !isLocalProxy(resolveEndpoint())) {
      askStatus.textContent += " Add an API key in Model settings to get answers.";
    }
  } catch {
    statusEl.textContent = "Corpus index could not load. You can still drop a PDF below.";
    askStatus.textContent = "Corpus index could not load, so answers are unavailable.";
    askStatus.classList.add("error");
  }
}

async function loadContacts() {
  try {
    const response = await fetch("./contacts.json", { cache: "no-cache" });
    if (response.ok) contacts = await response.json();
  } catch {
    contacts = null;
  }
}

function describeError(error) {
  if (error?.name === "AbortError") return null;
  if (error?.status === 401 || error?.status === 403) {
    return "The API key was rejected. Check the key and the endpoint match (Token Plan keys need the Token Plan endpoint).";
  }
  if (error?.name === "ModelError") return `Model error: ${error.message}`;
  if (error instanceof TypeError) {
    return "The request never reached the model. This is usually CORS: that endpoint does not allow browser calls, so run python tools/proxy.py and pick the local proxy endpoint.";
  }
  return error?.message || "Something went wrong while asking the model.";
}

async function submitQuestion(query) {
  if (!query) return;
  answerEl.replaceChildren();
  askStatus.classList.remove("error");
  if (!contacts) await loadContacts();

  const { hits, coverage, terms } = search(searchIndex, query, { limit: 6 });
  const config = readConfig();
  const emergency = detectEmergency(query);
  const refusedEarly = detectOutOfScope(query) || !hits.length || coverage < MIN_COVERAGE;

  const needsKey = !config.apiKey && !isLocalProxy(config.endpoint);
  if (!emergency && !refusedEarly && needsKey) {
    askStatus.textContent = "This question needs the model. Paste the API key in Model settings, or run start.py to use the local proxy.";
    askStatus.classList.add("error");
    if (modelConfig) modelConfig.open = true;
    return;
  }

  inFlight?.abort();
  inFlight = new AbortController();
  askButton.disabled = true;
  askStatus.textContent = "Working through the policy clauses…";

  try {
    const result = await ask({
      query,
      hits,
      coverage,
      documents: allDocuments(),
      contacts,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      model: config.model,
      signal: inFlight.signal,
      terms,
    });
    renderAnswer(answerEl, result);
    askStatus.textContent =
      result.kind === "answered"
        ? `Answered from ${result.answer.citationCount} cited clause(s).`
        : result.kind === "emergency"
          ? "Safety gate triggered — no disposal steps were generated."
          : "Refused: the corpus does not support an answer.";
  } catch (error) {
    const message = describeError(error);
    if (message) {
      askStatus.textContent = message;
      askStatus.classList.add("error");
    }
  } finally {
    askButton.disabled = false;
    inFlight = null;
  }
}

askForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion(askInput.value.trim());
});

document.querySelectorAll("[data-ask]").forEach((button) =>
  button.addEventListener("click", () => {
    askInput.value = button.dataset.ask;
    submitQuestion(askInput.value);
  })
);

[endpointEl, modelEl, apiKeyEl].forEach((input) => {
  input.addEventListener("change", () => {
    syncCustomField();
    persistConfig();
  });
});

if (endpointCustomEl) {
  endpointCustomEl.addEventListener("input", () => {
    syncCustomField();
    persistConfig();
  });
}

restoreConfig();
await loadContacts();
await loadCorpus();
await loadOfficialLinks();

// Deep link a question: /?q=lithium%20battery — used by the evaluation cases
// so each test can be opened and screenshotted directly.
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
  askInput.value = initialQuery;
  submitQuestion(initialQuery);
}
