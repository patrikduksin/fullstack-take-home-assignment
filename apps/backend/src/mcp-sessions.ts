import { d1DatabaseLayer } from "@core/database/d1";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";

import { mcpRoutes } from "./routes.js";

export class McpSessions extends Cloudflare.DurableObject<McpSessions>()(
  "CoreMcpSessions",
  Effect.gen(function* bindMcpDatabase() {
    const services = yield* Layer.build(
      Layer.mergeAll(d1DatabaseLayer, Etag.layerWeak, HttpPlatform.layer)
    );

    // @effect-diagnostics-next-line returnEffectInGen:off -- Alchemy constructs a separate runtime for each Durable Object instance.
    return Effect.gen(function* makeMcpSessions() {
      const fetch = yield* HttpRouter.toHttpEffect(
        mcpRoutes.pipe(Layer.provide(Layer.succeedContext(services)))
      ).pipe(Effect.orDie);

      return { fetch };
    });
  })
) {}
