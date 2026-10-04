import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import camp from "../../../configurations/iteration-one/camp.json" with { type: "json" };
import trail from "../../../configurations/iteration-one/trail.json" with { type: "json" };
import type { FunnelConfiguration } from "../src/funnel/configuration.js";
import {
  resolveVariant,
  validateConfiguration,
} from "../src/funnel/configuration.js";
import { pruneAnswers, resolveRoute } from "../src/funnel/route.js";

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

it("does not let an abandoned earlier answer select a later branch", () => {
  const dependent: FunnelConfiguration = {
    ...configuration,
    steps: configuration.steps.map((step) => {
      if (step.id === "supplies") {
        return {
          ...step,
          options: [{ id: "boots", label: "Boots" }],
          type: "single-select",
        };
      }

      if (step.id === "interests") {
        return {
          ...step,
          next: undefined,
          transition: {
            branches: [
              {
                next: "prepare",
                when: {
                  operator: "equals",
                  stepId: "supplies",
                  value: "boots",
                },
              },
            ],
            default: "hours",
          },
        };
      }

      return step;
    }),
  };

  expect(
    resolveRoute(dependent, { pace: "gentle", supplies: "boots" })
  ).toEqual(["pace", "interests", "hours", "prepare", "result"]);
});

it("removes answers only for unavailable steps after editing a branch", () => {
  const pruned = pruneAnswers(configuration, {
    hours: 3,
    interests: ["water"],
    pace: "gentle",
    supplies: "boots",
  });

  expect(pruned.answers).toEqual({
    hours: 3,
    interests: ["water"],
    pace: "gentle",
  });
  expect(pruned.route).toEqual([
    "pace",
    "interests",
    "hours",
    "prepare",
    "result",
  ]);
});

it.effect("validates both variants and refuses unknown override names", () =>
  Effect.gen(function* variantValidation() {
    const missing = {
      ...configuration,
      variants: { B: { steps: { missing: { title: "Missing" } } } },
    };

    expect(
      (yield* Effect.flip(validateConfiguration(missing))).message
    ).toContain("missing step");

    const cyclic = {
      ...configuration,
      variants: { B: { steps: { prepare: { next: "pace" } } } },
    };

    expect(
      (yield* Effect.flip(validateConfiguration(cyclic))).message
    ).toContain("cycle");
    const unknown = { ...configuration, variants: { C: { name: "Unknown" } } };
    expect(
      (yield* Effect.flip(validateConfiguration(unknown))).message
    ).toContain("C");
  })
);

it.effect("accepts both authored first-iteration configurations", () =>
  Effect.gen(function* firstIteration() {
    expect((yield* validateConfiguration(trail)).id).toBe("trail-branches-v1");
    const campConfiguration = yield* validateConfiguration(camp);
    expect(campConfiguration.id).toBe("camp-branches-v1");
    expect(resolveRoute(campConfiguration, { interests: ["water"] })).toContain(
      "waterside"
    );
    expect(
      resolveRoute(campConfiguration, { interests: ["forest"] })
    ).not.toContain("waterside");
  })
);

it("compares finite numeric answers at the configured boundary", () => {
  const numeric: FunnelConfiguration = {
    ...configuration,
    steps: configuration.steps.map((step) =>
      step.id === "pace"
        ? {
            ...step,
            max: 8,
            min: 1,
            options: undefined,
            transition: {
              branches: [
                {
                  next: "supplies",
                  when: { operator: "gte", stepId: "pace", value: 3 },
                },
              ],
              default: "interests",
            },
            type: "number",
          }
        : step
    ),
  };

  expect(resolveRoute(numeric, { pace: 2 })).not.toContain("supplies");
  expect(resolveRoute(numeric, { pace: 3 })).toContain("supplies");
  expect(
    resolveRoute(numeric, { pace: Number.POSITIVE_INFINITY })
  ).not.toContain("supplies");
});

it.effect(
  "replaces a variant's inherited conditional transition with configured linear navigation",
  () =>
    Effect.gen(function* variantNavigation() {
      const variantConfiguration = {
        ...configuration,
        variants: { B: { steps: { pace: { next: "interests" } } } },
      };

      const valid = yield* validateConfiguration(variantConfiguration);
      expect(
        resolveRoute(resolveVariant(valid, "B"), { pace: "active" })
      ).not.toContain("supplies");
      expect(
        resolveRoute(resolveVariant(valid, "A"), { pace: "active" })
      ).toContain("supplies");
    })
);
