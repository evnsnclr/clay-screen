export const FAL_MODEL = "fal-ai/flux-2/klein/realtime";
export const FAL_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/@fal-ai/client@1.10.1/+esm";

export const FLUX_INPUT_SIZE = 704;
export const FLUX_OUTPUT_SIZE = 768;
export const FLUX_JPEG_QUALITY = 0.5;
export const CLOUD_SESSION_LIMIT_MS = 60_000;

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

export function isInterfacePreviewLocation(locationLike = {}) {
  const hostname = typeof locationLike.hostname === "string" ? locationLike.hostname : "";
  const search = typeof locationLike.search === "string" ? locationLike.search : "";
  return hostname.endsWith(".github.io") || new URLSearchParams(search).get("preview") === "1";
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
    output_feedback_strength: 0.9,
  };
}
