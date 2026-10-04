import { expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { makeTestStack } from "../../infra/test/stack.js";
import { seedBrowserAnalytics } from "./fixtures/analytics.js";

const { stack, test } = makeTestStack();

test(
  "passes browser journeys against the Alchemy test stack",
  Effect.gen(function* browser() {
    const { websiteUrl } = yield* stack;

    const url = yield* Schema.decodeUnknownEffect(Schema.String)(websiteUrl);

    const fixture = yield* seedBrowserAnalytics(url);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const processHandle = yield* spawner.spawn(
      ChildProcess.make("pnpm", ["exec", "e2e", "run"], {
        cwd: new URL("../", import.meta.url).pathname,
        env: {
          ANALYTICS_TEST_V1: fixture.originalVersion,
          ANALYTICS_TEST_V2: fixture.nextVersion,
          APP_URL: url,
        },
        extendEnv: true,
        stderr: "inherit",
        stdout: "inherit",
      })
    );

    expect(yield* processHandle.exitCode).toBe(0);
  }).pipe(Effect.scoped),
  { timeout: 180_000 }
);
