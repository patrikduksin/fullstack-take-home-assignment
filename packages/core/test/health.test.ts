import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { DatabaseUnavailable } from "../src/contracts.js";
import { Database, health } from "../src/index.js";

it.effect("returns readiness after a database query succeeds", () =>
  Effect.gen(function* healthyDatabase() {
    const result = yield* health
      .handler({})
      .pipe(Effect.provideService(Database, { check: Effect.void }));

    expect(result).toEqual({ database: "ready", status: "ok" });
  })
);

it.effect("preserves the declared database failure", () =>
  Effect.gen(function* unavailableDatabase() {
    const failure = new DatabaseUnavailable({ message: "Database offline" });

    const result = yield* health
      .handler({})
      .pipe(
        Effect.provideService(Database, { check: Effect.fail(failure) }),
        Effect.flip
      );

    expect(result).toEqual(failure);
  })
);
