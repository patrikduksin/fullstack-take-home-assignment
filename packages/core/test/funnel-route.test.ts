import { expect, it } from "@effect/vitest";

import type { FunnelConfiguration } from "../src/funnel/configuration.js";
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
