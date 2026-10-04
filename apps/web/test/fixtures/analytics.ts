import {
  ingestEventsContract,
  SessionViewSchema,
  VersionStateSchema,
} from "@core/core/contracts";
import type { Answer, FunnelEvent, SessionView } from "@core/core/contracts";
import { expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import trail from "../../../../configurations/iteration-one/trail.json" with { type: "json" };

const answerForStep = (stepId: string): Answer => {
  switch (stepId) {
    case "pace": {
      return "gentle";
    }

    case "interests": {
      return ["forest"];
    }

    case "hours": {
      return 3;
    }

    default: {
      return null;
    }
  }
};

export const seedBrowserAnalytics = Effect.fn("seedBrowserAnalytics")(
  function* seedBrowserAnalytics(url: string) {
    const decodeView = Schema.decodeUnknownEffect(SessionViewSchema);
    const decodeVersions = Schema.decodeUnknownEffect(VersionStateSchema);

    const initial = yield* HttpClient.get(`${url}/api/versions`).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeVersions)
    );

    const create = Effect.fnUntraced(function* create(
      variant: string,
      campaign: string
    ) {
      const response = yield* HttpClient.post(`${url}/api/sessions`, {
        body: HttpBody.jsonUnsafe({ utm: { campaign }, variant }),
      });

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeView));
    });

    const journey = Effect.fnUntraced(function* journey(
      initialView: SessionView,
      finish: boolean,
      click: boolean
    ) {
      let view = initialView;
      let sequence = 0;
      const events: FunnelEvent[] = [];

      const record = (
        type: string,
        stepId: string,
        properties: Record<string, number | string>
      ) => {
        sequence += 1;
        events.push({
          clientTimestamp: `2026-10-04T12:00:${String(sequence).padStart(2, "0")}.000Z`,
          eventId: `${view.session.id}:dashboard-${sequence}`,
          properties,
          sessionId: view.session.id,
          stepId,
          type,
          utm: view.session.utm,
          variant: view.session.variant,
          version: view.session.version,
        });
      };

      record("step_viewed", view.session.currentStep, {
        routeRevision: view.session.routeRevision,
      });

      while (view.session.currentStep !== "result") {
        if (!finish && view.session.currentStep === "pace") {
          break;
        }

        const source = view.session.currentStep;

        const response = yield* HttpClient.post(
          `${url}/api/sessions/${view.session.id}/advance`,
          {
            body: HttpBody.jsonUnsafe({
              answer: answerForStep(source),
              stepId: source,
            }),
          }
        );

        expect(response.status).toBe(200);
        view = yield* response.json.pipe(Effect.flatMap(decodeView));
        record("step_completed", source, {
          nextStepId: view.session.currentStep,
          routeRevision: view.session.routeRevision,
        });
        record("step_viewed", view.session.currentStep, {
          routeRevision: view.session.routeRevision,
        });
      }

      if (view.session.currentStep === "result") {
        record("result_viewed", "result", {
          routeRevision: view.session.routeRevision,
        });

        if (click) {
          record("cta_clicked", "result", {
            routeRevision: view.session.routeRevision,
          });
        }
      }

      const response = yield* HttpClient.post(`${url}/api/events`, {
        body: HttpBody.jsonUnsafe({ events }),
      });

      expect(response.status).toBe(200);

      const receipts = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ingestEventsContract.output))
      );

      expect(
        receipts.results.every((receipt) => receipt.status === "accepted")
      ).toBe(true);
    });

    const first = yield* create("A", "dashboard-fixture");
    yield* journey(first, true, true);
    yield* journey(yield* create("A", "dashboard-fixture"), false, false);

    const publication = yield* HttpClient.post(`${url}/api/versions`, {
      body: HttpBody.jsonUnsafe({
        configuration: {
          ...trail,
          id: "analytics-browser-v2",
          name: "Analytics browser comparison",
        },
      }),
    });

    expect(publication.status).toBe(200);
    const next = yield* publication.json.pipe(Effect.flatMap(decodeVersions));
    yield* journey(yield* create("B", "dashboard-fixture"), true, false);

    const rollback = yield* HttpClient.post(`${url}/api/versions/rollback`, {
      body: HttpBody.jsonUnsafe({}),
    });

    expect(rollback.status).toBe(200);
    const restored = yield* rollback.json.pipe(Effect.flatMap(decodeVersions));
    expect(restored.activeVersion).toBe(initial.activeVersion);
    yield* create("A", "other-campaign");

    return {
      nextVersion: next.activeVersion,
      originalVersion: initial.activeVersion,
    };
  }
);
