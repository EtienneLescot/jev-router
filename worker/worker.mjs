// Stateless relay: the Jev API refuses browser calls from other origins (CORS),
// so the demo page posts here and this Worker forwards the call server-to-server.
// It stores nothing and logs nothing: the visitor's key only passes through.

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const ALLOWED_ORIGIN = "https://etiennelescot.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_BODY = 32 * 1024;

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = origin === ALLOWED_ORIGIN || LOCAL_ORIGIN.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Vary": "Origin",
    };
    const fail = (status, error) =>
      Response.json({ error }, { status, headers: cors });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return fail(405, "POST only");
    if (!allowed) return fail(403, "origin not allowed");

    const auth = request.headers.get("Authorization") || "";
    if (!/^Bearer \S+$/.test(auth)) return fail(401, "missing API key");

    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail(413, "request too large");
    let body;
    try { body = JSON.parse(raw); } catch { return fail(400, "invalid JSON"); }

    const { state, questions } = body || {};
    const entries = questions && typeof questions === "object" ? Object.values(questions) : [];
    if (state == null || entries.length < 1 || entries.length > 6 ||
        !entries.every(q => q && ["noul", "choice", "score"].includes(q.type) && q.instructions)) {
      return fail(400, "expected {state, questions} with 1 to 6 typed questions");
    }

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: MODEL, questions }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  },
};
