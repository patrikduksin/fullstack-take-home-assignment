import { implement } from "@core/capability/implement";
import { Context, Effect, Schema } from "effect";

import { analyticsContract } from "./analytics-contracts.js";
import type {
  AnalyticsFilter,
  AnalyticsSummary,
} from "./analytics-contracts.js";
import { FunnelConfigurationSchema } from "./configuration.js";
import { StoredFunnelEventSchema } from "./contracts.js";
import type { FunnelError, StoredFunnelEvent } from "./contracts.js";

export const AnalyticsSnapshotSchema = Schema.Struct({
  capturedAt: Schema.String,
  configurations: Schema.Array(FunnelConfigurationSchema),
  events: Schema.Array(StoredFunnelEventSchema),
});

export type AnalyticsSnapshot = typeof AnalyticsSnapshotSchema.Type;

export class FunnelAnalytics extends Context.Service<
  FunnelAnalytics,
  {
    readonly snapshot: () => Effect.Effect<AnalyticsSnapshot, FunnelError>;
  }
>()("@core/core/funnel/FunnelAnalytics") {}

export const summarizeSessions = (
  events: readonly StoredFunnelEvent[]
): AnalyticsSummary => {
  const starts = new Set<string>();
  const results = new Set<string>();
  const clicks = new Set<string>();

  for (const event of events) {
    if (event.type === "session_started") {
      starts.add(event.sessionId);
    }

    if (event.type === "result_viewed") {
      results.add(event.sessionId);
    }

    if (event.type === "cta_clicked") {
      clicks.add(event.sessionId);
    }
  }

  const resultReached = [...starts].filter((id) => results.has(id)).length;
  const ctaClickers = [...results].filter((id) => clicks.has(id)).length;

  return {
    ctaClickers,
    ctaCtr: results.size === 0 ? null : ctaClickers / results.size,
    resultReachRate: starts.size === 0 ? null : resultReached / starts.size,
    resultReached,
    resultViewers: results.size,
    started: starts.size,
  };
};

const matchesFilter = (event: StoredFunnelEvent, filter: AnalyticsFilter) =>
  (filter.version === undefined || event.version === filter.version) &&
  (filter.variant === undefined || event.variant === filter.variant) &&
  (filter.campaign === undefined ||
    (event.utm.campaign ?? "") === filter.campaign);

const analytics = implement(
  analyticsContract,
  Effect.fn("analytics")(function* analytics(filter) {
    const store = yield* FunnelAnalytics;
    const snapshot = yield* store.snapshot();

    return {
      capturedAt: snapshot.capturedAt,
      summary: summarizeSessions(
        snapshot.events.filter((event) => matchesFilter(event, filter))
      ),
    };
  })
);

export const funnelAnalyticsCapabilities = [analytics] as const;
