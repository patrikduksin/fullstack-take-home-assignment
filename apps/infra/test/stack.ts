import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Random } from "effect";

import Stack from "../alchemy.run.js";

export const makeTestStack = () => {
  const suffix = Effect.runSync(
    Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
  ).toString(36);

  const api = Test.make({
    dev: false,
    providers: Cloudflare.providers(),
    stage: `${process.env.ALCHEMY_TEST_STAGE ?? "test"}-${suffix}`,
    state: Cloudflare.state(),
  });

  const stack = api.beforeAll(
    Effect.gen(function* readyStack() {
      const deployed = yield* api.deploy(Stack);

      // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy readiness failures become test defects before tests begin.
      const health = yield* Test.getWhenReady(
        `${deployed.websiteUrl}/api/health`
      ).pipe(Effect.orDie);

      if (health.status !== 200) {
        return yield* Effect.die(
          new Error("The deployed database is not ready.")
        );
      }

      // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- This read-only request waits for the independent MCP Durable Object binding.
      const mcp = yield* Test.getWhenReady(`${deployed.websiteUrl}/mcp`).pipe(
        Effect.orDie
      );

      if (mcp.status !== 405) {
        return yield* Effect.die(
          new Error("The deployed MCP route is not ready.")
        );
      }

      return deployed;
    }),
    { timeout: 600_000 }
  );

  api.afterAll(api.destroy(Stack), { timeout: 600_000 });

  return { stack, test: api.test };
};
