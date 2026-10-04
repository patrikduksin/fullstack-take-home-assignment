import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import trail from "../../../configurations/iteration-one/trail.json" with { type: "json" };
import secondTrail from "../../../configurations/iteration-two/trail.json" with { type: "json" };
import {
  resolveVariant,
  validateConfiguration,
} from "../src/funnel/configuration.js";
import { resolveRoute } from "../src/funnel/route.js";

it.effect(
  "validates the fictional second iteration's branches and actual B removal",
  () =>
    Effect.gen(function* secondIterationRoutes() {
      const configuration = yield* validateConfiguration(secondTrail);
      const a = resolveVariant(configuration, "A");
      const b = resolveVariant(configuration, "B");
      expect(a.steps.map((step) => step.id)).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "rest",
        "prepare",
        "result",
      ]);
      expect(b.steps.map((step) => step.id)).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "rest",
        "result",
      ]);
      expect(resolveRoute(a, { hours: 2, pace: "gentle" })).toEqual([
        "welcome",
        "pace",
        "interests",
        "hours",
        "prepare",
        "result",
      ]);
      expect(resolveRoute(a, { hours: 4, pace: "gentle" })).toEqual([
        "welcome",
        "pace",
        "interests",
        "hours",
        "rest",
        "prepare",
        "result",
      ]);
      expect(resolveRoute(a, { hours: 4, pace: "active" })).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "rest",
        "prepare",
        "result",
      ]);
      expect(resolveRoute(b, { hours: 2, pace: "gentle" })).toEqual([
        "welcome",
        "hours",
        "pace",
        "interests",
        "result",
      ]);
      expect(resolveRoute(b, { hours: 4, pace: "gentle" })).toEqual([
        "welcome",
        "hours",
        "rest",
        "pace",
        "interests",
        "result",
      ]);
      expect(resolveRoute(b, { hours: 4, pace: "active" })).toEqual([
        "welcome",
        "hours",
        "rest",
        "pace",
        "supplies",
        "interests",
        "result",
      ]);
      expect(configuration.eventTypes).toEqual([
        {
          on: "step_completed",
          properties: {
            acknowledged: { emit: true, kind: "boolean" },
            screen: { emit: "source", kind: "step" },
          },
          stepIds: ["rest"],
          type: "information_acknowledged",
        },
      ]);
    })
);

const withoutPreparation = {
  ...trail,
  variants: {
    B: {
      ...trail.variants.B,
      removeSteps: ["prepare"],
      steps: {
        ...trail.variants.B.steps,
        interests: { next: "result" },
      },
    },
  },
};

it.effect(
  "removes a screen only from B while preserving A and older configurations",
  () =>
    Effect.gen(function* variantRemoval() {
      const configuration = yield* validateConfiguration(withoutPreparation);
      const resolvedB = resolveVariant(configuration, "B");
      expect(resolvedB.steps.map((step) => step.id)).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "result",
      ]);
      expect(
        resolveRoute(resolvedB, {
          hours: 3,
          interests: ["forest"],
          pace: "gentle",
        })
      ).toEqual(["welcome", "hours", "pace", "interests", "result"]);
      expect(
        resolveVariant(configuration, "A").steps.map((step) => step.id)
      ).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "prepare",
        "result",
      ]);
      const original = yield* validateConfiguration(trail);
      expect(
        resolveRoute(resolveVariant(original, "B"), {
          hours: 3,
          interests: ["forest"],
          pace: "gentle",
        })
      ).toEqual(["welcome", "hours", "pace", "interests", "prepare", "result"]);
    })
);

it.effect(
  "rejects removal of a step that the configuration does not contain",
  () =>
    Effect.gen(function* missingRemoval() {
      const error = yield* Effect.flip(
        validateConfiguration({
          ...withoutPreparation,
          variants: {
            B: { ...withoutPreparation.variants.B, removeSteps: ["missing"] },
          },
        })
      );

      expect(error.message).toContain("Variant B");
      expect(error.message).toContain("missing step missing");
    })
);

it.effect("rejects naming the same removed step twice", () =>
  Effect.gen(function* duplicateRemoval() {
    const error = yield* Effect.flip(
      validateConfiguration({
        ...withoutPreparation,
        variants: {
          B: {
            ...withoutPreparation.variants.B,
            removeSteps: ["prepare", "prepare"],
          },
        },
      })
    );

    expect(error.message).toContain("Variant B");
    expect(error.message).toContain("unique");
  })
);

it.effect("rejects overriding a screen that the same variant removes", () =>
  Effect.gen(function* conflictingRemoval() {
    const error = yield* Effect.flip(
      validateConfiguration({
        ...withoutPreparation,
        variants: {
          B: {
            ...withoutPreparation.variants.B,
            steps: {
              ...withoutPreparation.variants.B.steps,
              prepare: { title: "Removed" },
            },
          },
        },
      })
    );

    expect(error.message).toContain("Variant B");
    expect(error.message).toContain("remove and override step prepare");
  })
);

it.effect("requires explicit navigation around a removed screen", () =>
  Effect.gen(function* danglingRemoval() {
    const error = yield* Effect.flip(
      validateConfiguration({
        ...trail,
        variants: { B: { ...trail.variants.B, removeSteps: ["prepare"] } },
      })
    );

    expect(error.message).toContain("missing destination prepare");
  })
);

it.effect("rejects removal of the variant's starting screen", () =>
  Effect.gen(function* removedStart() {
    const error = yield* Effect.flip(
      validateConfiguration({
        ...trail,
        variants: { B: { removeSteps: ["welcome"] } },
      })
    );

    expect(error.message).toContain("start step welcome is missing");
  })
);

it.effect("requires at least six configured screens after removal", () =>
  Effect.gen(function* tooFewScreens() {
    const error = yield* Effect.flip(
      validateConfiguration({
        ...withoutPreparation,
        variants: {
          B: {
            ...withoutPreparation.variants.B,
            removeSteps: ["prepare", "supplies"],
            steps: {
              ...withoutPreparation.variants.B.steps,
              pace: { next: "interests" },
            },
          },
        },
      })
    );

    expect(error.message).toContain("at least six screens");
  })
);

it.effect(
  "rejects retained event declarations that reference a removed screen",
  () =>
    Effect.gen(function* removedEventStep() {
      const error = yield* Effect.flip(
        validateConfiguration({
          ...withoutPreparation,
          eventTypes: [
            {
              on: "step_completed",
              properties: { acknowledged: { emit: true, kind: "boolean" } },
              stepIds: ["prepare"],
              type: "screen_acknowledged",
            },
          ],
        })
      );

      expect(error.message).toContain(
        "Event screen_acknowledged references missing step prepare"
      );
    })
);
