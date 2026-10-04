import { implement } from "@core/capability/implement";
import { Context, Effect, Schema } from "effect";

import { analyticsContract } from "./analytics-contracts.js";
import type {
  AnalyticsCohort,
  AnalyticsFilter,
  AnalyticsReport,
  AnalyticsSummary,
  EdgeAnalytics,
  StepAnalytics,
  VariantComparison,
} from "./analytics-contracts.js";
import { FunnelConfigurationSchema, resolveVariant } from "./configuration.js";
import type { FunnelConfiguration, FunnelStep } from "./configuration.js";
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

const initialCampaign = (campaign: string | undefined): string | null =>
  campaign === undefined || campaign === "" ? null : campaign;

const matchesFilter = (event: StoredFunnelEvent, filter: AnalyticsFilter) =>
  (filter.version === undefined || event.version === filter.version) &&
  (filter.variant === undefined || event.variant === filter.variant) &&
  (filter.campaign === undefined ||
    (event.utm.campaign ?? "") === filter.campaign);

const stepAnalytics = (
  step: FunnelStep,
  events: readonly StoredFunnelEvent[]
): StepAnalytics => {
  const viewers = new Set<string>();
  const completed = new Set<string>();

  for (const event of events) {
    if (event.stepId !== step.id) {
      continue;
    }

    if (event.type === "step_viewed") {
      viewers.add(event.sessionId);
    }

    if (event.type === "step_completed") {
      completed.add(event.sessionId);
    }
  }

  const completers = [...viewers].filter((id) => completed.has(id)).length;

  return {
    completers,
    completionRate: viewers.size === 0 ? null : completers / viewers.size,
    dropOff: viewers.size - completers,
    stepId: step.id,
    terminal: step.type === "result",
    title: step.title,
    viewers: viewers.size,
  };
};

const edgeAnalytics = (
  sourceStepId: string,
  targetStepId: string,
  events: readonly StoredFunnelEvent[]
): EdgeAnalytics => {
  const completions = new Map<string, { sessionId: string; time: string }>();
  const views = new Map<string, string>();

  for (const event of events) {
    const revision = event.properties.routeRevision;

    if (!Schema.is(Schema.Int)(revision)) {
      continue;
    }

    const pair = JSON.stringify([event.sessionId, revision]);

    if (event.type === "step_viewed" && event.stepId === targetStepId) {
      const previous = views.get(pair);

      if (previous === undefined || event.clientTimestamp > previous) {
        views.set(pair, event.clientTimestamp);
      }
    }

    if (
      event.type === "step_completed" &&
      event.stepId === sourceStepId &&
      event.properties.nextStepId === targetStepId
    ) {
      const previous = completions.get(pair);

      if (previous === undefined || event.clientTimestamp < previous.time) {
        completions.set(pair, {
          sessionId: event.sessionId,
          time: event.clientTimestamp,
        });
      }
    }
  }

  const eligible = new Set<string>();
  const converted = new Set<string>();

  for (const [pair, completion] of completions) {
    eligible.add(completion.sessionId);
    const viewed = views.get(pair);

    if (viewed !== undefined && viewed >= completion.time) {
      converted.add(completion.sessionId);
    }
  }

  return {
    conversionRate: eligible.size === 0 ? null : converted.size / eligible.size,
    converted: converted.size,
    dropOff: eligible.size - converted.size,
    eligible: eligible.size,
    sourceStepId,
    targetStepId,
  };
};

const cohortAnalytics = (
  configuration: FunnelConfiguration,
  variant: "A" | "B",
  campaign: string | null,
  events: readonly StoredFunnelEvent[]
): AnalyticsCohort => {
  const scoped = events.filter(
    (event) => initialCampaign(event.utm.campaign) === campaign
  );

  return {
    campaign,
    edges: configuration.steps.flatMap((step) => {
      const targets = new Set<string>();

      if (step.next !== undefined) {
        targets.add(step.next);
      }

      if (step.transition !== undefined) {
        targets.add(step.transition.default);

        for (const branch of step.transition.branches) {
          targets.add(branch.next);
        }
      }

      return [...targets].map((target) =>
        edgeAnalytics(step.id, target, scoped)
      );
    }),
    name: configuration.name,
    steps: configuration.steps.map((step) => stepAnalytics(step, scoped)),
    summary: summarizeSessions(scoped),
    variant,
    version: configuration.id,
  };
};

export const aggregateAnalytics = (
  snapshot: AnalyticsSnapshot,
  filter: AnalyticsFilter
): AnalyticsReport => {
  const events = snapshot.events.filter((event) =>
    matchesFilter(event, filter)
  );

  const configurations = snapshot.configurations.toSorted((left, right) =>
    left.id.localeCompare(right.id)
  );

  const cohorts: AnalyticsCohort[] = [];
  const comparisons: VariantComparison[] = [];

  for (const configuration of configurations) {
    if (filter.version !== undefined && configuration.id !== filter.version) {
      continue;
    }

    for (const variant of ["A", "B"] as const) {
      if (filter.variant !== undefined && variant !== filter.variant) {
        continue;
      }

      const resolved = resolveVariant(configuration, variant);

      const scoped = events.filter(
        (event) =>
          event.version === configuration.id && event.variant === variant
      );

      comparisons.push({
        name: resolved.name,
        summary: summarizeSessions(scoped),
        variant,
        version: configuration.id,
      });

      const campaigns = new Set(
        scoped.map((event) => initialCampaign(event.utm.campaign))
      );

      if (campaigns.size === 0) {
        campaigns.add(initialCampaign(filter.campaign));
      }

      for (const campaign of [...campaigns].toSorted((left, right) =>
        (left ?? "").localeCompare(right ?? "")
      )) {
        cohorts.push(cohortAnalytics(resolved, variant, campaign, scoped));
      }
    }
  }

  return {
    campaigns: [
      ...new Set(
        snapshot.events.map((event) => initialCampaign(event.utm.campaign))
      ),
    ].toSorted((left, right) => (left ?? "").localeCompare(right ?? "")),
    capturedAt: snapshot.capturedAt,
    cohorts,
    comparisons,
    summary: summarizeSessions(events),
    versions: configurations.map((configuration) => ({
      name: configuration.name,
      version: configuration.id,
    })),
  };
};

const analytics = implement(
  analyticsContract,
  Effect.fn("analytics")(function* analytics(filter) {
    const store = yield* FunnelAnalytics;

    return aggregateAnalytics(yield* store.snapshot(), filter);
  })
);

export const funnelAnalyticsCapabilities = [analytics] as const;
