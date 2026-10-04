import { FunnelError, StoredFunnelEventSchema } from "@core/core/contracts";
import type { FunnelEvent } from "@core/core/contracts";
import { canonicalEvent, FunnelEvents } from "@core/core/funnel/events";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Cause, Effect, Option, Schema } from "effect";

const eventJson =
  "json_object('eventId', event_id, 'type', type, 'sessionId', session_id, 'clientTimestamp', client_timestamp, 'serverTimestamp', server_timestamp, 'version', version, 'variant', variant, 'stepId', step_id, 'utm', json(utm), 'properties', json(properties))";

const decodeStoredEvent = Schema.decodeEffect(
  Schema.fromJsonString(StoredFunnelEventSchema)
);

const stored = <A, E>(
  operation: string,
  effect: Effect.Effect<A, E, RuntimeContext.RuntimeContext>
) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logError({
        operation,
        providerErrors: Cause.prettyErrors(cause).map((error) => ({
          code: Schema.decodeUnknownOption(
            Schema.Struct({ code: Schema.String })
          )(error).pipe(
            Option.map((provider) => provider.code),
            Option.getOrUndefined
          ),
          message: error.message.slice(0, 1000),
          name: error.name,
        })),
      }).pipe(
        Effect.andThen(
          Effect.fail(
            new FunnelError({
              message:
                "Could not persist funnel events. Please retry the batch.",
            })
          )
        )
      )
    ),
    Effect.provide(RuntimeContext.RuntimeContext.phantom)
  );

const readEvent = (json: string) =>
  decodeStoredEvent(json).pipe(
    Effect.mapError(
      () =>
        new FunnelError({
          message: "Stored funnel events could not be read.",
        })
    )
  );

export const d1FunnelEvents = (
  database: Cloudflare.D1.QueryDatabaseClient
): FunnelEvents["Service"] => {
  const append = Effect.fn("FunnelEvents.append")(function* append(
    event: FunnelEvent
  ) {
    const inserted = yield* stored(
      "insert-funnel-event",
      database
        .prepare(
          `INSERT INTO funnel_events(event_id, type, session_id, client_timestamp, version, variant, step_id, utm, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING RETURNING ${eventJson} AS event`
        )
        .bind(
          event.eventId,
          event.type,
          event.sessionId,
          event.clientTimestamp,
          event.version,
          event.variant,
          event.stepId,
          JSON.stringify(event.utm),
          JSON.stringify(event.properties)
        )
        .first<{ event: string }>()
    );

    if (inserted !== null) {
      const saved = yield* readEvent(inserted.event);

      return {
        eventId: saved.eventId,
        serverTimestamp: saved.serverTimestamp,
        status: "accepted" as const,
      };
    }

    const original = yield* stored(
      "load-original-funnel-event",
      database
        .prepare(
          `SELECT ${eventJson} AS event FROM funnel_events WHERE event_id = ?`
        )
        .bind(event.eventId)
        .first<{ event: string }>()
    );

    if (original === null) {
      return yield* new FunnelError({
        message:
          "The original event could not be found. Please retry the batch.",
      });
    }

    const saved = yield* readEvent(original.event);

    if (canonicalEvent(saved) !== canonicalEvent(event)) {
      return {
        error: "This event ID was already used with different content.",
        eventId: event.eventId,
        status: "rejected" as const,
      };
    }

    return {
      eventId: saved.eventId,
      serverTimestamp: saved.serverTimestamp,
      status: "duplicate" as const,
    };
  });

  const forSession = Effect.fn("FunnelEvents.forSession")(function* forSession(
    id: string
  ) {
    const rows = yield* stored(
      "load-session-funnel-events",
      database
        .prepare(
          `SELECT ${eventJson} AS event FROM funnel_events WHERE session_id = ? ORDER BY server_timestamp, event_id`
        )
        .bind(id)
        .all<{ event: string }>()
    );

    return yield* Effect.all(rows.results.map((row) => readEvent(row.event)));
  });

  return FunnelEvents.of({ append, forSession });
};
