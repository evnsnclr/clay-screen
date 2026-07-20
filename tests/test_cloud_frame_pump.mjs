import assert from "node:assert/strict";
import test from "node:test";

import { CloudFramePump } from "../static/cloud-frame-pump.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(overrides = {}) {
  let now = 0;
  let tick = null;
  let nextId = 0;
  const sent = [];
  const pump = new CloudFramePump({
    capture: async () => ({ sourceDataUrl: `frame-${now}` }),
    send: (pending) => sent.push(pending),
    now: () => now,
    schedule: (callback) => {
      tick = callback;
      return 1;
    },
    cancel: () => {},
    createRequestId: () => `request-${++nextId}`,
    ...overrides,
  });
  return {
    pump,
    sent,
    advance(value) {
      now += value;
    },
    async tick() {
      tick();
      await flush();
    },
  };
}

test("sampling continues while only the freshest frame waits for inference", async () => {
  const run = harness();
  run.pump.start({ generation: 7, deadlineAt: 1_000 });
  await flush();
  run.advance(100);
  await run.tick();
  run.advance(100);
  await run.tick();

  assert.equal(run.pump.capturedCount, 3);
  assert.equal(run.sent.length, 1);
  assert.equal(run.sent[0].sourceDataUrl, "frame-0");

  run.pump.resolve({ request_id: "request-1" });
  assert.equal(run.sent.length, 2);
  assert.equal(run.sent[1].sourceDataUrl, "frame-200");
  assert.equal(run.pump.pendingCount, 1);
});

test("out-of-order results resolve to their matching source frames", async () => {
  const run = harness({ maxInFlight: 2 });
  run.pump.start({ generation: 3, deadlineAt: 1_000 });
  await flush();
  run.advance(100);
  await run.tick();

  const second = run.pump.resolve({ request_id: "request-2" });
  const first = run.pump.resolve({ request_id: "request-1" });
  assert.equal(second.sourceDataUrl, "frame-100");
  assert.equal(first.sourceDataUrl, "frame-0");
  assert.equal(run.pump.pendingCount, 0);
});

test("pending source storage is bounded and favors fresh frames", async () => {
  const run = harness({ maxInFlight: 2, pendingLimit: 2 });
  run.pump.start({ generation: 1, deadlineAt: 1_000 });
  await flush();
  run.advance(100);
  await run.tick();
  run.advance(100);
  await run.tick();

  assert.equal(run.pump.pendingCount, 2);
  assert.equal(run.sent.length, 2);
  run.pump.resolve({ request_id: "request-1" });
  assert.equal(run.sent.length, 3);
  assert.equal(run.sent[2].sourceDataUrl, "frame-200");
  assert.equal(run.pump.pendingCount, 2);
});

test("Stop prevents a send after delayed frame encoding completes", async () => {
  let finishCapture;
  const capture = new Promise((resolve) => {
    finishCapture = resolve;
  });
  const sent = [];
  const pump = new CloudFramePump({
    capture: () => capture,
    send: (pending) => sent.push(pending),
    now: () => 0,
    schedule: () => 1,
    cancel: () => {},
    createRequestId: () => "late-request",
  });

  pump.start({ generation: 1, deadlineAt: 1_000 });
  pump.stop();
  finishCapture({ sourceDataUrl: "late-frame" });
  await flush();

  assert.deepEqual(sent, []);
  assert.equal(pump.pendingCount, 0);
});

test("an absolute deadline stops sampling even after a delayed timer", async () => {
  let deadlineCalls = 0;
  const run = harness({ onDeadline: () => { deadlineCalls += 1; } });
  run.pump.start({ generation: 1, deadlineAt: 150 });
  await flush();
  run.advance(200);
  await run.tick();

  assert.equal(deadlineCalls, 1);
  assert.equal(run.pump.running, false);
  assert.equal(run.sent.length, 1);
});
