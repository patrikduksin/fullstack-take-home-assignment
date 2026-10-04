import { FunnelError, SessionViewSchema } from "@core/core/contracts";
import type { FunnelSession } from "@core/core/contracts";
import { FunnelSessions } from "@core/core/funnel/session";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Schema } from "effect";

const stored = <A, E>(
  effect: Effect.Effect<A, E, RuntimeContext.RuntimeContext>
) =>
  effect.pipe(
    Effect.catchCause(() =>
      Effect.fail(
        new FunnelError({
          message: "Could not persist your session. Please try again.",
        })
      )
    ),
    Effect.provide(RuntimeContext.RuntimeContext.phantom)
  );

export const d1FunnelSessions = (
  database: Cloudflare.D1.QueryDatabaseClient
): FunnelSessions["Service"] => {
  const load = Effect.fn("FunnelSessions.load")(function* load(id: string) {
    const row = yield* stored(
      database
        .prepare(
          "SELECT json_object('session', json(s.state), 'configuration', json(v.configuration)) AS view FROM funnel_sessions s JOIN funnel_versions v ON v.version = s.version WHERE s.id = ?"
        )
        .bind(id)
        .first<{ view: string }>()
    );

    if (row === null) {
      return yield* new FunnelError({
        message: "Your saved session could not be found. Start a new session.",
      });
    }

    return yield* Schema.decodeEffect(Schema.fromJsonString(SessionViewSchema))(
      row.view
    ).pipe(
      Effect.mapError(
        () =>
          new FunnelError({ message: "Your saved session could not be read." })
      )
    );
  });

  const create = Effect.gen(function* create() {
    const row = yield* stored(
      database
        .prepare(`WITH seed AS (SELECT lower(hex(randomblob(16))) AS id)
      INSERT INTO funnel_sessions(id, version, variant, state)
      SELECT seed.id, v.version, 'A', json_object('id', seed.id, 'version', v.version, 'variant', 'A',
        'currentStep', json_extract(v.configuration, '$.start'), 'answers', json('{}'), 'history', json('[]'), 'routeRevision', 0)
      FROM seed, funnel_active a JOIN funnel_versions v ON v.version = a.version WHERE a.singleton = 1
      RETURNING id`)
        .first<{ id: string }>()
    );

    if (row === null) {
      return yield* new FunnelError({
        message: "No funnel configuration is active.",
      });
    }

    return yield* load(row.id);
  });

  const save = Effect.fn("FunnelSessions.save")(function* save(
    session: FunnelSession
  ) {
    yield* stored(
      database
        .prepare(
          "UPDATE funnel_sessions SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(JSON.stringify(session), session.id)
        .run()
    );
  });

  return FunnelSessions.of({ create, load, save });
};
