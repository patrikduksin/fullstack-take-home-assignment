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

export const AnalyticsReportSchema = Schema.Struct({
  capturedAt: Schema.String,
  summary: AnalyticsSummarySchema,
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
