import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { FunnelConfiguration } from "../src/funnel/configuration.js";
import { validateConfiguration } from "../src/funnel/configuration.js";
import { resolveRoute } from "../src/funnel/route.js";

const configuration: FunnelConfiguration = {
  id: "routing-example",
  name: "Routing example",
  start: "pace",
  steps: [
    {
      id: "pace",
      options: [
        { id: "gentle", label: "Gentle" },
        { id: "active", label: "Active" },
      ],
      title: "Pace",
      transition: {
        branches: [
          {
            next: "supplies",
            when: { operator: "equals", stepId: "pace", value: "active" },
          },
        ],
        default: "interests",
      },
      type: "single-select",
    },
    {
      id: "supplies",
      next: "interests",
      title: "Supplies",
      type: "information",
    },
    {
      id: "interests",
      next: "hours",
      options: [{ id: "water", label: "Water" }],
      title: "Interests",
      type: "multi-select",
    },
    {
      id: "hours",
      max: 8,
      min: 1,
      next: "prepare",
      title: "Hours",
      type: "number",
    },
    { id: "prepare", next: "result", title: "Prepare", type: "information" },
    {
      cta: { href: "https://example.com", label: "Read" },
      id: "result",
      title: "Result",
      type: "result",
    },
  ],
};

it("uses the explicit default before answers and adds only the matching branch", () => {
  expect(resolveRoute(configuration, {})).toEqual([
    "pace",
    "interests",
    "hours",
    "prepare",
    "result",
  ]);
  expect(resolveRoute(configuration, { pace: "active" })).toEqual([
    "pace",
    "supplies",
    "interests",
    "hours",
    "prepare",
    "result",
  ]);
  expect(resolveRoute(configuration, { pace: "gentle" })).toEqual([
    "pace",
    "interests",
    "hours",
    "prepare",
    "result",
  ]);
});

it.effect("rejects a missing default destination before publication", () =>
  Effect.gen(function* missingDefault() {
    const invalid = {
      ...configuration,
      steps: configuration.steps.map((step) =>
        step.id === "pace"
          ? { ...step, transition: { ...step.transition, default: "missing" } }
          : step
      ),
    };

    const error = yield* Effect.flip(validateConfiguration(invalid));
    expect(error.message).toContain("missing");
  })
);

it.effect(
  "rejects cycles even when the unanswered default can reach a result",
  () =>
    Effect.gen(function* cyclicBranch() {
      const invalid = {
        ...configuration,
        steps: configuration.steps.map((step) =>
          step.id === "supplies" ? { ...step, next: "pace" } : step
        ),
      };

      const error = yield* Effect.flip(validateConfiguration(invalid));
      expect(error.message).toContain("cycle");
    })
);

it.effect(
  "accepts a complete branch and rejects invalid condition options and dead ends",
  () =>
    Effect.gen(function* typedReferences() {
      expect((yield* validateConfiguration(configuration)).id).toBe(
        "routing-example"
      );

      const badOption = {
        ...configuration,
        steps: configuration.steps.map((step) =>
          step.id === "pace"
            ? {
                ...step,
                transition: {
                  branches: [
                    {
                      next: "supplies",
                      when: {
                        operator: "equals",
                        stepId: "pace",
                        value: "missing-option",
                      },
                    },
                  ],
                  default: "interests",
                },
              }
            : step
        ),
      };

      expect(
        (yield* Effect.flip(validateConfiguration(badOption))).message
      ).toContain("option");

      const deadEnd = {
        ...configuration,
        steps: configuration.steps.map((step) =>
          step.id === "prepare" ? { ...step, next: undefined } : step
        ),
      };

      expect(
        (yield* Effect.flip(validateConfiguration(deadEnd))).message
      ).toContain("next step");
    })
);

it.effect("rejects an unsafe result action and impossible input limits", () =>
  Effect.gen(function* safeResult() {
    const unsafe = {
      ...configuration,
      steps: configuration.steps.map((step) =>
        step.id === "result"
          ? { ...step, cta: { href: "data:text/html,unsafe", label: "Read" } }
          : step
      ),
    };

    expect(
      (yield* Effect.flip(validateConfiguration(unsafe))).message
    ).toContain("HTTP");

    const badLimits = {
      ...configuration,
      steps: configuration.steps.map((step) =>
        step.id === "interests" ? { ...step, max: 1, min: 2 } : step
      ),
    };

    expect(
      (yield* Effect.flip(validateConfiguration(badLimits))).message
    ).toContain("selection limits");
  })
);
