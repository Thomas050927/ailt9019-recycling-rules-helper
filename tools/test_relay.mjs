/**
 * Runs relay/worker.js outside Cloudflare to prove it works before deploying.
 * Node 18+ only (needs global fetch / Request / Response).
 *
 *   node tools/test_relay.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worker = (await import(pathToFileURL(join(root, "relay", "worker.js")).href)).default;

function readKey() {
  try {
    const env = readFileSync(join(root, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.trim().startsWith("BAILIAN_API_KEY="));
    return line ? line.slice(line.indexOf("=") + 1).trim() : "";
  } catch {
    return "";
  }
}

const key = readKey();
const base = "https://relay.example.workers.dev";
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// 1. Preflight: the browser's first move. This is what the real host fails.
{
  const res = await worker.fetch(
    new Request(`${base}/v1/chat/completions`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://thomas050927.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    })
  );
  check("preflight returns 204", res.status === 204, `status ${res.status}`);
  check(
    "preflight allows any origin",
    res.headers.get("access-control-allow-origin") === "*",
    String(res.headers.get("access-control-allow-origin"))
  );
}

// 2. No key -> must refuse, not forward.
{
  const res = await worker.fetch(
    new Request(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3.8-flash", messages: [{ role: "user", content: "hi" }] }),
    })
  );
  check("missing key is rejected", res.status === 401, `status ${res.status}`);
}

// 3. Wrong path -> refuse.
{
  const res = await worker.fetch(
    new Request(`${base}/v1/models`, { method: "POST", headers: { authorization: "Bearer x" } })
  );
  check("unknown path is rejected", res.status === 404, `status ${res.status}`);
}

// 4. GET -> friendly message.
{
  const res = await worker.fetch(new Request(`${base}/`));
  check("GET returns a message", res.status === 200, (await res.text()).trim().slice(0, 40));
}

// 5. The real thing: forward a live call with the course key.
if (!key) {
  console.log("SKIP  live relay call — no BAILIAN_API_KEY in .env");
} else {
  const started = Date.now();
  const res = await worker.fetch(
    new Request(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "qwen3.8-flash",
        messages: [{ role: "user", content: "Reply with exactly: RELAY OK" }],
        max_tokens: 12,
      }),
    })
  );
  const text = await res.text();
  let content = "";
  try {
    content = JSON.parse(text).choices?.[0]?.message?.content?.trim() || "";
  } catch {
    content = text.slice(0, 120);
  }
  check("live call returns 200", res.status === 200, `status ${res.status}`);
  check("response is readable JSON", content.length > 0, JSON.stringify(content));
  check("CORS header present on the real response", res.headers.get("access-control-allow-origin") === "*");
  console.log(`      round trip: ${Date.now() - started} ms`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
