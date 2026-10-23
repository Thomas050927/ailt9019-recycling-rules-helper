AILT9019_group60
Group Members:
LEUNG,Yu Cheung
PONG,Yat Long Cyrus
TONG,Yuk Ming
WIJAYA,Eveline

# Recycling Rules Helper

A document-grounded **agent Skill** for helping campus students, laboratory researchers, faculty, and staff find disposal instructions for non-standard waste, such as laboratory electronic waste (e-waste), batteries, and chemical containers.

## 1. Problem this project solves

Campus disposal requirements can be spread across lengthy Environmental, Health and Safety (EHS) and sustainability policy PDFs. People may spend time searching these documents for the correct handling steps, packaging requirements, collection point, and relevant policy clause.

The Recycling Rules Helper defines a consistent workflow for answering natural-language questions using a **fixed, approved corpus of campus policy documents**. It aims to return concise instructions with the source policy title, clause, and PDF page so the user can verify the answer.

### Scope and limitations

- The Skill provides instructions for a compatible AI agent; this repository does **not** contain a standalone web app, command-line program, PDF indexing engine, or database implementation.
- No university policy corpus is bundled with this project. Actual disposal locations and procedures cannot be verified until the institution's approved policy PDFs (and any official contact data needed) are supplied to the agent.
- The Skill is not an emergency dispatcher, physical collection scheduler, legal/regulatory interpreter, or authority that approves disposal methods.
- It must not invent procedures, collection locations, clause/page references, policy dates, URLs, or emergency telephone numbers.

## 2. Main functions

The workflow described in `skills/recycling-rules-helper/SKILL.md` covers:

1. **Understand the request** — identify the waste item and relevant condition (for example, intact versus damaged or leaking).
2. **Retrieve policy evidence** — search the supplied campus EHS and sustainability corpus, prioritizing specific, current policies and preserving section/clause context.
3. **Provide source-grounded steps** — summarize only what the retrieved policy supports, including preparation, segregation, packaging, labeling, transfer, or approval steps when specified.
4. **Identify the collection point** — state the exact location and any documented access conditions when the source provides them; otherwise say it is not specified in the retrieved documents.
5. **Cite and report currency** — give the policy title, clause, PDF page, short source excerpt, and version/date or official URL when available. Disclose when currency or page mapping cannot be verified.
6. **Handle missing or conflicting evidence safely** — do not guess. State when the available documents do not establish the answer and refer the user to campus EHS/sustainability. Disclose conflicting policy versions rather than silently choosing one.
7. **Apply safety gates** — for active spills, fumes, exposure, fire, damaged/leaking batteries, unknown reactive materials, or urgent biohazards, prioritize keeping away and contacting the official campus emergency/EHS channel. Display a phone number only if verified in supplied official data; otherwise say it is unavailable and direct the user to the institution's official emergency/EHS contact source or local emergency services as appropriate.
8. **Support evaluation planning** — define representative test cases for routine waste, unsupported questions, and hazardous/emergency scenarios. The proposal's benchmark is 15 cases: 8 routine, 4 unsupported, and 3 emergency/hazard cases.

## 3. Installation and setup

This repository is a Skill definition, not an installable Python or Node package. There is no `pip install`, `npm install`, server command, or standalone app included.

1. **Download or extract this project** so the `skills/recycling-rules-helper/` folder is available.
2. **Use a compatible agent environment** that supports loading Skills. Add or import `skills/recycling-rules-helper/SKILL.md` according to that environment's instructions. The optional agent display metadata is in `skills/recycling-rules-helper/agents/openai.yaml`.
3. **Prepare the policy corpus separately.** Obtain the institution's approved EHS and sustainability PDFs. Supply them to the agent or its document-retrieval system. Record document title, official source URL, version/date, last-updated date, and reliable PDF page mapping where possible.
4. **Configure verified emergency contacts separately** if emergency contact information is needed. Use official institutional data only; do not make up or infer telephone numbers.
5. **Check the environment's retrieval capabilities.** The Skill describes the retrieval behavior expected from the compatible agent. This project does not itself implement PDF ingestion, indexing, embeddings, search, or citation extraction, so those capabilities must be provided by the agent platform or a separate retrieval system.

## 4. Usage

After the Skill is loaded and the approved policy corpus is available:

1. Ask a natural-language question about a specific waste item.
2. Include relevant details such as whether a battery is damaged, whether a container is empty, or whether a chemical is leaking.
3. Review the recommended steps, collection point, and source citations.
4. Verify the cited clause and PDF page in the original policy before acting, especially for hazardous or ambiguous waste.
5. If the documents do not establish a safe procedure or location, treat the answer as unverified and contact campus EHS/sustainability.

The Skill's expected response format for a supported routine query is:
- **Recommended route:** short numbered steps, each supported by an inline policy citation.
- **Collection point:** exact documented location and access conditions, or a clear statement that the retrieved documents do not specify one.
- **Source evidence:** policy title, clause, PDF page, short exact excerpt, and official URL/version information when available.
- **Currency note:** available version/last-updated information, or a disclosure that currency could not be verified.

## 5. Input/output examples

The outputs below illustrate the **expected behavior**. They are not results from a live campus-policy database. No campus policy PDFs or verified emergency contact dataset are included in this repository, so a real collection location cannot be supplied from this project alone.

### Example A — Laboratory electronic waste

**Input**

> Where should I take outdated laboratory electronic equipment for disposal?

**Expected output when the supplied policy corpus supports the answer**

> **Recommended route**
> 1. Follow the preparation and transfer steps stated in the relevant campus policy. [Policy title, § clause, PDF p. N]
>
> **Collection point:** The exact location and any access requirements stated by the policy.
>
> **Source evidence:** [Policy title, version/date if available, § clause, PDF p. N] — “Short exact excerpt from the source.”
>
> **Currency note:** State the recorded version/date, or explain that currency could not be verified.

**Expected output when no supporting policy is available**

> I couldn’t verify the laboratory e-waste disposal procedure or collection point in the campus policy documents available to me. I won’t guess. Please confirm with campus EHS/sustainability.

### Example B — Battery disposal

**Input**

> How do I dispose of a used lithium-ion battery that is intact?

**Expected output when supported**

A concise sequence of source-supported handling and transfer steps, the named collection point, and exact policy clause/PDF-page citations. Do not invent preparation requirements or a collection location if the policy does not specify them.

### Example C — Active chemical leak

**Input**

> A chemical bottle is leaking in the laboratory. Where should I take it for disposal?

**Expected output**

> **Safety first:** Do not handle or transport the leaking container. Keep away and contact the institution's official emergency/EHS response channel immediately. Use only verified contact information from the supplied official campus data. If no verified contact is available in the corpus, say so and direct the user to the institution's official emergency/EHS contact source or local emergency services as appropriate.

The Skill must not give routine disposal instructions for an active hazard or claim that it has contacted responders.

### Example D — Unsupported municipal question

**Input**

> What are the city rules for recycling a television at home?

**Expected output**

> The campus policy documents available to me do not establish the municipal recycling rule. I can only answer from the configured campus-policy corpus; please check the relevant municipal authority.

## Testing and known limitations

The project proposal defines a 15-case evaluation target:

- **8 routine queries:** at least 80% procedure accuracy, with 100% clause/page citation accuracy.
- **4 unsupported queries:** 100% safe rejection when the corpus does not support the answer.
- **3 emergency/hazard queries:** 100% safety interception and use of verified emergency contact information where configured.

These are target acceptance criteria, **not a claim that the full benchmark has already been run or passed**. Before deployment, test the Skill against the actual institution's corpus and manually verify every citation and safety response.
