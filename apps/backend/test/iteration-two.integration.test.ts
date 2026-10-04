import type { Answer, FunnelEvent, SessionView } from "@core/core/contracts";
import {
  AnalyticsReportSchema,
  ingestEventsContract,
  SessionViewSchema,
  StoredFunnelEventSchema,
  VersionStateSchema,
} from "@core/core/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect } from "@effect/vitest";
import { Crypto, DateTime, Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import secondTrail from "../../../configurations/iteration-two/trail.json" with { type: "json" };
import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

const envelope = Effect.fnUntraced(function* envelope(
  view: SessionView,
  type: string,
  stepId: string,
  properties: FunnelEvent["properties"]
) {
  const crypto = yield* Crypto.Crypto;

  return {
    clientTimestamp: DateTime.formatIso(yield* DateTime.now),
    eventId: yield* crypto.randomUUIDv4,
    properties,
    sessionId: view.session.id,
    stepId,
    type,
    utm: view.session.utm,
    variant: view.session.variant,
    version: view.session.version,
  };
});

test(
  "preserves pinned sessions and exact old/new metrics through the fictional second iteration and rollback",
  Effect.gen(function* secondIterationCompatibility() {
    const { websiteUrl } = yield* stack;
    const run = yield* (yield* Crypto.Crypto).randomUUIDv4;
    const oldCampaign = `iteration-two-old-${run}`;
    const newCampaign = `iteration-two-new-${run}`;
    const configuration = { ...secondTrail, id: `iteration-two-api-${run}` };

    const load = Effect.fnUntraced(function* load(id: string) {
      const response = yield* HttpClient.get(
        `${websiteUrl}/api/sessions/${id}`
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
      );
    });

    const eventsFor = Effect.fnUntraced(function* eventsFor(id: string) {
      const response = yield* HttpClient.get(
        `${websiteUrl}/api/sessions/${id}/events`
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
        )
      );
    });

    const state = Effect.fnUntraced(function* state() {
      const response = yield* HttpClient.get(`${websiteUrl}/api/versions`);
      expect(response.status).toBe(200);

      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
      );
    });

    const report = Effect.fnUntraced(function* report(
      campaign: string,
      version: string
    ) {
      const response = yield* HttpClient.get(
        `${websiteUrl}/api/analytics?campaign=${encodeURIComponent(campaign)}&version=${encodeURIComponent(version)}`
      );

      expect(response.status).toBe(200);

      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(AnalyticsReportSchema))
      );
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

    const create = Effect.fnUntraced(function* create(
      variant: "A" | "B",
      campaign: string
    ) {
      const response = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
        body: HttpBody.jsonUnsafe({
          utm: { campaign, source: "fictional-compatibility" },
          variant,
        }),
      });

      expect(response.status).toBe(200);

      const view = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
      );

      expect(
        (yield* send([
          yield* envelope(view, "step_viewed", "welcome", { routeRevision: 0 }),
        ])).results[0]?.status
      ).toBe("accepted");

      return view;
    });

    const walk = Effect.fnUntraced(function* walk(
      initial: SessionView,
      answers: Record<string, Answer>,
      stopAt = "result"
    ) {
      let view = initial;
      const visited = [view.session.currentStep];
      const emitted: FunnelEvent[] = [];

      while (view.session.currentStep !== stopAt) {
        expect(visited.length).toBeLessThan(9);
        const source = view.session.currentStep;

        const step = view.configuration.steps.find(
          (candidate) => candidate.id === source
        );

        if (step === undefined) {
          return yield* Effect.die(
            "The current screen is absent from its pinned configuration."
          );
        }

        const response = yield* HttpClient.post(
          `${websiteUrl}/api/sessions/${view.session.id}/advance`,
          {
            body: HttpBody.jsonUnsafe({
              answer: answers[source] ?? null,
              stepId: source,
            }),
          }
        );

        expect(response.status).toBe(200);

        const next = yield* response.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
        );

        const { routeRevision } = next.session;

        if (step.type !== "information") {
          emitted.push(
            yield* envelope(next, "answer_submitted", source, { routeRevision })
          );
        }

        emitted.push(
          yield* envelope(next, "step_completed", source, {
            nextStepId: next.session.currentStep,
            routeRevision,
          })
        );

        if (source === "rest") {
          emitted.push(
            yield* envelope(next, "information_acknowledged", source, {
              acknowledged: true,
              screen: "rest",
            })
          );
        }

        emitted.push(
          yield* envelope(next, "step_viewed", next.session.currentStep, {
            routeRevision,
          })
        );

        if (next.session.currentStep === "result") {
          emitted.push(
            yield* envelope(next, "result_viewed", "result", { routeRevision })
          );
        }

        visited.push(next.session.currentStep);
        view = next;
      }

      const receipts = yield* send(emitted);
      expect(receipts.results).toHaveLength(emitted.length);
      expect(
        receipts.results.every((receipt) => receipt.status === "accepted")
      ).toBe(true);

      return { emitted, view, visited };
    });

    const before = yield* state();
    expect(before.activeVersion).toBe("trail-branches-v1");
    const oldA = yield* create("A", oldCampaign);
    const oldB = yield* create("B", oldCampaign);

    const originalB = yield* walk(
      oldB,
      { hours: 3, interests: ["forest"], pace: "gentle" },
      "prepare"
    );

    expect(originalB.visited).toEqual([
      "welcome",
      "hours",
      "pace",
      "interests",
      "prepare",
    ]);
    const oldEvents = yield* eventsFor(oldB.session.id);
    const oldBaseline = yield* report(oldCampaign, before.activeVersion);
    expect(oldBaseline.summary).toEqual({
      ctaClickers: 0,
      ctaCtr: null,
      resultReachRate: 0,
      resultReached: 0,
      resultViewers: 0,
      started: 2,
    });
    expect(
      oldBaseline.cohorts
        .find((cohort) => cohort.variant === "B")
        ?.steps.find((step) => step.stepId === "prepare")
    ).toMatchObject({ completers: 0, viewers: 1 });

    for (const invalid of [
      {
        ...configuration,
        id: `${configuration.id}-unknown`,
        variants: {
          B: { ...configuration.variants.B, removeSteps: ["missing"] },
        },
      },
      {
        ...configuration,
        id: `${configuration.id}-dangling`,
        variants: {
          B: {
            ...configuration.variants.B,
            steps: {
              ...configuration.variants.B.steps,
              interests: { next: "prepare" },
            },
          },
        },
      },
    ]) {
      const rejected = yield* HttpClient.post(`${websiteUrl}/api/versions`, {
        body: HttpBody.jsonUnsafe({ configuration: invalid }),
      });

      expect(rejected.status).toBe(422);
      expect(yield* state()).toEqual(before);
    }

    const publication = yield* HttpClient.post(`${websiteUrl}/api/versions`, {
      body: HttpBody.jsonUnsafe({ configuration }),
    });

    expect(publication.status).toBe(200);

    const published = yield* publication.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
    );

    expect(published.activeVersion).toBe(configuration.id);
    expect(published.history[0]).toMatchObject({
      kind: "publish",
      previousVersion: before.activeVersion,
      version: configuration.id,
    });
    expect(
      published.versions.some(
        (version) => version.version === before.activeVersion
      )
    ).toBe(true);
    expect(yield* load(oldA.session.id)).toEqual(oldA);
    expect(yield* load(oldB.session.id)).toEqual(originalB.view);
    expect(
      originalB.view.configuration.steps.some((step) => step.id === "prepare")
    ).toBe(true);
    expect(
      originalB.view.configuration.steps.some((step) => step.id === "rest")
    ).toBe(false);
    expect(
      (yield* send([
        yield* envelope(originalB.view, "information_acknowledged", "prepare", {
          acknowledged: true,
          screen: "prepare",
        }),
      ])).results[0]?.status
    ).toBe("rejected");
    expect(yield* eventsFor(oldB.session.id)).toEqual(oldEvents);

    const aHigh = yield* walk(yield* create("A", newCampaign), {
      hours: 4,
      interests: ["forest"],
      pace: "gentle",
    });

    const aLow = yield* walk(yield* create("A", newCampaign), {
      hours: 2,
      interests: ["forest"],
      pace: "gentle",
    });

    const bHigh = yield* walk(yield* create("B", newCampaign), {
      hours: 4,
      interests: ["forest"],
      pace: "active",
      supplies: "boots",
    });

    const bLow = yield* walk(yield* create("B", newCampaign), {
      hours: 2,
      interests: ["forest"],
      pace: "gentle",
    });

    expect(aHigh.visited).toEqual([
      "welcome",
      "pace",
      "interests",
      "hours",
      "rest",
      "prepare",
      "result",
    ]);
    expect(aLow.visited).toEqual([
      "welcome",
      "pace",
      "interests",
      "hours",
      "prepare",
      "result",
    ]);
    expect(bHigh.visited).toEqual([
      "welcome",
      "hours",
      "rest",
      "pace",
      "supplies",
      "interests",
      "result",
    ]);
    expect(bLow.visited).toEqual([
      "welcome",
      "hours",
      "pace",
      "interests",
      "result",
    ]);

    for (const completed of [bHigh, bLow]) {
      expect(completed.view.configuration.steps.map((step) => step.id)).toEqual(
        ["welcome", "pace", "supplies", "interests", "hours", "rest", "result"]
      );
      expect(completed.view.route).not.toContain("prepare");
    }

    for (const completed of [aHigh, aLow]) {
      expect(
        completed.view.configuration.steps.some((step) => step.id === "prepare")
      ).toBe(true);
    }

    const clicks = yield* Effect.forEach([aHigh, bHigh], ({ view }) =>
      envelope(view, "cta_clicked", "result", {
        routeRevision: view.session.routeRevision,
      })
    );

    expect(
      (yield* send(clicks)).results.every(
        (receipt) => receipt.status === "accepted"
      )
    ).toBe(true);

    for (const completed of [aHigh, aLow, bHigh, bLow]) {
      const stored = yield* eventsFor(completed.view.session.id);

      const acknowledgements = stored.filter(
        (event) => event.type === "information_acknowledged"
      );

      expect(acknowledgements).toHaveLength(
        completed === aHigh || completed === bHigh ? 1 : 0
      );

      for (const acknowledgement of acknowledgements) {
        expect(acknowledgement.properties).toEqual({
          acknowledged: true,
          screen: "rest",
        });

        const replay = yield* Effect.fromNullishOr(
          completed.emitted.find(
            (event) => event.eventId === acknowledgement.eventId
          )
        ).pipe(Effect.orDie);

        const receipts = yield* send([replay]);
        expect(receipts.results[0]).toMatchObject({
          serverTimestamp: acknowledgement.serverTimestamp,
          status: "duplicate",
        });
      }

      expect(
        stored.every(
          (event) =>
            !Object.keys(event.properties).some((key) =>
              ["answer", "email", "text", "url"].includes(key)
            )
        )
      ).toBe(true);
    }

    const newBEvents = yield* eventsFor(bHigh.view.session.id);

    const sensitive = yield* envelope(
      bHigh.view,
      "information_acknowledged",
      "rest",
      {
        acknowledged: true,
        email: "fictional@example.invalid",
        screen: "rest",
      }
    );

    expect((yield* send([sensitive])).results[0]?.status).toBe("rejected");
    expect(yield* eventsFor(bHigh.view.session.id)).toEqual(newBEvents);

    const oldAfter = yield* report(oldCampaign, before.activeVersion);
    expect(oldAfter.summary).toEqual(oldBaseline.summary);
    expect(oldAfter.cohorts).toEqual(oldBaseline.cohorts);
    expect(oldAfter.comparisons).toEqual(oldBaseline.comparisons);
    const newBaseline = yield* report(newCampaign, configuration.id);
    expect(newBaseline.summary).toEqual({
      ctaClickers: 2,
      ctaCtr: 0.5,
      resultReachRate: 1,
      resultReached: 4,
      resultViewers: 4,
      started: 4,
    });
    expect(
      newBaseline.comparisons.map((comparison) => ({
        summary: comparison.summary,
        variant: comparison.variant,
      }))
    ).toEqual([
      {
        summary: {
          ctaClickers: 1,
          ctaCtr: 0.5,
          resultReachRate: 1,
          resultReached: 2,
          resultViewers: 2,
          started: 2,
        },
        variant: "A",
      },
      {
        summary: {
          ctaClickers: 1,
          ctaCtr: 0.5,
          resultReachRate: 1,
          resultReached: 2,
          resultViewers: 2,
          started: 2,
        },
        variant: "B",
      },
    ]);

    const aCohort = yield* Effect.fromNullishOr(
      newBaseline.cohorts.find((cohort) => cohort.variant === "A")
    ).pipe(Effect.orDie);

    const bCohort = yield* Effect.fromNullishOr(
      newBaseline.cohorts.find((cohort) => cohort.variant === "B")
    ).pipe(Effect.orDie);

    for (const cohort of [aCohort, bCohort]) {
      expect(cohort.steps.find((step) => step.stepId === "rest")).toMatchObject(
        { completers: 1, dropOff: 0, viewers: 1 }
      );
      expect(
        cohort.edges.find(
          (edge) =>
            edge.sourceStepId === "hours" && edge.targetStepId === "rest"
        )
      ).toMatchObject({ converted: 1, eligible: 1 });
    }

    expect(
      aCohort.steps.find((step) => step.stepId === "prepare")
    ).toMatchObject({ completers: 2, viewers: 2 });
    expect(bCohort.steps.some((step) => step.stepId === "prepare")).toBe(false);
    expect(
      aCohort.edges.find(
        (edge) =>
          edge.sourceStepId === "hours" && edge.targetStepId === "prepare"
      )
    ).toMatchObject({ converted: 1, eligible: 1 });
    expect(
      bCohort.edges.find(
        (edge) => edge.sourceStepId === "hours" && edge.targetStepId === "pace"
      )
    ).toMatchObject({ converted: 1, eligible: 1 });
    expect(
      aCohort.edges.find(
        (edge) =>
          edge.sourceStepId === "rest" && edge.targetStepId === "prepare"
      )
    ).toMatchObject({ converted: 1, eligible: 1 });
    expect(
      bCohort.edges.find(
        (edge) => edge.sourceStepId === "rest" && edge.targetStepId === "pace"
      )
    ).toMatchObject({ converted: 1, eligible: 1 });

    const rollback = yield* HttpClient.post(
      `${websiteUrl}/api/versions/rollback`,
      { body: HttpBody.jsonUnsafe({}) }
    );

    expect(rollback.status).toBe(200);

    const restored = yield* rollback.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
    );

    expect(restored.activeVersion).toBe(before.activeVersion);
    expect(restored.history[0]).toMatchObject({
      kind: "rollback",
      previousVersion: configuration.id,
      version: before.activeVersion,
    });
    expect(restored.history).toHaveLength(before.history.length + 2);
    expect(
      restored.versions.some((version) => version.version === configuration.id)
    ).toBe(true);
    expect(yield* load(oldB.session.id)).toEqual(originalB.view);
    expect(yield* load(oldA.session.id)).toEqual(oldA);

    for (const completed of [aHigh, aLow, bHigh, bLow]) {
      expect(yield* load(completed.view.session.id)).toEqual(completed.view);
    }

    const oldRestored = yield* report(oldCampaign, before.activeVersion);
    const newRestored = yield* report(newCampaign, configuration.id);
    expect(oldRestored.summary).toEqual(oldBaseline.summary);
    expect(oldRestored.cohorts).toEqual(oldBaseline.cohorts);
    expect(newRestored.summary).toEqual(newBaseline.summary);
    expect(newRestored.cohorts).toEqual(newBaseline.cohorts);
    expect(newRestored.comparisons).toEqual(newBaseline.comparisons);
    expect(
      (yield* create("B", `iteration-two-restored-${run}`)).session.version
    ).toBe(before.activeVersion);
    yield* Effect.logInfo({
      firstVersion: before.activeVersion,
      newCampaign,
      newSummary: newBaseline.summary,
      oldCampaign,
      oldSummary: oldBaseline.summary,
      publishedAt: published.history[0]?.activatedAt,
      publishedVersion: configuration.id,
      rolledBackAt: restored.history[0]?.activatedAt,
    });
  }).pipe(Effect.provide(NodeCrypto.layer)),
  { timeout: 180_000 }
);
