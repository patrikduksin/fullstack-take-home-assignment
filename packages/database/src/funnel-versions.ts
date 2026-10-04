import { VersionError, VersionStateSchema } from "@core/core/contracts";
import type { FunnelConfiguration } from "@core/core/contracts";
import { FunnelVersions } from "@core/core/funnel/versions";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Schema } from "effect";

const stored = <A, E>(
  effect: Effect.Effect<A, E, RuntimeContext.RuntimeContext>,
  message: string
) =>
  effect.pipe(
    Effect.catchCause(() => Effect.fail(new VersionError({ message }))),
    Effect.provide(RuntimeContext.RuntimeContext.phantom)
  );

export const d1FunnelVersions = (
  database: Cloudflare.D1.QueryDatabaseClient
): FunnelVersions["Service"] => {
  const list = Effect.gen(function* listVersions() {
    const row = yield* stored(
      database
        .prepare(`SELECT json_object(
      'activeVersion', (SELECT version FROM funnel_active WHERE singleton = 1),
      'versions', json((SELECT json_group_array(json_object('version', version, 'name', json_extract(configuration, '$.name'), 'createdAt', created_at))
        FROM (SELECT * FROM funnel_versions ORDER BY created_at DESC, version))),
      'history', json((SELECT json_group_array(json_object('sequence', sequence, 'version', version, 'previousVersion', previous_version, 'kind', kind, 'activatedAt', activated_at))
        FROM (SELECT * FROM funnel_activations ORDER BY sequence DESC)))
    ) AS state`)
        .first<{ state: string }>(),
      "Could not load version history. Please try again."
    );

    if (row === null) {
      return yield* new VersionError({
        message: "No active funnel version is available.",
      });
    }

    return yield* Schema.decodeEffect(
      Schema.fromJsonString(VersionStateSchema)
    )(row.state).pipe(
      Effect.mapError(
        () => new VersionError({ message: "Could not read version history." })
      )
    );
  });

  const publish = Effect.fn("FunnelVersions.publish")(function* publish(
    configuration: FunnelConfiguration
  ) {
    const existing = yield* stored(
      database
        .prepare("SELECT version FROM funnel_versions WHERE version = ?")
        .bind(configuration.id)
        .first<{ version: string }>(),
      "Could not check this version ID. Please try again."
    );

    if (existing !== null) {
      return yield* new VersionError({
        message:
          "This version ID is already published. Choose a new ID; published versions are immutable.",
      });
    }

    yield* stored(
      database.batch([
        database
          .prepare(
            "INSERT INTO funnel_versions(version, configuration) VALUES (?, ?)"
          )
          .bind(configuration.id, JSON.stringify(configuration)),
        database
          .prepare(
            "INSERT INTO funnel_activations(version, previous_version, kind) SELECT ?, version, 'publish' FROM funnel_active WHERE singleton = 1"
          )
          .bind(configuration.id),
      ]),
      "Could not publish this version. Its ID may already be published. No changes were applied."
    );

    return yield* list;
  });

  const rollback = Effect.gen(function* rollbackVersion() {
    const row = yield* stored(
      database
        .prepare(`INSERT INTO funnel_activations(version, previous_version, kind)
      SELECT previous_version, version, 'rollback' FROM funnel_activations
      WHERE sequence = (SELECT MAX(sequence) FROM funnel_activations) AND previous_version IS NOT NULL
      RETURNING sequence`)
        .first<{ sequence: number }>(),
      "Could not roll back this version. Please try again."
    );

    if (row === null) {
      return yield* new VersionError({
        message: "There is no previous activation to roll back to.",
      });
    }

    return yield* list;
  });

  return FunnelVersions.of({ list, publish, rollback });
};
