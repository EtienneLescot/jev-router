// Stateless relay: the Jev API refuses browser calls from other origins (CORS),
// so the demo page posts here and this Worker forwards the call server-to-server.
// It stores nothing and logs nothing.
//
// Keys: the visitor's own key if they send one (anything goes, they pay), otherwise the
// demo key held as a Worker secret, which only runs this demo's exact questions.

import { TRIAGE, SIZING, AGENT_NAME, MAX_MESSAGE } from "../questions.js";

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const ALLOWED_ORIGINS = ["https://etiennelescot.github.io", "https://jevmigration.com"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_BODY = 32 * 1024;
const DEMO_QUESTIONS = [TRIAGE, SIZING].map(q => JSON.stringify(q));
const AGENTS = Object.values(AGENT_NAME);

const isDemoState = s =>
  s && typeof s === "object" && !Array.isArray(s) &&
  Object.keys(s).every(k => k === "customer_message" || k === "assigned_agent") &&
  typeof s.customer_message === "string" && s.customer_message.length > 0 &&
  s.customer_message.length <= MAX_MESSAGE &&
  (s.assigned_agent === undefined || AGENTS.includes(s.assigned_agent));

export default {
  async fetch(request, env = {}) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Vary": "Origin",
    };
    const fail = (status, error) =>
      Response.json({ error }, { status, headers: cors });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return fail(405, "POST only");
    if (!allowed) return fail(403, "origin not allowed");

    const own = request.headers.get("Authorization");
    if (own && !/^Bearer \S+$/.test(own)) return fail(401, "malformed API key");
    if (!own && !env.TYPESAFE_API_KEY) return fail(401, "missing API key");

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

    if (!own) {
      if (!DEMO_QUESTIONS.includes(JSON.stringify(questions)) || !isDemoState(state)) {
        return fail(403, "the demo key only runs this demo's questions; bring your own key for anything else");
      }
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) {
        return fail(429, "too many requests, try again in a minute");
      }
    }

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Authorization": own || `Bearer ${env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: MODEL, questions }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  },
};
