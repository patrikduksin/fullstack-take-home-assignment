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

  const stack = api.beforeAll(api.deploy(Stack), { timeout: 600_000 });
  api.afterAll(api.destroy(Stack), { timeout: 600_000 });

  return { stack, test: api.test };
};
