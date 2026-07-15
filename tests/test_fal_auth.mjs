import assert from "node:assert/strict";
import test from "node:test";

import {
  FAL_REALTIME_APP,
  FAL_TOKEN_ENDPOINT,
  TOKEN_DURATION_SECONDS,
  TOKEN_REQUEST_TIMEOUT_MS,
  createRealtimeTokenResult,
  isFalAvailable,
  parseJsonBody,
  timingSafeAccessCodeEqual,
} from "../server/fal-auth.js";
import healthHandler, { healthPayload } from "../api/health.js";
import { createHandler } from "../api/fal/realtime-token.js";

const configuredEnv = {
  FAL_KEY: "fal-key-that-must-stay-server-side",
  CLAY_SCREEN_ACCESS_CODE: "open-clay",
};

test("configuration is available only when both secrets are non-empty", () => {
  assert.equal(isFalAvailable(configuredEnv), true);
  assert.equal(isFalAvailable({ FAL_KEY: configuredEnv.FAL_KEY }), false);
  assert.equal(isFalAvailable({ CLAY_SCREEN_ACCESS_CODE: "open-clay" }), false);
  assert.equal(isFalAvailable({ FAL_KEY: "  ", CLAY_SCREEN_ACCESS_CODE: "x" }), false);
});

test("access code comparison accepts only the exact string", () => {
  assert.equal(timingSafeAccessCodeEqual("open-clay", "open-clay"), true);
  assert.equal(timingSafeAccessCodeEqual("open-clay!", "open-clay"), false);
  assert.equal(timingSafeAccessCodeEqual(123, "open-clay"), false);
});

test("JSON body parsing is bounded and never throws", () => {
  assert.deepEqual(parseJsonBody('{"app":"ok"}'), { app: "ok" });
  assert.deepEqual(parseJsonBody(Buffer.from('{"accessCode":"x"}')), { accessCode: "x" });
  assert.deepEqual(parseJsonBody({ app: "ok" }), { app: "ok" });
  assert.equal(parseJsonBody("not-json"), null);
  assert.equal(parseJsonBody("[1,2,3]"), null);
  assert.equal(parseJsonBody(`{"padding":"${"x".repeat(9 * 1024)}"}`), null);
  assert.equal(parseJsonBody({ padding: "x".repeat(9 * 1024) }), null);
});

test("token request is scoped to the exact FLUX.2 realtime app for 120 seconds", async () => {
  let upstreamCall;
  const fetchImpl = async (url, init) => {
    upstreamCall = { url, init };
    return { ok: true, json: async () => ({ token: "short-lived-upstream-token" }) };
  };

  const result = await createRealtimeTokenResult(
    {
      body: JSON.stringify({ app: FAL_REALTIME_APP, accessCode: "open-clay" }),
    },
    { env: configuredEnv, fetchImpl },
  );

  assert.deepEqual(result, {
    status: 200,
    body: { token: "short-lived-upstream-token", expiresIn: 120 },
  });
  assert.equal(upstreamCall.url, FAL_TOKEN_ENDPOINT);
  assert.equal(upstreamCall.init.method, "POST");
  assert.equal(upstreamCall.init.signal instanceof AbortSignal, true);
  assert.equal(TOKEN_REQUEST_TIMEOUT_MS, 10_000);
  assert.equal(upstreamCall.init.headers.Authorization, `Key ${configuredEnv.FAL_KEY}`);
  assert.deepEqual(JSON.parse(upstreamCall.init.body), {
    allowed_apps: ["fal-ai/flux-2/klein/realtime"],
    duration: TOKEN_DURATION_SECONDS,
  });
});

test("invalid credentials and models never call fal", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("must not run");
  };

  const wrongCode = await createRealtimeTokenResult(
    { body: { app: FAL_REALTIME_APP, accessCode: "wrong" } },
    { env: configuredEnv, fetchImpl },
  );
  const wrongModel = await createRealtimeTokenResult(
    { body: { app: "fal-ai/another-model/realtime", accessCode: "open-clay" } },
    { env: configuredEnv, fetchImpl },
  );

  assert.equal(wrongCode.status, 401);
  assert.equal(wrongModel.status, 403);
  assert.equal(calls, 0);
});

test("missing configuration fails closed without calling fal", async () => {
  let calls = 0;
  const result = await createRealtimeTokenResult(
    { body: { app: FAL_REALTIME_APP, accessCode: "open-clay" } },
    {
      env: { FAL_KEY: "key-only" },
      fetchImpl: async () => {
        calls += 1;
      },
    },
  );

  assert.deepEqual(result, {
    status: 503,
    body: { error: "Token service unavailable." },
  });
  assert.equal(calls, 0);
});

test("upstream failures are generic and do not leak secrets", async () => {
  const leakedValues = [configuredEnv.FAL_KEY, "upstream-secret-token"];
  const failures = [
    async () => {
      throw new Error(`request failed ${leakedValues.join(" ")}`);
    },
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: leakedValues.join(" ") }),
    }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error(`bad response ${leakedValues.join(" ")}`);
      },
    }),
  ];

  for (const fetchImpl of failures) {
    const result = await createRealtimeTokenResult(
      { body: { app: FAL_REALTIME_APP, accessCode: "open-clay" } },
      { env: configuredEnv, fetchImpl },
    );
    const serialized = JSON.stringify(result);
    assert.equal(result.status, 502);
    for (const secret of leakedValues) assert.equal(serialized.includes(secret), false);
  }
});

test("a stalled fal token request is aborted", async () => {
  const result = await createRealtimeTokenResult(
    { body: { app: FAL_REALTIME_APP, accessCode: "open-clay" } },
    {
      env: configuredEnv,
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    },
  );

  assert.deepEqual(result, {
    status: 502,
    body: { error: "Could not create a realtime token." },
  });
});

test("HTTP handler is POST-only and sets no-store on every response", async () => {
  const response = mockResponse();
  await createHandler({ env: configuredEnv, fetchImpl: async () => assert.fail("unexpected") })(
    { method: "GET" },
    response,
  );

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers.Allow, "POST");
});

test("health exposes runtime availability without exposing secrets", () => {
  assert.deepEqual(healthPayload(configuredEnv), {
    ok: true,
    default_runtime: "cloud",
    runtimes: {
      cloud: {
        available: true,
        model: FAL_REALTIME_APP,
        token_endpoint: "api/fal/realtime-token",
        access_code_required: true,
      },
      local: { available: false },
      preview: { available: true },
    },
  });
  assert.equal(JSON.stringify(healthPayload(configuredEnv)).includes(configuredEnv.FAL_KEY), false);
  assert.equal(
    JSON.stringify(healthPayload(configuredEnv)).includes(configuredEnv.CLAY_SCREEN_ACCESS_CODE),
    false,
  );
  assert.equal(healthPayload({}).default_runtime, "preview");
  assert.equal(healthPayload({}).runtimes.cloud.available, false);
});

test("health responses disable caching", () => {
  const response = mockResponse();
  healthHandler({ method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}
