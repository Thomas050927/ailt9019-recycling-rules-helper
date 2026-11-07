# Testing the AI tool on your own laptop

For Group 60. About two minutes. No terminal needed, no `pip install`.
You only need Python.

---

## Step 1 — Download the code

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
