import { FunnelError } from "@core/core/contracts";
import {
  AnalyticsSnapshotSchema,
  FunnelAnalytics,
} from "@core/core/funnel/analytics";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Schema } from "effect";

export const d1FunnelAnalytics = (
  database: Cloudflare.D1.QueryDatabaseClient
): FunnelAnalytics["Service"] => {
  const snapshot = Effect.fn("FunnelAnalytics.snapshot")(function* snapshot() {
    const row = yield* database
      .prepare(`SELECT json_object(
      'capturedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      'configurations', json((SELECT json_group_array(json(configuration)) FROM funnel_versions)),
      'events', json((SELECT json_group_array(json_object(
        'eventId', event_id, 'type', type, 'sessionId', session_id,
        'clientTimestamp', client_timestamp, 'serverTimestamp', server_timestamp,
        'version', version, 'variant', variant, 'stepId', step_id,
        'utm', json(utm), 'properties', json(properties))) FROM funnel_events))) AS snapshot`)
      .first<{ snapshot: string }>()
      .pipe(
        Effect.catchCause(() =>
          Effect.fail(
            new FunnelError({
              message: "Could not read analytics. Please try again.",
            })
          )
        ),
        Effect.provide(RuntimeContext.RuntimeContext.phantom)
      );

    if (row === null) {
      return yield* new FunnelError({
        message: "The analytics snapshot is unavailable.",
      });
    }

    return yield* Schema.decodeEffect(
      Schema.fromJsonString(AnalyticsSnapshotSchema)
    )(row.snapshot).pipe(
      Effect.mapError(
        () =>
          new FunnelError({
            message: "The analytics snapshot could not be read.",
          })
      )
    );
  });

  return FunnelAnalytics.of({ snapshot });
};
