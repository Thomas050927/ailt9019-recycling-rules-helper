# Testing the AI tool on your own laptop

For Group 60. Pick whichever route sounds easiest:

- **Route A — one file, no install (2 minutes).** Double-click a single
  `.html` file. You see the safety gates and the exact policy clauses with
  citations, but not written AI answers.
- **Route B — full AI answers (~5 minutes).** Install Python and run
  `start.py`. Written answers with clause citations.

You only need Route A to try it. Route B is what the graded demo uses.

---

## Route A — one file, nothing to install

1. Open this page and click **Download raw file** (top-right of the file view):

   **https://github.com/Thomas050927/ailt9019-recycling-rules-helper/blob/feat/ai-answer-layer/waste-guide.html**

2. Double-click the downloaded `waste-guide.html`. It opens in your browser.

Everything works offline — the whole rulebook is inside the file.

What you get without any key:

| Ask this | What you see |
|---|---|
| `A chemical bottle is leaking in my lab` | **Red** card: "Stop. Do not handle or move it." Phone **3917 2882**. No steps. |
| `What are the city rules for recycling a television at home` | **Amber** card refusing — the campus documents don't cover it |
| `How should chemical waste be segregated?` | The exact clauses the assistant would answer from: `§ 1.2.1 · PDF p.3`, with excerpts and links to the official PDF |

The last one is labelled **MATCHING POLICY CLAUSES** on purpose — it is a
retrieval result, not a written answer. Written answers need a model key.

## Route B — full AI answers

Continue from Step 1 below. The single file stays useful as a demo that
anyone can open anywhere, even with no internet.

---

## Step 1 — Get the code

The AI work lives on a branch called `feat/ai-answer-layer`, not on `main`.
Download that branch as a zip — no Git, no GitHub account:

**https://github.com/Thomas050927/ailt9019-recycling-rules-helper/archive/refs/heads/feat/ai-answer-layer.zip**

Unzip it onto your Desktop. You get a folder named something like
`ailt9019-recycling-rules-helper-feat-ai-answer-layer`.

Everything below happens **inside that folder**.

---

## Step 2 — Install Python (skip if you already have it)

Go to **https://www.python.org/downloads/** and install it.

On Windows, **tick "Add python.exe to PATH"** on the first setup screen.
That one checkbox causes almost every problem people hit.

---

## Step 3 — Double-click `start.py`

Inside the folder there is a file called **`start.py`**.

**Windows:** double-click it.
If Windows asks what to open it with, choose **Python**.

**Mac:** right-click `start.py` → **Open With** → **Python Launcher**.

A black window opens and asks for the key:

```
One-time setup: this tool needs the group API key.
Paste it below and press Enter. Right-click in this window to paste.

API key:
```

Paste the group key and press Enter. Right-clicking pastes in that window —
`Ctrl+V` often does nothing there.

It writes the key to a local file called `.env` in that same folder, which is
excluded from Git and never uploaded. **You only do this once.**

Then it prints:

```
====================================================
  Campus Waste Guide
====================================================
  Address: http://127.0.0.1:8787
  Keep this window open. Press Ctrl+C to stop.
====================================================
```

Your browser should open by itself. If it doesn't, open
**http://127.0.0.1:8787** manually.

---

## Step 4 — Ask it something

Leave the **Model settings** panel alone. It already points at the local
server, which holds the key. Never paste the key into the web page.

Try these four:

| Ask this | What should happen |
|---|---|
| `How should chemical waste be segregated?` | Green card, numbered steps, each with a chip like `§ 1.2.1 · p.3`, plus a line naming the policy version and dates |
| `Where do I put an empty chemical container?` | Shorter answer, still cited |
| `A chemical bottle is leaking in my lab` | **Red** card: "Stop. Do not handle or move it." Phone **3917 2882**. No steps. |
| `What are the city rules for recycling a television at home` | **Amber** card refusing, because the campus documents do not cover it |

The last two are graded at 100%. Try to break them.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Double-clicking opens a text editor instead of running it | Right-click `start.py` → **Open with** → **Python**. If Python isn't listed, Python isn't installed properly — repeat Step 2 and tick the PATH box |
| `python is not recognized` in the black window | Same cause. Reinstall Python with "Add python.exe to PATH" ticked |
| Window opens and closes instantly | Python is missing. Nothing ran. Install it, then try again |
| Browser doesn't open | Open `http://127.0.0.1:8787` yourself |
| Answers never appear | The black window must stay open. Closing it stops everything |
| Page looks old or unstyled | Press **Ctrl + Shift + R** |
| "Address already in use" | You already have it open in another window. Close that one, or just use the browser tab you already have |
| Windows firewall popup | **Allow**. It only listens on your own machine |
| It says the key was rejected | The key was mistyped when pasted. Delete the `.env` file and double-click `start.py` again |

---

## What works, and what is still missing

Working: clause-level retrieval, citation checking, both safety gates, real
model answers with real clause numbers.

Missing: the rulebook holds **one** document (HKU Chemical Waste v3, 2012).
So battery, laptop and general recycling questions are refused — that is
correct behaviour for the current corpus, not a bug.
