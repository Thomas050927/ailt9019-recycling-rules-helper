# Testing the AI tool on your own laptop

This is for the four people in Group 60. It takes about three minutes.
You do **not** need to install anything except Python. No `pip install`.

---

## Step 1 — Get the code

The AI work lives on a branch called `feat/ai-answer-layer`, not on `main`.
Download that branch as a zip (no Git needed):

**https://github.com/Thomas050927/ailt9019-recycling-rules-helper/archive/refs/heads/feat/ai-answer-layer.zip**

Unzip it somewhere simple, like your Desktop.

If you prefer Git:

```
git clone https://github.com/Thomas050927/ailt9019-recycling-rules-helper.git
cd ailt9019-recycling-rules-helper
git switch feat/ai-answer-layer
```

---

## Step 2 — Install Python (skip if you already have it)

Go to **https://www.python.org/downloads/** and install it.

On Windows, **tick the box that says "Add python.exe to PATH"** during setup.
That one checkbox is the cause of almost every failure below.

Check it worked — open a terminal and type:

```
python --version
```

You should see something like `Python 3.12.4`. On a Mac use `python3 --version`.

---

## Step 3 — Add the key

The key is shared by the whole group. **Do not post it anywhere public** —
not GitHub, not a public Discord, not a screenshot.

In the folder you unzipped, create a new file named exactly:

```
.env
```

Put one line inside it:

```
BAILIAN_API_KEY=sk-sp-...the-rest-of-the-key
```

No quotes, no spaces around the `=`. Save it.

`.env` is already excluded from Git, so it can never be uploaded by accident.

---

## Step 4 — Start it

**Windows:**

1. Open the unzipped folder in File Explorer
2. Click the address bar at the top, type `cmd`, press Enter — a black window opens in that folder
3. Type this and press Enter:

```
python tools\proxy.py
```

Windows 11 users can also right-click the folder and choose **Open in Terminal**.

**Mac / Linux:** open Terminal in that folder and run either:

```
bash run.sh
```

or

```
python3 tools/proxy.py
```

You should see:

```
key: loaded
serving http://127.0.0.1:8787
```

If it says `key: MISSING`, the `.env` file is wrong — usually it is named
`.env.txt`, or it sits in the wrong folder. It must be in the top folder,
the one that also contains `tools` and `app`.

---

## Step 5 — Use it

Open **http://127.0.0.1:8787** in your browser.

Type a question, press **Ask**.

Leave the Model settings panel alone. It already points at the local server
that is supplying the key. You never type the key into the page.

---

## Four questions to try

| Ask this | Expected result |
|---|---|
| `How should chemical waste be segregated?` | Green answer card, numbered steps, each with a chip like `§ 1.2.1 · p.3`, plus a line naming the policy version and dates |
| `Where do I put an empty chemical container?` | Shorter answer, still cited |
| `A chemical bottle is leaking in my lab` | **Red** card. "Stop. Do not handle or move it." Phone **3917 2882**. No steps. |
| `What are the city rules for recycling a television at home` | **Amber** card refusing, because the campus documents do not cover it |

The last two are the ones being graded at 100%. Try to break them.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| `python` is not recognised | Python is not on PATH. Reinstall and tick "Add python.exe to PATH", or try `py tools\proxy.py` on Windows |
| `Address already in use` | Something else is on port 8787. Run `python tools/proxy.py --port 8788` and open `http://127.0.0.1:8788` instead |
| Page loads, answers never come | The server window must stay open. Closing it stops everything. |
| Answer says "did not reach the model" | The server is not running, or you are on the deployed GitHub Pages site instead of `127.0.0.1:8787` |
| Page looks old or unstyled | Press **Ctrl + Shift + R** |
| Windows firewall popup | Click **Allow**. It only needs local access, nothing leaves your machine except the model call. |

---

## What you are testing, and what is still missing

Working: clause-level retrieval, citation checking, both safety gates, the
model answers with real citations.

Not finished: the rulebook holds **one** document (HKU Chemical Waste v3,
2012). So battery, laptop and general recycling questions are refused —
that is correct behaviour for the current corpus, not a bug.
