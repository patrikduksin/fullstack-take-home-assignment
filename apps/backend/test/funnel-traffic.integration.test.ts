import { AnalyticsReportSchema } from "@core/core/contracts";
import { expect } from "@effect/vitest";
import { Console, Effect, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

const reportSchema = Schema.fromJsonString(
  Schema.Struct({
    acceptedAt: Schema.String,
    campaigns: Schema.Struct({ direct: Schema.String, explore: Schema.String }),
    conflictingIdRejected: Schema.Boolean,
    direct: AnalyticsReportSchema,
    explore: AnalyticsReportSchema,
    matched: Schema.Boolean,
    replayedSessions: Schema.Int,
    restoredVersion: Schema.String,
    sessionsCreated: Schema.Int,
    summary: Schema.Struct({
      ctaClickers: Schema.Int,
      resultReached: Schema.Int,
      started: Schema.Int,
    }),
    versions: Schema.Struct({ camp: Schema.String, trail: Schema.String }),
  })
);

test(
  "runs the seeded CLI through real endpoints, matches literal 120-session metrics and restores the active version",
  Effect.gen(function* trafficAcceptance() {
    const { websiteUrl } = yield* stack;
    const url = yield* Schema.decodeUnknownEffect(Schema.String)(websiteUrl);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const handle = yield* spawner.spawn(
      ChildProcess.make(
        "pnpm",
        ["exec", "tsx", "scripts/funnel-traffic.ts", url, "--seed", "20261004"],
        {
          cwd: new URL("../../../", import.meta.url).pathname,
          stderr: "inherit",
        }
      )
    );

    const result = yield* Effect.all(
      {
        exitCode: handle.exitCode,
        output: Stream.mkString(handle.stdout.pipe(Stream.decodeText())),
      },
      { concurrency: "unbounded" }
    );

    yield* Console.log("TRAFFIC_REPORT_JSON", result.output);

    expect(result.exitCode).toBe(0);

    const report = yield* Schema.decodeEffect(reportSchema)(result.output);

    expect(report.sessionsCreated).toBe(120);
    expect(report.summary).toEqual({
      ctaClickers: 40,
      resultReached: 56,
      started: 120,
    });
    expect(report.explore.summary).toEqual({
      ctaClickers: 24,
      ctaCtr: 3 / 4,
      resultReachRate: 2 / 5,
      resultReached: 32,
      resultViewers: 32,
      started: 80,
    });
    expect(report.direct.summary).toEqual({
      ctaClickers: 16,
      ctaCtr: 2 / 3,
      resultReachRate: 3 / 5,
      resultReached: 24,
      resultViewers: 24,
      started: 40,
    });
    expect(report.restoredVersion).toBe("trail-branches-v1");
    expect(report.replayedSessions).toBe(120);
    expect(report.conflictingIdRejected).toBe(true);
    expect(report.matched).toBe(true);

    const trailB = report.explore.cohorts.find(
      (cohort) =>
        cohort.version === report.versions.trail && cohort.variant === "B"
    );

    expect(
      trailB?.steps
        .map(({ stepId, viewers, completers }) => [stepId, viewers, completers])
        .toSorted()
    ).toEqual([
      ["hours", 17, 14],
      ["interests", 8, 8],
      ["pace", 14, 14],
      ["prepare", 8, 8],
      ["result", 8, 0],
      ["supplies", 8, 5],
      ["welcome", 20, 17],
    ]);
    expect(
      trailB?.edges.find(
        (edge) =>
          edge.sourceStepId === "pace" && edge.targetStepId === "interests"
      )
    ).toMatchObject({
      conversionRate: 4 / 7,
      converted: 4,
      dropOff: 3,
      eligible: 7,
    });

    const campA = report.direct.cohorts.find(
      (cohort) =>
        cohort.version === report.versions.camp && cohort.variant === "A"
    );

    expect(
      campA?.steps.find((step) => step.stepId === "waterside")
    ).toMatchObject({ completers: 3, dropOff: 1, viewers: 4 });
    expect(
      campA?.edges.find(
        (edge) =>
          edge.sourceStepId === "interests" && edge.targetStepId === "hours"
      )
    ).toMatchObject({ converted: 4, dropOff: 1, eligible: 5 });
  }).pipe(Effect.scoped),
  { timeout: 600_000 }
);
