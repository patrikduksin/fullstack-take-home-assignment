import { implement } from "@core/capability/implement";
import { Context, Effect } from "effect";

import { validateConfiguration } from "./configuration.js";
import type { FunnelConfiguration } from "./configuration.js";
import {
  listVersionsContract,
  publishVersionContract,
  rollbackVersionContract,
  VersionError,
} from "./version-contracts.js";
import type { VersionState } from "./version-contracts.js";

export class FunnelVersions extends Context.Service<
  FunnelVersions,
  {
    readonly list: Effect.Effect<VersionState, VersionError>;
    readonly publish: (
      configuration: FunnelConfiguration
    ) => Effect.Effect<VersionState, VersionError>;
    readonly rollback: Effect.Effect<VersionState, VersionError>;
  }
>()("@core/core/funnel/FunnelVersions") {}

const listVersions = implement(listVersionsContract, () =>
  FunnelVersions.use((versions) => versions.list)
);

const publishVersion = implement(
  publishVersionContract,
  Effect.fn("publishVersion")(function* publishVersion(input) {
    const configuration = yield* validateConfiguration(
      input.configuration
    ).pipe(
      Effect.mapError((error) => new VersionError({ message: error.message }))
    );

    const versions = yield* FunnelVersions;

    return yield* versions.publish(configuration);
  })
);

const rollbackVersion = implement(rollbackVersionContract, () =>
  FunnelVersions.use((versions) => versions.rollback)
);

export const funnelVersionCapabilities = [
  listVersions,
  publishVersion,
  rollbackVersion,
] as const;
