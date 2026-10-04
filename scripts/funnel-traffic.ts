import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, DateTime, Effect, Layer, Match, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

import camp from "../configurations/iteration-one/camp.json" with { type: "json" };
import { AnalyticsReportSchema } from "../packages/core/src/funnel/analytics-contracts.js";
import type { AnalyticsReport } from "../packages/core/src/funnel/analytics-contracts.js";
import type { Answer } from "../packages/core/src/funnel/configuration.js";
import {
  ingestEventsContract,
  loadSessionEventsContract,
  SessionViewSchema,
} from "../packages/core/src/funnel/contracts.js";
import type { FunnelEvent } from "../packages/core/src/funnel/contracts.js";
import { VersionStateSchema } from "../packages/core/src/funnel/version-contracts.js";
import {
  expectedSummaries,
  manualRoute,
  populations,
  reference,
} from "./traffic/first-iteration.js";
import type { Family, Variant } from "./traffic/first-iteration.js";

class TrafficFailure extends Schema.TaggedError<TrafficFailure>()(
  "TrafficFailure",
  { message: Schema.String }
) {}

const verify = (matches: boolean, message: string) =>
  matches ? Effect.void : Effect.fail(new TrafficFailure({ message }));

type TrafficBody =
  | { events: readonly FunnelEvent[] }
  | { configuration: typeof camp }
  | {
      variant: Variant;
      utm: { campaign: string; medium: string; source: string };
    }
  | { answer: Answer; stepId: string }
  | Record<string, never>;

const request = Effect.fnUntraced(function* request<S extends Schema.Top>(
  url: string,
  path: string,
  schema: S,
  body?: TrafficBody
) {
  const response = yield* body === undefined
    ? HttpClient.get(`${url}/api${path}`)
    : HttpClient.post(`${url}/api${path}`, { body: HttpBody.jsonUnsafe(body) });

  if (response.status !== 200) {
    const failure = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({
            _tag: Schema.String,
            message: Schema.String,
          })
        )
      ),
      Effect.map((error) => `${error._tag}: ${error.message.slice(0, 1000)}`),
      Effect.orElseSucceed(
        () => "The response did not contain a domain failure."
      )
    );

    return yield* new TrafficFailure({
      message: `${path}: HTTP ${response.status}: ${failure}. Mutations are not retried.`,
    });
  }

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema))
  );
});

const checkReport = Effect.fnUntraced(function* checkReport(
  report: AnalyticsReport,
  explore: boolean,
  trailVersion: string,
  campVersion: string
) {
  yield* verify(
    JSON.stringify([
      report.summary.started,
      report.summary.resultReached,
      report.summary.resultViewers,
      report.summary.ctaClickers,
      report.summary.resultReachRate,
      report.summary.ctaCtr,
    ]) ===
      JSON.stringify(
        explore
          ? [80, 32, 32, 24, 2 / 5, 3 / 4]
          : [40, 24, 24, 16, 3 / 5, 2 / 3]
      ),
    "Campaign summary/rates differ from the manual population."
  );

  const participating = report.cohorts.filter(
    (cohort) => cohort.summary.started > 0
  );

  yield* verify(
    participating.length === 4 &&
      report.comparisons.filter((comparison) => comparison.summary.started > 0)
        .length === 4,
    "Each campaign must have exactly two versions and two variants."
  );

  for (const cohort of participating) {
    yield* verify(
      cohort.version === trailVersion || cohort.version === campVersion,
      "Unexpected version in the isolated traffic cohort."
    );

    const expected = reference(
      cohort.version === trailVersion ? "trail" : "camp",
      cohort.variant,
      explore
    );

    yield* verify(
      JSON.stringify([
        cohort.summary.started,
        cohort.summary.resultReached,
        cohort.summary.ctaClickers,
      ]) === JSON.stringify(explore ? [20, 8, 6] : [10, 6, 4]),
      `Wrong population for ${cohort.version}/${cohort.variant}.`
    );
    yield* verify(
      cohort.steps.length === 7 &&
        cohort.edges.length === Object.keys(expected.edges).length,
      "Configured step/edge inventory differs from the manual routes."
    );

    for (const step of cohort.steps) {
      yield* verify(
        JSON.stringify([step.viewers, step.completers]) ===
          JSON.stringify(expected.steps[step.stepId]),
        `Step counts differ: ${cohort.version}/${cohort.variant}/${step.stepId}.`
      );
      yield* verify(
        step.dropOff === step.viewers - step.completers &&
          step.completionRate ===
            (step.viewers === 0 ? null : step.completers / step.viewers),
        "Step denominator differs."
      );
    }

    for (const edge of cohort.edges) {
      yield* verify(
        JSON.stringify([edge.eligible, edge.converted]) ===
          JSON.stringify(
            expected.edges[`${edge.sourceStepId}:${edge.targetStepId}`]
          ),
        `Edge counts differ: ${cohort.version}/${cohort.variant}/${edge.sourceStepId}->${edge.targetStepId}.`
      );
      yield* verify(
        edge.dropOff === edge.eligible - edge.converted &&
          edge.conversionRate ===
            (edge.eligible === 0 ? null : edge.converted / edge.eligible),
        "Edge denominator differs."
      );
    }
  }
});

