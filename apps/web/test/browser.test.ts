import { expect } from "@effect/vitest";
import { Console, Effect, FileSystem, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { runTraffic } from "../../../scripts/funnel-traffic.js";
import { makeTestStack } from "../../infra/test/stack.js";
import { seedBrowserAnalytics } from "./fixtures/analytics.js";

const { stack, test } = makeTestStack();

const runBrowserJourneys = Effect.fn("runBrowserJourneys")(
  function* runBrowserJourneys(
    selection: string[],
    output: string,
    expectedPassed: number,
    env: Record<string, string>
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const processHandle = yield* spawner.spawn(
      ChildProcess.make(
        "pnpm",
        ["exec", "e2e", "run", ...selection, "--output", output],
        {
          cwd: new URL("../", import.meta.url).pathname,
          env,
          extendEnv: true,
          stderr: "inherit",
          stdout: "inherit",
        }
      )
    );

    expect(yield* processHandle.exitCode).toBe(0);
    const fs = yield* FileSystem.FileSystem;

    const report = yield* fs
      .readFileString(
        new URL(`../${output}/report.json`, import.meta.url).pathname
      )
      .pipe(
        Effect.flatMap(
          Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                run: Schema.Struct({
                  summary: Schema.Struct({
                    failed: Schema.Int,
                    flaky: Schema.Int,
                    passed: Schema.Int,
                    skipped: Schema.Int,
                  }),
                }),
              })
            )
          )
        )
      );

    yield* Console.log(
      `Browser evidence ${output}: ${JSON.stringify(report.run.summary)}`
    );
    expect(report.run.summary).toEqual({
      failed: 0,
      flaky: 0,
      passed: expectedPassed,
      skipped: 0,
    });
  }
);

test(
  "passes browser journeys and verifies seeded traffic on the same real stack",
  Effect.gen(function* browser() {
    const { websiteUrl } = yield* stack;
    const url = yield* Schema.decodeUnknownEffect(Schema.String)(websiteUrl);
    const fixture = yield* seedBrowserAnalytics(url);

    yield* runBrowserJourneys([], ".e2e/initial", 13, {
      ANALYTICS_TEST_V1: fixture.originalVersion,
      ANALYTICS_TEST_V2: fixture.nextVersion,
      APP_URL: url,
      TRAFFIC_EXPLORE: "",
    });

    const traffic = yield* runTraffic(url, 20_261_004);
    yield* Console.log(
      `TRAFFIC_BROWSER_REPORT_JSON ${JSON.stringify(traffic)}`
    );
    yield* runBrowserJourneys(["test/e2e/traffic.e2e.ts"], ".e2e/traffic", 1, {
      APP_URL: url,
      TRAFFIC_CAMP: traffic.versions.camp,
      TRAFFIC_DIRECT: traffic.campaigns.direct,
      TRAFFIC_EXPLORE: traffic.campaigns.explore,
      TRAFFIC_TRAIL: traffic.versions.trail,
    });
  }).pipe(Effect.scoped),
  { timeout: 600_000 }
);
