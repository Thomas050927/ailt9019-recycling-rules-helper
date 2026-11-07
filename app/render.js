/**
 * Renders an AI answer. Every string goes through textContent, never innerHTML,
 * because the content originates from model output.
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function citationChips(citations) {
  const wrap = el("span", "cite-chips");
  for (const citation of citations) {
    const chip = el("a", "cite-chip", `§ ${citation.clause} · p.${citation.page}`);
    chip.href = citation.sourceUrl || "#";
    chip.target = "_blank";
    chip.rel = "noopener noreferrer";
    chip.title = `${citation.docTitle}\n§ ${citation.clause}, PDF p.${citation.page}\n${citation.excerpt}`;
    wrap.append(chip);
  }
  return wrap;
}

function evidenceList(citations) {
  const list = el("ul", "evidence-list");
  const seen = new Set();
  for (const citation of citations) {
    const key = `${citation.docId}#${citation.clause}@${citation.page}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item = el("li", "evidence-item");
    const head = el("div", "evidence-head");
    head.append(
      el("span", "evidence-ref", `§ ${citation.clause} · PDF p.${citation.page}`),
      el("span", "evidence-doc", citation.docTitle)
    );
    item.append(head, el("p", "evidence-quote", citation.excerpt));
    if (citation.sourceUrl) {
      const link = el("a", "evidence-link", "Open official source ↗");
      link.href = citation.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    }
    list.append(item);
  }
  return list;
}

export function renderAnswer(container, result) {
  container.replaceChildren();
  if (!result) return;

  const { kind, answer } = result;
  const card = el("article", `answer-card answer-${kind}`);

  if (kind === "emergency") {
    card.append(el("div", "answer-flag", "SAFETY GATE"));
    card.append(el("h3", "answer-headline", answer.headline));
    card.append(el("p", "answer-body", answer.body));

    const contacts = el("ul", "contact-list");
    for (const contact of answer.contacts) {
      const item = el("li");
      item.append(el("span", "contact-label", contact.label));
      if (contact.phone) {
        const link = el("a", "contact-value", contact.phone);
        link.href = `tel:${contact.phone.replace(/\s+/g, "")}`;
        item.append(link);
      }
      if (contact.email) {
        const link = el("a", "contact-value", contact.email);
        link.href = `mailto:${contact.email}`;
        item.append(link);
      }
      contacts.append(item);
    }
    card.append(contacts);
    if (answer.note) card.append(el("p", "answer-note", answer.note));
    container.append(card);
    return;
  }

  if (kind === "refused") {
    card.append(el("div", "answer-flag", "NO SOURCE IN CORPUS"));
    card.append(el("h3", "answer-headline", answer.headline));
    card.append(el("p", "answer-body", answer.body));
    if (answer.reason) card.append(el("p", "answer-note", answer.reason));
    container.append(card);
    return;
  }

  // answered, or the model itself said not_found / conflict
  const status = answer.status || "not_found";
  if (status !== "answered") {
    card.append(el("div", "answer-flag", status === "conflict" ? "SOURCES CONFLICT" : "NOT IN CORPUS"));
    card.append(el("h3", "answer-headline", "The documents don't settle this."));
    card.append(el("p", "answer-body", answer.summary || answer.reason || "No supported answer was found."));
    if (answer.currency) card.append(el("p", "answer-note", answer.currency));
    container.append(card);
    return;
  }

  card.append(el("div", "answer-flag", "ANSWERED FROM POLICY"));
  if (answer.summary) card.append(el("p", "answer-summary", answer.summary));

  if (answer.steps.length) {
    const list = el("ol", "step-list");
    for (const step of answer.steps) {
      const item = el("li");
      item.append(el("span", "step-text", step.action));
      if (step.citations.length) item.append(citationChips(step.citations));
      list.append(item);
    }
    card.append(list);
  }

  if (answer.collectionPoint?.text) {
    const point = el("div", "collection-point");
    point.append(el("span", "collection-label", "Collection point"));
    point.append(el("span", "collection-text", answer.collectionPoint.text));
    if (answer.collectionPoint.citations.length) {
      point.append(citationChips(answer.collectionPoint.citations));
    }
    card.append(point);
  }

  if (answer.currency) {
    card.append(el("p", "answer-currency", answer.currency));
  }

  const citations = [
    ...answer.steps.flatMap((step) => step.citations),
    ...(answer.collectionPoint?.citations || []),
  ];
  if (citations.length) {
    const details = el("details", "evidence-block");
    details.append(el("summary", "", `Source passages (${citations.length})`));
    details.append(evidenceList(citations));
    card.append(details);
  }

  if (answer.droppedCitations > 0) {
    card.append(
      el(
        "p",
        "answer-warning",
        `${answer.droppedCitations} citation(s) from the model pointed at passages that were not retrieved and were discarded.`
      )
    );
  }

  container.append(card);
}

/**
 * Used when no model key is configured: show the clauses retrieval found instead
 * of a dead end. Nothing here is generated — every line comes from the index, so
 * the references are real and can be checked against the PDF.
 */
export function renderClauses(container, { hits, docs = [], query }) {
  container.replaceChildren();
  if (!hits || !hits.length) return;

  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const card = el("article", "answer-card answer-clauses");
  card.append(el("div", "answer-flag", "MATCHING POLICY CLAUSES"));
  card.append(el("h3", "answer-headline", "Clauses that mention this"));
  card.append(
    el(
      "p",
      "answer-body",
      "No model key is set on this copy, so this is not a written answer — it is the exact set of clauses the assistant would answer from. Every reference below is real."
    )
  );

  const list = el("ul", "evidence-list");
  for (const hit of hits.slice(0, 4)) {
    const doc = byId.get(hit.doc) || {};
    const item = el("li", "evidence-item");
    const head = el("div", "evidence-head");
    head.append(
      el("span", "evidence-ref", `§ ${hit.clause} · PDF p.${hit.page}`),
      el("span", "evidence-doc", doc.shortTitle || hit.docShort || hit.doc || "")
    );
    item.append(head);
    item.append(el("p", "evidence-quote", hit.text.length > 320 ? `${hit.text.slice(0, 320)}…` : hit.text));
    if (doc.sourceUrl) {
      const link = el("a", "evidence-link", "Open official source ↗");
      link.href = doc.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    }
    list.append(item);
  }
  card.append(list);

  const docsUsed = [...new Set(hits.slice(0, 4).map((hit) => byId.get(hit.doc)?.shortTitle || hit.doc))];
  const version = docsUsed.length === 1 ? byId.get(hits[0].doc) : null;
  if (version) {
    card.append(
      el(
        "p",
        "answer-currency",
        `${version.shortTitle}, version ${version.version}, issued ${version.issueDate}, review date ${version.reviewDate}.`
      )
    );
  }

  card.append(
    el(
      "p",
      "answer-note",
      "To turn these clauses into a written answer, add a model key in Model settings, or run start.py locally."
    )
  );
  container.append(card);
}
