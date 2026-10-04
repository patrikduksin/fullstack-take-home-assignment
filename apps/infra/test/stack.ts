import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import { Data, Effect, Random, Schedule, Schema } from "effect";
import { HttpClient } from "effect/http";

import Stack from "../alchemy.run.js";

class DocumentNotReady extends Data.TaggedError("DocumentNotReady")<{
  coldPlaceholder?: boolean;
  message: string;
}> {}

const sessionsApi = Schema.fromJsonString(
  Schema.Struct({
    paths: Schema.Struct({
      "/api/sessions": Schema.Struct({
        post: Schema.Struct({
          responses: Schema.Record(Schema.String, Schema.Unknown),
        }),
      }),
    }),
  })
);

export const makeTestStack = () => {
  const suffix = Effect.runSync(
    Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
  ).toString(36);

  const stage = `${process.env.ALCHEMY_TEST_STAGE ?? "test"}-${suffix}`;

  const api = Test.make({
    dev: false,
    providers: Cloudflare.providers(),
    stage,
    state: Cloudflare.state(),
  });

  const stack = api.beforeAll(
    Effect.gen(function* readyStack() {
      const deployed = yield* api.deploy(Stack);

      yield* Effect.gen(function* readyHomepage() {
        // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy exposes transient readiness errors as unknown; bounded retries surface them as test defects.
        const homepage = yield* Test.getWhenReady(`${deployed.websiteUrl}/`, {
          times: 0,
        });

        const html = yield* homepage.text;

        if (
          homepage.status !== 200 ||
          !html.includes("<title>Funnel Runtime</title>")
        ) {
          return yield* new DocumentNotReady({
            message: "The deployed application document is not ready.",
          });
        }

        return html;
      }).pipe(
        Effect.retry({ schedule: Schedule.spaced("1 second"), times: 60 }),
        Effect.orDie
      );

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

      yield* Effect.gen(function* readySessionApi() {
        const response = yield* HttpClient.get(
          `${deployed.websiteUrl}/openapi.json`,
          {
            headers: { "cache-control": "no-cache" },
          }
        );

        const body = yield* response.text;
        const contentType = response.headers["content-type"] ?? "";

        if (
          response.status === 200 &&
          contentType.includes("application/json")
        ) {
          return yield* Schema.decodeEffect(sessionsApi)(body).pipe(
            Effect.mapError(
              () =>
                new DocumentNotReady({
                  coldPlaceholder: false,
                  message:
                    "The OpenAPI schema does not declare session creation.",
                })
            )
          );
        }

        return yield* new DocumentNotReady({
          coldPlaceholder:
            (response.status === 200 || response.status === 404) &&
            contentType.includes("text/html") &&
            body.includes("<title>Page not found</title>") &&
            body.includes("There is nothing here yet"),
          message: `Session API readiness returned HTTP ${response.status} (${contentType}).`,
        });
      }).pipe(
        Effect.retry({
          schedule: Schedule.spaced("1 second"),
          while: (failure) =>
            failure instanceof DocumentNotReady &&
            failure.coldPlaceholder === true,
        }),
        Effect.timeout("60 seconds"),
        Effect.orDie
      );

      return deployed;
    }),
    { timeout: 600_000 }
  );

  api.afterAll(api.destroy(Stack), { timeout: 600_000 });

  return { stack, stage, test: api.test };
};