export const runTraffic = Effect.fn("runTraffic")(function* runTraffic(
  url: string,
  seed: number
) {
  const startedAt = yield* DateTime.now;
  const runId = `${DateTime.toEpochMillis(startedAt)}-${seed}`;

  const campaigns = {
    direct: `traffic-${runId}-direct`,
    explore: `traffic-${runId}-explore`,
  };

  const campVersion = `traffic-camp-${runId}`;
  const initial = yield* request(url, "/versions", VersionStateSchema);
  yield* verify(
    initial.activeVersion === "trail-branches-v1",
    "Traffic supports the fictional trail-branches-v1 initial configuration. Restore it before running."
  );

  for (const campaign of Object.values(campaigns)) {
    const existing = yield* request(
      url,
      `/analytics?campaign=${encodeURIComponent(campaign)}`,
      AnalyticsReportSchema
    );

    yield* verify(
      existing.summary.started === 0,
      "Traffic campaign already exists; choose a fresh run."
    );
  }

  yield* Console.error(
    JSON.stringify({
      campaigns,
      initialVersion: initial.activeVersion,
      publishedVersion: campVersion,
      runId,
      seed,
      sessionsPlanned: 120,
    })
  );

  let randomState =
    (((seed % 2_147_483_646) + 2_147_483_646) % 2_147_483_646) + 1;

  const nextOrder = () => {
    randomState = (randomState * 16_807) % 2_147_483_647;

    return randomState;
  };

  const planned = (["A", "B"] as const)
    .flatMap((variant) =>
      (["explore", "direct"] as const).flatMap((campaign) =>
        populations.flatMap((population) =>
          Array.from({ length: population[campaign] }, (_, index) => ({
            campaign,
            click:
              index <
              population[
                campaign === "explore" ? "exploreClicks" : "directClicks"
              ],
            order: nextOrder(),
            profile: population.profile,
            variant,
          }))
        )
      )
    )
    .toSorted((left, right) => left.order - right.order);

  const journey = Effect.fnUntraced(function* journey(
    family: Family,
    version: string,
    plan: (typeof planned)[number]
  ) {
    let view = yield* request(url, "/sessions", SessionViewSchema, {
      utm: {
        campaign: campaigns[plan.campaign],
        medium: "script",
        source: "fictional-traffic",
      },
      variant: plan.variant,
    });

    yield* verify(
      view.session.version === version && view.session.variant === plan.variant,
      "Session creation did not pin the planned version/variant."
    );
    const events: FunnelEvent[] = [];
    const repeats: FunnelEvent[] = [];
    let sequence = 0;
    let repeating = false;

    const record = (
      type: string,
      stepId: string,
      properties: Record<string, string | number>
    ) => {
      sequence += 1;
      (repeating ? repeats : events).push({
        clientTimestamp: DateTime.formatIso(
          DateTime.add(startedAt, { milliseconds: sequence })
        ),
        eventId: `${view.session.id}:traffic-${sequence}`,
        properties,
        sessionId: view.session.id,
        stepId,
        type,
        utm: view.session.utm,
        variant: plan.variant,
        version,
      });
    };

    const display = (stepId: string) => {
      record("step_viewed", stepId, {
        routeRevision: view.session.routeRevision,
      });

      if (stepId === "result") {
        record("result_viewed", stepId, {
          routeRevision: view.session.routeRevision,
        });
      }
    };

    const advance = Effect.fnUntraced(function* advance(
      source: string,
      target: string,
      long: boolean,
      show: boolean
    ) {
      yield* verify(
        view.session.currentStep === source,
        `Expected current step ${source}.`
      );

      const answer = Match.value(source).pipe(
        Match.when("pace", (): Answer =>
          family === "trail" && long ? "active" : "gentle"
        ),
        Match.when("interests", (): Answer =>
          family === "camp" && long ? ["forest", "water"] : ["forest"]
        ),
        Match.when("hours", (): Answer => 2 + (plan.order % 3)),
        Match.when("supplies", (): Answer => "boots"),
        Match.orElse((): Answer => null)
      );

      view = yield* request(
        url,
        `/sessions/${view.session.id}/advance`,
        SessionViewSchema,
        { answer, stepId: source }
      );
      yield* verify(
        view.session.currentStep === target,
        `Manual transition ${source}->${target} did not occur.`
      );

      if (["pace", "interests", "hours", "supplies"].includes(source)) {
        record("answer_submitted", source, {
          routeRevision: view.session.routeRevision,
        });
      }

      record("step_completed", source, {
        nextStepId: target,
        routeRevision: view.session.routeRevision,
      });

      if (show) {
        display(target);
      }
    });

    const back = Effect.fnUntraced(function* back(
      source: string,
      target: string
    ) {
      view = yield* request(
        url,
        `/sessions/${view.session.id}/back`,
        SessionViewSchema,
        {}
      );
      yield* verify(
        view.session.currentStep === target,
        `Manual Back ${source}->${target} did not occur.`
      );
      record("back_clicked", source, {
        routeRevision: view.session.routeRevision,
        targetStepId: target,
      });
      display(target);
    });

    display("welcome");
    const long = ["long", "optional", "edited"].includes(plan.profile);
    const route = manualRoute(family, plan.variant, long);
    const branch = family === "trail" ? "pace" : "interests";
    const optional = family === "trail" ? "supplies" : "waterside";

    const walk = Effect.fnUntraced(function* walkManualRoute() {
      if (plan.profile !== "welcome") {
        for (let index = 0; index < route.length - 1; index += 1) {
          const source = route[index];
          const target = route[index + 1];

          if (source === undefined || target === undefined) {
            break;
          }

          if (plan.profile === "first" && index === 1) {
            break;
          }

          if (plan.profile === "optional" && source === optional) {
            break;
          }

          yield* advance(
            source,
            target,
            long,
            !(plan.profile === "gap" && source === branch)
          );

          if (source === branch) {
            yield* verify(
              JSON.stringify(view.route) === JSON.stringify(route),
              "Resolved route differs from the independently authored route."
            );
          }

          if (plan.profile === "gap" && source === branch) {
            break;
          }

          if (plan.profile === "edited" && source === optional) {
            yield* back(target, optional);
            yield* back(optional, branch);
            const short = manualRoute(family, plan.variant, false);
            const start = short.indexOf(branch);

            for (
              let shortIndex = start;
              shortIndex < short.length - 1;
              shortIndex += 1
            ) {
              const from = short[shortIndex];
              const to = short[shortIndex + 1];

              if (from !== undefined && to !== undefined) {
                yield* advance(from, to, false, true);
              }
            }

            yield* verify(
              view.session.routeRevision === 2 &&
                view.session.answers[optional] === undefined &&
                !view.session.history.includes(optional),
              "Edited session retained abandoned branch state."
            );
            break;
          }
        }
      }
    });

    yield* walk();

    if (view.session.currentStep === "result") {
      if (plan.click) {
        record("cta_clicked", "result", {
          routeRevision: view.session.routeRevision,
        });
      }

      repeating = true;
      yield* back("result", "prepare");
      yield* advance("prepare", "result", plan.profile === "long", true);

      if (plan.click) {
        record("cta_clicked", "result", {
          routeRevision: view.session.routeRevision,
        });
      }
    }

    const restored = yield* request(
      url,
      `/sessions/${view.session.id}`,
      SessionViewSchema
    );

    yield* verify(
      JSON.stringify(restored.session) === JSON.stringify(view.session),
      "Resume changed a traffic session's pinned state."
    );

    const delivered = yield* request(
      url,
      "/events",
      ingestEventsContract.output,
      { events: [...events.toReversed(), ...events.slice(0, 1)] }
    ).pipe(
      Effect.tapError((error) =>
        Console.error(
          JSON.stringify({
            batchLength: events.length + 1,
            failure: Schema.is(TrafficFailure)(error)
              ? error.message
              : "Initial event delivery failed.",
            family,
            profile: plan.profile,
            variant: plan.variant,
            version,
          })
        )
      )
    );

    yield* verify(
      delivered.results
        .slice(0, events.length)
        .every((receipt) => receipt.status === "accepted") &&
        delivered.results.at(-1)?.status === "duplicate",
      "Initial reversed event batch did not isolate its duplicate."
    );

    return {
      events,
      receipts: delivered.results.slice(0, events.length),
      repeats,
      view,
    };
  });

  yield* Console.error("TRAFFIC_PHASE create-trail-sessions");

  const trailSessions = yield* Effect.forEach(
    planned,
    (plan) => journey("trail", initial.activeVersion, plan),
    { concurrency: 8 }
  );

  yield* Console.error("TRAFFIC_PHASE publish-and-create-camp-sessions");

  const sessions = yield* Effect.acquireUseRelease(
    request(url, "/versions", VersionStateSchema, {
      configuration: {
        ...camp,
        id: campVersion,
        name: `Fictional traffic camp ${runId}`,
      },
    }),
    () =>
      Effect.forEach(planned, (plan) => journey("camp", campVersion, plan), {
        concurrency: 8,
      }).pipe(
        Effect.map((campSessions) => [...trailSessions, ...campSessions])
      ),
    () =>
      Effect.gen(function* restoreInitial() {
        const current = yield* request(url, "/versions", VersionStateSchema);
        yield* verify(
          current.activeVersion === campVersion &&
            current.history[0]?.previousVersion === initial.activeVersion,
          "An external activation intervened; refusing to roll it back."
        );

        const restored = yield* request(
          url,
          "/versions/rollback",
          VersionStateSchema,
          {}
        );

        yield* verify(
          restored.activeVersion === initial.activeVersion,
          "One rollback did not restore the initial active version."
        );
      }).pipe(Effect.orDie)
  );

  const query = (campaign: string) =>
    request(
      url,
      `/analytics?campaign=${encodeURIComponent(campaign)}`,
      AnalyticsReportSchema
    );

  yield* Console.error("TRAFFIC_PHASE initial-metrics");

  const before = {
    direct: yield* query(campaigns.direct),
    explore: yield* query(campaigns.explore),
  };

  yield* checkReport(before.explore, true, initial.activeVersion, campVersion);
  yield* checkReport(before.direct, false, initial.activeVersion, campVersion);
  yield* Console.error("TRAFFIC_PHASE replay-and-repeat-actions");

  yield* Effect.forEach(
    sessions,
    (session) =>
      Effect.gen(function* replay() {
        const replayed = yield* request(
          url,
          "/events",
          ingestEventsContract.output,
          {
            events: session.events.map((event) => ({
              ...event,
              properties: Object.fromEntries(
                Object.entries(event.properties).toReversed()
              ),
              utm: Object.fromEntries(Object.entries(event.utm).toReversed()),
            })),
          }
        );

        yield* verify(
          replayed.results.every(
            (receipt) =>
              receipt.status === "duplicate" &&
              receipt.serverTimestamp ===
                session.receipts.find(
                  (original) => original.eventId === receipt.eventId
                )?.serverTimestamp
          ),
          "Replay changed a receipt or inserted an event."
        );

        if (session.repeats.length > 0) {
          const repeated = yield* request(
            url,
            "/events",
            ingestEventsContract.output,
            { events: session.repeats.toReversed() }
          );

          yield* verify(
            repeated.results.every((receipt) => receipt.status === "accepted"),
            "Real repeated action events were rejected."
          );
        }
      }),
    { concurrency: 8 }
  );
  yield* Console.error("TRAFFIC_PHASE conflicting-id");

  const [sample] = sessions;
  yield* verify(sample !== undefined, "No traffic sessions created.");

  if (sample !== undefined && sample.events[0] !== undefined) {
    const conflict = yield* request(
      url,
      "/events",
      ingestEventsContract.output,
      {
        events: [
          {
            ...sample.events[0],
            clientTimestamp: DateTime.formatIso(
              DateTime.add(startedAt, { hours: 1 })
            ),
          },
        ],
      }
    );

    yield* verify(
      conflict.results[0]?.status === "rejected" &&
        conflict.results[0]?.error ===
          "This event ID was already used with different content.",
      "Conflicting event ID was not rejected."
    );

    const stored = yield* request(
      url,
      `/sessions/${sample.view.session.id}/events`,
      loadSessionEventsContract.output
    );

    yield* verify(
      stored.filter((event) => event.type === "session_started").length === 1 &&
        stored.find((event) => event.eventId === sample.events[0]?.eventId)
          ?.clientTimestamp === sample.events[0].clientTimestamp,
      "Conflict altered original event or start count."
    );
  }

  yield* Console.error("TRAFFIC_PHASE final-metrics-and-filters");

  const explore = yield* query(campaigns.explore);
  const direct = yield* query(campaigns.direct);
  yield* checkReport(explore, true, initial.activeVersion, campVersion);
  yield* checkReport(direct, false, initial.activeVersion, campVersion);
  const filters = [];

  for (const campaign of [campaigns.explore, campaigns.direct]) {
    const exploreCampaign = campaign === campaigns.explore;
    const expectedCombined = exploreCampaign ? [40, 16, 12] : [20, 12, 8];
    const expectedCell = exploreCampaign ? [20, 8, 6] : [10, 6, 4];

    for (const variant of ["A", "B"] as const) {
      const report = yield* request(
        url,
        `/analytics?campaign=${encodeURIComponent(campaign)}&variant=${variant}`,
        AnalyticsReportSchema
      );

      yield* verify(
        JSON.stringify([
          report.summary.started,
          report.summary.resultReached,
          report.summary.ctaClickers,
        ]) === JSON.stringify(expectedCombined),
        "Variant filter differs from the independent reference."
      );
      filters.push({ campaign, summary: report.summary, variant });
    }

    for (const version of [initial.activeVersion, campVersion]) {
      const report = yield* request(
        url,
        `/analytics?campaign=${encodeURIComponent(campaign)}&version=${encodeURIComponent(version)}`,
        AnalyticsReportSchema
      );

      yield* verify(
        JSON.stringify([
          report.summary.started,
          report.summary.resultReached,
          report.summary.ctaClickers,
        ]) === JSON.stringify(expectedCombined),
        "Version filter differs from the independent reference."
      );
      filters.push({ campaign, summary: report.summary, version });

      for (const variant of ["A", "B"] as const) {
        const cell = yield* request(
          url,
          `/analytics?campaign=${encodeURIComponent(campaign)}&version=${encodeURIComponent(version)}&variant=${variant}`,
          AnalyticsReportSchema
        );

        yield* verify(
          JSON.stringify([
            cell.summary.started,
            cell.summary.resultReached,
            cell.summary.ctaClickers,
          ]) === JSON.stringify(expectedCell),
          "Combined filters differ from the independent reference."
        );
        filters.push({ campaign, summary: cell.summary, variant, version });
      }
    }
  }

  const empty = yield* query(`traffic-${runId}-missing`);
  yield* verify(
    JSON.stringify(empty.summary) ===
      JSON.stringify({
        ctaClickers: 0,
        ctaCtr: null,
        resultReachRate: null,
        resultReached: 0,
        resultViewers: 0,
        started: 0,
      }),
    "Empty campaign rates must be unavailable."
  );
  const restored = yield* request(url, "/versions", VersionStateSchema);
  const acceptedAt = DateTime.formatIso(yield* DateTime.now);

  return {
    acceptedAt,
    campaigns,
    conflictingIdRejected: true,
    direct,
    expected: expectedSummaries,
    explore,
    filters,
    matched: true,
    reference: {
      campDirect: reference("camp", "A", false),
      campExplore: reference("camp", "A", true),
      trailADirect: reference("trail", "A", false),
      trailAExplore: reference("trail", "A", true),
      trailBDirect: reference("trail", "B", false),
      trailBExplore: reference("trail", "B", true),
    },
    replayedSessions: sessions.length,
    restoredVersion: restored.activeVersion,
    runId,
    seed,
    sessionsCreated: sessions.length,
    startedAt: DateTime.formatIso(startedAt),
    summary: {
      ctaClickers: explore.summary.ctaClickers + direct.summary.ctaClickers,
      resultReached:
        explore.summary.resultReached + direct.summary.resultReached,
      started: explore.summary.started + direct.summary.started,
    },
    versions: { camp: campVersion, trail: initial.activeVersion },
  };
});

if (import.meta.main) {
  const command = Command.make(
    "funnel-traffic",
    {
      seed: Flag.Int("seed").pipe(Flag.withDefault(20_261_004)),
      url: Argument.String("website-url"),
    },
    Effect.fn(function* trafficCommand({ url, seed }) {
      const report = yield* runTraffic(url.replace(/\/$/u, ""), seed);
      yield* Console.log(JSON.stringify(report, null, 2));
    })
  );

  NodeRuntime.runMain(
    command.pipe(
      Command.run({ version: "1.0.0" }),
      Effect.provide(Layer.merge(FetchHttpClient.layer, NodeServices.layer))
    )
  );
}
