import {
  AnalyticsReportSchema,
  ingestEventsContract,
  SessionViewSchema,
  StoredFunnelEventSchema,
  VersionStateSchema,
} from "@core/core/contracts";
import type { FunnelEvent } from "@core/core/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { expect } from "e2e";
import {
  Crypto,
  Data,
  DateTime,
  Effect,
  FileSystem,
  Schedule,
  Schema,
} from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

import secondTrail from "../../../../configurations/iteration-two/trail.json" with { type: "json" };
import { test } from "./browser-ready.js";

class EventsPending extends Data.TaggedError("EventsPending")<{
  message: string;
}> {}

const uuid = Crypto.Crypto.use((crypto) => crypto.randomUUIDv4).pipe(
  Effect.provide(NodeCrypto.layer)
);

const load = Effect.fn("iterationTwo.load")(function* load(
  baseUrl: string,
  id: string
) {
  const response = yield* HttpClient.get(`${baseUrl}/api/sessions/${id}`);
  expect(response.status).toBe(200);

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

const eventsFor = Effect.fn("iterationTwo.eventsFor")(
  function* eventsFor(
    baseUrl: string,
    id: string,
    expected: Record<string, number>
  ) {
    const response = yield* HttpClient.get(
      `${baseUrl}/api/sessions/${id}/events`
    );

    expect(response.status).toBe(200);

    const events = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    if (
      !Object.entries(expected).every(
        ([type, count]) =>
          events.filter((event) => event.type === type).length >= count
      )
    ) {
      return yield* new EventsPending({
        message:
          "The real delivery queue has not finished this session's expected events.",
      });
    }

    return events;
  },
  Effect.retry({
    schedule: Schedule.spaced("500 millis"),
    times: 60,
    while: (failure) => failure instanceof EventsPending,
  }),
  Effect.provide(FetchHttpClient.layer)
);

const report = Effect.fn("iterationTwo.report")(function* report(
  baseUrl: string,
  campaign: string,
  version: string
) {
  const response = yield* HttpClient.get(
    `${baseUrl}/api/analytics?campaign=${encodeURIComponent(campaign)}&version=${encodeURIComponent(version)}`
  );

  expect(response.status).toBe(200);

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AnalyticsReportSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

const state = Effect.fn("iterationTwo.state")(function* state(baseUrl: string) {
  const response = yield* HttpClient.get(`${baseUrl}/api/versions`);
  expect(response.status).toBe(200);

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

const send = Effect.fn("iterationTwo.send")(function* send(
  baseUrl: string,
  events: readonly FunnelEvent[]
) {
  const response = yield* HttpClient.post(`${baseUrl}/api/events`, {
    body: HttpBody.jsonUnsafe({ events }),
  });

  expect(response.status).toBe(200);

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ingestEventsContract.output))
  );
}, Effect.provide(FetchHttpClient.layer));

test(
  "keeps original B and second-iteration A/B sessions intact through JSON publication and rollback",
  { timeout: 180_000 },
  // @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
  async ({ app, browser, screen }) => {
    const baseUrl = Schema.decodeUnknownSync(Schema.String)(app.baseUrl);
    const run = await Effect.runPromise(uuid);
    const originalCampaign = `iteration-two-browser-old-${run}`;
    const nextCampaign = `iteration-two-browser-new-${run}`;

    const configuration = {
      ...secondTrail,
      id: `iteration-two-browser-${run}`,
    };

    const before = await Effect.runPromise(state(baseUrl));
    expect(before.activeVersion).toBe("trail-branches-v1");

    const directory = await Effect.runPromise(
      FileSystem.FileSystem.use((fs) =>
        fs.makeTempDirectory({ prefix: "funnel-iteration-two-" })
      ).pipe(Effect.provide(NodeFileSystem.layer))
    );

    const uploadPath = `${directory}/configuration.json`;
    let published = false;
    let restored = false;
    let publishedAt: string | undefined;
    let rolledBackAt: string | undefined;

    try {
      await Effect.runPromise(
        FileSystem.FileSystem.use((fs) =>
          fs.writeFileString(uploadPath, JSON.stringify(configuration))
        ).pipe(Effect.provide(NodeFileSystem.layer))
      );
      await browser.setViewport({ height: 1800, width: 1280 });
      await app.open(
        `/?variant=B&utm_campaign=${originalCampaign}&utm_source=fictional-compatibility`
      );
      await expect(
        screen.getByRole("heading", "Build your weekend trail plan")
      ).toBeVisible();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "How many hours do you have?")
      ).toBeVisible();
      await screen
        .getByRole("spinbutton", "How many hours do you have?")
        .fill("3");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Choose your pace")
      ).toBeVisible();
      await screen.getByRole("radio", "Gentle stroll").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "What would you like to see?")
      ).toBeVisible();
      await screen.getByRole("checkbox", "Forest").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Before you head out")
      ).toBeVisible();

      const originalId = Schema.decodeUnknownSync(Schema.String)(
        await browser.evaluate(() => localStorage.getItem("funnel-session"))
      );

      const originalB = await Effect.runPromise(load(baseUrl, originalId));
      expect(originalB.session).toMatchObject({
        answers: { hours: 3, interests: ["forest"], pace: "gentle" },
        currentStep: "prepare",
        variant: "B",
        version: before.activeVersion,
      });
      await Effect.runPromise(
        eventsFor(baseUrl, originalId, {
          session_started: 1,
          step_completed: 4,
          step_viewed: 5,
        })
      );

      const oldBaseline = await Effect.runPromise(
        report(baseUrl, originalCampaign, before.activeVersion)
      );

      expect(oldBaseline.summary).toEqual({
        ctaClickers: 0,
        ctaCtr: null,
        resultReachRate: 0,
        resultReached: 0,
        resultViewers: 0,
        started: 1,
      });
      await app.screenshot("iteration-two-original-b-preparation");

      await screen.getByRole("link", "Manage versions").tap();
      await expect(
        screen.getByRole("heading", "Funnel versions")
      ).toBeVisible();
      await screen.getByLabel("Configuration JSON").setInputFiles(uploadPath);
      published = true;
      await screen.getByRole("button", "Publish version").tap();
      const active = screen.getByRole("region", "Active version");
      await expect(active.getByText(configuration.id)).toBeVisible();
      publishedAt = await Effect.runPromise(
        DateTime.now.pipe(Effect.map(DateTime.formatIso))
      );
      await expect(
        screen
          .getByRole("region", "Activation history")
          .getByText(
            `publish · ${configuration.id} · previous ${before.activeVersion}`
          )
      ).toBeVisible();
      await app.screenshot("iteration-two-published-history");
      await screen.getByRole("link", "Open funnel").tap();
      await expect(
        screen.getByRole("heading", "Before you head out")
      ).toBeVisible();
      expect(await Effect.runPromise(load(baseUrl, originalId))).toEqual(
        originalB
      );
      await app.screenshot("iteration-two-old-b-retains-preparation");

      await app.open(
        `/?variant=B&utm_campaign=${nextCampaign}&utm_source=fictional-compatibility`
      );
      await expect(
        screen.getByRole("heading", "Before you head out")
      ).toBeVisible();
      await screen.getByRole("button", "Start new session").tap();
      await expect(
        screen.getByRole("heading", "Build your weekend trail plan")
      ).toBeVisible();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "How many hours do you have?")
      ).toBeVisible();
      await screen
        .getByRole("spinbutton", "How many hours do you have?")
        .fill("4");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Plan a fictional rest stop")
      ).toBeVisible();
      await app.screenshot("iteration-two-new-b-rest-branch");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Choose your pace")
      ).toBeVisible();
      await screen.getByRole("radio", "Active hike").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Choose your trail supplies")
      ).toBeVisible();
      await screen.getByRole("radio", "Hiking boots").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "What would you like to see?")
      ).toBeVisible();
      await screen.getByRole("checkbox", "Forest").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Your next trail starts here")
      ).toBeVisible();

      const nextBId = Schema.decodeUnknownSync(Schema.String)(
        await browser.evaluate(() => localStorage.getItem("funnel-session"))
      );

      const nextB = await Effect.runPromise(load(baseUrl, nextBId));
      expect(nextB.session.version).toBe(configuration.id);
      expect(nextB.route).toEqual([
        "welcome",
        "hours",
        "rest",
        "pace",
        "supplies",
        "interests",
        "result",
      ]);
      expect(nextB.configuration.steps.map((step) => step.id)).toEqual([
        "welcome",
        "pace",
        "supplies",
        "interests",
        "hours",
        "rest",
        "result",
      ]);
      await app.screenshot("iteration-two-new-b-shortened-result");

      const departures: string[] = [];
      // @effect-diagnostics-next-line asyncFunction:off -- Observe the real external CTA request without inventing a destination response.
      await browser.route("https://www.nps.gov/**", async (route) => {
        departures.push(route.request.url);
        await route.abort();
      });
      await screen.getByRole("link", "Find your next trail").tap();
      expect(departures).toContain(
        "https://www.nps.gov/subjects/trails/index.htm"
      );
      await browser.unroute("https://www.nps.gov/**");
      await app.open(
        `/?variant=A&utm_campaign=${nextCampaign}&utm_source=fictional-compatibility`
      );
      await expect(
        screen.getByRole("heading", "Your next trail starts here")
      ).toBeVisible();

      const newBEvents = await Effect.runPromise(
        eventsFor(baseUrl, nextBId, {
          cta_clicked: 1,
          information_acknowledged: 1,
          result_viewed: 1,
          step_completed: 6,
        })
      );

      const acknowledgements = newBEvents.filter(
        (event) => event.type === "information_acknowledged"
      );

      expect(acknowledgements).toHaveLength(1);
      const [acknowledgement] = acknowledgements;

      if (acknowledgement === undefined) {
        throw new Error(
          "The accepted rest completion did not emit its declared event."
        );
      }

      expect(acknowledgement).toMatchObject({
        properties: { acknowledged: true, screen: "rest" },
        stepId: "rest",
        variant: "B",
        version: configuration.id,
      });
      expect(
        newBEvents.every(
          (event) =>
            !Object.keys(event.properties).some((key) =>
              ["answer", "email", "text", "url"].includes(key)
            )
        )
      ).toBe(true);
      const { serverTimestamp, ...originalEvent } = acknowledgement;
      const replay = await Effect.runPromise(send(baseUrl, [originalEvent]));
      expect(replay.results[0]).toMatchObject({
        serverTimestamp,
        status: "duplicate",
      });

      const privateEvent = {
        ...originalEvent,
        eventId: await Effect.runPromise(uuid),
        properties: {
          ...originalEvent.properties,
          email: "fictional@example.invalid",
        },
      };

      const privateReceipt = await Effect.runPromise(
        send(baseUrl, [privateEvent])
      );

      expect(privateReceipt.results[0]?.status).toBe("rejected");

      const originalEvents = await Effect.runPromise(
        eventsFor(baseUrl, originalId, { session_started: 1 })
      );

      const oldEvent = {
        ...originalEvent,
        eventId: await Effect.runPromise(uuid),
        sessionId: originalId,
        stepId: "prepare",
        utm: originalB.session.utm,
        version: originalB.session.version,
      };

      const oldReceipt = await Effect.runPromise(send(baseUrl, [oldEvent]));
      expect(oldReceipt.results[0]?.status).toBe("rejected");
      expect(
        await Effect.runPromise(
          eventsFor(baseUrl, originalId, { session_started: 1 })
        )
      ).toEqual(originalEvents);

      await screen.getByRole("button", "Start new session").tap();
      await expect(
        screen.getByRole("heading", "Plan a fictional weekend trail")
      ).toBeVisible();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Choose your pace")
      ).toBeVisible();
      await screen.getByRole("radio", "Gentle stroll").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "What would you like to see?")
      ).toBeVisible();
      await screen.getByRole("checkbox", "Forest").check();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "How many hours do you have?")
      ).toBeVisible();
      await screen
        .getByRole("spinbutton", "How many hours do you have?")
        .fill("4");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Plan a fictional rest stop")
      ).toBeVisible();
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Before you head out")
      ).toBeVisible();
      await app.screenshot("iteration-two-new-a-retains-preparation");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Your sample trail plan is ready")
      ).toBeVisible();

      const nextAId = Schema.decodeUnknownSync(Schema.String)(
        await browser.evaluate(() => localStorage.getItem("funnel-session"))
      );

      const nextA = await Effect.runPromise(load(baseUrl, nextAId));
      expect(nextA.route).toEqual([
        "welcome",
        "pace",
        "interests",
        "hours",
        "rest",
        "prepare",
        "result",
      ]);

      const newAEvents = await Effect.runPromise(
        eventsFor(baseUrl, nextAId, {
          information_acknowledged: 1,
          result_viewed: 1,
          step_completed: 6,
        })
      );

      expect(
        newAEvents.filter((event) => event.type === "information_acknowledged")
      ).toHaveLength(1);
      expect(
        newAEvents.find((event) => event.type === "information_acknowledged")
          ?.properties
      ).toEqual({ acknowledged: true, screen: "rest" });

      const oldAfter = await Effect.runPromise(
        report(baseUrl, originalCampaign, before.activeVersion)
      );

      expect(oldAfter.summary).toEqual(oldBaseline.summary);
      expect(oldAfter.cohorts).toEqual(oldBaseline.cohorts);

      const newBaseline = await Effect.runPromise(
        report(baseUrl, nextCampaign, configuration.id)
      );

      expect(newBaseline.summary).toEqual({
        ctaClickers: 1,
        ctaCtr: 0.5,
        resultReachRate: 1,
        resultReached: 2,
        resultViewers: 2,
        started: 2,
      });
      expect(
        newBaseline.cohorts
          .find((cohort) => cohort.variant === "B")
          ?.steps.some((step) => step.stepId === "prepare")
      ).toBe(false);
      expect(
        newBaseline.cohorts
          .find((cohort) => cohort.variant === "A")
          ?.steps.find((step) => step.stepId === "prepare")
      ).toMatchObject({ completers: 1, viewers: 1 });
      await app.open(
        `/internal/analytics?campaign=${nextCampaign}&version=${configuration.id}`
      );
      await expect(
        screen.getByRole("heading", "Funnel analytics")
      ).toBeVisible();
      await expect(
        screen.getByRole("region", "Started sessions").getByText("2")
      ).toBeVisible();
      await expect(
        screen
          .getByRole("region", "Result reach")
          .getByText("2 / 2 started sessions")
      ).toBeVisible();
      await expect(
        screen.getByRole("region", "CTA CTR").getByText("1 / 2 result viewers")
      ).toBeVisible();
      await app.screenshot("iteration-two-version-scoped-analytics");

      await app.open("/internal/versions");
      await expect(active.getByText(configuration.id)).toBeVisible();
      await screen.getByRole("button", "Roll back").tap();
      await expect(active.getByText(before.activeVersion)).toBeVisible();
      restored = true;
      rolledBackAt = await Effect.runPromise(
        DateTime.now.pipe(Effect.map(DateTime.formatIso))
      );
      await expect(
        screen
          .getByRole("region", "Activation history")
          .getByText(
            `rollback · ${before.activeVersion} · previous ${configuration.id}`
          )
      ).toBeVisible();
      await app.screenshot("iteration-two-rollback-preserves-both-versions");
      await screen.getByRole("link", "Open funnel").tap();
      await expect(
        screen.getByRole("heading", "Your sample trail plan is ready")
      ).toBeVisible();
      expect(await Effect.runPromise(load(baseUrl, originalId))).toEqual(
        originalB
      );
      expect(await Effect.runPromise(load(baseUrl, nextBId))).toEqual(nextB);
      expect(await Effect.runPromise(load(baseUrl, nextAId))).toEqual(nextA);

      const oldRestored = await Effect.runPromise(
        report(baseUrl, originalCampaign, before.activeVersion)
      );

      const newRestored = await Effect.runPromise(
        report(baseUrl, nextCampaign, configuration.id)
      );

      expect(oldRestored.summary).toEqual(oldBaseline.summary);
      expect(oldRestored.cohorts).toEqual(oldBaseline.cohorts);
      expect(newRestored.summary).toEqual(newBaseline.summary);
      expect(newRestored.cohorts).toEqual(newBaseline.cohorts);
      const finalState = await Effect.runPromise(state(baseUrl));
      expect(finalState.history).toHaveLength(before.history.length + 2);

      await app.open(
        `/?variant=B&utm_campaign=iteration-two-browser-restored-${run}`
      );
      await expect(
        screen.getByRole("heading", "Your sample trail plan is ready")
      ).toBeVisible();
      await screen.getByRole("button", "Start new session").tap();
      await expect(
        screen.getByRole("heading", "Build your weekend trail plan")
      ).toBeVisible();

      const freshId = Schema.decodeUnknownSync(Schema.String)(
        await browser.evaluate(() => localStorage.getItem("funnel-session"))
      );

      const fresh = await Effect.runPromise(load(baseUrl, freshId));
      expect(fresh.session.version).toBe(before.activeVersion);
      expect(
        fresh.configuration.steps.some((step) => step.id === "prepare")
      ).toBe(true);
      expect(fresh.configuration.steps.some((step) => step.id === "rest")).toBe(
        false
      );
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "How many hours do you have?")
      ).toBeVisible();
      await screen
        .getByRole("spinbutton", "How many hours do you have?")
        .fill("4");
      await screen.getByRole("button", "Continue").tap();
      await expect(
        screen.getByRole("heading", "Choose your pace")
      ).toBeVisible();
      await Effect.runPromise(
        Effect.logInfo({
          newCampaign: nextCampaign,
          newSummary: newBaseline.summary,
          oldCampaign: originalCampaign,
          oldSummary: oldBaseline.summary,
          originalSession: originalId,
          originalVersion: before.activeVersion,
          publishedAt,
          publishedVersion: configuration.id,
          rolledBackAt,
          run,
        })
      );
    } finally {
      if (published && !restored) {
        const current = await Effect.runPromise(state(baseUrl));

        if (current.activeVersion === configuration.id) {
          const response = await Effect.runPromise(
            HttpClient.post(`${baseUrl}/api/versions/rollback`, {
              body: HttpBody.jsonUnsafe({}),
            }).pipe(Effect.provide(FetchHttpClient.layer))
          );

          expect(response.status).toBe(200);
        }
      }

      await Effect.runPromise(
        FileSystem.FileSystem.use((fs) =>
          fs.remove(directory, { recursive: true })
        ).pipe(Effect.provide(NodeFileSystem.layer))
      );
    }
  }
);
