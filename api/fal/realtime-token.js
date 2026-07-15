import { createRealtimeTokenResult } from "../../server/fal-auth.js";

export function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return response.status(405).json({ error: "Method not allowed." });
    }

    const result = await createRealtimeTokenResult(request, { env, fetchImpl });
    return response.status(result.status).json(result.body);
  };
}

export default createHandler();
