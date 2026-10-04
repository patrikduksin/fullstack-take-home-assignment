import { defineContract } from "@core/capability/contract";
import { Schema } from "effect";

import { FunnelError } from "./contracts.js";

export const AnalyticsFilterSchema = Schema.Struct({
  campaign: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.Literals(["A", "B"])),
  version: Schema.optional(Schema.String),
});

export type AnalyticsFilter = typeof AnalyticsFilterSchema.Type;

export const AnalyticsSummarySchema = Schema.Struct({
  ctaClickers: Schema.Int,
  ctaCtr: Schema.NullOr(Schema.Finite),
  resultReachRate: Schema.NullOr(Schema.Finite),
  resultReached: Schema.Int,
  resultViewers: Schema.Int,
  started: Schema.Int,
});

export type AnalyticsSummary = typeof AnalyticsSummarySchema.Type;

export const StepAnalyticsSchema = Schema.Struct({
  completers: Schema.Int,
  completionRate: Schema.NullOr(Schema.Finite),
  dropOff: Schema.Int,
  stepId: Schema.String,
  terminal: Schema.Boolean,
  title: Schema.String,
  viewers: Schema.Int,
});

export type StepAnalytics = typeof StepAnalyticsSchema.Type;

export const EdgeAnalyticsSchema = Schema.Struct({
  conversionRate: Schema.NullOr(Schema.Finite),
  converted: Schema.Int,
  dropOff: Schema.Int,
  eligible: Schema.Int,
  sourceStepId: Schema.String,
  targetStepId: Schema.String,
});

export type EdgeAnalytics = typeof EdgeAnalyticsSchema.Type;

export const AnalyticsCohortSchema = Schema.Struct({
  campaign: Schema.NullOr(Schema.String),
  edges: Schema.Array(EdgeAnalyticsSchema),
  name: Schema.String,
  steps: Schema.Array(StepAnalyticsSchema),
  summary: AnalyticsSummarySchema,
  variant: Schema.Literals(["A", "B"]),
  version: Schema.String,
});

export type AnalyticsCohort = typeof AnalyticsCohortSchema.Type;

export const VariantComparisonSchema = Schema.Struct({
  name: Schema.String,
  summary: AnalyticsSummarySchema,
  variant: Schema.Literals(["A", "B"]),
  version: Schema.String,
});

export type VariantComparison = typeof VariantComparisonSchema.Type;

export const AnalyticsReportSchema = Schema.Struct({
  campaigns: Schema.Array(Schema.NullOr(Schema.String)),
  capturedAt: Schema.String,
  cohorts: Schema.Array(AnalyticsCohortSchema),
  comparisons: Schema.Array(VariantComparisonSchema),
  summary: AnalyticsSummarySchema,
  versions: Schema.Array(
    Schema.Struct({ name: Schema.String, version: Schema.String })
  ),
});

export type AnalyticsReport = typeof AnalyticsReportSchema.Type;

export const analyticsContract = defineContract("analytics", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Count distinct funnel sessions within version, variant and initial campaign cohorts",
  failure: FunnelError,
  http: { method: "GET", path: "/analytics" },
  input: AnalyticsFilterSchema,
  output: AnalyticsReportSchema,
});
