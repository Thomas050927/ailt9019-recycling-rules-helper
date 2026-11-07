/**
 * CORS relay for the AILT9019 waste guide.
 *
 * Why this exists: the Bailian Token Plan host answers no CORS preflight, so a
 * browser refuses to send requests to it directly. This worker sits in front,
 * adds the missing CORS headers, and forwards the call unchanged.
 *
 * It does NOT store, log, or inspect the API key. The browser sends the key on
 * every request, the worker passes the Authorization header straight through.
 * If you never type a key in the page, nothing is forwarded.
 *
 * Deploy: see relay/README.md
 */

const UPSTREAM = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // The browser sends this first, before the real request.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // A human visiting the worker URL should see something friendly.
    if (request.method === "GET") {
      return new Response(
        "Waste guide relay is running. Point the app's endpoint at this URL + /v1\n",
        { status: 200, headers: { ...CORS, "content-type": "text/plain" } }
      );
    }

    if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
      return json({ error: "Only POST /v1/chat/completions is supported." }, 404);
    }

    const auth = request.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return json({ error: "No API key in the request. Paste your key in Model settings." }, 401);
    }

    let body;
    try {
      body = await request.text();
    } catch {
      return json({ error: "Empty request body." }, 400);
    }

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
        body,
      });
    } catch (error) {
      return json({ error: `Could not reach the model host: ${error.message}` }, 502);
    }

    // Stream the response back with CORS attached, so the browser can read it.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS,
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  },
};
