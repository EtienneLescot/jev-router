// node --test "worker/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";
import { TRIAGE, SIZING } from "../questions.js";

const PAGE = "https://etiennelescot.github.io";
const QUESTIONS = { urgent: { type: "noul", instructions: "Is it urgent?" } };
const DEMO_ENV = { TYPESAFE_API_KEY: "k_demo" };
const call = (init, origin = PAGE, env) =>
  worker.fetch(new Request("https://relay.test/", { ...init, headers: { Origin: origin, ...init.headers } }), env);
const post = (body, headers = { Authorization: "Bearer k_test" }, origin, env) =>
  call({ method: "POST", headers, body: JSON.stringify(body) }, origin, env);
const demo = (body, env = DEMO_ENV) => post(body, {}, PAGE, env);

// Replaces the upstream call and returns what the relay sent.
async function capture(fn) {
  const realFetch = globalThis.fetch;
  const sent = {};
  globalThis.fetch = async (url, init) => {
    Object.assign(sent, { url, init });
    return Response.json({ model: "jev-test", answers: {}, usage: {} });
  };
  try { return { res: await fn(), sent }; } finally { globalThis.fetch = realFetch; }
}

test("preflight allows jevmigration.com", async () => {
  const r = await call({ method: "OPTIONS" }, "https://jevmigration.com");
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://jevmigration.com");
});

test("preflight allows the demo page", async () => {
  const r = await call({ method: "OPTIONS" });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), PAGE);
});

test("rejects other origins, missing key and malformed bodies", async () => {
  assert.equal((await post({ state: "x", questions: QUESTIONS }, undefined, "https://evil.example")).status, 403);
  assert.equal((await post({ state: "x", questions: QUESTIONS }, {})).status, 401);
  assert.equal((await post({ state: "x", questions: {} })).status, 400);
  assert.equal((await post({ state: "x", questions: { q: { type: "free", instructions: "?" } } })).status, 400);
});

test("own key: forwards only state, model and questions, with the caller's key", async () => {
  const { res, sent } = await capture(() =>
    post({ state: { m: "hi" }, questions: QUESTIONS, model: "other", extra: 1 }, undefined, PAGE, DEMO_ENV));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), PAGE);
  assert.equal(sent.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(sent.init.headers.Authorization, "Bearer k_test");
  assert.deepEqual(JSON.parse(sent.init.body), { state: { m: "hi" }, model: "jev-latest", questions: QUESTIONS });
});

test("demo key: runs the demo's two calls with the secret key", async () => {
  for (const [state, questions] of [
    [{ customer_message: "App crashes" }, TRIAGE],
    [{ customer_message: "App crashes", assigned_agent: "Technical agent" }, SIZING],
  ]) {
    const { res, sent } = await capture(() => demo({ state, questions }));
    assert.equal(res.status, 200);
    assert.equal(sent.init.headers.Authorization, "Bearer k_demo");
  }
});

test("demo key: refuses anything else", async () => {
  const msg = { customer_message: "hi" };
  assert.equal((await demo({ state: msg, questions: QUESTIONS })).status, 403);
  assert.equal((await demo({ state: msg, questions: { ...TRIAGE, extra: QUESTIONS.urgent } })).status, 403);
  assert.equal((await demo({ state: { customer_message: "x".repeat(1001) }, questions: TRIAGE })).status, 403);
  assert.equal((await demo({ state: { ...msg, other: 1 }, questions: TRIAGE })).status, 403);
  assert.equal((await demo({ state: { ...msg, assigned_agent: "CEO" }, questions: SIZING })).status, 403);
  assert.equal((await demo({ state: msg, questions: TRIAGE }, {})).status, 401);
});

test("demo key: rate limited per IP", async () => {
  const env = { ...DEMO_ENV, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await demo({ state: { customer_message: "hi" }, questions: TRIAGE }, env)).status, 429);
});
