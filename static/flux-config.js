export const FAL_MODEL = "fal-ai/flux-2/klein/realtime";
export const FAL_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/@fal-ai/client@1.10.1/+esm";

export const FLUX_INPUT_SIZE = 704;
export const FLUX_OUTPUT_SIZE = 768;
export const FLUX_JPEG_QUALITY = 0.5;
export const CLOUD_CAPTURE_INTERVAL_MS = 100;
export const CLOUD_PENDING_LIMIT = 16;
export const CLOUD_PENDING_TTL_MS = 5_000;
export const CLOUD_STARTUP_TIMEOUT_MS = 10_000;
export const CLOUD_SESSION_LIMIT_MS = 15_000;

export function chooseRuntime(health = {}) {
  const runtimes = health.runtimes || {};
  if (runtimes.cloud?.available) return "cloud";
  if (runtimes.local?.available) return "local";
  return "preview";
}

export function availableRealRuntimes(health = {}) {
  const runtimes = health.runtimes || {};
  return ["cloud", "local"].filter((name) => runtimes[name]?.available);
}

export function buildRecordingOptions({ mimeType = "", cloud = false, compare = false } = {}) {
  const videoBitsPerSecond = compare
    ? (cloud ? 16_000_000 : 12_000_000)
    : (cloud ? 12_000_000 : 6_000_000);
  const options = { videoBitsPerSecond };
  if (mimeType) options.mimeType = mimeType;
  return options;
}

export function buildFluxInput({ imageUrl, prompt, requestId }) {
  if (!imageUrl || !prompt || !requestId) {
    throw new Error("A source frame, prompt, and request id are required");
  }

  return {
    image_url: imageUrl,
    prompt,
    request_id: requestId,
    num_inference_steps: 3,
    seed: 35,
    schedule_mu: 2.3,
    image_size: "square",
    enable_interpolation: true,
    output_feedback_strength: 0.95,
  };
}
