import { FunnelError, StoredFunnelEventSchema } from "@core/core/contracts";
import { FunnelEvents } from "@core/core/funnel/events";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Schema } from "effect";

export const d1FunnelEvents = (
  database: Cloudflare.D1.QueryDatabaseClient
): FunnelEvents["Service"] => {
  const forSession = Effect.fn("FunnelEvents.forSession")(function* forSession(
    id: string
  ) {
    const rows = yield* database
      .prepare(
        "SELECT json_object('eventId', event_id, 'type', type, 'sessionId', session_id, 'clientTimestamp', client_timestamp, 'serverTimestamp', server_timestamp, 'version', version, 'variant', variant, 'stepId', step_id, 'utm', json(utm), 'properties', json(properties)) AS event FROM funnel_events WHERE session_id = ? ORDER BY server_timestamp, event_id"
      )
      .bind(id)
      .all<{ event: string }>()
      .pipe(
        Effect.catchCause(() =>
          Effect.fail(
            new FunnelError({ message: "Could not read funnel events." })
          )
        ),
        Effect.provide(RuntimeContext.RuntimeContext.phantom)
      );

    return yield* Effect.all(
      rows.results.map((row) =>
        Schema.decodeEffect(Schema.fromJsonString(StoredFunnelEventSchema))(
          row.event
        )
      )
    ).pipe(
      Effect.mapError(
        () =>
          new FunnelError({
            message: "Stored funnel events could not be read.",
          })
      )
    );
  });

  return FunnelEvents.of({ forSession });
};
