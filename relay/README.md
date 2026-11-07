# Cloud relay — makes the public link work with a typed key

## Why this exists

The Bailian Token Plan server refuses browser requests. Not because of the key —
because it answers no CORS preflight, so the browser won't even send the request.

A relay is a tiny program that sits between the browser and Alibaba. It adds the
missing permission headers and forwards the call unchanged. It never stores the
key: the browser sends it each time and the relay passes it straight through.

Once it exists, **anyone with the link can use the app by pasting the key** —
no Python, no download, no terminal.

```
browser  ──key──▶  relay (Cloudflare)  ──key──▶  Alibaba Token Plan
         ◀──answer──                 ◀──answer──
```

Deployed once by one person. Free. No credit card.

---

## Deploy it (about 5 minutes, one time)

1. Go to **https://dash.cloudflare.com/sign-up** and create a free account.
   Verify the email.

2. In the left sidebar open **Workers & Pages** (sometimes just called
   **Compute**), then click **Create** → **Start with Hello World** →
   **Deploy**. Accept the default name or pick your own.

3. Click **Edit code**. Delete everything in the editor, then paste the whole
   contents of [`worker.js`](./worker.js). Click **Deploy**.

4. Copy the URL shown at the top. It looks like:

   ```
   https://waste-guide-relay.YOUR-NAME.workers.dev
   ```

5. In the app: open **Model settings**, set **Endpoint** to
   **Custom relay URL…**, paste that URL **with `/v1` on the end**:

   ```
   https://waste-guide-relay.YOUR-NAME.workers.dev/v1
   ```

6. Paste the group API key into the **API key** field. Ask a question.

The badge should read `ready · qwen3.8-flash` and an answered question should
come back with clause chips.

---

## Test it without the browser

Visiting the worker URL in a normal tab should print:

```
Waste guide relay is running.
```

If you see that, the relay is live.

From a terminal you can also check the whole path:

```
curl https://YOUR-RELAY.workers.dev/v1/chat/completions \
  -H "content-type: application/json" \
  -H "authorization: Bearer PASTE-KEY-HERE" \
  -d '{"model":"qwen3.8-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```

A JSON reply with `choices` means it works.

---

## What it does and does not do

| Does | Does not |
|---|---|
| Adds CORS headers so browsers can call it | Store, log, or cache the key |
| Forwards only `POST …/chat/completions` | Accept any other path |
| Passes the key through per request | Hold a key of its own |
| Rejects requests with no key (401) | Decide who may use it |

**The last row is the trade-off.** Anyone who has the URL *and* a valid key can
use it. They need your group's key to spend your group's credits, so the URL
alone is useless — but treat the relay URL as semi-private and don't post it in
public, for the same reason you don't post the key.

If you want it locked down further, add a shared passphrase check in
`worker.js` — ask and it can be added in a few lines.

---

## Cost

Cloudflare's free plan covers 100,000 requests per day. A demo uses a few dozen.
