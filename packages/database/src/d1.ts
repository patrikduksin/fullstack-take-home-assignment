import { Database } from "@core/core";
import { DatabaseUnavailable } from "@core/core/contracts";
import { FunnelAnalytics } from "@core/core/funnel/analytics";
import { FunnelEvents } from "@core/core/funnel/events";
import { FunnelSessions } from "@core/core/funnel/session";
import { FunnelVersions } from "@core/core/funnel/versions";
import * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Layer } from "effect";

import { d1FunnelAnalytics } from "./funnel-analytics.js";
import { d1FunnelEvents } from "./funnel-events.js";
import { d1FunnelSessions } from "./funnel-sessions.js";
import { d1FunnelVersions } from "./funnel-versions.js";

export const d1DatabaseLayer = Layer.unwrap(
  Effect.gen(function* makeD1Database() {
    const resource = yield* Cloudflare.D1.Database("CoreDatabase", {
      migrations: new URL("../migrations", import.meta.url).pathname,
    });

    const database = yield* Cloudflare.D1.QueryDatabase(resource);

    return Layer.mergeAll(
      Layer.succeed(
        Database,
        Database.of({
          check: database
            .prepare("SELECT 1")
            .first()
            .pipe(
              Effect.asVoid,
              Effect.catchCause(() =>
                Effect.fail(
                  new DatabaseUnavailable({
                    message: "Could not query D1 database",
                  })
                )
              ),
              Effect.provide(RuntimeContext.RuntimeContext.phantom)
            ),
        })
      ),
      Layer.succeed(FunnelSessions, d1FunnelSessions(database)),
      Layer.succeed(FunnelEvents, d1FunnelEvents(database)),
      Layer.succeed(FunnelVersions, d1FunnelVersions(database)),
      Layer.succeed(FunnelAnalytics, d1FunnelAnalytics(database))
    );
  })
).pipe(Layer.provide(Cloudflare.D1.QueryDatabaseBinding));
