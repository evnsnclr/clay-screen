import { FAL_REALTIME_APP, isFalAvailable } from "../server/fal-auth.js";

export function healthPayload(env = {}) {
  const cloudAvailable = isFalAvailable(env);
  return {
    ok: true,
    default_runtime: cloudAvailable ? "cloud" : "preview",
    runtimes: {
      cloud: {
        available: cloudAvailable,
        model: FAL_REALTIME_APP,
        token_endpoint: "api/fal/realtime-token",
        access_code_required: true,
      },
      local: { available: false },
      preview: { available: true },
    },
  };
}

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  return response.status(200).json(healthPayload(process.env));
}
