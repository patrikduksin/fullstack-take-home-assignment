import { env } from "cloudflare:workers";

// @effect-diagnostics-next-line asyncFunction:off -- Cloudflare service bindings return Promises at this transport boundary.
export const backend = async (request: Request): Promise<Response> =>
  await env.BACKEND.fetch(request);
