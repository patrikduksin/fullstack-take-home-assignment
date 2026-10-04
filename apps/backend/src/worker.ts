import { d1DatabaseLayer } from "@core/database/d1";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";

import { McpSessions } from "./mcp-sessions.js";
import { routes } from "./routes.js";

export default class Backend extends Cloudflare.Worker<Backend>()(
  "CoreBackend",
  {
    compatibility: { date: "2026-09-25" },
    main: import.meta.url,
    workersDev: false,
  },
  Effect.gen(function* makeBackend() {
    const sessions = yield* McpSessions;

    const fetch = yield* HttpRouter.toHttpEffect(
      Layer.merge(
        routes,
        HttpRouter.add("*", "/mcp", (request) =>
          sessions.getByName("sessions").fetch(request)
        )
      ).pipe(
        Layer.provide(d1DatabaseLayer),
        Layer.provide(Layer.merge(Etag.layerWeak, HttpPlatform.layer))
      )
    ).pipe(Effect.orDie);

    return { fetch };
  })
) {}
