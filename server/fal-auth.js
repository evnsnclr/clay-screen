import { createHash, timingSafeEqual } from "node:crypto";

export const FAL_REALTIME_APP = "fal-ai/flux-2/klein/realtime";
export const FAL_TOKEN_ENDPOINT = "https://rest.fal.ai/tokens/realtime";
export const TOKEN_DURATION_SECONDS = 120;
export const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

const MAX_BODY_BYTES = 8 * 1024;

export function isFalAvailable(env = {}) {
  return hasText(env.FAL_KEY) && hasText(env.CLAY_SCREEN_ACCESS_CODE);
}

export function timingSafeAccessCodeEqual(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;

  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function parseJsonBody(body) {
  if (body === null || body === undefined) return null;

  if (Buffer.isBuffer(body)) {
    if (body.byteLength > MAX_BODY_BYTES) return null;
    body = body.toString("utf8");
  }

  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return null;
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  try {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) return null;
  } catch {
    return null;
  }
  return body;
}

export async function createRealtimeTokenResult(
  request,
  {
    env = {},
    fetchImpl = globalThis.fetch,
    timeoutMs = TOKEN_REQUEST_TIMEOUT_MS,
  } = {},
) {
  if (!isFalAvailable(env) || typeof fetchImpl !== "function") {
    return failure(503, "Token service unavailable.");
  }

  const body = parseJsonBody(request?.body);
  if (!body || typeof body.app !== "string" || typeof body.accessCode !== "string") {
    return failure(400, "Invalid request.");
  }

  if (body.app !== FAL_REALTIME_APP) {
    return failure(403, "Model is not allowed.");
  }

  if (!timingSafeAccessCodeEqual(body.accessCode, env.CLAY_SCREEN_ACCESS_CODE)) {
    return failure(401, "Access denied.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let upstream;
  let upstreamBody;
  try {
    upstream = await fetchImpl(FAL_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_apps: [FAL_REALTIME_APP],
        duration: TOKEN_DURATION_SECONDS,
      }),
      signal: controller.signal,
    });
    if (!upstream?.ok) {
      return failure(502, "Could not create a realtime token.");
    }
    upstreamBody = await upstream.json();
  } catch {
    return failure(502, "Could not create a realtime token.");
  } finally {
    clearTimeout(timeout);
  }

  if (!hasText(upstreamBody?.token)) {
    return failure(502, "Could not create a realtime token.");
  }

  return {
    status: 200,
    body: {
      token: upstreamBody.token,
      expiresIn: TOKEN_DURATION_SECONDS,
    },
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(status, message) {
  return { status, body: { error: message } };
}
