import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import trail from "../../../configurations/iteration-one/trail.json" with { type: "json" };
import { aggregateAnalytics } from "../src/funnel/analytics.js";
import { validateConfiguration } from "../src/funnel/configuration.js";
import type { StoredFunnelEvent } from "../src/funnel/contracts.js";

const event = (
  eventId: string,
  sessionId: string,
  type: string,
  stepId: string,
  seconds: string,
  properties: Record<string, string | number>
): StoredFunnelEvent => ({
  clientTimestamp: `2026-10-04T12:00:${seconds}.000Z`,
  eventId,
  properties,
  serverTimestamp: "2026-10-04T12:01:00.000Z",
  sessionId,
  stepId,
  type,
  utm: { campaign: "repeat-route" },
  variant: "A",
  version: "trail-branches-v1",
});

it.effect(
  "counts a revisited edge once when any historical revision has a subsequent target view",
  () =>
    Effect.gen(function* repeatedTransition() {
      const configuration = yield* validateConfiguration(trail);

      const events = [
        event("s1-first", "s1", "step_completed", "pace", "02", {
          nextStepId: "supplies",
          routeRevision: 1,
        }),
        event("s1-prior", "s1", "step_viewed", "supplies", "01", {
          routeRevision: 1,
        }),
        event("s1-wrong", "s1", "step_viewed", "supplies", "03", {
          routeRevision: 2,
        }),
        event("s1-revisit", "s1", "step_completed", "pace", "04", {
          nextStepId: "supplies",
          routeRevision: 3,
        }),
        event("s1-equal", "s1", "step_viewed", "supplies", "04", {
          routeRevision: 3,
        }),
        event("s1-repeat", "s1", "step_completed", "pace", "06", {
          nextStepId: "supplies",
          routeRevision: 3,
        }),
        event("s1-repeat-view", "s1", "step_viewed", "supplies", "05", {
          routeRevision: 3,
        }),
        event("s2-completion", "s2", "step_completed", "pace", "10", {
          nextStepId: "supplies",
          routeRevision: 1,
        }),
        event("s2-prior", "s2", "step_viewed", "supplies", "09", {
          routeRevision: 1,
        }),
      ];

      const snapshot = {
        capturedAt: "2026-10-04T12:02:00.000Z",
        configurations: [configuration],
        events,
      };

      const filter = {
        campaign: "repeat-route",
        variant: "A" as const,
        version: configuration.id,
      };

      const report = aggregateAnalytics(snapshot, filter);
      expect(
        report.cohorts[0]?.edges.find(
          (edge) =>
            edge.sourceStepId === "pace" && edge.targetStepId === "supplies"
        )
      ).toMatchObject({
        conversionRate: 0.5,
        converted: 1,
        dropOff: 1,
        eligible: 2,
      });
      expect(
        aggregateAnalytics({ ...snapshot, events: events.toReversed() }, filter)
      ).toEqual(report);
    })
);

it.effect(
  "compares variants within a version using distinct sessions across unequal campaign cohorts",
  () =>
    Effect.gen(function* campaignComparison() {
      const configuration = yield* validateConfiguration(trail);

      const events: StoredFunnelEvent[] = [
        {
          ...event("start-a", "s1", "session_started", "pace", "01", {}),
          stepId: null,
          utm: { campaign: "alpha" },
        },
        {
          ...event("start-b1", "s2", "session_started", "pace", "01", {}),
          stepId: null,
          utm: { campaign: "beta" },
        },
        {
          ...event("start-b2", "s3", "session_started", "pace", "01", {}),
          stepId: null,
          utm: { campaign: "beta" },
        },
        {
          ...event("result-a", "s1", "result_viewed", "result", "02", {
            routeRevision: 0,
          }),
          utm: { campaign: "alpha" },
        },
        {
          ...event("click-a", "s1", "cta_clicked", "result", "03", {
            routeRevision: 0,
          }),
          utm: { campaign: "alpha" },
        },
      ];

      const snapshot = {
        capturedAt: "2026-10-04T12:02:00.000Z",
        configurations: [configuration],
        events,
      };

      const report = aggregateAnalytics(snapshot, {
        variant: "A",
        version: configuration.id,
      });

      expect(report).toHaveProperty("comparisons");
      expect(report.comparisons[0]?.summary).toMatchObject({
        ctaClickers: 1,
        ctaCtr: 1,
        resultReachRate: 1 / 3,
        resultReached: 1,
        started: 3,
      });
      expect(
        aggregateAnalytics(snapshot, {
          campaign: "beta",
          variant: "A",
          version: configuration.id,
        }).comparisons[0]?.summary
      ).toMatchObject({
        ctaCtr: null,
        resultReachRate: 0,
        resultReached: 0,
        started: 2,
      });
    })
);
