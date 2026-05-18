// Unit tests for the activation bearer helpers.
//
// Uses Node's built-in `node:test` runner (no extra dependency) and only
// tests the pure helper `buildBearerInit`, which is what
// `withToolkitBearer` delegates to. The Tauri-invoke half is excluded from
// these tests on purpose -- it's a one-line passthrough and unit-testing
// it would require mocking `@tauri-apps/api/core`, which has no clean
// no-dep solution today.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBearerInit } from "../src/activation/bearer-helpers.js";

test("buildBearerInit stamps an Authorization: Bearer header", () => {
  const init = buildBearerInit("abc123");
  assert.equal(init.headers.get("Authorization"), "Bearer abc123");
});

test("buildBearerInit preserves the input init shape", () => {
  const init = buildBearerInit("tok", { method: "POST", body: "{}" });
  assert.equal(init.method, "POST");
  assert.equal(init.body, "{}");
  assert.equal(init.headers.get("Authorization"), "Bearer tok");
});

test("buildBearerInit preserves caller-supplied headers (object form)", () => {
  const init = buildBearerInit("tok", {
    headers: { "Content-Type": "application/json", "X-Foo": "bar" },
  });
  assert.equal(init.headers.get("Content-Type"), "application/json");
  assert.equal(init.headers.get("X-Foo"), "bar");
  assert.equal(init.headers.get("Authorization"), "Bearer tok");
});

test("buildBearerInit preserves caller-supplied headers (Headers form)", () => {
  const h = new Headers();
  h.set("X-Trace-Id", "trace-xyz");
  const init = buildBearerInit("tok", { headers: h });
  assert.equal(init.headers.get("X-Trace-Id"), "trace-xyz");
  assert.equal(init.headers.get("Authorization"), "Bearer tok");
});

test("buildBearerInit overrides any pre-existing Authorization header", () => {
  // If the caller already set an Authorization header (perhaps a stale
  // bearer cached at app start), the fresh bearer must win.
  const init = buildBearerInit("fresh", {
    headers: { Authorization: "Bearer stale" },
  });
  assert.equal(init.headers.get("Authorization"), "Bearer fresh");
});

test("buildBearerInit handles no-arg init", () => {
  const init = buildBearerInit("tok");
  assert.equal(init.headers.get("Authorization"), "Bearer tok");
  // No other keys leaked in.
  assert.deepEqual(Object.keys(init).sort(), ["headers"]);
});

test("buildBearerInit returns a Headers instance, not a plain object", () => {
  const init = buildBearerInit("tok", { headers: { "X-Y": "z" } });
  assert.ok(init.headers instanceof Headers, "headers must be a Headers instance");
});
