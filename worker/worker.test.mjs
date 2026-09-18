// node --test "worker/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const PAGE = "https://etiennelescot.github.io";
const QUESTIONS = { urgent: { type: "noul", instructions: "Is it urgent?" } };
const call = (init, origin = PAGE) =>
  worker.fetch(new Request("https://relay.test/", { ...init, headers: { Origin: origin, ...init.headers } }));
const post = (body, headers = { Authorization: "Bearer k_test" }, origin) =>
  call({ method: "POST", headers, body: JSON.stringify(body) }, origin);

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

test("forwards only state, model and questions, with the caller's key", async () => {
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return Response.json({ model: "jev-test", answers: {}, usage: {} });
  };
  try {
    const r = await post({ state: { m: "hi" }, questions: QUESTIONS, model: "other", extra: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), PAGE);
    assert.equal(sent.url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(sent.init.headers.Authorization, "Bearer k_test");
    assert.deepEqual(JSON.parse(sent.init.body), { state: { m: "hi" }, model: "jev-latest", questions: QUESTIONS });
  } finally {
    globalThis.fetch = realFetch;
  }
});
