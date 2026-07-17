import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLOUD_CAPTURE_INTERVAL_MS,
  CLOUD_PENDING_LIMIT,
  CLOUD_PENDING_TTL_MS,
  CLOUD_STARTUP_TIMEOUT_MS,
  CLOUD_SESSION_LIMIT_MS,
  FAL_CLIENT_URL,
  FAL_MODEL,
  FLUX_INPUT_SIZE,
  FLUX_JPEG_QUALITY,
  FLUX_OUTPUT_SIZE,
  availableRealRuntimes,
  buildFluxInput,
  buildRecordingOptions,
  chooseRuntime,
} from "../static/flux-config.js";
import {
  containRect,
  recordingIsReady,
  recordingPreset,
  shouldPublishPair,
  shouldStartArmedRecording,
} from "../static/recording-layout.js";

test("cloud is preferred when it is available", () => {
  const health = {
    runtimes: {
      cloud: { available: true },
      local: { available: true },
    },
  };
  assert.equal(chooseRuntime(health), "cloud");
  assert.deepEqual(availableRealRuntimes(health), ["cloud", "local"]);
});

test("local and preview are safe fallbacks", () => {
  assert.equal(chooseRuntime({ runtimes: { local: { available: true } } }), "local");
  assert.equal(chooseRuntime({}), "preview");
});

test("recording options request a high-quality bitrate", () => {
  assert.deepEqual(buildRecordingOptions({ mimeType: "video/mp4", cloud: true }), {
    mimeType: "video/mp4",
    videoBitsPerSecond: 12_000_000,
  });
  assert.deepEqual(buildRecordingOptions(), {
    videoBitsPerSecond: 6_000_000,
  });
  assert.deepEqual(buildRecordingOptions({ mimeType: "video/webm", cloud: true, compare: true }), {
    mimeType: "video/webm",
    videoBitsPerSecond: 16_000_000,
  });
});

test("recording presets keep showcase and audit landscape while output stays square", () => {
  assert.deepEqual(recordingPreset("live"), {
    mode: "live",
    width: 1920,
    height: 1080,
    label: "Live compare · smooth",
  });
  assert.equal(recordingPreset("audit").label, "Exact pairs · audit");
  assert.equal(recordingPreset("compare").mode, "compare");
  assert.equal(recordingPreset("output").width, 1080);
  assert.equal(recordingPreset("output").height, 1080);
  assert.equal(recordingPreset("unknown").mode, "live");
});

test("recording media is contained without cropping", () => {
  assert.deepEqual(containRect(100, 100, 0, 0, 200, 100), {
    x: 50,
    y: 0,
    width: 100,
    height: 100,
  });
  assert.deepEqual(containRect(160, 90, 10, 20, 320, 320), {
    x: 10,
    y: 90,
    width: 320,
    height: 180,
  });
  assert.deepEqual(containRect(90, 160, 0, 0, 320, 320), {
    x: 70,
    y: 0,
    width: 180,
    height: 320,
  });
});

test("live recording starts on displayed output while audit waits for a matched native pair", () => {
  assert.equal(recordingIsReady("live", { firstOutput: true, matchedPairReady: false }), true);
  assert.equal(recordingIsReady("audit", { firstOutput: true, matchedPairReady: false }), false);
  assert.equal(recordingIsReady("audit", { firstOutput: true, matchedPairReady: true }), true);
  assert.equal(recordingIsReady("output", { firstOutput: true, matchedPairReady: false }), true);
  assert.equal(shouldStartArmedRecording("live", "display-frame"), true);
  assert.equal(shouldStartArmedRecording("live", "matched-pair"), false);
  assert.equal(shouldStartArmedRecording("audit", "display-frame"), false);
  assert.equal(shouldStartArmedRecording("audit", "matched-pair"), true);
  assert.equal(shouldStartArmedRecording("output", "display-frame"), true);
});

test("matched-pair publication never moves backward in source time", () => {
  assert.equal(shouldPublishPair(undefined, 100), true);
  assert.equal(shouldPublishPair(100, 100), true);
  assert.equal(shouldPublishPair(100, 101), true);
  assert.equal(shouldPublishPair(101, 100), false);
});

test("the browser SDK, package lock input, and attribution stay on one version", () => {
  const root = new URL("../", import.meta.url);
  const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const version = packageJson.dependencies["@fal-ai/client"];
  const notice = readFileSync(new URL("NOTICE", root), "utf8");

  assert.equal(FAL_CLIENT_URL.includes(`@fal-ai/client@${version}/`), true);
  assert.equal(notice.includes(`@fal-ai/client ${version}`), true);
});

test("FLUX request uses the documented realtime settings", () => {
  const request = buildFluxInput({
    imageUrl: "data:image/jpeg;base64,frame",
    prompt: "handmade clay",
    requestId: "request-1",
  });

  assert.equal(FAL_MODEL, "fal-ai/flux-2/klein/realtime");
  assert.equal(FLUX_INPUT_SIZE, 704);
  assert.equal(FLUX_OUTPUT_SIZE, 768);
  assert.equal(FLUX_JPEG_QUALITY, 0.5);
  assert.equal(CLOUD_CAPTURE_INTERVAL_MS, 100);
  assert.equal(CLOUD_PENDING_LIMIT, 16);
  assert.equal(CLOUD_PENDING_TTL_MS, 5_000);
  assert.equal(CLOUD_STARTUP_TIMEOUT_MS, 10_000);
  assert.equal(CLOUD_SESSION_LIMIT_MS, 15_000);
  assert.deepEqual(request, {
    image_url: "data:image/jpeg;base64,frame",
    prompt: "handmade clay",
    request_id: "request-1",
    num_inference_steps: 3,
    seed: 35,
    schedule_mu: 2.3,
    image_size: "square",
    enable_interpolation: true,
    output_feedback_strength: 0.95,
  });
});

test("FLUX request rejects incomplete input", () => {
  assert.throws(
    () => buildFluxInput({ imageUrl: "", prompt: "clay", requestId: "request-1" }),
    /required/,
  );
});
