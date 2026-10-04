import type { Answer, FunnelEvent, SessionView } from "@core/core/contracts";
import {
  AnalyticsReportSchema,
  ingestEventsContract,
  SessionViewSchema,
} from "@core/core/contracts";
import { expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import trail from "../../../configurations/iteration-one/trail.json" with { type: "json" };
import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

const decodeView = Schema.decodeUnknownEffect(SessionViewSchema);

const decodeReport = Schema.decodeUnknownEffect(AnalyticsReportSchema);

const event = (
  view: SessionView,
  label: string,
  type: string,
  stepId: string,
  time: number,
  properties: Record<string, number | string>
): FunnelEvent => ({
  clientTimestamp: `2026-10-04T12:00:${String(time).padStart(2, "0")}.000Z`,
  eventId: `${view.session.id}:${label}`,
  properties,
  sessionId: view.session.id,
  stepId,
  type,
  utm: view.session.utm,
  variant: view.session.variant,
  version: view.session.version,
});

test(
  "keeps exact cohort and historical branch metrics across replay and late arrival",
  Effect.gen(function* cohortAnalytics() {
    const { websiteUrl } = yield* stack;

    const create = Effect.fnUntraced(function* create(
      variant: string,
      campaign: string
    ) {
      const response = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
        body: HttpBody.jsonUnsafe({ utm: { campaign }, variant }),
      });

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeView));
    });

    const advance = Effect.fnUntraced(function* advance(
      view: SessionView,
      stepId: string,
      answer: Answer
    ) {
      const response = yield* HttpClient.post(
        `${websiteUrl}/api/sessions/${view.session.id}/advance`,
        { body: HttpBody.jsonUnsafe({ answer, stepId }) }
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeView));
    });

    const back = Effect.fnUntraced(function* back(view: SessionView) {
      const response = yield* HttpClient.post(
        `${websiteUrl}/api/sessions/${view.session.id}/back`,
        { body: HttpBody.jsonUnsafe({}) }
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeView));
    });

    const query = Effect.fnUntraced(function* query(search = "") {
      const response = yield* HttpClient.get(
        `${websiteUrl}/api/analytics${search}`
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeReport));
    });

    const send = Effect.fnUntraced(function* send(
      events: readonly FunnelEvent[]
    ) {
      const response = yield* HttpClient.post(`${websiteUrl}/api/events`, {
        body: HttpBody.jsonUnsafe({ events }),
      });

      expect(response.status).toBe(200);

      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ingestEventsContract.output))
      );
    });

    const s1 = yield* create("A", "alpha");
    const s4 = yield* create("B", "alpha");
    expect((yield* query("?campaign=alpha")).summary).toMatchObject({
      ctaClickers: 0,
      ctaCtr: null,
      resultReachRate: 0,
      resultReached: 0,
      resultViewers: 0,
      started: 2,
    });
    expect((yield* query("?campaign=missing")).summary).toMatchObject({
      ctaClickers: 0,
      ctaCtr: null,
      resultReachRate: null,
      resultReached: 0,
      resultViewers: 0,
      started: 0,
    });
    const s2 = yield* create("A", "alpha");
    const s3 = yield* create("A", "alpha");

    const published = yield* HttpClient.post(`${websiteUrl}/api/versions`, {
      body: HttpBody.jsonUnsafe({
        configuration: {
          ...trail,
          id: "analytics-comparison-v1",
          name: "Analytics comparison",
        },
      }),
    });

    expect(published.status).toBe(200);
    const s5 = yield* create("A", "beta");
    const s6 = yield* create("B", "beta");
    expect(s5.session.version).not.toBe(s1.session.version);

    yield* advance(s1, "welcome", null);
    yield* advance(s1, "pace", "active");
    yield* advance(s1, "supplies", "boots");
    yield* back(s1);
    yield* back(s1);
    const edited = yield* advance(s1, "pace", "gentle");
    expect(edited.session.routeRevision).toBe(2);
    expect(edited.session.answers.supplies).toBeUndefined();
    yield* advance(s1, "interests", ["forest"]);
    yield* advance(s1, "hours", 3);
    yield* advance(s1, "prepare", null);
    yield* advance(s2, "welcome", null);
    yield* advance(s2, "pace", "active");
    yield* advance(s2, "supplies", "boots");
    yield* advance(s2, "interests", ["forest"]);
    yield* advance(s2, "hours", 3);
    yield* advance(s2, "prepare", null);
    yield* advance(s3, "welcome", null);
    yield* advance(s3, "pace", "gentle");
    yield* advance(s3, "interests", ["forest"]);
    yield* advance(s3, "hours", 3);
    yield* advance(s3, "prepare", null);

    for (const view of [s4, s6]) {
      yield* advance(view, "welcome", null);
      yield* advance(view, "hours", 3);
      yield* advance(view, "pace", "gentle");
      yield* advance(view, "interests", ["forest"]);
      yield* advance(view, "prepare", null);
    }

    const views = [
      event(s1, "pace-view", "step_viewed", "pace", 1, { routeRevision: 0 }),
      event(s1, "pace-repeat", "step_viewed", "pace", 2, { routeRevision: 0 }),
      event(s1, "supplies-view", "step_viewed", "supplies", 11, {
        routeRevision: 1,
      }),
      event(s1, "interests-old", "step_viewed", "interests", 13, {
        routeRevision: 1,
      }),
      event(s1, "interests-equal", "step_viewed", "interests", 20, {
        routeRevision: 2,
      }),
      event(s1, "hours-view", "step_viewed", "hours", 22, { routeRevision: 2 }),
      event(s2, "pace-view", "step_viewed", "pace", 1, { routeRevision: 0 }),
      event(s2, "supplies-earlier", "step_viewed", "supplies", 29, {
        routeRevision: 1,
      }),
      event(s2, "supplies-wrong-revision", "step_viewed", "supplies", 31, {
        routeRevision: 0,
      }),
      event(s3, "pace-view", "step_viewed", "pace", 1, { routeRevision: 0 }),
    ];

    expect(
      (yield* send(views)).results.map((receipt) => receipt.status)
    ).toEqual(Array.from({ length: 10 }, () => "accepted"));

    const actions = [
      event(s1, "active-transition", "step_completed", "pace", 10, {
        nextStepId: "supplies",
        routeRevision: 1,
      }),
      event(s1, "active-repeat", "step_completed", "pace", 10, {
        nextStepId: "supplies",
        routeRevision: 1,
      }),
      event(s1, "supplies-transition", "step_completed", "supplies", 12, {
        nextStepId: "interests",
        routeRevision: 1,
      }),
      event(s1, "gentle-transition", "step_completed", "pace", 20, {
        nextStepId: "interests",
        routeRevision: 2,
      }),
      event(s1, "interests-transition", "step_completed", "interests", 21, {
        nextStepId: "hours",
        routeRevision: 2,
      }),
      event(s1, "back-supplies", "back_clicked", "interests", 14, {
        routeRevision: 1,
        targetStepId: "supplies",
      }),
      event(s1, "back-pace", "back_clicked", "supplies", 15, {
        routeRevision: 1,
        targetStepId: "pace",
      }),
      event(s2, "active-transition", "step_completed", "pace", 30, {
        nextStepId: "supplies",
        routeRevision: 1,
      }),
      event(s1, "result", "result_viewed", "result", 40, { routeRevision: 2 }),
      event(s1, "result-repeat", "result_viewed", "result", 41, {
        routeRevision: 2,
      }),
      event(s1, "result-step", "step_viewed", "result", 40, {
        routeRevision: 2,
      }),
      event(s1, "cta", "cta_clicked", "result", 42, { routeRevision: 2 }),
      event(s1, "cta-repeat", "cta_clicked", "result", 43, {
        routeRevision: 2,
      }),
      event(s2, "result", "result_viewed", "result", 40, { routeRevision: 1 }),
      event(s2, "result-step", "step_viewed", "result", 40, {
        routeRevision: 1,
      }),
      event(s3, "cta-without-result", "cta_clicked", "result", 42, {
        routeRevision: 0,
      }),
      event(s4, "result", "result_viewed", "result", 40, { routeRevision: 0 }),
      event(s6, "result", "result_viewed", "result", 40, { routeRevision: 0 }),
      event(s6, "cta", "cta_clicked", "result", 42, { routeRevision: 0 }),
    ];

    expect(
      (yield* send(actions)).results.every(
        (receipt) => receipt.status === "accepted"
      )
    ).toBe(true);
    const report = yield* query();
    expect(report.summary).toMatchObject({
      ctaClickers: 2,
      ctaCtr: 1 / 2,
      resultReachRate: 2 / 3,
      resultReached: 4,
      resultViewers: 4,
      started: 6,
    });
    expect(report).toHaveProperty("cohorts");

    expect(
      report.comparisons.find(
        (comparison) =>
          comparison.version === s1.session.version &&
          comparison.variant === "A"
      )?.summary
    ).toMatchObject({
      ctaCtr: 1 / 2,
      resultReachRate: 2 / 3,
      resultReached: 2,
      started: 3,
    });
    expect(
      report.comparisons.find(
        (comparison) =>
          comparison.version === s5.session.version &&
          comparison.variant === "B"
      )?.summary
    ).toMatchObject({
      ctaCtr: 1,
      resultReachRate: 1,
      resultReached: 1,
      started: 1,
    });

    const a = report.cohorts.find(
      (cohort) =>
        cohort.version === s1.session.version &&
        cohort.variant === "A" &&
        cohort.campaign === "alpha"
    );

    expect(a?.summary).toMatchObject({
      ctaClickers: 1,
      ctaCtr: 1 / 2,
      resultReachRate: 2 / 3,
      resultReached: 2,
      resultViewers: 2,
      started: 3,
    });
    expect(
      report.cohorts.find(
        (cohort) =>
          cohort.version === s1.session.version &&
          cohort.variant === "B" &&
          cohort.campaign === "alpha"
      )?.summary
    ).toMatchObject({
      ctaClickers: 0,
      ctaCtr: 0,
      resultReachRate: 1,
      resultReached: 1,
      resultViewers: 1,
      started: 1,
    });
    expect(
      report.cohorts.find(
        (cohort) =>
          cohort.version === s5.session.version &&
          cohort.variant === "A" &&
          cohort.campaign === "beta"
      )?.summary
    ).toMatchObject({
      ctaClickers: 0,
      ctaCtr: null,
      resultReachRate: 0,
      resultReached: 0,
      resultViewers: 0,
      started: 1,
    });
    expect(
      report.cohorts.find(
        (cohort) =>
          cohort.version === s5.session.version &&
          cohort.variant === "B" &&
          cohort.campaign === "beta"
      )?.summary
    ).toMatchObject({
      ctaClickers: 1,
      ctaCtr: 1,
      resultReachRate: 1,
      resultReached: 1,
      resultViewers: 1,
      started: 1,
    });
    expect(a?.steps.find((step) => step.stepId === "pace")).toMatchObject({
      completers: 2,
      completionRate: 2 / 3,
      dropOff: 1,
      viewers: 3,
    });
    expect(a?.steps.find((step) => step.stepId === "supplies")).toMatchObject({
      completers: 1,
      completionRate: 1 / 2,
      dropOff: 1,
      viewers: 2,
    });
    expect(a?.steps.find((step) => step.stepId === "interests")).toMatchObject({
      completers: 1,
      completionRate: 1,
      dropOff: 0,
      viewers: 1,
    });
    expect(a?.steps.find((step) => step.stepId === "hours")).toMatchObject({
      completers: 0,
      completionRate: 0,
      dropOff: 1,
      viewers: 1,
    });
    expect(a?.steps.find((step) => step.stepId === "result")).toMatchObject({
      completers: 0,
      completionRate: 0,
      dropOff: 2,
      terminal: true,
      viewers: 2,
    });
    expect(
      a?.edges.find(
        (edge) =>
          edge.sourceStepId === "pace" && edge.targetStepId === "supplies"
      )
    ).toMatchObject({
      conversionRate: 1 / 2,
      converted: 1,
      dropOff: 1,
      eligible: 2,
    });
    expect(
      a?.edges.find(
        (edge) =>
          edge.sourceStepId === "pace" && edge.targetStepId === "interests"
      )
    ).toMatchObject({
      conversionRate: 1,
      converted: 1,
      dropOff: 0,
      eligible: 1,
    });
    expect(
      a?.edges.find(
        (edge) =>
          edge.sourceStepId === "supplies" && edge.targetStepId === "interests"
      )
    ).toMatchObject({
      conversionRate: 1,
      converted: 1,
      dropOff: 0,
      eligible: 1,
    });
    expect(
      a?.edges.find(
        (edge) =>
          edge.sourceStepId === "hours" && edge.targetStepId === "prepare"
      )
    ).toMatchObject({
      conversionRate: null,
      converted: 0,
      dropOff: 0,
      eligible: 0,
    });
    expect((yield* query("?campaign=alpha")).summary).toMatchObject({
      ctaClickers: 1,
      ctaCtr: 1 / 3,
      resultReachRate: 3 / 4,
      resultReached: 3,
      started: 4,
    });
    expect((yield* query("?campaign=beta")).summary).toMatchObject({
      ctaClickers: 1,
      ctaCtr: 1,
      resultReachRate: 1 / 2,
      resultReached: 1,
      started: 2,
    });
    expect(
      (yield* query(`?version=${s1.session.version}`)).summary
    ).toMatchObject({
      ctaCtr: 1 / 3,
      resultReachRate: 3 / 4,
      resultReached: 3,
      started: 4,
    });
    expect((yield* query("?variant=A")).summary).toMatchObject({
      ctaCtr: 1 / 2,
      resultReachRate: 1 / 2,
      resultReached: 2,
      started: 4,
    });
    expect((yield* query("?variant=B")).summary).toMatchObject({
      ctaCtr: 1 / 2,
      resultReachRate: 1,
      resultReached: 2,
      started: 2,
    });
    expect(
      (yield* query(`?version=${s5.session.version}&campaign=alpha`)).summary
    ).toMatchObject({
      ctaCtr: null,
      resultReachRate: null,
      resultReached: 0,
      started: 0,
    });
    const duplicate = yield* send(actions);
    expect(
      duplicate.results.every((receipt) => receipt.status === "duplicate")
    ).toBe(true);
    const replayed = yield* query();
    expect(replayed.summary).toEqual(report.summary);
    expect(replayed.cohorts).toEqual(report.cohorts);
    yield* send([
      event(s2, "supplies-delayed", "step_viewed", "supplies", 31, {
        routeRevision: 1,
      }),
    ]);
    const late = yield* query("?campaign=alpha&variant=A");
    expect(
      late.cohorts
        .find((cohort) => cohort.version === s1.session.version)
        ?.edges.find(
          (edge) =>
            edge.sourceStepId === "pace" && edge.targetStepId === "supplies"
        )
    ).toMatchObject({
      conversionRate: 1,
      converted: 2,
      dropOff: 0,
      eligible: 2,
    });
    const serialized = JSON.stringify(late);
    expect(serialized).not.toContain('"answers"');
    expect(serialized).not.toContain('"properties"');
    expect(serialized).not.toContain('"eventId"');
    expect(serialized).not.toContain(s1.session.id);
  }),
  { timeout: 120_000 }
);
