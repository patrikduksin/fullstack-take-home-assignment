import { FunnelError, SessionViewSchema } from "@core/core/contracts";
import type { CreateSessionInput, FunnelSession } from "@core/core/contracts";
import { resolveVariant } from "@core/core/funnel/configuration";
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

    const view = yield* Schema.decodeEffect(
      Schema.fromJsonString(SessionViewSchema)
    )(row.view).pipe(
      Effect.mapError(
        () =>
          new FunnelError({ message: "Your saved session could not be read." })
      )
    );

    return {
      ...view,
      configuration: resolveVariant(view.configuration, view.session.variant),
    };
  });

  const create = Effect.fn("FunnelSessions.create")(function* create(
    input: CreateSessionInput
  ) {
    const row = yield* stored(
      database
        .prepare(`WITH seed AS MATERIALIZED (SELECT lower(hex(randomblob(16))) AS id, COALESCE(?, CASE WHEN random() < 0 THEN 'A' ELSE 'B' END) AS variant)
      INSERT INTO funnel_sessions(id, version, variant, state)
      SELECT seed.id, v.version, seed.variant, json_object('id', seed.id, 'version', v.version, 'variant', seed.variant,
        'currentStep', COALESCE(json_extract(v.configuration, '$.variants.' || seed.variant || '.start'), json_extract(v.configuration, '$.start')), 'answers', json('{}'), 'history', json('[]'), 'routeRevision', 0)
      FROM seed, funnel_active a JOIN funnel_versions v ON v.version = a.version WHERE a.singleton = 1
      RETURNING id`)
        .bind(input.variant ?? null)
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
