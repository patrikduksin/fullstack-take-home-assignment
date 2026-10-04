import { test as base } from "@e2e-dev/web";
import { Data, Effect, Schedule, Schema } from "effect";

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

class BrowserApiFailure extends Data.TaggedError("BrowserApiFailure")<{
  coldPlaceholder: boolean;
  message: string;
}> {}

export const test = base.extend<{ backendReady: boolean }>({
  // @effect-diagnostics-next-line asyncFunction:off -- E2E fixtures use Promises for setup and test execution.
  backendReady: async ({ app, browser }, use) => {
    await app.open("/openapi.json");
    await Effect.runPromise(
      Effect.gen(function* readyBrowserApi() {
        const response = yield* Effect.tryPromise({
          catch: () =>
            new BrowserApiFailure({
              coldPlaceholder: false,
              message: "Could not request the OpenAPI schema from Chromium.",
            }),
          // @effect-diagnostics-next-line asyncFunction:off -- The e2e browser bridge returns a Promise.
          try: async () =>
            await browser.evaluate(
              // @effect-diagnostics-next-line asyncFunction:off -- This callback executes in Chromium's browser context.
              async () => {
                // @effect-diagnostics-next-line globalFetch:off -- The test worker HttpClient is unavailable inside Chromium.
                const result = await fetch("/openapi.json", {
                  cache: "no-store",
                });

                return {
                  body: await result.text(),
                  contentType: result.headers.get("content-type") ?? "",
                  status: result.status,
                };
              }
            ),
        });

        if (
          response.status === 200 &&
          response.contentType.includes("application/json")
        ) {
          return yield* Schema.decodeEffect(sessionsApi)(response.body).pipe(
            Effect.mapError(
              () =>
                new BrowserApiFailure({
                  coldPlaceholder: false,
                  message:
                    "The OpenAPI schema does not declare session creation.",
                })
            )
          );
        }

        return yield* new BrowserApiFailure({
          coldPlaceholder:
            (response.status === 200 || response.status === 404) &&
            response.contentType.includes("text/html") &&
            response.body.includes("<title>Page not found</title>") &&
            response.body.includes("There is nothing here yet"),
          message: `Browser API readiness returned HTTP ${response.status} (${response.contentType}).`,
        });
      }).pipe(
        Effect.retry({
          schedule: Schedule.spaced("1 second"),
          while: (failure) => failure.coldPlaceholder,
        }),
        Effect.timeout("60 seconds")
      )
    );
    await use(true);
  },
});
