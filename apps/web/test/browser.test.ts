import { expect } from "@effect/vitest";
import { Effect } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

test(
  "passes browser journeys against the Alchemy test stack",
  Effect.gen(function* browser() {
    const { websiteUrl } = yield* stack;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const processHandle = yield* spawner.spawn(
      ChildProcess.make("pnpm", ["exec", "e2e", "run"], {
        cwd: new URL("../", import.meta.url).pathname,
        env: { APP_URL: websiteUrl },
        extendEnv: true,
        stderr: "inherit",
        stdout: "inherit",
      })
    );

    expect(yield* processHandle.exitCode).toBe(0);
  }).pipe(Effect.scoped),
  { timeout: 180_000 }
);
