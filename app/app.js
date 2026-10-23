const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
const statusEl = document.querySelector("#document-status");
const searchStatus = document.querySelector("#search-status");
const fileInput = document.querySelector("#pdf-input");
const dropZone = document.querySelector("#drop-zone");
const docList = document.querySelector("#document-list");
const resultsEl = document.querySelector("#results");
const searchForm = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const installButton = document.querySelector("#install-button");
let pdfjs;
let documents = [];
let hkuSources = [];
let deferredInstallPrompt = null;

try {
  pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
} catch (error) {
  statusEl.textContent = "PDF reader could not load. Check your internet connection and reload this page.";
  statusEl.classList.add("error");
}
try {
  const response = await fetch("./hku-sources.json", {cache:"no-cache"});
  if (!response.ok) throw new Error("Source catalogue could not be loaded.");
  const catalogue = await response.json();
  hkuSources = Array.isArray(catalogue.sources) ? catalogue.sources : [];
  searchStatus.textContent = "HKU official-source catalogue loaded (" + hkuSources.length + " sources). Add PDFs for exact page-level text matches.";
} catch (error) {
  searchStatus.textContent = "HKU source catalogue could not load. You can still search PDFs you add.";
}
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function makeSnippet(text, terms) {
  const lower = text.toLowerCase();
  const positions = terms.map(term => lower.indexOf(term)).filter(pos => pos >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 100);
  const end = Math.min(text.length, start + 420);
  return (start ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}
function renderDocuments() {
  docList.replaceChildren();
  for (const doc of documents) {
    const li = document.createElement("li");
    li.innerHTML = '<span>' + safeText(doc.name) + '</span><span class="document-meta">' + doc.pages.length + ' pages · ' + formatBytes(doc.size) + '</span>';
    docList.append(li);
  }
}
async function indexFile(file) {
  if (!pdfjs) throw new Error("PDF reader is unavailable. Reload the page and try again.");
  if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) throw new Error(file.name + " is not a PDF.");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({data}).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    pages.push({pageNo, text});
  }
  return {name:file.name, size:file.size, pages, indexedAt:new Date().toISOString()};
}
fileInput.addEventListener("change", async () => {
  await loadFiles([...fileInput.files]);
  fileInput.value = "";
});
async function loadFiles(files) {
  if (!files.length) return;
  statusEl.classList.remove("error");
  for (const file of files) {
    statusEl.textContent = "Reading " + file.name + "…";
    try {
      const doc = await indexFile(file);
      const oldIndex = documents.findIndex(item => item.name === doc.name);
      if (oldIndex >= 0) documents.splice(oldIndex, 1);
      documents.push(doc);
    } catch (error) {
      statusEl.textContent = error.message || ("Could not read " + file.name);
      statusEl.classList.add("error");
    }
  }
  renderDocuments();
  if (documents.length) {
    statusEl.textContent = documents.length + " document(s) indexed in this browser.";
    searchStatus.textContent = "Search checks the loaded PDF text and the HKU official-source catalogue. PDF results cite the exact page; catalogue results link to the official source.";
    searchStatus.classList.remove("error");
  }
}
dropZone.addEventListener("dragover", event => {event.preventDefault();dropZone.classList.add("dragging");});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", async event => {
  event.preventDefault();dropZone.classList.remove("dragging");
  await loadFiles([...event.dataTransfer.files]);
});
function findOfficialSources(terms) {
  return hkuSources.map(source => {
    const searchable = [source.title, source.type, source.summary, ...(source.keywords || [])].join(" ").toLowerCase();
    const count = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
    return {...source, score:count};
  }).filter(source => source.score > 0).sort((a,b) => b.score - a.score);
}
function renderOfficialSource(source) {
  const article = document.createElement("article");
  article.className = "result-card official-source";
  const label = document.createElement("div");
  label.className = "source-label";
  label.textContent = "HKU OFFICIAL SOURCE · " + source.type;
  const title = document.createElement("h3");
  title.className = "result-title";
  title.textContent = source.title;
  const summary = document.createElement("p");
  summary.className = "result-snippet";
  summary.textContent = source.summary;
  const citation = document.createElement("div");
  citation.className = "citation";
  const cite = document.createElement("span");
  cite.textContent = "Reference: " + source.citation;
  const link = document.createElement("a");
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open official source ↗";
  citation.append(cite, link);
  article.append(label, title, summary, citation);
  if (source.issueDate || source.reviewDate) {
    const date = document.createElement("p");
    date.className = "source-warning";
    date.textContent = "Document dates: issue " + (source.issueDate || "not listed") + "; review " + (source.reviewDate || "not listed") + ". Verify current status before relying on it.";
    article.append(date);
  }
  if (source.warning) {
    const warning = document.createElement("p");
    warning.className = "source-warning";
    warning.textContent = source.warning;
    article.append(warning);
  }
  return article;
}
function renderPdfMatch(match) {
  const article = document.createElement("article");
  article.className = "result-card";
  const title = document.createElement("h3");
  title.className = "result-title";
  title.textContent = match.doc.name;
  const snippet = document.createElement("p");
  snippet.className = "result-snippet";
  snippet.textContent = match.snippet || "This page matched the query but no selectable text could be extracted.";
  const citation = document.createElement("div");
  citation.className = "citation";
  const source = document.createElement("span");
  source.textContent = "Uploaded PDF: " + match.doc.name + " · PDF page " + match.page.pageNo;
  const relevance = document.createElement("span");
  relevance.textContent = match.count + " keyword match(es)";
  citation.append(source, relevance);
  article.append(title, snippet, citation);
  return article;
}
function runSearch(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  resultsEl.replaceChildren();
  if (!query) return;
  const terms = [...new Set(query.split(/\s+/).filter(term => term.length > 1))];
  const matches = [];
  for (const doc of documents) {
    for (const page of doc.pages) {
      const lower = page.text.toLowerCase();
      const count = terms.reduce((total, term) => total + (lower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 0);
      if (count > 0) matches.push({doc, page, count, snippet:makeSnippet(page.text, terms)});
    }
  }
  matches.sort((a,b) => b.count - a.count);
  const shown = matches.slice(0, 30);
  const official = findOfficialSources(terms).slice(0, 15);
  const heading = document.createElement("h3");
  heading.className = "results-heading";
  heading.textContent = "Official HKU sources (" + official.length + ")";
  resultsEl.append(heading);
  if (official.length) official.forEach(source => resultsEl.append(renderOfficialSource(source)));
  else {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "No matching source in the starter catalogue. Try another keyword or check the HKU Safety Office website directly.";
    resultsEl.append(none);
  }
  const pdfHeading = document.createElement("h3");
  pdfHeading.className = "results-heading";
  pdfHeading.textContent = "Matches in your uploaded PDFs (" + matches.length + ")";
  resultsEl.append(pdfHeading);
  if (shown.length) shown.forEach(match => resultsEl.append(renderPdfMatch(match)));
  else {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = documents.length ? "No matching selectable text found in loaded PDFs." : "For exact page-level text citations, add current official HKU PDFs above. The source catalogue links to official pages but does not replace the documents.";
    resultsEl.append(none);
  }
  searchStatus.textContent = "Matched " + official.length + " official catalogue source(s) and " + matches.length + " uploaded PDF page(s). Catalogue summaries are navigation aids; verify instructions in the full official source.";
}
searchForm.addEventListener("submit", event => {
  event.preventDefault();
  runSearch(queryInput.value);
});
document.querySelectorAll("[data-query]").forEach(button => button.addEventListener("click", () => {
  queryInput.value = button.dataset.query;
  runSearch(queryInput.value);
  queryInput.focus();
}));
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();deferredInstallPrompt = event;installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;installButton.hidden = true;
});
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker registration failed:", error)));
}