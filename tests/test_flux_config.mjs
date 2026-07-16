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
